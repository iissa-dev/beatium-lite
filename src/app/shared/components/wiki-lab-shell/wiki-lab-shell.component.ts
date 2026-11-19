import {
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';

export type InspectorTab = 'json' | 'raw';

@Component({
  selector: 'app-wiki-lab-shell',
  templateUrl: './wiki-lab-shell.component.html',
})
export class WikiLabShellComponent {
  // المدخلات الأكاديمية (Signal Inputs)
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');

  // حمولة البيانات للفحص (Data Inspector Payload)
  readonly dataPayload = input<unknown>(null);
  readonly rawPayload = input<string | null>(null);
  readonly rawLabel = input<string>('Raw / Stream');

  // التبويب النشط في صندوق فحص البيانات
  readonly activeInspectorTab = signal<InspectorTab>('json');

  // حالة النسخ
  readonly isCopied = signal<boolean>(false);

  // حالة وميض التحديث اللحظي (Mutation Pulse)
  readonly isMutating = signal<boolean>(false);

  // تحويل البيانات لنص لنسخها بسهولة
  readonly formattedJson = computed(() => {
    const data = this.dataPayload();
    if (data === null || data === undefined) return '// No data available';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  });

  readonly rawText = computed(() => {
    const customRaw = this.rawPayload();
    if (customRaw !== null && customRaw !== undefined) return customRaw;

    const data = this.dataPayload();
    if (typeof data === 'string') return data;
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      return `Buffer [${(data as Uint8Array).byteLength} bytes]`;
    }
    return this.formattedJson();
  });

  constructor() {
    // تفعيل وميض الفحص اللحظي (Pulse Highlight) عند حدوث أي Mutation للبيانات
    effect((onCleanup) => {
      // قراءة الحمولة لتتبع التغيير
      this.dataPayload();

      this.isMutating.set(true);
      const timeout = setTimeout(() => {
        this.isMutating.set(false);
      }, 700);

      onCleanup(() => clearTimeout(timeout));
    });
  }

  setInspectorTab(tab: InspectorTab) {
    this.activeInspectorTab.set(tab);
  }

  async copyPayload() {
    const textToCopy =
      this.activeInspectorTab() === 'json'
        ? this.formattedJson()
        : this.rawText();

    try {
      await navigator.clipboard.writeText(textToCopy);
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    } catch {
      // Fallback if clipboard API is blocked
      this.isCopied.set(false);
    }
  }
}
