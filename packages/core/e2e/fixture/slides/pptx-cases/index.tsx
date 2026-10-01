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

const css = `
.pptx-cases .tw-shadow { box-shadow: 0 0 #0000, 0 0 #0000, 0 10px 15px -3px rgba(0, 0, 0, 0.35), 0 4px 6px -4px rgba(0, 0, 0, 0.35); }
`;

const Effects: Page = () => (
  <div className="pptx-cases" style={{ ...page, position: 'relative' }}>
    <style>{css}</style>
    <div
      id="tw-shadow"
      className="tw-shadow"
      style={{ ...at(80, 80), width: 360, height: 160, background: '#fff', borderRadius: 12 }}
    />
  </div>
);

export default [First, Unpositioned, Effects] satisfies Page[];
