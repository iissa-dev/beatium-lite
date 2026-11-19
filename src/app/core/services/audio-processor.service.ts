import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { calculateRms } from '../utils/audio-math.util';

type RnnoiseOptions = { maxChannels: number; wasmBinary: ArrayBuffer };
type NoiseGateOptions = { openThreshold: number; closeThreshold: number; holdMs: number; maxChannels: number };

async function loadRnnoise(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load RNNoise WASM: ${response.status}`);
  return response.arrayBuffer();
}

class RnnoiseWorkletNode extends AudioWorkletNode {
  constructor(context: BaseAudioContext, options: RnnoiseOptions) {
    super(context, 'rnnoise-worklet', {
      outputChannelCount: [options.maxChannels],
      processorOptions: options,
    });
  }
}

class NoiseGateWorkletNode extends AudioWorkletNode {
  constructor(context: BaseAudioContext, options: NoiseGateOptions) {
    super(context, 'noise-gate-worklet', {
      outputChannelCount: [options.maxChannels],
      processorOptions: options,
    });
  }
}

export type VoiceEffect = 'normal' | 'radio' | 'robot';

@Injectable({ providedIn: 'root' })
export class AudioProcessorService {
  private readonly destroyRef = inject(DestroyRef);

  // Signals لحالة الواجهة
  readonly isRunning = signal<boolean>(false);
  readonly isSpeaking = signal<boolean>(false);
  readonly isMuted = signal<boolean>(false);
  readonly isNoiseSuppressionActive = signal<boolean>(true);
  readonly isMonitoring = signal<boolean>(false); // الاستماع للصوت في السماعات
  readonly isProcessorReady = signal<boolean>(false);
  readonly micGainMultiplier = signal<number>(2.0);
  readonly currentEffect = signal<VoiceEffect>('normal');
  readonly audioLevel = signal<number>(0); // RMS للطاقة الصوتية

  private audioContext: AudioContext | null = null;
  private rawMicStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  // Nodes
  private highPassFilter: BiquadFilterNode | null = null;
  private effectFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private monitorGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private suppressorGain: GainNode | null = null;
  private bypassGain: GainNode | null = null;
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private noiseGateNode: NoiseGateWorkletNode | null = null;

  private speakingIntervalId: number | null = null;

  constructor() {
    effect(() => {
      this.updateRouting(this.isNoiseSuppressionActive());
    });

    this.destroyRef.onDestroy(() => this.dispose());
  }

  public async startMicrophone(): Promise<void> {
    this.dispose();

    this.rawMicStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 48000, echoCancellation: true },
      video: false,
    });

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.micSource = this.audioContext.createMediaStreamSource(this.rawMicStream);

    // 1. High-Pass Filter (حذف اهتزازات المكتب تحت 85Hz)
    this.highPassFilter = this.audioContext.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.setValueAtTime(85, this.audioContext.currentTime);

    // 2. فلتر التأثيرات (مثل صوت الهاتف/الراديو القديم)
    this.effectFilter = this.audioContext.createBiquadFilter();
    this.effectFilter.type = 'allpass';

    // 3. Dynamics Compressor (موازنة نغمات الصوت ومنع التشويش)
    this.compressorNode = this.audioContext.createDynamicsCompressor();

    // 4. التحكم في التضخيم (Volume Gain)
    this.outputGain = this.audioContext.createGain();
    this.outputGain.gain.setValueAtTime(this.micGainMultiplier(), this.audioContext.currentTime);

    // 5. مسارات التحويل (Bypass vs AI Suppressor)
    this.suppressorGain = this.audioContext.createGain();
    this.bypassGain = this.audioContext.createGain();

    // 6. Analyser لتحليل الذبذبات ورسم الموجة الصوتية
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.3;

    // مسار الصوت المباشر (Bypass)
    this.micSource.connect(this.bypassGain);
    this.bypassGain.connect(this.effectFilter);

    // مسار المعالج
    this.suppressorGain.connect(this.effectFilter);

    // ربط التأثيرات -> الضاغط -> المضخم -> المحلل
    this.effectFilter.connect(this.compressorNode);
    this.compressorNode.connect(this.outputGain);
    this.outputGain.connect(this.analyserNode);

    // 7. محرك عزل الضوضاء RNNoise (WASM + AudioWorklet)
    try {
      await Promise.all([
        this.audioContext.audioWorklet.addModule('noise-suppressor/rnnoiseWorklet.js'),
        this.audioContext.audioWorklet.addModule('noise-suppressor/noiseGateWorklet.js'),
      ]);

      const wasmBinary = await loadRnnoise('noise-suppressor/rnnoise.wasm');
      this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, { maxChannels: 1, wasmBinary });
      this.noiseGateNode = new NoiseGateWorkletNode(this.audioContext, {
        openThreshold: -45,
        closeThreshold: -52,
        holdMs: 80,
        maxChannels: 1,
      });

      this.micSource.connect(this.highPassFilter);
      this.highPassFilter.connect(this.rnnoiseNode);
      this.rnnoiseNode.connect(this.noiseGateNode);
      this.noiseGateNode.connect(this.suppressorGain);

      this.isProcessorReady.set(true);
    } catch {
      this.isProcessorReady.set(false);
    }

    this.updateRouting(this.isNoiseSuppressionActive());
    this.startDetectionLoop();
    this.isRunning.set(true);
  }

  // الاستماع المباشر في السماعات (Audio Monitor)
  public toggleMonitor(): void {
    if (!this.audioContext || !this.outputGain) return;

    if (this.isMonitoring()) {
      this.monitorGain?.disconnect();
      this.monitorGain = null;
      this.isMonitoring.set(false);
    } else {
      this.monitorGain = this.audioContext.createGain();
      this.monitorGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);
      this.outputGain.connect(this.monitorGain);
      this.monitorGain.connect(this.audioContext.destination);
      this.isMonitoring.set(true);
    }
  }

  // تغيير تأثير الصوت (تطبيق مفهوم السلايد 58)
  public setVoiceEffect(effect: VoiceEffect): void {
    this.currentEffect.set(effect);
    if (!this.effectFilter || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    if (effect === 'radio') {
      // Bandpass فلتر يحاكي الراديو أو الهاتف القديم
      this.effectFilter.type = 'bandpass';
      this.effectFilter.frequency.setValueAtTime(1200, now);
      this.effectFilter.Q.setValueAtTime(2.5, now);
    } else {
      this.effectFilter.type = 'allpass';
    }
  }

  public setMicGain(gain: number): void {
    this.micGainMultiplier.set(gain);
    if (this.outputGain && this.audioContext) {
      this.outputGain.gain.setValueAtTime(gain, this.audioContext.currentTime);
    }
  }

  public setNoiseSuppression(active: boolean): void {
    this.isNoiseSuppressionActive.set(active);
    this.updateRouting(active);
  }

  private updateRouting(active: boolean): void {
    if (!this.audioContext || !this.suppressorGain || !this.bypassGain) return;
    const now = this.audioContext.currentTime;
    const useAI = active && !!this.rnnoiseNode;

    this.suppressorGain.gain.linearRampToValueAtTime(useAI ? 1.0 : 0.0, now + 0.015);
    this.bypassGain.gain.linearRampToValueAtTime(useAI ? 0.0 : 1.0, now + 0.015);
  }

  // دالة لجلب بيانات الذبذبات للرسم على Canvas في الواجهة
  public getWaveformData(dataArray: Float32Array): void {
    if (this.analyserNode) {
      this.analyserNode.getFloatTimeDomainData(dataArray as Float32Array<ArrayBuffer>);
    }
  }

  private startDetectionLoop(): void {
    if (!this.analyserNode) return;
    const buffer = new Float32Array(this.analyserNode.fftSize);

    this.speakingIntervalId = window.setInterval(() => {
      if (!this.analyserNode || this.isMuted()) {
        this.isSpeaking.set(false);
        this.audioLevel.set(0);
        return;
      }
      this.analyserNode.getFloatTimeDomainData(buffer);
      const rms = calculateRms(buffer);
      this.audioLevel.set(Math.round(rms * 100));
      this.isSpeaking.set(rms > 0.02);
    }, 50);
  }

  public dispose(): void {
    if (this.speakingIntervalId) clearInterval(this.speakingIntervalId);
    this.toggleMonitor();
    this.rawMicStream?.getTracks().forEach((t) => t.stop());
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }
    this.isRunning.set(false);
    this.isSpeaking.set(false);
  }
}