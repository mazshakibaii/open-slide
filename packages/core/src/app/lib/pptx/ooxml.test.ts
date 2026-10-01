import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildPptxFiles, escapeXml, geometryXml } from './ooxml';
import type { DeckScene, Paragraph, RunStyle, TableCell } from './scene';

const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

const style: RunStyle = {
  font: 'Inter',
  sizePx: 40,
  bold: true,
  italic: false,
  underline: false,
  strike: false,
  color: { r: 26, g: 24, b: 20, a: 1 },
  letterSpacingPx: -0.8,
  baselineShift: null,
  shadow: null,
  outline: null,
  caps: null,
  kerning: false,
  link: null,
  highlight: null,
};

const deck: DeckScene = {
  images: [{ id: 1, bytes: PNG_1PX, format: 'png' }],
  slides: [
    {
      background: { kind: 'solid', color: { r: 247, g: 245, b: 240, a: 1 } },
      notes: 'Open with the quote.\n\nPause.',
      nodes: [
        {
          kind: 'shape',
          name: 'Card',
          box: { x: 100, y: 100, w: 400, h: 200 },
          rotationDeg: 0,
          flipV: false,
          geometry: { kind: 'roundRect', radius: 24 },
          fill: {
            kind: 'gradient',
            angleDeg: 90,
            stops: [
              { pos: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
              { pos: 1, color: { r: 0, g: 0, b: 255, a: 0.5 } },
            ],
          },
          outline: { width: 2, color: { r: 0, g: 0, b: 0, a: 1 }, dash: 'dash' },
          shadow: {
            blur: 30,
            dist: 10,
            dirDeg: 90,
            color: { r: 0, g: 0, b: 0, a: 0.25 },
            spread: 0,
            inner: false,
          },
        },
        {
          kind: 'text',
          name: 'Text: Hello',
          box: { x: 120, y: 120, w: 300, h: 128 },
          rotationDeg: -3,
          flipV: false,
          wrap: true,
          paragraphs: [
            {
              lineSpacingPx: 64,
              align: 'ctr',
              bullet: { kind: 'char', char: '•', color: { r: 0, g: 0, b: 0, a: 1 }, font: 'Arial' },
              marginLeftPx: 20,
              indentPx: -20,
              endSizePx: 40,
              lines: [
                { runs: [{ text: 'Hello <world> & "friends"', style }], sizePx: 40 },
                { runs: [], sizePx: 40 },
                { runs: [{ text: 'again', style: { ...style, bold: false } }], sizePx: 40 },
              ],
            },
          ],
        },
        {
          kind: 'picture',
          name: 'Image',
          box: { x: 600, y: 100, w: 200, h: 100 },
          rotationDeg: 0,
          flipV: false,
          imageId: 1,
          crop: { l: 0.1, t: 0, r: 0.1, b: 0 },
          alpha: 0.8,
          geometry: { kind: 'ellipse' },
          outline: null,
          shadow: null,
        },
      ],
    },
    { background: null, notes: null, nodes: [] },
  ],
};

describe('buildPptxFiles', () => {
  const files = buildPptxFiles(deck);
  const text = (name: string) => strFromU8(files[name]);

  it('emits every package part and wires the relationships', () => {
    expect(Object.keys(files).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'ppt/_rels/presentation.xml.rels',
        'ppt/media/image1.png',
        'ppt/notesMasters/_rels/notesMaster1.xml.rels',
        'ppt/notesMasters/notesMaster1.xml',
        'ppt/notesSlides/_rels/notesSlide1.xml.rels',
        'ppt/notesSlides/notesSlide1.xml',
        'ppt/presProps.xml',
        'ppt/presentation.xml',
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
        'ppt/slideLayouts/slideLayout1.xml',
        'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        'ppt/slideMasters/slideMaster1.xml',
        'ppt/slides/_rels/slide1.xml.rels',
        'ppt/slides/_rels/slide2.xml.rels',
        'ppt/slides/slide1.xml',
        'ppt/slides/slide2.xml',
        'ppt/theme/theme1.xml',
        'ppt/theme/theme2.xml',
      ].sort(),
    );
    expect(text('ppt/presentation.xml')).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    expect(text('ppt/presentation.xml')).toContain('<p:notesMasterId r:id="rId5"/>');
    expect(text('ppt/slides/_rels/slide1.xml.rels')).toContain('Target="../media/image1.png"');
    expect(text('ppt/slides/_rels/slide1.xml.rels')).toContain('notesSlides/notesSlide1.xml');
    expect(text('ppt/slides/_rels/slide2.xml.rels')).not.toContain('notesSlide');
    expect(text('[Content_Types].xml')).toContain('/ppt/notesSlides/notesSlide1.xml');
  });

  it('converts geometry, text and fills into DrawingML', () => {
    const slide = text('ppt/slides/slide1.xml');
    expect(slide).toContain(
      '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="F7F5F0"></a:srgbClr></a:solidFill>',
    );
    expect(slide).toContain('<a:off x="635000" y="635000"/><a:ext cx="2540000" cy="1270000"/>');
    expect(slide).toContain(
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12000"/>',
    );
    expect(slide).toContain('<a:lin ang="0" scaled="0"/>');
    expect(slide).toContain('<a:alpha val="50000"/>');
    expect(slide).toContain('<a:prstDash val="dash"/>');
    expect(slide).toContain('<a:outerShdw blurRad="190500" dist="63500" dir="5400000"');
    expect(slide).toContain('<a:xfrm rot="21420000">');
    expect(slide).toContain('<a:lnSpc><a:spcPts val="3200"/></a:lnSpc>');
    expect(slide).toContain('marL="127000" indent="-127000" algn="ctr"');
    expect(slide).toContain('<a:buChar char="•"/>');
    expect(slide).toContain('sz="2000" b="1" spc="-40" dirty="0"');
    expect(slide).toContain('<a:t>Hello &lt;world&gt; &amp; &quot;friends&quot;</a:t>');
    expect(slide.match(/<a:br>/g)).toHaveLength(2);
    expect(slide).toContain('<a:latin typeface="Inter"/><a:ea typeface="Inter"/>');
    expect(slide).toContain('<a:alphaModFix amt="80000"/>');
    expect(slide).toContain('<a:srcRect l="10000" t="0" r="10000" b="0"/>');
    expect(slide).toContain('<a:prstGeom prst="ellipse">');
    expect(text('ppt/notesSlides/notesSlide1.xml')).toContain('<a:t>Open with the quote.</a:t>');
  });

  it('builds a custom rounded path for uneven corners', () => {
    const xml = geometryXml(
      {
        kind: 'custom',
        radii: [
          { x: 10, y: 10 },
          { x: 0, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 0 },
        ],
      },
      { x: 0, y: 0, w: 100, h: 50 },
    );
    expect(xml).toContain('<a:path w="635000" h="317500">');
    expect(xml.match(/<a:arcTo /g)).toHaveLength(2);
    expect(xml).toContain('stAng="10800000"');
    expect(xml).toContain('stAng="0"');
  });

  it('strips control characters', () => {
    expect(escapeXml('a\u0000b\u0007c\td')).toBe('abc\td');
  });

  it('round-trips through a zip', () => {
    const zipped = zipSync(files);
    const unzipped = unzipSync(zipped);
    expect(Object.keys(unzipped)).toHaveLength(Object.keys(files).length);
    const out = process.env.PPTX_SAMPLE_OUT;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, zipped);
    }
  });
});

describe('geometry guard', () => {
  it('leaves out a node whose geometry did not resolve rather than writing NaN', () => {
    const files = buildPptxFiles({
      images: [{ id: 1, bytes: PNG_1PX, format: 'png' }],
      slides: [
        {
          background: null,
          notes: null,
          nodes: [
            {
              kind: 'picture',
              name: 'Image: broken',
              box: { x: Number.NaN, y: 0, w: 10, h: 10 },
              rotationDeg: 0,
              flipV: false,
              imageId: 1,
              crop: { l: Number.NaN, t: 0, r: 0, b: 0 },
              alpha: 1,
              geometry: { kind: 'rect' },
              outline: null,
              shadow: null,
            },
          ],
        },
      ],
    });
    const slide = strFromU8(files['ppt/slides/slide1.xml']);
    expect(slide).not.toContain('NaN');
    expect(slide).not.toContain('Image: broken');
  });
});

describe('runs and pictures', () => {
  const files = buildPptxFiles({
    images: [{ id: 1, bytes: PNG_1PX, format: 'png' }],
    slides: [
      {
        background: null,
        notes: null,
        nodes: [
          {
            kind: 'text',
            name: 'Text: Docs',
            box: { x: 0, y: 0, w: 400, h: 60 },
            rotationDeg: 0,
            flipV: false,
            wrap: false,
            paragraphs: [
              {
                lineSpacingPx: 60,
                align: 'r',
                rtl: true,
                level: 1,
                spaceBeforePx: 24,
                bullet: null,
                marginLeftPx: 0,
                indentPx: 0,
                endSizePx: 40,
                lines: [
                  {
                    sizePx: 40,
                    runs: [
                      {
                        text: 'Read the ',
                        style: {
                          ...style,
                          kerning: true,
                          caps: 'all',
                          highlight: { r: 253, g: 224, b: 71, a: 1 },
                        },
                      },
                      {
                        text: 'docs & guide',
                        style: { ...style, link: 'https://example.com/a?b=1&c=2' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            kind: 'picture',
            name: 'Image: chart',
            description: 'Revenue by "quarter"',
            box: { x: 0, y: 100, w: 100, h: 100 },
            rotationDeg: 0,
            flipV: false,
            imageId: 1,
            crop: null,
            alpha: 1,
            geometry: { kind: 'rect' },
            outline: null,
            shadow: null,
          },
        ],
      },
    ],
  });
  const slide = strFromU8(files['ppt/slides/slide1.xml']);
  const rels = strFromU8(files['ppt/slides/_rels/slide1.xml.rels']);

  it('writes caps and kerning as run properties rather than baked text', () => {
    expect(slide).toContain('cap="all"');
    expect(slide).toContain('kern="100"');
    expect(slide).toContain('<a:t>Read the </a:t>');
  });

  it('links a run through an external relationship and keeps its own colour', () => {
    const link = /<a:hlinkClick r:id="(rId\d+)">(.*?)<\/a:hlinkClick>/.exec(slide);
    expect(link?.[2]).toContain('<ahyp:hlinkClr');
    expect(rels).toContain(
      `<Relationship Id="${link?.[1]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"/>`,
    );
  });

  it('wraps text boxes that should wrap and grows every box with its text', () => {
    const main = strFromU8(buildPptxFiles(deck)['ppt/slides/slide1.xml']);
    expect(main).toContain('<a:bodyPr wrap="square"');
    expect(main).toContain('<a:spAutoFit/>');
    expect(slide).toContain('<a:bodyPr wrap="none"');
  });

  it('writes direction, outline level and space before on the paragraph', () => {
    expect(slide).toContain('<a:pPr lvl="1" algn="r" rtl="1">');
    expect(slide).toContain('<a:spcBef><a:spcPts val="1200"/></a:spcBef>');
  });

  it('highlights a run', () => {
    expect(slide).toContain('<a:highlight><a:srgbClr val="FDE047"></a:srgbClr></a:highlight>');
  });

  it('carries alt text as the picture description', () => {
    expect(slide).toContain('name="Image: chart" descr="Revenue by &quot;quarter&quot;"');
  });
});

describe('speaker notes', () => {
  const notes = (markdown: string) =>
    strFromU8(
      buildPptxFiles({ images: [], slides: [{ background: null, notes: markdown, nodes: [] }] })[
        'ppt/notesSlides/notesSlide1.xml'
      ],
    );

  it('renders the Markdown the presenter renders instead of its syntax', () => {
    const xml = notes('Open with **the claim**, then *pause* for `questions`.');
    expect(xml).not.toContain('**');
    expect(xml).toMatch(/<a:rPr [^>]*b="1"[^>]*\/?>(<\/a:rPr>)?<a:t>the claim<\/a:t>/);
    expect(xml).toMatch(/<a:rPr [^>]*i="1"[^>]*\/?>(<\/a:rPr>)?<a:t>pause<\/a:t>/);
    expect(xml).toMatch(/<a:latin typeface="Consolas"\/><\/a:rPr><a:t>questions<\/a:t>/);
  });

  it('turns list lines into bulleted and numbered paragraphs', () => {
    const xml = notes('- show the chart\n- take questions\n\n1. first\n2. second');
    expect(xml.match(/<a:buChar char="•"\/>/g)).toHaveLength(2);
    expect(xml.match(/<a:buAutoNum type="arabicPeriod"\/>/g)).toHaveLength(2);
    expect(xml).toContain('<a:t>show the chart</a:t>');
  });

  it('keeps line breaks inside a paragraph and bolds headings', () => {
    const xml = notes('# Intro\nline one\nline two');
    expect(xml).toMatch(/b="1"[^>]*\/?>(<\/a:rPr>)?<a:t>Intro<\/a:t>/);
    expect(xml).toContain('<a:t>line one</a:t></a:r><a:br>');
  });
});

describe('tables', () => {
  const para = (text: string, link: string | null = null): Paragraph[] => [
    {
      lineSpacingPx: 40,
      align: 'r',
      bullet: null,
      marginLeftPx: 0,
      indentPx: 0,
      endSizePx: 28,
      lines: [{ runs: [{ text, style: { ...style, sizePx: 28, link } }], sizePx: 28 }],
    },
  ];
  const black = { r: 17, g: 17, b: 17, a: 1 };
  const line = { width: 2, color: black, dash: 'solid' as const };
  const cell = (over: Partial<TableCell> = {}): TableCell => ({
    merge: null,
    gridSpan: 1,
    rowSpan: 1,
    paragraphs: para('x'),
    fill: null,
    borders: { l: line, r: line, t: line, b: line },
    margins: { l: 12, r: 12, t: 12, b: 12 },
    anchor: 't',
    ...over,
  });
  const files = buildPptxFiles({
    images: [],
    slides: [
      {
        background: null,
        notes: null,
        nodes: [
          {
            kind: 'table',
            name: 'Table #revenue',
            box: { x: 80, y: 80, w: 600, h: 120 },
            rotationDeg: 0,
            flipV: false,
            columns: [200, 400],
            rows: [
              {
                height: 60,
                cells: [
                  cell({
                    gridSpan: 2,
                    paragraphs: para('Header'),
                    fill: { r: 226, g: 232, b: 240, a: 1 },
                  }),
                  cell({ merge: { h: true, v: false }, paragraphs: [] }),
                ],
              },
              {
                height: 60,
                cells: [
                  cell({
                    paragraphs: para('South', 'https://example.com/s'),
                    anchor: 'ctr',
                    borders: {
                      l: null,
                      r: line,
                      t: line,
                      b: { width: 4, color: { r: 220, g: 38, b: 38, a: 1 }, dash: 'dash' },
                    },
                  }),
                  cell({ paragraphs: [] }),
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const slide = strFromU8(files['ppt/slides/slide1.xml']);
  const rels = strFromU8(files['ppt/slides/_rels/slide1.xml.rels']);

  it('writes a graphic frame holding a DrawingML table', () => {
    expect(slide).toContain(
      '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Table #revenue"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>',
    );
    expect(slide).toContain(
      '<p:xfrm><a:off x="508000" y="508000"/><a:ext cx="3810000" cy="762000"/></p:xfrm>',
    );
    expect(slide).toContain(
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="1270000"/><a:gridCol w="2540000"/></a:tblGrid><a:tr h="381000">',
    );
  });

  it('spans and merges cells', () => {
    expect(slide).toMatch(/<a:tc gridSpan="2"><a:txBody>.*?<a:t>Header<\/a:t>/);
    expect(slide).toContain('<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p>');
  });

  it('writes cell properties in schema order', () => {
    const tcPr = /<a:tcPr [^>]*>.*?<\/a:tcPr>/gs;
    const props = slide.match(tcPr) ?? [];
    expect(props[0]).toMatch(
      /^<a:tcPr marL="76200" marR="76200" marT="76200" marB="76200" anchor="t"><a:lnL w="12700"[^>]*>.*<\/a:lnL><a:lnR .*<\/a:lnR><a:lnT .*<\/a:lnT><a:lnB .*<\/a:lnB><a:solidFill><a:srgbClr val="E2E8F0"><\/a:srgbClr><\/a:solidFill><\/a:tcPr>$/,
    );
    expect(props[2]).toContain('anchor="ctr"><a:lnL><a:noFill/></a:lnL>');
    expect(props[2]).toMatch(
      /<a:lnB w="25400"[^>]*><a:solidFill><a:srgbClr val="DC2626"><\/a:srgbClr><\/a:solidFill><a:prstDash val="dash"\/>/,
    );
    expect(props[2]).toMatch(/<\/a:lnB><a:noFill\/><\/a:tcPr>$/);
  });

  it('writes cell text as paragraphs, links included', () => {
    expect(slide).toMatch(/<a:tc><a:txBody><a:bodyPr\/><a:lstStyle\/><a:p><a:pPr algn="r">/);
    const rId = /<a:hlinkClick r:id="(rId\d+)"/.exec(slide)?.[1];
    expect(rels).toContain(`Id="${rId}"`);
    expect(rels).toContain('Target="https://example.com/s" TargetMode="External"');
  });
});
