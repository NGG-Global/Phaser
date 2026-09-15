/**
 * Google's official test units. Production app and ad unit IDs must not land
 * here while the adapter is still being developed — a live unit in a debug APK
 * is invalid traffic.
 *
 * @see https://developers.google.com/admob/android/test-ads
 */
export const ADMOB = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  rewardedUnitId: 'ca-app-pub-3940256099942544/5224354917',
} as const;
