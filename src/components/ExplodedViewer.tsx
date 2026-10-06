// An exploded view of an object, drawn to scale from its measurements (_data/<model>.yml, read by
// src/lib/exploded-view.ts). Each part is a few boxes and cylinders. In a browser with WebGL they become
// a 3D scene you can turn (exploded-three.ts, loaded once the viewer is on screen). Until then, and without
// WebGL or JavaScript, this projects them at a fixed angle, sorts the faces back to front and draws SVG.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dim, Model, Part, Shape, Solid, Status } from '../lib/exploded-view-types';
import { badgeShapes } from '../lib/badge';
import type { SceneApi, ViewName } from './exploded-three';
import './ExplodedViewer.css';

// Looking from the front, a little to the right of it and a little above it
const YAW = (32 * Math.PI) / 180;
const PITCH = (-20 * Math.PI) / 180;
const COS_YAW = Math.cos(YAW);
const SIN_YAW = Math.sin(YAW);
const COS_PITCH = Math.cos(PITCH);
const SIN_PITCH = Math.sin(PITCH);

/** x, y (up), z (back) to screen x, screen y (down) and depth. Depth grows away from the viewer. */
function project(x: number, y: number, z: number): [number, number, number] {
  const turnedX = x * COS_YAW + z * SIN_YAW;
  const turnedZ = -x * SIN_YAW + z * COS_YAW;
  const up = y * COS_PITCH - turnedZ * SIN_PITCH;
  return [turnedX, -up, y * SIN_PITCH + turnedZ * COS_PITCH];
}

/** Same turn for a direction. Returns right, up and away. */
function turn(x: number, y: number, z: number): [number, number, number] {
  const [sx, sy, depth] = project(x, y, z);
  return [sx, -sy, depth];
}

// Light from the upper left, toward the viewer
const LIGHT = (() => {
  const v = [-0.45, 0.65, -0.62];
  const length = Math.hypot(...v);
  return v.map((n) => n / length);
})();

type Point = [number, number];

interface Contour {
  points: Point[];
  /** Round contours are drawn without seams between their facets */
  curved: boolean;
}

function contourOf(shape: Shape, at: Point = [0, 0]): Contour {
  if ('rect' in shape) {
    const [w, h] = shape.rect;
    const [cx, cy] = at;
    return {
      curved: false,
      points: [
        [cx - w / 2, cy - h / 2],
        [cx + w / 2, cy - h / 2],
        [cx + w / 2, cy + h / 2],
        [cx - w / 2, cy + h / 2],
      ],
    };
  }
  const radius = shape.circle / 2;
  const segments = shape.circle < 12 ? 16 : 36;
  return {
    curved: true,
    points: Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return [at[0] + radius * Math.cos(angle), at[1] + radius * Math.sin(angle)] as Point;
    }),
  };
}

interface Prepared {
  part: Part;
  solid: Solid;
  order: number;
  outer: Contour;
  holes: Contour[];
}

interface Poly {
  key: string;
  partId: string;
  material: string;
  d: string;
  fill?: string;
  curved?: boolean;
  /** An overlay or decal that shouldn't take the pointer */
  overlay?: 'mesh' | 'chip' | 'decal';
}

const shadeOf = (normal: [number, number, number]) => {
  const light = normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2];
  return light > 0.5 ? `white ${Math.round((light - 0.5) * 60)}%` : `black ${Math.round((0.5 - light) * 70)}%`;
};

const path = (points: [number, number][]) => `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

/** The solids of every part, with where they have moved to, as faces sorted back to front */
function draw(model: Model, prepared: Prepared[], t: number): Poly[] {
  const zRange = new Map<string, [number, number]>();
  for (const { part, solid } of prepared) {
    const range = zRange.get(part.id) ?? [Infinity, -Infinity];
    zRange.set(part.id, [Math.min(range[0], solid.at[2]), Math.max(range[1], solid.at[2] + solid.depth)]);
  }
  // A part that began inside the cabinet is drawn behind its walls until it has come out of the front
  const emerged = (part: Part) => {
    const [front, back] = zRange.get(part.id)!;
    return (front + back) / 2 + part.explode[2] * t < model.frontPlane;
  };

  const sorted = prepared
    .map((p) => ({ ...p, rank: p.solid.paint + (p.solid.interior && emerged(p.part) ? 100 : 0) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order);

  const polys: Poly[] = [];
  for (const { part, solid, outer, holes, order } of sorted) {
    // The fixed-angle drawing can't show a solid that lies sideways
    if (solid.axis !== 'z') continue;
    const [ox, oy, oz] = [part.explode[0] * t, part.explode[1] * t, part.explode[2] * t];
    const front = solid.at[2] + oz;
    const back = front + solid.depth;
    const at = (p: Point, z: number) => project(p[0] + solid.at[0] + ox, p[1] + solid.at[1] + oy, z);
    const screen = (p: Point, z: number): Point => {
      const [x, y] = at(p, z);
      return [x, y];
    };
    const make = (suffix: string, base: Omit<Poly, 'key' | 'partId' | 'material'>) =>
      polys.push({ key: `${order}-${suffix}`, partId: part.id, material: solid.material, ...base });

    // Walls of a contour: the ones that face the viewer. A hole's walls face into the hole.
    const walls = (contour: Contour, side: 1 | -1, name: string) => {
      const { points, curved } = contour;
      points.forEach((p, i) => {
        const q = points[(i + 1) % points.length];
        const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
        const length = Math.hypot(dx, dy);
        const normal = turn((side * dy) / length, (-side * dx) / length, 0);
        if (normal[2] >= 0) return;
        make(`${name}${i}`, {
          d: path([screen(p, front), screen(q, front), screen(q, back), screen(p, back)]),
          fill: shadeOf(normal),
          curved,
        });
      });
    };

    if (solid.faces !== 'outer') holes.forEach((hole, i) => walls(hole, -1, `h${i}`));
    if (solid.faces === 'inner') continue;
    walls(outer, 1, 'o');

    const flat = (contour: Contour) => path(contour.points.map((p) => screen(p, front)));
    make('cap', { d: [outer, ...holes].map(flat).join(''), fill: shadeOf(turn(0, 0, -1)) });
    if (solid.texture) make('texture', { d: [outer, ...holes].map(flat).join(''), overlay: solid.texture });
    solid.decals.forEach((decal, i) => {
      if (decal.side === 'back') return;
      // The badge: the black piece sunk in its notch, then the gold plate standing a little higher round it
      if (decal.art === 'badge' && 'rect' in decal) {
        const [w, h] = decal.rect;
        const plate = decal.height ?? 1;
        const pieces = [
          { name: 'inlay', points: badgeShapes.inlay, lift: Math.max(0.05, plate - (decal.recess ?? 0.4)), material: 'badge_inlay' },
          { name: 'gold', points: badgeShapes.gold, lift: plate, material: decal.material },
        ];
        for (const piece of pieces) {
          polys.push({
            key: `${order}-badge-${piece.name}`,
            partId: part.id,
            material: piece.material,
            d: path(piece.points.map(([u, v]) => screen([decal.at[0] + (u - 0.5) * w, decal.at[1] + (0.5 - v) * h], front - piece.lift))),
            overlay: 'decal',
          });
        }
        return;
      }
      const contour = contourOf(decal, decal.at);
      polys.push({
        key: `${order}-decal${i}`,
        partId: part.id,
        material: decal.material,
        d: path(contour.points.map((p) => screen(p, front - 0.01))),
        overlay: 'decal',
      });
    });
  }
  return polys;
}

/** The area every pose of the model fits in, so the drawing doesn't jump as the parts move */
function bounds(prepared: Prepared[]) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { part, solid, outer } of prepared) {
    for (const t of [0, 1]) {
      for (const z of [solid.at[2], solid.at[2] + solid.depth]) {
        for (const p of outer.points) {
          const [x, y] = project(
            p[0] + solid.at[0] + part.explode[0] * t,
            p[1] + solid.at[1] + part.explode[1] * t,
            z + part.explode[2] * t,
          );
          [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
        }
      }
    }
  }
  const pad = 10;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

const STATUS_LABEL: Record<Status, string> = { measured: 'Measured', estimated: 'Estimated from photos', assumed: 'Assumed' };

const mm = (value: number) => `${Number(value.toFixed(2))} mm`;

function Dims({ dims }: { dims: Dim[] }) {
  return (
    <dl className="ev-dims">
      {dims.map((d) => (
        <div key={d.key}>
          <dt>{d.label}</dt>
          <dd>
            {mm(d.value)} <span className={`ev-status ev-status-${d.status}`}>{STATUS_LABEL[d.status]}</span>
            {d.note && <span className="ev-note">{d.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ExplodedViewer({ model }: { model: Model }) {
  const prepared = useMemo(
    () =>
      model.parts.flatMap((part) =>
        part.solids.map((solid) => ({
          part,
          solid,
          outer: contourOf(solid.outline),
          holes: solid.holes.map((hole) => contourOf(hole, hole.at)),
        })),
      ).map((p, order) => ({ ...p, order })),
    [model],
  );
  const view = useMemo(() => bounds(prepared), [prepared]);
  const meshSolid = model.parts.flatMap((p) => p.solids).find((s) => s.texture === 'mesh');
  const meshPitch = meshSolid?.texturePitch ?? 1.6;
  const meshHole = meshSolid?.textureHole ?? 0.9;

  const [t, setT] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const position = useRef(0);
  const frame = useRef(0);

  const move = (to: number) => {
    position.current = to;
    setT(to);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const animateTo = (to: number) => {
    cancelAnimationFrame(frame.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return move(to);
    const from = position.current;
    const start = performance.now();
    const duration = 300 + 900 * Math.abs(to - from);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      move(from + (to - from) * eased);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  const stage = useRef<HTMLDivElement>(null);
  const [gl, setGl] = useState<SceneApi | null>(null);
  const [pose, setPose] = useState<ViewName>('angle');
  // The scene calls back into these, and is made once, so they read the latest state through a ref
  const events = useRef({ hover: (_id: string | null) => {}, select: (_id: string | null) => {} });

  useEffect(() => {
    let scene: SceneApi | undefined;
    let cancelled = false;
    import('./exploded-three')
      .then(({ createScene }) => {
        if (cancelled || !stage.current) return;
        scene = createScene(stage.current, model, {
          hover: (id) => events.current.hover(id),
          select: (id) => events.current.select(id),
        });
        setGl(scene);
      })
      .catch(() => {
        // No WebGL, or the chunk failed to load: the SVG drawing stays
      });
    return () => {
      cancelled = true;
      scene?.dispose();
      setGl(null);
    };
  }, [model]);

  const polys = useMemo(() => (gl ? [] : draw(model, prepared, t)), [gl, model, prepared, t]);
  const activeId = hovered ?? pinned;
  const active = model.parts.find((p) => p.id === activeId);
  const exploded = t > 0.5;
  const select = (id: string) => setPinned((current) => (current === id ? null : id));
  // Hovering is for a mouse; a tap on a touch screen selects instead
  const hoverProps = (id: string) => ({
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHovered(id),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHovered(null),
  });
  events.current = { hover: setHovered, select: (id) => setPinned((current) => (id === null || id === current ? null : id)) };
  useEffect(() => gl?.setExplode(t), [gl, t]);
  useEffect(() => gl?.setActive(activeId), [gl, activeId]);
  const { counts } = model;

  return (
    <figure className="diagram ev">
      <figcaption>
        <strong>{model.name}, taken apart</strong>
        <span>Drawn to scale from measurements. {gl ? 'Drag to turn it. ' : ''}Hover or tap a part for its name and sizes.</span>
      </figcaption>

      <div className="ev-stage" ref={stage}>
      <svg
        className="ev-svg"
        data-hidden={gl ? '' : undefined}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="img"
        aria-label={`Exploded view of the ${model.name}: ${model.parts.map((p) => p.name.toLowerCase()).join(', ')}.`}
        onClick={(e) => e.target === e.currentTarget && setPinned(null)}
      >
        <defs>
          <pattern id="ev-mesh" width={meshPitch} height={meshPitch} patternUnits="userSpaceOnUse">
            <rect
              x={(meshPitch - meshHole) / 2}
              y={(meshPitch - meshHole) / 2}
              width={meshHole}
              height={meshHole}
              rx={meshHole * 0.22}
              fill="rgba(255,255,255,.22)"
            />
          </pattern>
          <pattern id="ev-chip" width="14" height="14" patternUnits="userSpaceOnUse">
            {[[1, 2, 1.6, 0.7], [5, 1, 0.9, 0.9], [9, 3, 1.8, 0.8], [12, 1, 0.8, 0.6], [3, 6, 1.1, 1.1], [7, 7, 1.9, 0.7], [11, 8, 1, 1], [1, 10, 1.7, 0.8], [5, 11, 0.9, 0.9], [9, 12, 1.5, 0.7], [12, 12, 1.1, 0.8]].map(([x, y, w, h], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} fill={i % 2 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.22)'} />
            ))}
          </pattern>
        </defs>
        {polys.map((poly) => {
          const dim = activeId !== null && activeId !== poly.partId;
          if (poly.overlay === 'mesh' || poly.overlay === 'chip') {
            return <path key={poly.key} d={poly.d} fill={`url(#ev-${poly.overlay})`} className={`ev-overlay${dim ? ' ev-dim' : ''}`} />;
          }
          const style = poly.fill
            ? ({ fill: `color-mix(in srgb, var(--mat), ${poly.fill})`, ...(poly.curved ? { stroke: `color-mix(in srgb, var(--mat), ${poly.fill})` } : {}) } as React.CSSProperties)
            : undefined;
          return (
            <path
              key={poly.key}
              d={poly.d}
              fillRule="evenodd"
              style={style}
              className={`ev-poly ev-mat-${poly.material}${poly.curved ? ' ev-curved' : ''}${poly.overlay ? ' ev-decal' : ''}${dim ? ' ev-dim' : ''}${poly.partId === activeId ? ' ev-active' : ''}`}
              {...(poly.overlay ? {} : { ...hoverProps(poly.partId), onClick: () => select(poly.partId) })}
            />
          );
        })}
      </svg>
      </div>

      {gl && (
        <div className="ev-views" role="group" aria-label="View">
          {(['angle', 'front', 'side', 'top', 'back'] as const).map((name) => (
            <button
              key={name}
              type="button"
              className="ev-part"
              aria-pressed={pose === name}
              onClick={() => {
                setPose(name);
                gl.setView(name, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
              }}
            >
              {name === 'angle' ? 'Angled' : name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="ev-controls">
        <button type="button" className="ev-button" onClick={() => animateTo(exploded ? 0 : 1)}>
          {exploded ? 'Assemble' : 'Explode'}
        </button>
        <label className="ev-slider">
          <span>Take apart</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(t * 100)}
            onChange={(e) => {
              cancelAnimationFrame(frame.current);
              move(Number(e.target.value) / 100);
            }}
          />
        </label>
      </div>

      <ul className="ev-parts" aria-label="Parts">
        {[...model.parts].reverse().map((part) => (
          <li key={part.id}>
            <button
              type="button"
              className="ev-part"
              aria-pressed={pinned === part.id}
              onClick={() => select(part.id)}
              {...hoverProps(part.id)}
            >
              {part.name}
            </button>
          </li>
        ))}
      </ul>

      <div className="ev-detail" aria-live="polite">
        {active ? (
          <>
            <h3>{active.name}</h3>
            <p>{active.info}</p>
            <Dims dims={active.dims} />
          </>
        ) : (
          <p className="ev-hint">Pick a part above, or point at it in the drawing.</p>
        )}
      </div>

      <p className="diagram-note ev-summary">
        {counts.measured} measurements taken, {counts.estimated} estimated from photos, {counts.assumed} assumed for now.
      </p>
      {model.open.length > 0 && (
        <details className="ev-open">
          <summary>Still to measure ({model.open.length})</summary>
          <Dims dims={model.open} />
        </details>
      )}
    </figure>
  );
}
