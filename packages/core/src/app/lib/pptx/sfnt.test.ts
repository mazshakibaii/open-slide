import { existsSync, readFileSync } from 'node:fs';
import { unzlibSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildSfnt,
  embeddingVerdict,
  readFontInfo,
  readTables,
  sniffFontFormat,
  woffToSfnt,
} from './sfnt';

function u16(...values: number[]): number[] {
  return values.flatMap((v) => [(v >> 8) & 0xff, v & 0xff]);
}

function u32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function nameTable(names: Record<number, string>): Uint8Array {
  const entries = Object.entries(names).map(([id, text]) => ({
    id: Number(id),
    bytes: Array.from(text).flatMap((ch) => u16(ch.charCodeAt(0))),
  }));
  const header = u16(0, entries.length, 6 + entries.length * 12);
  let offset = 0;
  const records: number[] = [];
  for (const e of entries) {
    records.push(...u16(3, 1, 0x409, e.id, e.bytes.length, offset));
    offset += e.bytes.length;
  }
  return Uint8Array.from([...header, ...records, ...entries.flatMap((e) => e.bytes)]);
}

function os2Table(weight: number, fsType: number, fsSelection: number): Uint8Array {
  const t = new Uint8Array(78);
  t.set(u16(4), 0);
  t.set(u16(weight), 4);
  t.set(u16(fsType), 8);
  t.set(u16(fsSelection), 62);
  return t;
}

function headTable(): Uint8Array {
  const t = new Uint8Array(54);
  t.set(u32(0x00010000), 0);
  t.set(u32(0x12345678), 8);
  t.set(u32(0x5f0f3cf5), 12);
  return t;
}

function font(names: Record<number, string>, weight = 400, fsType = 0, fsSelection = 0x40) {
  return buildSfnt(0x00010000, [
    { tag: 'name', data: nameTable(names) },
    { tag: 'head', data: headTable() },
    { tag: 'OS/2', data: os2Table(weight, fsType, fsSelection) },
  ]);
}

function wholeChecksum(bytes: Uint8Array): number {
  let sum = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}

describe('buildSfnt', () => {
  const bytes = font({ 1: 'Fixture', 2: 'Regular' });

  it('writes a sorted, 4-byte aligned table directory that reads back', () => {
    const { flavor, tables } = readTables(bytes);
    expect(flavor).toBe(0x00010000);
    expect([...tables.keys()]).toEqual(['OS/2', 'head', 'name']);
    expect(bytes.length % 4).toBe(0);
    expect(tables.get('OS/2')?.length).toBe(78);
  });

  it('balances the whole-font checksum through head.checkSumAdjustment', () => {
    expect(wholeChecksum(bytes)).toBe(0xb1b0afba);
  });
});

describe('woffToSfnt', () => {
  it('inflates compressed tables and keeps stored ones', () => {
    const sfnt = font({ 1: 'Fixture', 2: 'Regular' });
    const { tables } = readTables(sfnt);
    const entries = [...tables].map(([tag, data], i) => {
      const packed = i === 0 ? data : zlibSync(data);
      return { tag, data, packed };
    });
    let offset = 44 + entries.length * 20;
    const dir: number[] = [];
    const blobs: number[] = [];
    for (const e of entries) {
      const tag = Array.from(e.tag).map((c) => c.charCodeAt(0));
      dir.push(...tag, ...u32(offset), ...u32(e.packed.length), ...u32(e.data.length), ...u32(0));
      const padded = [...e.packed, ...new Array((4 - (e.packed.length % 4)) % 4).fill(0)];
      blobs.push(...padded);
      offset += padded.length;
    }
    const header = [
      ...u32(0x774f4646),
      ...u32(0x00010000),
      ...u32(44 + dir.length + blobs.length),
      ...u16(entries.length, 0),
      ...u32(sfnt.length),
      ...u16(1, 0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
    ];
    const woff = Uint8Array.from([...header, ...dir, ...blobs]);
    expect(sniffFontFormat(woff)).toBe('woff');
    const decoded = woffToSfnt(woff, unzlibSync);
    expect(readTables(decoded).tables).toEqual(tables);
  });
});

describe('readFontInfo', () => {
  it('reads the legacy family, style bits, weight and permissions', () => {
    const info = readFontInfo(
      font({ 1: 'Fixture Medium', 2: 'Regular', 16: 'Fixture', 17: 'Medium' }, 500),
    );
    expect(info).toMatchObject({
      family: 'Fixture Medium',
      typographicFamily: 'Fixture',
      bold: false,
      italic: false,
      weight: 500,
      fsType: 0,
      variable: false,
    });
    expect(readFontInfo(font({ 1: 'Fixture', 2: 'Bold Italic' }, 700, 0, 0x21))).toMatchObject({
      family: 'Fixture',
      bold: true,
      italic: true,
    });
  });

  it('reads a real TrueType face', () => {
    const path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    if (!existsSync(path)) return;
    const info = readFontInfo(new Uint8Array(readFileSync(path)));
    expect(info).toMatchObject({ family: 'DejaVu Sans', bold: false, italic: false });
  });
});

describe('embeddingVerdict', () => {
  it('honours the foundry permission bits', () => {
    const info = (fsType: number) =>
      readFontInfo(font({ 1: 'Fixture', 2: 'Regular' }, 400, fsType));
    expect(embeddingVerdict(info(0)).ok).toBe(true);
    expect(embeddingVerdict(info(0x0008)).ok).toBe(true);
    expect(embeddingVerdict(info(0x0002)).ok).toBe(false);
    expect(embeddingVerdict(info(0x0200)).ok).toBe(false);
  });
});
