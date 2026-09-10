import { describe, expect, it, vi } from 'vitest';
import { SESSION, sessionAccuracy } from '../src/game/session';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import { TaskSequence } from '../src/game/TaskSequence';
import { synthesizeStomp } from '../src/audio/bugSounds';
import { shoeLift } from '../src/vignettes/BugShoeVignette';

describe('authored three-act session', () => {
  it('holds cartoon contact briefly and recovers without changing timing', () => {
    expect(shoeLift(0)).toBe(0);
    expect(shoeLift(0.035)).toBe(0);
    expect(shoeLift(0.315)).toBeCloseTo(245);
    expect(shoeLift(100)).toBe(245);
  });
  it('teaches steady taps, one offbeat, then a longer phrase without overlapping hit windows', () => {
    expect(SESSION.map(a => a.vignette)).toEqual(['hammer', 'window', 'bug']);
    expect(SESSION.map(a => a.bpm)).toEqual([86, 96, 104]);
    expect(SESSION.map(a => a.pattern.lengthBeats)).toEqual([4, 4, 8]);
    for (const act of SESSION) for (let i = 1; i < act.pattern.hits.length; i++) {
      expect((act.pattern.hits[i]! - act.pattern.hits[i - 1]!) * 60 / act.bpm).toBeGreaterThan(0.26);
    }
  });
  it.each([0, 0.08, 0.24, -1])('runs three complete sessions with offset %s and ignores non-response input', offset => {
    const sound = { play: vi.fn(), cancel: vi.fn() };
    const events: RoundEvents = { phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() };
    const controller = new RoundController(sound, events);
    for (let loop = 0; loop < 3; loop++) {
      let origin = 0.2;
      const accuracies: number[] = [];
      for (const act of SESSION) {
        controller.start(act.pattern, act.bpm, origin - 0.2, (origin - 0.2) * 1000, origin);
        const plan = controller.plan!;
        let target = 0;
        for (let now = origin; now <= plan.end + 0.22; now += 0.01) {
          controller.tick(now, now * 1000);
          if (now < plan.demo + 0.1) expect(controller.tap(now, now, now * 1000)).toBeNull();
          if (offset === -1 && Math.round(now * 100) % 4 === 0) controller.tap(now, now, now * 1000);
          else if (offset !== -1 && target < plan.targets.length && now >= plan.targets[target]! + offset) {
            controller.tap(now, now, now * 1000); target++;
          }
        }
        expect(controller.result).not.toBeNull();
        expect(controller.tap(plan.end + 0.5, plan.end + 0.5, (plan.end + 0.5) * 1000)).toBeNull();
        accuracies.push(controller.result!.accuracy);
        origin = new TaskSequence(act.bpm, origin).ending(plan.end).next;
      }
      if (offset === 0.24) expect(sessionAccuracy(accuracies)).toBeLessThan(15); // A late hit can coincide with a later offbeat.
      else expect(sessionAccuracy(accuracies)).toBe(offset === 0 ? 100 : offset === 0.08 ? 70 : 0);
      controller.dispose();
    }
    expect(events.interrupted).not.toHaveBeenCalled();
    expect(events.complete).toHaveBeenCalledTimes(9);
  });
  it.each(['action', 'success', 'rough'] as const)('synthesizes bounded cartoon %s sounds', kind => {
    const samples = synthesizeStomp(48000, kind);
    expect(samples.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
    expect(samples.some(v => Math.abs(v) > 0.1)).toBe(true);
  });
});
