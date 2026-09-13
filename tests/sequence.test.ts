import { describe, expect, it } from 'vitest';
import { TaskSequence } from '../src/game/TaskSequence';
import { createRoundPlan } from '../src/rhythm/RhythmScheduler';
import { PATTERNS } from '../src/rhythm/patterns';
import { RHYTHM } from '../src/config/rhythm';
import { PROGRESSION } from '../src/config/progression';

describe('musical task sequence', () => {
  it.each([80, 100, 120])('keeps every phase and task on the shared bar grid at %s BPM', bpm => {
    const sequence = new TaskSequence(bpm, 10);
    const beat = 60 / bpm;
    let start = sequence.origin;
    for (const pattern of PATTERNS) {
      // Only the first task of a level carries a lead-in; the rest follow straight on.
      const leadBeats = sequence.index === 0 ? RHYTHM.leadInBeats : 0;
      const plan = createRoundPlan(sequence.index, pattern, bpm, start, leadBeats);
      expect(plan.cues.filter(c => c.kind === 'count')).toHaveLength(Math.max(0, leadBeats - 1));
      // One readiness tick, on the last lead beat, and none at all without a lead-in.
      expect(plan.cues.filter(c => c.kind === 'ready')).toHaveLength(leadBeats > 0 ? 1 : 0);
      expect(plan.demo - start).toBeCloseTo(leadBeats * beat);
      for (const point of [plan.demo, plan.response, plan.end]) {
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
    // Two whole bars at 120 BPM, and the response begins on the bar line the
    // demonstration ended on: no bar waits between them.
    expect(plan.response - plan.demo).toBe(4);
    expect(plan.targets.map(t => (t - plan.response) * 2)).toEqual([0, 1, 3, 4]);
  });
  it('gives a task without a lead-in no cues before its demonstration', () => {
    const plan = createRoundPlan(1, PATTERNS[0]!, 120, 7);
    expect(plan.demo).toBe(7);
    expect(plan.cues.every(c => c.kind === 'action')).toBe(true);
    expect(plan.cues.every(c => c.time >= plan.demo)).toBe(true);
  });
  it('counts a lead-in in and marks its last beat as the readiness tick', () => {
    for (const leadBeats of [RHYTHM.leadInBeats, PROGRESSION.breatherBars * RHYTHM.beatsPerBar]) {
      const plan = createRoundPlan(1, PATTERNS[0]!, 120, 0, leadBeats);
      const lead = plan.cues.filter(c => c.kind !== 'action');
      expect(lead).toHaveLength(leadBeats);
      expect(lead.map(c => c.time)).toEqual(Array.from({ length: leadBeats }, (_, i) => i * 0.5));
      expect(lead.map(c => c.kind).slice(0, -1).every(kind => kind === 'count')).toBe(true);
      expect(lead[lead.length - 1]!.kind).toBe('ready');
      expect(plan.demo).toBeCloseTo(leadBeats * 0.5);
    }
  });
  it('rejects a lead-in that is not whole beats', () => {
    expect(() => createRoundPlan(1, PATTERNS[0]!, 120, 0, 1.5)).toThrow(/whole beats/);
    expect(() => createRoundPlan(1, PATTERNS[0]!, 120, 0, -1)).toThrow(/whole beats/);
  });
  it('replaces a repeated task result instead of counting it twice', () => {
    const sequence = new TaskSequence(100, 0);
    sequence.complete(0); sequence.complete(100);
    sequence.advance(); sequence.complete(50);
    expect(sequence.results).toEqual([100, 50]);
    expect(sequence.accuracy).toBe(75);
  });
});
