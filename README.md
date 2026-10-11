# ClientJS Playground

Chạy JavaScript **hoàn toàn trên trình duyệt**, không cần backend. App gồm:

- **Quản lý dự án**: tạo từ template, đổi tên, nhân bản, xoá, export/import `.json`.
- **Editor nhiều file** (Monaco, editor của VS Code): cây file kéo-thả, tab, IntelliSense, mỗi file giữ undo riêng.
- **Tự lưu vào localStorage**: gõ là lưu (debounce 400ms), kích thước các panel cũng được nhớ.
- **3 runtime** hoán đổi được theo từng dự án, cùng dùng được **lib WASM tự build**.

| Runtime | Engine | Dùng khi | Giới hạn |
|---|---|---|---|
| **QuickJS (WASM)** | QuickJS biên dịch sang WebAssembly, chạy trong Web Worker | Chạy code không tin cậy: sandbox cô lập, giới hạn bộ nhớ và thời gian | Không có DOM, `fetch` hay npm; là interpreter nên chậm hơn JIT |
| **Web Worker** | Engine JS gốc của trình duyệt (V8/SpiderMonkey/JSC) | Cần tốc độ, `fetch`, `crypto`, `import` package npm qua esm.sh | Không có DOM; ít cô lập hơn QuickJS |
| **Node.js (WebContainer)** | Node.js thật của StackBlitz | `npm install`, `node:fs`, HTTP server có preview, shell `jsh` | Cần COOP/COEP; xem phần license bên dưới |

## Chạy thử

Cần Node.js ≥ 20.19 (hoặc ≥ 22.12).

```bash
npm install
npm run dev        # http://localhost:5173 (tự build lib WASM trước)
npm run build      # typecheck + build ra dist/
npm run preview    # phục vụ dist/ kèm header COOP/COEP
```

Phím tắt: `Ctrl/⌘ + Enter` để chạy, `Ctrl/⌘ + S` để lưu ngay.

## Cấu trúc

```
src/
  App.tsx, main.tsx          Layout (Mantine AppShell + react-resizable-panels)
  components/                Header, ProjectList, FileTree, EditorPane, OutputPane (xterm), StatusBar, modal
  store/appStore.ts          State zustand + persist -> localStorage (key "clientjs:state")
  store/storage.ts           localStorage có debounce, bắt lỗi hết quota, trạng thái lưu
  store/projects.ts          Hàm thuần: tạo/chuẩn hoá dự án, export/import, đổi tên path
  templates.ts               Template + dự án mẫu tạo sẵn lần đầu
  runner.ts                  Điều phối Run/Stop/Shell ↔ runtime ↔ terminal
  monaco.ts                  Bundle Monaco nội bộ (không qua CDN), worker, typings cho "wasm:*"
  runtimes/
    types.ts                 Interface Runtime chung
    workerRuntime.ts         Adapter cho runtime chạy trong Worker (timeout, terminate)
    quickjs.worker.ts        Sandbox QuickJS: console, timer, module loader, cầu nối WASM
    native.worker.ts         JS gốc: viết lại import -> blob URL / esm.sh / wasm
    webcontainer.ts          Boot, mount file, npm install, spawn node/jsh, preview
    shared/                  inspect.js (định dạng kiểu console.log của Node), paths, wasm loader, protocol
wasm/libs/                   Mã nguồn lib WASM (*.wat) hoặc .wasm build sẵn
scripts/build-wasm.mjs       wasm/libs -> public/wasm/*.wasm + manifest.json
public/coi-sw.js, _headers   Hỗ trợ cross-origin isolation khi deploy
```

Muốn thêm runtime mới: viết một class theo interface `Runtime` ([src/runtimes/types.ts](src/runtimes/types.ts)), đăng ký trong [src/runtimes/index.ts](src/runtimes/index.ts) và thêm template.

## Lib WASM tự build

Mọi file trong `wasm/libs/` được `npm run build:wasm` (tự chạy trước `dev`/`build`) gom vào `public/wasm/`:

- `*.wat` được biên dịch bằng [wabt](https://github.com/WebAssembly/wabt) (npm), không cần cài toolchain.
- `*.wasm` (output của Emscripten, Rust, Zig, AssemblyScript...) được copy nguyên trạng.

Tên file chính là tên lib. Cách dùng ở từng runtime:

```js
// QuickJS và Web Worker
import { fib, isPrime } from 'wasm:math';

// Node.js (WebContainer): app tự mount thư mục ./wasm vào container
const { instance } = await WebAssembly.instantiate(await readFile('./wasm/math.wasm'));
```

Cầu nối chung chỉ truyền **số** (i32/i64/f32/f64), đúng kiểu dữ liệu của WASM core. Module nên **không có import** (standalone). Nếu module có import, loader sẽ cấp stub (hàm trả 0, memory/table mới) và gọi `_initialize` nếu có. Cần truyền chuỗi/struct hoặc cần glue JS đầy đủ (wasm-bindgen, Emscripten MODULARIZE) thì dùng runtime Web Worker và import thẳng file JS do toolchain sinh ra.

**C/C++ (Emscripten)**

```c
// wasm/src/hash.c
#include <emscripten.h>
EMSCRIPTEN_KEEPALIVE unsigned int fnv1a(unsigned int seed, int n) { /* ... */ return seed ^ n; }
```

```bash
emcc wasm/src/hash.c -O3 --no-entry -sSTANDALONE_WASM -o wasm/libs/hash.wasm
```

**Rust**

```rust
// src/lib.rs   (Cargo.toml: [lib] crate-type = ["cdylib"])
#[no_mangle]
pub extern "C" fn mandel(x: f64, y: f64, max_iter: u32) -> u32 { /* ... */ 0 }
```

```bash
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/<crate>.wasm wasm/libs/mandel.wasm
```

**Zig**: `zig build-exe src/lib.zig -target wasm32-freestanding -fno-entry -rdynamic -O ReleaseFast -femit-bin=wasm/libs/lib.wasm`

Sau đó chạy `npm run build:wasm` (hoặc khởi động lại `npm run dev`), rồi `import { ... } from 'wasm:<tên>'`. Editor cũng tự có gợi ý kiểu cho lib mới.

## Deploy (static hosting)

WebContainer cần trang ở trạng thái **cross-origin isolated**, tức server phải trả 2 header:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- **Netlify / Cloudflare Pages**: đã có sẵn `public/_headers`.
- **Vercel**: đã có sẵn `vercel.json`.
- **GitHub Pages** hoặc host không chỉnh được header: `index.html` tự đăng ký `coi-sw.js`, một service worker chèn header rồi reload trang một lần.
- **Nginx**: `add_header Cross-Origin-Opener-Policy same-origin; add_header Cross-Origin-Embedder-Policy require-corp;`

Thanh trạng thái hiển thị `COOP/COEP ✓/✗`. QuickJS và Web Worker vẫn chạy được khi không có header; chỉ WebContainer bị vô hiệu.

Hệ quả của `require-corp`: tài nguyên cross-origin (ảnh, font, script) phải có CORS hoặc header `Cross-Origin-Resource-Policy`. Vì vậy app không tải font hay Monaco từ CDN mà bundle tất cả.

## Lưu ý

- **localStorage** giới hạn khoảng 5MB mỗi origin và chỉ nằm trên trình duyệt đó. Dùng **Export tất cả** để sao lưu. Khi hết chỗ, app báo lỗi chứ không mất dữ liệu đang có. Nếu cần nhiều hơn, thay `debouncedLocalStorage` trong [src/store/storage.ts](src/store/storage.ts) bằng IndexedDB (ví dụ `idb-keyval`), vì zustand/persist hỗ trợ storage async.
- Mở cùng app ở 2 tab thì tab nào lưu sau sẽ thắng.
- **License WebContainer**: WebContainer API là sản phẩm của StackBlitz. Dùng cho sản phẩm thương mại/production thường cần license riêng, hãy kiểm tra điều khoản tại https://webcontainers.io trước khi deploy. QuickJS (MIT) và phần còn lại của app không có ràng buộc này.
- WebContainer cần Internet ở lần boot đầu (tải runtime từ StackBlitz) và để `npm install`.
- Runtime Web Worker không hỗ trợ import vòng giữa các file của dự án (QuickJS và Node thì có).
- `npm audit` báo 2 cảnh báo mức *low* đến từ `dompurify`, một dependency của `monaco-editor@0.57` (liên quan chế độ `IN_PLACE` của DOMPurify). Cách sửa `npm audit` gợi ý là hạ Monaco xuống 0.56, nên tôi giữ nguyên bản hiện tại để chờ bản vá.
