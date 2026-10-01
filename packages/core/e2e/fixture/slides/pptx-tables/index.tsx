import type { Page, SlideMeta } from '@open-slide/core';

export const meta: SlideMeta = {
  title: 'PPTX Tables',
  createdAt: '2026-01-02T14:00:00.000Z',
};

const page = {
  position: 'relative',
  width: 1920,
  height: 1080,
  background: '#ffffff',
  color: '#111111',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 28,
} as const;

const cell = { border: '2px solid #111111', padding: 12 } as const;
const head = { ...cell, background: '#e2e8f0', textAlign: 'left' } as const;
const number = { ...cell, textAlign: 'right' } as const;

const Native: Page = () => (
  <div style={page}>
    <table
      id="revenue"
      style={{ position: 'absolute', left: 80, top: 80, width: 1200, borderCollapse: 'collapse' }}
    >
      <thead>
        <tr>
          <th style={head}>Region</th>
          <th style={head} colSpan={2}>
            First half
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ ...cell, verticalAlign: 'middle' }} rowSpan={2}>
            North
          </td>
          <td style={number}>1.2m</td>
          <td style={{ ...number, borderBottom: '4px dashed #dc2626' }}>1.4m</td>
        </tr>
        <tr>
          <td style={number}>0.8m</td>
          <td style={{ ...number, background: '#fef9c3' }}>0.9m</td>
        </tr>
        <tr>
          <td style={cell}>
            <a href="https://example.com/south">South</a>
          </td>
          <td style={number}>
            <strong>2.0m</strong>
          </td>
          <td style={number}>2.3m</td>
        </tr>
      </tbody>
    </table>
  </div>
);

const Fallbacks: Page = () => (
  <div style={page}>
    <table
      style={{
        position: 'absolute',
        left: 80,
        top: 80,
        borderCollapse: 'collapse',
        transform: 'rotate(5deg)',
      }}
    >
      <tbody>
        <tr>
          <td style={cell}>Tilted cell</td>
        </tr>
      </tbody>
    </table>
    <table style={{ position: 'absolute', left: 80, top: 400, borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td style={cell}>
            <div style={{ background: '#e0f2fe', padding: 8 }}>Boxed block cell</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);

const Separate: Page = () => (
  <div style={page}>
    <table
      id="separate"
      style={{
        position: 'absolute',
        left: 80,
        top: 80,
        borderCollapse: 'separate',
        borderSpacing: 8,
      }}
    >
      <caption style={{ textAlign: 'left' }}>Quarterly summary</caption>
      <tbody>
        <tr>
          <td style={cell}>Plan</td>
          <td style={cell}>Actual</td>
        </tr>
      </tbody>
    </table>
  </div>
);

export default [Native, Fallbacks, Separate] satisfies Page[];
