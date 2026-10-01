import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readFontInfo, readTables } from '../app/lib/pptx/sfnt.ts';
import { decodeWoff2 } from './woff2.ts';

const require = createRequire(import.meta.url);
const brotli = (data: Uint8Array) => new Uint8Array(brotliDecompressSync(data));
const geist = new Uint8Array(
  readFileSync(require.resolve('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')),
);

describe('decodeWoff2', () => {
  const sfnt = decodeWoff2(geist, brotli);
  const { tables } = readTables(sfnt);
  const u16 = (t: Uint8Array, o: number) => (t[o] << 8) | t[o + 1];
  const i16 = (t: Uint8Array, o: number) => (u16(t, o) << 16) >> 16;

  it('restores every table and a balanced checksum', () => {
    for (const tag of ['head', 'hhea', 'maxp', 'name', 'OS/2', 'cmap', 'glyf', 'loca', 'hmtx']) {
      expect(tables.has(tag), tag).toBe(true);
    }
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    let sum = 0;
    for (let i = 0; i < sfnt.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
    expect(sum).toBe(0xb1b0afba);
    expect(readFontInfo(sfnt)).toMatchObject({ variable: true });
  });

  it('rebuilds loca and glyf so every glyph parses inside its slot', () => {
    const head = tables.get('head') as Uint8Array;
    const maxp = tables.get('maxp') as Uint8Array;
    const loca = tables.get('loca') as Uint8Array;
    const glyf = tables.get('glyf') as Uint8Array;
    const numGlyphs = u16(maxp, 4);
    const long = i16(head, 50) === 1;
    const offsetAt = (i: number) =>
      long
        ? ((loca[i * 4] << 24) |
            (loca[i * 4 + 1] << 16) |
            (loca[i * 4 + 2] << 8) |
            loca[i * 4 + 3]) >>>
          0
        : u16(loca, i * 2) * 2;
    expect(loca.length).toBe((numGlyphs + 1) * (long ? 4 : 2));
    let contours = 0;
    for (let g = 0; g < numGlyphs; g++) {
      const start = offsetAt(g);
      const end = offsetAt(g + 1);
      expect(end).toBeGreaterThanOrEqual(start);
      if (end === start) continue;
      const n = i16(glyf, start);
      expect(i16(glyf, start + 2)).toBeLessThanOrEqual(i16(glyf, start + 6));
      expect(i16(glyf, start + 4)).toBeLessThanOrEqual(i16(glyf, start + 8));
      if (n > 0) {
        const lastPoint = u16(glyf, start + 10 + (n - 1) * 2);
        expect(lastPoint).toBeLessThan(2000);
        contours += n;
      }
    }
    expect(offsetAt(numGlyphs)).toBeLessThanOrEqual(glyf.length);
    expect(contours).toBeGreaterThan(numGlyphs / 2);
  });

  it('rebuilds hmtx to the size hhea promises', () => {
    const hhea = tables.get('hhea') as Uint8Array;
    const maxp = tables.get('maxp') as Uint8Array;
    const metrics = u16(hhea, 34);
    expect(tables.get('hmtx')?.length).toBe(metrics * 4 + (u16(maxp, 4) - metrics) * 2);
  });

  it('refuses input that is not WOFF2', () => {
    expect(() => decodeWoff2(sfnt, brotli)).toThrow();
  });
});
