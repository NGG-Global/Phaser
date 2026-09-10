import { describe, expect, it } from 'vitest';
import { hex, mix, shade } from '../src/ui/colour';
import { dashes, pathLength, smoothPath, type Point } from '../src/ui/path';

describe('colour helpers', () => {
  it('blends channel-wise and clamps the ratio', () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    // Callers pass unbounded ratios (a band index over a band count), so clamping matters.
    expect(mix(0x102030, 0xffffff, -3)).toBe(0x102030);
    expect(mix(0x102030, 0xffffff, 9)).toBe(0xffffff);
    expect(mix(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
  it('shades toward white and black without leaving the byte range', () => {
    expect(shade(0x336699, 0)).toBe(0x336699);
    expect(shade(0x336699, 1)).toBe(0xffffff);
    expect(shade(0x336699, -1)).toBe(0x000000);
    expect(shade(0xffffff, 0.4)).toBe(0xffffff);
    expect(shade(0x000000, -0.4)).toBe(0x000000);
    for (const amount of [-1, -0.5, 0, 0.5, 1]) {
      const c = shade(0x8899aa, amount);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });
  it('formats six hex digits', () => {
    expect(hex(0x000000)).toBe('#000000');
    expect(hex(0x2c4629)).toBe('#2c4629');
    expect(hex(0xff)).toBe('#0000ff');
  });
});

describe('road path helpers', () => {
  const line: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  it('keeps the authored nodes and smooths between them', () => {
    const path = smoothPath(line, 8);
    // Endpoints are exact, so nodes still sit on the road they are drawn over.
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 200, y: 0 });
    expect(path.length).toBe(8 * 2 + 1);
    // A straight run stays straight rather than bulging.
    for (const p of path) expect(p.y).toBeCloseTo(0);
    // Monotone along the run: no backtracking that would double the stroke.
    for (let i = 1; i < path.length; i++) expect(path[i]!.x).toBeGreaterThan(path[i - 1]!.x);
  });
  it('degrades safely on short and degenerate input', () => {
    expect(smoothPath([], 10)).toEqual([]);
    expect(smoothPath([{ x: 3, y: 4 }], 10)).toEqual([{ x: 3, y: 4 }]);
    expect(smoothPath(line, 0).length).toBeGreaterThan(1);
    expect(pathLength([])).toBe(0);
    expect(pathLength(line)).toBeCloseTo(200);
  });
  it('bends through an offset node instead of cornering', () => {
    // Largest direction change between consecutive segments, in degrees.
    const sharpest = (path: readonly Point[]): number => {
      let worst = 0;
      for (let i = 1; i < path.length - 1; i++) {
        const ax = path[i]!.x - path[i - 1]!.x, ay = path[i]!.y - path[i - 1]!.y;
        const bx = path[i + 1]!.x - path[i]!.x, by = path[i + 1]!.y - path[i]!.y;
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la === 0 || lb === 0) continue;
        const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
        worst = Math.max(worst, Math.acos(cos) * 180 / Math.PI);
      }
      return worst;
    };
    const nodes: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 200 }, { x: 60, y: 300 }];
    // Stroking the nodes directly folds the road; the spline spreads the turn out.
    expect(sharpest(nodes)).toBeGreaterThan(45);
    const bend = smoothPath(nodes, 12);
    expect(sharpest(bend)).toBeLessThan(sharpest(nodes) * 0.35);
    // Denser sampling keeps flattening it, which is what lets the scene trade cost for smoothness.
    expect(sharpest(smoothPath(nodes, 24))).toBeLessThan(sharpest(bend));
    // It still passes through the authored nodes, so a node sits on its own road.
    for (const node of nodes) {
      expect(Math.min(...bend.map(p => Math.hypot(p.x - node.x, p.y - node.y)))).toBeLessThan(1);
    }
    expect(pathLength(bend)).toBeGreaterThan(pathLength(nodes) * 0.98);
  });
  it('lays dashes at an even pitch along the whole path', () => {
    const spans = dashes(line, 20, 20);
    expect(spans.length).toBe(5);
    for (const [from, to] of spans) expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(20);
    // Pitch is continuous across the join at x=100, not restarted per segment.
    expect(spans[2]![0].x).toBeCloseTo(80);
    expect(dashes(line, 0, 10)).toEqual([]);
    expect(dashes([{ x: 0, y: 0 }], 10, 10)).toEqual([]);
    // A gapless dash covers the line exactly once.
    expect(pathLength(dashes(line, 50, 0).flat())).toBeCloseTo(200);
  });
});
