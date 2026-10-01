import type { Page, SlideMeta } from '@open-slide/core';
import locked from './assets/fixture-locked.ttf';
import medium from './assets/fixture-sans-medium.ttf';
import regular from './assets/fixture-sans-regular.ttf';

export const meta: SlideMeta = {
  title: 'PPTX Fonts',
  createdAt: '2026-01-02T13:00:00.000Z',
};

const css = `
@font-face { font-family: 'Fixture Sans'; src: url(${regular}) format('truetype'); font-weight: 400; }
@font-face { font-family: 'Fixture Sans'; src: url(${medium}) format('truetype'); font-weight: 500; }
@font-face { font-family: 'Fixture Locked'; src: url(${locked}) format('truetype'); }
`;

const at = (top: number, fontFamily: string, fontWeight: number) => ({
  position: 'absolute' as const,
  left: 80,
  top,
  margin: 0,
  fontFamily,
  fontWeight,
});

const Faces: Page = () => (
  <div
    style={{ position: 'relative', width: 1920, height: 1080, background: '#fff', fontSize: 40 }}
  >
    <style>{css}</style>
    <p style={at(80, "'Fixture Sans', sans-serif", 400)}>Regular fixture text</p>
    <p style={at(180, "'Fixture Sans', sans-serif", 500)}>Medium fixture text</p>
    <p style={at(280, "'Fixture Sans', sans-serif", 700)}>Bold fixture text</p>
    <p style={at(380, "'Geist Variable', sans-serif", 700)}>Geist variable text</p>
    <p style={at(480, "'Fixture Locked', sans-serif", 400)}>Locked fixture text</p>
  </div>
);

export default [Faces] satisfies Page[];
