import type { RuntimeId } from '../types';
import type { Runtime, RuntimeInfo } from './types';
import { WebContainerRuntime } from './webcontainer';
import { WorkerRuntime } from './workerRuntime';

export const RUNTIME_INFO: Record<RuntimeId, RuntimeInfo> = {
  quickjs: {
    id: 'quickjs',
    label: 'QuickJS (WASM)',
    short: 'QJS',
    color: 'grape',
    description: 'Sandbox cô lập, giới hạn bộ nhớ/thời gian. Không có DOM/fetch/npm.',
  },
  worker: {
    id: 'worker',
    label: 'Web Worker (JS gốc)',
    short: 'WRK',
    color: 'yellow',
    description: 'Engine JS của trình duyệt — nhanh nhất, có fetch/crypto, import npm qua esm.sh.',
  },
  webcontainer: {
    id: 'webcontainer',
    label: 'Node.js (WebContainer)',
    short: 'NODE',
    color: 'teal',
    description: 'Node.js + npm thật trong trình duyệt, có terminal và preview server.',
  },
};

export const RUNTIME_IDS = Object.keys(RUNTIME_INFO) as RuntimeId[];

// Runtime là singleton theo trang (WebContainer chỉ boot được 1 lần).
export const runtimes: Record<RuntimeId, Runtime> = {
  quickjs: new WorkerRuntime(
    RUNTIME_INFO.quickjs,
    () => new Worker(new URL('./quickjs.worker.ts', import.meta.url), { type: 'module', name: 'quickjs' }),
    { reuse: true, graceMs: 1500 },
  ),
  worker: new WorkerRuntime(
    RUNTIME_INFO.worker,
    () => new Worker(new URL('./native.worker.ts', import.meta.url), { type: 'module', name: 'native-js' }),
    { reuse: false, graceMs: 0 },
  ),
  webcontainer: new WebContainerRuntime(RUNTIME_INFO.webcontainer),
};
