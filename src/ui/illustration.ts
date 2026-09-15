import type Phaser from 'phaser';

export type Cubic = readonly [number, number, number, number, number, number];

/** Sample authored Béziers without a canvas texture, so moving silhouettes stay crisp. */
export function cubicContour(x: number, y: number, curves: readonly Cubic[]): number[] {
  const points = [x, y];
  for (const [ax, ay, bx, by, ex, ey] of curves) {
    for (let i = 1; i <= 12; i++) {
      const t = i / 12,
        u = 1 - t;
      points.push(
        u ** 3 * x + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * ex,
        u ** 3 * y + 3 * u * u * t * ay + 3 * u * t * t * by + t ** 3 * ey,
      );
    }
    x = ex;
    y = ey;
  }
  return points;
}

/** Fill a single contour with Phaser's triangulator, including concave silhouettes.
 * A triangle fan crosses the hollow of a banana and leaves overlapping dark wedges. */
export function fillContour(g: Phaser.GameObjects.Graphics, points: readonly number[]): void {
  if (points.length < 6) return;
  traceContour(g, points);
  g.closePath().fillPath();
}

export function traceContour(g: Phaser.GameObjects.Graphics, points: readonly number[]): void {
  g.beginPath();
  for (let i = 0; i < points.length; i += 2) g[i ? 'lineTo' : 'moveTo'](points[i]!, points[i + 1]!);
}

export function paintedContour(
  g: Phaser.GameObjects.Graphics,
  points: readonly number[],
  colour: number,
  ink: number,
  weight: number,
): void {
  g.fillStyle(colour);
  fillContour(g, points);
  if (weight > 0) {
    g.lineStyle(weight, ink);
    traceContour(g, points);
    g.closePath().strokePath();
  }
}
