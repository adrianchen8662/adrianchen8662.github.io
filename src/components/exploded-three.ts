// The rotatable 3D version of the exploded view, built from the same Model as the SVG drawing.
// Loaded on demand by ExplodedViewer.tsx so three.js only downloads once the viewer is on screen.
//
// Our model has z running front to back; three.js has z coming toward the viewer, so a part at
// z = 50 sits at world z = -50. Everything below converts at the point of placing things.
import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  DirectionalLight,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  Shape,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { badgeShapes, type UnitPoint } from '../lib/badge';
import type { Decal, Model, Shape as ModelShape, Solid } from '../lib/exploded-view-types';

/** Field of view at zoom 1. Zooming narrows it, like a telephoto lens, so the camera never moves into the model. */
const BASE_FOV = 28;

export type ViewName = 'angle' | 'front' | 'side' | 'top' | 'back';

/** Azimuth (degrees, positive to the speaker's right) and elevation (degrees above the horizon) */
const VIEWS: Record<ViewName, [number, number]> = {
  angle: [32, 20],
  front: [0, 0],
  side: [90, 0],
  top: [0, 89],
  back: [180, 12],
};

export interface SceneCallbacks {
  hover: (id: string | null) => void;
  select: (id: string | null) => void;
  /** The zoom changed: 1 is the whole model fitted to the window */
  zoom: (zoom: number) => void;
}

export interface SceneApi {
  setExplode: (t: number) => void;
  setActive: (id: string | null) => void;
  setView: (view: ViewName, instant: boolean) => void;
  zoomBy: (factor: number) => void;
  /** Back to the whole model fitted to the window, keeping the angle */
  resetZoom: () => void;
  /** Fullscreen: the scroll wheel zooms without needing Ctrl, and touch gestures are free */
  setFull: (full: boolean) => void;
  dispose: () => void;
}

interface Look {
  color: number;
  roughness: number;
  metalness: number;
  /** Black parts are lifted a little on a dark page so they don't vanish into it */
  themed?: boolean;
}

const LOOKS: Record<string, Look> = {
  grille: { color: 0x2b2a28, roughness: 0.55, metalness: 0.35, themed: true },
  cabinet: { color: 0x2b2a28, roughness: 0.8, metalness: 0.05, themed: true },
  baffle: { color: 0x2b2a28, roughness: 0.75, metalness: 0.05, themed: true },
  plate: { color: 0x2b2a28, roughness: 0.5, metalness: 0.05, themed: true },
  screw: { color: 0x2b2a28, roughness: 0.4, metalness: 0.6, themed: true },
  steel: { color: 0x9aa0a6, roughness: 0.45, metalness: 0.7 },
  magnet: { color: 0x3a3834, roughness: 0.6, metalness: 0.3 },
  // Yellow-zinc plated frames, silver magnet cups, white foam and the smooth brown inside of the box
  zinc: { color: 0xb9a85c, roughness: 0.4, metalness: 0.75 },
  silver: { color: 0xaaa8a2, roughness: 0.4, metalness: 0.8 },
  foam: { color: 0xe9e8e3, roughness: 1, metalness: 0 },
  fiberboard: { color: 0x8d7658, roughness: 0.95, metalness: 0 },
  clip_red: { color: 0xc42a2d, roughness: 0.5, metalness: 0 },
  clip_black: { color: 0x1b1b1b, roughness: 0.5, metalness: 0 },
  recess: { color: 0x161616, roughness: 0.7, metalness: 0 },
  badge_inlay: { color: 0x141414, roughness: 0.3, metalness: 0.2 },
  screw_head: { color: 0x3a3a3a, roughness: 0.4, metalness: 0.5 },
  cone: { color: 0x6d695e, roughness: 0.9, metalness: 0 },
  cardboard: { color: 0xb69b72, roughness: 0.95, metalness: 0 },
  particleboard: { color: 0xffffff, roughness: 0.95, metalness: 0 },
  felt: { color: 0x7a7563, roughness: 1, metalness: 0 },
  capacitor: { color: 0x34609d, roughness: 0.5, metalness: 0.1 },
  brass: { color: 0xc5a550, roughness: 0.35, metalness: 0.8 },
};

const BLACK_DARK = 0x4a4740;

/** Particleboard speckle, one tile every 30 mm */
function chipTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#b88c52';
  g.fillRect(0, 0, size, size);
  // A seeded generator, so the board looks the same every time
  let state = 0x9e3779b9;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 700; i++) {
    const light = random() > 0.45;
    g.fillStyle = light ? `rgba(255,240,200,${0.2 + random() * 0.25})` : `rgba(60,35,10,${0.15 + random() * 0.25})`;
    const w = 2 + random() * 12;
    const h = 1.5 + random() * 4;
    const x = random() * size;
    const y = random() * size;
    // Draw across the edges too, so the tile joins up
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) g.fillRect(x + dx, y + dy, w, h);
  }
  return canvas;
}

/** The perforated grille: dark metal with lighter, rounded-square holes, one cell per hole pitch */
function meshTexture(pitch: number, hole: number) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#2e2d30';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#6a6762';
  const side = (hole / pitch) * size;
  g.beginPath();
  g.roundRect((size - side) / 2, (size - side) / 2, side, side, side * 0.22);
  g.fill();
  return canvas;
}

/** A black sticker with white printing, as on the back of the cabinet */
function labelTexture(lines: string[], aspect: number) {
  const width = 640;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width / aspect);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#111';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#f2f2f2';
  g.textBaseline = 'top';
  const rows = lines.length + 0.6;
  const size = Math.min(44, canvas.height / (rows * 1.5));
  lines.forEach((line, i) => {
    g.font = `${i === 0 ? 'bold ' : ''}${size}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(line, width * 0.06, canvas.height * 0.1 + i * size * 1.6);
    if (i === 0) g.fillRect(width * 0.06, canvas.height * 0.1 + size * 1.3, width * 0.88, 2);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function textureOf(canvas: HTMLCanvasElement, mmPerTile: number) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  // The top and bottom faces' texture coordinates are in millimetres
  texture.repeat.set(1 / mmPerTile, 1 / mmPerTile);
  texture.anisotropy = 4;
  return texture;
}

function shapeOf(outline: ModelShape, at: [number, number] = [0, 0], hole = false) {
  const path = hole ? new Path() : new Shape();
  if ('rect' in outline) {
    const [w, h] = outline.rect;
    const [x, y] = at;
    path.moveTo(x - w / 2, y - h / 2);
    path.lineTo(x + w / 2, y - h / 2);
    path.lineTo(x + w / 2, y + h / 2);
    path.lineTo(x - w / 2, y + h / 2);
    path.closePath();
  } else {
    path.absarc(at[0], at[1], outline.circle / 2, 0, Math.PI * 2, false);
  }
  return path;
}

function geometryOf(solid: Solid): BufferGeometry {
  // A cone-shaped dish: wider at the front, narrower at the back
  if (solid.taper !== undefined && 'circle' in solid.outline) {
    const radius = solid.outline.circle / 2;
    const cone = new CylinderGeometry(radius, radius * solid.taper, solid.depth, 40);
    cone.rotateX(Math.PI / 2);
    cone.translate(0, 0, -solid.depth / 2);
    return cone;
  }
  const shape = shapeOf(solid.outline) as Shape;
  for (const hole of solid.holes) shape.holes.push(shapeOf(hole, hole.at, true));
  const geometry = new ExtrudeGeometry(shape, { depth: solid.depth, bevelEnabled: false, curveSegments: 40 });
  // Extrusion runs toward +z; the front face should sit at z = 0 and the part run away from the viewer
  geometry.translate(0, 0, -solid.depth);
  return geometry;
}

interface PartNode {
  group: Group;
  explode: [number, number, number];
  materials: MeshStandardMaterial[];
  lines: LineBasicMaterial[];
}

export function createScene(container: HTMLElement, model: Model, callbacks: SceneCallbacks): SceneApi {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const canvas = renderer.domElement;
  canvas.className = 'ev-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `3D view of the ${model.name}. Drag to rotate, or use the arrow keys. Plus and minus zoom, and shift with the arrow keys moves it. The parts list below does the same job without the mouse.`,
  );
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(BASE_FOV, 1, 10, 6000);
  scene.add(camera);
  // The lights ride on the camera, so whichever way the speaker is turned its lit side stays readable
  camera.add(new HemisphereLight(0xffffff, 0x8a8478, 1.5));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(-300, 500, 400);
  camera.add(key);

  const root = new Group();
  scene.add(root);

  const textures: Texture[] = [];
  const chip = textureOf(chipTexture(), 30);
  const meshSolid = model.parts.flatMap((p) => p.solids).find((s) => s.texture === 'mesh');
  const pitch = meshSolid?.texturePitch ?? 1.6;
  const grid = textureOf(meshTexture(pitch, meshSolid?.textureHole ?? 0.9), pitch);
  textures.push(chip, grid);

  const geometries: BufferGeometry[] = [];
  const themed: { material: MeshStandardMaterial; look: Look }[] = [];
  const pickable: Mesh[] = [];
  const nodes = new Map<string, PartNode>();

  for (const part of model.parts) {
    const node: PartNode = { group: new Group(), explode: part.explode, materials: [], lines: [] };
    nodes.set(part.id, node);
    root.add(node.group);

    node.group.name = part.id;

    const material = (name: string, map: Texture | null = null) => {
      const look = LOOKS[name] ?? LOOKS.steel;
      // A textured face takes its colour from the texture
      const m = new MeshStandardMaterial({ color: map ? 0xffffff : look.color, roughness: look.roughness, metalness: look.metalness, map });
      node.materials.push(m);
      if (look.themed && !map) themed.push({ material: m, look });
      return m;
    };

    const decalMaterial = (decal: Decal) => {
      if (!decal.lines || !('rect' in decal)) return material(decal.material);
      const texture = labelTexture(decal.lines, decal.rect[0] / decal.rect[1]);
      textures.push(texture);
      const m = new MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0 });
      node.materials.push(m);
      return m;
    };

    // The SVG draws a cabinet's inside walls as their own pass. Here they become a thin liner,
    // so the inside of the box can be a different colour from the outside.
    const solids = part.solids.map((solid): Solid => {
      const opening = solid.holes[0];
      if (solid.faces !== 'inner' || !opening || !('rect' in opening)) return solid;
      const [w, h] = opening.rect;
      return { ...solid, outline: { rect: [w, h] }, holes: [{ rect: [w - 0.4, h - 0.4], at: [0, 0] }], faces: 'all' };
    });

    for (const solid of solids) {
      const geometry = geometryOf(solid);
      geometries.push(geometry);
      const map = solid.texture === 'mesh' ? grid : solid.texture === 'chip' ? chip : null;
      const faces = material(solid.material, map);
      const walls = map ? faces : material(solid.material);
      // Extruded shapes have two material slots (the end faces, then the walls); a cone has three (walls, front, back)
      const mesh = new Mesh(geometry, solid.taper !== undefined ? [walls, faces, faces] : [faces, walls]);
      mesh.position.set(solid.at[0], solid.at[1], -solid.at[2]);
      // A solid pushed along x lies on its side
      if (solid.axis === 'x') mesh.rotation.y = -Math.PI / 2;
      mesh.userData.partId = part.id;
      node.group.add(mesh);
      pickable.push(mesh);

      const edges = new EdgesGeometry(geometry, 40);
      geometries.push(edges);
      const lineMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.5 });
      node.lines.push(lineMaterial);
      mesh.add(new LineSegments(edges, lineMaterial));

      for (const decal of solid.decals) {
        // The badge is real geometry: a gold plate, and a separate black piece in its notch that stands higher
        if (decal.art === 'badge' && 'rect' in decal) {
          const [w, h] = decal.rect;
          const plate = decal.height ?? 0.5;
          const outline = (points: UnitPoint[]) => {
            const shape = new Shape();
            points.forEach(([u, v], i) => {
              const x = decal.at[0] + (u - 0.5) * w;
              const y = decal.at[1] + (0.5 - v) * h;
              if (i === 0) shape.moveTo(x, y);
              else shape.lineTo(x, y);
            });
            shape.closePath();
            return shape;
          };
          const pieces: [UnitPoint[], number, string][] = [
            [badgeShapes.gold, plate, decal.material],
            [badgeShapes.inlay, Math.max(0.05, plate - (decal.recess ?? 0.4)), 'badge_inlay'],
          ];
          for (const [points, depth, look] of pieces) {
            // Extrusion runs outward from the grille's face, toward the viewer
            const piece = new ExtrudeGeometry(outline(points), { depth, bevelEnabled: false });
            geometries.push(piece);
            const badge = new Mesh(piece, material(look));
            badge.userData.partId = part.id;
            mesh.add(badge);
            pickable.push(badge);
          }
          continue;
        }
        const shape = 'rect' in decal ? new PlaneGeometry(decal.rect[0], decal.rect[1]) : new CircleGeometry(decal.circle / 2, 32);
        geometries.push(shape);
        const d = new Mesh(shape, decalMaterial(decal));
        // On the front face, or on the back face turned round to face backwards
        d.position.set(decal.at[0], decal.at[1], decal.side === 'back' ? -solid.depth - 0.05 : 0.05);
        if (decal.side === 'back') d.rotation.y = Math.PI;
        d.userData.partId = part.id;
        mesh.add(d);
        pickable.push(d);
      }
    }
  }

  // ---- theme ----
  let linkColor = new Color('#983c2e');
  const applyTheme = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    for (const { material, look } of themed) material.color.set(dark ? BLACK_DARK : look.color);
    const link = getComputedStyle(container).getPropertyValue('--link').trim();
    if (link) linkColor = new Color(link);
    for (const node of nodes.values()) {
      for (const line of node.lines) line.color.set(dark ? 0xf1ead6 : 0x000000);
      if (activeId === node.group.name) for (const m of node.materials) m.emissive.copy(linkColor);
    }
    requestRender();
  };
  const observer = new MutationObserver(applyTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  colorScheme.addEventListener('change', applyTheme);

  // ---- state ----
  let t = 0;
  let activeId: string | null = null;
  let azimuth = VIEWS.angle[0];
  let elevation = VIEWS.angle[1];
  let viewAnimation: { from: [number, number]; to: [number, number]; start: number } | null = null;
  const target = new Vector3();
  const goal = new Vector3();
  const pan = new Vector3();
  let zoom = 1;
  let wheelAlways = false;
  let distance = 900;
  // How far back the whole model fits from the current angle, before zoom
  let fitBase = 900;
  /** The zoom being drawn, which catches up with the one asked for */
  let shownZoom = 1;
  let fitted = false;
  let running = false;
  let keepAliveUntil = 0;
  let width = 0;
  let height = 0;
  let disposed = false;

  const box = new Box3();
  const offset = new Vector3();
  const direction = new Vector3();
  const centre = new Vector3();

  function place() {
    for (const node of nodes.values()) {
      node.group.position.set(node.explode[0] * t, node.explode[1] * t, -node.explode[2] * t);
    }
    root.updateMatrixWorld(true);
  }

  const right = new Vector3();
  const up = new Vector3();
  const forward = new Vector3();
  const corner = new Vector3();
  const worldUp = new Vector3(0, 1, 0);

  /** How far back the camera must be to keep the whole model in frame from this angle */
  function fitDistance(centre: Vector3, direction: Vector3) {
    forward.copy(direction).negate();
    right.crossVectors(forward, worldUp).normalize();
    up.crossVectors(right, forward);
    let halfX = 0;
    let halfY = 0;
    let halfZ = 0;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
      halfX = Math.max(halfX, Math.abs(corner.dot(right)));
      halfY = Math.max(halfY, Math.abs(corner.dot(up)));
      halfZ = Math.max(halfZ, Math.abs(corner.dot(forward)));
    }
    const vertical = Math.tan(MathUtils.degToRad(BASE_FOV) / 2);
    return Math.max(halfY / vertical, halfX / (vertical * camera.aspect)) * 1.08 + halfZ;
  }

  /** Put the camera where the current state says: back from the target along the view direction, its lens set by the zoom */
  function applyCamera() {
    // Zoom by narrowing the view rather than moving closer, which would end up inside the cabinet
    camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(BASE_FOV) / 2) / shownZoom));
    camera.near = Math.max(1, distance * 0.02);
    camera.far = distance + 4000;
    camera.updateProjectionMatrix();
    offset.copy(direction).multiplyScalar(distance);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  /** Jump to where the zoom and pan say, with no easing, so the camera is right straight away */
  function settle() {
    goal.copy(centre).add(pan);
    target.copy(goal);
    distance = fitBase;
    shownZoom = zoom;
    applyCamera();
  }

  function frame(now: number) {
    running = false;
    if (disposed) return;
    let busy = now < keepAliveUntil;

    if (viewAnimation) {
      const p = Math.min(1, (now - viewAnimation.start) / 600);
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      // Turn the short way round
      const turn = ((((viewAnimation.to[0] - viewAnimation.from[0]) % 360) + 540) % 360) - 180;
      azimuth = viewAnimation.from[0] + turn * eased;
      elevation = viewAnimation.from[1] + (viewAnimation.to[1] - viewAnimation.from[1]) * eased;
      if (p >= 1) viewAnimation = null;
      busy = true;
    }

    const az = MathUtils.degToRad(azimuth);
    const el = MathUtils.degToRad(MathUtils.clamp(elevation, -89, 89));
    direction.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    box.setFromObject(root);
    box.getCenter(centre);
    fitBase = fitDistance(centre, direction);
    goal.copy(centre).add(pan);
    if (!fitted) {
      target.copy(goal);
      distance = fitBase;
      shownZoom = zoom;
      fitted = true;
    } else {
      const moving =
        target.distanceTo(goal) > Math.max(0.02, distance * 0.0005) ||
        Math.abs(distance - fitBase) > Math.max(0.02, distance * 0.002) ||
        Math.abs(shownZoom - zoom) > zoom * 0.002;
      target.lerp(goal, 0.25);
      distance += (fitBase - distance) * 0.25;
      shownZoom += (zoom - shownZoom) * 0.25;
      if (moving) busy = true;
    }
    applyCamera();
    renderer.render(scene, camera);
    if (busy) requestRender(false);
  }

  function requestRender(extend = true) {
    if (extend) keepAliveUntil = performance.now() + 250;
    if (running || disposed) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || (rect.width === width && rect.height === height)) return;
    width = rect.width;
    height = rect.height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const resizer = new ResizeObserver(resize);
  resizer.observe(container);

  // ---- picking and dragging ----
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const pick = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickable, false)[0];
    return (hit?.object.userData.partId as string | undefined) ?? null;
  };

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 40;

  /** Pointer position as -1 to 1 across the canvas, y up */
  const normalised = (clientX: number, clientY: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1)];
  };

  /**
   * Zoom, keeping whatever is under the pointer (nx, ny) where it is. Smooth zooms (the buttons) aim at the middle.
   * A wheel or pinch moves the camera at once, so the next pointer position is worked out against the right view.
   */
  function setZoom(next: number, nx = 0, ny = 0, smooth = false) {
    const clamped = MathUtils.clamp(next, MIN_ZOOM, MAX_ZOOM);
    const ratio = clamped / zoom;
    if (ratio === 1) return;
    if (!smooth && (nx !== 0 || ny !== 0)) {
      // The point under the pointer: what a ray through it hits, or failing that where it falls at the target's depth
      raycaster.setFromCamera(pointer.set(nx, ny), camera);
      const hit = raycaster.intersectObjects(pickable, false)[0];
      let across: number;
      let upward: number;
      if (hit) {
        const away = hit.point.clone().sub(target);
        across = away.dot(right);
        upward = away.dot(up);
      } else {
        const halfHeight = (fitBase / zoom) * Math.tan(MathUtils.degToRad(BASE_FOV) / 2);
        across = nx * halfHeight * camera.aspect;
        upward = ny * halfHeight;
      }
      const slide = 1 - 1 / ratio;
      pan.addScaledVector(right, across * slide).addScaledVector(up, upward * slide);
    }
    zoom = clamped;
    if (!smooth) settle();
    callbacks.zoom(zoom);
    requestRender();
  }

  /** Slide the model across the window by a number of pixels */
  function panBy(dx: number, dy: number) {
    const perPixel = (2 * (fitBase / zoom) * Math.tan(MathUtils.degToRad(BASE_FOV) / 2)) / height;
    pan.addScaledVector(right, -dx * perPixel).addScaledVector(up, dy * perPixel);
    settle();
    requestRender();
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { span: number; x: number; y: number } | null = null;
  let drag: { x: number; y: number; moved: number; mode: 'turn' | 'slide' } | null = null;
  let hovering: string | null = null;

  const pinchNow = () => {
    const [a, b] = [...pointers.values()];
    return { span: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    viewAnimation = null;
    if (pointers.size === 2) {
      // A second finger turns the drag into a pinch
      drag = null;
      pinch = pinchNow();
      return;
    }
    drag = { x: e.clientX, y: e.clientY, moved: 0, mode: e.button === 2 || e.shiftKey ? 'slide' : 'turn' };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const now = pinchNow();
      const [nx, ny] = normalised(now.x, now.y);
      if (pinch.span > 0) setZoom(zoom * (now.span / pinch.span), nx, ny);
      panBy(now.x - pinch.x, now.y - pinch.y);
      pinch = now;
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.mode === 'slide') {
        panBy(dx, dy);
      } else {
        azimuth -= dx * 0.4;
        elevation = MathUtils.clamp(elevation + dy * 0.4, -89, 89);
        requestRender();
      }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const id = pick(e);
    canvas.style.cursor = id ? 'pointer' : 'grab';
    if (id !== hovering) {
      hovering = id;
      callbacks.hover(id);
    }
  });
  const release = (e: PointerEvent, cancelled: boolean) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    const clicked = !cancelled && drag.mode === 'turn' && drag.moved < 5;
    drag = null;
    if (clicked) callbacks.select(pick(e));
  };
  canvas.addEventListener('pointerup', (e) => release(e, false));
  canvas.addEventListener('pointercancel', (e) => release(e, true));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && hovering !== null) {
      hovering = null;
      callbacks.hover(null);
    }
  });
  // Scrolling the page past the viewer must still work, so the wheel only zooms with Ctrl or ⌘ held
  // (which is also how a trackpad pinch arrives), or in fullscreen where there is no page to scroll
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey || wheelAlways)) return;
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 20 : 1;
      const [nx, ny] = normalised(e.clientX, e.clientY);
      // A trackpad pinch sends many small steps and a mouse wheel a few large ones, so cap each step
      setZoom(zoom * Math.exp(MathUtils.clamp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015), -0.2, 0.2)), nx, ny);
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const step = 6;
    if (e.key === '+' || e.key === '=') setZoom(zoom * 1.25, 0, 0, true);
    else if (e.key === '-' || e.key === '_') setZoom(zoom / 1.25, 0, 0, true);
    else if (e.key === '0') {
      zoom = 1;
      pan.set(0, 0, 0);
      callbacks.zoom(1);
    } else if (e.shiftKey && e.key.startsWith('Arrow')) {
      const move = 40;
      panBy(e.key === 'ArrowLeft' ? -move : e.key === 'ArrowRight' ? move : 0, e.key === 'ArrowUp' ? -move : e.key === 'ArrowDown' ? move : 0);
    } else if (e.key === 'ArrowLeft') azimuth += step;
    else if (e.key === 'ArrowRight') azimuth -= step;
    else if (e.key === 'ArrowUp') elevation = MathUtils.clamp(elevation - step, -89, 89);
    else if (e.key === 'ArrowDown') elevation = MathUtils.clamp(elevation + step, -89, 89);
    else return;
    e.preventDefault();
    viewAnimation = null;
    requestRender();
  });

  place();
  resize();
  applyTheme();

  return {
    setExplode(next) {
      t = next;
      place();
      requestRender();
    },
    setActive(id) {
      activeId = id;
      for (const [partId, node] of nodes) {
        const dim = id !== null && partId !== id;
        for (const m of node.materials) {
          m.transparent = dim;
          m.opacity = dim ? 0.18 : 1;
          m.depthWrite = !dim;
          m.emissive.copy(partId === id ? linkColor : new Color(0));
          m.emissiveIntensity = 0.35;
          m.needsUpdate = true;
        }
        for (const line of node.lines) line.opacity = dim ? 0.06 : 0.5;
      }
      requestRender();
    },
    setView(view, instant) {
      const [az, el] = VIEWS[view];
      if (instant) {
        azimuth = az;
        elevation = el;
        viewAnimation = null;
      } else {
        viewAnimation = { from: [azimuth, elevation], to: [az, el], start: performance.now() };
      }
      requestRender();
    },
    zoomBy(factor) {
      setZoom(zoom * factor, 0, 0, true);
    },
    resetZoom() {
      zoom = 1;
      pan.set(0, 0, 0);
      callbacks.zoom(1);
      requestRender();
    },
    setFull(full) {
      wheelAlways = full;
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      colorScheme.removeEventListener('change', applyTheme);
      resizer.disconnect();
      for (const g of geometries) g.dispose();
      for (const node of nodes.values()) {
        node.materials.forEach((m) => m.dispose());
        node.lines.forEach((m) => m.dispose());
      }
      textures.forEach((x) => x.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
