import { describe, expect, it, vi } from 'vitest';
import { levelSpec, starsFor } from '../src/game/levels';
import type { Progress } from '../src/game/progress';
import {
  HEALTH, abandonAttempt, attemptCostsHeart, beginAttempt, canBeginAttempt, claimFill, claimHeart,
  clearHealth, fillHearts, finishAttempt, formatCountdown, grantHeart, healthHud, isMastered,
  isProtectedLevel, loadHealth, practiceLevel, reconcile, saveHealth, viewHealth, type Health,
} from '../src/game/health';

vi.mock('phaser', () => ({ default: {} }));

const T0 = 1_700_000_000_000;
const EMPTY: Progress = { unlocked: 1, best: {} };
const ROAD: Progress = { unlocked: 20, best: {} };

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

function full(over: Partial<Health> = {}): Health {
  return {
    hearts: over.hearts ?? HEALTH.max,
    refillStartedAt: over.refillStartedAt === undefined ? null : over.refillStartedAt,
    spentAttempt: over.spentAttempt === undefined ? null : over.spentAttempt,
  };
}

function threeStar(level: number): number {
  return levelSpec(level).starAccuracy[2];
}

function twoStar(level: number): number {
  return levelSpec(level).starAccuracy[1];
}

describe('health persistence', () => {
  it('starts at full health with nothing stored, corrupt storage, or no storage', () => {
    expect(loadHealth(memoryStorage(), T0)).toEqual(full());
    expect(loadHealth(memoryStorage({ 'tiny-tempo.health.v1': '{not json' }), T0)).toEqual(full());
    expect(loadHealth(null, T0)).toEqual(full());
    expect(saveHealth(full(), null)).toBe(false);
  });

  it('writes a version alongside the payload without returning it', () => {
    const storage = memoryStorage();
    const spent = full({ hearts: 4, refillStartedAt: T0, spentAttempt: 'a' });
    expect(saveHealth(spent, storage)).toBe(true);
    expect(JSON.parse(storage.getItem('tiny-tempo.health.v1')!)).toEqual({
      version: 1, hearts: 4, refillStartedAt: T0, spentAttempt: 'a',
    });
    expect(loadHealth(storage, T0)).toEqual(spent);
  });

  it('rejects corrupt fields rather than trusting them', () => {
    expect(loadHealth(memoryStorage({ 'tiny-tempo.health.v1': '{"hearts":"x"}' }), T0)).toEqual(full());
    expect(loadHealth(memoryStorage({ 'tiny-tempo.health.v1': '[1,2]' }), T0)).toEqual(full());
    expect(loadHealth(memoryStorage({ 'tiny-tempo.health.v1': '{"hearts":3.5}' }), T0)).toEqual(full());
    expect(loadHealth(memoryStorage({ 'tiny-tempo.health.v1': '{"hearts":9}' }), T0).hearts).toBe(HEALTH.max);
    expect(loadHealth(memoryStorage({ 'tiny-tempo.health.v1': '{"hearts":-2}' }), T0).hearts).toBe(0);
    const future = loadHealth(memoryStorage({
      'tiny-tempo.health.v1': JSON.stringify({ hearts: 3, refillStartedAt: T0 + 60_000, spentAttempt: 12 }),
    }), T0);
    expect(future.hearts).toBe(3);
    expect(future.refillStartedAt).toBe(T0);
    expect(future.spentAttempt).toBeNull();
  });

  it('reports whether a write landed and survives a round trip', () => {
    const storage = memoryStorage();
    const health = full({ hearts: 2, refillStartedAt: T0, spentAttempt: 'run' });
    expect(saveHealth(health, storage)).toBe(true);
    expect(loadHealth(storage, T0)).toEqual(health);
    const blocked = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(saveHealth(health, blocked)).toBe(false);
    expect(clearHealth(storage)).toBe(true);
    expect(loadHealth(storage, T0)).toEqual(full());
    expect(clearHealth(null)).toBe(false);
  });
});

describe('spending and refunding', () => {
  it('spends one heart when a normal challenge actually begins', () => {
    const begun = beginAttempt(full(), ROAD, 6, 'a', T0);
    expect(begun.ok).toBe(true);
    expect(begun.spent).toBe(true);
    expect(begun.health.hearts).toBe(4);
    expect(begun.health.spentAttempt).toBe('a');
    expect(begun.health.refillStartedAt).toBe(T0);
  });

  it('refunds that heart only on a 3-star finish', () => {
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const kept = finishAttempt(spent, 'a', 3, T0);
    expect(kept.refunded).toBe(true);
    expect(kept.health.hearts).toBe(HEALTH.max);
    expect(kept.health.spentAttempt).toBeNull();
    expect(kept.health.refillStartedAt).toBeNull();

    const miss = finishAttempt(spent, 'a', 0, T0);
    expect(miss.refunded).toBe(false);
    expect(miss.health.hearts).toBe(4);
    expect(miss.health.spentAttempt).toBeNull();

    const two = finishAttempt(spent, 'a', 2, T0);
    expect(two.refunded).toBe(false);
    expect(two.health.hearts).toBe(4);
  });

  it('does not spend on initialization that never begins an attempt', () => {
    expect(full().hearts).toBe(HEALTH.max);
    expect(loadHealth(memoryStorage(), T0).hearts).toBe(HEALTH.max);
  });
});

describe('protected levels and mastered replay', () => {
  it('treats levels 1–5 as free even with no stars', () => {
    for (let level = 1; level <= 5; level++) {
      expect(isProtectedLevel(level)).toBe(true);
      expect(attemptCostsHeart(EMPTY, level)).toBe(false);
      const begun = beginAttempt(full({ hearts: 0 }), EMPTY, level, 'free', T0);
      expect(begun.ok).toBe(true);
      expect(begun.spent).toBe(false);
      expect(begun.health.hearts).toBe(0);
    }
    expect(isProtectedLevel(6)).toBe(false);
    expect(attemptCostsHeart(ROAD, 6)).toBe(true);
  });

  it('lets a previously 3-starred level replay for free', () => {
    const mastered: Progress = { unlocked: 10, best: { 6: threeStar(6) } };
    expect(starsFor(threeStar(6), levelSpec(6))).toBe(3);
    expect(isMastered(mastered, 6)).toBe(true);
    expect(attemptCostsHeart(mastered, 6)).toBe(false);
    const begun = beginAttempt(full({ hearts: 0 }), mastered, 6, 'replay', T0);
    expect(begun.ok).toBe(true);
    expect(begun.spent).toBe(false);
    expect(begun.health.hearts).toBe(0);
    expect(practiceLevel(mastered)).toBe(6);
  });

  it('still charges a 1- or 2-star replay', () => {
    const cleared: Progress = { unlocked: 10, best: { 6: twoStar(6) } };
    expect(starsFor(twoStar(6), levelSpec(6))).toBe(2);
    expect(isMastered(cleared, 6)).toBe(false);
    expect(attemptCostsHeart(cleared, 6)).toBe(true);
    expect(beginAttempt(full({ hearts: 1 }), cleared, 6, 'a', T0).health.hearts).toBe(0);
  });

  it('does not refund a free 3-star run', () => {
    const begun = beginAttempt(full(), EMPTY, 1, 'free', T0);
    expect(begun.spent).toBe(false);
    const finished = finishAttempt(begun.health, 'free', 3, T0);
    expect(finished.refunded).toBe(false);
    expect(finished.health.hearts).toBe(HEALTH.max);
  });
});

describe('regeneration', () => {
  it('returns one heart every 20 minutes from the original stamp', () => {
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    expect(reconcile(spent, T0 + HEALTH.regenMs - 1).hearts).toBe(4);
    expect(reconcile(spent, T0 + HEALTH.regenMs).hearts).toBe(HEALTH.max);
    expect(reconcile(spent, T0 + HEALTH.regenMs).refillStartedAt).toBeNull();
  });

  it('keeps the refill clock when a 3-star refund does not reach max', () => {
    const low = full({ hearts: 2, refillStartedAt: T0 });
    const spent = beginAttempt(low, ROAD, 6, 'a', T0 + 1_000).health;
    expect(spent.hearts).toBe(1);
    expect(spent.refillStartedAt).toBe(T0);
    const kept = finishAttempt(spent, 'a', 3, T0 + 1_000);
    expect(kept.refunded).toBe(true);
    expect(kept.health.hearts).toBe(2);
    expect(kept.health.refillStartedAt).toBe(T0);
  });

  it('spending another heart does not restart the existing refill timer', () => {
    const first = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const second = beginAttempt(first, ROAD, 7, 'b', T0 + 60_000).health;
    expect(second.hearts).toBe(3);
    expect(second.refillStartedAt).toBe(T0);
    const later = reconcile(second, T0 + HEALTH.regenMs);
    expect(later.hearts).toBe(4);
    expect(later.refillStartedAt).toBe(T0 + HEALTH.regenMs);
  });

  it('reconciles several elapsed intervals after closing and reopening', () => {
    const storage = memoryStorage();
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const twice = beginAttempt(spent, ROAD, 7, 'b', T0).health;
    const thrice = beginAttempt(twice, ROAD, 8, 'c', T0).health;
    expect(thrice.hearts).toBe(2);
    saveHealth(thrice, storage);
    const reopened = loadHealth(storage, T0 + HEALTH.regenMs * 2 + 1_000);
    expect(reopened.hearts).toBe(4);
    expect(reopened.refillStartedAt).toBe(T0 + HEALTH.regenMs * 2);
    expect(viewHealth(reopened, T0 + HEALTH.regenMs * 2 + 1_000).nextHeartInMs).toBe(HEALTH.regenMs - 1_000);
  });

  it('fills back to max across a long gap and then stops the clock', () => {
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const rested = loadHealth((() => {
      const storage = memoryStorage();
      saveHealth(spent, storage);
      return storage;
    })(), T0 + HEALTH.regenMs * 10);
    expect(rested.hearts).toBe(HEALTH.max);
    expect(rested.refillStartedAt).toBeNull();
    expect(viewHealth(rested, T0 + HEALTH.regenMs * 10).nextHeartInMs).toBeNull();
  });
});

describe('countdown display', () => {
  it('derives the remaining time without rewriting the stamp', () => {
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const later = T0 + 90_000;
    const view = viewHealth(spent, later);
    expect(spent.refillStartedAt).toBe(T0);
    expect(view.nextHeartInMs).toBe(HEALTH.regenMs - 90_000);
    expect(viewHealth(spent, later + 1_000).nextHeartInMs).toBe(HEALTH.regenMs - 91_000);
    expect(healthHud(viewHealth(spent, later))).toEqual({ count: '4/5', wait: '18:30' });
    expect(healthHud(viewHealth(full(), later))).toEqual({ count: '5/5', wait: null });
    expect(healthHud(viewHealth(spent, later), { premium: true })).toEqual({ count: '∞', wait: null });
  });

  it('formats a countdown as m:ss', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(1)).toBe('0:01');
    expect(formatCountdown(61_000)).toBe('1:01');
    expect(formatCountdown(HEALTH.regenMs)).toBe('20:00');
  });
});

describe('duplicate calls', () => {
  it('spends only once for the same attempt id', () => {
    const first = beginAttempt(full(), ROAD, 6, 'a', T0);
    const again = beginAttempt(first.health, ROAD, 6, 'a', T0 + 5_000);
    expect(again.ok).toBe(true);
    expect(again.spent).toBe(true);
    expect(again.health.hearts).toBe(4);
    expect(again.health.refillStartedAt).toBe(T0);
  });

  it('refunds only once for the same attempt id', () => {
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const first = finishAttempt(spent, 'a', 3, T0);
    const again = finishAttempt(first.health, 'a', 3, T0);
    expect(first.refunded).toBe(true);
    expect(again.refunded).toBe(false);
    expect(again.health.hearts).toBe(HEALTH.max);
  });
});

describe('abandoned attempts', () => {
  it('does not refund a heart when the attempt is abandoned', () => {
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const left = abandonAttempt(spent, 'a', T0);
    expect(left.hearts).toBe(4);
    expect(left.spentAttempt).toBeNull();
    expect(finishAttempt(left, 'a', 3, T0).refunded).toBe(false);
    expect(finishAttempt(spent, 'a', 3, T0).refunded).toBe(true);
  });

  it('lets a later attempt spend another heart without restoring the abandoned one', () => {
    const spent = beginAttempt(full(), ROAD, 6, 'a', T0).health;
    const next = beginAttempt(spent, ROAD, 7, 'b', T0);
    expect(next.health.hearts).toBe(3);
    expect(finishAttempt(next.health, 'a', 3, T0).refunded).toBe(false);
    expect(finishAttempt(next.health, 'b', 3, T0).refunded).toBe(true);
    expect(abandonAttempt(spent, 'other', T0).spentAttempt).toBe('a');
  });
});

describe('zero-health gating', () => {
  it('blocks a normal unmastered level at zero hearts and allows protected or mastered ones', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0 });
    expect(canBeginAttempt(empty, ROAD, 6, T0)).toBe(false);
    expect(beginAttempt(empty, ROAD, 6, 'a', T0).ok).toBe(false);
    expect(canBeginAttempt(empty, ROAD, 1, T0)).toBe(true);
    const mastered: Progress = { unlocked: 12, best: { 8: 100 } };
    expect(isMastered(mastered, 8)).toBe(true);
    expect(canBeginAttempt(empty, mastered, 8, T0)).toBe(true);
    expect(practiceLevel(mastered)).toBe(8);
    expect(practiceLevel(EMPTY)).toBeNull();
  });

  it('does not gate or consume hearts for Premium', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0, spentAttempt: null });
    expect(canBeginAttempt(empty, ROAD, 6, T0, true)).toBe(true);
    const begun = beginAttempt(empty, ROAD, 6, 'premium-run', T0, true);
    expect(begun.ok).toBe(true);
    expect(begun.spent).toBe(false);
    expect(begun.health.hearts).toBe(0);
    expect(begun.health.spentAttempt).toBeNull();
    const finished = finishAttempt(begun.health, 'premium-run', 1, T0);
    expect(finished.refunded).toBe(false);
    expect(finished.health.hearts).toBe(0);
  });

  it('lets regen reopen a gated level without a new spend stamp', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0 });
    expect(canBeginAttempt(empty, ROAD, 6, T0 + HEALTH.regenMs - 1)).toBe(false);
    expect(canBeginAttempt(empty, ROAD, 6, T0 + HEALTH.regenMs)).toBe(true);
    const begun = beginAttempt(empty, ROAD, 6, 'a', T0 + HEALTH.regenMs);
    expect(begun.ok).toBe(true);
    expect(begun.health.hearts).toBe(0);
    expect(begun.health.refillStartedAt).toBe(T0 + HEALTH.regenMs);
  });
});

describe('rewarded heart grants', () => {
  it('adds exactly one heart and never exceeds the maximum', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0 });
    const one = grantHeart(empty, T0);
    expect(one.granted).toBe(true);
    expect(one.health.hearts).toBe(1);
    expect(one.health.refillStartedAt).toBe(T0);

    const almost = grantHeart(full({ hearts: HEALTH.max - 1, refillStartedAt: T0 }), T0);
    expect(almost.granted).toBe(true);
    expect(almost.health.hearts).toBe(HEALTH.max);
    expect(almost.health.refillStartedAt).toBeNull();

    const fullBar = grantHeart(full(), T0);
    expect(fullBar.granted).toBe(false);
    expect(fullBar.health.hearts).toBe(HEALTH.max);
  });

  it('grants only once for the same claim id even when both callbacks fire', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0 });
    const first = claimHeart(empty, 'ad-1', T0);
    const again = claimHeart(first.health, 'ad-1', T0);
    expect(first.granted).toBe(true);
    expect(first.health.hearts).toBe(1);
    expect(again.granted).toBe(false);
    expect(again.health.hearts).toBe(1);
  });

  it('lets a later rewarded ad grant another heart up to the cap', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0 });
    const first = claimHeart(empty, 'ad-a', T0);
    const second = claimHeart(first.health, 'ad-b', T0);
    expect(second.granted).toBe(true);
    expect(second.health.hearts).toBe(2);
  });
});

describe('full heart refill', () => {
  it('restores the bar to the maximum and clears the regen clock', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0, spentAttempt: 'run' });
    const filled = fillHearts(empty, T0);
    expect(filled.granted).toBe(true);
    expect(filled.health.hearts).toBe(HEALTH.max);
    expect(filled.health.refillStartedAt).toBeNull();
    expect(filled.health.spentAttempt).toBe('run');
    expect(fillHearts(full(), T0).granted).toBe(false);
  });

  it('fills only once for the same purchase claim id', () => {
    const empty = full({ hearts: 1, refillStartedAt: T0 });
    const first = claimFill(empty, 'txn-1', T0);
    const again = claimFill(first.health, 'txn-1', T0);
    expect(first.granted).toBe(true);
    expect(first.health.hearts).toBe(HEALTH.max);
    expect(again.granted).toBe(false);
    expect(again.health.hearts).toBe(HEALTH.max);
  });

  it('lets a later purchase refill after hearts are spent again', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0 });
    const first = claimFill(empty, 'txn-a', T0);
    const spent = beginAttempt(first.health, ROAD, 6, 'run', T0).health;
    expect(spent.hearts).toBe(HEALTH.max - 1);
    const second = claimFill(spent, 'txn-b', T0);
    expect(second.granted).toBe(true);
    expect(second.health.hearts).toBe(HEALTH.max);
  });

  it('ignores an empty claim id', () => {
    const empty = full({ hearts: 0, refillStartedAt: T0 });
    expect(claimFill(empty, '', T0).granted).toBe(false);
    expect(claimFill(empty, '', T0).health.hearts).toBe(0);
  });
});
