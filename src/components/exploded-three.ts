// The rotatable 3D version of the exploded view, built from the same Model as the SVG drawing.
// Loaded on demand by ExplodedViewer.tsx so three.js only downloads once the viewer is on screen.
//
// Our model has z running front to back; three.js has z coming toward the viewer, so a part at
// z = 50 sits at world z = -50. Everything below converts at the point of placing things.
import {
  Box3,
  CanvasTexture,
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
import type { Model, Shape as ModelShape, Solid } from '../lib/exploded-view-types';

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
}

export interface SceneApi {
  setExplode: (t: number) => void;
  setActive: (id: string | null) => void;
  setView: (view: ViewName, instant: boolean) => void;
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
  cone: { color: 0x6d695e, roughness: 0.9, metalness: 0 },
  cardboard: { color: 0xb69b72, roughness: 0.95, metalness: 0 },
  particleboard: { color: 0xffffff, roughness: 0.95, metalness: 0 },
  felt: { color: 0x7a7563, roughness: 1, metalness: 0 },
  capacitor: { color: 0x34609d, roughness: 0.5, metalness: 0.1 },
  brass: { color: 0xc5a550, roughness: 0.35, metalness: 0.8 },
};

const BLACK_DARK = 0x4a4740;

/** A square of particleboard speckle, one tile every 14 mm */
function chipTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#b88c52';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = random() > 0.5 ? 'rgba(255,240,200,.35)' : 'rgba(60,35,10,.3)';
    g.fillRect(random() * size, random() * size, 2 + random() * 9, 2 + random() * 4);
  }
  return canvas;
}

/** A fine square grille: dark metal with slightly lighter holes, one cell every 1.6 mm */
function meshTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#2e2d30';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#6a6762';
  g.fillRect(5, 5, 18, 18);
  return canvas;
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

function geometryOf(solid: Solid) {
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
    `3D view of the ${model.name}. Drag to rotate, or use the arrow keys. The parts list below does the same job without the mouse.`,
  );
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 10, 6000);
  scene.add(camera);
  // The lights ride on the camera, so whichever way the speaker is turned its lit side stays readable
  camera.add(new HemisphereLight(0xffffff, 0x8a8478, 1.5));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(-300, 500, 400);
  camera.add(key);

  const root = new Group();
  scene.add(root);

  const textures: Texture[] = [];
  const chip = textureOf(chipTexture(), 14);
  const grid = textureOf(meshTexture(), 1.6);
  textures.push(chip, grid);

  const geometries: (ExtrudeGeometry | PlaneGeometry | EdgesGeometry)[] = [];
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

    for (const solid of part.solids) {
      // The SVG draws a cabinet's inside walls and outside as separate passes; here one solid does both
      if (solid.faces === 'inner') continue;
      const geometry = geometryOf(solid);
      geometries.push(geometry);
      // Extruded shapes have two material slots: the front and back faces, then the walls
      const map = solid.texture === 'mesh' ? grid : solid.texture === 'chip' ? chip : null;
      const faces = material(solid.material, map);
      const mesh = new Mesh(geometry, [faces, map ? faces : material(solid.material)]);
      mesh.position.set(solid.at[0], solid.at[1], -solid.at[2]);
      mesh.userData.partId = part.id;
      node.group.add(mesh);
      pickable.push(mesh);

      const edges = new EdgesGeometry(geometry, 40);
      geometries.push(edges);
      const lineMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.5 });
      node.lines.push(lineMaterial);
      mesh.add(new LineSegments(edges, lineMaterial));

      for (const decal of solid.decals) {
        const [w, h] = 'rect' in decal ? decal.rect : [decal.circle, decal.circle];
        const plane = new PlaneGeometry(w, h);
        geometries.push(plane);
        const d = new Mesh(plane, material(decal.material));
        d.position.set(decal.at[0], decal.at[1], 0.05);
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
  let distance = 900;
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
    const vertical = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    return Math.max(halfY / vertical, halfX / (vertical * camera.aspect)) * 1.08 + halfZ;
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
    const goalDistance = fitDistance(centre, direction);
    if (!fitted) {
      target.copy(centre);
      distance = goalDistance;
      fitted = true;
    } else {
      const moving = target.distanceTo(centre) > 0.2 || Math.abs(distance - goalDistance) > 0.5;
      target.lerp(centre, 0.2);
      distance += (goalDistance - distance) * 0.2;
      if (moving) busy = true;
    }

    offset.copy(direction).multiplyScalar(distance);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
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

  let drag: { x: number; y: number; moved: number } | null = null;
  let hovering: string | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
    viewAnimation = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      azimuth -= dx * 0.4;
      elevation = MathUtils.clamp(elevation + dy * 0.4, -89, 89);
      requestRender();
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
    if (!drag) return;
    const clicked = !cancelled && drag.moved < 5;
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
  canvas.addEventListener('keydown', (e) => {
    const step = 6;
    if (e.key === 'ArrowLeft') azimuth += step;
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
