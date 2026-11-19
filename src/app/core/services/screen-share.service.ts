import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScreenShareService {
  readonly screenStream = signal<MediaStream | null>(null);
  readonly isSharing = signal<boolean>(false);

  // إحصائيات الفيديو للأستاذ (السلايد 53-56: Video Resolution & FPS)
  readonly videoWidth = signal<number>(0);
  readonly videoHeight = signal<number>(0);
  readonly frameRate = signal<number>(0);
  readonly currentSettings = signal<MediaTrackSettings>({});

  public async startScreenShare(): Promise<MediaStream | null> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60, max: 60 } },
        audio: false,
      });

      this.screenStream.set(stream);
      this.isSharing.set(true);

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      this.videoWidth.set(settings.width ?? 1920);
      this.videoHeight.set(settings.height ?? 1080);
      this.frameRate.set(Math.round(settings.frameRate ?? 60));
      this.currentSettings.set(settings);

      track.onended = () => this.stopScreenShare();
      return stream;
    } catch (err) {
      console.error('Screen capture cancelled or failed:', err);
      return null;
    }
  }

  /**
   * تطبيق قيود الجودة اللحظية ومعدل الإطارات (track.applyConstraints)
   * لاختبار استمرار الرؤية (Persistence of Vision) أمام الدكتور
   */
  public async updateQuality(width: number, height: number, fps: number): Promise<void> {
    const stream = this.screenStream();
    if (!stream) {
      this.videoWidth.set(width);
      this.videoHeight.set(height);
      this.frameRate.set(fps);
      this.currentSettings.set({ width, height, frameRate: fps });
      return;
    }

    const track = stream.getVideoTracks()[0];
    if (!track) return;

    try {
      await track.applyConstraints({
        width: { max: width },
        height: { max: height },
        frameRate: { max: fps },
      });

      const updated = track.getSettings();
      this.videoWidth.set(updated.width ?? width);
      this.videoHeight.set(updated.height ?? height);
      this.frameRate.set(Math.round(updated.frameRate ?? fps));
      this.currentSettings.set(updated);
    } catch (err) {
      console.warn('applyConstraints fallback:', err);
      this.videoWidth.set(width);
      this.videoHeight.set(height);
      this.frameRate.set(fps);
      this.currentSettings.set({ width, height, frameRate: fps });
    }
  }

  public stopScreenShare(): void {
    if (this.screenStream()) {
      this.screenStream()!.getTracks().forEach((t) => t.stop());
      this.screenStream.set(null);
    }
    this.isSharing.set(false);
    this.videoWidth.set(0);
    this.videoHeight.set(0);
    this.frameRate.set(0);
    this.currentSettings.set({});
  }
}
