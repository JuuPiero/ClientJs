// localStorage cho zustand/persist:
//  - ghi có debounce (gõ phím không bắt JSON.stringify + ghi đĩa mỗi lần)
//  - bọc try/catch: private mode, bị chặn, hết quota (~5MB) đều không làm sập app
//  - phát trạng thái lưu cho status bar
import type { StateStorage } from 'zustand/middleware';
import { create } from 'zustand';

export type SaveState = { status: 'saved' | 'pending' | 'error'; error?: string; bytes: number };

export const useSaveState = create<SaveState>(() => ({ status: 'saved', bytes: 0 }));

const DEBOUNCE_MS = 400;
const queue = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function flushStorage(): void {
  clearTimeout(timer);
  for (const [key, value] of queue) {
    try {
      localStorage.setItem(key, value);
      useSaveState.setState({ status: 'saved', error: undefined, bytes: usageBytes() });
    } catch (err) {
      const quota = err instanceof DOMException && /quota/i.test(`${err.name} ${err.message}`);
      useSaveState.setState({
        status: 'error',
        error: quota
          ? 'localStorage đã đầy (~5MB). Hãy xoá bớt dự án hoặc export ra file.'
          : `Không ghi được localStorage: ${String(err)}`,
      });
    }
  }
  queue.clear();
}

export const debouncedLocalStorage: StateStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    queue.set(key, value);
    useSaveState.setState({ status: 'pending' });
    clearTimeout(timer);
    timer = setTimeout(flushStorage, DEBOUNCE_MS);
  },
  removeItem(key) {
    queue.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* bỏ qua */
    }
  },
};

/** Ước lượng số byte localStorage đang dùng (UTF-16 => 2 byte/ký tự). */
export function usageBytes(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
    }
  } catch {
    /* bỏ qua */
  }
  return total;
}

// Đảm bảo không mất thay đổi cuối khi đóng tab / chuyển tab.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushStorage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorage();
  });
  useSaveState.setState({ bytes: usageBytes() });
}
