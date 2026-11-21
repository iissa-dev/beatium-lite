import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { AudioProcessorService, VoiceEffect } from '../../core/services/audio-processor.service';
import { SoundNotificationService, NotificationPattern } from '../../core/services/sound-notification.service';
import { WikiLabShellComponent } from '../../shared/components/wiki-lab-shell/wiki-lab-shell.component';
import { WaveformVisualizerComponent } from '../../shared/components/waveform-visualizer/waveform-visualizer.component';
import { TelemetryBarComponent, MetricItem } from '../../shared/components/telemetry-bar/telemetry-bar.component';

export type VoiceLabSubMode = 'mic' | 'notifications';

@Component({
  selector: 'app-voice-lab',
  imports: [WikiLabShellComponent, WaveformVisualizerComponent, TelemetryBarComponent],
  templateUrl: './voice-lab.component.html',
})
export class VoiceLabComponent implements OnInit, OnDestroy {
  readonly audioService = inject(AudioProcessorService);
  readonly soundSynth = inject(SoundNotificationService);

  readonly activeSection = signal<VoiceLabSubMode>('mic');
  readonly live8PcmSamples = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);

  // Recorded Audio Workbench Signals
  readonly isRecording = signal<boolean>(false);
  readonly hasRecording = signal<boolean>(false);
  readonly isPlaying = signal<boolean>(false);
  readonly playbackTime = signal<number>(0);
  readonly recordedDuration = signal<number>(0);
  readonly rawWaveformPeaks = signal<number[]>([]);
  readonly denoisedWaveformPeaks = signal<number[]>([]);
  readonly recordedBlob = signal<Blob | null>(null);

  readonly playbackProgress = computed(() => {
    const dur = this.recordedDuration();
    return dur > 0 ? Math.min(100, (this.playbackTime() / dur) * 100) : 0;
  });

  // Custom Notification Designer Signals (Tab 2)
  readonly customWaveform = signal<OscillatorType>('sine');
  readonly customFrequency = signal<number>(587); // D5 Pitch
  readonly customPattern = signal<NotificationPattern>('chime');
  readonly customDecay = signal<number>(0.5); // 0.5s ADSR
  readonly isPlayingNotification = signal<boolean>(false);
  private isDraggingWave = false;

  readonly waveSvgPath = computed(() => {
    const freq = this.customFrequency();
    const type = this.customWaveform();
    const width = 400;
    const height = 90;
    const midY = height / 2;
    const amp = 34;

    // Number of cycles across width (between 2 and 12 cycles)
    const cycles = Math.max(2, Math.min(12, Math.round((freq / 1200) * 12)));
    const points: string[] = [];

    const numPoints = 200;
    for (let i = 0; i <= numPoints; i++) {
      const x = (i / numPoints) * width;
      const progress = (i / numPoints) * cycles;
      const phase = progress % 1;
      let yVal = 0;

      switch (type) {
        case 'sine':
          yVal = Math.sin(progress * 2 * Math.PI);
          break;
        case 'triangle':
          yVal = phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4;
          break;
        case 'square':
          yVal = phase < 0.5 ? 1 : -1;
          break;
        case 'sawtooth':
          yVal = 1 - 2 * phase;
          break;
        default:
          yVal = Math.sin(progress * 2 * Math.PI);
      }

      const y = midY - yVal * amp;
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }

    return points.join(' ');
  });

  readonly decaySvgPath = computed(() => {
    const dur = this.customDecay();
    const decayControlX = Math.round(15 + (dur / 1.0) * 35);
    return `M 0 36 Q 8 6, 14 6 C ${decayControlX} 10, 70 34, 98 36`;
  });

  readonly customMathFormula = computed(() => {
    const freq = this.customFrequency();
    const wave = this.customWaveform();
    switch (wave) {
      case 'sine':
        return `y(t) = A(t) · sin(2π · ${freq} · t)`;
      case 'triangle':
        return `y(t) = A(t) · triangle(2π · ${freq} · t)`;
      case 'square':
        return `y(t) = A(t) · sgn(sin(2π · ${freq} · t))`;
      case 'sawtooth':
        return `y(t) = A(t) · (2 · (t·${freq} - ⌊t·${freq} + 0.5⌋))`;
      default:
        return `y(t) = A(t) · sin(2π · ${freq} · t)`;
    }
  });

  readonly getAudioWaveform = (buffer: Float32Array) => {
    this.audioService.getWaveformData(buffer);
    const top8: number[] = [];
    for (let i = 0; i < 8; i++) {
      top8.push(+(buffer[i] ?? 0).toFixed(4));
    }
    this.live8PcmSamples.set(top8);
  };

  readonly telemetryMetrics = computed<MetricItem[]>(() => {
    if (this.activeSection() === 'mic') {
      const isRec = this.hasRecording();
      return [
        {
          label: 'Mode',
          value: isRec ? 'RECORDING' : 'LIVE STREAM',
          badgeColor: isRec ? 'cyan' : 'mint',
          description: isRec ? 'Stored in LocalStorage' : 'Real-time mic buffer',
        },
        {
          label: 'Duration',
          value: isRec ? this.formatTime(this.recordedDuration()) : 'Live',
          unit: isRec ? '' : '48 kHz',
          badgeColor: 'mint',
          description: 'Audio Clip Length',
        },
        {
          label: 'Noise Suppression',
          value: this.audioService.isNoiseSuppressionActive() ? 'ENABLED' : 'BYPASS',
          badgeColor: this.audioService.isNoiseSuppressionActive() ? 'mint' : 'amber',
          description: this.audioService.isProcessorReady() ? 'RNNoise Neural WASM' : 'Neural WASM Active',
        },
        {
          label: 'DSP Filter',
          value: this.audioService.currentEffect().toUpperCase(),
          badgeColor: 'cyan',
          description: 'Active Biquad Filter',
        },
      ];
    } else {
      return [
        { label: 'Asset Size', value: '0', unit: 'KB', badgeColor: 'mint', description: 'Zero MP3/WAV Files' },
        { label: 'Frequency', value: `${this.customFrequency()}`, unit: 'Hz', badgeColor: 'cyan', description: 'Base Oscillator Pitch' },
        { label: 'Waveform Geometry', value: this.customWaveform().toUpperCase(), badgeColor: 'amber', description: 'Periodic Formula' },
        { label: 'Pattern Style', value: this.customPattern().toUpperCase(), badgeColor: 'mint', description: 'Harmonic Motion' },
      ];
    }
  });

  readonly inspectorPayload = computed(() => {
    if (this.activeSection() === 'mic') {
      return {
        module: 'AudioProcessorService (Microphone & Recording Workbench)',
        status: this.isRecording()
          ? 'RECORDING_CLIP'
          : this.isPlaying()
          ? 'PLAYING_CLIP'
          : this.hasRecording()
          ? 'CLIP_STORED_LOCALSTORAGE'
          : this.audioService.isRunning()
          ? 'LIVE_STREAMING'
          : 'IDLE',
        recordedDuration: `${this.formatTime(this.recordedDuration())}`,
        playbackTime: `${this.formatTime(this.playbackTime())}`,
        vad: {
          isSpeaking: this.audioService.isSpeaking(),
          energyRmsLevel: +this.audioService.audioLevel().toFixed(4),
          noiseSuppression: this.audioService.isNoiseSuppressionActive()
            ? (this.audioService.isProcessorReady() ? 'RNNoise Active' : 'RNNoise Enabled')
            : 'Bypass (Raw Noise)',
          isProcessorReady: this.audioService.isProcessorReady(),
          effectFilter: this.audioService.currentEffect(),
        },
        pcmBufferPreview: this.live8PcmSamples(),
        bufferSize: 512,
        sampleRate: 48000,
        bitDepth: '32-bit Float PCM [-1.0 .. +1.0]',
        timestamp: Date.now(),
      };
    } else {
      return {
        module: 'SoundNotificationService (Custom Procedural Synthesis)',
        waveform: this.customWaveform(),
        baseFrequency: `${this.customFrequency()} Hz`,
        pattern: this.customPattern(),
        decayDuration: `${this.customDecay()}s`,
        networkPayloadSize: '0 Bytes',
        mathematicalFormula: this.customMathFormula(),
        audioNodesUsed: ['OscillatorNode', 'GainNode (ADSR Envelope)', 'AudioDestination'],
        timestamp: Date.now(),
      };
    }
  });

  readonly rawInspectorText = computed(() => {
    if (this.activeSection() === 'mic') {
      const samples = this.live8PcmSamples().map((s, idx) => `[#${idx}] ${s >= 0 ? '+' : ''}${s.toFixed(4)}`).join('\n  ');
      return [
        `=== 48 kHz PCM AUDIO STREAM BUFFER ===`,
        `Mode            : ${this.hasRecording() ? 'RECORDED AUDIO WORKBENCH' : 'LIVE MICROPHONE'}`,
        `Duration        : ${this.formatTime(this.recordedDuration())}`,
        `Current Playhead: ${this.formatTime(this.playbackTime())}`,
        `Sampling Rate   : 48,000 samples / sec (48 kHz)`,
        `Quantization    : 32-bit Float [-1.0000 .. +1.0000]`,
        `RNNoise WASM    : ${this.audioService.isNoiseSuppressionActive() ? (this.audioService.isProcessorReady() ? 'ACTIVE (Neural Denoising)' : 'ACTIVE') : 'BYPASS'}`,
        `DSP Filter      : ${this.audioService.currentEffect()}`,
        `VAD Energy      : ${this.audioService.audioLevel().toFixed(4)}`,
        ``,
        `=== LIVE PCM SAMPLES (Float32Array[0..7]) ===`,
        `  ${samples}`,
      ].join('\n');
    } else {
      return [
        `=== CUSTOM PROCEDURAL AUDIO SYNTHESIS ===`,
        `Waveform Geometry: ${this.customWaveform().toUpperCase()}`,
        `Base Frequency   : ${this.customFrequency()} Hz`,
        `Pattern Type     : ${this.customPattern().toUpperCase()}`,
        `Decay Duration   : ${this.customDecay()} seconds`,
        `Formula          : ${this.customMathFormula()}`,
        `Asset Download   : 0 KB (Zero MP3/WAV Transfer)`,
        `Execution        : Web Audio API Oscillator + Gain ADSR Envelope`,
      ].join('\n');
    }
  });

  ngOnInit(): void {
    void this.loadStoredRecording();
  }

  setSection(section: VoiceLabSubMode) {
    this.activeSection.set(section);
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00.0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}s`;
  }

  async startRecording(): Promise<void> {
    this.audioService.stopPlayback();
    this.isPlaying.set(false);
    this.playbackTime.set(0);
    this.isRecording.set(true);
    await this.audioService.startRecording();
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording()) return;
    this.isRecording.set(false);
    try {
      const res = await this.audioService.stopRecording();
      this.recordedBlob.set(res.blob);
      this.recordedDuration.set(res.duration);
      this.rawWaveformPeaks.set(res.rawPeaks);
      this.denoisedWaveformPeaks.set(res.denoisedPeaks);
      this.hasRecording.set(true);
      await this.saveRecordingToLocalStorage(res.blob, res.duration, res.rawPeaks, res.denoisedPeaks);
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  }

  async togglePlayback(): Promise<void> {
    if (this.isPlaying()) {
      this.audioService.stopPlayback();
      this.isPlaying.set(false);
    } else {
      const blob = this.recordedBlob();
      if (!blob) return;
      this.isPlaying.set(true);
      await this.audioService.playRecordedAudio(
        blob,
        (currTime) => {
          this.playbackTime.set(currTime);
        },
        () => {
          this.isPlaying.set(false);
          this.playbackTime.set(0);
        }
      );
    }
  }

  clearRecording(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('beatium_voice_recording');
      } catch (e) {
        console.warn('LocalStorage clear failed:', e);
      }
    }
    this.audioService.stopPlayback();
    this.isPlaying.set(false);
    this.hasRecording.set(false);
    this.recordedBlob.set(null);
    this.recordedDuration.set(0);
    this.playbackTime.set(0);
    this.rawWaveformPeaks.set([]);
    this.denoisedWaveformPeaks.set([]);
    void this.audioService.startMicrophone();
  }

  async loadSampleTemplate(): Promise<void> {
    try {
      this.audioService.stopPlayback();
      this.isPlaying.set(false);
      this.playbackTime.set(0);

      const res = await fetch('/audio/sample-voice.mp3');
      const blob = await res.blob();
      const { duration, rawPeaks, denoisedPeaks } = await this.audioService.processAudioBlob(blob);

      this.recordedBlob.set(blob);
      this.recordedDuration.set(duration);
      this.rawWaveformPeaks.set(rawPeaks);
      this.denoisedWaveformPeaks.set(denoisedPeaks);
      this.hasRecording.set(true);

      await this.saveRecordingToLocalStorage(blob, duration, rawPeaks, denoisedPeaks);
    } catch (err) {
      console.error('Failed to load sample voice template:', err);
    }
  }

  private async saveRecordingToLocalStorage(
    blob: Blob,
    duration: number,
    rawPeaks: number[],
    denoisedPeaks: number[]
  ): Promise<void> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const payload = JSON.stringify({
            audioData: reader.result as string,
            duration,
            rawPeaks,
            denoisedPeaks,
          });
          localStorage.setItem('beatium_voice_recording', payload);
        } catch (e) {
          console.warn('LocalStorage save failed:', e);
        }
        resolve();
      };
      reader.readAsDataURL(blob);
    });
  }

  private async loadStoredRecording(): Promise<void> {
    try {
      const stored = localStorage.getItem('beatium_voice_recording');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.audioData && parsed.duration) {
          const res = await fetch(parsed.audioData);
          const blob = await res.blob();
          this.recordedBlob.set(blob);
          this.recordedDuration.set(parsed.duration);
          this.rawWaveformPeaks.set(parsed.rawPeaks || []);
          this.denoisedWaveformPeaks.set(parsed.denoisedPeaks || []);
          this.hasRecording.set(true);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load stored recording:', e);
    }

    if (!this.hasRecording()) {
      void this.audioService.startMicrophone();
    }
  }

  toggleNoiseSuppression() {
    this.audioService.setNoiseSuppression(!this.audioService.isNoiseSuppressionActive());
  }

  setEffect(effect: VoiceEffect) {
    this.audioService.setVoiceEffect(effect);
  }

  // Custom Notification Designer Actions
  playCustomNotification(): void {
    this.isPlayingNotification.set(true);
    this.soundSynth.playCustomNotification({
      waveform: this.customWaveform(),
      baseFrequency: this.customFrequency(),
      pattern: this.customPattern(),
      duration: this.customDecay(),
    });
    window.setTimeout(() => {
      this.isPlayingNotification.set(false);
    }, this.customDecay() * 1000 + 100);
  }

  setCustomWaveform(w: OscillatorType): void {
    this.customWaveform.set(w);
    this.playCustomNotification();
  }

  setCustomFrequency(freq: number): void {
    this.customFrequency.set(Math.round(freq));
    this.playCustomNotification();
  }

  onFrequencyChange(e: Event): void {
    const val = Number((e.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.customFrequency.set(val);
    }
  }

  setCustomPattern(p: NotificationPattern): void {
    this.customPattern.set(p);
    this.playCustomNotification();
  }

  setCustomDecay(d: number): void {
    this.customDecay.set(d);
    this.playCustomNotification();
  }

  // Interactive Graphical Waveform Scrubbing (Pointer / Drag)
  onWavePointerDown(e: MouseEvent | TouchEvent, el: HTMLElement): void {
    this.isDraggingWave = true;
    this.updateFreqFromPointer(e, el);
    this.playCustomNotification();
  }

  onWavePointerMove(e: MouseEvent | TouchEvent, el: HTMLElement): void {
    if (!this.isDraggingWave) return;
    this.updateFreqFromPointer(e, el);
  }

  onWavePointerUp(): void {
    if (this.isDraggingWave) {
      this.isDraggingWave = false;
      this.playCustomNotification();
    }
  }

  private updateFreqFromPointer(e: MouseEvent | TouchEvent, el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = clampedX / rect.width;
    // Map 0..1 to 200..1200 Hz
    const freq = Math.round(200 + ratio * 1000);
    this.customFrequency.set(freq);
  }

  applyQuickPreset(preset: 'slack' | 'ping' | 'success' | 'alert'): void {
    switch (preset) {
      case 'slack':
        this.customWaveform.set('triangle');
        this.customFrequency.set(587);
        this.customPattern.set('chime');
        this.customDecay.set(0.5);
        break;
      case 'ping':
        this.customWaveform.set('sine');
        this.customFrequency.set(880);
        this.customPattern.set('single');
        this.customDecay.set(0.2);
        break;
      case 'success':
        this.customWaveform.set('sine');
        this.customFrequency.set(523);
        this.customPattern.set('triad');
        this.customDecay.set(0.6);
        break;
      case 'alert':
        this.customWaveform.set('sawtooth');
        this.customFrequency.set(260);
        this.customPattern.set('double');
        this.customDecay.set(0.4);
        break;
    }
    this.playCustomNotification();
  }

  ngOnDestroy(): void {
    this.audioService.stopPlayback();
    if (this.audioService.isRunning()) {
      this.audioService.dispose();
    }
  }
}
