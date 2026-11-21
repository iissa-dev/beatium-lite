import { Injectable, signal, computed, DestroyRef, inject } from '@angular/core';

export interface WebRtcStreamStats {
  codec: string;
  bitrateKbps: number;
  packetsSent: number;
  packetsLost: number;
  framesDecoded: number;
  framesPerSecond: number;
  jitterMs: number;
  roundTripTimeMs: number;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
}

@Injectable({ providedIn: 'root' })
export class WebRtcLoopbackService {
  private readonly destroyRef = inject(DestroyRef);

  private pcSender: RTCPeerConnection | null = null;
  private pcReceiver: RTCPeerConnection | null = null;
  private statsIntervalId: ReturnType<typeof setInterval> | null = null;

  private lastBytesSent = 0;
  private lastTimestamp = 0;

  // الإشارات التفاعلية (Signals)
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly isConnected = signal<boolean>(false);
  readonly codec = signal<string>('VP8');
  readonly bitrateKbps = signal<number>(0);
  readonly packetsSent = signal<number>(0);
  readonly packetsLost = signal<number>(0);
  readonly framesDecoded = signal<number>(0);
  readonly framesPerSecond = signal<number>(0);
  readonly jitterMs = signal<number>(0);
  readonly roundTripTimeMs = signal<number>(0);
  readonly connectionState = signal<RTCPeerConnectionState>('new');
  readonly iceConnectionState = signal<RTCIceConnectionState>('new');

  readonly statsSummary = computed<WebRtcStreamStats>(() => ({
    codec: this.codec(),
    bitrateKbps: this.bitrateKbps(),
    packetsSent: this.packetsSent(),
    packetsLost: this.packetsLost(),
    framesDecoded: this.framesDecoded(),
    framesPerSecond: this.framesPerSecond(),
    jitterMs: this.jitterMs(),
    roundTripTimeMs: this.roundTripTimeMs(),
    connectionState: this.connectionState(),
    iceConnectionState: this.iceConnectionState(),
    signalingState: this.pcSender ? this.pcSender.signalingState : 'closed',
  }));

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopLoopback();
    });
  }

  /**
   * تشغيل محاكاة الإرسال اللحظية في الذاكرة (In-Memory Loopback P2P)
   * عبر كائني RTCPeerConnection متبادلين للإشارات بدون سيرفر
   */
  public async startLoopback(localStream: MediaStream): Promise<MediaStream | null> {
    this.stopLoopback();

    try {
      // 1. إنشاء المرسل والمستقبل
      const config: RTCConfiguration = {
        iceServers: [], // In-memory loopback doesn't require STUN/TURN
      };

      this.pcSender = new RTCPeerConnection(config);
      this.pcReceiver = new RTCPeerConnection(config);

      // 2. تبادل مرشحي ICE مباشرة في الذاكرة
      this.pcSender.onicecandidate = (event) => {
        if (event.candidate && this.pcReceiver && this.pcReceiver.signalingState !== 'closed') {
          this.pcReceiver.addIceCandidate(event.candidate).catch((e) =>
            console.warn('Receiver addIceCandidate error:', e)
          );
        }
      };

      this.pcReceiver.onicecandidate = (event) => {
        if (event.candidate && this.pcSender && this.pcSender.signalingState !== 'closed') {
          this.pcSender.addIceCandidate(event.candidate).catch((e) =>
            console.warn('Sender addIceCandidate error:', e)
          );
        }
      };

      // 3. استقبال المسار في الطرف الآخر (Remote Track Arrival)
      this.pcReceiver.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream.set(event.streams[0]);
          this.isConnected.set(true);
        }
      };

      // مراقبة حالة الاتصال
      this.pcSender.onconnectionstatechange = () => {
        if (this.pcSender) {
          this.connectionState.set(this.pcSender.connectionState);
        }
      };

      this.pcSender.oniceconnectionstatechange = () => {
        if (this.pcSender) {
          this.iceConnectionState.set(this.pcSender.iceConnectionState);
        }
      };

      // 4. تمرير مسارات الفيديو من المصدر إلى المرسل
      localStream.getTracks().forEach((track) => {
        if (this.pcSender) {
          this.pcSender.addTrack(track, localStream);
        }
      });

      // 5. التفاوض بروتوكولياً (Offer & Answer Exchange)
      const offer = await this.pcSender.createOffer({
        offerToReceiveVideo: false,
        offerToReceiveAudio: false,
      });
      await this.pcSender.setLocalDescription(offer);
      await this.pcReceiver.setRemoteDescription(offer);

      const answer = await this.pcReceiver.createAnswer();
      await this.pcReceiver.setLocalDescription(answer);
      await this.pcSender.setRemoteDescription(answer);

      // 6. تشغيل مؤقت الإحصائيات (RTCStatsReport Polling)
      this.startStatsMonitoring();

      return this.remoteStream();
    } catch (err) {
      console.error('Failed to initialize WebRTC Loopback:', err);
      this.stopLoopback();
      return null;
    }
  }

  /**
   * قراءة إحصائيات WebRTC القياسية getStats()
   * لحساب Bitrate, Codec, Packets Sent, Frames Decoded
   */
  private startStatsMonitoring(): void {
    this.lastBytesSent = 0;
    this.lastTimestamp = 0;

    this.statsIntervalId = setInterval(async () => {
      if (!this.pcSender || this.pcSender.signalingState === 'closed') {
        return;
      }

      try {
        const senderStats = await this.pcSender.getStats();
        senderStats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            const now = report.timestamp;
            const bytes = report.bytesSent ?? 0;

            if (this.lastTimestamp > 0 && now > this.lastTimestamp) {
              const deltaBytes = bytes - this.lastBytesSent;
              const deltaTime = (now - this.lastTimestamp) / 1000; // in seconds
              if (deltaTime > 0) {
                const kbps = Math.round((deltaBytes * 8) / (deltaTime * 1000));
                this.bitrateKbps.set(Math.max(0, kbps));
              }
            }

            this.lastBytesSent = bytes;
            this.lastTimestamp = now;

            this.packetsSent.set(report.packetsSent ?? 0);
            if (report.framesPerSecond !== undefined) {
              this.framesPerSecond.set(Math.round(report.framesPerSecond));
            }

            // فحص نوع الترميز (Codec Identification)
            if (report.codecId) {
              const codecReport = senderStats.get(report.codecId);
              if (codecReport && codecReport.mimeType) {
                const codecName = codecReport.mimeType.replace(/^video\//i, '').toUpperCase();
                this.codec.set(codecName);
              }
            }
          }

          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime !== undefined) {
              this.roundTripTimeMs.set(Math.round(report.currentRoundTripTime * 1000));
            }
          }
        });

        // قراءة إحصائيات المستلم للتحقق من فك التشفير
        if (this.pcReceiver && this.pcReceiver.signalingState !== 'closed') {
          const rxStats = await this.pcReceiver.getStats();
          rxStats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              this.framesDecoded.set(report.framesDecoded ?? 0);
              this.packetsLost.set(report.packetsLost ?? 0);
              if (report.jitter !== undefined) {
                this.jitterMs.set(Math.round(report.jitter * 1000));
              }
            }
          });
        }
      } catch (err: unknown) {
        // Stats query failure safely caught if connection closed during tick
        if (this.pcSender) {
          console.debug('WebRTC stats poll error:', err);
        }
      }
    }, 1000);
  }

  public stopLoopback(): void {
    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = null;
    }

    if (this.pcSender) {
      this.pcSender.close();
      this.pcSender = null;
    }

    if (this.pcReceiver) {
      this.pcReceiver.close();
      this.pcReceiver = null;
    }

    this.remoteStream.set(null);
    this.isConnected.set(false);
    this.bitrateKbps.set(0);
    this.packetsSent.set(0);
    this.packetsLost.set(0);
    this.framesDecoded.set(0);
    this.roundTripTimeMs.set(0);
    this.connectionState.set('closed');
    this.iceConnectionState.set('closed');
  }
}
