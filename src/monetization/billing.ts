import { PRODUCT } from './types';
import type { Billing, ProductId, PurchaseReason, PurchaseResult, RestoreResult } from './types';

export interface CatalogProduct {
  readonly identifier: string;
  readonly priceString: string;
  /** Opaque store product; passed back to `purchase` so the native SDK can charge it. */
  readonly handle: unknown;
}

export interface StoreTransaction {
  readonly id: string;
  readonly productId: string;
}

export interface CustomerSnapshot {
  readonly transactions: readonly StoreTransaction[];
}

export interface PurchaseReceipt {
  readonly productIdentifier: string;
  readonly transactionId: string;
  readonly customer: CustomerSnapshot;
}

export interface PurchasesClient {
  configure(apiKey: string): Promise<void>;
  getProducts(ids: readonly string[]): Promise<readonly CatalogProduct[]>;
  purchase(product: CatalogProduct): Promise<PurchaseReceipt>;
  restore(): Promise<CustomerSnapshot>;
  customerInfo(): Promise<CustomerSnapshot>;
  listen(listener: (info: CustomerSnapshot) => void): Promise<void>;
}

export interface RevenueCatBilling extends Billing {
  boot(): Promise<void>;
}

const LATE_TXN_MS = 2_000;

export function classifyPurchaseError(error: unknown): PurchaseReason {
  if (typeof error !== 'object' || error === null) return 'failed';
  const rec = error as { code?: unknown; userCancelled?: unknown };
  if (rec.userCancelled === true) return 'cancelled';
  const code = String(rec.code ?? '');
  if (code === '1' || code === 'PURCHASE_CANCELLED_ERROR') return 'cancelled';
  if (code === '20' || code === 'PAYMENT_PENDING_ERROR') return 'pending';
  if (code === '5' || code === 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR') return 'unavailable';
  return 'failed';
}

function transactionsOf(info: CustomerSnapshot, productId: string): readonly StoreTransaction[] {
  return info.transactions.filter(txn => txn.productId === productId && txn.id.length > 0);
}

/**
 * RevenueCat adapter for the consumable heart refill. Restore never fills hearts:
 * those are one-shot purchases, not entitlements.
 */
export function createRevenueCatBilling(
  client: PurchasesClient,
  options: { readonly apiKey: string; readonly productId?: ProductId; readonly lateMs?: number } = { apiKey: '' },
): RevenueCatBilling {
  const productId: ProductId = options.productId ?? PRODUCT.heartRefill;
  const lateMs = options.lateMs ?? LATE_TXN_MS;
  let bootPromise: Promise<void> | null = null;
  let denied = false;
  let catalog: CatalogProduct | null = null;
  let purchasing = false;
  let session: {
    settle: (result: PurchaseResult) => void;
    product: ProductId;
    /** True only after a cancelled sheet, while we wait for a late paid transaction. */
    late: boolean;
    buffered: string | null;
  } | null = null;
  const seen = new Set<string>();

  async function boot(): Promise<void> {
    bootPromise ??= runBoot();
    await bootPromise;
  }

  async function runBoot(): Promise<void> {
    if (options.apiKey.length === 0) {
      denied = true;
      return;
    }
    try {
      await client.configure(options.apiKey);
      await client.listen(onCustomer);
      try { remember(await client.customerInfo()); } catch { /* anonymous users start with no history */ }
      const products = await client.getProducts([productId]);
      catalog = products.find(item => item.identifier === productId) ?? null;
      if (!catalog) denied = true;
    } catch {
      denied = true;
    }
  }

  function remember(info: CustomerSnapshot): string[] {
    const fresh: string[] = [];
    for (const txn of transactionsOf(info, productId)) {
      if (seen.has(txn.id)) continue;
      seen.add(txn.id);
      fresh.push(txn.id);
    }
    return fresh;
  }

  function onCustomer(info: CustomerSnapshot): void {
    const fresh = remember(info);
    const current = session;
    const claimId = fresh[0];
    if (!current || claimId === undefined) return;
    // Pending/failed sheets must not grant from a racing CustomerInfo update.
    // A cancelled Play sheet may still complete after a bank-app hop; only then.
    if (current.late) current.settle({ ok: true, product: current.product, claimId });
    else current.buffered = claimId;
  }

  function claimFrom(receipt: PurchaseReceipt): string | null {
    if (receipt.transactionId.length > 0) {
      seen.add(receipt.transactionId);
      remember(receipt.customer);
      return receipt.transactionId;
    }
    const fresh = remember(receipt.customer);
    return fresh[0] ?? null;
  }

  function present(product: CatalogProduct): Promise<PurchaseResult> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (result: PurchaseResult): void => {
        if (settled) return;
        settled = true;
        session = null;
        resolve(result);
      };
      session = { settle: finish, product: productId, late: false, buffered: null };
      void client.purchase(product).then(
        receipt => {
          const claimId = claimFrom(receipt);
          if (claimId === null) {
            finish({ ok: false, product: productId, reason: 'failed' });
            return;
          }
          finish({ ok: true, product: productId, claimId });
        },
        error => {
          const reason = classifyPurchaseError(error);
          const current = session;
          if (reason !== 'cancelled' || current === null) {
            finish({ ok: false, product: productId, reason });
            return;
          }
          // Bank-app verification backgrounds the Activity; the original call can
          // look cancelled while CustomerInfo then reports the paid transaction.
          current.late = true;
          if (current.buffered !== null) {
            finish({ ok: true, product: current.product, claimId: current.buffered });
            return;
          }
          globalThis.setTimeout(() => {
            finish({ ok: false, product: productId, reason: 'cancelled' });
          }, lateMs);
        },
      );
    });
  }

  return {
    boot,

    available(): boolean {
      return !denied;
    },

    premium: () => false,

    price(product: ProductId): string | null {
      if (product !== productId || !catalog) return null;
      return catalog.priceString.length > 0 ? catalog.priceString : null;
    },

    async purchase(product: ProductId): Promise<PurchaseResult> {
      if (product !== productId) return { ok: false, product, reason: 'unavailable' };
      if (purchasing) return { ok: false, product, reason: 'failed' };
      purchasing = true;
      try {
        await boot();
        if (denied || !catalog) return { ok: false, product, reason: 'unavailable' };
        return await present(catalog);
      } catch {
        return { ok: false, product, reason: 'failed' };
      } finally {
        purchasing = false;
      }
    },

    async restore(): Promise<RestoreResult> {
      try {
        await boot();
        if (denied) return { ok: false, reason: 'unavailable' };
        const info = await client.restore();
        remember(info);
        return { ok: true, premium: false };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
  };
}
