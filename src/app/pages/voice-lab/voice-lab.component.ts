import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { AudioProcessorService, VoiceEffect } from '../../core/services/audio-processor.service';
import { SoundNotificationService, ToneName } from '../../core/services/sound-notification.service';
import { WikiLabShellComponent } from '../../shared/components/wiki-lab-shell/wiki-lab-shell.component';
import { WaveformVisualizerComponent } from '../../shared/components/waveform-visualizer/waveform-visualizer.component';
import { TelemetryBarComponent, MetricItem } from '../../shared/components/telemetry-bar/telemetry-bar.component';

export type VoiceLabSubMode = 'mic' | 'notifications';

export interface ToneTelemetry {
  name: string;
  toneKey: ToneName;
  frequency: string;
  waveType: string;
  assetSize: string;
  mathFormula: string;
}

@Component({
  selector: 'app-voice-lab',
  imports: [WikiLabShellComponent, WaveformVisualizerComponent, TelemetryBarComponent],
  templateUrl: './voice-lab.component.html',
})
export class VoiceLabComponent implements OnDestroy {
  readonly audioService = inject(AudioProcessorService);
  readonly soundSynth = inject(SoundNotificationService);

  readonly activeSection = signal<VoiceLabSubMode>('mic');
  readonly live8PcmSamples = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);

  readonly activeTone = signal<ToneTelemetry>({
    name: 'Standard A4 Pitch (440 Hz)',
    toneKey: 'standard-a4',
    frequency: '440.00 Hz',
    waveType: 'sine (Pure Harmonic)',
    assetSize: '0 KB (Zero Network Assets)',
    mathFormula: 'y(t) = A(t) · sin(2π · 440 · t)',
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
      return [
        { label: 'Sample Rate', value: '48', unit: 'kHz', badgeColor: 'mint', description: 'AudioContext DSP' },
        {
          label: 'Noise Suppression',
          value: this.audioService.isNoiseSuppressionActive() ? 'ENABLED' : 'BYPASS',
          badgeColor: this.audioService.isNoiseSuppressionActive() ? 'mint' : 'amber',
          description: 'RNNoise Neural WASM',
        },
        { label: 'DSP Filter', value: this.audioService.currentEffect().toUpperCase(), badgeColor: 'cyan', description: 'Biquad Filter Node' },
        {
          label: 'VAD Status',
          value: this.audioService.isSpeaking() ? 'SPEAKING' : 'SILENCE',
          badgeColor: this.audioService.isSpeaking() ? 'mint' : 'default',
          description: 'Voice Activity Detection',
        },
      ];
    } else {
      const tone = this.activeTone();
      return [
        { label: 'Asset Size', value: '0', unit: 'KB', badgeColor: 'mint', description: 'Zero MP3/WAV Files' },
        { label: 'Frequency', value: tone.frequency.split(' ')[0], badgeColor: 'cyan', description: 'Oscillator Frequency' },
        { label: 'Waveform Geometry', value: tone.waveType.split(' ')[0].toUpperCase(), badgeColor: 'amber', description: 'Periodic Formula' },
        { label: 'Synthesis Latency', value: '< 2', unit: 'ms', badgeColor: 'mint', description: 'Direct AudioNode' },
      ];
    }
  });

  readonly inspectorPayload = computed(() => {
    if (this.activeSection() === 'mic') {
      return {
        module: 'AudioProcessorService (Microphone DSP)',
        status: this.audioService.isRunning() ? 'RECORDING' : 'IDLE',
        vad: {
          isSpeaking: this.audioService.isSpeaking(),
          energyRmsLevel: +this.audioService.audioLevel().toFixed(4),
          noiseSuppression: this.audioService.isNoiseSuppressionActive() ? 'RNNoise Active' : 'Bypass',
          effectFilter: this.audioService.currentEffect(),
        },
        pcmBufferPreview: this.live8PcmSamples(),
        bufferSize: 512,
        sampleRate: 48000,
        bitDepth: '32-bit Float PCM [-1.0 .. +1.0]',
        timestamp: Date.now(),
      };
    } else {
      const tone = this.activeTone();
      return {
        module: 'SoundNotificationService (Procedural Tone Synthesis)',
        activeTone: tone.name,
        frequency: tone.frequency,
        waveform: tone.waveType,
        networkPayloadSize: '0 Bytes (Mathematical Generation)',
        mathematicalFormula: tone.mathFormula,
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
        `Status          : ${this.audioService.isRunning() ? 'RECORDING' : 'IDLE'}`,
        `Sampling Rate   : 48,000 samples / sec (48 kHz)`,
        `Quantization    : 32-bit Float [-1.0000 .. +1.0000]`,
        `RNNoise WASM    : ${this.audioService.isNoiseSuppressionActive() ? 'ACTIVE (Neural Denoising)' : 'BYPASS'}`,
        `DSP Filter      : ${this.audioService.currentEffect()}`,
        `VAD Energy      : ${this.audioService.audioLevel().toFixed(4)}`,
        ``,
        `=== LIVE PCM SAMPLES (Float32Array[0..7]) ===`,
        `  ${samples}`,
      ].join('\n');
    } else {
      const tone = this.activeTone();
      return [
        `=== PROCEDURAL AUDIO SYNTHESIS ===`,
        `Tone Name       : ${tone.name}`,
        `Frequency       : ${tone.frequency}`,
        `Waveform Type   : ${tone.waveType}`,
        `Formula         : ${tone.mathFormula}`,
        `Asset Download  : 0 KB (Zero MP3/WAV Transfer)`,
        `Execution       : In-Memory Web Audio API Oscillator`,
      ].join('\n');
    }
  });

  setSection(section: VoiceLabSubMode) {
    this.activeSection.set(section);
  }

  async toggleMic() {
    if (this.audioService.isRunning()) {
      this.audioService.dispose();
    } else {
      await this.audioService.startMicrophone();
    }
  }

  toggleNoiseSuppression() {
    this.audioService.setNoiseSuppression(!this.audioService.isNoiseSuppressionActive());
  }

  setEffect(effect: VoiceEffect) {
    this.audioService.setVoiceEffect(effect);
  }

  triggerTone(toneKey: ToneName) {
    this.soundSynth.play(toneKey);

    switch (toneKey) {
      case 'standard-a4':
        this.activeTone.set({
          name: 'Standard A4 Pitch (440 Hz)',
          toneKey,
          frequency: '440.00 Hz',
          waveType: 'sine (Pure Harmonic)',
          assetSize: '0 KB',
          mathFormula: 'y(t) = A(t) · sin(2π · 440 · t)',
        });
        break;

      case 'c-major-chord':
        this.activeTone.set({
          name: 'C-Major Triad (Arpeggiated Chord)',
          toneKey,
          frequency: 'C5 (523Hz) + E5 (659Hz) + G5 (784Hz)',
          waveType: 'sine (Polyphonic Harmonics)',
          assetSize: '0 KB',
          mathFormula: 'y(t) = ∑ Ai · sin(2π · fi · t)',
        });
        break;

      case 'presentation-chime':
        this.activeTone.set({
          name: 'Meeting Presentation Chime',
          toneKey,
          frequency: '587.33 Hz (D5) ➔ 880.00 Hz (A5)',
          waveType: 'triangle + sine (Dual Harmonic)',
          assetSize: '0 KB',
          mathFormula: 'y(t) = A(t) · triangle(2π · f · t) · e^(-t/τ)',
        });
        break;

      case 'low-alert':
        this.activeTone.set({
          name: 'Low Warning Alert (Sawtooth)',
          toneKey,
          frequency: '220.00 Hz',
          waveType: 'sawtooth (Rich Odd/Even Harmonics)',
          assetSize: '0 KB',
          mathFormula: 'y(t) = 2 · (t·f - floor(t·f + 0.5))',
        });
        break;
    }
  }

  ngOnDestroy(): void {
    if (this.audioService.isRunning()) {
      this.audioService.dispose();
    }
  }
}
