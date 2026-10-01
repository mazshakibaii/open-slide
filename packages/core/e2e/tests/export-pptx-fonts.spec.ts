import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { openSlide } from './helpers.ts';

test('decodes a WOFF2 font into an sfnt that draws the same glyphs', async ({ page }) => {
  await openSlide(page, 'alpha');
  const result = await page.evaluate(async () => {
    const rules: CSSFontFaceRule[] = [];
    const walk = (list: CSSRuleList) => {
      for (const rule of Array.from(list)) {
        if (rule instanceof CSSFontFaceRule) rules.push(rule);
        else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules);
    const rule = rules.find(
      (r) =>
        r.style.getPropertyValue('font-family').includes('Geist') &&
        r.style.getPropertyValue('font-style') !== 'italic' &&
        /U\+0-FF\b/i.test(r.style.getPropertyValue('unicode-range')),
    );
    if (!rule) return { error: 'no Geist face' };
    const raw = /url\("?([^")]+)"?\)/.exec(rule.style.getPropertyValue('src'))?.[1];
    if (!raw) return { error: 'no src' };
    const url = new URL(raw, rule.parentStyleSheet?.href ?? document.baseURI).href;
    const woff2 = await (await fetch(url)).arrayBuffer();
    const res = await fetch('/__sfnt', { method: 'POST', body: woff2 });
    if (!res.ok) return { error: `status ${res.status}` };
    const sfnt = await res.arrayBuffer();
    const original = new FontFace('WoffOriginal', woff2);
    const decoded = new FontFace('WoffDecoded', sfnt);
    await Promise.all([original.load(), decoded.load()]);
    document.fonts.add(original);
    document.fonts.add(decoded);
    const draw = (family: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 120;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.font = `64px ${family}`;
      ctx.fillText('Quartz glyph Wafer ffi 0123 & @!', 10, 80);
      return ctx.getImageData(0, 0, 900, 120).data;
    };
    const a = draw('WoffOriginal');
    const b = draw('WoffDecoded');
    let inked = 0;
    let differing = 0;
    for (let i = 3; i < a.length; i += 4) {
      if (a[i] > 0) inked++;
      if (a[i] !== b[i]) differing++;
    }
    return { magic: new Uint8Array(sfnt.slice(0, 4)).join(','), inked, differing };
  });
  expect(result).toMatchObject({ magic: '0,1,0,0', differing: 0 });
  expect((result as { inked: number }).inked).toBeGreaterThan(1000);
});

test.describe('font embedding', () => {
  let parts: Record<string, Uint8Array>;
  const warnings: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'warning') warnings.push(m.text());
    });
    await openSlide(page, 'pptx-fonts');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export as PPTX', exact: true }).click();
    const file = await download;
    parts = unzipSync(new Uint8Array(await fs.readFile(await file.path())));
    await page.close();
  });

  const runFont = (text: string) => {
    const slide = strFromU8(parts['ppt/slides/slide1.xml']);
    const run = new RegExp(`<a:rPr ([^>]*)>((?:(?!</a:rPr>).)*)</a:rPr><a:t>${text}</a:t>`).exec(
      slide,
    );
    if (!run) throw new Error(`no run "${text}"`);
    return {
      bold: run[1].includes('b="1"'),
      typeface: /<a:latin typeface="([^"]+)"/.exec(run[2])?.[1],
    };
  };

  test('embeds the faces the text uses, under their own family names', () => {
    const presentation = strFromU8(parts['ppt/presentation.xml']);
    const typefaces = Array.from(
      presentation.matchAll(/<p:font typeface="([^"]+)"\/>/g),
      (m) => m[1],
    ).sort();
    expect(typefaces).toEqual(['Fixture Sans', 'Fixture Sans Medium', 'Geist']);
    expect(Object.keys(parts).filter((p) => p.startsWith('ppt/fonts/'))).toHaveLength(3);
    expect(strFromU8(parts['[Content_Types].xml'])).toContain('Extension="fntdata"');
  });

  test('names a medium run by its face instead of faking bold', () => {
    expect(runFont('Regular fixture text')).toEqual({ typeface: 'Fixture Sans', bold: false });
    expect(runFont('Medium fixture text')).toEqual({
      typeface: 'Fixture Sans Medium',
      bold: false,
    });
    expect(runFont('Bold fixture text')).toEqual({ typeface: 'Fixture Sans Medium', bold: true });
    expect(runFont('Geist variable text')).toEqual({ typeface: 'Geist', bold: true });
  });

  test('leaves out a face whose licence forbids embedding, and says so', () => {
    expect(runFont('Locked fixture text').typeface).toBe('Fixture Locked');
    expect(strFromU8(parts['ppt/presentation.xml'])).not.toContain('Fixture Locked');
    expect(warnings.some((w) => w.includes('Fixture Locked'))).toBe(true);
  });
});
