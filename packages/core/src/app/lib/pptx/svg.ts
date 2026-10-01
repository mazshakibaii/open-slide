import {
  applyTextTransform,
  type ColorParser,
  isVisibleColor,
  parsePx,
  toHex,
  withAlpha,
} from './css';
import { resolveFontFamily } from './fonts';
import type { Paragraph, Rect, Run, RunStyle, TextNode } from './scene';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** What PowerPoint's SVG renderer cannot draw, or draws differently from the browser. */
const UNSUPPORTED = 'filter, pattern, mask, foreignObject, style, image, textPath, switch, script';

const INHERITED: Record<string, string> = {
  fill: '#000000',
  'fill-opacity': '1',
  'fill-rule': 'nonzero',
  stroke: 'none',
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0',
  'stroke-opacity': '1',
  'clip-rule': 'nonzero',
  visibility: 'visible',
  'marker-start': 'none',
  'marker-mid': 'none',
  'marker-end': 'none',
  'paint-order': 'normal',
};

const NOT_INHERITED: Record<string, string> = {
  opacity: '1',
  display: 'inline',
  'stop-color': '#000000',
  'stop-opacity': '1',
  'clip-path': 'none',
};

const PAINTS: [string, string][] = [
  ['fill', 'fill-opacity'],
  ['stroke', 'stroke-opacity'],
  ['stop-color', 'stop-opacity'],
];

/** A computed value as an SVG presentation attribute: user units, unquoted references. */
export function presentationValue(prop: string, value: string): string {
  let v = value.trim().replace(/url\(\s*["']([^"']*)["']\s*\)/g, 'url($1)');
  if (prop === 'stroke-dasharray' && v !== 'none') {
    v = v
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((t) => t.replace(/px$/, ''))
      .join(' ');
  } else if (/^stroke-(width|dashoffset|miterlimit)$/.test(prop)) {
    v = v.replace(/px$/, '');
  }
  return v;
}

function presentation(
  cs: CSSStyleDeclaration,
  color: ColorParser,
  root: SVGSVGElement,
): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const prop of [...Object.keys(INHERITED), ...Object.keys(NOT_INHERITED)]) {
    out.set(prop, presentationValue(prop, cs.getPropertyValue(prop)));
  }
  for (const [paint, opacity] of PAINTS) {
    const value = out.get(paint) ?? 'none';
    if (value === 'none' || value === '' || value.startsWith('url(')) continue;
    const parsed = color(value);
    if (!parsed) return null;
    out.set(paint, `#${toHex(parsed).toLowerCase()}`);
    if (parsed.a < 0.999) {
      const base = Number.parseFloat(out.get(opacity) ?? '1');
      out.set(opacity, String(Math.round(base * parsed.a * 1000) / 1000));
    }
  }
  for (const value of out.values()) {
    for (const ref of value.matchAll(/url\(#([^)]+)\)/g)) {
      if (!root.querySelector(`#${CSS.escape(ref[1])}`)) return null;
    }
  }
  return out;
}

function inlineUse(
  use: Element,
  orig: Element,
  root: SVGSVGElement,
  clone: SVGSVGElement,
): boolean {
  const id = (use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '').replace(/^#/, '');
  if (!id) return false;
  const ref = clone.querySelector(`#${CSS.escape(id)}`);
  const origRef = root.querySelector(`#${CSS.escape(id)}`);
  if (!ref || !origRef || /^(symbol|svg|use)$/i.test(ref.tagName) || ref.querySelector('use'))
    return false;
  // The instance inherits from the <use> instead of from where it is defined;
  // inline it only when both would hand down the same values.
  const u = getComputedStyle(orig);
  const home = getComputedStyle(origRef.parentElement ?? root);
  if (
    [...Object.keys(INHERITED), 'color'].some(
      (p) => u.getPropertyValue(p) !== home.getPropertyValue(p),
    )
  )
    return false;
  const offset = ['x', 'y'].map((a) => use.getAttribute(a) ?? '0');
  if (offset.some((v) => v.includes('%'))) return false;
  const g = document.createElementNS(SVG_NS, 'g');
  const translate = `translate(${offset.map((v) => Number.parseFloat(v) || 0).join(' ')})`;
  g.setAttribute('transform', [use.getAttribute('transform'), translate].filter(Boolean).join(' '));
  for (const attr of Object.keys(NOT_INHERITED)) {
    const value = use.getAttribute(attr);
    if (value !== null) g.setAttribute(attr, value);
  }
  const copy = ref.cloneNode(true) as Element;
  copy.removeAttribute('id');
  for (const node of Array.from(copy.querySelectorAll('[id]'))) node.removeAttribute('id');
  g.append(copy);
  use.replaceWith(g);
  return true;
}

export type VectorOptions = {
  color: ColorParser;
  /** Native text boxes carry the text, so the companion leaves it out. */
  dropText: boolean;
  /** Elements whose transform comes from CSS rather than a `transform` attribute. */
  cssTransformed: (el: Element) => boolean;
};

/**
 * Serialises a standalone copy of an inline SVG for PowerPoint's svgBlip. Classes
 * and inline styles do not survive the trip, so every element's computed
 * presentation is written as attributes, inheriting wherever its parent
 * already says the same thing.
 */
export function buildVectorCompanion(
  root: SVGSVGElement,
  rect: Rect,
  options: VectorOptions,
): Uint8Array | null {
  if (root.querySelector(options.dropText ? UNSUPPORTED : `${UNSUPPORTED}, text`)) return null;
  const origs = [root, ...Array.from(root.querySelectorAll('*'))];
  if (origs.slice(1).some(options.cssTransformed)) return null;
  const clone = root.cloneNode(true) as SVGSVGElement;
  const clones = [clone, ...Array.from(clone.querySelectorAll('*'))];
  if (origs.length !== clones.length) return null;
  const index = new Map(origs.map((o, i) => [o, i]));
  const values: Map<string, string>[] = [];
  for (const orig of origs) {
    const value = presentation(getComputedStyle(orig), options.color, root);
    if (!value) return null;
    values.push(value);
  }
  clones.forEach((target, i) => {
    const own = values[i];
    const parentIndex = origs[i].parentElement
      ? index.get(origs[i].parentElement as Element)
      : undefined;
    const parent = parentIndex === undefined ? undefined : values[parentIndex];
    for (const [prop, initial] of Object.entries(INHERITED)) {
      const value = own.get(prop) ?? '';
      const inherited = parent ? parent.get(prop) : initial;
      if (value && value !== inherited) target.setAttribute(prop, value);
      else target.removeAttribute(prop);
    }
    for (const [prop, initial] of Object.entries(NOT_INHERITED)) {
      const value = own.get(prop) ?? initial;
      if (i > 0 && value !== initial) target.setAttribute(prop, value);
      else target.removeAttribute(prop);
    }
    for (const attr of Array.from(target.attributes)) {
      if (attr.name === 'class' || attr.name === 'style' || attr.name.startsWith('data-'))
        target.removeAttribute(attr.name);
    }
  });
  for (const use of Array.from(clone.querySelectorAll('use'))) {
    if (!inlineUse(use, origs[clones.indexOf(use)], root, clone)) return null;
  }
  if (options.dropText)
    for (const text of Array.from(clone.querySelectorAll('text'))) text.remove();
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(rect.w));
  clone.setAttribute('height', String(rect.h));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${rect.w} ${rect.h}`);
  try {
    return new TextEncoder().encode(new XMLSerializer().serializeToString(clone));
  } catch {
    return null;
  }
}

/** The scale of a similarity transform without rotation, skew or flip; null otherwise. */
export function uniformScale(m: { a: number; b: number; c: number; d: number }): number | null {
  const eps = 1e-4;
  if (Math.abs(m.b) > eps || Math.abs(m.c) > eps || m.a <= eps || m.d <= eps) return null;
  return Math.abs(m.a - m.d) <= eps * Math.max(1, m.a) ? m.a : null;
}

export function anchorAlign(anchor: string, direction: string): Paragraph['align'] {
  const rtl = direction === 'rtl';
  if (anchor === 'middle') return 'ctr';
  if (anchor === 'end') return rtl ? 'l' : 'r';
  return rtl ? 'r' : 'l';
}

export function collapseSvgSpace(text: string): string {
  return text.replace(/[\n\r\t]/g, ' ').replace(/ {2,}/g, ' ');
}

export type SvgTextChunk = {
  rect: Rect;
  runs: Run[];
  align: Paragraph['align'];
  rtl: boolean;
  sizePx: number;
};

export function textNodeFor(chunk: SvgTextChunk, opacity: number): TextNode {
  const runs = chunk.runs.map((run) => ({
    text: run.text,
    style: {
      ...run.style,
      color: withAlpha(run.style.color, opacity),
      outline: run.style.outline
        ? { ...run.style.outline, color: withAlpha(run.style.outline.color, opacity) }
        : null,
    },
  }));
  const preview = runs
    .map((r) => r.text)
    .join('')
    .trim()
    .slice(0, 40);
  return {
    kind: 'text',
    name: `Text: ${preview}`,
    box: chunk.rect,
    rotationDeg: 0,
    flipV: false,
    wrap: false,
    paragraphs: [
      {
        lineSpacingPx: chunk.rect.h,
        lines: [{ runs, sizePx: chunk.sizePx }],
        align: chunk.align,
        rtl: chunk.rtl,
        bullet: null,
        marginLeftPx: 0,
        indentPx: 0,
        endSizePx: chunk.sizePx,
      },
    ],
  };
}

function svgRunStyle(
  cs: CSSStyleDeclaration,
  scale: number,
  color: ColorParser,
  opacity: number,
): RunStyle | null {
  const fill = color(cs.fill);
  if (!fill) return null;
  const stroke = cs.stroke === 'none' ? null : color(cs.stroke);
  const strokeWidth = parsePx(cs.strokeWidth) * scale;
  const fillAlpha = opacity * Number.parseFloat(cs.fillOpacity || '1');
  const strokeAlpha = opacity * Number.parseFloat(cs.strokeOpacity || '1');
  return {
    font: resolveFontFamily(cs.fontFamily),
    sizePx: parsePx(cs.fontSize) * scale,
    weight: Number.parseInt(cs.fontWeight, 10) || 400,
    bold: (Number.parseInt(cs.fontWeight, 10) || 400) >= 600,
    italic: cs.fontStyle !== 'normal',
    underline: cs.textDecorationLine.includes('underline'),
    strike: cs.textDecorationLine.includes('line-through'),
    color: withAlpha(fill, fillAlpha),
    letterSpacingPx: cs.letterSpacing === 'normal' ? 0 : parsePx(cs.letterSpacing) * scale,
    baselineShift: null,
    shadow: null,
    outline:
      stroke && isVisibleColor(stroke) && strokeWidth > 0
        ? { width: strokeWidth, color: withAlpha(stroke, strokeAlpha) }
        : null,
    caps: cs.textTransform.includes('uppercase') ? 'all' : null,
    kerning: cs.fontKerning !== 'none',
    link: null,
    highlight: null,
    gradient: null,
  };
}

function opacityBetween(el: Element, root: SVGSVGElement): number {
  let opacity = 1;
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    opacity *= Number.parseFloat(getComputedStyle(node).opacity);
  }
  return opacity;
}

function hasEffect(el: Element, root: SVGSVGElement): boolean {
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.clipPath !== 'none' || cs.filter !== 'none') return true;
    const mask = cs.maskImage || (cs as unknown as Record<string, string>).webkitMaskImage;
    if ((mask && mask !== 'none') || node.hasAttribute('mask')) return true;
  }
  return false;
}

function within(outer: DOMRect, r: DOMRect): boolean {
  return (
    r.left >= outer.left - 1 &&
    r.top >= outer.top - 1 &&
    r.right <= outer.right + 1 &&
    r.bottom <= outer.bottom + 1
  );
}

/** Each run of text that starts a new position (`<text>`, or a `<tspan>` with x/y/dy). */
function textChunks(
  text: SVGTextElement,
  root: SVGSVGElement,
  origin: DOMRect,
  color: ColorParser,
): SvgTextChunk[] | null {
  const ctm = text.getScreenCTM();
  const scale = ctm ? uniformScale(ctm) : null;
  if (!scale) return null;
  const cs = getComputedStyle(text);
  if (cs.writingMode !== 'horizontal-tb') return null;
  if (text.querySelector('textPath') || hasEffect(text, root)) return null;
  if (text.hasAttribute('textLength') || text.querySelector('[textLength]')) return null;

  const viewport = root.getBoundingClientRect();
  const range = document.createRange();
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  const chunks: (SvgTextChunk & { key: Element })[] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent) continue;
    const pcs = getComputedStyle(parent);
    if (pcs.display === 'none' || pcs.visibility === 'hidden') continue;
    let key: Element = text;
    for (let el: Element | null = parent; el && el !== text; el = el.parentElement) {
      if (['x', 'y', 'dy'].some((a) => el?.hasAttribute(a))) {
        key = el;
        break;
      }
    }
    const style = svgRunStyle(pcs, scale, color, opacityBetween(parent, root));
    if (!style) return null;
    const preserve = /^pre/.test(pcs.whiteSpace) || parent.closest('[xml\\:space="preserve"]');
    const content = applyTextTransform(
      preserve ? node.data : collapseSvgSpace(node.data),
      pcs.textTransform.includes('uppercase') ? 'none' : pcs.textTransform,
    );
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    let chunk = chunks.at(-1);
    if (!chunk || chunk.key !== key) {
      const kcs = key === parent ? pcs : getComputedStyle(key);
      chunk = {
        key,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        runs: [],
        align: anchorAlign(kcs.textAnchor, kcs.direction),
        rtl: kcs.direction === 'rtl',
        sizePx: style.sizePx,
      };
      chunks.push(chunk);
    }
    if (r.width > 0.01 && r.height > 0.01) {
      if (!within(viewport, r)) return null;
      const rect = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
      const prev = chunk.rect;
      if (prev.w === 0) chunk.rect = rect;
      else {
        const x = Math.min(prev.x, rect.x);
        const y = Math.min(prev.y, rect.y);
        chunk.rect = {
          x,
          y,
          w: Math.max(prev.x + prev.w, rect.x + rect.w) - x,
          h: Math.max(prev.y + prev.h, rect.y + rect.h) - y,
        };
      }
    }
    chunk.sizePx = Math.max(chunk.sizePx, style.sizePx);
    const last = chunk.runs.at(-1);
    if (last && JSON.stringify(last.style) === JSON.stringify(style)) last.text += content;
    else chunk.runs.push({ text: content, style });
  }
  return chunks
    .map(({ key: _, ...chunk }) => {
      const first = chunk.runs[0];
      const last = chunk.runs.at(-1);
      if (first) first.text = first.text.replace(/^ +/, '');
      if (last) last.text = last.text.replace(/ +$/, '');
      return { ...chunk, runs: chunk.runs.filter((r) => r.text.length > 0) };
    })
    .filter((chunk) => chunk.runs.length > 0 && chunk.rect.w > 0);
}

/**
 * Reads every outer SVG's text as it is drawn — before the measurer switches
 * transforms off — as native text boxes to lay over the graphic. An SVG maps
 * to null when any of its text cannot be reproduced that way (rotated, on a
 * path, clipped, stretched, painted with a gradient), so it keeps its text in
 * the picture.
 */
export function snapshotSvgText(
  frame: HTMLElement,
  color: ColorParser,
): Map<SVGSVGElement, SvgTextChunk[] | null> {
  const out = new Map<SVGSVGElement, SvgTextChunk[] | null>();
  const origin = frame.getBoundingClientRect();
  for (const root of Array.from(frame.querySelectorAll('svg'))) {
    if (root.ownerSVGElement) continue;
    const texts = Array.from(root.querySelectorAll('text'));
    if (texts.length === 0) continue;
    const chunks: SvgTextChunk[] = [];
    let ok = true;
    for (const text of texts) {
      const found = textChunks(text, root, origin, color);
      if (!found) {
        ok = false;
        break;
      }
      chunks.push(...found);
    }
    out.set(root, ok ? chunks : null);
  }
  return out;
}
