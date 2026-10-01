import { describe, expect, it } from 'vitest';
import { ImageStore } from './images';

describe('ImageStore', () => {
  it('stores identical bytes once', () => {
    const store = new ImageStore();
    const a = store.add(Uint8Array.of(1, 2, 3, 4), 'png');
    const b = store.add(Uint8Array.of(1, 2, 3, 4), 'png');
    const c = store.add(Uint8Array.of(1, 2, 3, 5), 'png');
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(store.images.map((i) => i.id)).toEqual([a, c]);
  });

  it('keeps a raster with a vector companion apart from the bare raster', () => {
    const store = new ImageStore();
    const bare = store.add(Uint8Array.of(9, 9), 'png');
    const withSvg = store.add(Uint8Array.of(9, 9), 'png', Uint8Array.of(60, 115));
    expect(withSvg).not.toBe(bare);
    expect(store.add(Uint8Array.of(9, 9), 'png', Uint8Array.of(60, 115))).toBe(withSvg);
  });
});
