import { describe, expect, it } from 'vitest';
import { anchorAlign, collapseSvgSpace, presentationValue, textNodeFor, uniformScale } from './svg';

describe('presentationValue', () => {
  it('writes computed lengths in user units', () => {
    expect(presentationValue('stroke-width', '2px')).toBe('2');
    expect(presentationValue('stroke-dasharray', '4px, 2.5px')).toBe('4 2.5');
    expect(presentationValue('stroke-dashoffset', '0px')).toBe('0');
  });
  it('unquotes paint server references', () => {
    expect(presentationValue('fill', 'url("#grad")')).toBe('url(#grad)');
    expect(presentationValue('clip-path', 'url("#clip")')).toBe('url(#clip)');
  });
  it('passes keywords and colours through', () => {
    expect(presentationValue('stroke-linecap', 'round')).toBe('round');
    expect(presentationValue('fill', 'none')).toBe('none');
  });
});

describe('uniformScale', () => {
  it('accepts translation and uniform scale', () => {
    expect(uniformScale({ a: 2, b: 0, c: 0, d: 2 })).toBe(2);
    expect(uniformScale({ a: 1, b: 0, c: 0, d: 1 })).toBe(1);
  });
  it('rejects rotation, skew, flips and stretch', () => {
    expect(
      uniformScale({ a: Math.SQRT1_2, b: Math.SQRT1_2, c: -Math.SQRT1_2, d: Math.SQRT1_2 }),
    ).toBeNull();
    expect(uniformScale({ a: 1, b: 0, c: 0.3, d: 1 })).toBeNull();
    expect(uniformScale({ a: -1, b: 0, c: 0, d: 1 })).toBeNull();
    expect(uniformScale({ a: 2, b: 0, c: 0, d: 1 })).toBeNull();
  });
});

describe('anchorAlign', () => {
  it('maps text-anchor to paragraph alignment', () => {
    expect(anchorAlign('start', 'ltr')).toBe('l');
    expect(anchorAlign('start', 'rtl')).toBe('r');
    expect(anchorAlign('middle', 'ltr')).toBe('ctr');
    expect(anchorAlign('end', 'ltr')).toBe('r');
    expect(anchorAlign('end', 'rtl')).toBe('l');
  });
});

describe('collapseSvgSpace', () => {
  it('collapses whitespace the way SVG text does', () => {
    expect(collapseSvgSpace('  Diagram\n\tlabel   here ')).toBe(' Diagram label here ');
  });
});

describe('textNodeFor', () => {
  const style = {
    font: 'Arial',
    sizePx: 40,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: { r: 17, g: 17, b: 17, a: 1 },
    letterSpacingPx: 0,
    baselineShift: null,
    shadow: null,
    outline: null,
    caps: null,
    kerning: true,
    link: null,
    highlight: null,
  } as const;

  it('places a non-wrapping text box over the drawn text', () => {
    const node = textNodeFor(
      {
        rect: { x: 100, y: 200, w: 300, h: 46 },
        runs: [{ text: 'Label', style }],
        align: 'ctr',
        rtl: false,
        sizePx: 40,
      },
      0.5,
    );
    expect(node).toMatchObject({
      kind: 'text',
      name: 'Text: Label',
      box: { x: 100, y: 200, w: 300, h: 46 },
      wrap: false,
    });
    expect(node.paragraphs[0]).toMatchObject({ align: 'ctr', lineSpacingPx: 46 });
    expect(node.paragraphs[0].lines[0].runs[0].style.color.a).toBe(0.5);
  });
});
