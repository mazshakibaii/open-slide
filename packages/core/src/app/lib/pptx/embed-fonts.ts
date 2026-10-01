import { unzlibSync } from 'fflate';
import type { EmbeddedFont, FontSlot, Run, SlideScene } from './scene';
import { embeddingVerdict, type FontInfo, readFontInfo, sniffFontFormat, woffToSfnt } from './sfnt';

export type FaceRule = {
  family: string;
  weights: [number, number];
  italic: boolean;
  /** `unicode-range`, or null when the face covers everything. */
  ranges: [number, number][] | null;
  /** Absolute URLs, the formats PowerPoint can take without decoding first. */
  sources: string[];
};

type LoadedFace = { bytes: Uint8Array; info: FontInfo };

export type RunGroup = {
  family: string;
  weight: number;
  italic: boolean;
  runs: Run[];
  chars: Set<number>;
};

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

export function parseWeights(value: string): [number, number] {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  const weight = (t: string) =>
    t === 'bold' ? 700 : t === 'normal' || !t ? 400 : Number(t) || 400;
  if (tokens.length === 0) return [400, 400];
  return [weight(tokens[0]), weight(tokens[1] ?? tokens[0])];
}

export function parseRanges(value: string): [number, number][] | null {
  if (!value.trim()) return null;
  const ranges: [number, number][] = [];
  for (const part of value.split(',')) {
    const m = /^\s*U\+([0-9a-f?]+)(?:-([0-9a-f]+))?\s*$/i.exec(part);
    if (!m) continue;
    if (m[2]) ranges.push([Number.parseInt(m[1], 16), Number.parseInt(m[2], 16)]);
    else
      ranges.push([
        Number.parseInt(m[1].replace(/\?/g, '0'), 16),
        Number.parseInt(m[1].replace(/\?/g, 'f'), 16),
      ]);
  }
  return ranges.length > 0 ? ranges : null;
}

function formatRank(format: string | undefined, url: string): number {
  const kind = (format ?? url.split(/[?#]/)[0].split('.').pop() ?? '').toLowerCase();
  if (/truetype|opentype|ttf|otf/.test(kind)) return 0;
  if (/woff2/.test(kind)) return 2;
  if (/woff/.test(kind)) return 1;
  return 3;
}

export function parseSources(src: string, base: string): string[] {
  const found: { url: string; rank: number }[] = [];
  for (const m of src.matchAll(
    /url\(\s*(["']?)(.*?)\1\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/g,
  )) {
    try {
      const url = new URL(m[2], base).href;
      found.push({ url, rank: formatRank(m[3], url) });
    } catch {}
  }
  return found.sort((a, b) => a.rank - b.rank).map((f) => f.url);
}

function collectFaceRules(): FaceRule[] {
  const rules: FaceRule[] = [];
  const walk = (list: CSSRuleList, base: string) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSFontFaceRule) {
        const s = rule.style;
        const sources = parseSources(s.getPropertyValue('src'), base);
        if (sources.length === 0) continue;
        rules.push({
          family: unquote(s.getPropertyValue('font-family')).toLowerCase(),
          weights: parseWeights(s.getPropertyValue('font-weight')),
          italic: /italic|oblique/.test(s.getPropertyValue('font-style')),
          ranges: parseRanges(s.getPropertyValue('unicode-range')),
          sources,
        });
      } else if (rule instanceof CSSImportRule && rule.styleSheet) {
        walkSheet(rule.styleSheet);
      } else if ('cssRules' in rule) {
        walk((rule as CSSGroupingRule).cssRules, base);
      }
    }
  };
  const walkSheet = (sheet: CSSStyleSheet) => {
    try {
      walk(sheet.cssRules, sheet.href ?? document.baseURI);
    } catch {
      // A cross-origin stylesheet hides its rules.
    }
  };
  for (const sheet of Array.from(document.styleSheets)) walkSheet(sheet);
  return rules;
}

/** CSS font matching, simplified: style first, then the nearest weight (heavier past 500). */
function weightDistance([lo, hi]: [number, number], weight: number): number {
  if (weight >= lo && weight <= hi) return 0;
  const distance = weight < lo ? lo - weight : weight - hi;
  const preferred = weight > 500 ? weight < lo : weight < 400 ? weight > hi : false;
  return distance - (preferred ? 0.5 : 0);
}

export function pickRule(rules: FaceRule[], group: RunGroup): FaceRule | null {
  const candidates = rules.filter((r) => r.family === group.family.toLowerCase());
  if (candidates.length === 0) return null;
  const score = (r: FaceRule) =>
    (r.italic === group.italic ? 0 : 10_000) + weightDistance(r.weights, group.weight);
  const best = Math.min(...candidates.map(score));
  const covered = (r: FaceRule) => {
    if (!r.ranges) return Number.POSITIVE_INFINITY;
    let n = 0;
    for (const ch of group.chars) if (r.ranges.some(([lo, hi]) => ch >= lo && ch <= hi)) n++;
    return n;
  };
  return candidates
    .filter((r) => score(r) === best)
    .reduce((a, b) => (covered(b) > covered(a) ? b : a));
}

async function loadFace(url: string): Promise<LoadedFace | string> {
  const res = await fetch(url);
  if (!res.ok) return `its file could not be fetched (${res.status})`;
  let bytes: Uint8Array = new Uint8Array(await res.arrayBuffer());
  switch (sniffFontFormat(bytes)) {
    case 'sfnt':
      break;
    case 'woff':
      bytes = woffToSfnt(bytes, unzlibSync);
      break;
    case 'woff2': {
      const body = bytes as BlobPart;
      const decoded = await fetch('/__sfnt', { method: 'POST', body: new Blob([body]) }).catch(
        () => null,
      );
      if (!decoded?.ok) return 'decoding WOFF2 needs the open-slide dev server';
      bytes = new Uint8Array(await decoded.arrayBuffer());
      break;
    }
    case 'collection':
      return 'font collections cannot be embedded';
    default:
      return 'its file is not a font';
  }
  const info = readFontInfo(bytes);
  const verdict = embeddingVerdict(info);
  if (!verdict.ok) return verdict.reason;
  return { bytes, info: info as FontInfo };
}

function slotOf(bold: boolean, italic: boolean): FontSlot {
  return bold ? (italic ? 'boldItalic' : 'bold') : italic ? 'italic' : 'regular';
}

function groupRuns(slides: SlideScene[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();
  for (const slide of slides) {
    for (const node of slide.nodes) {
      if (node.kind !== 'text') continue;
      for (const run of node.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.runs))) {
        const { font, weight, italic } = run.style;
        const key = `${font.toLowerCase()}|${weight}|${italic}`;
        let group = groups.get(key);
        if (!group) {
          group = { family: font, weight, italic, runs: [], chars: new Set() };
          groups.set(key, group);
        }
        group.runs.push(run);
        for (const ch of run.text) group.chars.add(ch.codePointAt(0) ?? 0);
      }
    }
  }
  return [...groups.values()];
}

/**
 * Embeds the web fonts the text is set in, so the recipient sees and edits it in
 * the face the deck was designed in. A face is embedded under its own legacy
 * family name (name ID 1), which is what PowerPoint matches a run's typeface
 * against — "Inter Medium" rather than "Inter" with a weight — so runs are
 * renamed to it. Faces that cannot travel keep their CSS family and are named
 * in a console warning.
 */
export async function embedFonts(slides: SlideScene[]): Promise<EmbeddedFont[]> {
  const groups = groupRuns(slides);
  if (groups.length === 0) return [];
  const rules = collectFaceRules();
  const loads = new Map<string, Promise<LoadedFace | string>>();
  const embedded: EmbeddedFont[] = [];
  const warned = new Set<string>();
  for (const group of groups) {
    const rule = pickRule(rules, group);
    if (!rule) continue;
    let face: LoadedFace | string = 'none of its sources could be loaded';
    for (const url of rule.sources) {
      let load = loads.get(url);
      if (!load) {
        load = loadFace(url).catch((err) => String((err as Error).message ?? err));
        loads.set(url, load);
      }
      face = await load;
      if (typeof face !== 'string') break;
    }
    if (typeof face === 'string') {
      if (!warned.has(group.family)) {
        warned.add(group.family);
        console.warn(`[open-slide] pptx export: "${group.family}" is not embedded: ${face}`);
      }
      continue;
    }
    const { info, bytes } = face;
    const slot = slotOf(info.bold, info.italic);
    if (!embedded.some((f) => f.typeface === info.family && f.slot === slot)) {
      embedded.push({ typeface: info.family, slot, bytes });
    }
    // The browser synthesises bold for a face lighter than the weight asked for.
    const bold = info.bold || (group.weight >= 600 && info.weight < 600);
    for (const run of group.runs) run.style = { ...run.style, font: info.family, bold };
  }
  return embedded;
}
