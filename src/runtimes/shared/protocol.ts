import type { FileMap } from '../../types';
import type { WasmLibInfo } from './wasm';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** main -> worker */
export interface RunRequest {
  type: 'run';
  files: FileMap;
  entry: string;
  /** URL tuyệt đối của thư mục chứa *.wasm (public/wasm/) */
  wasmBase: string;
  wasmLibs: WasmLibInfo[];
  timeoutMs: number;
  memoryLimitMb: number;
}

/** worker -> main */
export type WorkerMessage =
  | { type: 'log'; level: LogLevel; text: string }
  | {
      type: 'done';
      ok: boolean;
      error?: string;
      durationMs: number;
      /** Worker hỏng trạng thái (vd. QuickJS abort) -> main nên tạo worker mới */
      recycle?: boolean;
    };

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
