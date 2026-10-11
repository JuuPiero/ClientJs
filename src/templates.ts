import type { FileMap, RuntimeId } from './types';

export interface Template {
  id: string;
  runtime: RuntimeId;
  name: string;
  description: string;
  entry: string;
  files: FileMap;
}

const pkg = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name, version: '1.0.0', private: true, type: 'module', ...extra }, null, 2) + '\n';

export const TEMPLATES: Template[] = [
  // ---------------------------------------------------------------- QuickJS
  {
    id: 'quickjs-hello',
    runtime: 'quickjs',
    name: 'Hello QuickJS',
    description: 'Module, top-level await, setTimeout, console — trong sandbox WASM.',
    entry: 'main.js',
    files: {
      'main.js': `// QuickJS chạy trong WebAssembly, cô lập hoàn toàn với trang:
// không có DOM, fetch hay biến của app. Chỉ có những API mà host cấp vào:
//   console.*, setTimeout/setInterval, import file trong dự án, import "wasm:<lib>"
import { greet } from './lib/greet.js';
import config from './config.json';

console.log(greet(config.name));
console.log({ engine: 'QuickJS', features: config.features });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let i = 1; i <= 3; i++) {
  await sleep(300);
  console.info(\`tick \${i}\`);
}

console.warn('typeof window =', typeof window);
console.error(new Error('Lỗi mẫu — sandbox vẫn chạy tiếp'));
console.log(new Map([['a', 1], ['b', [1, 2, 3]]]), new Set(['x', 'y']));
`,
      'lib/greet.js': `export const greet = (name) => \`Xin chào \${name} 👋\`;
`,
      'config.json': `{
  "name": "QuickJS",
  "features": ["ES2023", "module", "top-level await"]
}
`,
    },
  },
  {
    id: 'quickjs-wasm',
    runtime: 'quickjs',
    name: 'Gọi lib WASM tự build',
    description: 'import từ "wasm:math" (wasm/libs/math.wat) + benchmark JS vs WASM.',
    entry: 'main.js',
    files: {
      'main.js': `// Lib WASM nằm ở wasm/libs/*.wat|*.wasm, build bằng \`npm run build:wasm\`.
// QuickJS là interpreter nên code nặng nên đẩy sang WASM (chạy bằng JIT của trình duyệt).
import { add, fib, fibRec, isPrime } from 'wasm:math';

console.log('add(2, 3) =', add(2, 3));
console.log('fib(78) =', fib(78));
console.log('Số nguyên tố < 60:', Array.from({ length: 60 }, (_, i) => i).filter((n) => isPrime(n)));

const fibJs = (n) => (n < 2 ? n : fibJs(n - 1) + fibJs(n - 2));
const N = 25;

let t = Date.now();
const a = fibJs(N);
console.log(\`JS   (QuickJS) fibRec(\${N}) = \${a}  \${Date.now() - t}ms\`);

t = Date.now();
const b = fibRec(N);
console.log(\`WASM           fibRec(\${N}) = \${b}  \${Date.now() - t}ms\`);
`,
    },
  },
  {
    id: 'quickjs-limits',
    runtime: 'quickjs',
    name: 'Giới hạn tài nguyên',
    description: 'Memory limit + interrupt: code lỗi không thể treo tab.',
    entry: 'main.js',
    files: {
      'main.js': `// QuickJS có memory limit + interrupt handler (chỉnh trong ⚙ Cài đặt).
console.log('1) Cấp phát vô hạn...');
try {
  const chunks = [];
  while (true) chunks.push(new Array(100_000).fill(Math.random()));
} catch (err) {
  console.error('→ bị chặn:', String(err));
}

console.log('2) Vòng lặp vô hạn — sẽ bị ngắt khi hết thời gian cho phép...');
while (true) {}
`,
    },
  },
  {
    id: 'quickjs-blank',
    runtime: 'quickjs',
    name: 'Trống',
    description: 'Chỉ có main.js.',
    entry: 'main.js',
    files: { 'main.js': `console.log('Hello!');\n` },
  },

  // ---------------------------------------------------------------- Web Worker
  {
    id: 'worker-hello',
    runtime: 'worker',
    name: 'Hello Web Worker',
    description: 'Engine JS gốc của trình duyệt: fetch, crypto, import npm qua esm.sh.',
    entry: 'main.js',
    files: {
      'main.js': `// Chạy bằng engine gốc của trình duyệt (V8 / SpiderMonkey / JSC) trong 1 Web Worker riêng:
// nhanh nhất, có sẵn fetch, crypto, TextEncoder, WebAssembly... nhưng không có DOM.
// Import tên package (vd. "nanoid") sẽ được tải từ https://esm.sh
import { stats } from './lib/stats.js';
import { nanoid } from 'nanoid';

console.log('nanoid():', nanoid());
console.log('crypto.randomUUID():', crypto.randomUUID());

const data = Array.from({ length: 12 }, () => Math.round(Math.random() * 100));
console.log('data:', data);
console.log('stats:', stats(data));

try {
  const res = await fetch('https://api.github.com/zen');
  console.info('GitHub zen:', await res.text());
} catch (err) {
  console.warn('fetch lỗi (offline?):', err.message);
}

setTimeout(() => console.log('…và timer vẫn chạy sau khi module xong'), 500);
`,
      'lib/stats.js': `export function stats(xs) {
  const sum = xs.reduce((a, b) => a + b, 0);
  const mean = sum / xs.length;
  const sd = Math.sqrt(xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / xs.length);
  return { n: xs.length, sum, mean: +mean.toFixed(2), min: Math.min(...xs), max: Math.max(...xs), sd: +sd.toFixed(2) };
}
`,
    },
  },
  {
    id: 'worker-wasm',
    runtime: 'worker',
    name: 'WASM trong Worker',
    description: 'Cùng lib "wasm:math", benchmark với JIT của trình duyệt.',
    entry: 'main.js',
    files: {
      'main.js': `import { fib, fibRec, isPrime } from 'wasm:math';

console.log('fib(50) =', fib(50));
console.log('isPrime(2147483647) =', Boolean(isPrime(2147483647)));

const fibJs = (n) => (n < 2 ? n : fibJs(n - 1) + fibJs(n - 2));
for (const [label, fn] of [['JS  ', fibJs], ['WASM', fibRec]]) {
  const t = performance.now();
  const r = fn(32);
  console.log(\`\${label} fibRec(32) = \${r}  \${(performance.now() - t).toFixed(1)}ms\`);
}
`,
    },
  },
  {
    id: 'worker-blank',
    runtime: 'worker',
    name: 'Trống',
    description: 'Chỉ có main.js.',
    entry: 'main.js',
    files: { 'main.js': `console.log('Hello!');\n` },
  },

  // ---------------------------------------------------------------- WebContainer
  {
    id: 'node-hello',
    runtime: 'webcontainer',
    name: 'Hello Node.js',
    description: 'Node.js thật chạy trong trình duyệt (WebContainer).',
    entry: 'index.js',
    files: {
      'index.js': `import os from 'node:os';
import { readFile } from 'node:fs/promises';

console.log(\`Node \${process.version} — \${os.platform()}/\${os.arch()}\`);
console.log('cwd:', process.cwd());

const pkg = JSON.parse(await readFile('./package.json', 'utf8'));
console.log('package.json name:', pkg.name);
`,
      'package.json': pkg('node-hello'),
    },
  },
  {
    id: 'node-npm',
    runtime: 'webcontainer',
    name: 'Dùng package npm',
    description: 'npm install ngay trong trình duyệt (chalk, nanoid, dayjs).',
    entry: 'index.js',
    files: {
      'index.js': `import chalk from 'chalk';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';

console.log(chalk.green.bold('✔ npm install chạy ngay trong trình duyệt'));
console.log(chalk.cyan('nanoid:'), nanoid());
console.log(chalk.yellow('dayjs:'), dayjs().format('DD/MM/YYYY HH:mm:ss'));
`,
      'package.json': pkg('node-npm', {
        dependencies: { chalk: '^5.4.1', dayjs: '^1.11.13', nanoid: '^5.1.5' },
      }),
    },
  },
  {
    id: 'node-express',
    runtime: 'webcontainer',
    name: 'Express server + preview',
    description: 'HTTP server trong WebContainer, xem trực tiếp ở khung preview.',
    entry: 'index.js',
    files: {
      'index.js': `import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send(\`<!doctype html>
    <body style="font-family: system-ui; padding: 24px">
      <h1>Hello từ Express trong WebContainer 🚀</h1>
      <p>Render lúc \${new Date().toLocaleTimeString()}</p>
      <a href="/api">/api</a>
    </body>\`);
});

app.get('/api', (req, res) => res.json({ ok: true, node: process.version, time: Date.now() }));

app.listen(3000, () => console.log('Server chạy ở cổng 3000'));
`,
      'package.json': pkg('node-express', { dependencies: { express: '^5.1.0' } }),
    },
  },
  {
    id: 'node-wasm',
    runtime: 'webcontainer',
    name: 'WASM trong Node.js',
    description: 'Thư mục wasm/ (lib tự build) được tự mount vào container.',
    entry: 'index.js',
    files: {
      'index.js': `// Mỗi lần Run, app copy public/wasm/*.wasm vào ./wasm của container.
import { readFile } from 'node:fs/promises';

const { instance } = await WebAssembly.instantiate(await readFile('./wasm/math.wasm'));
const { fib, isPrime, add } = instance.exports;

console.log('add(40, 2) =', add(40, 2));
console.log('fib(60) =', fib(60));
console.log('isPrime(7919) =', Boolean(isPrime(7919)));
`,
      'package.json': pkg('node-wasm'),
    },
  },
  {
    id: 'node-blank',
    runtime: 'webcontainer',
    name: 'Trống',
    description: 'index.js + package.json.',
    entry: 'index.js',
    files: {
      'index.js': `console.log('Hello from Node', process.version);\n`,
      'package.json': pkg('my-app'),
    },
  },
];

export const templatesFor = (runtime: RuntimeId) => TEMPLATES.filter((t) => t.runtime === runtime);
export const findTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);

/** Dự án mẫu tạo sẵn lần đầu mở app. */
export const SEED_TEMPLATES = ['quickjs-hello', 'quickjs-wasm', 'worker-hello', 'node-express'];
