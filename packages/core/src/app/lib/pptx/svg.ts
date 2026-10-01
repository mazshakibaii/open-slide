import { type ColorParser, toHex } from './css';
import type { Rect } from './scene';

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
