import { describe, expect, it } from 'vitest';
import { cubicContour } from '../src/ui/illustration';
import { bananaAt, bananaOutline, BANANA_MOTION } from '../src/vignettes/bananaMotion';
import { CUCUMBER_MOTION } from '../src/vignettes/cucumberMotion';

describe('refined illustration geometry', () => {
  it('joins authored curves exactly, including the closing point', () => {
    const points = cubicContour(0, 0, [
      [10, -30, 40, -30, 50, 0],
      [40, 30, 10, 30, 0, 0],
    ]);
    expect(points).toHaveLength(50);
    expect(points.slice(0, 2)).toEqual([0, 0]);
    expect(points.slice(24, 26)).toEqual([50, 0]);
    expect(points.slice(-2)).toEqual([0, 0]);
    expect(points.every(Number.isFinite)).toBe(true);
  });

  it('gives the banana a concave upper edge, not a flattened polygon', () => {
    const crown = (t: number): number => {
      const p = bananaAt(t);
      return p.y + p.ny * p.half;
    };
    expect(crown(0.5) - crown(0)).toBeGreaterThan(40);
    expect(crown(0.5) - crown(1)).toBeGreaterThan(40);
  });

  it('can settle every remaining banana section onto the cutting board', () => {
    for (const cut of [1, 0.86, 0.6, 0.3, 0.14]) {
      const pts = bananaOutline(cut, 40);
      const ys = pts.filter((_, i) => i % 2 === 1);
      const offset = -Math.max(...ys);
      expect(offset).toBeGreaterThanOrEqual(-0.1);
      expect(ys.every((y) => Number.isFinite(y + offset) && y + offset <= 0.001)).toBe(true);
    }
  });

  it('raises each knife clear of the whole fruit before contact', () => {
    const bananaTop = Math.min(...bananaOutline(1).filter((_, i) => i % 2 === 1));
    expect(BANANA_MOTION.lift).toBeGreaterThan(-bananaTop + 25);
    expect(CUCUMBER_MOTION.lift).toBeGreaterThan(CUCUMBER_MOTION.radiusY * 2 + 25);
  });
});
