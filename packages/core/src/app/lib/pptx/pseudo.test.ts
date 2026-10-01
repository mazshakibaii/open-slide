import { describe, expect, it } from 'vitest';
import { formatCounter, parseContent, parseCounterList } from './pseudo';

describe('parseContent', () => {
  it('reads strings, counters, attributes and quotes in order', () => {
    expect(parseContent('"Step " counter(step) ": " attr(data-label)')).toEqual([
      { kind: 'text', text: 'Step ' },
      { kind: 'counter', name: 'step', style: 'decimal' },
      { kind: 'text', text: ': ' },
      { kind: 'attr', name: 'data-label' },
    ]);
    expect(parseContent('counters(item, ".", upper-roman)')).toEqual([
      { kind: 'counters', name: 'item', separator: '.', style: 'upper-roman' },
    ]);
    expect(parseContent('open-quote')).toEqual([{ kind: 'text', text: '“' }]);
  });
  it('unescapes CSS string escapes', () => {
    expect(parseContent('"\\2192  next"')).toEqual([{ kind: 'text', text: '→ next' }]);
    expect(parseContent("'it\\'s'")).toEqual([{ kind: 'text', text: "it's" }]);
  });
  it('reads an image', () => {
    expect(parseContent('url("https://x.test/a.svg")')).toEqual([
      { kind: 'image', url: 'https://x.test/a.svg' },
    ]);
  });
  it('gives up on what it cannot reproduce', () => {
    expect(parseContent('none')).toBeNull();
    expect(parseContent('normal')).toBeNull();
    expect(parseContent('element(foo)')).toBeNull();
  });
});

describe('parseCounterList', () => {
  it('pairs names with their values and defaults', () => {
    expect(parseCounterList('none', 1)).toEqual([]);
    expect(parseCounterList('step 0 item 3', 1)).toEqual([
      { name: 'step', value: 0 },
      { name: 'item', value: 3 },
    ]);
    expect(parseCounterList('step', 1)).toEqual([{ name: 'step', value: 1 }]);
  });
});

describe('formatCounter', () => {
  it('formats the list styles a slide uses', () => {
    expect(formatCounter(7, 'decimal')).toBe('7');
    expect(formatCounter(7, 'decimal-leading-zero')).toBe('07');
    expect(formatCounter(28, 'lower-alpha')).toBe('ab');
    expect(formatCounter(14, 'upper-roman')).toBe('XIV');
    expect(formatCounter(3, 'none')).toBe('');
  });
});
