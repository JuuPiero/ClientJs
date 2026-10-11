import type { FileMap } from '../../types';

/** "a/./b/../c.js" -> "a/c.js" (không có "/" đầu) */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function isRelative(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
}

export function resolvePath(from: string, spec: string): string {
  return normalizePath(spec.startsWith('/') ? spec : `${dirname(from)}/${spec}`);
}

/** Tìm file thật trong dự án, thử thêm đuôi như Node/bundler: x -> x.js -> x/index.js */
export function resolveFile(files: FileMap, path: string): string | null {
  for (const candidate of [path, `${path}.js`, `${path}.mjs`, `${path}.json`, `${path}/index.js`]) {
    if (files[candidate] !== undefined) return candidate;
  }
  return null;
}

/** Bắt specifier trong import/export tĩnh và import() động. Đủ dùng cho playground, không phải parser đầy đủ. */
export const IMPORT_RE =
  /(\bimport\s*(?:[^'"`;()]*?\bfrom\s*)?|\bexport\s*(?:\*\s+as\s+[\w$]+|\*|\{[^}]*\})\s*from\s*|\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g;

export function findImports(code: string): string[] {
  return [...code.matchAll(IMPORT_RE)].map((m) => m[3]);
}
