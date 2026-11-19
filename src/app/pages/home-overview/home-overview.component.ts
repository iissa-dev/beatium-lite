import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface LabCard {
  lectureId: string;
  slides: string;
  title: string;
  topic: string;
  bullets: string[];
  route: string;
  badgeColor: string;
}

@Component({
  selector: 'app-home-overview',
  imports: [RouterLink],
  templateUrl: './home-overview.component.html',
})
export class HomeOverviewComponent {
  readonly labs = signal<LabCard[]>([
    {
      lectureId: 'Lecture 2A & 2B',
      slides: 'Slides 5–30, 57–67',
      title: 'Voice Lab',
      topic: 'Audio DSP, Sampling & Quantization',
      bullets: [
        'ADC conversion into discrete Float32Array PCM samples (48 kHz)',
        'Neural RNNoise noise suppression compiled to WebAssembly',
        'Pure code procedural tone synthesis with 0 KB asset overhead',
      ],
      route: '/voice',
      badgeColor: 'emerald',
    },
    {
      lectureId: 'Lecture 2B & 2A',
      slides: 'Slides 40–52, 29–35',
      title: 'Image Lab',
      topic: 'Vector Graphics vs Raster Bitmaps',
      bullets: [
        'Uncompressed Bitmap memory: 800×500×4 bytes = 1.6 MB',
        'Mathematical Bézier paths with >99.9% payload reduction (<1 KB)',
        'Resolution independence: Infinite zoom with zero pixelation/aliasing',
      ],
      route: '/image',
      badgeColor: 'cyan',
    },
    {
      lectureId: 'Lecture 2B & 2A',
      slides: 'Slides 53–56, 29',
      title: 'Videos Lab',
      topic: 'Frame Rates & Persistence of Vision',
      bullets: [
        'Retinal response retention buffer (1/16s to 1/10s duration)',
        'Fusion Frequency (40+ FPS) vs 5 FPS motion jerkiness / flicker',
        'In-memory RTCPeerConnection loopback with live VP8/H.264 bitrate stats',
      ],
      route: '/videos',
      badgeColor: 'purple',
    },
  ]);
}
