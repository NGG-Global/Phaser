import { describe, expect, it } from 'vitest';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { PATTERNS } from '../src/rhythm/patterns';

describe('musical task sequence', () => {
  it.each([80, 100, 120])('keeps every phase and task on the shared bar grid at %s BPM', bpm => {
    const sequence = new TaskSequence(bpm, 10);
    const beat = 60 / bpm;
    let start = sequence.origin;
    for (const pattern of PATTERNS) {
      const plan = createRoundPlan(sequence.index, pattern, bpm, start);
      expect(plan.cues.filter(c => c.kind === 'count')).toHaveLength(4);
      expect(plan.cues.filter(c => c.kind === 'ready')).toHaveLength(4);
      expect(plan.demo - start).toBeCloseTo(4 * beat);
      for (const point of [plan.demo, plan.handoff, plan.response, plan.end]) {
        const bars = (point - sequence.origin) / (4 * beat);
        expect(bars).toBeCloseTo(Math.round(bars));
      }
      const ending = sequence.ending(plan.end);
      expect(ending.next - plan.end).toBeCloseTo(4 * beat);
      expect(ending.swap - ending.slide).toBeCloseTo(beat);
      sequence.complete(100);
      sequence.advance();
      start = ending.next;
    }
    expect(sequence.last).toBe(true);
    expect(sequence.index).toBe(2);
    expect(sequence.results).toHaveLength(3);
    expect(sequence.accuracy).toBe(100);
  });
  it('pads the five-beat task with silence without moving its hits', () => {
    const plan = createRoundPlan(1, PATTERNS[1]!, 120, 0);
    expect(plan.handoff - plan.demo).toBe(4);
    expect(plan.targets.map(t => (t - plan.response) * 2)).toEqual([0, 1, 3, 4]);
  });
  it('replaces a repeated task result instead of counting it twice', () => {
    const sequence = new TaskSequence(100, 0);
    sequence.complete(0); sequence.complete(100);
    sequence.advance(); sequence.complete(50);
    expect(sequence.results).toEqual([100, 50]);
    expect(sequence.accuracy).toBe(75);
  });
});
