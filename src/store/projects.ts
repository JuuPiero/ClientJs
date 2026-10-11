// Hàm thuần xử lý Project: tạo, chuẩn hoá, export/import, thao tác đường dẫn file.
import { findTemplate } from '../templates';
import type { FileMap, Project, RuntimeId } from '../types';

const EXPORT_FORMAT = 'clientjs-project';
const RUNTIMES: RuntimeId[] = ['quickjs', 'worker', 'webcontainer'];

export function uid(): string {
  return globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
}

export function newProject(name: string, runtime: RuntimeId, files: FileMap, entry: string): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    runtime,
    files: { ...files },
    entry,
    openFiles: [entry],
    activeFile: entry,
    createdAt: now,
    updatedAt: now,
  };
}

export function projectFromTemplate(templateId: string, name?: string): Project {
  const t = findTemplate(templateId);
  if (!t) throw new Error(`Không có template ${templateId}`);
  return newProject(name ?? t.name, t.runtime, t.files, t.entry);
}

/** Vá dữ liệu cũ/hỏng (import, localStorage bị sửa tay) để UI không phải kiểm tra từng trường. */
export function normalizeProject(p: Partial<Project>): Project {
  const files: FileMap = {};
  for (const [path, content] of Object.entries(p.files ?? {})) {
    const clean = cleanPath(path);
    if (clean && typeof content === 'string') files[clean] = content;
  }
  const paths = Object.keys(files);
  const entry = p.entry && files[p.entry] !== undefined ? p.entry : (paths[0] ?? 'main.js');
  if (files[entry] === undefined) files[entry] = '';
  const openFiles = (p.openFiles ?? []).filter((f) => files[f] !== undefined);
  return {
    id: String(p.id ?? uid()),
    name: String(p.name ?? 'Untitled'),
    runtime: p.runtime && RUNTIMES.includes(p.runtime) ? p.runtime : 'quickjs',
    files,
    entry,
    openFiles: openFiles.length ? openFiles : [entry],
    activeFile: p.activeFile && files[p.activeFile] !== undefined ? p.activeFile : entry,
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Date.now(),
  };
}

export function exportProjects(projects: Project[]): string {
  return JSON.stringify(
    { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), projects },
    null,
    2,
  );
}

/** Đọc file export (1 hoặc nhiều dự án). Luôn cấp id mới để không đè dự án đang có. */
export function parseProjectsExport(text: string): Project[] {
  const data = JSON.parse(text) as { format?: string; projects?: unknown };
  if (data.format !== EXPORT_FORMAT || !Array.isArray(data.projects) || data.projects.length === 0) {
    throw new Error('File không đúng định dạng export của ClientJS.');
  }
  return data.projects.map((raw) => ({ ...normalizeProject(raw as Partial<Project>), id: uid(), updatedAt: Date.now() }));
}

// ---- Đường dẫn ---------------------------------------------------------------

/** " /a//b/./c.js " -> "a/b/c.js"; trả "" nếu không hợp lệ */
export function cleanPath(path: string): string {
  const parts = path
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s && s !== '.');
  if (parts.some((s) => s === '..')) return '';
  return parts.join('/');
}

export function validateNewPath(files: FileMap, path: string, oldPath?: string): string | null {
  const clean = cleanPath(path);
  if (!clean) return 'Tên không hợp lệ';
  if (clean !== oldPath && files[clean] !== undefined) return 'Đã có file trùng tên';
  if (Object.keys(files).some((f) => f !== oldPath && clean.startsWith(`${f}/`))) return 'Trùng với tên file đang có';
  if (Object.keys(files).some((f) => f.startsWith(`${clean}/`) && !(oldPath && f.startsWith(`${oldPath}/`)))) {
    return 'Đã có thư mục trùng tên';
  }
  return null;
}

/** Đổi tên file hoặc thư mục (mọi path có tiền tố `from/`). Trả map path cũ -> path mới. */
export function renamePaths(files: FileMap, from: string, to: string): Record<string, string> {
  const moves: Record<string, string> = {};
  for (const path of Object.keys(files)) {
    if (path === from) moves[path] = to;
    else if (path.startsWith(`${from}/`)) moves[path] = to + path.slice(from.length);
  }
  return moves;
}

export function languageOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
  };
  return map[ext] ?? 'plaintext';
}
