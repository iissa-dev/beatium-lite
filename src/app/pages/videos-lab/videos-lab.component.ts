import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
  OnDestroy,
  signal,
} from '@angular/core';
import { ScreenShareService } from '../../core/services/screen-share.service';
import { WebRtcLoopbackService } from '../../core/services/webrtc-loopback.service';
import { WikiLabShellComponent } from '../../shared/components/wiki-lab-shell/wiki-lab-shell.component';
import { TelemetryBarComponent, MetricItem } from '../../shared/components/telemetry-bar/telemetry-bar.component';

export type QualityProfile = '1080p-60' | '720p-30' | '240p-5';
export type DisplayLayout = 'split' | 'sender' | 'receiver';

@Component({
  selector: 'app-videos-lab',
  imports: [WikiLabShellComponent, TelemetryBarComponent],
  templateUrl: './videos-lab.component.html',
})
export class VideosLabComponent implements OnDestroy {
  readonly screenService = inject(ScreenShareService);
  readonly loopbackService = inject(WebRtcLoopbackService);

  readonly senderVideoRef = viewChild<ElementRef<HTMLVideoElement>>('senderVideo');
  readonly receiverVideoRef = viewChild<ElementRef<HTMLVideoElement>>('receiverVideo');

  // Active profile for persistence of vision test
  readonly currentProfile = signal<QualityProfile>('1080p-60');
  readonly profileName = signal<string>('1080p @ 60 FPS (Fluid & Smooth)');
  readonly displayLayout = signal<DisplayLayout>('split');

  // مؤشرات الأداء الحية للـ Telemetry
  readonly telemetryMetrics = computed<MetricItem[]>(() => {
    const isLive = this.screenService.isSharing();
    const w = this.screenService.videoWidth();
    const h = this.screenService.videoHeight();
    const fps = this.screenService.frameRate();
    const profile = this.currentProfile();

    const codec = this.loopbackService.codec();
    const bitrate = this.loopbackService.bitrateKbps();
    const packets = this.loopbackService.packetsSent();
    const framesDecoded = this.loopbackService.framesDecoded();

    return [
      {
        label: 'Resolution',
        value: isLive && w > 0 ? `${w} × ${h}` : 'Standby',
        badgeColor: isLive ? 'mint' : 'default',
        description: 'Spatial Pixel Dimensions',
      },
      {
        label: 'Frame Rate',
        value: isLive ? fps : profile === '240p-5' ? 5 : profile === '720p-30' ? 30 : 60,
        unit: 'FPS',
        badgeColor: profile === '240p-5' ? 'rose' : 'cyan',
        description: 'Temporal Rate (Fusion Threshold)',
      },
      {
        label: 'Video Codec',
        value: isLive ? `${codec} (Lossy)` : 'VP8 / H264',
        badgeColor: isLive ? 'mint' : 'default',
        description: 'Inter-frame Compression',
      },
      {
        label: 'Live Bitrate',
        value: isLive ? bitrate : 0,
        unit: 'kbps',
        badgeColor: bitrate > 0 ? 'amber' : 'default',
        description: 'Bandwidth Consumption (Δbytes/Δt)',
      },
      {
        label: 'Packets Sent',
        value: packets,
        unit: 'Packets',
        badgeColor: packets > 0 ? 'cyan' : 'default',
        description: 'RTP UDP Packets',
      },
      {
        label: 'Frames Decoded',
        value: framesDecoded,
        unit: 'Frames',
        badgeColor: framesDecoded > 0 ? 'mint' : 'default',
        description: 'Receiver Hardware Decoder',
      },
    ];
  });

  // كائن البيانات المعروض في الـ Data Inspector
  readonly inspectorPayload = computed(() => {
    const isLive = this.screenService.isSharing();
    const settings = this.screenService.currentSettings();
    const loopback = this.loopbackService.statsSummary();

    return {
      module: 'VideosLab (Local WebRTC Loopback & Constraints)',
      streamActive: isLive,
      activeProfile: this.profileName(),
      displayLayout: this.displayLayout(),
      appliedConstraints: {
        width: this.screenService.videoWidth(),
        height: this.screenService.videoHeight(),
        frameRate: this.screenService.frameRate(),
      },
      mediaTrackSettings: {
        width: settings.width ?? this.screenService.videoWidth(),
        height: settings.height ?? this.screenService.videoHeight(),
        frameRate: settings.frameRate ?? this.screenService.frameRate(),
        aspectRatio: +(
          (settings.width || this.screenService.videoWidth() || 1) /
          (settings.height || this.screenService.videoHeight() || 1)
        ).toFixed(2),
        displaySurface: settings.displaySurface ?? 'window/monitor',
      },
      webrtcLoopbackStats: {
        architecture: 'In-Memory Peer-to-Peer Loopback (Zero Signaling Server)',
        codec: loopback.codec,
        compressionType: 'Lossy Inter-Frame Compression (DCT / Motion Vectors)',
        bitrateKbps: loopback.bitrateKbps,
        packetsSent: loopback.packetsSent,
        packetsLost: loopback.packetsLost,
        framesDecoded: loopback.framesDecoded,
        calculatedFps: loopback.framesPerSecond,
        jitterMs: loopback.jitterMs,
        roundTripTimeMs: loopback.roundTripTimeMs,
        connectionState: loopback.connectionState,
        iceConnectionState: loopback.iceConnectionState,
      },
      academicNotes: {
        persistenceOfVision:
          this.currentProfile() === '240p-5'
            ? 'Below Fusion Frequency (<40 fps): Human eye experiences noticeable jerkiness & flicker because retinal retention (1/16s) fades before next frame arrives.'
            : 'Above Fusion Frequency: Retinal after-images blend seamlessly into smooth continuous motion at 60 FPS.',
        lossyCompression:
          'Raw 1080p@60 uncompressed video exceeds 3 Gbps. Modern codecs (VP8/H264) compress the stream down to 1-3 Mbps (~99.9% compression ratio) using temporal difference frames (I/P/B frames).',
      },
      timestamp: Date.now(),
    };
  });

  readonly rawSettingsText = computed(() => {
    const p = this.inspectorPayload();
    return [
      `=== WEBRTC LOOPBACK REAL-TIME STATS ===`,
      `Connection State  : ${p.webrtcLoopbackStats.connectionState}`,
      `ICE Connection    : ${p.webrtcLoopbackStats.iceConnectionState}`,
      `Active Codec      : ${p.webrtcLoopbackStats.codec} (${p.webrtcLoopbackStats.compressionType})`,
      `Live Bitrate      : ${p.webrtcLoopbackStats.bitrateKbps} kbps`,
      `Packets Sent      : ${p.webrtcLoopbackStats.packetsSent} pkts`,
      `Packets Lost      : ${p.webrtcLoopbackStats.packetsLost} pkts`,
      `Frames Decoded    : ${p.webrtcLoopbackStats.framesDecoded} frames`,
      `Measured FPS      : ${p.webrtcLoopbackStats.calculatedFps} fps`,
      `Jitter Buffer     : ${p.webrtcLoopbackStats.jitterMs} ms`,
      `Loopback RTT      : ${p.webrtcLoopbackStats.roundTripTimeMs} ms`,
      ``,
      `=== MEDIA TRACK CONSTRAINTS ===`,
      `Resolution        : ${p.mediaTrackSettings.width} x ${p.mediaTrackSettings.height}`,
      `Frame Rate (fps)  : ${p.mediaTrackSettings.frameRate}`,
      `Aspect Ratio      : ${p.mediaTrackSettings.aspectRatio}`,
      `Display Surface   : ${p.mediaTrackSettings.displaySurface}`,
      ``,
      `=== ACADEMIC PERCEPTION NOTES ===`,
      `Perception Status : ${p.academicNotes.persistenceOfVision}`,
      `Compression Ratio : ${p.academicNotes.lossyCompression}`,
    ].join('\n');
  });

  constructor() {
    // ربط بث الشاشة الأصلي بـ senderVideo
    effect(() => {
      const stream = this.screenService.screenStream();
      const senderEl = this.senderVideoRef()?.nativeElement;
      if (senderEl) {
        senderEl.srcObject = stream;
      }

      // إذا كان هناك بث، قم بتغذية WebRTC Loopback تلقائياً
      if (stream) {
        this.loopbackService.startLoopback(stream);
      } else {
        this.loopbackService.stopLoopback();
      }
    });

    // ربط تدفق المستلم بـ receiverVideo
    effect(() => {
      const remoteStream = this.loopbackService.remoteStream();
      const receiverEl = this.receiverVideoRef()?.nativeElement;
      if (receiverEl) {
        receiverEl.srcObject = remoteStream;
      }
    });
  }

  async toggleScreen(): Promise<void> {
    if (this.screenService.isSharing()) {
      this.stopStream();
    } else {
      await this.startStream();
    }
  }

  async startStream(): Promise<void> {
    const stream = await this.screenService.startScreenShare();
    if (stream) {
      await this.setProfile('1080p-60');
    }
  }

  stopStream(): void {
    this.screenService.stopScreenShare();
    this.loopbackService.stopLoopback();
  }

  setLayout(layout: DisplayLayout): void {
    this.displayLayout.set(layout);
  }

  async applyProfile(profile: QualityProfile): Promise<void> {
    await this.setProfile(profile);
  }

  async setProfile(profile: QualityProfile): Promise<void> {
    this.currentProfile.set(profile);

    switch (profile) {
      case '1080p-60':
        this.profileName.set('1080p @ 60 FPS (Fluid & Smooth)');
        await this.screenService.updateQuality(1920, 1080, 60);
        break;
      case '720p-30':
        this.profileName.set('720p @ 30 FPS (Balanced Video)');
        await this.screenService.updateQuality(1280, 720, 30);
        break;
      case '240p-5':
        this.profileName.set('240p @ 5 FPS (Stutter / Below Fusion)');
        await this.screenService.updateQuality(426, 240, 5);
        break;
    }
  }

  ngOnDestroy(): void {
    this.stopStream();
  }
}
