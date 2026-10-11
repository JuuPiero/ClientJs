import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';

// WebContainer (và SharedArrayBuffer nói chung) cần trang ở trạng thái
// cross-origin isolated => phải trả về 2 header COOP/COEP.
// Dev/preview: Vite tự gắn header. Khi deploy static: xem public/_headers,
// vercel.json, hoặc fallback public/coi-sw.js (GitHub Pages, Wasmer...).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const CONNECT_PATH = '/webcontainer/connect/';

/**
 * Phục vụ connect.html tại /webcontainer/connect/<token> mà KHÔNG kèm COOP/COEP
 * (để mở preview WebContainer ở tab mới). Middleware của plugin chạy trước bước
 * Vite gắn `server.headers`/`preview.headers`, nên response này không bị dính header.
 */
function webcontainerConnect(): Plugin {
  const handler =
    (load: (url: string) => Promise<string>): Connect.NextHandleFunction =>
    (req, res, next) => {
      if (!req.url?.startsWith(CONNECT_PATH)) return next();
      load(req.url).then((html) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      }, next);
    };

  return {
    name: 'webcontainer-connect',
    configureServer(server) {
      server.middlewares.use(
        handler(async (url) =>
          server.transformIndexHtml(url, await readFile(resolve(server.config.root, 'connect.html'), 'utf8')),
        ),
      );
    },
    configurePreviewServer(server) {
      const file = resolve(server.config.root, server.config.build.outDir, 'connect.html');
      server.middlewares.use(handler(() => readFile(file, 'utf8')));
    },
  };
}

export default defineConfig({
  plugins: [react(), webcontainerConnect()],
  // Đường dẫn tương đối => build chạy được ở cả root lẫn sub-path (GitHub Pages).
  base: './',
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    rolldownOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), connect: resolve(import.meta.dirname, 'connect.html') },
    },
  },
  optimizeDeps: {
    // Pre-bundle làm hỏng đường dẫn tới file .wasm của QuickJS.
    exclude: ['quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'],
  },
});
