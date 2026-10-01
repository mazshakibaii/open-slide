import type { Page, SlideMeta } from '@open-slide/core';

export const meta: SlideMeta = {
  title: 'PPTX SVG',
  createdAt: '2026-01-02T15:00:00.000Z',
};

const page = {
  position: 'relative',
  width: 1920,
  height: 1080,
  background: '#ffffff',
  color: '#2563eb',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 28,
} as const;

const at = (left: number, top: number) => ({ position: 'absolute' as const, left, top });

const css = `
.pptx-svg .lucide { stroke-width: 3; }
.pptx-svg .accent { fill: #f59e0b; }
`;

const Icons: Page = () => (
  <div className="pptx-svg" style={page}>
    <style>{css}</style>
    <svg
      id="classed-icon"
      className="lucide lucide-check"
      style={at(80, 80)}
      width="96"
      height="96"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Check"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
    <svg id="reused" style={at(260, 80)} width="200" height="96" viewBox="0 0 200 96">
      <defs>
        <circle id="dot" cx="24" cy="48" r="20" fill="#16a34a" />
      </defs>
      <use href="#dot" />
      <use href="#dot" x="60" />
      <rect className="accent" x="130" y="28" width="40" height="40" />
    </svg>
  </div>
);

export default [Icons] satisfies Page[];
