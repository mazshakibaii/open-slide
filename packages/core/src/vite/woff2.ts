import { buildSfnt, type SfntTable } from '../app/lib/pptx/sfnt.ts';

// WOFF2 (W3C Recommendation, 2024): brotli-compressed tables, with glyf/loca and
// optionally hmtx stored in transformed forms that are rebuilt here into plain sfnt.

const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

class Reader {
  pos = 0;
  constructor(private readonly data: Uint8Array) {}

  private need(n: number): void {
    if (this.pos + n > this.data.length) throw new Error('WOFF2 data ends early');
  }

  u8(): number {
    this.need(1);
    return this.data[this.pos++];
  }

  u16(): number {
    this.need(2);
    const v = (this.data[this.pos] << 8) | this.data[this.pos + 1];
    this.pos += 2;
    return v;
  }

  i16(): number {
    return (this.u16() << 16) >> 16;
  }

  u32(): number {
    return ((this.u16() << 16) | this.u16()) >>> 0;
  }

  span(start: number, end: number): Uint8Array {
    return this.data.subarray(start, end);
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  base128(): number {
    let result = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      if (i === 0 && b === 0x80) throw new Error('UIntBase128 has a leading zero');
      result = result * 128 + (b & 0x7f);
      if (result > 0xffffffff) throw new Error('UIntBase128 overflows');
      if ((b & 0x80) === 0) return result;
    }
    throw new Error('UIntBase128 is too long');
  }

  u255(): number {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

class Writer {
  private buf = new Uint8Array(1024);
  length = 0;

  private grow(n: number): void {
    if (this.length + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.length + n));
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }

  u8(v: number): void {
    this.grow(1);
    this.buf[this.length++] = v & 0xff;
  }

  u16(v: number): void {
    this.u8(v >> 8);
    this.u8(v);
  }

  u32(v: number): void {
    this.u16(v >>> 16);
    this.u16(v & 0xffff);
  }

  bytes(b: Uint8Array): void {
    this.grow(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }

  pad(to: number): void {
    while (this.length % to !== 0) this.u8(0);
  }

  result(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

const withSign = (flag: number, value: number) => (flag & 1 ? value : -value);

type Point = { x: number; y: number; on: boolean };

function decodePoints(flags: Uint8Array, glyphs: Reader): Point[] {
  const points: Point[] = [];
  let x = 0;
  let y = 0;
  for (const raw of flags) {
    const flag = raw & 0x7f;
    let dx: number;
    let dy: number;
    if (flag < 10) {
      dx = 0;
      dy = withSign(flag, ((flag & 14) << 7) + glyphs.u8());
    } else if (flag < 20) {
      dx = withSign(flag, (((flag - 10) & 14) << 7) + glyphs.u8());
      dy = 0;
    } else if (flag < 84) {
      const b0 = flag - 20;
      const b1 = glyphs.u8();
      dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4));
      dy = withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
    } else if (flag < 120) {
      const b0 = flag - 84;
      dx = withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + glyphs.u8());
      dy = withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + glyphs.u8());
    } else if (flag < 124) {
      const b0 = glyphs.u8();
      const b1 = glyphs.u8();
      const b2 = glyphs.u8();
      dx = withSign(flag, (b0 << 4) + (b1 >> 4));
      dy = withSign(flag >> 1, ((b1 & 0x0f) << 8) + b2);
    } else {
      const b0 = glyphs.u8();
      const b1 = glyphs.u8();
      const b2 = glyphs.u8();
      const b3 = glyphs.u8();
      dx = withSign(flag, (b0 << 8) + b1);
      dy = withSign(flag >> 1, (b2 << 8) + b3);
    }
    x += dx;
    y += dy;
    points.push({ x, y, on: (raw & 0x80) === 0 });
  }
  return points;
}

function writeSimpleGlyph(
  out: Writer,
  endPoints: number[],
  points: Point[],
  bbox: number[],
  instructions: Uint8Array,
  overlap: boolean,
): void {
  out.u16(endPoints.length);
  for (const v of bbox) out.u16(v & 0xffff);
  for (const end of endPoints) out.u16(end);
  out.u16(instructions.length);
  out.bytes(instructions);
  const xs = new Writer();
  const ys = new Writer();
  let px = 0;
  let py = 0;
  points.forEach((p, i) => {
    let flag = p.on ? 0x01 : 0;
    if (i === 0 && overlap) flag |= 0x40;
    const dx = p.x - px;
    const dy = p.y - py;
    if (dx === 0) flag |= 0x10;
    else if (dx >= -255 && dx <= 255) {
      flag |= 0x02 | (dx > 0 ? 0x10 : 0);
      xs.u8(Math.abs(dx));
    } else xs.u16(dx & 0xffff);
    if (dy === 0) flag |= 0x20;
    else if (dy >= -255 && dy <= 255) {
      flag |= 0x04 | (dy > 0 ? 0x20 : 0);
      ys.u8(Math.abs(dy));
    } else ys.u16(dy & 0xffff);
    out.u8(flag);
    px = p.x;
    py = p.y;
  });
  out.bytes(xs.result());
  out.bytes(ys.result());
}

function rebuildGlyf(data: Uint8Array): {
  glyf: Uint8Array;
  loca: Uint8Array;
  xMins: number[];
} {
  const header = new Reader(data);
  header.u16();
  const options = header.u16();
  const numGlyphs = header.u16();
  const indexFormat = header.u16();
  const sizes = Array.from({ length: 7 }, () => header.u32());
  let offset = header.pos;
  const stream = (size: number) => {
    const r = new Reader(data.subarray(offset, offset + size));
    offset += size;
    return r;
  };
  const nContours = stream(sizes[0]);
  const nPoints = stream(sizes[1]);
  const flagStream = stream(sizes[2]);
  const glyphs = stream(sizes[3]);
  const composites = stream(sizes[4]);
  const bboxes = stream(sizes[5]);
  const instructions = stream(sizes[6]);
  const bboxBitmap = bboxes.bytes(4 * ((numGlyphs + 31) >> 5));
  const overlapBitmap = options & 1 ? data.subarray(offset, offset + ((numGlyphs + 7) >> 3)) : null;
  const bit = (bitmap: Uint8Array | null, g: number) =>
    !!bitmap && (bitmap[g >> 3] & (0x80 >> (g & 7))) !== 0;

  const out = new Writer();
  const align = indexFormat === 0 ? 2 : 4;
  const offsets: number[] = [];
  const xMins: number[] = [];
  for (let g = 0; g < numGlyphs; g++) {
    offsets.push(out.length);
    const contours = nContours.i16();
    const hasBbox = bit(bboxBitmap, g);
    if (contours === 0) {
      if (hasBbox) throw new Error('empty glyph with a bounding box');
      xMins.push(0);
      continue;
    }
    if (contours === -1) {
      if (!hasBbox) throw new Error('composite glyph without a bounding box');
      const bbox = [bboxes.i16(), bboxes.i16(), bboxes.i16(), bboxes.i16()];
      const start = composites.pos;
      let flags: number;
      let hasInstructions = false;
      do {
        flags = composites.u16();
        hasInstructions ||= (flags & 0x0100) !== 0;
        composites.bytes(2 + (flags & 0x0001 ? 4 : 2));
        if (flags & 0x0008) composites.bytes(2);
        else if (flags & 0x0040) composites.bytes(4);
        else if (flags & 0x0080) composites.bytes(8);
      } while (flags & 0x0020);
      const component = composites.span(start, composites.pos);
      out.u16(0xffff);
      for (const v of bbox) out.u16(v & 0xffff);
      out.bytes(component);
      if (hasInstructions) {
        const length = glyphs.u255();
        out.u16(length);
        out.bytes(instructions.bytes(length));
      }
      xMins.push(bbox[0]);
      out.pad(align);
      continue;
    }
    if (contours < 0) throw new Error('invalid contour count');
    const endPoints: number[] = [];
    let total = 0;
    for (let c = 0; c < contours; c++) {
      total += nPoints.u255();
      endPoints.push(total - 1);
    }
    const points = decodePoints(flagStream.bytes(total), glyphs);
    const program = instructions.bytes(glyphs.u255());
    let bbox: number[];
    if (hasBbox) bbox = [bboxes.i16(), bboxes.i16(), bboxes.i16(), bboxes.i16()];
    else {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      bbox = points.length
        ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
        : [0, 0, 0, 0];
    }
    writeSimpleGlyph(out, endPoints, points, bbox, program, bit(overlapBitmap, g));
    xMins.push(bbox[0]);
    out.pad(align);
  }
  offsets.push(out.length);

  const loca = new Writer();
  for (const o of offsets) {
    if (indexFormat === 0) loca.u16(o / 2);
    else loca.u32(o);
  }
  return { glyf: out.result(), loca: loca.result(), xMins };
}

function rebuildHmtx(
  data: Uint8Array,
  numGlyphs: number,
  numHMetrics: number,
  xMins: number[],
): Uint8Array {
  const r = new Reader(data);
  const flags = r.u8();
  const advances = Array.from({ length: numHMetrics }, () => r.u16());
  const lsbs =
    flags & 1 ? xMins.slice(0, numHMetrics) : Array.from({ length: numHMetrics }, () => r.i16());
  const rest =
    flags & 2
      ? xMins.slice(numHMetrics, numGlyphs)
      : Array.from({ length: numGlyphs - numHMetrics }, () => r.i16());
  const out = new Writer();
  for (let i = 0; i < numHMetrics; i++) {
    out.u16(advances[i]);
    out.u16(lsbs[i] & 0xffff);
  }
  for (const lsb of rest) out.u16(lsb & 0xffff);
  return out.result();
}

/** Decodes a WOFF2 file into the sfnt (TrueType/OpenType) bytes it was made from. */
export function decodeWoff2(
  input: Uint8Array,
  brotliDecompress: (data: Uint8Array) => Uint8Array,
): Uint8Array {
  const r = new Reader(input);
  if (r.u32() !== 0x774f4632) throw new Error('not a WOFF2 file');
  const flavor = r.u32();
  if (flavor === 0x74746366) throw new Error('WOFF2 font collections are not supported');
  r.u32();
  const numTables = r.u16();
  r.u16();
  r.u32();
  const compressedSize = r.u32();
  r.bytes(24);
  const entries = Array.from({ length: numTables }, () => {
    const flags = r.u8();
    const index = flags & 0x3f;
    const tag =
      index === 63 ? String.fromCharCode(...Array.from(r.bytes(4))) : (KNOWN_TAGS[index] ?? '????');
    const version = flags >> 6;
    const origLength = r.base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const length = transformed ? r.base128() : origLength;
    return { tag, version, origLength, length, transformed };
  });
  const stream = brotliDecompress(input.subarray(r.pos, r.pos + compressedSize));
  const raw = new Map<string, Uint8Array>();
  let offset = 0;
  for (const e of entries) {
    if (offset + e.length > stream.length) throw new Error('WOFF2 table runs past the stream');
    raw.set(e.tag, stream.subarray(offset, offset + e.length));
    offset += e.length;
  }

  const tables = new Map<string, Uint8Array>(raw);
  let xMins: number[] = [];
  const glyfEntry = entries.find((e) => e.tag === 'glyf');
  if (glyfEntry?.transformed) {
    const rebuilt = rebuildGlyf(raw.get('glyf') as Uint8Array);
    tables.set('glyf', rebuilt.glyf);
    tables.set('loca', rebuilt.loca);
    xMins = rebuilt.xMins;
  }
  const hmtxEntry = entries.find((e) => e.tag === 'hmtx');
  if (hmtxEntry?.transformed) {
    const hhea = tables.get('hhea');
    const maxp = tables.get('maxp');
    if (!hhea || !maxp || xMins.length === 0) throw new Error('hmtx transform needs glyf');
    const numHMetrics = (hhea[34] << 8) | hhea[35];
    const numGlyphs = (maxp[4] << 8) | maxp[5];
    tables.set('hmtx', rebuildHmtx(raw.get('hmtx') as Uint8Array, numGlyphs, numHMetrics, xMins));
  }
  const list: SfntTable[] = [...tables].map(([tag, data]) => ({ tag, data }));
  return buildSfnt(flavor, list);
}
