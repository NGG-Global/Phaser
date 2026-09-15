import { describe, expect, it } from 'vitest';
import { completeTutorial, tutorialComplete, TUTORIAL, TutorialRun } from '../src/game/TutorialRun';
import { PROGRESSION } from '../src/config/progression';

describe('tutorial lesson', () => {
  it('demonstrates a rest and hands over on the next beat at both teaching and game pace', () => {
    const run = new TutorialRun();
    for (const fast of [false, true]) {
      run.demo(10, fast);
      const plan = run.plan;
      expect(plan.bpm).toBe(fast ? PROGRESSION.baseBpm : TUTORIAL.slowBpm);
      expect(plan.pattern.hits).toEqual([0, 1, 3]);
      expect(plan.response).toBeCloseTo(plan.demo + 4 * 60 / plan.bpm);
      expect(plan.targets[0]).toBe(plan.response);
      expect(run.tap(plan.response)).toBe(false);
      run.tick(plan.end - 0.001);
      expect(run.step).toBe(fast ? 'fast-demo' : 'slow-demo');
      run.tick(plan.end);
      expect(run.step).toBe(fast ? 'complete' : 'practice-ready');
    }
  });

  it('never advances through the tryout without the player, even after a long wait', () => {
    const run = new TutorialRun();
    run.practice(10);
    run.tick(10_000);
    expect(run.step).toBe('practice');
    expect(run.hits).toBe(0);
    expect(run.tap(10_000)).toBe(true);
    run.tick(20_000);
    expect(run.step).toBe('practice');
    expect(run.hits).toBe(1);
    expect(run.tap(20_000)).toBe(true);
    run.tick(30_000);
    expect(run.hits).toBe(2);
    expect(run.tap(30_000)).toBe(true);
    expect(run.step).toBe('practice-done');
    expect(run.tap(40_000)).toBe(false);
  });

  it('teaches spacing and the quiet beat without letting a burst of taps finish practice', () => {
    const run = new TutorialRun();
    run.practice(0);
    expect(run.tap(0)).toBe(false);
    expect(run.tap(Number.NaN)).toBe(false);
    expect(run.tap(run.due)).toBe(true);
    const second = run.due;
    expect(run.tap(second - 0.01)).toBe(false);
    expect(run.tap(second)).toBe(true);
    const third = run.due;
    expect(third - second).toBeCloseTo(2 * 60 / TUTORIAL.slowBpm);
    expect(run.practiceBeat(second + 60 / TUTORIAL.slowBpm + 0.01)).toBe(2);
    expect(run.tap(third - 0.01)).toBe(false);
    expect(run.practiceBeat(third + 100)).toBe(3);
    expect(run.tap(third + 100)).toBe(true);
    expect(run.hits).toBe(3);
  });

  it('restarts practice and replays the demo without stale progress', () => {
    const run = new TutorialRun();
    run.practice(0);
    run.tap(1);
    run.practice(100);
    expect(run.hits).toBe(0);
    expect(run.tap(100)).toBe(false);
    expect(run.practiceBeat(1000)).toBe(0);
    run.demo(200);
    expect(run.step).toBe('slow-demo');
    expect(run.due).toBe(Infinity);
    expect(run.tap(1000)).toBe(false);
  });
});

describe('tutorial completion', () => {
  it('remembers only explicit completion, using a separate key from game progress', () => {
    const values = new Map<string, string>([['small-acts.progress.v1', '{"unlocked":8}']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(tutorialComplete(storage)).toBe(false);
    completeTutorial(storage);
    expect(tutorialComplete(storage)).toBe(true);
    expect(values.get('small-acts.progress.v1')).toBe('{"unlocked":8}');
  });

  it('tolerates missing, malformed and blocked storage', () => {
    expect(tutorialComplete(null)).toBe(false);
    expect(tutorialComplete({ getItem: () => 'true' })).toBe(false);
    expect(tutorialComplete({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => completeTutorial(null)).not.toThrow();
    expect(() => completeTutorial({ setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});
