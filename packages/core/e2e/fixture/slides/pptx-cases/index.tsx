import type { Page, SlideMeta } from '@open-slide/core';

export const meta: SlideMeta = {
  title: 'PPTX Cases',
  createdAt: '2026-10-01T00:00:00.000Z',
};

const page = {
  width: 1920,
  height: 1080,
  background: '#ffffff',
  color: '#111111',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 28,
} as const;

const at = (left: number, top: number) => ({ position: 'absolute' as const, left, top, margin: 0 });

const First: Page = () => (
  <div style={page}>
    <p style={at(80, 80)}>First page marker</p>
  </div>
);

// No positioned page root: absolute children resolve against the canvas host.
const Unpositioned: Page = () => (
  <div style={page}>
    <p style={at(200, 300)}>Unpositioned root marker</p>
  </div>
);

export default [First, Unpositioned] satisfies Page[];
