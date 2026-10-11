// Định dạng giá trị giống console.log của Node.
// File JS thuần, không phụ thuộc gì: worker gốc import bình thường, còn QuickJS
// nạp nguyên source (?raw) làm module "host:inspect" bên trong sandbox.

const MAX_DEPTH = 4;
const MAX_ITEMS = 100;
const LINE_WIDTH = 72;

/** console.log(...args) -> 1 chuỗi; hỗ trợ %s %d %i %f %o %O %j %c %% */
export function formatArgs(args) {
  if (typeof args[0] === 'string' && /%[sdifoOjc%]/.test(args[0])) {
    let i = 1;
    const head = args[0].replace(/%([sdifoOjc%])/g, (match, f) => {
      if (f === '%') return '%';
      if (i >= args.length) return match;
      const v = args[i++];
      switch (f) {
        case 's': return typeof v === 'string' ? v : inspect(v, 1);
        case 'd': return String(Number(v));
        case 'i': return String(parseInt(v, 10));
        case 'f': return String(parseFloat(v));
        case 'j': return JSON.stringify(v);
        case 'c': return '';
        default: return inspect(v);
      }
    });
    return [head, ...args.slice(i).map(show)].join(' ');
  }
  return args.map(show).join(' ');
}

const show = (v) => (typeof v === 'string' ? v : inspect(v));

const quote = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

const formatKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k));

function ctorName(obj) {
  try {
    const proto = Object.getPrototypeOf(obj);
    if (proto === null) return null;
    return (proto.constructor && proto.constructor.name) || '';
  } catch {
    return '';
  }
}

function formatError(err, depth) {
  const head = `${err.name || 'Error'}: ${err.message}`;
  if (depth > 0) return `[${head}]`;
  const stack = typeof err.stack === 'string' ? err.stack.trimEnd() : '';
  // V8: stack đã gồm "Name: message"; QuickJS: stack chỉ có các frame.
  if (!stack) return head;
  return stack.startsWith(head) ? stack : `${head}\n${stack}`;
}

export function inspect(value, depth = 0, seen = []) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined': return 'undefined';
    case 'string': return quote(value);
    case 'number': return Object.is(value, -0) ? '-0' : String(value);
    case 'bigint': return `${value}n`;
    case 'boolean': return String(value);
    case 'symbol': return value.toString();
    case 'function': {
      const isClass = /^class[\s{]/.test(Function.prototype.toString.call(value));
      return `[${isClass ? 'class' : 'Function'}${value.name ? ': ' + value.name : ' (anonymous)'}]`;
    }
  }

  if (seen.includes(value)) return '[Circular]';
  if (value instanceof Error) return formatError(value, depth);
  if (value instanceof Date) return isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (value instanceof RegExp) return String(value);
  if (typeof Promise !== 'undefined' && value instanceof Promise) return 'Promise { <pending?> }';

  const name = ctorName(value);
  if (depth > MAX_DEPTH) return Array.isArray(value) ? '[Array]' : `[${name || 'Object'}]`;

  seen.push(value);
  try {
    let prefix = '';
    let open = '{';
    let close = '}';
    let parts;
    let total;
    const child = (v) => inspect(v, depth + 1, seen);

    if (Array.isArray(value)) {
      open = '[';
      close = ']';
      total = value.length;
      parts = value.slice(0, MAX_ITEMS).map(child);
    } else if (value instanceof Map) {
      prefix = `Map(${value.size}) `;
      total = value.size;
      parts = [...value].slice(0, MAX_ITEMS).map(([k, v]) => `${child(k)} => ${child(v)}`);
    } else if (value instanceof Set) {
      prefix = `Set(${value.size}) `;
      total = value.size;
      parts = [...value].slice(0, MAX_ITEMS).map(child);
    } else if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      prefix = `${name}(${value.length}) `;
      open = '[';
      close = ']';
      total = value.length;
      parts = Array.from(value.slice(0, MAX_ITEMS), child);
    } else {
      if (name === null) prefix = '[Object: null prototype] ';
      else if (name && name !== 'Object') prefix = `${name} `;
      const keys = Object.keys(value);
      total = keys.length;
      parts = keys.slice(0, MAX_ITEMS).map((k) => {
        let v;
        try {
          v = child(value[k]);
        } catch {
          v = '[Getter: threw]';
        }
        return `${formatKey(k)}: ${v}`;
      });
    }

    if (total > MAX_ITEMS) parts.push(`... ${total - MAX_ITEMS} more`);
    if (parts.length === 0) return `${prefix}${open}${close}`;

    const oneLine = `${prefix}${open} ${parts.join(', ')} ${close}`;
    if (oneLine.length <= LINE_WIDTH && !parts.some((p) => p.includes('\n'))) return oneLine;
    const pad = '  '.repeat(depth + 1);
    return `${prefix}${open}\n${pad}${parts.join(`,\n${pad}`)}\n${'  '.repeat(depth)}${close}`;
  } finally {
    seen.pop();
  }
}
