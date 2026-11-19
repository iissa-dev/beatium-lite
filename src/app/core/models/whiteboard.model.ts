export type WhiteboardTool = 'pen' | 'rectangle' | 'circle' | 'line';

export interface WhiteboardElement {
  id: string;
  type: WhiteboardTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: { x: number; y: number }[]; // لمسار القلم الحر
  color: string;
  strokeWidth: number;
}

export interface WhiteboardScene {
  version: number;
  elements: WhiteboardElement[];
  totalBytes: number; // حجم الـ JSON بالبايت لشرح كفاءة المتجهات للدكتور
  lastUpdatedAt: string;
}