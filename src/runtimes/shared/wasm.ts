// Nạp các lib WASM tự build (public/wasm, sinh bởi scripts/build-wasm.mjs).
// Dùng chung cho main thread và các worker.

export interface WasmLibInfo {
  name: string;
  file: string;
  exports: string[];
  imports: string[];
}

export const WASM_SCHEME = 'wasm:';

export async function loadWasmManifest(baseUrl: string): Promise<WasmLibInfo[]> {
  try {
    const res = await fetch(new URL('manifest.json', baseUrl));
    if (!res.ok) return [];
    const data = (await res.json()) as { libs?: WasmLibInfo[] };
    return data.libs ?? [];
  } catch {
    return [];
  }
}

export async function fetchWasmBytes(baseUrl: string, lib: WasmLibInfo): Promise<Uint8Array> {
  const res = await fetch(new URL(lib.file, baseUrl));
  if (!res.ok) throw new Error(`Không tải được ${lib.file} (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Instantiate "dễ dãi": module không import gì là tốt nhất (Rust wasm32-unknown-unknown,
 * Emscripten -sSTANDALONE_WASM --no-entry, .wat viết tay...). Nếu có import, ta cấp stub
 * để link được — hàm stub trả 0, memory/table tạo mới. Cần glue JS đầy đủ thì hãy
 * dùng runtime Web Worker và import thẳng file JS do toolchain sinh ra.
 */
export async function instantiateWasm(bytes: Uint8Array): Promise<WebAssembly.Exports> {
  const module = await WebAssembly.compile(bytes as BufferSource);
  const imports: WebAssembly.Imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    const ns = (imports[imp.module] ??= {});
    if (imp.kind === 'function') ns[imp.name] = () => 0;
    else if (imp.kind === 'memory') ns[imp.name] = new WebAssembly.Memory({ initial: 256 });
    else if (imp.kind === 'table') ns[imp.name] = new WebAssembly.Table({ initial: 4096, element: 'anyfunc' });
  }
  const instance = await WebAssembly.instantiate(module, imports);
  // WASI reactor / Emscripten --no-entry cần gọi _initialize trước khi dùng.
  const init = instance.exports._initialize;
  if (typeof init === 'function') (init as () => void)();
  return instance.exports;
}

export async function loadWasmLib(baseUrl: string, lib: WasmLibInfo): Promise<WebAssembly.Exports> {
  return instantiateWasm(await fetchWasmBytes(baseUrl, lib));
}

export const isIdentifier = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name);
