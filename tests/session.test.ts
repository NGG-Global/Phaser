import { describe, expect, it, vi } from 'vitest';
import { SESSION, sessionAccuracy, sessionTasks, validateSession } from '../src/game/session';
import { MUSIC } from '../src/config/music';
import { RHYTHM } from '../src/config/rhythm';
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
  it('groups tasks into single-vignette rounds that alternate vignette', () => {
    expect(SESSION.map(r => r.vignette)).toEqual(['hammer', 'window', 'bug']);
    expect(SESSION.map(r => r.tasks.length)).toEqual([3, 3, 3]);
    expect(SESSION.map(r => r.tasks.map(p => p.lengthBeats))).toEqual([[4, 4, 4], [4, 4, 4], [8, 8, 8]]);
    const tasks = sessionTasks();
    expect(tasks).toHaveLength(9);
    expect(tasks.map(task => task.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(tasks.map(task => task.round)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(tasks.map(task => task.closesRound)).toEqual([false, false, true, false, false, true, false, false, true]);
    for (const task of tasks) expect(task.vignette).toBe(SESSION[task.round]!.vignette);
    expect(() => validateSession([{ vignette: 'hammer', tasks: SESSION[0]!.tasks }, { vignette: 'hammer', tasks: SESSION[0]!.tasks }])).toThrow(/repeat/);
    expect(() => validateSession([{ vignette: 'hammer', tasks: [] }])).toThrow(/no tasks/);
    expect(() => validateSession([])).toThrow();
  });
  it('keeps every task at the music tempo with Perfect windows that never overlap', () => {
    const beat = 60 / MUSIC.sourceBpm;
    for (const round of SESSION) for (const pattern of round.tasks) for (let i = 1; i < pattern.hits.length; i++) {
      const gap = (pattern.hits[i]! - pattern.hits[i - 1]!) * beat;
      // Adjacent half beats (250 ms) are closer than two Good windows, so the judge's
      // nearest-target cells decide those; Perfect windows must never overlap.
      expect(gap).toBeGreaterThan(2 * RHYTHM.perfectMs / 1000);
      expect(gap).toBeGreaterThan(RHYTHM.goodMs / 1000);
    }
  });
  it.each([0, 0.08, 0.24, -1])('runs three complete sessions with offset %s and ignores non-response input', offset => {
    const sound = { play: vi.fn(), cancel: vi.fn() };
    const events: RoundEvents = { phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() };
    const controller = new RoundController(sound, events);
    for (let loop = 0; loop < 3; loop++) {
      let origin = 0.2;
      const accuracies: number[] = [];
      for (const act of sessionTasks()) {
        controller.start(act.pattern, MUSIC.sourceBpm, origin - 0.2, (origin - 0.2) * 1000, origin);
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
        origin = new TaskSequence(MUSIC.sourceBpm, origin).ending(plan.end).next;
      }
      if (offset === 0.24) expect(sessionAccuracy(accuracies)).toBeLessThan(15); // A late hit can coincide with a later offbeat.
      else expect(sessionAccuracy(accuracies)).toBe(offset === 0 ? 100 : offset === 0.08 ? 70 : 0);
      controller.dispose();
    }
    expect(events.interrupted).not.toHaveBeenCalled();
    expect(events.complete).toHaveBeenCalledTimes(3 * sessionTasks().length);
  });
  it.each(['action', 'success', 'rough'] as const)('synthesizes bounded cartoon %s sounds', kind => {
    const samples = synthesizeStomp(48000, kind);
    expect(samples.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
    expect(samples.some(v => Math.abs(v) > 0.1)).toBe(true);
  });
});
