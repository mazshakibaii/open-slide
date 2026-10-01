import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openSlide } from './helpers.ts';

const EMU_PER_PX = 6350;

type Parts = Record<string, Uint8Array>;

let parts: Parts;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await openSlide(page, 'pptx-cases');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export as PPTX', exact: true }).click();
  const file = await download;
  const bytes = await fs.readFile(await file.path());
  if (process.env.PPTX_CASES_OUT) await fs.writeFile(process.env.PPTX_CASES_OUT, bytes);
  parts = unzipSync(new Uint8Array(bytes));
  await page.close();
});

function slide(n: number): string {
  const xml = parts[`ppt/slides/slide${n}.xml`];
  if (!xml) throw new Error(`slide ${n} missing`);
  return strFromU8(xml);
}

function shapes(xml: string): string[] {
  return Array.from(xml.matchAll(/<p:(sp|pic|graphicFrame)>.*?<\/p:\1>/gs), (m) => m[0]);
}

function shapeNamed(xml: string, name: string): string {
  const found = shapes(xml).find((s) => s.includes(`name="${name}`));
  if (!found) throw new Error(`no shape named "${name}"`);
  return found;
}

function box(shape: string): { x: number; y: number; w: number; h: number } {
  const m = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(shape);
  if (!m) throw new Error('shape has no geometry');
  const [x, y, w, h] = m.slice(1).map((v) => Math.round(Number(v) / EMU_PER_PX));
  return { x, y, w, h };
}

test('places absolute content of later pages against their own canvas', () => {
  const marker = box(shapeNamed(slide(2), 'Text: Unpositioned root marker'));
  expect(marker.x).toBeGreaterThanOrEqual(195);
  expect(marker.x).toBeLessThanOrEqual(205);
  expect(marker.y).toBeGreaterThanOrEqual(290);
  expect(marker.y).toBeLessThanOrEqual(310);
});

test('keeps the visible layer of a Tailwind shadow list', () => {
  const card = shapeNamed(slide(3), 'Rounded Rectangle #tw-shadow');
  const shadow = /<a:outerShdw [^>]*dist="(\d+)"[^>]*>(.*?)<\/a:outerShdw>/.exec(card);
  expect(shadow).not.toBeNull();
  expect(Number(shadow?.[1])).toBeGreaterThan(0);
  expect(shadow?.[2]).not.toContain('<a:alpha val="0"/>');
});

test('places an image by a length object-position', () => {
  const xml = slide(3);
  expect(xml).not.toContain('NaN');
  const image = box(shapeNamed(xml, 'Image: Positioned'));
  expect(image).toEqual({ x: 530, y: 340, w: 190, h: 180 });
});

test('keeps text native under filters that draw nothing', () => {
  const xml = slide(3);
  expect(shapeNamed(xml, 'Text: Settled blur-in heading')).toContain('txBox="1"');
  expect(shapeNamed(xml, 'Text: Half opacity filter')).toContain('<a:alpha val="50000"/>');
});

function pictureAt(xml: string, x: number, y: number): string | undefined {
  return shapes(xml).find((s) => {
    if (!s.startsWith('<p:pic>')) return false;
    const b = box(s);
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  });
}

test('rasterises a 3D-transformed element instead of dropping it', () => {
  const picture = pictureAt(slide(3), 280, 800);
  expect(picture).toBeDefined();
  expect(picture).toContain('name="Rendered image"');
});

function order(xml: string, name: string): number {
  const index = shapes(xml).findIndex((s) => s.includes(`name="${name}`));
  if (index < 0) throw new Error(`no shape named "${name}"`);
  return index;
}

test('paints negative z-index children beneath their stacking context content', () => {
  const xml = slide(4);
  expect(order(xml, 'Rounded Rectangle #blob-in-context')).toBeLessThan(
    order(xml, 'Text: Text above a blob'),
  );
  expect(order(xml, 'Rounded Rectangle #blob-under-panel')).toBeLessThan(
    order(xml, 'Rectangle #panel'),
  );
});

test('links runs to their href', () => {
  const xml = slide(5);
  const rels = strFromU8(parts['ppt/slides/_rels/slide5.xml.rels']);
  const run =
    /<a:r><a:rPr [^>]*>(?:(?!<\/a:rPr>).)*<a:hlinkClick r:id="(rId\d+)"[\s\S]*?<a:t>documentation<\/a:t>/.exec(
      xml,
    );
  expect(run).not.toBeNull();
  expect(rels).toContain(`Id="${run?.[1]}"`);
  expect(rels).toContain('Target="https://example.com/docs" TargetMode="External"');
});

test('keeps source case and exports capitals as a run property', () => {
  const xml = slide(5);
  expect(shapeNamed(xml, 'Text: Shouting label')).toContain('cap="all"');
  expect(xml).toContain('<a:t>Shouting label</a:t>');
  expect(shapeNamed(xml, 'Text: Small caps label')).toContain('cap="small"');
});

test('carries image alt text as the picture description', () => {
  expect(slide(5)).toContain('name="Image: Gradient swatch" descr="Gradient swatch"');
});

function mediaOf(slideNumber: number, picture: string): Uint8Array {
  const rId = /<a:blip r:embed="(rId\d+)"/.exec(picture)?.[1];
  const rels = strFromU8(parts[`ppt/slides/_rels/slide${slideNumber}.xml.rels`]);
  const target = new RegExp(`Id="${rId}"[^>]*Target="\\.\\./media/([^"]+)"`).exec(rels)?.[1];
  const bytes = target ? parts[`ppt/media/${target}`] : undefined;
  if (!bytes) throw new Error(`no media for ${rId}`);
  return bytes;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('downsamples an image stored far larger than it is drawn', () => {
  const picture = shapeNamed(slide(5), 'Image: Oversized');
  expect(pngSize(mediaOf(5, picture))).toEqual({ width: 320, height: 160 });
});

function textOf(shape: string): string {
  return Array.from(shape.matchAll(/<a:t>([^<]*)<\/a:t>|<a:br>/g), (m) => m[1] ?? '\n').join('');
}

test('lets a wrapped paragraph re-wrap at its column instead of freezing its lines', () => {
  const shape = shapeNamed(slide(6), 'Text: This paragraph wraps');
  expect(shape).toContain('<a:bodyPr wrap="square"');
  expect(shape).not.toContain('<a:br>');
  expect(textOf(shape)).toBe(
    'This paragraph wraps inside a five hundred and sixty pixel column, so it has to arrive as text that wraps rather than as frozen lines.',
  );
  const b = box(shape);
  expect(b.x).toBe(80);
  expect(b.w).toBeGreaterThanOrEqual(560);
  expect(b.w).toBeLessThanOrEqual(567);
});

test('keeps only the line breaks the author wrote', () => {
  const shape = shapeNamed(slide(6), 'Text: First line ends here');
  expect(shape.match(/<a:br>/g)).toHaveLength(1);
  expect(textOf(shape)).toBe('First line ends here\nsecond line after a break.');
});

test('exports right-to-left paragraphs as right-to-left text', () => {
  const shape = shapeNamed(slide(6), 'Text: שלום');
  expect(shape).toContain('algn="r" rtl="1"');
  expect(shape).not.toContain('marL=');
  expect(shape).not.toContain('<a:br>');
  expect(textOf(shape)).toBe('שלום עולם, זוהי פסקה ארוכה בעברית שעוברת שורה בתוך התיבה');
});

test('truncates clipped text where the browser did, with its ellipsis', () => {
  const ellipsis = textOf(shapeNamed(slide(6), 'Text: A very long single'));
  expect(ellipsis.endsWith('…')).toBe(true);
  expect(ellipsis).not.toContain('pixels');
  const clamped = textOf(shapeNamed(slide(6), 'Text: Clamped to two lines'));
  expect(clamped.endsWith('…')).toBe(true);
  expect(clamped).not.toContain('eighteen');
  expect(clamped).toContain('four five six');
});

test('carries text-indent', () => {
  expect(shapeNamed(slide(6), 'Text: Text-indent pushes')).toContain(`indent="${48 * EMU_PER_PX}"`);
});

test('does not wrap nowrap text or a single line sized to itself', () => {
  expect(shapeNamed(slide(6), 'Text: Never wrapping label')).toContain('<a:bodyPr wrap="none"');
  expect(shapeNamed(slide(6), 'Text: Shrink to fit')).toContain('<a:bodyPr wrap="none"');
});

test('highlights a plain inline background on the run', () => {
  const shape = shapeNamed(slide(6), 'Text: Inline highlighted phrase');
  expect(shape).toMatch(
    /<a:highlight><a:srgbClr val="FDE047">[\s\S]*?<a:t>highlighted phrase<\/a:t>/,
  );
});

test('merges a plain list into one text box with a paragraph per item', () => {
  const xml = slide(6);
  const bullets = shapeNamed(xml, 'Text: Disc bullet one');
  expect(bullets).toContain('Nested child');
  expect(bullets.match(/<a:p>/g)).toHaveLength(4);
  expect(bullets.match(/<a:buChar /g)).toHaveLength(4);
  expect(bullets).toContain('lvl="1"');
  expect(bullets).toMatch(/<a:spcBef><a:spcPts val="[1-9]\d*"\/><\/a:spcBef>/);
  const numbers = shapeNamed(xml, 'Text: First numbered');
  expect(numbers.match(/<a:buAutoNum type="arabicPeriod" startAt="1"\/>/g)).toHaveLength(3);
});
