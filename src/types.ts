export type RuntimeId = 'quickjs' | 'worker' | 'webcontainer';

/** path (không có "/" đầu, vd. "lib/utils.js") -> nội dung */
export type FileMap = Record<string, string>;

export interface Project {
  id: string;
  name: string;
  runtime: RuntimeId;
  files: FileMap;
  /** File được chạy khi bấm Run */
  entry: string;
  openFiles: string[];
  activeFile: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  /** Thời gian chạy tối đa (QuickJS + Web Worker) */
  timeoutMs: number;
  /** Giới hạn heap của QuickJS */
  memoryLimitMb: number;
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  sidebarOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  timeoutMs: 10_000,
  memoryLimitMb: 64,
  fontSize: 14,
  wordWrap: false,
  minimap: false,
  sidebarOpen: true,
};
