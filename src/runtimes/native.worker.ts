// Chạy code bằng engine JS gốc của trình duyệt trong 1 Web Worker (tạo mới mỗi lần Run).
// File của dự án được biến thành các blob: URL; specifier trong import được viết lại:
//   "./x.js"     -> blob của file x.js trong dự án
//   "wasm:math"  -> module bọc lib WASM tự build
//   "nanoid"     -> https://esm.sh/nanoid
import { formatArgs } from './shared/inspect.js';
import { IMPORT_RE, isRelative, resolveFile, resolvePath } from './shared/paths';
import type { LogLevel, RunRequest, WorkerMessage } from './shared/protocol';
import { isIdentifier, loadWasmLib, WASM_SCHEME } from './shared/wasm';

const post = (msg: WorkerMessage) => self.postMessage(msg);

// Stack trace chứa blob:URL khó đọc => thay bằng tên file trong dự án.
const blobNames = new Map<string, string>();
const prettify = (text: string) => {
  for (const [url, name] of blobNames) text = text.replaceAll(url, name);
  return text;
};
const log = (level: LogLevel, args: unknown[]) => post({ type: 'log', level, text: prettify(formatArgs(args)) });

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  console[level] = (...args: unknown[]) => log(level, args);
}
console.trace = (...args: unknown[]) => log('debug', args);
console.dir = (value: unknown) => log('log', [value]);
console.table = (...args: unknown[]) => log('log', args);

self.addEventListener('error', (e) => {
  e.preventDefault();
  log('error', [e.error ?? e.message]);
});
self.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  log('error', ['Uncaught (in promise)', e.reason]);
});

// ---- Theo dõi timer để biết khi nào chương trình "xong" ----------------------
const pending = new Set<number>();
let started = 0;
let moduleDone = false;
let reported = false;

const native = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
};

function scheduleIdleCheck() {
  // Chờ 1 macrotask để microtask (promise) còn lại chạy hết.
  native.setTimeout(() => {
    if (moduleDone && pending.size === 0 && !reported) {
      reported = true;
      post({ type: 'done', ok: true, durationMs: performance.now() - started });
    }
  }, 0);
}

Object.assign(globalThis, {
  setTimeout(handler: TimerHandler, ms?: number, ...args: unknown[]) {
    const id = native.setTimeout(() => {
      pending.delete(id);
      try {
        if (typeof handler === 'function') handler(...args);
      } finally {
        scheduleIdleCheck();
      }
    }, ms);
    pending.add(id);
    return id;
  },
  setInterval(handler: TimerHandler, ms?: number, ...args: unknown[]) {
    const id = native.setInterval(handler, ms, ...args);
    pending.add(id);
    return id;
  },
  clearTimeout(id?: number) {
    if (id === undefined) return;
    pending.delete(id);
    native.clearTimeout(id);
    scheduleIdleCheck();
  },
  clearInterval(id?: number) {
    if (id === undefined) return;
    pending.delete(id);
    native.clearInterval(id);
    scheduleIdleCheck();
  },
});

// ---- Dựng đồ thị module ------------------------------------------------------
async function buildModuleGraph(req: RunRequest): Promise<string> {
  const urls = new Map<string, string>();

  const toBlobUrl = (code: string, name: string) => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    blobNames.set(url, name);
    return url;
  };

  async function wasmModule(name: string): Promise<string> {
    const key = WASM_SCHEME + name;
    const cached = urls.get(key);
    if (cached) return cached;
    const lib = req.wasmLibs.find((l) => l.name === name);
    if (!lib) throw new Error(`Không có lib "${key}" (xem wasm/libs, chạy npm run build:wasm)`);
    const exports = await loadWasmLib(req.wasmBase, lib);
    const globalKey = `__${key}`;
    (globalThis as Record<string, unknown>)[globalKey] = exports;
    const names = Object.keys(exports).filter(isIdentifier);
    const src =
      `const m = globalThis[${JSON.stringify(globalKey)}];\nexport default m;\n` +
      (names.length ? `export const { ${names.join(', ')} } = m;\n` : '');
    const url = toBlobUrl(src, key);
    urls.set(key, url);
    return url;
  }

  async function resolveSpecifier(from: string, spec: string, chain: string[]): Promise<string> {
    if (spec.startsWith(WASM_SCHEME)) return wasmModule(spec.slice(WASM_SCHEME.length));
    if (isRelative(spec)) {
      const path = resolveFile(req.files, resolvePath(from, spec));
      if (!path) throw new Error(`Không tìm thấy "${spec}" (import từ ${from})`);
      return load(path, chain);
    }
    if (/^(https?:|data:|blob:)/.test(spec)) return spec;
    return `https://esm.sh/${spec}`;
  }

  async function load(path: string, chain: string[]): Promise<string> {
    if (chain.includes(path)) {
      throw new Error(`Import vòng chưa được hỗ trợ ở runtime Web Worker: ${[...chain, path].join(' → ')}`);
    }
    const cached = urls.get(path);
    if (cached) return cached;

    const code = req.files[path] ?? '';
    let out: string;
    if (path.endsWith('.json')) {
      out = `export default ${code};`;
    } else {
      // Resolve tuần tự: đơn giản, và phát hiện được import vòng.
      const targets: string[] = [];
      for (const m of code.matchAll(IMPORT_RE)) targets.push(await resolveSpecifier(path, m[3], [...chain, path]));
      let i = 0;
      out = code.replace(IMPORT_RE, (_m, head: string, quote: string) => `${head}${quote}${targets[i++]}${quote}`);
    }
    const url = toBlobUrl(`${out}\n//# sourceURL=${path}`, path);
    urls.set(path, url);
    return url;
  }

  return load(req.entry, []);
}

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  if (event.data?.type !== 'run') return;
  started = performance.now();
  try {
    const entryUrl = await buildModuleGraph(event.data);
    await import(/* @vite-ignore */ entryUrl);
    moduleDone = true;
    scheduleIdleCheck();
  } catch (err) {
    reported = true;
    post({ type: 'done', ok: false, error: prettify(formatArgs([err])), durationMs: performance.now() - started });
  }
};
