// Adapter chung cho runtime chạy trong Web Worker (QuickJS, JS gốc).
// Dừng = terminate worker => luôn dừng được, kể cả vòng lặp vô hạn.
import { loadWasmManifest, type WasmLibInfo } from './shared/wasm';
import type { RunRequest, WorkerMessage } from './shared/protocol';
import type { RunContext, RunResult, Runtime, RuntimeInfo } from './types';

export const wasmBaseUrl = () => new URL('wasm/', document.baseURI).href;

let manifest: Promise<WasmLibInfo[]> | null = null;
export const getWasmManifest = () => (manifest ??= loadWasmManifest(wasmBaseUrl()));

interface Options {
  /** Giữ worker giữa các lần chạy (QuickJS: khỏi nạp lại WASM) hay tạo mới mỗi lần (JS gốc: global sạch) */
  reuse: boolean;
  /** Thời gian chờ thêm sau timeout trước khi main thread tự terminate */
  graceMs: number;
}

export class WorkerRuntime implements Runtime {
  private worker: Worker | null = null;
  private active: ((r: RunResult) => void) | null = null;

  constructor(
    public info: RuntimeInfo,
    private createWorker: () => Worker,
    private opts: Options,
  ) {}

  unavailableReason() {
    return typeof Worker === 'undefined' ? 'Trình duyệt không hỗ trợ Web Worker.' : null;
  }

  async run(ctx: RunContext): Promise<RunResult> {
    this.stop();
    const started = performance.now();
    const elapsed = () => performance.now() - started;

    const req: RunRequest = {
      type: 'run',
      files: ctx.project.files,
      entry: ctx.project.entry,
      wasmBase: wasmBaseUrl(),
      wasmLibs: await getWasmManifest(),
      timeoutMs: ctx.settings.timeoutMs,
      memoryLimitMb: ctx.settings.memoryLimitMb,
    };

    if (!this.opts.reuse || !this.worker) {
      this.worker?.terminate();
      this.worker = this.createWorker();
    }
    const worker = this.worker;

    return new Promise<RunResult>((resolve) => {
      const finish = (r: RunResult) => {
        if (this.active !== finish) return;
        clearTimeout(watchdog);
        this.active = null;
        resolve(r);
      };
      this.active = finish;

      const watchdog = setTimeout(() => {
        this.kill();
        finish({
          ok: false,
          error: `Hết thời gian chạy (${ctx.settings.timeoutMs}ms) — đã dừng worker. Đổi giới hạn trong ⚙ Cài đặt.`,
          durationMs: elapsed(),
        });
      }, ctx.settings.timeoutMs + this.opts.graceMs);

      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        if (msg.type === 'log') {
          ctx.out.log(msg.level, msg.text);
        } else {
          if (msg.recycle) this.kill();
          finish({ ok: msg.ok, error: msg.error, durationMs: msg.durationMs });
        }
      };
      worker.onerror = (e) => {
        e.preventDefault();
        finish({ ok: false, error: e.message || 'Worker gặp lỗi không xác định', durationMs: elapsed() });
      };
      worker.postMessage(req);
    });
  }

  stop() {
    const active = this.active;
    // Worker JS gốc có thể còn timer/promise chạy nền sau khi "xong" => cũng dọn luôn.
    if (active || !this.opts.reuse) this.kill();
    active?.({ ok: false, stopped: true, error: 'Đã dừng', durationMs: 0 });
  }

  private kill() {
    this.worker?.terminate();
    this.worker = null;
  }
}
