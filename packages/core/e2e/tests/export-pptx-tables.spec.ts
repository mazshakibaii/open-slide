import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openSlide } from './helpers.ts';

const EMU_PER_PX = 6350;

let parts: Record<string, Uint8Array>;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await openSlide(page, 'pptx-tables');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export as PPTX', exact: true }).click();
  const bytes = await fs.readFile(await (await download).path());
  if (process.env.PPTX_TABLES_OUT) await fs.writeFile(process.env.PPTX_TABLES_OUT, bytes);
  parts = unzipSync(new Uint8Array(bytes));
  await page.close();
});

function slide(n: number): string {
  const xml = parts[`ppt/slides/slide${n}.xml`];
  if (!xml) throw new Error(`slide ${n} missing`);
  return strFromU8(xml);
}

function frames(xml: string): string[] {
  return Array.from(xml.matchAll(/<p:graphicFrame>.*?<\/p:graphicFrame>/gs), (m) => m[0]);
}

function cellWith(table: string, text: string): string {
  const cell = Array.from(table.matchAll(/<a:tc[ >].*?<\/a:tc>/gs), (m) => m[0]).find((c) =>
    c.includes(`<a:t>${text}</a:t>`),
  );
  if (!cell) throw new Error(`no cell with "${text}"`);
  return cell;
}

test('exports a plain table as a native PowerPoint table', () => {
  const xml = slide(1);
  const [table] = frames(xml);
  expect(frames(xml)).toHaveLength(1);
  expect(table).toContain('name="Table #revenue"');
  expect(table).toContain(
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">',
  );
  expect(table.match(/<a:gridCol /g)).toHaveLength(3);
  expect(table.match(/<a:tr /g)).toHaveLength(4);
  expect(xml).not.toContain('name="Text: North"');

  const off = /<p:xfrm><a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(table);
  const [x, , w] = (off?.slice(1) ?? []).map((v) => Number(v) / EMU_PER_PX);
  expect(Math.abs(x - 80)).toBeLessThanOrEqual(2);
  expect(Math.abs(w - 1200)).toBeLessThanOrEqual(4);
});

test('merges spanning cells', () => {
  const [table] = frames(slide(1));
  expect(cellWith(table, 'First half')).toMatch(/^<a:tc gridSpan="2">/);
  expect(table).toMatch(/<a:t>First half<\/a:t>.*?<\/a:tc><a:tc hMerge="1">/s);
  expect(cellWith(table, 'North')).toMatch(/^<a:tc rowSpan="2">/);
  expect(table.match(/<a:tc vMerge="1">/g)).toHaveLength(1);
});

test('carries cell fills, borders, padding, alignment and anchoring', () => {
  const [table] = frames(slide(1));
  expect(cellWith(table, 'Region')).toMatch(
    /<a:solidFill><a:srgbClr val="E2E8F0">[\s\S]*<\/a:tcPr>/,
  );
  expect(cellWith(table, '0.9m')).toContain('<a:srgbClr val="FEF9C3">');
  expect(cellWith(table, '1.4m')).toMatch(
    /<a:lnB w="25400"[^>]*><a:solidFill><a:srgbClr val="DC2626"><\/a:srgbClr><\/a:solidFill><a:prstDash val="dash"\/>/,
  );
  expect(cellWith(table, '1.2m')).toMatch(/<a:lnL w="12700"/);
  // 12px padding plus the half of the collapsed 2px border that sits inside the cell.
  expect(cellWith(table, '1.2m')).toContain(`marL="${13 * EMU_PER_PX}"`);
  expect(cellWith(table, '1.2m')).toContain('algn="r"');
  expect(cellWith(table, 'North')).toContain('anchor="ctr"');
});

test('keeps inline formatting and links inside cells', () => {
  const [table] = frames(slide(1));
  expect(cellWith(table, '2.0m')).toMatch(/b="1"[^>]*>.*<a:t>2\.0m<\/a:t>/s);
  const rId = /<a:hlinkClick r:id="(rId\d+)"/.exec(cellWith(table, 'South'))?.[1];
  const rels = strFromU8(parts['ppt/slides/_rels/slide1.xml.rels']);
  expect(rels).toContain(`Id="${rId}"`);
  expect(rels).toContain('Target="https://example.com/south" TargetMode="External"');
});

test('falls back to boxes for transformed tables and cells with block content', () => {
  const xml = slide(2);
  expect(frames(xml)).toHaveLength(0);
  expect(xml).toContain('name="Text: Tilted cell"');
  expect(xml).toContain('name="Text: Boxed block cell"');
});

test('keeps each cell its own border in the separated model, with the caption beside', () => {
  const xml = slide(3);
  const [table] = frames(xml);
  expect(table).toContain('name="Table #separate"');
  expect(table.match(/<a:gridCol /g)).toHaveLength(2);
  // The whole 2px border sits inside a separated cell, ahead of the padding.
  expect(cellWith(table, 'Plan')).toContain(`marL="${14 * EMU_PER_PX}"`);
  expect(cellWith(table, 'Actual')).toMatch(/<a:lnL w="12700"/);
  expect(xml).toContain('name="Text: Quarterly summary"');
});
