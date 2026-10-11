// Node.js thật (WebContainer của StackBlitz) chạy trong trình duyệt.
// Yêu cầu trang cross-origin isolated (COOP/COEP). Mỗi trang chỉ boot được 1 instance,
// mỗi dự án được mount vào thư mục riêng p-<id> nên node_modules được giữ lại giữa các lần chạy.
import { WebContainer, type DirectoryNode, type FileSystemTree, type WebContainerProcess } from '@webcontainer/api';
import type { Project } from '../types';
import { fetchWasmBytes } from './shared/wasm';
import type { OutputSink, RunContext, RunResult, Runtime, RuntimeInfo } from './types';
import { getWasmManifest, wasmBaseUrl } from './workerRuntime';

export class WebContainerRuntime implements Runtime {
  interactive = true;
  private boot: Promise<WebContainer> | null = null;
  private runProc: WebContainerProcess | null = null;
  private shellProc: WebContainerProcess | null = null;
  private writers = new WeakMap<WebContainerProcess, WritableStreamDefaultWriter<string>>();
  /** thư mục -> chuỗi hash dependencies đã cài */
  private installed = new Map<string, string>();
  /** thư mục -> danh sách file đã mount (để xoá file người dùng đã xoá) */
  private mounted = new Map<string, Set<string>>();
  private wasmBytes = new Map<string, Uint8Array>();
  private onPreview: RunContext['onPreview'] = () => {};
  private stopping = false;

  constructor(public info: RuntimeInfo) {}

  unavailableReason() {
    if (!globalThis.crossOriginIsolated) {
      return 'Trang chưa cross-origin isolated (thiếu header COOP/COEP). Chạy bằng `npm run dev` hoặc xem README phần deploy.';
    }
    return null;
  }

  private container(out: OutputSink): Promise<WebContainer> {
    if (!this.boot) {
      out.info('Đang khởi động WebContainer (lần đầu mất vài giây)…');
      this.boot = WebContainer.boot({ coep: 'require-corp', workdirName: 'clientjs' }).then((wc) => {
        wc.on('server-ready', (port, url) => this.onPreview(url, port));
        wc.on('port', (_port, type) => {
          if (type === 'close') this.onPreview(null);
        });
        return wc;
      });
      this.boot.catch(() => (this.boot = null));
    }
    return this.boot;
  }

  async run(ctx: RunContext): Promise<RunResult> {
    const started = performance.now();
    const elapsed = () => performance.now() - started;
    const stopped = (): RunResult => ({ ok: false, stopped: true, error: 'Đã dừng', durationMs: elapsed() });

    this.runProc?.kill();
    this.stopping = false;
    this.onPreview = ctx.onPreview;

    const wc = await this.container(ctx.out);
    const dir = projectDir(ctx.project);
    await this.sync(wc, dir, ctx.project);
    if (this.stopping) return stopped();

    const deps = dependencyKey(ctx.project.files['package.json']);
    if (deps && this.installed.get(dir) !== deps) {
      ctx.out.info('npm install');
      const code = await this.exec(wc, 'npm', ['install', '--no-audit', '--no-fund'], dir, ctx);
      if (this.stopping) return stopped();
      if (code !== 0) return { ok: false, error: `npm install lỗi (exit ${code})`, durationMs: elapsed() };
      this.installed.set(dir, deps);
    }

    ctx.out.info(`node ${ctx.project.entry}`);
    const code = await this.exec(wc, 'node', [ctx.project.entry], dir, ctx);
    if (this.stopping) return stopped();
    return code === 0
      ? { ok: true, durationMs: elapsed() }
      : { ok: false, error: `Process thoát với mã ${code}`, durationMs: elapsed() };
  }

  /** Mở shell `jsh` tương tác trong thư mục dự án. */
  async openShell(ctx: RunContext) {
    this.onPreview = ctx.onPreview;
    const wc = await this.container(ctx.out);
    const dir = projectDir(ctx.project);
    await this.sync(wc, dir, ctx.project);
    this.shellProc?.kill();
    const proc = await wc.spawn('jsh', { cwd: dir, terminal: ctx.terminalSize() });
    this.shellProc = proc;
    proc.output.pipeTo(new WritableStream({ write: (data) => ctx.out.write(data) })).catch(() => {});
    proc.exit.then(() => {
      if (this.shellProc === proc) this.shellProc = null;
    });
  }

  stop() {
    this.stopping = true;
    this.runProc?.kill();
  }

  write(data: string) {
    const proc = this.runProc ?? this.shellProc;
    if (!proc) return;
    let writer = this.writers.get(proc);
    if (!writer) {
      writer = proc.input.getWriter();
      this.writers.set(proc, writer);
    }
    writer.write(data).catch(() => {});
  }

  resize(cols: number, rows: number) {
    this.runProc?.resize({ cols, rows });
    this.shellProc?.resize({ cols, rows });
  }

  private async exec(wc: WebContainer, cmd: string, args: string[], cwd: string, ctx: RunContext) {
    const proc = await wc.spawn(cmd, args, { cwd, terminal: ctx.terminalSize() });
    this.runProc = proc;
    if (this.stopping) proc.kill();
    proc.output.pipeTo(new WritableStream({ write: (data) => ctx.out.write(data) })).catch(() => {});
    const code = await proc.exit;
    if (this.runProc === proc) this.runProc = null;
    return code;
  }

  /** Đồng bộ file dự án (+ lib WASM tự build vào ./wasm) vào container. */
  private async sync(wc: WebContainer, dir: string, project: Project) {
    await wc.fs.mkdir(dir, { recursive: true });
    for (const path of this.mounted.get(dir) ?? []) {
      if (project.files[path] === undefined) await wc.fs.rm(`${dir}/${path}`, { force: true }).catch(() => {});
    }

    const tree: FileSystemTree = {};
    for (const [path, content] of Object.entries(project.files)) addToTree(tree, path, content);
    for (const lib of await getWasmManifest()) {
      const path = `wasm/${lib.file}`;
      if (project.files[path] !== undefined) continue;
      let bytes = this.wasmBytes.get(lib.file);
      if (!bytes) {
        bytes = await fetchWasmBytes(wasmBaseUrl(), lib);
        this.wasmBytes.set(lib.file, bytes);
      }
      addToTree(tree, path, bytes);
    }

    await wc.mount(tree, { mountPoint: dir });
    this.mounted.set(dir, new Set(Object.keys(project.files)));
  }
}

const projectDir = (p: Project) => `p-${p.id}`;

function dependencyKey(packageJson: string | undefined): string | null {
  if (!packageJson) return null;
  try {
    const pkg = JSON.parse(packageJson) as { dependencies?: object; devDependencies?: object };
    const key = JSON.stringify([pkg.dependencies ?? {}, pkg.devDependencies ?? {}]);
    return key === '[{},{}]' ? null : key;
  } catch {
    return null;
  }
}

function addToTree(tree: FileSystemTree, path: string, contents: string | Uint8Array) {
  const parts = path.split('/');
  let node = tree;
  for (const name of parts.slice(0, -1)) {
    const existing = node[name];
    if (!existing || !('directory' in existing)) node[name] = { directory: {} };
    node = (node[name] as DirectoryNode).directory;
  }
  node[parts[parts.length - 1]] = { file: { contents } };
}
