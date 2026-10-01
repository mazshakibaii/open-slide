import type { GradientStop, Radii, Rgba } from './css';

export type Rect = { x: number; y: number; w: number; h: number };

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'svg';

export type SceneImage = {
  id: number;
  bytes: Uint8Array;
  format: ImageFormat;
  /** Vector companion embedded next to the PNG fallback via svgBlip. */
  svg?: Uint8Array;
};

/** Fractions (0..1) of the source image trimmed from each edge. */
export type Crop = { l: number; t: number; r: number; b: number };

export type Fill =
  | { kind: 'solid'; color: Rgba }
  | { kind: 'gradient'; angleDeg: number; stops: GradientStop[] }
  /** Path gradient centred at (x, y), fractions of the box, reaching its farthest corner. */
  | { kind: 'radial'; x: number; y: number; stops: GradientStop[] }
  | { kind: 'image'; imageId: number; crop: Crop | null; alpha: number };

export type Outline = { width: number; color: Rgba; dash: 'solid' | 'dash' | 'dot' };

export type ShadowEffect = {
  blur: number;
  dist: number;
  dirDeg: number;
  color: Rgba;
  spread: number;
  inner: boolean;
};

export type Geometry =
  | { kind: 'rect' }
  | { kind: 'roundRect'; radius: number }
  | { kind: 'ellipse' }
  | { kind: 'custom'; radii: Radii };

type NodeBase = {
  name: string;
  box: Rect;
  rotationDeg: number;
  flipV: boolean;
};

export type ShapeNode = NodeBase & {
  kind: 'shape';
  geometry: Geometry;
  fill: Fill | null;
  outline: Outline | null;
  shadow: ShadowEffect | null;
};

export type PictureNode = NodeBase & {
  kind: 'picture';
  /** Alt text for screen readers. */
  description?: string | null;
  imageId: number;
  crop: Crop | null;
  alpha: number;
  geometry: Geometry;
  outline: Outline | null;
  shadow: ShadowEffect | null;
};

export type TextShadow = { blur: number; dist: number; dirDeg: number; color: Rgba };

export type RunStyle = {
  font: string;
  sizePx: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: Rgba;
  letterSpacingPx: number;
  baselineShift: 'super' | 'sub' | null;
  shadow: TextShadow | null;
  outline: { width: number; color: Rgba } | null;
  /** Rendered capitals that the source text does not carry (`text-transform` / `font-variant`). */
  caps: 'all' | 'small' | null;
  kerning: boolean;
  /** Absolute URL of the enclosing link. */
  link: string | null;
  /** A plain inline background drawn behind the text (`<mark>`). */
  highlight: Rgba | null;
  /** `background-clip: text` gradient, painted instead of `color`. */
  gradient: { angleDeg: number; stops: GradientStop[] } | null;
};

export type Run = { text: string; style: RunStyle };

export type TextLine = { runs: Run[]; sizePx: number };

export type Bullet =
  | { kind: 'char'; char: string; color: Rgba; font: string | null }
  | { kind: 'number'; scheme: string; startAt: number; color: Rgba };

export type Paragraph = {
  lineSpacingPx: number;
  /** Text between hard line breaks; the reader wraps each one itself. */
  lines: TextLine[];
  align: 'l' | 'ctr' | 'r' | 'just';
  bullet: Bullet | null;
  marginLeftPx: number;
  indentPx: number;
  endSizePx: number;
  rtl?: boolean;
  /** Outline level, for nested list items. */
  level?: number;
  spaceBeforePx?: number;
};

export type TextNode = NodeBase & {
  kind: 'text';
  paragraphs: Paragraph[];
  /** Wrap at the box width; off for single lines sized to their text and for `nowrap`. */
  wrap: boolean;
  /** Uniform scale carried by the world transform; font metrics are pre-multiplied. */
};

export type CellBorder = { width: number; color: Rgba; dash: Outline['dash'] } | null;

export type TableCell = {
  /** Placeholder slot covered by a spanning cell to the left (`h`), above (`v`) or both. */
  merge: { h: boolean; v: boolean } | null;
  gridSpan: number;
  rowSpan: number;
  paragraphs: Paragraph[];
  fill: Rgba | null;
  borders: { l: CellBorder; r: CellBorder; t: CellBorder; b: CellBorder };
  margins: { l: number; r: number; t: number; b: number };
  anchor: 't' | 'ctr' | 'b';
};

export type TableNode = NodeBase & {
  kind: 'table';
  columns: number[];
  rows: { height: number; cells: TableCell[] }[];
};

export type SceneNode = ShapeNode | PictureNode | TextNode | TableNode;

export type SlideScene = {
  background: Fill | null;
  nodes: SceneNode[];
  notes: string | null;
};

export type DeckScene = {
  slides: SlideScene[];
  images: SceneImage[];
};
