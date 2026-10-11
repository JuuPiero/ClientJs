// Bundle Monaco ngay trong app (không tải từ CDN — trang dùng COEP nên CDN dễ bị chặn,
// và chạy được offline). Mỗi file là 1 model với URI file:///<projectId>/<path>
// => giữ undo/cursor riêng từng file, và TS worker hiểu import tương đối giữa các file.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { isIdentifier, type WasmLibInfo } from './runtimes/shared/wasm';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new JsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker();
      case 'typescript':
      case 'javascript':
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

const { typescript: ts } = monaco;
const compilerOptions: monaco.typescript.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  allowJs: true,
  checkJs: false,
  allowNonTsExtensions: true,
  resolveJsonModule: true,
  // "force": mọi file là module => top-level await không bị báo lỗi
  moduleDetection: 3,
};
ts.javascriptDefaults.setCompilerOptions(compilerOptions);
ts.typescriptDefaults.setCompilerOptions(compilerOptions);
ts.javascriptDefaults.setEagerModelSync(true);

loader.config({ monaco });

export const modelUri = (projectId: string, path: string) => `file:///${projectId}/${path}`;

export function pathFromUri(uri: monaco.Uri): { projectId: string; path: string } {
  const [, projectId, ...rest] = uri.path.split('/');
  return { projectId, path: rest.join('/') };
}

/** Xoá model của file đã xoá/đổi tên (hoặc cả dự án nếu không truyền paths). */
export function disposeModels(projectId: string, paths?: string[]) {
  for (const model of monaco.editor.getModels()) {
    const info = pathFromUri(model.uri);
    if (info.projectId === projectId && (!paths || paths.includes(info.path))) model.dispose();
  }
}

export function disposeAllModels() {
  for (const model of monaco.editor.getModels()) model.dispose();
}

/** Khai báo kiểu cho `import ... from "wasm:<lib>"` để có gợi ý code. */
export function setWasmTypings(libs: WasmLibInfo[]) {
  const dts = libs
    .map((lib) => {
      const fns = lib.exports.filter(isIdentifier).map((n) => `  export function ${n}(...args: number[]): number;`);
      return `declare module 'wasm:${lib.name}' {\n${fns.join('\n')}\n}`;
    })
    .join('\n');
  ts.javascriptDefaults.addExtraLib(dts, 'file:///__types__/wasm-libs.d.ts');
  ts.typescriptDefaults.addExtraLib(dts, 'file:///__types__/wasm-libs.d.ts');
}
