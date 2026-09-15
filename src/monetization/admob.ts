import { ADMOB } from '@/config/ads';
import type { RewardedAds, RewardedResult } from './types';

/** Plugin event names, inlined so tests never import the native package. */
export const REWARD_EVENTS = {
  loaded: 'onRewardedVideoAdLoaded',
  failedToLoad: 'onRewardedVideoAdFailedToLoad',
  showed: 'onRewardedVideoAdShowed',
  failedToShow: 'onRewardedVideoAdFailedToShow',
  dismissed: 'onRewardedVideoAdDismissed',
  rewarded: 'onRewardedVideoAdReward',
} as const;

export interface ConsentSnapshot {
  readonly canRequestAds: boolean;
  readonly isConsentFormAvailable?: boolean;
}

export interface AdMobClient {
  initialize(): Promise<void>;
  trackingAuthorizationStatus(): Promise<{ readonly status: string }>;
  requestTrackingAuthorization(): Promise<void>;
  requestConsentInfo(): Promise<ConsentSnapshot>;
  showConsentForm(): Promise<ConsentSnapshot>;
  prepareRewardVideoAd(adId: string): Promise<{ readonly adUnitId: string }>;
  showRewardVideoAd(): Promise<{ readonly type: string; readonly amount: number }>;
  addListener(event: string, listener: (payload?: unknown) => void): Promise<{ remove: () => Promise<void> }>;
}

export interface AdMobAds extends RewardedAds {
  /** Consent, SDK init and the first preload. Safe to call more than once. */
  boot(): Promise<void>;
}

interface ShowSession {
  readonly id: number;
  earned: boolean;
  finish: (result: RewardedResult) => void;
}

/**
 * Native rewarded-video adapter. Never draws a banner or interstitial. Hearts
 * are granted by the caller from a single `{ ok: true }` — this class only
 * settles show() once per presentation.
 */
export function createAdMobAds(client: AdMobClient, options: { readonly adUnitId?: string; readonly showLimitMs?: number } = {}): AdMobAds {
  const adUnitId = options.adUnitId ?? ADMOB.rewardedUnitId;
  const showLimitMs = options.showLimitMs ?? 170_000;
  let bootPromise: Promise<void> | null = null;
  let initialized = false;
  let denied = false;
  let loaded = false;
  let preparing: Promise<void> | null = null;
  let showing = false;
  let session: ShowSession | null = null;
  let nextShowId = 1;
  let listening = false;

  async function boot(): Promise<void> {
    bootPromise ??= runBoot();
    await bootPromise;
  }

  async function runBoot(): Promise<void> {
    try {
      if (!initialized) {
        await client.initialize();
        initialized = true;
      }
      const tracking = await client.trackingAuthorizationStatus();
      if (tracking.status === 'notDetermined') {
        await client.requestTrackingAuthorization();
      }
      let consent = await client.requestConsentInfo();
      if (!consent.canRequestAds) {
        try { consent = await client.showConsentForm(); } catch { /* form missing or already answered */ }
      }
      if (!consent.canRequestAds) {
        denied = true;
        return;
      }
      await ensureListeners();
      await prepare();
    } catch {
      denied = true;
    }
  }

  async function ensureListeners(): Promise<void> {
    if (listening) return;
    listening = true;
    await client.addListener(REWARD_EVENTS.rewarded, () => settleShow({ ok: true }));
    await client.addListener(REWARD_EVENTS.dismissed, () => {
      if (session?.earned) {
        settleShow({ ok: true });
        return;
      }
      settleShow({ ok: false, reason: 'cancelled' });
    });
    await client.addListener(REWARD_EVENTS.failedToShow, () => {
      if (session?.earned) return;
      settleShow({ ok: false, reason: 'failed' });
    });
    await client.addListener(REWARD_EVENTS.loaded, () => { loaded = true; });
    await client.addListener(REWARD_EVENTS.failedToLoad, () => { loaded = false; });
  }

  function settleShow(result: RewardedResult): void {
    const current = session;
    if (!current) return;
    if (result.ok) current.earned = true;
    session = null;
    current.finish(result);
  }

  async function prepare(): Promise<void> {
    if (denied || loaded) return;
    preparing ??= (async () => {
      try {
        await client.prepareRewardVideoAd(adUnitId);
        loaded = true;
      } catch {
        loaded = false;
      } finally {
        preparing = null;
      }
    })();
    await preparing;
  }

  function present(): Promise<RewardedResult> {
    return new Promise(resolve => {
      const id = nextShowId++;
      let settled = false;
      const finish = (result: RewardedResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const limit = setTimeout(() => settleShow({ ok: false, reason: 'failed' }), showLimitMs);
      const guarded = (result: RewardedResult): void => {
        clearTimeout(limit);
        finish(result);
      };
      session = { id, earned: false, finish: guarded };
      void client.showRewardVideoAd().then(
        () => {
          if (session?.id !== id) return;
          settleShow({ ok: true });
        },
        () => {
          if (session?.id !== id) return;
          if (session.earned) {
            settleShow({ ok: true });
            return;
          }
          settleShow({ ok: false, reason: 'failed' });
        },
      );
    });
  }

  return {
    boot,

    available(): boolean {
      return !denied;
    },

    async show(): Promise<RewardedResult> {
      if (showing) return { ok: false, reason: 'failed' };
      showing = true;
      try {
        await boot();
        if (denied) return { ok: false, reason: 'unavailable' };
        if (!loaded) await prepare();
        if (!loaded) return { ok: false, reason: 'unavailable' };
        return await present();
      } catch {
        return { ok: false, reason: 'failed' };
      } finally {
        showing = false;
        loaded = false;
        if (!denied) void prepare();
      }
    },
  };
}
