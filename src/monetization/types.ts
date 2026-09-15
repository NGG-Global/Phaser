/**
 * Commerce ports. Scenes talk to these types, never to AdMob or RevenueCat.
 * Native SDKs will implement the same contracts; until then the stub keeps the
 * browser and every failed native call on the safe path.
 */

export const PRODUCT = {
  premium: 'premium',
} as const;

export type ProductId = typeof PRODUCT[keyof typeof PRODUCT];

export type RewardedReason = 'unavailable' | 'cancelled' | 'failed';
export type PurchaseReason = 'unavailable' | 'cancelled' | 'failed';
export type RestoreReason = 'unavailable' | 'failed';

export type RewardedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: RewardedReason };

export type PurchaseResult =
  | { readonly ok: true; readonly product: ProductId }
  | { readonly ok: false; readonly product: ProductId; readonly reason: PurchaseReason };

export type RestoreResult =
  | { readonly ok: true; readonly premium: boolean }
  | { readonly ok: false; readonly reason: RestoreReason };

/** AdMob implements this on native; the web stub stays unavailable. Scenes never import the plugin. */
export interface RewardedAds {
  available(): boolean;
  show(): Promise<RewardedResult>;
}

/** What a future RevenueCat / Play Billing adapter implements. */
export interface Billing {
  available(): boolean;
  premium(): boolean;
  purchase(product: ProductId): Promise<PurchaseResult>;
  restore(): Promise<RestoreResult>;
}

/**
 * The surface scenes may call. Availability is a question, never a throw;
 * show/purchase/restore always settle to a result object.
 */
export interface Monetization {
  rewardedAvailable(): boolean;
  showRewarded(): Promise<RewardedResult>;
  purchasesAvailable(): boolean;
  purchase(product: ProductId): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
  premium(): boolean;
}
