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
