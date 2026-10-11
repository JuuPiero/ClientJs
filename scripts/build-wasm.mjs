// Gom các lib WASM trong wasm/libs vào public/wasm + sinh manifest.json.
//   *.wat  -> biên dịch bằng wabt (không cần cài toolchain native)
//   *.wasm -> copy nguyên trạng (output từ Emscripten, Rust, Zig, AssemblyScript...)
// Tên lib = tên file không đuôi; code dùng nó qua `import { ... } from "wasm:<tên>"`.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initWabt from 'wabt';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'wasm', 'libs');
const outDir = join(root, 'public', 'wasm');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const wabt = await initWabt();
const libs = [];
const entries = (await readdir(srcDir)).filter((f) => ['.wat', '.wasm'].includes(extname(f))).sort();

for (const file of entries) {
  const name = basename(file, extname(file));
  const src = await readFile(join(srcDir, file));
  let bytes;

  if (extname(file) === '.wat') {
    const mod = wabt.parseWat(file, src);
    try {
      mod.resolveNames();
      mod.validate();
      bytes = mod.toBinary({ log: false }).buffer;
    } finally {
      mod.destroy();
    }
  } else {
    bytes = src;
  }

  const compiled = await WebAssembly.compile(bytes);
  const exports = WebAssembly.Module.exports(compiled)
    .filter((e) => e.kind === 'function')
    .map((e) => e.name);
  const imports = WebAssembly.Module.imports(compiled).map((i) => `${i.module}.${i.name}`);

  await writeFile(join(outDir, `${name}.wasm`), bytes);
  libs.push({ name, file: `${name}.wasm`, exports, imports });
  console.log(`[wasm] ${file} -> public/wasm/${name}.wasm  (exports: ${exports.join(', ') || '—'})`);
}

await writeFile(join(outDir, 'manifest.json'), JSON.stringify({ libs }, null, 2));
console.log(`[wasm] ${libs.length} lib -> public/wasm/manifest.json`);
