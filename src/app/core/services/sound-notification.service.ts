import { Injectable } from '@angular/core';

export type NotificationPattern = 'single' | 'chime' | 'triad' | 'double';

export interface CustomNotificationConfig {
  waveform: OscillatorType;
  baseFrequency: number;
  pattern: NotificationPattern;
  duration: number; // in seconds
}

@Injectable({ providedIn: 'root' })
export class SoundNotificationService {
  private audioContext: AudioContext | null = null;
  private readonly defaultVolume = 0.7;

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * توليد وتشغيل صوت إشعار مخصص مبني برمجياً عبر Web Audio API (Zero Audio Assets)
   */
  public playCustomNotification(config: CustomNotificationConfig): void {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.defaultVolume, now);
    masterGain.connect(ctx.destination);

    const { waveform, baseFrequency, pattern, duration } = config;

    switch (pattern) {
      case 'single':
        this.playTone(ctx, masterGain, baseFrequency, now, duration, waveform);
        break;

      case 'chime':
        // نغمة ثنائية صاعدة كلاسيكية للإشعارات (Base -> 1.5x Perfect Fifth)
        const noteDuration = duration * 0.55;
        this.playTone(ctx, masterGain, baseFrequency, now, noteDuration, waveform);
        this.playTone(ctx, masterGain, Math.round(baseFrequency * 1.5), now + noteDuration * 0.6, duration, waveform);
        break;

      case 'triad':
        // تآلف نغمات صاعد متناسق (Root -> Major Third -> Fifth)
        const step = duration * 0.28;
        this.playTone(ctx, masterGain, baseFrequency, now, step * 1.2, waveform);
        this.playTone(ctx, masterGain, Math.round(baseFrequency * 1.25), now + step, step * 1.2, waveform);
        this.playTone(ctx, masterGain, Math.round(baseFrequency * 1.5), now + step * 2, duration, waveform);
        break;

      case 'double':
        // نبضتان متتاليتان سريعتان للتنبيه (Double Tap / Ping)
        const tapDur = duration * 0.35;
        this.playTone(ctx, masterGain, baseFrequency, now, tapDur, waveform);
        this.playTone(ctx, masterGain, baseFrequency, now + tapDur + 0.06, tapDur, waveform);
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