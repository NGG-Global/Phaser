import type { Billing, ProductId, PurchaseResult, RestoreResult, RewardedAds, RewardedResult } from './types';

/**
 * Web and development stand-ins. Ads and purchases are unavailable, restore is
 * a successful no-op, and nothing throws — so a browser session and a native
 * build with no SDKs yet both keep playing.
 */
export const stubAds: RewardedAds = {
  available: () => false,
  show: async (): Promise<RewardedResult> => ({ ok: false, reason: 'unavailable' }),
};

export const stubBilling: Billing = {
  available: () => false,
  premium: () => false,
  price: () => null,
  purchase: async (product: ProductId): Promise<PurchaseResult> => ({ ok: false, product, reason: 'unavailable' }),
  restore: async (): Promise<RestoreResult> => ({ ok: true, premium: false }),
};
