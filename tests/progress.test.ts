import { describe, expect, it, vi } from 'vitest';
import { loadProgress, recordResult, saveProgress } from '../src/game/progress';

vi.mock('phaser', () => ({ default: {} }));

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); }, clear: () => map.clear(), key: () => null, length: 0 } as Storage;
}

describe('progress', () => {
  it('starts at level 1 with nothing stored, corrupt storage, or no storage', () => {
    expect(loadProgress(memoryStorage())).toEqual({ unlocked: 1, best: {} });
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{not json' }))).toEqual({ unlocked: 1, best: {} });
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":"x","best":{"a":1,"2":"no","3":150}}' }))).toEqual({ unlocked: 1, best: { 3: 100 } });
    expect(loadProgress(null)).toEqual({ unlocked: 1, best: {} });
    expect(saveProgress({ unlocked: 2, best: {} }, null)).toBe(false);
  });
  it('unlocks the next level only when the frontier is cleared and keeps the best accuracy', () => {
    let progress = loadProgress(memoryStorage());
    let outcome = recordResult(progress, 1, 39);
    expect(outcome.cleared).toBe(false); expect(outcome.stars).toBe(0); expect(outcome.progress.unlocked).toBe(1);
    outcome = recordResult(progress, 1, 65);
    expect(outcome.cleared).toBe(true); expect(outcome.stars).toBe(2); expect(outcome.progress.unlocked).toBe(2); expect(outcome.progress.best[1]).toBe(65);
    progress = outcome.progress;
    outcome = recordResult(progress, 1, 50); // replaying an old level never lowers the best or moves the frontier
    expect(outcome.progress.best[1]).toBe(65); expect(outcome.progress.unlocked).toBe(2); expect(outcome.bestBefore).toBe(65);
    outcome = recordResult(progress, 1, 90);
    expect(outcome.progress.best[1]).toBe(90); expect(outcome.stars).toBe(3);
    const storage = memoryStorage();
    expect(saveProgress(outcome.progress, storage)).toBe(true);
    expect(loadProgress(storage)).toEqual(outcome.progress);
  });
});
