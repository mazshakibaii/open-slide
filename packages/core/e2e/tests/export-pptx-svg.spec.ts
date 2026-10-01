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
