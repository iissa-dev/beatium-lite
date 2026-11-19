import { Injectable, signal } from '@angular/core';

export type ToneName = 'standard-a4' | 'c-major-chord' | 'presentation-chime' | 'low-alert';

@Injectable({ providedIn: 'root' })
export class SoundNotificationService {
  private audioContext: AudioContext | null = null;
  readonly volume = signal<number>(0.7);

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * تشغيل نغمة مبنية على الترددات الرياضية بالهرتز (Hz) كما في السلايد 5 و 58
   */
  public play(tone: ToneName): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume(), now);
    masterGain.connect(ctx.destination);

    switch (tone) {
      case 'standard-a4':
        // النغمة المرجعية العالمية 440Hz (Pure Sine Wave)
        this.playTone(ctx, masterGain, 440.0, now, 0.4, 'sine');
        break;

      case 'c-major-chord':
        // تآلف نغمات: C5 (523Hz) ثم E5 (659Hz) ثم G5 (784Hz)
        this.playTone(ctx, masterGain, 523.25, now, 0.12, 'sine');
        this.playTone(ctx, masterGain, 659.25, now + 0.1, 0.12, 'sine');
        this.playTone(ctx, masterGain, 783.99, now + 0.2, 0.35, 'sine');
        break;

      case 'presentation-chime':
        // نغمة مثلثة مثل التنبيهات الرسمية
        this.playTone(ctx, masterGain, 587.33, now, 0.1, 'triangle');
        this.playTone(ctx, masterGain, 880.0, now + 0.09, 0.25, 'sine');
        break;

      case 'low-alert':
        // تردد منخفض 220Hz
        this.playTone(ctx, masterGain, 220.0, now, 0.2, 'sawtooth');
        break;
    }
  }

  private playTone(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    // تشكيل المغلف الصوتي (ADSR Envelope)
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.8, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}