import { describe, expect, it } from 'vitest';
import {
  acceptDemoBeat, advanceSlice, clipLeft, cucumberBody, cucumberHalfAt, CUCUMBER_MOTION, cucumberTiming,
  cutAt, cutFraction, cutStart, juiceFall, knifeLift, knifeWindup, REFERENCE_BEAT, sliceTumble,
} from '../src/vignettes/cucumberMotion';
import { synthesizeCucumber } from '../src/audio/cucumberSounds';

describe('cucumber presentation curves', () => {
  it('lands the edge on the beat and is back up before the next possible hit', () => {
    const t = cucumberTiming();
    expect(REFERENCE_BEAT).toBe(0.5);
    expect(knifeLift(0)).toBe(0);
    expect(knifeLift(t.holdSec)).toBe(0);
    expect(knifeLift(t.riseSec)).toBeCloseTo(1);
    expect(knifeLift(100)).toBe(1);
    expect(knifeLift(-1)).toBe(1);
    expect(CUCUMBER_MOTION.riseBeats).toBeLessThan(0.5);
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(cucumberTiming(beat).riseSec).toBeLessThan(beat / 2);
      expect(knifeLift(cucumberTiming(beat).riseSec, beat)).toBeCloseTo(1);
    }
  });
  it('winds up higher and then drops to exactly zero at contact', () => {
    const t = cucumberTiming();
    expect(knifeWindup(t.windupSec)).toBeCloseTo(1);
    expect(knifeWindup(t.windupSec * 0.62)).toBeGreaterThan(1);
    expect(knifeWindup(0)).toBeCloseTo(0);
    expect(knifeWindup(t.windupSec, 0.3)).toBeCloseTo(0.3);
    expect(knifeWindup(0, 0.3)).toBeCloseTo(0);
    expect(knifeWindup(0, 1, 60 / 150)).toBeCloseTo(0);
  });
  it('takes slices only for accurate chops and leaves a heel for the coda', () => {
    expect(cutFraction(0, 3)).toBe(0);
    expect(cutFraction(3, 3)).toBeCloseTo(CUCUMBER_MOTION.cutAtFullResponse);
    expect(cutFraction(3, 3)).toBeLessThan(1);
    expect(cutFraction(9, 3)).toBe(cutFraction(3, 3));
    expect(cutFraction(-1, 3)).toBe(0);
    expect(cutAt(0)).toBe(cutStart());
    expect(cutAt(1)).toBe(CUCUMBER_MOTION.x - CUCUMBER_MOTION.radiusX);
    expect(advanceSlice(2, 'hit')).toBe(3);
    expect(advanceSlice(2, 'extra')).toBe(2);
    expect(advanceSlice(2, 'omission')).toBe(2);
    expect(acceptDemoBeat(4, 4)).toBeNull();
    expect(acceptDemoBeat(4, 4.5)).toBe(4.5);
  });
  it('clips the stadium to the left of the cut and keeps the body on the board', () => {
    const full = cucumberBody(cutStart());
    expect(full.length).toBeGreaterThan(12);
    expect(full.every((_, i) => i % 2 === 1 || full[i]! <= cutStart() + 1e-4)).toBe(true);
    const mid = cucumberBody(CUCUMBER_MOTION.x);
    expect(mid.every((_, i) => i % 2 === 1 || mid[i]! <= CUCUMBER_MOTION.x + 1e-4)).toBe(true);
    expect(Math.max(...mid.filter((_, i) => i % 2 === 0))).toBeCloseTo(CUCUMBER_MOTION.x, 3);
    expect(cucumberBody(CUCUMBER_MOTION.x - CUCUMBER_MOTION.radiusX - 4)).toEqual([]);
    expect(cucumberHalfAt(CUCUMBER_MOTION.x)).toBe(CUCUMBER_MOTION.radiusY);
    expect(cucumberHalfAt(cutStart())).toBeCloseTo(0, 5);
    const square = [-10, -10, 10, -10, 10, 10, -10, 10];
    expect(clipLeft(square, 0).every((_, i) => i % 2 === 1 || clipLeft(square, 0)[i]! <= 1e-6)).toBe(true);
  });
  it('keeps the topple and the juice bounded', () => {
    expect(sliceTumble(-1)).toBe(0);
    expect(sliceTumble(0)).toBe(0);
    expect(sliceTumble(cucumberTiming().tumbleSec)).toBeCloseTo(1);
    expect(sliceTumble(100)).toBe(1);
    expect(juiceFall(-1)).toBe(0);
    expect(juiceFall(0)).toBe(0);
    expect(juiceFall(100)).toBe(juiceFall(cucumberTiming().juiceSec));
    expect(juiceFall(0.1, 0.4)).toBeGreaterThan(juiceFall(0.1, 0.5));
  });
  it.each(['action', 'success', 'rough', 'scrape', 'judder'] as const)('synthesizes a bounded deterministic %s buffer', kind => {
    const samples = synthesizeCucumber(48000, kind);
    expect(samples.length).toBeGreaterThan(8000);
    expect(samples[0]).toBe(0);
    expect(Array.from(samples.subarray(1, 96)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(samples.some(value => Math.abs(value) > 0.1)).toBe(true);
    expect(synthesizeCucumber(48000, kind)).toEqual(samples);
  });
});
