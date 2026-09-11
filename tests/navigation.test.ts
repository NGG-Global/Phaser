import { describe, expect, it } from 'vitest';
import { resizedScroll, scrollStep } from '../src/ui/navigation';

describe('map navigation motion', () => {
  it('preserves the world point at the viewport centre across a resize', () => {
    expect(resizedScroll(600, 1, 2, 100, 200, 1000, 2000)).toBeCloseTo(1200);
    expect(resizedScroll(600, 1, 1, 100, 100, 1000, 1000)).toBeCloseTo(600);
    const next = resizedScroll(600, 1, 0.8, 100, 80, 1000, 1200);
    const oldPoint = (600 + 550 - 100) / 1;
    const newPoint = (next + 640 - 80) / 0.8;
    expect(newPoint).toBeCloseTo(oldPoint);
    expect(resizedScroll(600, 0, 2, 0, 0, 1000, 1000)).toBe(0);
  });

  it('has the same inertia at 30Hz and 60Hz', () => {
    const whole = scrollStep(1000, 1000 / 30, 5);
    const first = scrollStep(1000, 1000 / 60, 5);
    const second = scrollStep(first.velocity, 1000 / 60, 5);
    expect(first.distance + second.distance).toBeCloseTo(whole.distance);
    expect(second.velocity).toBeCloseTo(whole.velocity);
  });

  it('cannot fling across the map after a stalled frame', () => {
    expect(scrollStep(1000, 5000, 5)).toEqual(scrollStep(1000, 64, 5));
    expect(scrollStep(-1000, 16, 5).distance).toBeLessThan(0);
    expect(scrollStep(1000, -16, 5)).toEqual({ distance: 0, velocity: 1000 });
  });
});
