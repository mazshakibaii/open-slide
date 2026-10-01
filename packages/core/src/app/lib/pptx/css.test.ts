import { describe, expect, it } from 'vitest';
import {
  analyzeFilter,
  applyTextTransform,
  decompose,
  dominantShadow,
  geometryFor,
  gradientLineLength,
  multiply,
  normalizeRadii,
  parseBlurPx,
  parseClipPath,
  parseColor,
  parseCornerRadius,
  parseFontFamilies,
  parseLinearGradient,
  parsePosition,
  parseRadialGradient,
  parseShadows,
  parseTransform,
  splitTopLevel,
  toHex,
  transformedBounds,
  translation,
} from './css';

describe('parseColor', () => {
  it('parses legacy and modern rgb syntax', () => {
    expect(parseColor('rgb(255, 0, 128)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseColor('rgb(255 0 0 / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
  it('parses hex forms', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#6d4cff')).toEqual({ r: 109, g: 76, b: 255, a: 1 });
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.502, 2);
  });
  it('rejects colours it cannot resolve', () => {
    expect(parseColor('oklch(0.62 0.18 250)')).toBeNull();
    expect(parseColor('red')).toBeNull();
  });
  it('formats hex', () => {
    expect(toHex({ r: 109, g: 76, b: 255, a: 1 })).toBe('6D4CFF');
  });
});

describe('splitTopLevel', () => {
  it('ignores separators inside parentheses and quotes', () => {
    expect(splitTopLevel('rgba(1, 2, 3, 0.5) 0px 4px, url("a,b") 1px')).toEqual([
      'rgba(1, 2, 3, 0.5) 0px 4px',
      'url("a,b") 1px',
    ]);
  });
});

describe('transforms', () => {
  it('parses matrix and flat matrix3d', () => {
    expect(parseTransform('none')).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('matrix(1, 0, 0, 1, -50, -25)')).toEqual([1, 0, 0, 1, -50, -25]);
    expect(parseTransform('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)')).toEqual([
      1, 0, 0, 1, 10, 20,
    ]);
    expect(
      parseTransform('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.001, 0, 0, 0, 1)'),
    ).toBeNull();
  });
  it('decomposes rotation and scale', () => {
    const rotated = parseTransform('matrix(0.984808, 0.173648, -0.173648, 0.984808, 0, 0)');
    const d = rotated ? decompose(rotated) : null;
    expect(d?.rotationDeg).toBeCloseTo(10, 3);
    expect(d?.scaleX).toBeCloseTo(1, 5);
    expect(d?.scaleY).toBeCloseTo(1, 5);
    expect(d?.skewed).toBe(false);
    expect(d?.flipV).toBe(false);
    const s = decompose([2, 0, 0, -3, 0, 0]);
    expect(s).toMatchObject({ scaleX: 2, scaleY: 3, flipV: true, skewed: false });
    expect(decompose([1, 0, 1, 1, 0, 0])?.skewed).toBe(true);
  });
  it('composes translations and computes bounds', () => {
    const m = multiply(translation(10, 20), [2, 0, 0, 2, 0, 0]);
    expect(transformedBounds(m, 0, 0, 10, 10)).toEqual({ x: 10, y: 20, w: 20, h: 20 });
  });
});

describe('parseLinearGradient', () => {
  it('parses angle, stops and interpolates missing positions', () => {
    const g = parseLinearGradient(
      'linear-gradient(135deg, rgba(120, 120, 130, 0.06) 0%, rgb(0, 0, 0), rgba(120, 120, 130, 0.06) 100%)',
      100,
      100,
    );
    expect(g?.angleDeg).toBe(135);
    expect(g?.stops.map((s) => s.pos)).toEqual([0, 0.5, 1]);
  });
  it('defaults to top-to-bottom and resolves side keywords', () => {
    expect(
      parseLinearGradient('linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))', 10, 10)?.angleDeg,
    ).toBe(180);
    expect(
      parseLinearGradient('linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))', 10, 10)
        ?.angleDeg,
    ).toBe(90);
    const corner = parseLinearGradient(
      'linear-gradient(to bottom right, rgb(0, 0, 0), rgb(255, 255, 255))',
      100,
      100,
    );
    expect(corner?.angleDeg).toBeCloseTo(135, 5);
  });
  it('angles corner keywords so the midline joins the neighbouring corners of a wide box', () => {
    const angle = (to: string) =>
      parseLinearGradient(`linear-gradient(${to}, rgb(0, 0, 0), rgb(255, 255, 255))`, 800, 160)
        ?.angleDeg;
    expect(angle('to bottom right')).toBeCloseTo(168.69, 2);
    expect(angle('to top right')).toBeCloseTo(11.31, 2);
    expect(angle('to bottom left')).toBeCloseTo(191.31, 2);
    expect(angle('to top left')).toBeCloseTo(348.69, 2);
  });
  it('fades transparent stops from their neighbour instead of from black', () => {
    const fade = parseLinearGradient(
      'linear-gradient(to right, rgb(255, 255, 255), rgba(0, 0, 0, 0))',
      100,
      50,
    );
    expect(fade?.stops).toEqual([
      { pos: 0, color: { r: 255, g: 255, b: 255, a: 1 } },
      { pos: 1, color: { r: 255, g: 255, b: 255, a: 0 } },
    ]);
    const through = parseLinearGradient(
      'linear-gradient(to right, rgb(255, 0, 0), rgba(0, 0, 0, 0), rgb(0, 0, 255))',
      100,
      50,
    );
    expect(through?.stops).toEqual([
      { pos: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
      { pos: 0.5, color: { r: 255, g: 0, b: 0, a: 0 } },
      { pos: 0.5, color: { r: 0, g: 0, b: 255, a: 0 } },
      { pos: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
    ]);
  });
  it('converts px stop positions against the gradient line', () => {
    const g = parseLinearGradient(
      'linear-gradient(to right, rgb(0, 0, 0) 25px, rgb(255, 255, 255) 75px)',
      100,
      50,
    );
    expect(g?.stops.map((s) => s.pos)).toEqual([0.25, 0.75]);
    expect(gradientLineLength(90, 100, 50)).toBeCloseTo(100);
  });
  it('rejects unsupported colour syntax and non-linear gradients', () => {
    expect(
      parseLinearGradient('linear-gradient(oklch(0.6 0.1 20), rgb(0, 0, 0))', 10, 10),
    ).toBeNull();
    expect(parseLinearGradient('radial-gradient(rgb(0, 0, 0), rgb(1, 1, 1))', 10, 10)).toBeNull();
  });
});

describe('parseShadows', () => {
  it('parses Chrome computed box-shadow values', () => {
    const s = parseShadows(
      'rgba(0, 0, 0, 0.25) 0px 10px 30px 0px, rgb(255, 0, 0) 0px 0px 0px 2px inset',
    );
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ x: 0, y: 10, blur: 30, spread: 0, inset: false });
    expect(s[1]).toMatchObject({ spread: 2, inset: true });
    expect(parseShadows('none')).toEqual([]);
  });
  it('drops the invisible layers Tailwind pads every shadow list with', () => {
    const s = parseShadows(
      'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.35) 0px 10px 15px -3px, rgba(0, 0, 0, 0.35) 0px 4px 6px -4px',
    );
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ y: 10, blur: 15, spread: -3 });
    expect(parseShadows('rgb(0, 0, 0) 0px 0px 0px 0px')).toEqual([]);
  });
});

describe('dominantShadow', () => {
  it('keeps the layer that contributes most when only one can be drawn', () => {
    const layers = parseShadows(
      'rgba(0, 0, 0, 0.2) 0px 8px 10px -5px, rgba(0, 0, 0, 0.14) 0px 16px 24px 2px, rgba(0, 0, 0, 0.12) 0px 6px 30px 5px, rgb(255, 0, 0) 0px 0px 0px 2px inset',
    );
    expect(dominantShadow(layers, false)).toMatchObject({ y: 16, blur: 24 });
    expect(dominantShadow(layers, true)).toMatchObject({ spread: 2, inset: true });
    expect(dominantShadow([], false)).toBeUndefined();
  });
});

describe('radii', () => {
  it('parses px, percentage and elliptical corners', () => {
    expect(parseCornerRadius('12px', 100, 50)).toEqual({ x: 12, y: 12 });
    expect(parseCornerRadius('50%', 100, 50)).toEqual({ x: 50, y: 25 });
    expect(parseCornerRadius('10px 20px', 100, 50)).toEqual({ x: 10, y: 20 });
  });
  it('scales overlapping radii down like CSS', () => {
    const r = normalizeRadii(
      [
        { x: 80, y: 80 },
        { x: 80, y: 80 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      100,
      100,
    );
    expect(r[0].x).toBeCloseTo(50);
    expect(r[1].x).toBeCloseTo(50);
  });
});

describe('misc', () => {
  it('sums blur radii and parses families', () => {
    expect(parseBlurPx('blur(40px) brightness(1.2) blur(10px)')).toBe(50);
    expect(parseBlurPx('none')).toBe(0);
    expect(parseFontFamilies('"Inter", -apple-system, \'JetBrains Mono\', monospace')).toEqual([
      'Inter',
      '-apple-system',
      'JetBrains Mono',
      'monospace',
    ]);
  });
  it('applies text-transform', () => {
    expect(applyTextTransform('hello world', 'uppercase')).toBe('HELLO WORLD');
    expect(applyTextTransform('hello world', 'capitalize')).toBe('Hello World');
    expect(applyTextTransform('Hello', 'none')).toBe('Hello');
  });
});

describe('geometryFor', () => {
  const uniform = (x: number, y = x): Parameters<typeof geometryFor>[0] => [
    { x, y },
    { x, y },
    { x, y },
    { x, y },
  ];
  it('keeps a pill as a rounded rectangle', () => {
    const radii = normalizeRadii(uniform(9999), 540, 56);
    expect(geometryFor(radii, 540, 56)).toEqual({ kind: 'roundRect', radius: 28 });
  });
  it('treats a fully rounded square as an ellipse', () => {
    const radii = normalizeRadii(uniform(9999), 64, 64);
    expect(geometryFor(radii, 64, 64)).toEqual({ kind: 'ellipse' });
  });
  it('treats 50% corners on a wide box as an ellipse', () => {
    expect(geometryFor(uniform(100, 30), 200, 60)).toEqual({ kind: 'ellipse' });
  });
  it('maps small uniform corners to a rounded rectangle', () => {
    expect(geometryFor(uniform(12), 300, 80)).toEqual({ kind: 'roundRect', radius: 12 });
  });
  it('falls back to a custom path for mixed or elliptical corners', () => {
    const mixed = uniform(12);
    mixed[2] = { x: 0, y: 0 };
    expect(geometryFor(mixed, 300, 80).kind).toBe('custom');
    expect(geometryFor(uniform(40, 10), 300, 80).kind).toBe('custom');
  });
  it('maps no radius to a plain rectangle', () => {
    expect(geometryFor(uniform(0), 300, 80)).toEqual({ kind: 'rect' });
  });
});

describe('parsePosition', () => {
  it('resolves percentages, keywords and lengths to a fraction of the free space plus an offset', () => {
    expect(parsePosition('50% 50%')).toEqual({ x: { frac: 0.5, px: 0 }, y: { frac: 0.5, px: 0 } });
    expect(parsePosition('10px 20px')).toEqual({ x: { frac: 0, px: 10 }, y: { frac: 0, px: 20 } });
    expect(parsePosition('right top')).toEqual({ x: { frac: 1, px: 0 }, y: { frac: 0, px: 0 } });
    expect(parsePosition('top')).toEqual({ x: { frac: 0.5, px: 0 }, y: { frac: 0, px: 0 } });
  });
  it('reads edge offsets and calc() sums', () => {
    expect(parsePosition('right 10px bottom 20px')).toEqual({
      x: { frac: 1, px: -10 },
      y: { frac: 1, px: -20 },
    });
    expect(parsePosition('calc(50% + 12px) 0%')).toEqual({
      x: { frac: 0.5, px: 12 },
      y: { frac: 0, px: 0 },
    });
  });
  it('rejects what it cannot resolve', () => {
    expect(parsePosition('10em 0px')).toBeNull();
    expect(parsePosition('calc(10vw) 0px')).toBeNull();
  });
});

describe('analyzeFilter', () => {
  it('treats settled entrance-animation filters as no filter at all', () => {
    const none = { opacity: 1, raster: false, dropShadow: null };
    expect(analyzeFilter('none')).toEqual(none);
    expect(analyzeFilter('blur(0px)')).toEqual(none);
    expect(analyzeFilter('blur(0px) brightness(1) saturate(100%) hue-rotate(0deg)')).toEqual(none);
    expect(analyzeFilter('drop-shadow(rgba(0, 0, 0, 0) 0px 0px 0px)')).toEqual(none);
  });
  it('folds opacity() into the element opacity', () => {
    expect(analyzeFilter('opacity(0.5) blur(0px)')).toEqual({
      opacity: 0.5,
      raster: false,
      dropShadow: null,
    });
  });
  it('maps a single drop-shadow onto a shadow instead of a raster', () => {
    const glow = analyzeFilter('drop-shadow(rgb(255, 0, 0) 0px 0px 28px)');
    expect(glow.raster).toBe(false);
    expect(glow.dropShadow).toMatchObject({ x: 0, y: 0, blur: 28, color: { r: 255, a: 1 } });
    expect(
      analyzeFilter(
        'drop-shadow(rgb(0, 255, 255) 6px 0px 0px) drop-shadow(rgb(255, 0, 68) -6px 0px 0px)',
      ).raster,
    ).toBe(true);
  });
  it('rasterises filters PowerPoint has no equivalent for', () => {
    expect(analyzeFilter('blur(4px)').raster).toBe(true);
    expect(analyzeFilter('grayscale(1)').raster).toBe(true);
    expect(analyzeFilter('url("#noise")').raster).toBe(true);
  });
});

describe('parseClipPath', () => {
  it('turns inset() into edge offsets of the border box', () => {
    expect(parseClipPath('inset(0px)', 200, 100)).toEqual({
      kind: 'inset',
      t: 0,
      r: 0,
      b: 0,
      l: 0,
    });
    expect(parseClipPath('inset(0px 50% 0px 0px)', 200, 100)).toEqual({
      kind: 'inset',
      t: 0,
      r: 100,
      b: 0,
      l: 0,
    });
    expect(parseClipPath('inset(10px 20px round 8px)', 200, 100)).toEqual({
      kind: 'inset',
      t: 10,
      r: 20,
      b: 10,
      l: 20,
    });
  });
  it('recognises a centred full-size circle or ellipse', () => {
    expect(parseClipPath('circle(50% at 50% 50%)', 100, 100)).toEqual({ kind: 'ellipse' });
    expect(parseClipPath('ellipse(50% 50% at 50% 50%)', 200, 100)).toEqual({ kind: 'ellipse' });
    expect(parseClipPath('circle(30% at 10% 10%)', 100, 100)).toBeNull();
    expect(parseClipPath('polygon(0 0, 100% 0, 0 100%)', 100, 100)).toBeNull();
  });
});

describe('parseRadialGradient', () => {
  it('reads the default centred ellipse and a positioned one', () => {
    expect(
      parseRadialGradient('radial-gradient(rgb(255, 0, 0), rgb(0, 0, 255))', 200, 100),
    ).toEqual({
      x: 0.5,
      y: 0.5,
      stops: [
        { pos: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
        { pos: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
    });
    const glow = parseRadialGradient(
      'radial-gradient(at 30% 20%, rgba(255, 255, 255, 0.5) 0%, rgba(0, 0, 0, 0) 60%)',
      200,
      100,
    );
    expect(glow).toMatchObject({ x: 0.3, y: 0.2 });
    expect(glow?.stops.at(-1)).toEqual({ pos: 0.6, color: { r: 255, g: 255, b: 255, a: 0 } });
  });
  it('accepts a circle only where it matches the box', () => {
    expect(
      parseRadialGradient('radial-gradient(circle, rgb(0, 0, 0), rgb(1, 1, 1))', 100, 100),
    ).not.toBeNull();
    expect(
      parseRadialGradient('radial-gradient(circle, rgb(0, 0, 0), rgb(1, 1, 1))', 300, 100),
    ).toBeNull();
  });
  it('leaves sizes PowerPoint cannot match to the raster', () => {
    expect(
      parseRadialGradient('radial-gradient(closest-side, rgb(0, 0, 0), rgb(1, 1, 1))', 100, 100),
    ).toBeNull();
    expect(
      parseRadialGradient(
        'radial-gradient(40px 20px at 50% 50%, rgb(0, 0, 0), rgb(1, 1, 1))',
        100,
        100,
      ),
    ).toBeNull();
  });
});
