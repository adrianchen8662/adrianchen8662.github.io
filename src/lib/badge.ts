// The small gold badge on the grille, as two flat outlines: a gold plate with an arch-shaped notch, and the
// black piece that fills the notch. Traced by eye from a close-up photo, so a simplified drawing of what the
// photo shows. Points are in a unit box, x from the left and y from the top, so the same shapes serve the
// 3D scene and the fixed-angle SVG drawing.
export type UnitPoint = [number, number];

const STEPS = 14;

/** Points along a cubic curve, leaving out the starting point */
function curve(from: UnitPoint, c1: UnitPoint, c2: UnitPoint, to: UnitPoint): UnitPoint[] {
  return Array.from({ length: STEPS }, (_, i) => {
    const t = (i + 1) / STEPS;
    const u = 1 - t;
    const mix = (k: 0 | 1) => u * u * u * from[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * to[k];
    return [mix(0), mix(1)] as UnitPoint;
  });
}

const ARCH_FOOT: UnitPoint = [0.08, 1];
const ARCH_TOP: UnitPoint = [0.34, 0.133];

export const badgeShapes: { gold: UnitPoint[]; inlay: UnitPoint[] } = {
  // Gold: along the top, round the swept corner, down the right, back along the bottom to the arch, round it and out
  gold: [
    [0, 0],
    [0.54, 0],
    ...curve([0.54, 0], [0.8, 0], [1, 0.4], [1, 0.87]),
    [1, 1],
    [0.482, 1],
    [0.482, 0.133],
    ARCH_TOP,
    ...curve(ARCH_TOP, [0.17, 0.133], [0.1, 0.55], ARCH_FOOT),
    [0, 1],
  ],
  // The black piece that fills the arch
  inlay: [ARCH_FOOT, ...curve(ARCH_FOOT, [0.1, 0.55], [0.17, 0.133], ARCH_TOP), [0.482, 0.133], [0.482, 1]],
};
