import type { Page, SlideMeta } from '@open-slide/core';
import photo from './assets/photo.png';

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
    <img
      src={photo}
      alt="Positioned"
      style={{
        ...at(520, 320),
        width: 200,
        height: 200,
        objectFit: 'cover',
        objectPosition: '10px 20px',
      }}
    />
    <h2 style={{ ...at(800, 320), filter: 'blur(0px)' }}>Settled blur-in heading</h2>
    <p style={{ ...at(800, 420), filter: 'opacity(0.5)' }}>Half opacity filter</p>
    <div
      style={{
        ...at(80, 700),
        width: 400,
        height: 200,
        background: '#4f46e5',
        color: '#fff',
        transform: 'perspective(800px) rotateY(25deg)',
      }}
    >
      Tilted card text
    </div>
  </div>
);

const blob = (id: string, background: string) => (
  <div
    id={id}
    style={{ ...at(40, 10), width: 300, height: 100, background, zIndex: -1, borderRadius: 50 }}
  />
);

const Stacking: Page = () => (
  <div style={{ ...page, position: 'relative' }}>
    <div style={{ ...at(80, 80), width: 700, height: 200, zIndex: 0, fontSize: 48 }}>
      Text above a blob
      {blob('blob-in-context', '#f59e0b')}
    </div>
    <div id="panel" style={{ ...at(80, 400), width: 700, height: 300, background: '#e2e8f0' }}>
      <div style={{ position: 'relative', fontSize: 48 }}>
        Panel covers its blob
        {blob('blob-under-panel', '#22c55e')}
      </div>
    </div>
  </div>
);

const Runs: Page = () => (
  <div style={{ ...page, position: 'relative' }}>
    <p style={at(80, 80)}>
      Read the <a href="https://example.com/docs">documentation</a> first.
    </p>
    <h2 style={{ ...at(80, 200), textTransform: 'uppercase' }}>Shouting label</h2>
    <p style={{ ...at(80, 300), fontVariant: 'small-caps' }}>Small caps label</p>
    <img src={photo} alt="Gradient swatch" style={{ ...at(80, 400), width: 80, height: 40 }} />
  </div>
);

export default [First, Unpositioned, Effects, Stacking, Runs] satisfies Page[];
