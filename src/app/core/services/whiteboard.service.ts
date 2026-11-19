import { Injectable, signal, computed } from '@angular/core';
import { WhiteboardElement, WhiteboardTool, WhiteboardScene } from './../models/whiteboard.model';

@Injectable({ providedIn: 'root' })
export class WhiteboardService {
  readonly elements = signal<WhiteboardElement[]>([]);
  readonly currentTool = signal<WhiteboardTool>('pen');
  readonly currentColor = signal<string>('#38bdf8');
  readonly currentStrokeWidth = signal<number>(3);

  readonly elementsJson = computed(() => {
    return JSON.stringify(this.elements(), null, 2);
  });

  readonly payloadSizeInBytes = computed(() => {
    return new Blob([this.elementsJson()]).size;
  });

  public addElement(element: WhiteboardElement): void {
    this.elements.update((prev) => [...prev, element]);
  }

  public undo(): void {
    this.elements.update((prev) => prev.slice(0, -1));
  }

  public clear(): void {
    this.elements.set([]);
  }

  public exportAsSvg(width = 800, height = 500): string {
    const svgElements = this.elements().map((el: WhiteboardElement) => {
      switch (el.type) {
        case 'rectangle':
          return `<rect x="${el.x}" y="${el.y}" width="${el.width || 50}" height="${el.height || 50}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" />`;
        case 'circle':
          const r = Math.max(Math.abs(el.width || 30), Math.abs(el.height || 30)) / 2;
          return `<circle cx="${el.x + r}" cy="${el.y + r}" r="${r}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" />`;
        case 'line':
          return `<line x1="${el.x}" y1="${el.y}" x2="${el.x + (el.width || 50)}" y2="${el.y + (el.height || 50)}" stroke="${el.color}" stroke-width="${el.strokeWidth}" />`;
        case 'pen':
          if (!el.points || el.points.length === 0) return '';
          const d = el.points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return `<path d="${d}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" stroke-linecap="round" />`;
      }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${svgElements.join('\n  ')}\n</svg>`;
  }
}