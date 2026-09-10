import { describe, expect, it } from 'vitest';
import {
  acceptDemoBeat, advanceSlice, cutFraction, juiceFall, knifeLift, knifeWindup,
  REFERENCE_BEAT, sliceTumble, TOMATO_MOTION, tomatoTiming,
} from '../src/vignettes/tomatoMotion';
import { synthesizeChop } from '../src/audio/tomatoSounds';

describe('tomato presentation curves', () => {
  it('lands the edge on the beat and is back up before the next possible hit', () => {
    const t = tomatoTiming();
    expect(REFERENCE_BEAT).toBe(0.5);
    expect(knifeLift(0)).toBe(0);
    expect(knifeLift(t.holdSec)).toBe(0);
    expect(knifeLift(t.riseSec)).toBeCloseTo(1);
    expect(knifeLift(100)).toBe(1);
    // Before any strike the knife is up, not lying on the board.
    expect(knifeLift(-1)).toBe(1);
    // The tightest authored interval is a half beat at every tempo.
    expect(TOMATO_MOTION.riseBeats).toBeLessThan(0.5);
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(tomatoTiming(beat).riseSec).toBeLessThan(beat / 2);
      expect(knifeLift(tomatoTiming(beat).riseSec, beat)).toBeCloseTo(1);
    }
  });
  it('winds up higher and then drops to exactly zero at contact', () => {
    const t = tomatoTiming();
    expect(knifeWindup(t.windupSec)).toBeCloseTo(1);
    expect(knifeWindup(t.windupSec * 0.62)).toBeGreaterThan(1);
    expect(knifeWindup(0)).toBeCloseTo(0);
    // A quick pair starts its windup from a knife that is still rising.
    expect(knifeWindup(t.windupSec, 0.3)).toBeCloseTo(0.3);
    expect(knifeWindup(0, 0.3)).toBeCloseTo(0);
    expect(knifeWindup(0, 1, 60 / 150)).toBeCloseTo(0);
  });
  it('takes slices only for accurate chops and leaves a heel for the coda', () => {
    expect(cutFraction(0, 3)).toBe(0);
    expect(cutFraction(3, 3)).toBeCloseTo(TOMATO_MOTION.cutAtFullResponse);
    expect(cutFraction(3, 3)).toBeLessThan(1);
    expect(cutFraction(9, 3)).toBe(cutFraction(3, 3));
    expect(cutFraction(-1, 3)).toBe(0);
    expect(cutFraction(1, 0)).toBe(TOMATO_MOTION.cutAtFullResponse);
    expect(advanceSlice(2, 'hit')).toBe(3);
    // A knock on bare board and a hover both leave the fruit exactly as it was.
    expect(advanceSlice(2, 'extra')).toBe(2);
    expect(advanceSlice(2, 'omission')).toBe(2);
    expect(acceptDemoBeat(4, 4)).toBeNull();
    expect(acceptDemoBeat(4, 4.5)).toBe(4.5);
  });
  it('keeps the topple and the juice bounded', () => {
    expect(sliceTumble(-1)).toBe(0);
    expect(sliceTumble(0)).toBe(0);
    expect(sliceTumble(tomatoTiming().tumbleSec)).toBeCloseTo(1);
    expect(sliceTumble(100)).toBe(1);
    expect(juiceFall(-1)).toBe(0);
    expect(juiceFall(0)).toBe(0);
    expect(juiceFall(100)).toBe(juiceFall(tomatoTiming().juiceSec));
    expect(juiceFall(0.1, 0.4)).toBeGreaterThan(juiceFall(0.1, 0.5));
  });
  it.each(['action', 'success', 'rough', 'scrape', 'judder'] as const)('synthesizes a bounded deterministic %s buffer', kind => {
    const samples = synthesizeChop(48000, kind);
    expect(samples.length).toBeGreaterThan(8000);
    expect(samples[0]).toBe(0);
    expect(Array.from(samples.subarray(1, 96)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(samples.some(value => Math.abs(value) > 0.1)).toBe(true);
    expect(synthesizeChop(48000, kind)).toEqual(samples);
  });
});
