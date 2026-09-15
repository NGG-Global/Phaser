import { track } from './analytics';
import { stubAds, stubBilling } from './stub';
import type {
  Billing, Monetization, ProductId, PurchaseResult, RestoreResult, RewardedAds, RewardedResult,
} from './types';

/** Native SDKs can hang a WebView; better to fail the offer than freeze the map. */
const DEFAULT_TIMEOUT_MS = 45_000;

export interface MonetizationOptions {
  readonly ads?: RewardedAds;
  readonly billing?: Billing;
  readonly timeoutMs?: number;
}

function asBoolean(read: () => boolean): boolean {
  try { return read() === true; } catch { return false; }
}

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), ms);
    work.then(value => { clearTimeout(timer); finish(value); }, () => { clearTimeout(timer); finish(fallback); });
  });
}

/**
 * Wraps ads and billing so a thrown SDK, a hang, or a missing plugin becomes a
 * result object. Provider modules stay out of scenes; this is the only file
 * they should grow into later.
 */
export function createMonetization(options: MonetizationOptions = {}): Monetization {
  const ads = options.ads ?? stubAds;
  const billing = options.billing ?? stubBilling;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    rewardedAvailable: () => asBoolean(() => ads.available()),

    async showRewarded(): Promise<RewardedResult> {
      if (!asBoolean(() => ads.available())) {
        track('rewarded_failed', { reason: 'unavailable' });
        return { ok: false, reason: 'unavailable' };
      }
      track('rewarded_started', {});
      try {
        const result = await withTimeout(
          Promise.resolve().then(() => ads.show()),
          timeoutMs,
          { ok: false, reason: 'failed' } satisfies RewardedResult,
        );
        if (result.ok) track('rewarded_completed', {});
        else track('rewarded_failed', { reason: result.reason });
        return result;
      } catch {
        track('rewarded_failed', { reason: 'failed' });
        return { ok: false, reason: 'failed' };
      }
    },

    purchasesAvailable: () => asBoolean(() => billing.available()),

    premium: () => asBoolean(() => billing.premium()),

    async purchase(product: ProductId): Promise<PurchaseResult> {
      track('purchase_started', { product });
      if (!asBoolean(() => billing.available())) {
        track('purchase_failed', { product, reason: 'unavailable' });
        return { ok: false, product, reason: 'unavailable' };
      }
      try {
        const fallback: PurchaseResult = { ok: false, product, reason: 'failed' };
        const result = await withTimeout(Promise.resolve().then(() => billing.purchase(product)), timeoutMs, fallback);
        if (result.ok) track('purchase_completed', { product: result.product });
        else if (result.reason === 'cancelled') track('purchase_cancelled', { product });
        else track('purchase_failed', { product, reason: result.reason });
        return result;
      } catch {
        track('purchase_failed', { product, reason: 'failed' });
        return { ok: false, product, reason: 'failed' };
      }
    },

    async restorePurchases(): Promise<RestoreResult> {
      try {
        return await withTimeout(
          Promise.resolve().then(() => billing.restore()),
          timeoutMs,
          { ok: false, reason: 'failed' } satisfies RestoreResult,
        );
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
  };
}

let current: Monetization = createMonetization();

/** Game-wide commerce. Always the stub until a native adapter is installed at boot. */
export function monetization(): Monetization {
  return current;
}

/** Tests and the eventual native boot path. Pass `createMonetization()` to restore the stub. */
export function installMonetization(next: Monetization): Monetization {
  const previous = current;
  current = next;
  return previous;
}
