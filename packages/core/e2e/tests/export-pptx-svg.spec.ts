import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openSlide } from './helpers.ts';

type Parts = Record<string, Uint8Array>;

let parts: Parts;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await openSlide(page, 'pptx-svg');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export as PPTX', exact: true }).click();
  const file = await download;
  const bytes = await fs.readFile(await file.path());
  if (process.env.PPTX_SVG_OUT) await fs.writeFile(process.env.PPTX_SVG_OUT, bytes);
  parts = unzipSync(new Uint8Array(bytes));
  await page.close();
});

function slide(n: number): string {
  const xml = parts[`ppt/slides/slide${n}.xml`];
  if (!xml) throw new Error(`slide ${n} missing`);
  return strFromU8(xml);
}

function pictures(xml: string): string[] {
  return Array.from(xml.matchAll(/<p:pic>.*?<\/p:pic>/gs), (m) => m[0]);
}

function companionOf(slideNumber: number, picture: string): string {
  const rId = /<asvg:svgBlip [^>]*r:embed="(rId\d+)"/.exec(picture)?.[1];
  if (!rId) throw new Error('picture has no vector companion');
  const rels = strFromU8(parts[`ppt/slides/_rels/slide${slideNumber}.xml.rels`]);
  const target = new RegExp(`Id="${rId}"[^>]*Target="\\.\\./media/([^"]+)"`).exec(rels)?.[1];
  return strFromU8(parts[`ppt/media/${target}`]);
}

test('keeps a classed icon vector, with its CSS-driven paint written out', () => {
  const icon = pictures(slide(1)).find((p) => p.includes('descr="Check"'));
  expect(icon).toBeDefined();
  const svg = companionOf(1, icon as string);
  expect(svg).not.toContain('class=');
  expect(svg).not.toContain('currentColor');
  expect(svg).toContain('stroke="#2563eb"');
  expect(svg).toContain('stroke-width="3"');
});

test('inlines <use> references and class fills into the vector companion', () => {
  const graphic = pictures(slide(1)).find((p) => p.includes('svgBlip') && !p.includes('Check'));
  expect(graphic).toBeDefined();
  const svg = companionOf(1, graphic as string);
  expect(svg).not.toContain('<use');
  expect(svg.match(/<circle /g)?.length).toBeGreaterThanOrEqual(3);
  expect(svg).toContain('translate(60 0)');
  expect(svg).toContain('fill="#f59e0b"');
});

test('keeps an opaque SVG vector rather than flattening it to a JPEG', () => {
  const badge = pictures(slide(1)).find((p) => p.includes('descr="Opaque badge"'));
  expect(badge).toBeDefined();
  expect(companionOf(1, badge as string)).toContain('<circle');
});

const EMU_PER_PX = 6350;

function shapes(xml: string): string[] {
  return Array.from(xml.matchAll(/<p:(sp|pic)>.*?<\/p:\1>/gs), (m) => m[0]);
}

function box(shape: string): { x: number; y: number; w: number; h: number } {
  const m = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(shape);
  if (!m) throw new Error('shape has no geometry');
  const [x, y, w, h] = m.slice(1).map((v) => Math.round(Number(v) / EMU_PER_PX));
  return { x, y, w, h };
}

function textOf(shape: string): string {
  return Array.from(shape.matchAll(/<a:t>([^<]*)<\/a:t>/g), (m) => m[1]).join('');
}

test('exports SVG text as text boxes over the graphic, scaled with the viewBox', () => {
  const xml = slide(2);
  const label = shapes(xml).find((s) => textOf(s) === 'Diagram label in SVG text');
  expect(label).toBeDefined();
  expect(label).toContain('<a:bodyPr wrap="none"');
  expect(label).toContain('sz="2000"');
  expect(label).toMatch(/b="1"[^>]*>(?:(?!<\/a:r>).)*<a:t>SVG<\/a:t>/);
  const b = box(label as string);
  expect(b.x).toBeGreaterThanOrEqual(95);
  expect(b.x).toBeLessThanOrEqual(110);

  const caption = shapes(xml).find((s) => textOf(s) === 'Centred caption');
  expect(caption).toContain('algn="ctr"');
  expect(shapes(xml).some((s) => textOf(s) === 'second line')).toBe(true);
});

test('keeps the diagram graphic, vector and without its text', () => {
  const xml = slide(2);
  const graphic = pictures(xml).find((p) => {
    const b = box(p);
    return b.x <= 82 && b.y <= 82 && b.w >= 590;
  });
  expect(graphic).toBeDefined();
  const svg = companionOf(2, graphic as string);
  expect(svg).not.toContain('<text');
  expect(svg).toContain('<rect');
});

test('leaves transformed SVG text in the picture', () => {
  const xml = slide(2);
  expect(xml).not.toContain('<a:t>Tilted words</a:t>');
  expect(pictures(xml).some((p) => box(p).y >= 495 && box(p).y <= 510)).toBe(true);
});

test('leaves the diagram text out of its fallback picture', async ({ page }) => {
  const xml = slide(2);
  const graphic = pictures(xml).find((p) => box(p).x <= 82 && box(p).w >= 590) as string;
  const rId = /<a:blip r:embed="(rId\d+)"/.exec(graphic)?.[1];
  const rels = strFromU8(parts['ppt/slides/_rels/slide2.xml.rels']);
  const target = new RegExp(`Id="${rId}"[^>]*Target="\\.\\./media/([^"]+)"`).exec(rels)?.[1];
  const png = Buffer.from(parts[`ppt/media/${target}`]).toString('base64');
  const inked = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] < 150) count++;
    return count;
  }, png);
  expect(inked).toBe(0);
});
