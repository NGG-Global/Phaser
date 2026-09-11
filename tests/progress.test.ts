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
    expect(loadProgress(null)).toEqual({ unlocked: 1, best: {} });
    expect(saveProgress({ unlocked: 2, best: {} }, null)).toBe(false);
  });
  it('rebuilds the frontier from cleared levels rather than demoting to level 1', () => {
    // A corrupt `unlocked` used to send the player back to level 1 while their clears
    // sat in `best` — the same information the frontier is derived from.
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":"x","best":{"a":1,"2":"no","3":150}}' })))
      .toEqual({ unlocked: 4, best: { 3: 100 } });
    // Nothing cleared and nothing usable stored still starts at the beginning.
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":-5,"best":{}}' }))).toEqual({ unlocked: 1, best: {} });
  });
  it('bounds a corrupt or tampered frontier so the map cannot be asked to allocate it', () => {
    // MapScene builds one Text per level from this number; 1e15 threw RangeError in
    // build(), and with no reset in the UI the player could not recover.
    const huge = loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":1e15,"best":{}}' }));
    expect(huge.unlocked).toBeLessThanOrEqual(100_000);
    expect(Number.isInteger(huge.unlocked)).toBe(true);
    expect(loadProgress(memoryStorage({ 'small-acts.progress.v1': '{"unlocked":250,"best":{}}' })).unlocked).toBe(250);
  });
  it('writes a version alongside the payload without returning it', () => {
    const storage = memoryStorage();
    saveProgress({ unlocked: 3, best: { 1: 80, 2: 90 } }, storage);
    expect(JSON.parse(storage.getItem('small-acts.progress.v1')!).version).toBe(1);
    // The version is storage detail; callers keep seeing the same shape.
    expect(loadProgress(storage)).toEqual({ unlocked: 3, best: { 1: 80, 2: 90 } });
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
