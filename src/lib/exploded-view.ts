// Reads _data/<model>.yml for the exploded view. Dimensions can be formulas over other dimensions,
// so one corrected measurement moves everything that depends on it.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Decal, Dim, Hole, Model, Part, Shape, Solid, Status } from './exploded-view-types';

const STRENGTH: Status[] = ['measured', 'estimated', 'assumed'];
const weakest = (a: Status, b: Status) => (STRENGTH.indexOf(a) >= STRENGTH.indexOf(b) ? a : b);

interface RawDim {
  label?: string;
  value: number | string;
  status?: Status;
  note?: string;
}

interface Evaluated {
  value: number;
  status: Status;
}

/** Evaluates `a + 2 * (b - c)`: numbers, dim names, + - * / and parentheses. Reports the weakest status it used. */
function evaluate(expression: string, lookup: (name: string) => Evaluated): Evaluated {
  const tokens = expression.match(/\d+\.?\d*|[a-z_][a-z0-9_]*|[-+*/()]/gi);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) {
    throw new Error(`Can't read the formula "${expression}"`);
  }
  let at = 0;
  let status: Status = 'measured';

  const primary = (): number => {
    const token = tokens[at++];
    if (token === undefined) throw new Error(`"${expression}" ends too soon`);
    if (token === '-') return -primary();
    if (token === '(') {
      const inner = sum();
      if (tokens[at++] !== ')') throw new Error(`"${expression}" is missing a )`);
      return inner;
    }
    if (/^\d/.test(token)) return Number(token);
    const found = lookup(token);
    status = weakest(status, found.status);
    return found.value;
  };
  const product = (): number => {
    let total = primary();
    while (tokens[at] === '*' || tokens[at] === '/') total = tokens[at++] === '*' ? total * primary() : total / primary();
    return total;
  };
  const sum = (): number => {
    let total = product();
    while (tokens[at] === '+' || tokens[at] === '-') total = tokens[at++] === '+' ? total + product() : total - product();
    return total;
  };

  const value = sum();
  if (at !== tokens.length) throw new Error(`Can't read the formula "${expression}"`);
  return { value, status };
}

export async function loadModel(id: string): Promise<Model> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`"${id}" isn't a model name`);
  const raw = parse(await readFile(join(process.cwd(), '_data', `${id}.yml`), 'utf8')) as {
    object: { name: string; front_plane: string };
    dims: Record<string, RawDim>;
    parts: Record<string, any>[];
  };

  // Work each dimension out once, whichever order they are written in
  const done = new Map<string, Dim>();
  const working = new Set<string>();
  const dim = (key: string): Dim => {
    const known = done.get(key);
    if (known) return known;
    const entry = raw.dims[key];
    if (!entry) throw new Error(`${id}.yml uses a dimension called "${key}" that isn't in dims`);
    if (working.has(key)) throw new Error(`${id}.yml: "${key}" depends on itself`);
    working.add(key);
    let result: Evaluated;
    if (typeof entry.value === 'number') {
      if (!entry.status) throw new Error(`${id}.yml: "${key}" needs a status (measured, estimated or assumed)`);
      result = { value: entry.value, status: entry.status };
    } else {
      result = evaluate(entry.value, dim);
      if (entry.status) result.status = entry.status;
    }
    working.delete(key);
    const full: Dim = { key, label: entry.label ?? key, ...result, ...(entry.note ? { note: entry.note } : {}) };
    done.set(key, full);
    return full;
  };
  const num = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return evaluate(value, dim).value;
    throw new Error(`${id}.yml: expected a number or a formula, found ${JSON.stringify(value)}`);
  };

  const shape = (s: Record<string, any>): Shape =>
    'circle' in s ? { circle: num(s.circle) } : { rect: [num(s.rect[0]), num(s.rect[1])] };
  const at2 = (at: unknown[]): [number, number] => [num(at[0]), num(at[1])];

  const parts: Part[] = raw.parts.map((p) => ({
    id: p.id,
    name: p.name,
    info: p.info ?? '',
    explode: [num(p.explode[0]), num(p.explode[1]), num(p.explode[2])],
    dims: ((p.show ?? []) as string[]).map(dim),
    solids: (p.solids as Record<string, any>[]).map(
      (s): Solid => ({
        outline: shape(s.outline),
        holes: ((s.holes ?? []) as Record<string, any>[]).map((h): Hole => ({ ...shape(h), at: at2(h.at) })),
        at: [num(s.at[0]), num(s.at[1]), num(s.at[2])],
        depth: num(s.depth),
        axis: s.axis ?? 'z',
        ...(s.taper !== undefined ? { taper: num(s.taper) } : {}),
        paint: s.paint,
        interior: s.interior ?? p.interior ?? false,
        faces: s.faces ?? 'all',
        material: s.material ?? p.material,
        texture: s.texture,
        ...(s.texture_pitch !== undefined ? { texturePitch: num(s.texture_pitch) } : {}),
        ...(s.texture_hole !== undefined ? { textureHole: num(s.texture_hole) } : {}),
        decals: ((s.decals ?? []) as Record<string, any>[]).map((d): Decal => ({ ...shape(d), at: at2(d.at), material: d.material, side: d.side ?? 'front', ...(d.lines ? { lines: d.lines } : {}), ...(d.art ? { art: d.art } : {}), ...(d.height !== undefined ? { height: num(d.height) } : {}), ...(d.recess !== undefined ? { recess: num(d.recess) } : {}) })),
      }),
    ),
  }));

  const all = Object.keys(raw.dims).map(dim);
  const counts: Record<Status, number> = { measured: 0, estimated: 0, assumed: 0 };
  for (const d of all) if (typeof raw.dims[d.key].value === 'number') counts[d.status]++;

  return {
    name: raw.object.name,
    frontPlane: num(raw.object.front_plane),
    parts,
    open: all.filter((d) => typeof raw.dims[d.key].value === 'number' && d.status !== 'measured'),
    counts,
  };
}
