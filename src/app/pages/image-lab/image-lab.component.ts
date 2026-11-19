import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
  signal,
} from '@angular/core';
import { WhiteboardService } from '../../core/services/whiteboard.service';
import { WhiteboardElement, WhiteboardTool } from '../../core/models/whiteboard.model';
import { WikiLabShellComponent } from '../../shared/components/wiki-lab-shell/wiki-lab-shell.component';
import { TelemetryBarComponent, MetricItem } from '../../shared/components/telemetry-bar/telemetry-bar.component';

@Component({
  selector: 'app-image-lab',
  imports: [WikiLabShellComponent, TelemetryBarComponent],
  templateUrl: './image-lab.component.html',
})
export class ImageLabComponent {
  readonly whiteboard = inject(WhiteboardService);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('whiteboardCanvas');

  // خيارات الرسم الحالية
  readonly selectedColor = signal<string>('#34d399');
  readonly selectedStrokeWidth = signal<number>(3);

  // حالة الرسم اللحظي بالماوس
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private currentPoints: { x: number; y: number }[] = [];

  // مؤشرات الأداء الحية للـ Telemetry
  readonly telemetryMetrics = computed<MetricItem[]>(() => {
    const vectorBytes = this.whiteboard.payloadSizeInBytes();
    const count = this.whiteboard.elements().length;

    return [
      {
        label: 'Vector Size',
        value: vectorBytes,
        unit: 'Bytes',
        badgeColor: 'mint',
        description: 'JSON/SVG Vector Stream',
      },
      {
        label: 'Equivalent Bitmap (800x500)',
        value: '1.6',
        unit: 'MB',
        badgeColor: 'amber',
        description: '800 × 500 × 4 Bytes (RGBA)',
      },
      {
        label: 'Elements Count',
        value: count,
        unit: 'Objects',
        badgeColor: 'cyan',
        description: 'Bézier Geometric Paths',
      },
      {
        label: 'Bandwidth Saved',
        value: count === 0 ? '100%' : `${(((1600000 - vectorBytes) / 1600000) * 100).toFixed(1)}%`,
        badgeColor: 'mint',
        description: 'Compression Efficiency',
      },
    ];
  });

  // كود الـ SVG المصدر للتبويب الثاني
  readonly exportedSvg = computed(() => {
    return this.whiteboard.exportAsSvg(800, 480);
  });

  constructor() {
    // إعادة رسم اللوحة تلقائياً عند أي تعديل على مصفوفة العناصر (إضافة، تراجع، مسح)
    effect(() => {
      // تتبع عناصر السبورة
      this.whiteboard.elements();
      this.redrawCanvas();
    });
  }

  setTool(tool: WhiteboardTool) {
    this.whiteboard.currentTool.set(tool);
  }

  setColor(color: string) {
    this.selectedColor.set(color);
    this.whiteboard.currentColor.set(color);
  }

  setStrokeWidth(w: number) {
    this.selectedStrokeWidth.set(w);
    this.whiteboard.currentStrokeWidth.set(w);
  }

  // --- أحداث مؤشر الماوس / اللمس على الـ Canvas ---

  onPointerDown(event: PointerEvent) {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    canvas.setPointerCapture(event.pointerId);
    const coords = this.getCanvasCoordinates(event, canvas);

    this.isDrawing = true;
    this.startX = coords.x;
    this.startY = coords.y;
    this.currentX = coords.x;
    this.currentY = coords.y;

    if (this.whiteboard.currentTool() === 'pen') {
      this.currentPoints = [{ x: coords.x, y: coords.y }];
    }
  }

  onPointerMove(event: PointerEvent) {
    if (!this.isDrawing) return;

    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    const coords = this.getCanvasCoordinates(event, canvas);
    this.currentX = coords.x;
    this.currentY = coords.y;

    if (this.whiteboard.currentTool() === 'pen') {
      this.currentPoints.push({ x: coords.x, y: coords.y });
    }

    this.redrawCanvas();
  }

  onPointerUp(event?: PointerEvent) {
    if (!this.isDrawing) return;

    const canvas = this.canvasRef()?.nativeElement;
    if (canvas && event && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    this.isDrawing = false;
    const tool = this.whiteboard.currentTool();
    const color = this.selectedColor();
    const strokeWidth = this.selectedStrokeWidth();

    if (tool === 'pen' && this.currentPoints.length > 1) {
      this.whiteboard.addElement({
        id: crypto.randomUUID(),
        type: 'pen',
        x: this.startX,
        y: this.startY,
        points: [...this.currentPoints],
        color,
        strokeWidth,
      });
    } else if (tool === 'rectangle') {
      const w = this.currentX - this.startX;
      const h = this.currentY - this.startY;
      if (Math.abs(w) > 4 || Math.abs(h) > 4) {
        this.whiteboard.addElement({
          id: crypto.randomUUID(),
          type: 'rectangle',
          x: Math.min(this.startX, this.currentX),
          y: Math.min(this.startY, this.currentY),
          width: Math.abs(w),
          height: Math.abs(h),
          color,
          strokeWidth,
        });
      }
    } else if (tool === 'circle') {
      const r = Math.hypot(this.currentX - this.startX, this.currentY - this.startY);
      if (r > 4) {
        this.whiteboard.addElement({
          id: crypto.randomUUID(),
          type: 'circle',
          x: this.startX - r,
          y: this.startY - r,
          width: r * 2,
          height: r * 2,
          color,
          strokeWidth,
        });
      }
    } else if (tool === 'line') {
      const dist = Math.hypot(this.currentX - this.startX, this.currentY - this.startY);
      if (dist > 4) {
        this.whiteboard.addElement({
          id: crypto.randomUUID(),
          type: 'line',
          x: this.startX,
          y: this.startY,
          width: this.currentX - this.startX,
          height: this.currentY - this.startY,
          color,
          strokeWidth,
        });
      }
    }

    this.currentPoints = [];
    this.redrawCanvas();
  }

  undo() {
    this.whiteboard.undo();
  }

  clear() {
    this.whiteboard.clear();
  }

  private getCanvasCoordinates(event: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  private redrawCanvas() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // مسح وتعبئة الخلفية
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // رسم شبكة القياس
    this.drawGrid(ctx, canvas.width, canvas.height);

    // رسم كافة العناصر المتجهية المسجلة
    for (const el of this.whiteboard.elements()) {
      this.drawElement(ctx, el);
    }

    // رسم العنصر الجاري سحبه قبل تركه
    if (this.isDrawing) {
      this.drawLivePreview(ctx);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const gridSize = 25;
    for (let x = gridSize; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  private drawElement(ctx: CanvasRenderingContext2D, el: WhiteboardElement) {
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (el.type) {
      case 'rectangle':
        ctx.strokeRect(el.x, el.y, el.width || 50, el.height || 50);
        break;

      case 'circle': {
        const radius = (el.width || 30) / 2;
        ctx.beginPath();
        ctx.arc(el.x + radius, el.y + radius, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'line':
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + (el.width || 50), el.y + (el.height || 50));
        ctx.stroke();
        break;

      case 'pen':
        if (el.points && el.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
        }
        break;
    }
  }

  private drawLivePreview(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = this.selectedColor();
    ctx.lineWidth = this.selectedStrokeWidth();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const tool = this.whiteboard.currentTool();

    switch (tool) {
      case 'rectangle': {
        const w = this.currentX - this.startX;
        const h = this.currentY - this.startY;
        ctx.strokeRect(
          Math.min(this.startX, this.currentX),
          Math.min(this.startY, this.currentY),
          Math.abs(w),
          Math.abs(h)
        );
        break;
      }

      case 'circle': {
        const r = Math.hypot(this.currentX - this.startX, this.currentY - this.startY);
        ctx.beginPath();
        ctx.arc(this.startX, this.startY, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'line':
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.currentX, this.currentY);
        ctx.stroke();
        break;

      case 'pen':
        if (this.currentPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(this.currentPoints[0].x, this.currentPoints[0].y);
          for (let i = 1; i < this.currentPoints.length; i++) {
            ctx.lineTo(this.currentPoints[i].x, this.currentPoints[i].y);
          }
          ctx.stroke();
        }
        break;
    }
  }
}
