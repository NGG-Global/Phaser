import { describe, expect, it } from 'vitest';
import { beatsPlayed, countIn, markFor, trackGeometry } from '../src/game/beatTrack';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { parsePattern } from '../src/rhythm/patterns';
import type { Judgement } from '../src/rhythm/judge';

const hit = (grade: 'Perfect' | 'Good'): Judgement => ({ kind: 'hit', grade, index: 0, deltaMs: 10 });

describe('what the beat track is showing', () => {
  it('reads a mark off the judge rather than deciding anything itself', () => {
    expect(markFor(null)).toBe('pending');
    expect(markFor(undefined)).toBe('pending');
    expect(markFor(hit('Perfect'))).toBe('perfect');
    expect(markFor(hit('Good'))).toBe('good');
    expect(markFor({ kind: 'omission', grade: 'Miss', index: 2, deltaMs: null })).toBe('miss');
  });

  it('leaves the row unmarked for an extra tap, which belongs to no beat', () => {
    expect(markFor({ kind: 'extra', grade: 'Miss', index: null, deltaMs: 300 })).toBe('pending');
  });

  it('centres the beads and keeps the longest pattern inside the frame', () => {
    for (const count of [3, 4, 5, 6, 7, 8, 9]) {
      const width = 560;
      const { centres, radius, gap } = trackGeometry(count, width);
      expect(centres).toHaveLength(count);
      // Symmetric about the centre, so the row sits under the action wherever that is.
      expect(centres[0]! + centres[count - 1]!).toBeCloseTo(0, 6);
      // Evenly pitched.
      if (count > 1) expect(centres[1]! - centres[0]!).toBeCloseTo(gap, 6);
      // Nothing, bead edge included, may leave the frame.
      expect(Math.abs(centres[count - 1]!) + radius).toBeLessThanOrEqual(width / 2 + 0.001);
      expect(radius).toBeGreaterThan(0);
    }
  });

  it('shrinks the pitch before the beads, and degenerates safely', () => {
    expect(trackGeometry(9, 120).gap).toBeLessThan(trackGeometry(9, 560).gap);
    expect(trackGeometry(1, 560).centres).toEqual([0]);
    expect(trackGeometry(0, 560).centres).toEqual([]);
    expect(trackGeometry(4, 0).centres).toEqual([]);
    expect(trackGeometry(4, Number.NaN).centres).toEqual([]);
  });

  it('counts demonstration beats from the plan and never goes backwards', () => {
    const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 0, 4);
    expect(beatsPlayed(null, 99)).toBe(0);
    expect(beatsPlayed(plan, plan.demo - 0.001)).toBe(0);
    let previous = 0;
    for (let t = 0; t <= plan.end; t += 0.02) {
      const played = beatsPlayed(plan, t);
      expect(played).toBeGreaterThanOrEqual(previous);
      previous = played;
    }
    // Every action cue has sounded by the time the player's turn ends.
    expect(beatsPlayed(plan, plan.end)).toBe(plan.targets.length);
  });

  it('shows the last four lead ticks, and nothing once the demonstration starts', () => {
    const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 0, 4);
    expect(countIn(null, 0)).toBeNull();
    expect(countIn(plan, plan.demo)).toBeNull();
    expect(countIn(plan, plan.demo + 1)).toBeNull();
    // It fills across the bar and is full on the last tick before the demonstration.
    expect(countIn(plan, 0)).toBe(1);
    const beat = 60 / 120;
    expect(countIn(plan, 3 * beat)).toBe(4);
  });

  it('treats a long breather as a rest, not a count of sixteen', () => {
    const plan = createRoundPlan(1, parsePattern('p', 'X X - X'), 120, 0, 16);
    const beat = 60 / 120;
    // Early in the breather there is nothing to count down to yet.
    expect(countIn(plan, 2 * beat)).toBeNull();
    // The row arrives one beat before the first of the final four ticks.
    expect(countIn(plan, 11 * beat)).toBe(0);
    expect(countIn(plan, 12 * beat)).toBe(1);
    expect(countIn(plan, 15 * beat)).toBe(4);
  });
});
