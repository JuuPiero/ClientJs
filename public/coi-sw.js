/*
 * Service worker "cross-origin isolation" dự phòng.
 * Dùng cho host static KHÔNG tự đặt được header (GitHub Pages, Wasmer Edge...):
 *  1. Chèn COOP/COEP vào mọi response để trang có `crossOriginIsolated === true`.
 *  2. Phục vụ connect.html tại /webcontainer/connect/<token> (KHÔNG kèm COOP) để
 *     mở preview WebContainer ở tab mới — không cần cấu hình rewrite trên host.
 * Nếu host đã trả header (Vite dev/preview, Netlify/_headers, vercel.json)
 * thì index.html sẽ không đăng ký SW này.
 */
const CONNECT_PATH = '/webcontainer/connect/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith(CONNECT_PATH)) {
    event.respondWith(
      fetch(new URL('connect.html', self.registration.scope)).then(
        (res) => new Response(res.body, { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    );
    return;
  }

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
