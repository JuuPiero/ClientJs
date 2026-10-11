import type { Project, RuntimeId, Settings } from '../types';
import type { LogLevel } from './shared/protocol';

export interface OutputSink {
  /** Dữ liệu terminal thô (có thể chứa ANSI) */
  write(data: string): void;
  /** Log từ console.* của chương trình */
  log(level: LogLevel, text: string): void;
  /** Thông báo hệ thống (mờ, có prefix) */
  info(text: string): void;
}

export interface RunContext {
  project: Project;
  settings: Settings;
  out: OutputSink;
  terminalSize(): { cols: number; rows: number };
  /** WebContainer báo có server đang lắng nghe (url) hoặc server đã đóng (null) */
  onPreview(url: string | null, port?: number): void;
}

export interface RunResult {
  ok: boolean;
  error?: string;
  stopped?: boolean;
  durationMs: number;
}

export interface RuntimeInfo {
  id: RuntimeId;
  label: string;
  short: string;
  color: string;
  description: string;
}

export interface Runtime {
  info: RuntimeInfo;
  /** null nếu dùng được, ngược lại là lý do không dùng được */
  unavailableReason(): string | null;
  run(ctx: RunContext): Promise<RunResult>;
  stop(): void;
  /** Terminal tương tác — chỉ WebContainer */
  interactive?: boolean;
  write?(data: string): void;
  resize?(cols: number, rows: number): void;
  openShell?(ctx: RunContext): Promise<void>;
}
