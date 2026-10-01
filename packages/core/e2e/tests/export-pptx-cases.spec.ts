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
  parts = unzipSync(new Uint8Array(await fs.readFile(await file.path())));
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
