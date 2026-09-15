import { AdMob } from '@capacitor-community/admob';

import type { AdMobClient } from './admob';

/**
 * Thin wrapper around the community plugin. Isolated so the adapter and its
 * tests never import native code, and so Vite can leave this chunk unloaded
 * in the browser.
 */
export function nativeAdMobClient(): AdMobClient {
  return {
    initialize: () => AdMob.initialize(),
    trackingAuthorizationStatus: () => AdMob.trackingAuthorizationStatus(),
    requestTrackingAuthorization: () => AdMob.requestTrackingAuthorization(),
    requestConsentInfo: () => AdMob.requestConsentInfo(),
    showConsentForm: () => AdMob.showConsentForm(),
    prepareRewardVideoAd: adId => AdMob.prepareRewardVideoAd({ adId }),
    showRewardVideoAd: () => AdMob.showRewardVideoAd(),
    addListener: (event, listener) => (
      AdMob.addListener as (name: string, fn: (payload?: unknown) => void) => Promise<{ remove: () => Promise<void> }>
    )(event, listener),
  };
}
