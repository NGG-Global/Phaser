import { levelSpec, starsFor } from './levels';

export interface Progress {
  /** Highest level the player may start; everything below it has been cleared. */
  readonly unlocked: number;
  /** Best mean accuracy per cleared level. */
  readonly best: Readonly<Record<number, number>>;
}
export interface LevelOutcome {
  readonly cleared: boolean;
  readonly stars: 0 | 1 | 2 | 3;
  readonly bestBefore: number | null;
  readonly progress: Progress;
}

const KEY = 'small-acts.progress.v1';
const EMPTY: Progress = Object.freeze({ unlocked: 1, best: Object.freeze({}) });

/** Reads may fail in private windows or blocked storage; the game then simply starts at level 1. */
export function loadProgress(storage: Storage | null = safeStorage()): Progress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const { unlocked, best } = parsed as { unlocked?: unknown; best?: unknown };
    const clean: Record<number, number> = {};
    if (typeof best === 'object' && best !== null) {
      for (const [level, accuracy] of Object.entries(best as Record<string, unknown>)) {
        const n = Number(level);
        if (Number.isInteger(n) && n >= 1 && typeof accuracy === 'number' && Number.isFinite(accuracy)) clean[n] = Math.max(0, Math.min(100, accuracy));
      }
    }
    return { unlocked: Number.isInteger(unlocked) && (unlocked as number) >= 1 ? unlocked as number : 1, best: Object.freeze(clean) };
  } catch { return EMPTY; }
}

export function saveProgress(progress: Progress, storage: Storage | null = safeStorage()): boolean {
  try { storage?.setItem(KEY, JSON.stringify(progress)); return storage !== null; } catch { return false; }
}

/** Applies one finished level. Clearing the highest unlocked level unlocks the next; replays only raise the best. */
export function recordResult(progress: Progress, level: number, accuracy: number): LevelOutcome {
  const spec = levelSpec(level);
  const stars = starsFor(accuracy, spec);
  const cleared = stars > 0;
  const bestBefore = progress.best[level] ?? null;
  const best = { ...progress.best };
  if (cleared && (bestBefore === null || accuracy > bestBefore)) best[level] = accuracy;
  const unlocked = cleared && level >= progress.unlocked ? level + 1 : progress.unlocked;
  return { cleared, stars, bestBefore, progress: { unlocked, best: Object.freeze(best) } };
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
