import { describe, expect, it } from 'vitest';
import { presentationValue } from './svg';

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
