import { describe, expect, it, vi } from 'vitest';
import { RoundController, type RoundEvents } from '../src/game/RoundController';
import { parsePattern } from '../src/rhythm/patterns';

function setup() {
  const events: RoundEvents = { phase: vi.fn(), cue: vi.fn(), tap: vi.fn(), judgement: vi.fn(), complete: vi.fn(), interrupted: vi.fn() };
  const sound = { play: vi.fn(), cancel: vi.fn() };
  const round = new RoundController(sound, events);
  let now = 0;
  const advance = (until: number) => {
    while (now + 0.02 < until) { now += 0.02; round.tick(now, now * 1000); }
    now = until; round.tick(now, now * 1000);
  };
  round.start(parsePattern('p', 'X X - X'), 100, 0, 0);
  return { round, events, sound, advance };
}

describe('round lifecycle', () => {
  it('accepts a shared musical start without adding another setup lead', () => {
    const { round } = setup();
    round.start(parsePattern('p', 'X X - X'), 100, 10, 10000, 12);
    expect(round.plan!.start).toBe(12);
    expect(round.plan!.demo).toBeCloseTo(14.4);
    expect(round.plan!.cues.filter(c => c.kind === 'count').map(c => c.time)).toEqual([12, 12.6, 13.2, 13.8]);
  });
  it('runs watch/handoff/response/result with one completion and no response ghosts', () => {
    const { round, events, sound, advance } = setup();
    const plan = round.plan!;
    expect(round.tap(plan.demo, plan.demo, 0)).toBeNull();
    for (const target of plan.targets) {
      advance(target);
      expect(round.tap(target, target, target * 1000)?.grade).toBe('Perfect');
    }
    advance(plan.end + 0.3);
    expect(round.result?.accuracy).toBe(100);
    expect(events.complete).toHaveBeenCalledTimes(1);
    advance(plan.end + 1);
    expect(events.complete).toHaveBeenCalledTimes(1);
    expect(sound.play).toHaveBeenCalledTimes(plan.cues.length + plan.targets.length);
    expect(events.phase).toHaveBeenCalledWith('handoff');
    expect(events.phase).toHaveBeenCalledWith('respond');
  });
  it('retains the early first-hit window before the rendered respond phase', () => {
    const { round, advance } = setup();
    const early = round.plan!.response - 0.1;
    advance(early);
    expect(round.phase).toBe('handoff');
    expect(round.tap(early, early, early * 1000)?.grade).toBe('Good');
  });
  it('uses capture time even when a callback is delivered late', () => {
    const { round, advance } = setup();
    const target = round.plan!.targets[0]!;
    advance(target + 0.1);
    expect(round.tap(target, target + 0.1, (target + 0.1) * 1000)?.grade).toBe('Perfect');
  });
  it('tolerates a stall that ends inside the count-in, since nothing has been shown or judged yet', () => {
    const { round, events } = setup();
    round.tick(0.02, 20);
    round.tick(1.5, 1500); // 1.48 s without a pump, still before the demonstration at 2.6 s
    expect(round.phase).toBe('prepare');
    expect(events.interrupted).not.toHaveBeenCalled();
    round.tick(1.52, 1520);
    round.tick(2.7, 2700); // the same gap reaching the demonstration is a real stall
    expect(round.phase).toBe('paused');
    expect(events.interrupted).toHaveBeenCalledTimes(1);
  });
  it('invalidates a long stall before recording unfair misses', () => {
    const { round, events } = setup();
    round.tick(9, 9000);
    expect(round.phase).toBe('paused');
    expect(round.result).toBeNull();
    expect(events.judgement).not.toHaveBeenCalled();
    expect(events.interrupted).toHaveBeenCalledTimes(1);
  });
  it('restarts repeatedly and ignores input from old attempts', () => {
    const { round, advance, events } = setup();
    const old = round.plan!;
    for (let i = 0; i < 50; i++) round.start(old.pattern, 120, 0, 0);
    expect(round.plan!.id).toBe(51);
    const current = round.plan!;
    advance(current.end + 0.3);
    expect(events.complete).toHaveBeenCalledTimes(1);
    expect(round.result).toMatchObject({ accuracy: 0, missed: 3 });
    expect(round.tap(old.targets[0]!, 20, 20000)).toBeNull();
    round.dispose(); round.dispose();
    expect(round.plan).toBeNull();
  });
});
