import { describe, expect, it } from 'vitest';
import {
  acceptDemoBeat, advanceSlice, bananaAt, bananaCutT, bananaOutline, BANANA_MOTION, bananaTiming,
  cutFraction, juiceFall, knifeLift, knifeWindup, REFERENCE_BEAT, sliceTumble,
} from '../src/vignettes/bananaMotion';
import { synthesizeBanana } from '../src/audio/bananaSounds';

describe('banana presentation curves', () => {
  it('lands the edge on the beat and is back up before the next possible hit', () => {
    const t = bananaTiming();
    expect(REFERENCE_BEAT).toBe(0.5);
    expect(knifeLift(0)).toBe(0);
    expect(knifeLift(t.holdSec)).toBe(0);
    expect(knifeLift(t.riseSec)).toBeCloseTo(1);
    expect(knifeLift(100)).toBe(1);
    expect(knifeLift(-1)).toBe(1);
    expect(BANANA_MOTION.riseBeats).toBeLessThan(0.5);
    for (const bpm of [120, 136, 150]) {
      const beat = 60 / bpm;
      expect(bananaTiming(beat).riseSec).toBeLessThan(beat / 2);
      expect(knifeLift(bananaTiming(beat).riseSec, beat)).toBeCloseTo(1);
    }
  });
  it('winds up higher and then drops to exactly zero at contact', () => {
    const t = bananaTiming();
    expect(knifeWindup(t.windupSec)).toBeCloseTo(1);
    expect(knifeWindup(t.windupSec * 0.62)).toBeGreaterThan(1);
    expect(knifeWindup(0)).toBeCloseTo(0);
    expect(knifeWindup(t.windupSec, 0.3)).toBeCloseTo(0.3);
    expect(knifeWindup(0, 0.3)).toBeCloseTo(0);
    expect(knifeWindup(0, 1, 60 / 150)).toBeCloseTo(0);
  });
  it('takes slices only for accurate chops and leaves the stem for the coda', () => {
    expect(cutFraction(0, 3)).toBe(0);
    expect(cutFraction(3, 3)).toBeCloseTo(BANANA_MOTION.cutAtFullResponse);
    expect(cutFraction(3, 3)).toBeLessThan(1);
    expect(bananaCutT(0)).toBe(1);
    expect(bananaCutT(1)).toBeCloseTo(1 - BANANA_MOTION.cutAtFullResponse);
    expect(bananaCutT(1)).toBeGreaterThan(0);
    expect(advanceSlice(2, 'hit')).toBe(3);
    expect(advanceSlice(2, 'extra')).toBe(2);
    expect(advanceSlice(2, 'omission')).toBe(2);
    expect(acceptDemoBeat(4, 4)).toBeNull();
    expect(acceptDemoBeat(4, 4.5)).toBe(4.5);
  });
  it('sits the belly on the board, tapers the ends, and keeps the remaining fruit left of the tip', () => {
    const mid = bananaAt(0.5);
    const stem = bananaAt(0);
    const tip = bananaAt(1);
    expect(mid.y + mid.half).toBeCloseTo(0, 5);
    expect(stem.half).toBeLessThan(mid.half);
    expect(tip.half).toBeLessThan(mid.half);
    expect(stem.x).toBe(BANANA_MOTION.stemX);
    expect(tip.x).toBe(BANANA_MOTION.stemX + BANANA_MOTION.length);
    expect(mid.ny).toBeLessThan(0);
    const full = bananaOutline(1);
    expect(full.length).toBeGreaterThan(20);
    const cut = bananaOutline(bananaCutT(0.5));
    const maxX = Math.max(...cut.filter((_, i) => i % 2 === 0));
    expect(maxX).toBeLessThan(tip.x);
    expect(bananaOutline(0)).toEqual([]);
  });
  it('keeps the flop and the juice bounded', () => {
    expect(sliceTumble(-1)).toBe(0);
    expect(sliceTumble(0)).toBe(0);
    expect(sliceTumble(bananaTiming().tumbleSec)).toBeCloseTo(1);
    expect(sliceTumble(100)).toBe(1);
    expect(sliceTumble(bananaTiming().tumbleSec * 0.5)).toBeGreaterThan(0.4);
    expect(juiceFall(-1)).toBe(0);
    expect(juiceFall(0)).toBe(0);
    expect(juiceFall(100)).toBe(juiceFall(bananaTiming().juiceSec));
    expect(juiceFall(0.1, 0.4)).toBeGreaterThan(juiceFall(0.1, 0.5));
  });
  it.each(['action', 'success', 'rough', 'scrape', 'judder'] as const)('synthesizes a bounded deterministic %s buffer', kind => {
    const samples = synthesizeBanana(48000, kind);
    expect(samples.length).toBeGreaterThan(8000);
    expect(samples[0]).toBe(0);
    expect(Array.from(samples.subarray(1, 96)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(samples.some(value => Math.abs(value) > 0.1)).toBe(true);
    expect(synthesizeBanana(48000, kind)).toEqual(samples);
  });
});
