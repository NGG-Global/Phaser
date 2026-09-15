/**
 * Commerce ports. Scenes talk to these types, never to AdMob or RevenueCat.
 * Native SDKs implement the same contracts; the stub keeps the browser and
 * every failed native call on the safe path.
 */

export const PRODUCT = {
  premium: 'tinytempo_premium',
  heartRefill: 'heart_refill_full',
} as const;

/** RevenueCat entitlement identifiers. Premium is the store product of the same id. */
export const ENTITLEMENT = {
  premium: 'tinytempo_premium',
} as const;

export type ProductId = typeof PRODUCT[keyof typeof PRODUCT];

export type RewardedReason = 'unavailable' | 'cancelled' | 'failed';
export type PurchaseReason = 'unavailable' | 'cancelled' | 'failed' | 'pending';
export type RestoreReason = 'unavailable' | 'failed';

export type RewardedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: RewardedReason };

export type PurchaseResult =
  | { readonly ok: true; readonly product: ProductId; readonly claimId: string }
  | { readonly ok: false; readonly product: ProductId; readonly reason: PurchaseReason };

export type RestoreResult =
  | { readonly ok: true; readonly premium: boolean }
  | { readonly ok: false; readonly reason: RestoreReason };

/** AdMob implements this on native; the web stub stays unavailable. Scenes never import the plugin. */
export interface RewardedAds {
  available(): boolean;
  show(): Promise<RewardedResult>;
}

/** RevenueCat implements this on native. Restore restores Premium; it never fills consumable hearts. */
export interface Billing {
  available(): boolean;
  premium(): boolean;
  /** Localized store price, or null when the catalogue has not loaded. Never a guessed amount. */
  price(product: ProductId): string | null;
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
  productPrice(product: ProductId): string | null;
  purchase(product: ProductId): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
  premium(): boolean;
}
