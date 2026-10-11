;; Lib WASM mẫu, viết tay bằng WebAssembly Text.
;; `npm run build:wasm` biên dịch file này thành public/wasm/math.wasm.
;; Dùng trong code:  import { fib, fibRec, isPrime } from "wasm:math";
(module
  ;; add(a, b) -> a + b
  (func (export "add") (param $a i32) (param $b i32) (result i32)
    (i32.add (local.get $a) (local.get $b)))

  ;; fib(n) — vòng lặp, trả f64 để chính xác tới fib(78)
  (func (export "fib") (param $n i32) (result f64)
    (local $a f64) (local $b f64) (local $t f64) (local $i i32)
    (local.set $b (f64.const 1))
    (block $done
      (loop $next
        (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
        (local.set $t (f64.add (local.get $a) (local.get $b)))
        (local.set $a (local.get $b))
        (local.set $b (local.get $t))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
    (local.get $a))

  ;; fibRec(n) — đệ quy, cố tình chậm để benchmark so với JS
  (func $fibRec (export "fibRec") (param $n i32) (result i32)
    (if (result i32) (i32.lt_s (local.get $n) (i32.const 2))
      (then (local.get $n))
      (else
        (i32.add
          (call $fibRec (i32.sub (local.get $n) (i32.const 1)))
          (call $fibRec (i32.sub (local.get $n) (i32.const 2)))))))

  ;; isPrime(n) -> 1 | 0
  (func (export "isPrime") (param $n i32) (result i32)
    (local $i i32)
    (if (i32.lt_s (local.get $n) (i32.const 2))
      (then (return (i32.const 0))))
    (local.set $i (i32.const 2))
    (block $done
      (loop $next
        (br_if $done (i32.gt_s (i32.mul (local.get $i) (local.get $i)) (local.get $n)))
        (if (i32.eqz (i32.rem_s (local.get $n) (local.get $i)))
          (then (return (i32.const 0))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
    (i32.const 1))
)
