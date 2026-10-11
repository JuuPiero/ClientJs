// Điều phối Run/Stop/Shell giữa store, runtime và terminal.
import { create } from 'zustand';
import { runtimes } from './runtimes';
import { errorText, type LogLevel } from './runtimes/shared/protocol';
import type { OutputSink, RunContext, RunResult } from './runtimes/types';
import { useAppStore } from './store/appStore';
import { flushStorage } from './store/storage';
import type { Project, RuntimeId } from './types';

export type RunStatus = 'idle' | 'running' | 'ok' | 'error' | 'stopped';

interface RunState {
  status: RunStatus;
  runtime: RuntimeId | null;
  durationMs?: number;
  error?: string;
  previewUrl: string | null;
  previewPort?: number;
}

export const useRunState = create<RunState>(() => ({ status: 'idle', runtime: null, previewUrl: null }));

// ---- Terminal -----------------------------------------------------------------

export interface TerminalApi {
  write(data: string): void;
  clear(): void;
  size(): { cols: number; rows: number };
}

let terminal: TerminalApi | null = null;
export const attachTerminal = (t: TerminalApi | null) => (terminal = t);
export const clearTerminal = () => terminal?.clear();

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const LEVEL_COLOR: Record<LogLevel, string> = { log: '', info: C.cyan, warn: C.yellow, error: C.red, debug: C.gray };

const out: OutputSink = {
  write: (data) => terminal?.write(data),
  log: (level, text) => terminal?.write(LEVEL_COLOR[level] ? `${LEVEL_COLOR[level]}${text}${C.reset}\n` : `${text}\n`),
  info: (text) => terminal?.write(`${C.gray}› ${text}${C.reset}\n`),
};

export const formatDuration = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);

// ---- Run / Stop -----------------------------------------------------------------

function currentProject(): Project | null {
  const { currentId, projects } = useAppStore.getState();
  return currentId ? (projects[currentId] ?? null) : null;
}

function context(project: Project): RunContext {
  return {
    project,
    settings: useAppStore.getState().settings,
    out,
    terminalSize: () => terminal?.size() ?? { cols: 80, rows: 24 },
    onPreview: (url, port) => useRunState.setState({ previewUrl: url, previewPort: port }),
  };
}

let runToken = 0;

export async function runCurrent() {
  const project = currentProject();
  if (!project) return;
  const runtime = runtimes[project.runtime];
  const token = ++runToken;

  for (const other of Object.values(runtimes)) if (other !== runtime) other.stop();
  flushStorage();
  clearTerminal();

  const reason = runtime.unavailableReason();
  if (reason) {
    out.log('error', reason);
    useRunState.setState({ status: 'error', runtime: project.runtime, error: reason });
    return;
  }

  out.info(`${runtime.info.label} · ${project.entry}`);
  useRunState.setState({ status: 'running', runtime: project.runtime, error: undefined, durationMs: undefined });

  let result: RunResult;
  try {
    result = await runtime.run(context(project));
  } catch (err) {
    result = { ok: false, error: errorText(err), durationMs: 0 };
  }
  if (token !== runToken) return; // đã có lần Run mới hơn

  if (result.ok) out.write(`${C.green}✓ Xong${C.reset} ${C.gray}(${formatDuration(result.durationMs)})${C.reset}\n`);
  else if (result.stopped) out.info('Đã dừng');
  else out.log('error', `✗ ${result.error ?? 'Lỗi không xác định'}`);

  useRunState.setState({
    status: result.ok ? 'ok' : result.stopped ? 'stopped' : 'error',
    durationMs: result.durationMs,
    error: result.error,
  });
}

export function stopCurrent() {
  const { runtime } = useRunState.getState();
  if (runtime) runtimes[runtime].stop();
}

export async function openShell() {
  const project = currentProject();
  const runtime = project && runtimes[project.runtime];
  if (!project || !runtime?.openShell) return;
  const reason = runtime.unavailableReason();
  if (reason) return out.log('error', reason);
  try {
    await runtime.openShell(context(project));
  } catch (err) {
    out.log('error', errorText(err));
  }
}

/** Phím gõ trong terminal -> process đang chạy (chỉ runtime tương tác). */
export function sendTerminalInput(data: string) {
  const project = currentProject();
  const runtime = project && runtimes[project.runtime];
  if (runtime?.interactive) runtime.write?.(data);
}

export function resizeTerminal(cols: number, rows: number) {
  for (const runtime of Object.values(runtimes)) runtime.resize?.(cols, rows);
}
