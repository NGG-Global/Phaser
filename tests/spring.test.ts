import { describe, expect, it } from 'vitest';
import { anticipate, arrive, overshoot, settle, spring, squash, stagger } from '../src/ui/spring';

describe('physical motion curves', () => {
  it('springs from 0 to 1, overshooting on the way and coming to rest', () => {
    expect(spring(0)).toBe(0);
    expect(spring(1)).toBe(1);
    expect(spring(-1)).toBe(0);
    expect(spring(2)).toBe(1);
    const samples = Array.from({ length: 101 }, (_, i) => spring(i / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1.02);
    // The ringing dies away: the last tenth is closer to rest than the first tenth past the peak.
    const late = samples.slice(90).map(v => Math.abs(v - 1));
    const early = samples.slice(20, 30).map(v => Math.abs(v - 1));
    expect(Math.max(...late)).toBeLessThan(Math.max(...early));
  });
  it('overshoots past the target by the asked amount and returns exactly to it', () => {
    expect(overshoot(0)).toBeCloseTo(0);
    expect(overshoot(1)).toBeCloseTo(1);
    expect(overshoot(5)).toBeCloseTo(1);
    // `amount` is the peak excursion itself, so a fine sample lands on it to three places.
    const peakOf = (amount: number) => Math.max(...Array.from({ length: 2001 }, (_, i) => overshoot(i / 2000, amount)));
    expect(peakOf(0.25)).toBeCloseTo(1.25, 3);
    expect(peakOf(0.12)).toBeCloseTo(1.12, 3);
    expect(peakOf(0)).toBeCloseTo(1, 6);
  });
  it('squashes to nothing at both ends and peaks at the midpoint', () => {
    expect(squash(-0.01, 0.1, 0.2)).toBe(0);
    expect(squash(0, 0.1, 0.2)).toBeCloseTo(0);
    expect(squash(0.05, 0.1, 0.2)).toBeCloseTo(0.2);
    expect(squash(0.1, 0.1, 0.2)).toBe(0);
    expect(squash(1, 0.1, 0.2)).toBe(0);
  });
  it('anticipates only inside its window and lands at zero on the event', () => {
    expect(anticipate(0, 0.3, 1)).toBe(0);
    expect(anticipate(0.3, 0.3, 1)).toBe(0);
    expect(anticipate(0.5, 0.3, 1)).toBe(0);
    expect(anticipate(0.15, 0.3, 1)).toBeGreaterThan(0.9);
    expect(anticipate(0.001, 0.3, 1)).toBeLessThan(0.05);
  });
  it('settles: nothing before the impact, a decaying oscillation after it', () => {
    expect(settle(-1, 100, 20)).toBe(0);
    expect(Math.abs(settle(0.02, 100, 20))).toBeGreaterThan(Math.abs(settle(0.4, 100, 20)));
    expect(Math.abs(settle(2, 100, 20))).toBeLessThan(1e-10);
  });
  it('staggers arrivals monotonically across the spread and not at all for one item', () => {
    expect(stagger(0, 1, 0.3)).toBe(0);
    expect(stagger(0, 3, 0.3)).toBe(0);
    expect(stagger(1, 3, 0.3)).toBeCloseTo(0.15);
    expect(stagger(2, 3, 0.3)).toBeCloseTo(0.3);
    expect(stagger(7, 3, 0.3)).toBeCloseTo(0.3);
  });
  it('arrives from below with a settle and is fully present at the end', () => {
    expect(arrive(0, 0.5).rise).toBeCloseTo(1);
    expect(arrive(0, 0.5).alpha).toBe(0);
    expect(arrive(0.5, 0.5).rise).toBeCloseTo(0);
    expect(arrive(0.5, 0.5).alpha).toBe(1);
    // The overshoot passes through the rest position before the end.
    expect(Math.min(...Array.from({ length: 51 }, (_, i) => arrive(i / 100, 0.5).rise))).toBeLessThan(0);
  });
});
