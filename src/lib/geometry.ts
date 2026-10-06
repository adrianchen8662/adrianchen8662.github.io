// Shapes the viewer needs that aren't a plain rectangle or circle.

/**
 * A rectangle with its corners trimmed by a circle, as on the woofer's square flange: w and h are the flat
 * sides' spacing, and `diameter` is the distance between opposite corners. Points run counter-clockwise from the right.
 */
export function clippedRect(w: number, h: number, diameter: number, steps = 160): [number, number][] {
  const radius = diameter / 2;
  return Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // How far along this direction the rectangle's edge is
    const edge = Math.min(Math.abs(c) > 1e-9 ? w / 2 / Math.abs(c) : Infinity, Math.abs(s) > 1e-9 ? h / 2 / Math.abs(s) : Infinity);
    const reach = Math.min(radius, edge);
    return [reach * c, reach * s] as [number, number];
  });
}
