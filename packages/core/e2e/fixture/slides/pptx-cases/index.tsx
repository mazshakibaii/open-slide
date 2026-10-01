import type { Page, SlideMeta } from '@open-slide/core';
import big from './assets/big.png';
import photo from './assets/photo.png';

export const meta: SlideMeta = {
  title: 'PPTX Cases',
  createdAt: '2026-01-02T12:00:00.000Z',
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
.pptx-cases .arrow li::before { content: '\\2192  '; color: #2563eb; }
.pptx-cases .check { list-style-type: '✓ '; padding-left: 40px; }
.pptx-cases .star li::marker { content: '★ '; }
.pptx-cases .badge::after { content: 'NEW'; position: absolute; right: 8px; top: 8px; background: #dc2626; color: #fff; font-size: 14px; padding: 2px 6px; }
.pptx-cases .steps { counter-reset: step; }
.pptx-cases .steps p::before { counter-increment: step; content: counter(step) '. '; font-weight: 700; }
.pptx-cases .accent::before { content: ''; position: absolute; left: 0; top: 0; width: 8px; height: 100%; background: #22c55e; }
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
    <img src={big} alt="Oversized" style={{ ...at(80, 500), width: 160, height: 80 }} />
  </div>
);

const Text: Page = () => (
  <div style={{ ...page, position: 'relative' }}>
    <p style={{ ...at(80, 60), width: 560, lineHeight: 1.4 }}>
      This paragraph wraps inside a five hundred and sixty pixel column, so it has to arrive as text
      that wraps rather than as frozen lines.
    </p>
    <p style={{ ...at(700, 60), width: 520 }}>
      First line ends here
      <br />
      second line after a break.
    </p>
    <p dir="rtl" style={{ ...at(1280, 60), width: 420 }}>
      שלום עולם, זוהי פסקה ארוכה בעברית שעוברת שורה בתוך התיבה
    </p>
    <p
      style={{
        ...at(80, 400),
        width: 300,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      A very long single line truncated with an ellipsis at three hundred pixels
    </p>
    <p
      style={{
        ...at(700, 400),
        width: 400,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      Clamped to two lines: one two three four five six seven eight nine ten eleven twelve thirteen
      fourteen fifteen sixteen seventeen eighteen.
    </p>
    <p style={{ ...at(1280, 400), width: 520, textIndent: 48 }}>
      Text-indent pushes this first line in while the rest of the paragraph wraps flush left.
    </p>
    <span style={{ ...at(80, 600), whiteSpace: 'nowrap' }}>Never wrapping label</span>
    <span style={at(700, 600)}>Shrink to fit</span>
    <p style={at(1280, 600)}>
      Inline <mark style={{ background: '#fde047' }}>highlighted phrase</mark> here.
    </p>
    <ul style={{ ...at(80, 720), width: 520, paddingLeft: 40, listStyle: 'disc outside' }}>
      <li>Disc bullet one</li>
      <li style={{ marginTop: 12 }}>Disc bullet two wraps onto a second line, being long enough</li>
      <li>
        Parent item
        <ul style={{ paddingLeft: 40, listStyle: 'circle outside' }}>
          <li>Nested child</li>
        </ul>
      </li>
    </ul>
    <ol style={{ ...at(700, 720), width: 500, paddingLeft: 40, listStyle: 'decimal outside' }}>
      <li>First numbered</li>
      <li>Second numbered</li>
      <li>Third numbered</li>
    </ol>
  </div>
);

const Generated: Page = () => (
  <div className="pptx-cases" style={{ ...page, position: 'relative' }}>
    <style>{css}</style>
    <ul className="arrow" style={{ ...at(80, 80), listStyle: 'none', padding: 0 }}>
      <li>Arrow marker via before</li>
      <li>Second arrow item</li>
    </ul>
    <ul className="check" style={at(700, 80)}>
      <li>String marker item</li>
    </ul>
    <ul className="star" style={{ ...at(1280, 80), paddingLeft: 40 }}>
      <li>Marker content item</li>
    </ul>
    <div
      className="badge"
      style={{ ...at(80, 400), width: 400, height: 160, background: '#f1f5f9', padding: 24 }}
    >
      Card with an after badge
    </div>
    <div className="steps" style={at(700, 400)}>
      <p>Gather inputs</p>
      <p>Ship it</p>
    </div>
    <div
      id="accent"
      className="accent"
      style={{ ...at(1280, 400), width: 400, height: 120, padding: '24px 32px' }}
    >
      Accent bar card
    </div>
  </div>
);

const Decor: Page = () => (
  <div style={{ ...page, position: 'relative', background: '#1e3a8a', color: '#fff' }}>
    <div
      id="glass"
      style={{
        ...at(80, 80),
        width: 400,
        height: 160,
        padding: 24,
        borderRadius: 16,
        background: 'rgba(255, 255, 255, 0.25)',
        backdropFilter: 'blur(12px)',
      }}
    >
      Glass card text
    </div>
    <div
      id="lifted"
      style={{
        ...at(560, 80),
        width: 400,
        height: 160,
        padding: 24,
        background: '#334155',
        filter: 'drop-shadow(0 8px 12px rgba(0, 0, 0, 0.6))',
      }}
    >
      Drop shadow card
    </div>
    <h2 style={{ ...at(1040, 80), filter: 'drop-shadow(0 0 20px rgb(255, 0, 0))' }}>
      Glowing title
    </h2>
    <h1
      style={{
        ...at(80, 360),
        fontSize: 64,
        backgroundImage: 'linear-gradient(90deg, #2563eb, #db2777)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      Gradient headline
    </h1>
    <p style={{ ...at(80, 520), whiteSpace: 'nowrap', clipPath: 'inset(0 50% 0 0)' }}>
      Left half stays visible while the right half is clipped away
    </p>
    <img
      src={photo}
      alt="Avatar"
      style={{ ...at(1040, 360), width: 120, height: 120, clipPath: 'circle(50% at 50% 50%)' }}
    />
  </div>
);

export default [
  First,
  Unpositioned,
  Effects,
  Stacking,
  Runs,
  Text,
  Generated,
  Decor,
] satisfies Page[];
