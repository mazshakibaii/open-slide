import { describe, expect, it } from 'vitest';
import {
  type FaceRule,
  parseRanges,
  parseSources,
  parseWeights,
  pickRule,
  type RunGroup,
} from './embed-fonts';

const rule = (over: Partial<FaceRule>): FaceRule => ({
  family: 'inter',
  weights: [400, 400],
  italic: false,
  ranges: null,
  sources: ['a.ttf'],
  ...over,
});

const group = (weight: number, text = 'Hello', italic = false): RunGroup => ({
  family: 'Inter',
  weight,
  italic,
  runs: [],
  chars: new Set(Array.from(text, (c) => c.codePointAt(0) ?? 0)),
});

describe('face descriptors', () => {
  it('reads weights, ranges and sources the way Chrome serialises them', () => {
    expect(parseWeights('100 900')).toEqual([100, 900]);
    expect(parseWeights('bold')).toEqual([700, 700]);
    expect(parseWeights('')).toEqual([400, 400]);
    expect(parseRanges('U+0-FF, U+131, U+4??')).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x400, 0x4ff],
    ]);
    expect(parseRanges('')).toBeNull();
    expect(
      parseSources(
        'url("/f/a.woff2") format("woff2"), local("Inter"), url(b.woff) format("woff"), url(\'c.ttf\')',
        'https://x.test/css/',
      ),
    ).toEqual([
      'https://x.test/css/c.ttf',
      'https://x.test/css/b.woff',
      'https://x.test/f/a.woff2',
    ]);
  });
});

describe('pickRule', () => {
  it('matches style first, then the nearest weight, heavier past 500', () => {
    const regular = rule({ weights: [400, 400] });
    const medium = rule({ weights: [500, 500] });
    const bold = rule({ weights: [700, 700] });
    const italic = rule({ weights: [400, 400], italic: true });
    const rules = [regular, medium, bold, italic];
    expect(pickRule(rules, group(400))).toBe(regular);
    expect(pickRule(rules, group(600))).toBe(bold);
    expect(pickRule([regular, medium], group(800))).toBe(medium);
    expect(pickRule(rules, group(400, 'x', true))).toBe(italic);
    expect(pickRule(rules, { ...group(400), family: 'Other' })).toBeNull();
  });

  it('prefers the unicode-range subset that covers the text', () => {
    const latin = rule({ ranges: [[0, 0xff]] });
    const cyrillic = rule({ ranges: [[0x400, 0x4ff]] });
    expect(pickRule([cyrillic, latin], group(400, 'Hello'))).toBe(latin);
    expect(pickRule([latin, cyrillic], group(400, 'Привет'))).toBe(cyrillic);
  });
});
