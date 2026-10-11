import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import { attachTerminal, resizeTerminal, sendTerminalInput } from '../runner';

/** Terminal duy nhất của app; đăng ký với runner để mọi runtime ghi output vào. */
export function XTerm() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      scrollback: 5000,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      theme: { background: '#1a1b1e', foreground: '#d4d4d4', selectionBackground: '#3b4a6b' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);

    const refit = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) fit.fit();
    };
    refit();
    const observer = new ResizeObserver(() => requestAnimationFrame(refit));
    observer.observe(el);

    const subs = [
      term.onData(sendTerminalInput),
      term.onResize(({ cols, rows }) => resizeTerminal(cols, rows)),
    ];

    attachTerminal({
      write: (data) => term.write(data),
      clear: () => term.reset(),
      size: () => ({ cols: term.cols, rows: term.rows }),
    });
    term.write('\x1b[90m› Bấm Run (Ctrl/⌘ + Enter) để chạy dự án\x1b[0m\r\n');

    return () => {
      attachTerminal(null);
      observer.disconnect();
      subs.forEach((s) => s.dispose());
      term.dispose();
    };
  }, []);

  return <div ref={host} className="xterm-host" />;
}
