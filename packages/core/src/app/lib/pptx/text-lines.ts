import type { Rect, Run, RunStyle } from './scene';

export type Atom = {
  text: string;
  /** Line-box fragments the text was laid out in; empty for whitespace that collapsed away. */
  rects: Rect[];
  styleKey: string;
  style: RunStyle;
  preserveSpaces: boolean;
  /** Hard line breaks (`<br>`, preserved newlines, block boundaries) right before this text. */
  breaksBefore: number;
};

export type VisualLine = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  sizePx: number;
  /** Index of the hard-break segment the line belongs to. */
  segment: number;
};

/**
 * Groups line fragments into the lines the browser drew. A fragment starts a
 * new line when its centre sits below everything on the current line, which
 * holds for right-to-left and bidi text where x runs either way, and keeps
 * super- and subscripts on the line they decorate.
 */
export function groupIntoLines(atoms: Atom[]): { lines: VisualLine[] } {
  const lines: VisualLine[] = [];
  let segment = 0;
  let current: VisualLine | null = null;
  for (const atom of atoms) {
    if (atom.breaksBefore > 0) {
      segment += atom.breaksBefore;
      current = null;
    }
    for (const r of atom.rects) {
      if (current && r.y + r.h / 2 <= current.bottom) {
        current.top = Math.min(current.top, r.y);
        current.bottom = Math.max(current.bottom, r.y + r.h);
        current.left = Math.min(current.left, r.x);
        current.right = Math.max(current.right, r.x + r.w);
        current.sizePx = Math.max(current.sizePx, atom.style.sizePx);
        continue;
      }
      current = {
        top: r.y,
        bottom: r.y + r.h,
        left: r.x,
        right: r.x + r.w,
        sizePx: atom.style.sizePx,
        segment,
      };
      lines.push(current);
    }
  }
  return { lines };
}

/**
 * The text between hard breaks, as runs. Soft wraps are gone: whitespace
 * collapses the way CSS collapses it, so the reader can wrap the text again.
 */
export function buildSegments(atoms: Atom[]): Run[][] {
  const segments: Run[][] = [[]];
  const meta = new Map<Run, { key: string; preserve: boolean }>();
  const trimEnd = (runs: Run[]) => {
    for (let last = runs.at(-1); last && !meta.get(last)?.preserve; last = runs.at(-1)) {
      last.text = last.text.replace(/ +$/, '');
      if (last.text.length > 0) return;
      runs.pop();
    }
  };
  for (const atom of atoms) {
    for (let i = 0; i < atom.breaksBefore; i++) {
      trimEnd(segments[segments.length - 1]);
      segments.push([]);
    }
    const runs = segments[segments.length - 1];
    let text = atom.text;
    if (!atom.preserveSpaces) {
      text = text.replace(/[\t\n\r ]+/g, ' ');
      const prev = runs.at(-1)?.text ?? '';
      if (text.startsWith(' ') && (prev === '' || prev.endsWith(' '))) text = text.slice(1);
    }
    if (text.length === 0) continue;
    const last = runs.at(-1);
    const lastMeta = last ? meta.get(last) : undefined;
    if (last && lastMeta?.key === atom.styleKey && lastMeta.preserve === atom.preserveSpaces) {
      last.text += text;
      continue;
    }
    const run: Run = { text, style: atom.style };
    meta.set(run, { key: atom.styleKey, preserve: atom.preserveSpaces });
    runs.push(run);
  }
  trimEnd(segments[segments.length - 1]);
  return segments;
}
