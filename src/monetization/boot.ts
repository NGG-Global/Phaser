import { Capacitor } from '@capacitor/core';

import { createAdMobAds } from './admob';
import { createMonetization, installMonetization } from './service';

/**
 * Native-only: consent, one AdMob initialize, and a preloaded rewarded video.
 * The browser keeps the stub installed at module load, so Vite/dev is unchanged.
 */
export async function bootMonetization(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { nativeAdMobClient } = await import('./native');
    const ads = createAdMobAds(nativeAdMobClient());
    installMonetization(createMonetization({ ads }));
    await ads.boot();
  } catch {
    // Stub stays. A missing plugin or a failed UMP must not take the game down.
  }
}
