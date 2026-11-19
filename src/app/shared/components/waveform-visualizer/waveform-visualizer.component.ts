import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

export type WaveformSource = ((buffer: Float32Array) => void) | AnalyserNode;

@Component({
  selector: 'app-waveform-visualizer',
  templateUrl: './waveform-visualizer.component.html',
})
export class WaveformVisualizerComponent {
  private readonly destroyRef = inject(DestroyRef);

  // مرجع لوحة الرسم
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('visualizerCanvas');

  // المدخلات (Signal Inputs)
  readonly dataSource = input<WaveformSource | null>(null);
  readonly isActive = input<boolean>(false);
  readonly strokeColor = input<string>('#34d399'); // لون النعناع الافتراضي
  readonly height = input<number>(160);
  readonly showGrid = input<boolean>(true);
  readonly label = input<string>('Oscilloscope Waveform');

  // Live 8 PCM Float32 Samples
  readonly firstSamples = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);

  private animationFrameId: number | null = null;
  private sampleThrottleCounter = 0;

  constructor() {
    // مراقبة حالة النشاط ومصدر البيانات لبدء أو إيقاف الرسم
    effect(() => {
      const active = this.isActive();
      const source = this.dataSource();
      const canvas = this.canvasRef()?.nativeElement;

      if (active && source && canvas) {
        this.startDrawing(canvas, source);
      } else if (canvas) {
        this.stopDrawing();
        this.drawIdleState(canvas);
      }
    });

    // تنظيف حلقة الرسم تلقائياً عند تدمير المكوّن
    this.destroyRef.onDestroy(() => {
      this.stopDrawing();
    });
  }

  private startDrawing(canvas: HTMLCanvasElement, source: WaveformSource) {
    this.stopDrawing();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer = new Float32Array(512);

    const draw = () => {
      this.animationFrameId = requestAnimationFrame(draw);

      // استخراج البيانات من الدالة أو من AnalyserNode
      if (typeof source === 'function') {
        source(buffer);
      } else if (source instanceof AnalyserNode) {
        source.getFloatTimeDomainData(buffer);
      }

      // تحديث العينات الرقمية (8 عينات حية) كل 3 إطارات
      this.sampleThrottleCounter++;
      if (this.sampleThrottleCounter % 3 === 0) {
        const topEight: number[] = [];
        for (let i = 0; i < 8; i++) {
          topEight.push(buffer[i] ?? 0);
        }
        this.firstSamples.set(topEight);
      }

      this.renderFrame(ctx, canvas, buffer);
    };

    draw();
  }

  private stopDrawing() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    buffer: Float32Array
  ) {
    const width = canvas.width;
    const height = canvas.height;

    // مسح الخلفية بلون الـ Obsidian
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // رسم الشبكة البيانية (Oscilloscope Grid)
    if (this.showGrid()) {
      this.drawGrid(ctx, width, height);
    }

    // إعدادات خط الموجة
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.strokeColor();
    ctx.shadowColor = this.strokeColor();
    ctx.shadowBlur = 8;
    ctx.beginPath();

    const sliceWidth = width / buffer.length;
    let x = 0;

    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i]; // القيمة بين -1 و +1
      const y = ((1 - v) / 2) * height; // تحويل [-1, 1] إلى نطاق الرسم الرأسي

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.shadowBlur = 0; // إعادة ضبط التوهج
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.lineWidth = 1;

    // خطوط الشبكة الرأسية والأفقية الخافتة
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();

    const stepX = width / 8;
    for (let x = stepX; x < width; x += stepX) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }

    const stepY = height / 4;
    for (let y = stepY; y < height; y += stepY) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // خط الصفر المركزي البارز (0.0V Baseline)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]); // إعادة الخط المتصل
  }

  private drawIdleState(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    if (this.showGrid()) {
      this.drawGrid(ctx, width, height);
    }

    // خط استقرار أفقي في المنتصف
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // تصفير أول 10 عينات
    this.firstSamples.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  }
}
