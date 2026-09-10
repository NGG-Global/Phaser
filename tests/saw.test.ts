import { describe, expect, it, vi } from 'vitest';
import {
  advanceBite, acceptDemoBeat, bladeVisibleDepth, drawBack, dustFall,
  kerfDepth, SAW_MOTION, sawDirection, strokeTravel,
} from '../src/vignettes/sawMotion';
import { synthesizeSaw } from '../src/audio/sawSounds';
import { levelSpec } from '../src/game/levels';
import { VIGNETTES } from '../src/vignettes/registry';

// Phaser reads `window` at module init; the registry pulls it in for real. Same stub as
// tests/levels.test.ts, which imports the registry through the level generator.
vi.mock('phaser', () => ({ default: {} }));

describe('saw presentation curves', () => {
  it('alternates push and pull from the action count alone', () => {
    expect([0, 1, 2, 3, 4, 5].map(sawDirection)).toEqual([1, -1, 1, -1, 1, -1]);
    // The count is read before the first stroke and after many, so it must be total.
    expect(sawDirection(-1)).toBe(-1);
    expect(sawDirection(-2)).toBe(1);
    expect(sawDirection(1000)).toBe(1);
    expect(sawDirection(1001)).toBe(-1);
  });
  it('puts maximum engagement on the beat and chains one stroke into the next', () => {
    expect(strokeTravel(0)).toBe(0);
    expect(strokeTravel(SAW_MOTION.biteHoldSec)).toBe(0);
    expect(strokeTravel(SAW_MOTION.followThroughSec)).toBeCloseTo(1);
    expect(strokeTravel(100)).toBe(1);
    expect(strokeTravel(-1)).toBe(0);
    // A stroke resting at the end of its travel is the next stroke's fully drawn back.
    expect(drawBack(SAW_MOTION.drawBackSec)).toBe(-1);
    expect(drawBack(0)).toBeCloseTo(0);
    expect(drawBack(SAW_MOTION.drawBackSec * 0.5)).toBeGreaterThan(-1);
    // A quick pair reverses from wherever the previous follow-through had reached.
    expect(drawBack(SAW_MOTION.drawBackSec, -0.3)).toBeCloseTo(-0.3);
    expect(drawBack(0, -0.3)).toBeCloseTo(0);
    // The draw back and the follow-through together fit inside a half beat at 120 BPM.
    expect(SAW_MOTION.drawBackSec + SAW_MOTION.followThroughSec).toBeLessThan(0.5);
  });
  it('never shows the blade below the depth it has actually sawn', () => {
    expect(kerfDepth(0, 3)).toBe(0);
    expect(kerfDepth(3, 3)).toBeCloseTo(SAW_MOTION.kerfAtFullResponse);
    expect(kerfDepth(2, 3)).toBeLessThan(kerfDepth(3, 3));
    // A flawless response stops short of severing; the unscored coda finishes it.
    expect(kerfDepth(3, 3)).toBeLessThan(1);
    expect(kerfDepth(9, 3)).toBe(kerfDepth(3, 3));
    expect(kerfDepth(-1, 3)).toBe(0);
    expect(kerfDepth(1, 0)).toBe(SAW_MOTION.kerfAtFullResponse);
    expect(bladeVisibleDepth(0)).toBe(0);
    expect(bladeVisibleDepth(1)).toBe(SAW_MOTION.boardThickness);
    expect(bladeVisibleDepth(3)).toBe(bladeVisibleDepth(1));
    expect(bladeVisibleDepth(-1)).toBe(0);
    expect(bladeVisibleDepth(kerfDepth(3, 3))).toBeLessThan(SAW_MOTION.boardThickness);
  });
  it('only cuts on an accurate stroke and never invents one', () => {
    expect(advanceBite(2, 'hit')).toBe(3);
    // An extra tap skids and a missed target judders; neither deepens the kerf.
    expect(advanceBite(2, 'extra')).toBe(2);
    expect(advanceBite(2, 'omission')).toBe(2);
  });
  it('draws a demonstration beat once however often it is delivered', () => {
    const first = acceptDemoBeat(-Infinity, 4);
    expect(first).toBe(4);
    // Rendering re-scans the plan's cues every frame and the host forwards the cue too.
    expect(acceptDemoBeat(first!, 4)).toBeNull();
    expect(acceptDemoBeat(first!, 3.5)).toBeNull();
    expect(acceptDemoBeat(first!, 4.5)).toBe(4.5);
  });
  it('keeps the dust plume bounded and grounded', () => {
    expect(dustFall(-1)).toBe(0);
    expect(dustFall(0)).toBe(0);
    expect(dustFall(SAW_MOTION.dustSec / 2)).toBeLessThan(dustFall(SAW_MOTION.dustSec));
    expect(dustFall(100)).toBe(dustFall(SAW_MOTION.dustSec));
  });
  it('takes every fourth level, by registry order alone', () => {
    // levelSpec picks VIGNETTES[(level - 1) % VIGNETTES.length], so registry order is the
    // rotation. Reordering or inserting an entry silently reassigns every level's vignette.
    expect(VIGNETTES.map(v => v.id)).toEqual(['hammer', 'window', 'bug', 'saw']);
    expect([1, 2, 3, 4, 5, 8, 12].map(level => levelSpec(level).vignette))
      .toEqual(['hammer', 'window', 'bug', 'saw', 'hammer', 'saw', 'saw']);
  });
  it.each(['action', 'success', 'rough', 'scrape', 'judder'] as const)('synthesizes a bounded deterministic %s buffer', kind => {
    const samples = synthesizeSaw(48000, kind);
    expect(samples.length).toBeGreaterThan(8000);
    expect(samples[0]).toBe(0);
    expect(Array.from(samples.subarray(1, 96)).some(value => Math.abs(value) > 0.01)).toBe(true);
    expect(samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(samples.some(value => Math.abs(value) > 0.1)).toBe(true);
    expect(synthesizeSaw(48000, kind)).toEqual(samples);
  });
});
