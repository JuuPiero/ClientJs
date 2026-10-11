// QuickJS (WASM) chạy trong Web Worker để vòng lặp nặng không đơ UI.
// Mỗi lần Run tạo QuickJSRuntime + Context mới => trạng thái không rò rỉ giữa các lần chạy.
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import quickjsWasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import inspectSource from './shared/inspect.js?raw';
import { isRelative, resolveFile, resolvePath } from './shared/paths';
import { errorText, type LogLevel, type RunRequest, type WorkerMessage } from './shared/protocol';
import { isIdentifier, loadWasmLib, WASM_SCHEME } from './shared/wasm';

let quickjs: Promise<QuickJSWASMModule> | null = null;
const getQuickJS = () =>
  (quickjs ??= newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, { wasmLocation: quickjsWasmUrl })));

const post = (msg: WorkerMessage) => self.postMessage(msg);

// Prelude chạy trước code người dùng: dựng console từ hàm host __host_log.
const PRELUDE = `
import { formatArgs } from 'host:inspect';
const log = globalThis.__host_log;
delete globalThis.__host_log;
const make = (level) => (...args) => log(level, formatArgs(args));
const timers = new Map();
globalThis.console = {
  log: make('log'), info: make('info'), warn: make('warn'), error: make('error'),
  debug: make('debug'), trace: make('debug'), dir: make('log'), table: make('log'),
  assert: (ok, ...args) => { if (!ok) log('error', 'Assertion failed' + (args.length ? ': ' + formatArgs(args) : '')); },
  time: (label = 'default') => { timers.set(label, Date.now()); },
  timeEnd: (label = 'default') => { log('log', label + ': ' + (Date.now() - (timers.get(label) ?? Date.now())) + 'ms'); timers.delete(label); },
};
`;

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  if (event.data?.type !== 'run') return;
  const started = performance.now();
  let result: { ok: boolean; error?: string; recycle?: boolean };
  try {
    result = await runProject(event.data);
  } catch (err) {
    result = { ok: false, error: errorText(err) };
  }
  post({ type: 'done', ...result, durationMs: performance.now() - started });
};

async function runProject(req: RunRequest) {
  const QuickJS = await getQuickJS();
  const wasm = await preloadWasm(req);
  const runtime = QuickJS.newRuntime();
  const vm = runtime.newContext();
  const session = new Session(runtime, vm, req, wasm);
  try {
    return await session.run();
  } finally {
    if (!session.dispose()) {
      // Rò handle khiến QuickJS abort -> bỏ module WASM này, worker nên được thay mới.
      quickjs = null;
      return { ok: false, error: 'QuickJS bị lỗi trạng thái, worker sẽ được khởi tạo lại.', recycle: true };
    }
  }
}

/** Module loader của QuickJS là đồng bộ => nạp trước mọi lib "wasm:*" (cache theo tên). */
const wasmCache = new Map<string, Promise<WebAssembly.Exports>>();
async function preloadWasm(req: RunRequest) {
  const loaded = new Map<string, WebAssembly.Exports>();
  for (const lib of req.wasmLibs) {
    const imported = Object.values(req.files).some((code) => code.includes(WASM_SCHEME + lib.name));
    if (!imported) continue;
    const key = `${req.wasmBase}${lib.file}`;
    if (!wasmCache.has(key)) wasmCache.set(key, loadWasmLib(req.wasmBase, lib));
    try {
      loaded.set(lib.name, await wasmCache.get(key)!);
    } catch (err) {
      wasmCache.delete(key);
      throw new Error(`Không nạp được wasm:${lib.name} — ${errorText(err)}`);
    }
  }
  return loaded;
}

interface Timer {
  handle: ReturnType<typeof setTimeout>;
  callback: QuickJSHandle;
  repeat: boolean;
}

class Session {
  private timers = new Map<number, Timer>();
  private nextTimerId = 1;
  private deadline: number;
  private mainSettled = false;
  private finished = false;
  private finish!: (r: { ok: boolean; error?: string }) => void;
  private watchdog?: ReturnType<typeof setTimeout>;

  constructor(
    private runtime: QuickJSRuntime,
    private vm: QuickJSContext,
    private req: RunRequest,
    private wasm: Map<string, WebAssembly.Exports>,
  ) {
    this.deadline = Date.now() + req.timeoutMs;
    runtime.setMemoryLimit(req.memoryLimitMb * 1024 * 1024);
    runtime.setMaxStackSize(1024 * 1024);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(this.deadline));
    runtime.setModuleLoader(
      (name) => this.loadModule(name),
      (base, requested) => this.normalizeModule(base, requested),
    );
  }

  async run(): Promise<{ ok: boolean; error?: string }> {
    const done = new Promise<{ ok: boolean; error?: string }>((resolve) => (this.finish = resolve));
    this.installHostApi();

    const preludeError = await this.startModule(PRELUDE, 'host:prelude');
    if (preludeError) return { ok: false, error: `Prelude lỗi: ${preludeError}` };

    const entry = this.req.entry;
    this.startModule(this.req.files[entry] ?? '', entry).then((error) => {
      this.mainSettled = true;
      if (error) this.end({ ok: false, error });
      else this.check();
    });

    this.watchdog = setTimeout(() => this.check(), Math.max(0, this.deadline - Date.now()) + 10);
    this.check();
    return done;
  }

  // ---- Host API cấp cho sandbox ---------------------------------------

  private installHostApi() {
    const { vm } = this;
    const define = (name: string, fn: Parameters<QuickJSContext['newFunction']>[1]) => {
      const handle = vm.newFunction(name, fn);
      vm.setProp(vm.global, name, handle);
      handle.dispose();
    };

    define('__host_log', (levelH, textH) => {
      post({ type: 'log', level: vm.getString(levelH) as LogLevel, text: vm.getString(textH) });
    });

    const addTimer = (repeat: boolean) => (callbackH: QuickJSHandle, msH?: QuickJSHandle) => {
      if (vm.typeof(callbackH) !== 'function') {
        return { error: vm.newError({ name: 'TypeError', message: 'callback phải là function' }) };
      }
      const id = this.nextTimerId++;
      const ms = Math.max(0, Number(msH ? vm.dump(msH) : 0) || 0);
      const callback = callbackH.dup();
      const fire = () => this.fireTimer(id);
      const handle = repeat ? setInterval(fire, Math.max(ms, 1)) : setTimeout(fire, ms);
      this.timers.set(id, { handle, callback, repeat });
      return vm.newNumber(id);
    };
    const clearTimer = (idH?: QuickJSHandle) => {
      if (idH) this.clearTimer(Number(vm.dump(idH)));
    };
    define('setTimeout', addTimer(false));
    define('setInterval', addTimer(true));
    define('clearTimeout', clearTimer);
    define('clearInterval', clearTimer);

    // Cầu nối gọi hàm WASM: chỉ truyền số / bigint (đúng kiểu dữ liệu của WASM core).
    define('__wasm_call', (libH, fnH, ...argHs) => {
      const lib = vm.getString(libH);
      const fnName = vm.getString(fnH);
      const fn = this.wasm.get(lib)?.[fnName];
      if (typeof fn !== 'function') return { error: vm.newError(`wasm:${lib} không có hàm "${fnName}"`) };
      try {
        const result = (fn as (...a: unknown[]) => unknown)(...argHs.map((h) => vm.dump(h)));
        if (typeof result === 'bigint') return vm.newBigInt(result);
        if (typeof result === 'number') return vm.newNumber(result);
        return vm.undefined;
      } catch (err) {
        return { error: vm.newError(`wasm:${lib}.${fnName}: ${errorText(err)}`) };
      }
    });
  }

  private loadModule(name: string) {
    if (name === 'host:inspect') return inspectSource;
    if (name.startsWith(WASM_SCHEME)) {
      const lib = name.slice(WASM_SCHEME.length);
      const exports = this.wasm.get(lib);
      if (!exports) return { error: new Error(`Không có lib "${name}" (xem wasm/libs, chạy npm run build:wasm)`) };
      const L = JSON.stringify(lib);
      return Object.keys(exports)
        .filter((n) => typeof exports[n] === 'function' && isIdentifier(n))
        .map((n) => `export const ${n} = (...a) => __wasm_call(${L}, ${JSON.stringify(n)}, ...a);`)
        .join('\n');
    }
    const code = this.req.files[name];
    if (code === undefined) return { error: new Error(`Không tìm thấy module "${name}"`) };
    return name.endsWith('.json') ? `export default ${code};` : code;
  }

  private normalizeModule(base: string, requested: string) {
    if (requested.startsWith(WASM_SCHEME) || requested.startsWith('host:')) return requested;
    if (isRelative(requested)) {
      const path = resolvePath(base, requested);
      return resolveFile(this.req.files, path) ?? path;
    }
    return {
      error: new Error(
        `QuickJS chỉ import được file trong dự án hoặc "wasm:<lib>", không hỗ trợ "${requested}". ` +
          'Muốn dùng package npm hãy chọn runtime Web Worker hoặc WebContainer.',
      ),
    };
  }

  // ---- Event loop -------------------------------------------------------

  /** Eval 1 module; resolve thành thông báo lỗi (hoặc null) khi module chạy xong (kể cả top-level await). */
  private startModule(code: string, name: string): Promise<string | null> {
    const res = this.vm.evalCode(code, name, { type: 'module' });
    if (res.error) return Promise.resolve(this.consumeError(res.error));
    const settled = this.vm.resolvePromise(res.value);
    res.value.dispose();
    this.pump();
    return settled.then((r) => {
      if (r.error) return this.consumeError(r.error);
      r.value.dispose();
      return null;
    });
  }

  private fireTimer(id: number) {
    const timer = this.timers.get(id);
    if (!timer || this.finished) return;
    if (!timer.repeat) this.timers.delete(id);
    const r = this.vm.callFunction(timer.callback, this.vm.undefined);
    if (!timer.repeat) timer.callback.dispose();
    if (r.error) this.report(this.consumeError(r.error));
    else r.value.dispose();
    this.pump();
    this.check();
  }

  private clearTimer(id: number) {
    const timer = this.timers.get(id);
    if (!timer) return;
    clearTimeout(timer.handle);
    clearInterval(timer.handle);
    timer.callback.dispose();
    this.timers.delete(id);
  }

  private pump() {
    if (this.finished) return;
    const r = this.runtime.executePendingJobs();
    if (r.error) this.report(this.consumeError(r.error));
  }

  private check() {
    if (this.finished) return;
    if (Date.now() >= this.deadline) return this.end({ ok: false, error: this.timeoutMessage() });
    if (this.runtime.hasPendingJob()) this.pump();
    if (this.mainSettled && this.timers.size === 0 && !this.runtime.hasPendingJob()) this.end({ ok: true });
  }

  private end(result: { ok: boolean; error?: string }) {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.watchdog);
    this.finish(result);
  }

  // ---- Lỗi ----------------------------------------------------------------

  private timeoutMessage() {
    return `Hết thời gian chạy (${this.req.timeoutMs}ms) — đã ngắt. Đổi giới hạn trong ⚙ Cài đặt.`;
  }

  /** Đọc lỗi từ sandbox ra chuỗi rồi dispose handle. */
  private consumeError(handle: QuickJSHandle): string {
    let text: string;
    try {
      const err = this.vm.dump(handle) as { name?: string; message?: string; stack?: string } | unknown;
      if (err && typeof err === 'object' && 'message' in err) {
        const e = err as { name?: string; message?: string; stack?: string };
        if (e.name === 'InternalError' && e.message === 'interrupted') text = this.timeoutMessage();
        else text = `${e.name ?? 'Error'}: ${e.message}${e.stack ? `\n${e.stack.trimEnd()}` : ''}`;
      } else {
        text = `Uncaught ${typeof err === 'string' ? err : JSON.stringify(err)}`;
      }
    } catch (dumpErr) {
      text = `Uncaught (không đọc được lỗi: ${errorText(dumpErr)})`;
    } finally {
      handle.dispose();
    }
    return text;
  }

  private report(text: string) {
    post({ type: 'log', level: 'error', text });
  }

  /** Trả false nếu QuickJS phát hiện rò handle (assert fail khi free runtime). */
  dispose(): boolean {
    this.finished = true;
    clearTimeout(this.watchdog);
    for (const id of [...this.timers.keys()]) this.clearTimer(id);
    try {
      this.vm.dispose();
      this.runtime.dispose();
      return true;
    } catch (err) {
      console.error('[quickjs] dispose failed', err);
      return false;
    }
  }
}
