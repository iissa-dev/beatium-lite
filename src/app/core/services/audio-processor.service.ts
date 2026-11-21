import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { calculateRms, computeWaveformPeaks } from '../utils/audio-math.util';

type RnnoiseOptions = { maxChannels: number; wasmBinary: ArrayBuffer };
type NoiseGateOptions = { openThreshold: number; closeThreshold: number; holdMs: number; maxChannels: number };

async function loadRnnoise(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load RNNoise WASM: ${response.status}`);
  return response.arrayBuffer();
}

class RnnoiseWorkletNode extends AudioWorkletNode {
  constructor(context: BaseAudioContext, options: RnnoiseOptions) {
    super(context, '@sapphi-red/web-noise-suppressor/rnnoise', {
      outputChannelCount: [options.maxChannels],
      processorOptions: options,
    });
  }
}

class NoiseGateWorkletNode extends AudioWorkletNode {
  constructor(context: BaseAudioContext, options: NoiseGateOptions) {
    super(context, '@sapphi-red/web-noise-suppressor/noise-gate', {
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
  readonly isNoiseSuppressionActive = signal<boolean>(true);
  readonly isProcessorReady = signal<boolean>(false);
  readonly currentEffect = signal<VoiceEffect>('normal');
  readonly audioLevel = signal<number>(0); // RMS للطاقة الصوتية

  private audioContext: AudioContext | null = null;
  private rawMicStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  // Nodes
  private highPassFilter: BiquadFilterNode | null = null;
  private effectFilter: BiquadFilterNode | null = null;
  private robotRingModGain: GainNode | null = null;
  private robotOsc: OscillatorNode | null = null;
  private robotModDepth: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private suppressorGain: GainNode | null = null;
  private bypassGain: GainNode | null = null;
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private noiseGateNode: NoiseGateWorkletNode | null = null;

  private isOutputConnected = false;
  private speakingIntervalId: number | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private playbackSource: AudioBufferSourceNode | null = null;
  private playbackIntervalId: number | null = null;

  constructor() {
    effect(() => {
      this.updateRouting(this.isNoiseSuppressionActive());
    });

    this.destroyRef.onDestroy(() => this.dispose());
  }

  private async initPipeline(): Promise<void> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    if (!this.effectFilter) {
      // 1. High-Pass Filter (حذف اهتزازات المكتب تحت 85Hz)
      this.highPassFilter = this.audioContext.createBiquadFilter();
      this.highPassFilter.type = 'highpass';
      this.highPassFilter.frequency.setValueAtTime(85, this.audioContext.currentTime);

      // 2. فلتر التأثيرات (مثل صوت الهاتف/الراديو القديم)
      this.effectFilter = this.audioContext.createBiquadFilter();
      this.effectFilter.type = 'allpass';

      // 3. Ring Modulator Gain للروبوت (مضاعفة الإشارة الصوتية بموجة 50Hz)
      this.robotRingModGain = this.audioContext.createGain();
      this.robotRingModGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);

      this.setVoiceEffect(this.currentEffect());

      // 4. Dynamics Compressor (موازنة نغمات الصوت ومنع التشويش)
      this.compressorNode = this.audioContext.createDynamicsCompressor();

      // 5. التحكم في التضخيم (Volume Gain)
      this.outputGain = this.audioContext.createGain();
      this.outputGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);

      // 6. مسارات التحويل (Bypass vs AI Suppressor)
      this.suppressorGain = this.audioContext.createGain();
      this.bypassGain = this.audioContext.createGain();

      // 7. Analyser لتحليل الذبذبات ورسم الموجة الصوتية
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.3;

      // ربط التأثيرات -> الروبوت -> الضاغط -> المضخم -> المحلل
      this.suppressorGain.connect(this.effectFilter);
      this.bypassGain.connect(this.effectFilter);
      this.effectFilter.connect(this.robotRingModGain);
      this.robotRingModGain.connect(this.compressorNode);
      this.compressorNode.connect(this.outputGain);
      this.outputGain.connect(this.analyserNode);
    }

    // 7. محرك عزل الضوضاء RNNoise (WASM + AudioWorklet)
    if (!this.rnnoiseNode && !this.isProcessorReady()) {
      try {
        await Promise.all([
          this.audioContext.audioWorklet.addModule('/noise-suppressor/rnnoiseWorklet.js'),
          this.audioContext.audioWorklet.addModule('/noise-suppressor/noiseGateWorklet.js'),
        ]);

        const wasmBinary = await loadRnnoise('/noise-suppressor/rnnoise.wasm');
        this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, { maxChannels: 1, wasmBinary });
        this.noiseGateNode = new NoiseGateWorkletNode(this.audioContext, {
          openThreshold: -45,
          closeThreshold: -52,
          holdMs: 80,
          maxChannels: 1,
        });

        this.highPassFilter!.connect(this.rnnoiseNode);
        this.rnnoiseNode.connect(this.noiseGateNode);
        this.noiseGateNode.connect(this.suppressorGain!);

        this.isProcessorReady.set(true);
      } catch (err) {
        console.error('Failed to initialize RNNoise Neural Processor:', err);
        this.isProcessorReady.set(false);
      }
    }

    this.updateRouting(this.isNoiseSuppressionActive());
  }

  public async startMicrophone(): Promise<void> {
    this.dispose();

    this.rawMicStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 48000, echoCancellation: true },
      video: false,
    });

    await this.initPipeline();

    if (this.audioContext && this.rawMicStream) {
      this.micSource = this.audioContext.createMediaStreamSource(this.rawMicStream);
      if (this.highPassFilter) {
        this.micSource.connect(this.highPassFilter);
      }
      if (this.bypassGain) {
        this.micSource.connect(this.bypassGain);
      }
    }

    this.startDetectionLoop();
    this.isRunning.set(true);
  }

  // تغيير تأثير الصوت (Biquad Filter & 50 Hz Ring Modulator)
  public setVoiceEffect(effect: VoiceEffect): void {
    this.currentEffect.set(effect);
    if (!this.effectFilter || !this.audioContext || !this.robotRingModGain) return;

    const now = this.audioContext.currentTime;

    // تنظيف أي مذبذب روبوت سابق بشكل آمن وموحد
    this.cleanupRobotOscillator();

    if (effect === 'radio') {
      // Bandpass فلتر يحاكي الراديو وجهاز اللاسلكي القديم (Walkie-Talkie)
      this.robotRingModGain.gain.setValueAtTime(1.8, now);
      this.effectFilter.type = 'bandpass';
      this.effectFilter.frequency.setValueAtTime(1400, now);
      this.effectFilter.Q.setValueAtTime(3.8, now);
    } else if (effect === 'robot') {
      // صوت الروبوت الآلي (50 Hz Ring Modulator / Amplitude Modulation)
      this.effectFilter.type = 'peaking';
      this.effectFilter.frequency.setValueAtTime(2000, now);
      this.effectFilter.Q.setValueAtTime(2.0, now);
      this.effectFilter.gain.setValueAtTime(6.0, now);

      this.robotRingModGain.gain.setValueAtTime(0.15, now);

      this.robotOsc = this.audioContext.createOscillator();
      this.robotOsc.type = 'sine';
      this.robotOsc.frequency.setValueAtTime(50, now);

      this.robotModDepth = this.audioContext.createGain();
      this.robotModDepth.gain.setValueAtTime(0.85, now);

      this.robotOsc.connect(this.robotModDepth);
      this.robotModDepth.connect(this.robotRingModGain.gain);
      this.robotOsc.start();
    } else {
      // الصوت الطبيعي (All-pass بدون أي تعديل)
      this.robotRingModGain.gain.setValueAtTime(1.0, now);
      this.effectFilter.type = 'allpass';
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
      if (!this.analyserNode) {
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

  // ================= Recording & Playback Lifecycle =================

  public async startRecording(): Promise<void> {
    if (!this.isRunning() || !this.rawMicStream) {
      await this.startMicrophone();
    }
    if (!this.rawMicStream) return;

    this.stopPlayback();
    this.recordedChunks = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';

    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.rawMicStream, { mimeType })
      : new MediaRecorder(this.rawMicStream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100);
  }

  public async processAudioBlob(blob: Blob): Promise<{
    duration: number;
    rawPeaks: number[];
    denoisedPeaks: number[];
  }> {
    await this.initPipeline();
    if (!this.audioContext) return { duration: 0, rawPeaks: [], denoisedPeaks: [] };
    const arrayBuffer = await blob.arrayBuffer();
    const bufferCopy = arrayBuffer.slice(0);
    const decoded = await this.audioContext.decodeAudioData(bufferCopy);
    const duration = Math.max(0.1, decoded.duration);
    const pcmData = decoded.getChannelData(0);
    const { rawPeaks, denoisedPeaks } = computeWaveformPeaks(pcmData, 120);
    return { duration, rawPeaks, denoisedPeaks };
  }

  public async stopRecording(): Promise<{
    blob: Blob;
    duration: number;
    rawPeaks: number[];
    denoisedPeaks: number[];
  }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('MediaRecorder is not active'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const mime = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mime });

        try {
          const { duration, rawPeaks, denoisedPeaks } = await this.processAudioBlob(blob);
          resolve({ blob, duration, rawPeaks, denoisedPeaks });
        } catch (err) {
          console.error('Error decoding recorded audio for peaks:', err);
          resolve({
            blob,
            duration: 3,
            rawPeaks: Array(120).fill(0.2),
            denoisedPeaks: Array(120).fill(0.1),
          });
        }
      };

      this.mediaRecorder.stop();
    });
  }

  public async playRecordedAudio(
    blob: Blob,
    onProgress: (currentTime: number, progressPercent: number) => void,
    onEnded: () => void
  ): Promise<void> {
    this.stopPlayback();

    await this.initPipeline();
    if (!this.audioContext || !this.outputGain) return;

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // مسار مزدوج للصوت المسجل: يمر عبر شبكة العزل العصبي ويمر عبر مسار الـ Bypass
    if (this.highPassFilter) {
      source.connect(this.highPassFilter);
    }
    if (this.bypassGain) {
      source.connect(this.bypassGain);
    }
    this.outputGain.connect(this.audioContext.destination);
    this.isOutputConnected = true;

    this.playbackSource = source;
    const startTime = this.audioContext.currentTime;
    const duration = audioBuffer.duration;

    this.playbackIntervalId = window.setInterval(() => {
      if (!this.audioContext) return;
      const elapsed = this.audioContext.currentTime - startTime;
      if (elapsed >= duration) {
        this.stopPlayback();
        onEnded();
      } else {
        const percent = Math.min(100, (elapsed / duration) * 100);
        onProgress(elapsed, percent);
      }
    }, 30);

    source.onended = () => {
      this.stopPlayback();
      onEnded();
    };

    source.start(0);
    this.startDetectionLoop();
  }

  public stopPlayback(): void {
    if (this.playbackIntervalId) {
      clearInterval(this.playbackIntervalId);
      this.playbackIntervalId = null;
    }
    if (this.playbackSource) {
      this.safeStopSource(this.playbackSource);
      this.playbackSource = null;
    }
    if (this.isOutputConnected && this.outputGain && this.audioContext) {
      try {
        this.outputGain.disconnect(this.audioContext.destination);
      } catch {
        // Output already disconnected
      }
      this.isOutputConnected = false;
    }
  }

  // ================= Clean Helpers & Lifecycle =================

  private safeStopSource(node: AudioScheduledSourceNode | null): void {
    if (!node) return;
    try {
      node.stop();
    } catch {
      // Node was already stopped or inactive
    }
    try {
      node.disconnect();
    } catch {
      // Node was already disconnected
    }
  }

  private cleanupRobotOscillator(): void {
    this.safeStopSource(this.robotOsc);
    this.robotOsc = null;

    if (this.robotModDepth) {
      try {
        this.robotModDepth.disconnect();
      } catch {
        // Depth gain already disconnected
      }
      this.robotModDepth = null;
    }
  }

  public dispose(): void {
    this.stopPlayback();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.speakingIntervalId) {
      clearInterval(this.speakingIntervalId);
      this.speakingIntervalId = null;
    }
    this.cleanupRobotOscillator();
    this.rawMicStream?.getTracks().forEach((t) => t.stop());
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }
    this.highPassFilter = null;
    this.effectFilter = null;
    this.robotRingModGain = null;
    this.compressorNode = null;
    this.outputGain = null;
    this.suppressorGain = null;
    this.bypassGain = null;
    this.rnnoiseNode = null;
    this.noiseGateNode = null;
    this.analyserNode = null;
    this.micSource = null;
    this.audioContext = null;
    this.isProcessorReady.set(false);
    this.isRunning.set(false);
    this.isSpeaking.set(false);
  }
}
