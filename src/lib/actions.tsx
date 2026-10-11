// Các thao tác có hộp thoại (prompt/confirm/thông báo) dùng chung cho nhiều component.
import { Button, Group, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { disposeAllModels, disposeModels } from '../monaco';
import { useAppStore } from '../store/appStore';
import { exportProjects, parseProjectsExport, validateNewPath } from '../store/projects';
import { downloadText, pickTextFile, slugify } from './files';

// ---- Prompt / confirm ----------------------------------------------------------

interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  description?: string;
  confirmLabel?: string;
  validate?: (value: string) => string | null;
  /** Bôi đen phần tên (không gồm đuôi) như VS Code */
  selectBaseName?: boolean;
}

function PromptForm({ opts, onDone }: { opts: PromptOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const err = opts.validate?.(value) ?? (value.trim() ? null : 'Không được để trống');
    if (err) return setError(err);
    onDone(value.trim());
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextInput
        data-autofocus
        label={opts.label}
        description={opts.description}
        placeholder={opts.placeholder}
        value={value}
        error={error}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          setError(null);
        }}
        onFocus={(e) => {
          const input = e.currentTarget;
          const dot = input.value.lastIndexOf('.');
          const slash = input.value.lastIndexOf('/');
          input.setSelectionRange(opts.selectBaseName ? slash + 1 : 0, opts.selectBaseName && dot > slash ? dot : input.value.length);
        }}
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={() => onDone(null)}>
          Huỷ
        </Button>
        <Button type="submit">{opts.confirmLabel ?? 'OK'}</Button>
      </Group>
    </form>
  );
}

export function promptText(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      modals.close(id);
      resolve(v);
    };
    const id = modals.open({
      title: opts.title,
      children: <PromptForm opts={opts} onDone={done} />,
      onClose: () => done(null),
    });
  });
}

export function confirmDanger(title: string, message: React.ReactNode, confirmLabel = 'Xoá'): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title,
      children: <Text size="sm">{message}</Text>,
      labels: { confirm: confirmLabel, cancel: 'Huỷ' },
      confirmProps: { color: 'red' },
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    });
  });
}

const notifyError = (title: string, err: unknown) =>
  notifications.show({ color: 'red', title, message: err instanceof Error ? err.message : String(err) });

// ---- Dự án -------------------------------------------------------------------------

const store = () => useAppStore.getState();

export async function renameProject(id: string) {
  const p = store().projects[id];
  if (!p) return;
  const name = await promptText({ title: 'Đổi tên dự án', initial: p.name, confirmLabel: 'Lưu' });
  if (name) store().renameProject(id, name);
}

export async function deleteProject(id: string) {
  const p = store().projects[id];
  if (!p) return;
  const ok = await confirmDanger('Xoá dự án?', <>Xoá vĩnh viễn “{p.name}” khỏi localStorage. Không thể hoàn tác.</>);
  if (!ok) return;
  store().deleteProject(id);
  disposeModels(id);
}

export function exportProject(id: string) {
  const p = store().projects[id];
  if (p) downloadText(`${slugify(p.name)}.clientjs.json`, exportProjects([p]));
}

export function exportAllProjects() {
  const all = Object.values(store().projects);
  const date = new Date().toISOString().slice(0, 10);
  downloadText(`clientjs-backup-${date}.json`, exportProjects(all));
}

export async function importProjects() {
  const text = await pickTextFile();
  if (!text) return;
  try {
    const imported = parseProjectsExport(text);
    imported.forEach((p, i) => store().addProject(p, i === 0));
    notifications.show({ color: 'teal', message: `Đã import ${imported.length} dự án` });
  } catch (err) {
    notifyError('Import thất bại', err);
  }
}

export async function resetAllData() {
  const ok = await confirmDanger(
    'Xoá toàn bộ dữ liệu?',
    'Mọi dự án trong localStorage sẽ bị xoá và thay bằng dự án mẫu. Nên “Export tất cả” trước.',
    'Xoá tất cả',
  );
  if (!ok) return;
  disposeAllModels();
  store().resetAll();
  modals.closeAll();
}

// ---- File / thư mục trong dự án hiện tại ---------------------------------------------

const current = () => {
  const s = store();
  return s.currentId ? s.projects[s.currentId] : undefined;
};

export async function createFile(dir = '') {
  const p = current();
  if (!p) return;
  const path = await promptText({
    title: 'File mới',
    label: 'Đường dẫn',
    description: 'Có thể gồm thư mục, vd: lib/utils.js',
    initial: dir ? `${dir}/` : '',
    placeholder: 'utils.js',
    confirmLabel: 'Tạo',
    validate: (v) => validateNewPath(p.files, v),
  });
  if (path) store().createFile(path.replace(/^\/+/, ''));
}

export async function renamePath(path: string, isFolder: boolean) {
  const p = current();
  if (!p) return;
  const next = await promptText({
    title: isFolder ? 'Đổi tên thư mục' : 'Đổi tên file',
    label: 'Đường dẫn mới',
    initial: path,
    confirmLabel: 'Đổi tên',
    selectBaseName: true,
    validate: (v) => validateNewPath(p.files, v, path),
  });
  if (next && next !== path) movePath(path, next);
}

export function movePath(from: string, to: string) {
  const p = current();
  if (!p) return;
  const err = validateNewPath(p.files, to, from);
  if (err) return notifyError('Không di chuyển được', err);
  const moves = store().renamePath(from, to);
  disposeModels(p.id, Object.keys(moves));
}

export async function deletePath(path: string, isFolder: boolean) {
  const p = current();
  if (!p) return;
  const ok = await confirmDanger(
    isFolder ? 'Xoá thư mục?' : 'Xoá file?',
    isFolder ? `Xoá “${path}/” và toàn bộ file bên trong.` : `Xoá “${path}”.`,
  );
  if (!ok) return;
  const removed = store().deletePath(path);
  disposeModels(p.id, removed);
}
