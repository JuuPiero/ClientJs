/*
 * Service worker "cross-origin isolation" dự phòng.
 * Dùng cho host static KHÔNG tự đặt được header (vd. GitHub Pages): SW chèn
 * COOP/COEP vào mọi response để trang có `crossOriginIsolated === true`.
 * Nếu host đã trả header (Vite dev/preview, Netlify/_headers, vercel.json)
 * thì index.html sẽ không đăng ký SW này.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Chrome bug: only-if-cached chỉ hợp lệ với same-origin.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith(
    fetch(req).then((res) => {
      // Response opaque (no-cors) không đọc/sửa header được.
      if (res.status === 0) return res;
      const headers = new Headers(res.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      if (!headers.has('Cross-Origin-Resource-Policy')) {
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      }
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }),
  );
});
