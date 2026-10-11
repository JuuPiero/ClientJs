// Trang /webcontainer/connect/<token>.
// Khi mở URL preview của WebContainer ở tab riêng, tab đó hiện nút "Connect to Project";
// nút này mở popup tới trang này trên origin của app. setupConnect() chuyển tiếp message
// giữa tab preview (window.opener) và WebContainer đang chạy trong tab app, rồi tự đóng popup.
// Yêu cầu: trang này KHÔNG được có header COOP same-origin (nếu có thì window.opener = null).
import { setupConnect } from '@webcontainer/api/connect';

const status = document.getElementById('status')!;

try {
  setupConnect({ editorOrigin: 'https://stackblitz.com' });
} catch (err) {
  status.textContent = `Không kết nối được preview: ${err instanceof Error ? err.message : String(err)}`;
}
