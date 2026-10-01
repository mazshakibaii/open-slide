export type SfntTable = { tag: string; data: Uint8Array };

export type FontFormat = 'sfnt' | 'woff' | 'woff2' | 'collection';

export function sniffFontFormat(bytes: Uint8Array): FontFormat | null {
  if (bytes.length < 12) return null;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'ttcf') return 'collection';
  if (
    tag === 'OTTO' ||
    tag === 'true' ||
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
  )
    return 'sfnt';
  return null;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

export function readTables(sfnt: Uint8Array): { flavor: number; tables: Map<string, Uint8Array> } {
  const v = view(sfnt);
  const flavor = v.getUint32(0);
  const count = v.getUint16(4);
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const offset = v.getUint32(record + 8);
    const length = v.getUint32(record + 12);
    if (offset + length > sfnt.length) throw new Error('table runs past the end of the font');
    tables.set(tagAt(sfnt, record), sfnt.subarray(offset, offset + length));
  }
  return { flavor, tables };
}

function checksum(bytes: Uint8Array): number {
  const v = view(bytes);
  let sum = 0;
  const whole = bytes.length - (bytes.length % 4);
  for (let i = 0; i < whole; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  if (whole < bytes.length) {
    let last = 0;
    for (let i = whole; i < whole + 4; i++) last = (last << 8) | (bytes[i] ?? 0);
    sum = (sum + (last >>> 0)) >>> 0;
  }
  return sum;
}

/** Assembles an sfnt: sorted directory, 4-byte aligned tables, checksums and head adjustment. */
export function buildSfnt(flavor: number, tables: SfntTable[]): Uint8Array {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const n = sorted.length;
  const entrySelector = Math.floor(Math.log2(Math.max(1, n)));
  const searchRange = 2 ** entrySelector * 16;
  let size = 12 + n * 16;
  for (const t of sorted) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size);
  const v = view(out);
  v.setUint32(0, flavor);
  v.setUint16(4, n);
  v.setUint16(6, searchRange);
  v.setUint16(8, entrySelector);
  v.setUint16(10, n * 16 - searchRange);
  let offset = 12 + n * 16;
  let headOffset = -1;
  sorted.forEach((t, i) => {
    const data = t.tag === 'head' ? t.data.slice() : t.data;
    if (t.tag === 'head' && data.length >= 12) {
      view(data).setUint32(8, 0);
      headOffset = offset;
    }
    const record = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[record + k] = t.tag.charCodeAt(k);
    v.setUint32(record + 4, checksum(data));
    v.setUint32(record + 8, offset);
    v.setUint32(record + 12, data.length);
    out.set(data, offset);
    offset += (data.length + 3) & ~3;
  });
  if (headOffset >= 0) v.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

/** WOFF 1.0: the sfnt tables, each zlib-compressed unless that would not save space. */
export function woffToSfnt(
  woff: Uint8Array,
  inflate: (data: Uint8Array) => Uint8Array,
): Uint8Array {
  const v = view(woff);
  const flavor = v.getUint32(4);
  const count = v.getUint16(12);
  const tables: SfntTable[] = [];
  for (let i = 0; i < count; i++) {
    const entry = 44 + i * 20;
    const offset = v.getUint32(entry + 4);
    const compLength = v.getUint32(entry + 8);
    const origLength = v.getUint32(entry + 12);
    const stored = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflate(stored) : stored;
    if (data.length !== origLength) throw new Error('WOFF table length mismatch');
    tables.push({ tag: tagAt(woff, entry), data });
  }
  return buildSfnt(flavor, tables);
}

export type FontInfo = {
  /** Legacy family (name ID 1): what Office and GDI match a typeface name against. */
  family: string;
  subfamily: string;
  typographicFamily: string | null;
  bold: boolean;
  italic: boolean;
  weight: number;
  fsType: number;
  variable: boolean;
  cff: boolean;
};

function decodeName(bytes: Uint8Array, platform: number): string {
  if (platform === 1) return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2)
    out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return out;
}

function readNames(table: Uint8Array): Map<number, string> {
  const v = view(table);
  const count = v.getUint16(2);
  const storage = v.getUint16(4);
  const ranked = new Map<number, { rank: number; text: string }>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > table.length) break;
    const platform = v.getUint16(r);
    const encoding = v.getUint16(r + 2);
    const language = v.getUint16(r + 4);
    const id = v.getUint16(r + 6);
    const length = v.getUint16(r + 8);
    const offset = storage + v.getUint16(r + 10);
    const rank =
      platform === 3 && (encoding === 1 || encoding === 10)
        ? language === 0x409
          ? 0
          : 1
        : platform === 0
          ? 2
          : platform === 1 && encoding === 0
            ? 3
            : -1;
    if (rank < 0 || offset + length > table.length) continue;
    const current = ranked.get(id);
    if (current && current.rank <= rank) continue;
    ranked.set(id, { rank, text: decodeName(table.subarray(offset, offset + length), platform) });
  }
  return new Map([...ranked].map(([id, { text }]) => [id, text]));
}

export function readFontInfo(sfnt: Uint8Array): FontInfo | null {
  let tables: Map<string, Uint8Array>;
  let flavor: number;
  try {
    ({ flavor, tables } = readTables(sfnt));
  } catch {
    return null;
  }
  const name = tables.get('name');
  if (!name) return null;
  const names = readNames(name);
  const family = names.get(1);
  if (!family) return null;
  const subfamily = names.get(2) ?? 'Regular';
  const os2 = tables.get('OS/2');
  const head = tables.get('head');
  let bold = /bold/i.test(subfamily);
  let italic = /italic|oblique/i.test(subfamily);
  let weight = bold ? 700 : 400;
  let fsType = 0;
  if (os2 && os2.length >= 64) {
    const v = view(os2);
    weight = v.getUint16(4);
    fsType = v.getUint16(8);
    const selection = v.getUint16(62);
    bold = (selection & 0x20) !== 0;
    italic = (selection & 0x01) !== 0;
  } else if (head && head.length >= 46) {
    const style = view(head).getUint16(44);
    bold = (style & 1) !== 0;
    italic = (style & 2) !== 0;
  }
  return {
    family,
    subfamily,
    typographicFamily: names.get(16) ?? null,
    bold,
    italic,
    weight,
    fsType,
    variable: tables.has('fvar'),
    cff: flavor === 0x4f54544f,
  };
}

/** The OS/2 fsType bits are the foundry's word on whether the face may travel. */
export function embeddingVerdict(
  info: FontInfo | null,
): { ok: true } | { ok: false; reason: string } {
  if (!info) return { ok: false, reason: 'its file is not a readable font' };
  if ((info.fsType & 0x0002) !== 0) return { ok: false, reason: 'its licence forbids embedding' };
  if ((info.fsType & 0x0200) !== 0)
    return { ok: false, reason: 'its licence allows bitmap embedding only' };
  return { ok: true };
}
