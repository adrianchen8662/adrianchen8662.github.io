// What the exploded view draws. The loader (exploded-view.ts) turns _data/<model>.yml into this,
// with every formula worked out, and the viewer (components/ExplodedViewer.tsx) draws it.

/** How a number was obtained, weakest last */
export type Status = 'measured' | 'estimated' | 'assumed';

export interface Dim {
  key: string;
  label: string;
  value: number;
  status: Status;
  note?: string;
}

/** A flat shape in the x/y plane, centred on the origin */
export type Shape = { rect: [number, number] } | { circle: number };

export type Hole = Shape & { at: [number, number] };

/** A flat patch drawn on a solid's front or back face, such as a badge or a label */
export type Decal = Shape & {
  at: [number, number];
  material: string;
  /** The face it is on. Only the 3D view can show back faces. */
  side: 'front' | 'back';
  /** Text printed on it (3D view only) */
  lines?: string[];
};

/** A shape pushed back along z: a box, a cylinder, a plate with holes or a tube */
export interface Solid {
  outline: Shape;
  holes: Hole[];
  /** Centre of the front face */
  at: [number, number, number];
  depth: number;
  /** The direction it is pushed along: z (front to back) or x (left to right) */
  axis: 'x' | 'z';
  /** For a round solid: its back diameter as a share of the front, for a cone-shaped dish */
  taper?: number;
  /** Drawing order, lowest first. Interior solids use it as written while inside the cabinet and 100 higher once out. */
  paint: number;
  interior: boolean;
  /** `inner` draws only the walls of the holes, `outer` everything else */
  faces: 'all' | 'inner' | 'outer';
  material: string;
  texture?: 'mesh' | 'chip';
  decals: Decal[];
}

export interface Part {
  id: string;
  name: string;
  info: string;
  /** Where the part travels at full explosion, in mm */
  explode: [number, number, number];
  /** The measurements listed when the part is selected */
  dims: Dim[];
  solids: Solid[];
}

export interface Model {
  name: string;
  /** z of the cabinet's front edge */
  frontPlane: number;
  parts: Part[];
  /** Dims that aren't measured yet, for the "still to measure" list */
  open: Dim[];
  counts: Record<Status, number>;
}
