export type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'counter'; name: string; style: string }
  | { kind: 'counters'; name: string; separator: string; style: string }
  | { kind: 'attr'; name: string }
  | { kind: 'image'; url: string };

const QUOTES: Record<string, string> = {
  'open-quote': '“',
  'close-quote': '”',
  'no-open-quote': '',
  'no-close-quote': '',
};

function readString(value: string, start: number): { text: string; end: number } {
  const quote = value[start];
  let text = '';
  let i = start + 1;
  while (i < value.length && value[i] !== quote) {
    if (value[i] !== '\\') {
      text += value[i++];
      continue;
    }
    const hex = /^[0-9a-fA-F]{1,6}/.exec(value.slice(i + 1));
    if (hex) {
      text += String.fromCodePoint(Number.parseInt(hex[0], 16));
      i += 1 + hex[0].length;
      if (/\s/.test(value[i] ?? '')) i++;
    } else if (value[i + 1] === '\n') {
      i += 2;
    } else {
      text += value[i + 1] ?? '';
      i += 2;
    }
  }
  return { text, end: i + 1 };
}

function splitArgs(args: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of args) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

function unquote(value: string): string {
  const v = value.trim();
  return v.startsWith('"') || v.startsWith("'") ? readString(v, 0).text : v;
}

/** Parses a computed `content` value; null when it holds something that cannot be reproduced. */
export function parseContent(value: string): ContentPart[] | null {
  if (!value || value === 'none' || value === 'normal') return null;
  const parts: ContentPart[] = [];
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const { text, end } = readString(value, i);
      parts.push({ kind: 'text', text });
      i = end;
      continue;
    }
    const ident = /^[a-zA-Z-]+/.exec(value.slice(i));
    if (!ident) return null;
    const name = ident[0].toLowerCase();
    i += ident[0].length;
    if (value[i] !== '(') {
      if (!(name in QUOTES)) return null;
      if (QUOTES[name]) parts.push({ kind: 'text', text: QUOTES[name] });
      continue;
    }
    let depth = 0;
    let end = i;
    let quote: string | null = null;
    for (; end < value.length; end++) {
      const c = value[end];
      if (quote) {
        if (c === '\\') end++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    const args = splitArgs(value.slice(i + 1, end));
    i = end + 1;
    if (name === 'counter') {
      parts.push({ kind: 'counter', name: args[0], style: args[1] || 'decimal' });
    } else if (name === 'counters') {
      parts.push({
        kind: 'counters',
        name: args[0],
        separator: unquote(args[1] ?? ''),
        style: args[2] || 'decimal',
      });
    } else if (name === 'attr') {
      parts.push({ kind: 'attr', name: args[0].split(/\s+/)[0] });
    } else if (name === 'url') {
      parts.push({ kind: 'image', url: unquote(args[0] ?? '') });
    } else return null;
  }
  return parts;
}

export function parseCounterList(
  value: string,
  defaultValue: number,
): { name: string; value: number }[] {
  if (!value || value === 'none') return [];
  const tokens = value.trim().split(/\s+/);
  const out: { name: string; value: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const next = tokens[i + 1];
    const explicit = next !== undefined && /^-?\d+$/.test(next);
    out.push({ name: tokens[i], value: explicit ? Number.parseInt(next, 10) : defaultValue });
    if (explicit) i++;
  }
  return out;
}

function alphabetic(n: number, base: string): string {
  if (n < 1) return String(n);
  let out = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) out = base[(v - 1) % 26] + out;
  return out;
}

function roman(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let v = n;
  for (const [amount, glyph] of table) {
    while (v >= amount) {
      out += glyph;
      v -= amount;
    }
  }
  return out;
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';

export function formatCounter(n: number, style: string): string {
  switch (style) {
    case 'none':
      return '';
    case 'decimal-leading-zero':
      return n >= 0 && n < 10 ? `0${n}` : String(n);
    case 'lower-alpha':
    case 'lower-latin':
      return alphabetic(n, LOWER);
    case 'upper-alpha':
    case 'upper-latin':
      return alphabetic(n, LOWER.toUpperCase());
    case 'lower-roman':
      return roman(n).toLowerCase();
    case 'upper-roman':
      return roman(n);
    case 'disc':
      return '•';
    case 'circle':
      return '◦';
    case 'square':
      return '▪';
    default:
      return String(n);
  }
}

type Instance = { value: number; scope: Element };

/** CSS counters replayed in document order, scoped the way `counter-reset` scopes them. */
class Counters {
  private readonly stacks = new Map<string, Instance[]>();

  enter(el: Element): void {
    for (const stack of this.stacks.values()) {
      while (stack.length > 0 && !stack[stack.length - 1].scope.contains(el)) stack.pop();
    }
  }

  apply(el: Element, cs: CSSStyleDeclaration): void {
    const scope = el.parentElement ?? el;
    for (const { name, value } of parseCounterList(cs.counterReset, 0)) {
      const stack = this.stack(name);
      if (stack.at(-1)?.scope === scope) stack.pop();
      stack.push({ value, scope });
    }
    for (const { name, value } of parseCounterList(cs.counterSet, 0)) {
      this.innermost(name, scope).value = value;
    }
    const increments = parseCounterList(cs.counterIncrement, 1);
    if (cs.display === 'list-item' && !increments.some((c) => c.name === 'list-item')) {
      increments.push({ name: 'list-item', value: 1 });
    }
    for (const { name, value } of increments) this.innermost(name, scope).value += value;
  }

  values(name: string): number[] {
    return (this.stacks.get(name) ?? []).map((i) => i.value);
  }

  private stack(name: string): Instance[] {
    let stack = this.stacks.get(name);
    if (!stack) {
      stack = [];
      this.stacks.set(name, stack);
    }
    return stack;
  }

  private innermost(name: string, scope: Element): Instance {
    const stack = this.stack(name);
    const top = stack.at(-1);
    if (top) return top;
    const created = { value: 0, scope };
    stack.push(created);
    return created;
  }
}

function render(
  parts: ContentPart[],
  el: Element,
  counters: Counters,
): (string | { url: string })[] {
  return parts.map((part) => {
    if (part.kind === 'text') return part.text;
    if (part.kind === 'attr') return el.getAttribute(part.name) ?? '';
    if (part.kind === 'image') return { url: part.url };
    if (part.kind === 'counter') {
      return formatCounter(counters.values(part.name).at(-1) ?? 0, part.style);
    }
    return counters
      .values(part.name)
      .map((v) => formatCounter(v, part.style))
      .join(part.separator);
  });
}

const HIDE_BEFORE = 'os-pptx-pseudo-before';
const HIDE_AFTER = 'os-pptx-pseudo-after';
const NO_PSEUDO = new Set([
  'IMG',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BR',
  'HR',
  'IFRAME',
  'VIDEO',
  'CANVAS',
]);
const UNCOPIED = /^(content$|animation|transition|will-change)/;

function materialize(
  el: HTMLElement,
  which: 'before' | 'after',
  ps: CSSStyleDeclaration,
  pieces: (string | { url: string })[],
): HTMLElement {
  const span = document.createElement('span');
  for (let i = 0; i < ps.length; i++) {
    const prop = ps.item(i);
    if (!UNCOPIED.test(prop)) span.style.setProperty(prop, ps.getPropertyValue(prop));
  }
  span.setAttribute('data-os-pseudo', which);
  for (const piece of pieces) {
    if (typeof piece === 'string') {
      if (piece) span.append(piece);
      continue;
    }
    const img = document.createElement('img');
    img.src = piece.url;
    img.alt = '';
    span.append(img);
  }
  if (which === 'before') el.insertBefore(span, el.firstChild);
  else el.append(span);
  el.classList.add(which === 'before' ? HIDE_BEFORE : HIDE_AFTER);
  return span;
}

/**
 * Generated content has no DOM node, so the measurer cannot see it. Each
 * visible `::before`/`::after` is swapped for a real span carrying its
 * computed style — counters resolved — until `restore` puts the page back.
 */
export function materializePseudos(frame: HTMLElement): { restore: () => void } {
  const style = document.createElement('style');
  style.textContent = `.${HIDE_BEFORE}::before, .${HIDE_AFTER}::after { content: none !important; }`;
  const created: HTMLElement[] = [];
  const hosts: HTMLElement[] = [];
  const counters = new Counters();
  const pending: (() => void)[] = [];

  const pseudo = (el: HTMLElement, which: 'before' | 'after') => {
    const ps = getComputedStyle(el, `::${which}`);
    if (ps.display === 'none') return;
    const parts = parseContent(ps.content);
    if (!parts) return;
    counters.enter(el);
    counters.apply(el, ps);
    const pieces = render(parts, el, counters);
    pending.push(() => {
      created.push(materialize(el, which, ps, pieces));
      hosts.push(el);
    });
  };

  const visit = (el: Element) => {
    counters.enter(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    counters.apply(el, cs);
    const host = el instanceof HTMLElement && !NO_PSEUDO.has(el.tagName.toUpperCase());
    if (host) pseudo(el, 'before');
    for (const child of Array.from(el.children)) visit(child);
    if (host) pseudo(el, 'after');
  };
  for (const child of Array.from(frame.children)) visit(child);

  // Counters are read from the untouched tree first, then the spans go in.
  if (pending.length > 0) document.head.appendChild(style);
  for (const apply of pending) apply();

  return {
    restore: () => {
      for (const span of created) span.remove();
      for (const host of hosts) host.classList.remove(HIDE_BEFORE, HIDE_AFTER);
      style.remove();
    },
  };
}
