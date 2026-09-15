import { Capacitor } from '@capacitor/core';

import { REVENUECAT } from '@/config/billing';
import { createAdMobAds } from './admob';
import { createRevenueCatBilling } from './billing';
import { createMonetization, installMonetization } from './service';
import { stubAds, stubBilling } from './stub';
import type { Billing, RewardedAds } from './types';

/**
 * Native-only: AdMob consent/preload and RevenueCat catalogue. The browser keeps
 * the stub installed at module load, so Vite/dev is unchanged.
 */
export async function bootMonetization(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    let ads: RewardedAds = stubAds;
    let billing: Billing = stubBilling;
    try {
      const { nativeAdMobClient } = await import('./native');
      const adapter = createAdMobAds(nativeAdMobClient());
      ads = adapter;
      await adapter.boot();
    } catch { /* ads stay stub */ }
    try {
      const { nativePurchasesClient } = await import('./purchases');
      const adapter = createRevenueCatBilling(nativePurchasesClient(), { apiKey: REVENUECAT.googleApiKey });
      billing = adapter;
      await adapter.boot();
    } catch { /* billing stays stub */ }
    installMonetization(createMonetization({ ads, billing }));
  } catch {
    // Stub stays. A missing plugin must not take the game down.
  }
}
