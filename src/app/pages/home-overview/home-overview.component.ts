import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface LabMetric {
  value: string;
  unit?: string;
  label: string;
}

export interface LabCard {
  lectureId: string;
  slides: string;
  title: string;
  topic: string;
  previewType: 'voice' | 'image' | 'video';
  metrics: LabMetric[];
  route: string;
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
      previewType: 'voice',
      metrics: [
        { value: '48', unit: 'kHz', label: 'PCM Sampling' },
        { value: 'WASM', label: 'Neural Denoise' },
        { value: '0', unit: 'KB', label: 'Tone Synthesis' },
      ],
      route: '/voice',
    },
    {
      lectureId: 'Lecture 2B & 2A',
      slides: 'Slides 40–52, 29–35',
      title: 'Image Lab',
      topic: 'Vector Graphics vs Raster Bitmaps',
      previewType: 'image',
      metrics: [
        { value: '< 1', unit: 'KB', label: 'Bézier Vector' },
        { value: '1.6', unit: 'MB', label: 'Raw Bitmap' },
        { value: '99.9%', label: 'Saved Size' },
      ],
      route: '/image',
    },
    {
      lectureId: 'Lecture 2B & 2A',
      slides: 'Slides 53–56, 29',
      title: 'Videos Lab',
      topic: 'Frame Rates & Persistence of Vision',
      previewType: 'video',
      metrics: [
        { value: '60', unit: 'FPS', label: 'Fluid Motion' },
        { value: '5', unit: 'FPS', label: 'Flicker Stutter' },
        { value: 'P2P', label: 'WebRTC Stream' },
      ],
      route: '/videos',
    },
  ]);
}
