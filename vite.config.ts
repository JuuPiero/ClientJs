import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// WebContainer (và SharedArrayBuffer nói chung) cần trang ở trạng thái
// cross-origin isolated => phải trả về 2 header COOP/COEP.
// Dev/preview: Vite tự gắn header. Khi deploy static: xem public/_headers,
// vercel.json, hoặc fallback public/coi-sw.js (GitHub Pages...).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  // Đường dẫn tương đối => build chạy được ở cả root lẫn sub-path (GitHub Pages).
  base: './',
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
  optimizeDeps: {
    // Pre-bundle làm hỏng đường dẫn tới file .wasm của QuickJS.
    exclude: ['quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'],
  },
});
