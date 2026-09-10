import { describe, expect, it } from 'vitest';
import { anticipation, recoil, nailHeight, HAMMER_MOTION } from '../src/vignettes/hammerMotion';
import { synthesizeImpact } from '../src/audio/hammerSounds';

describe('hammer presentation curves', () => {
  it('lands exactly on the scheduled contact and lifts before striking', () => {
    expect(anticipation(0)).toBeCloseTo(0);
    expect(anticipation(HAMMER_MOTION.anticipationSec)).toBeCloseTo(0.55);
    expect(anticipation(HAMMER_MOTION.anticipationSec * 0.58)).toBeCloseTo(0.82);
    expect(recoil(0)).toBe(0);
    expect(recoil(HAMMER_MOTION.contactHoldSec)).toBe(0);
    expect(recoil(HAMMER_MOTION.recoilSec * 0.7)).toBeGreaterThan(0.55);
    expect(recoil(HAMMER_MOTION.recoilSec)).toBeCloseTo(0.55);
    expect(anticipation(HAMMER_MOTION.anticipationSec, 0.2)).toBeCloseTo(0.2);
    expect(anticipation(0, 0.2)).toBeCloseTo(0);
  });
  it('never overshoots the depth bounds and finishes flush', () => {
    expect(nailHeight(0)).toBe(203);
    expect(nailHeight(0.5)).toBeLessThan(nailHeight(0));
    expect(nailHeight(1) + 10).toBe(0);
    expect(nailHeight(3)).toBe(nailHeight(1));
    expect(nailHeight(-1)).toBe(nailHeight(0));
  });
  it.each(['hit', 'flush', 'bent'] as const)('generates a bounded, finite %s sound without leading silence', kind => {
    const sound = synthesizeImpact(48000, kind);
    expect(sound.length).toBeGreaterThan(8000);
    expect(sound[0]).toBe(0);
    expect(Array.from(sound.subarray(1, 48)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(sound.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(synthesizeImpact(48000, kind)).toEqual(sound);
  });
});
