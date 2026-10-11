// State toàn app + tự lưu vào localStorage (key "clientjs:state") qua zustand/persist.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SEED_TEMPLATES } from '../templates';
import { DEFAULT_SETTINGS, type Project, type RuntimeId, type Settings } from '../types';
import { normalizeProject, projectFromTemplate, renamePaths } from './projects';
import { debouncedLocalStorage } from './storage';

export const STORAGE_KEY = 'clientjs:state';

interface AppState {
  projects: Record<string, Project>;
  currentId: string | null;
  settings: Settings;

  // ---- dự án
  addProject(project: Project, open?: boolean): void;
  openProject(id: string): void;
  renameProject(id: string, name: string): void;
  duplicateProject(id: string): Project | null;
  deleteProject(id: string): void;
  setRuntime(runtime: RuntimeId): void;
  setEntry(path: string): void;

  // ---- file trong dự án hiện tại
  updateFile(path: string, content: string): void;
  createFile(path: string, content?: string): void;
  renamePath(from: string, to: string): Record<string, string>;
  deletePath(path: string): string[];
  openFile(path: string): void;
  closeFile(path: string): void;

  updateSettings(patch: Partial<Settings>): void;
  resetAll(): void;
}

function seedProjects(): Record<string, Project> {
  const list = SEED_TEMPLATES.map((id) => projectFromTemplate(id));
  // Dự án đầu tiên mới nhất => nằm đầu danh sách
  list.forEach((p, i) => (p.updatedAt -= i));
  return Object.fromEntries(list.map((p) => [p.id, p]));
}

function initialState() {
  const projects = seedProjects();
  return { projects, currentId: Object.keys(projects)[0] ?? null, settings: DEFAULT_SETTINGS };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      /** Cập nhật dự án đang mở (bất biến) + bump updatedAt */
      const patchCurrent = (fn: (p: Project) => Partial<Project>) =>
        set((s) => {
          const p = s.currentId ? s.projects[s.currentId] : undefined;
          if (!p) return s;
          return { projects: { ...s.projects, [p.id]: { ...p, ...fn(p), updatedAt: Date.now() } } };
        });

      return {
        ...initialState(),

        addProject(project, open = true) {
          set((s) => ({
            projects: { ...s.projects, [project.id]: project },
            currentId: open ? project.id : s.currentId,
          }));
        },

        openProject(id) {
          if (get().projects[id]) set({ currentId: id });
        },

        renameProject(id, name) {
          set((s) => {
            const p = s.projects[id];
            return p ? { projects: { ...s.projects, [id]: { ...p, name, updatedAt: Date.now() } } } : s;
          });
        },

        duplicateProject(id) {
          const src = get().projects[id];
          if (!src) return null;
          const copy = normalizeProject({
            ...structuredClone(src),
            id: undefined,
            name: `${src.name} (bản sao)`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          get().addProject(copy);
          return copy;
        },

        deleteProject(id) {
          set((s) => {
            const { [id]: _removed, ...rest } = s.projects;
            const nextId =
              s.currentId === id
                ? (Object.values(rest).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null)
                : s.currentId;
            return { projects: rest, currentId: nextId };
          });
        },

        setRuntime(runtime) {
          patchCurrent(() => ({ runtime }));
        },

        setEntry(path) {
          patchCurrent(() => ({ entry: path }));
        },

        updateFile(path, content) {
          patchCurrent((p) => (p.files[path] === content ? {} : { files: { ...p.files, [path]: content } }));
        },

        createFile(path, content = '') {
          patchCurrent((p) => ({
            files: { ...p.files, [path]: content },
            openFiles: p.openFiles.includes(path) ? p.openFiles : [...p.openFiles, path],
            activeFile: path,
          }));
        },

        renamePath(from, to) {
          const p = get().currentId ? get().projects[get().currentId!] : undefined;
          if (!p) return {};
          const moves = renamePaths(p.files, from, to);
          const mapPath = (path: string) => moves[path] ?? path;
          patchCurrent(() => ({
            files: Object.fromEntries(Object.entries(p.files).map(([k, v]) => [mapPath(k), v])),
            entry: mapPath(p.entry),
            openFiles: p.openFiles.map(mapPath),
            activeFile: p.activeFile ? mapPath(p.activeFile) : null,
          }));
          return moves;
        },

        deletePath(path) {
          const p = get().currentId ? get().projects[get().currentId!] : undefined;
          if (!p) return [];
          const removed = Object.keys(p.files).filter((f) => f === path || f.startsWith(`${path}/`));
          const files = { ...p.files };
          for (const f of removed) delete files[f];
          if (Object.keys(files).length === 0) files[p.entry === path ? 'main.js' : p.entry] = '';
          const remaining = Object.keys(files);
          const openFiles = p.openFiles.filter((f) => files[f] !== undefined);
          patchCurrent(() => ({
            files,
            entry: files[p.entry] !== undefined ? p.entry : remaining[0],
            openFiles,
            activeFile: p.activeFile && files[p.activeFile] !== undefined ? p.activeFile : (openFiles.at(-1) ?? null),
          }));
          return removed;
        },

        openFile(path) {
          patchCurrent((p) => ({
            openFiles: p.openFiles.includes(path) ? p.openFiles : [...p.openFiles, path],
            activeFile: path,
          }));
        },

        closeFile(path) {
          patchCurrent((p) => {
            const idx = p.openFiles.indexOf(path);
            const openFiles = p.openFiles.filter((f) => f !== path);
            const activeFile =
              p.activeFile === path ? (openFiles[Math.min(idx, openFiles.length - 1)] ?? null) : p.activeFile;
            return { openFiles, activeFile };
          });
        },

        updateSettings(patch) {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
        },

        resetAll() {
          set(initialState());
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => debouncedLocalStorage),
      partialize: (s) => ({ projects: s.projects, currentId: s.currentId, settings: s.settings }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>;
        const projects = saved.projects
          ? Object.fromEntries(Object.values(saved.projects).map((p) => [p.id, normalizeProject(p)]))
          : current.projects;
        const currentId = saved.currentId && projects[saved.currentId] ? saved.currentId : (Object.keys(projects)[0] ?? null);
        return { ...current, projects, currentId, settings: { ...DEFAULT_SETTINGS, ...saved.settings } };
      },
    },
  ),
);

export const useCurrentProject = () => useAppStore((s) => (s.currentId ? (s.projects[s.currentId] ?? null) : null));
