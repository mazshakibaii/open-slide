import { expect, test } from '@playwright/test';
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
