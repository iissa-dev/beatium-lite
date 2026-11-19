import { Component, input } from '@angular/core';

export type MetricBadgeColor = 'mint' | 'cyan' | 'amber' | 'rose' | 'default';

export interface MetricItem {
  label: string;
  value: string | number;
  unit?: string;
  badgeColor?: MetricBadgeColor;
  description?: string;
}

@Component({
  selector: 'app-telemetry-bar',
  templateUrl: './telemetry-bar.component.html',
})
export class TelemetryBarComponent {
  // مصفوفة المؤشرات التقنية المستقبلة
  readonly metrics = input<MetricItem[]>([]);
}
