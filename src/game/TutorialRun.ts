import { PROGRESSION } from '../config/progression';
import { createRoundPlan, type RoundPlan } from '../rhythm/RhythmScheduler';
import { parsePattern } from '../rhythm/patterns';

export const TUTORIAL = {
  slowBpm: 72,
  gameBpm: PROGRESSION.baseBpm,
  pattern: parsePattern('tutorial', 'X X - X'),
  leadSec: 0.8,
} as const;

export type TutorialStep = 'slow-demo' | 'practice-ready' | 'practice' | 'practice-done' | 'fast-demo' | 'complete';

/** Guided practice stretches at each target until a real tap arrives. It never scores a level. */
export class TutorialRun {
  public step: TutorialStep = 'slow-demo';
  public plan: RoundPlan = createRoundPlan(0, TUTORIAL.pattern, TUTORIAL.slowBpm, 0);
  public hits = 0;
  public due = Infinity;
  private previousTap = -Infinity;

  public demo(now: number, fast = false): void {
    this.step = fast ? 'fast-demo' : 'slow-demo';
    this.hits = 0;
    this.due = Infinity;
    this.plan = createRoundPlan(this.plan.id + 1, TUTORIAL.pattern, fast ? TUTORIAL.gameBpm : TUTORIAL.slowBpm, now + TUTORIAL.leadSec);
  }

  public tick(now: number): void {
    if (now < this.plan.end) return;
    if (this.step === 'slow-demo') this.step = 'practice-ready';
    else if (this.step === 'fast-demo') this.step = 'complete';
  }

  public practice(now: number): void {
    this.step = 'practice';
    this.hits = 0;
    this.previousTap = -Infinity;
    this.due = now + TUTORIAL.leadSec;
  }

  public tap(now: number): boolean {
    if (this.step !== 'practice' || !Number.isFinite(now) || now < this.due) return false;
    this.previousTap = now;
    this.hits++;
    const next = TUTORIAL.pattern.hits[this.hits];
    if (next === undefined) {
      this.step = 'practice-done';
      this.due = Infinity;
    } else {
      const previous = TUTORIAL.pattern.hits[this.hits - 1]!;
      this.due = now + (next - previous) * 60 / TUTORIAL.slowBpm;
    }
    return true;
  }

  public practiceBeat(now: number): number {
    if (this.hits === 0) return 0;
    if (this.hits >= TUTORIAL.pattern.hits.length) return 3;
    const last = TUTORIAL.pattern.hits[this.hits - 1]!;
    const next = TUTORIAL.pattern.hits[this.hits]!;
    return Math.min(next, last + Math.floor(Math.max(0, now - this.previousTap) / (60 / TUTORIAL.slowBpm)));
  }
}

const KEY = 'small-acts.tutorial.v1';

export function tutorialComplete(storage: Pick<Storage, 'getItem'> | null = tutorialStorage()): boolean {
  try { return storage?.getItem(KEY) === 'complete'; } catch { return false; }
}

export function completeTutorial(storage: Pick<Storage, 'setItem'> | null = tutorialStorage()): void {
  try { storage?.setItem(KEY, 'complete'); } catch { /* Practice is still complete in this session. */ }
}

function tutorialStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
