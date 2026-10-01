import { describe, expect, it } from 'vitest';
import type { Rect, RunStyle } from './scene';
import { type Atom, buildSegments, groupIntoLines } from './text-lines';

const style = (over: Partial<RunStyle> = {}): RunStyle => ({
  font: 'Arial',
  sizePx: 40,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: { r: 0, g: 0, b: 0, a: 1 },
  letterSpacingPx: 0,
  baselineShift: null,
  shadow: null,
  outline: null,
  caps: null,
  kerning: true,
  link: null,
  highlight: null,
  gradient: null,
  ...over,
});

const rect = (x: number, y: number, w = 10, h = 44): Rect => ({ x, y, w, h });

const atom = (text: string, rects: Rect[], over: Partial<Atom> = {}): Atom => ({
  text,
  rects,
  styleKey: 'a',
  style: style(),
  preserveSpaces: false,
  breaksBefore: 0,
  ...over,
});

describe('groupIntoLines', () => {
  it('splits a wrapped text node into one line per fragment', () => {
    const { lines } = groupIntoLines([
      atom('one two three', [rect(0, 0, 200), rect(0, 60, 120), rect(0, 120, 80)]),
    ]);
    expect(lines.map((l) => [l.top, l.bottom, l.left, l.right])).toEqual([
      [0, 44, 0, 200],
      [60, 104, 0, 120],
      [120, 164, 0, 80],
    ]);
  });
  it('keeps right-to-left fragments that run leftwards on one line', () => {
    const { lines } = groupIntoLines([
      atom('שלום', [rect(300, 0, 60)]),
      atom(' ', [rect(290, 0, 10)]),
      atom('עולם', [rect(200, 0, 90), rect(330, 60, 30)]),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ left: 200, right: 360 });
  });
  it('keeps raised and lowered fragments on the line they sit on', () => {
    const { lines } = groupIntoLines([
      atom('x', [rect(0, 10)]),
      atom('2', [rect(10, 0, 6, 26)], { style: style({ sizePx: 24 }) }),
      atom('i', [rect(16, 28, 6, 26)], { style: style({ sizePx: 24 }) }),
    ]);
    expect(lines).toHaveLength(1);
  });
  it('records which hard-break segment each line belongs to', () => {
    const { lines } = groupIntoLines([
      atom('first', [rect(0, 0)]),
      atom('second', [rect(0, 60)], { breaksBefore: 1 }),
    ]);
    expect(lines.map((l) => l.segment)).toEqual([0, 1]);
  });
});

describe('buildSegments', () => {
  it('joins soft-wrapped text into one run with collapsed whitespace', () => {
    const segments = buildSegments([
      atom(' Hello ', [rect(0, 0)]),
      atom(' big', [rect(0, 0)], { styleKey: 'b' }),
      atom('\n world  ', [rect(0, 60)], { styleKey: 'b' }),
    ]);
    expect(segments.map((s) => s.map((r) => r.text))).toEqual([['Hello ', 'big world']]);
  });
  it('turns breaks into segments, keeping empty lines', () => {
    const segments = buildSegments([
      atom('top', [rect(0, 0)]),
      atom('after a blank line', [rect(0, 120)], { breaksBefore: 2 }),
    ]);
    expect(segments.map((s) => s.map((r) => r.text).join(''))).toEqual([
      'top',
      '',
      'after a blank line',
    ]);
  });
  it('lets a whitespace atom with no fragments separate words', () => {
    const segments = buildSegments([
      atom('wrap', [rect(0, 0)]),
      atom(' ', []),
      atom('here', [rect(0, 60)], { styleKey: 'b' }),
    ]);
    expect(segments[0].map((r) => r.text)).toEqual(['wrap ', 'here']);
  });
  it('keeps indentation for preformatted text', () => {
    const segments = buildSegments([
      atom('    const x', [rect(0, 0)], { preserveSpaces: true }),
      atom('  return x', [rect(0, 60)], { preserveSpaces: true, breaksBefore: 1 }),
    ]);
    expect(segments.map((s) => s[0].text)).toEqual(['    const x', '  return x']);
  });
});
