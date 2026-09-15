import { describe, expect, it, vi } from 'vitest';
import { PRODUCT, classifyPurchaseError, createMonetization, createRevenueCatBilling } from '../src/monetization';
import { claimFill, type Health } from '../src/game/health';
import type { CatalogProduct, CustomerSnapshot, PurchasesClient, PurchaseReceipt } from '../src/monetization';

vi.mock('phaser', () => ({ default: {} }));

const PRICE = '€2.49';
const PRODUCT_ID = PRODUCT.heartRefill;
const ITEM: CatalogProduct = { identifier: PRODUCT_ID, priceString: PRICE, handle: { id: PRODUCT_ID } };

function receipt(id: string, extra: StoreTxn[] = []): PurchaseReceipt {
  return {
    productIdentifier: PRODUCT_ID,
    transactionId: id,
    customer: { transactions: [{ id, productId: PRODUCT_ID }, ...extra] },
  };
}

type StoreTxn = { id: string; productId: string };

interface FakeOptions {
  readonly products?: readonly CatalogProduct[];
  readonly history?: CustomerSnapshot;
  readonly purchase?: 'ok' | 'cancel' | 'fail' | 'pending' | 'ok-twice' | 'cancel-then-info' | 'pending-then-info' | 'empty-txn' | 'slow';
  readonly restore?: 'ok' | 'fail';
}

function fakeClient(options: FakeOptions = {}): PurchasesClient & {
  readonly configures: number;
  emit(info: CustomerSnapshot): void;
} {
  const listeners: ((info: CustomerSnapshot) => void)[] = [];
  let configures = 0;
  const client: PurchasesClient & { configures: number; emit: (info: CustomerSnapshot) => void } = {
    get configures() { return configures; },
    emit(info) { for (const listener of listeners) listener(info); },
    async configure() { configures += 1; },
    async getProducts() { return options.products ?? [ITEM]; },
    async customerInfo() { return options.history ?? { transactions: [] }; },
    async listen(listener) { listeners.push(listener); },
    async purchase() {
      const mode = options.purchase ?? 'ok';
      if (mode === 'fail') throw { code: '2', userCancelled: false };
      if (mode === 'pending') throw { code: '20', userCancelled: false };
      if (mode === 'cancel') throw { code: '1', userCancelled: true };
      if (mode === 'slow') {
        await new Promise(resolve => { globalThis.setTimeout(resolve, 40); });
        return receipt('txn-slow');
      }
      if (mode === 'empty-txn') {
        return { productIdentifier: PRODUCT_ID, transactionId: '', customer: { transactions: [] } };
      }
      if (mode === 'cancel-then-info') {
        queueMicrotask(() => client.emit({ transactions: [{ id: 'late-txn', productId: PRODUCT_ID }] }));
        throw { code: '1', userCancelled: true };
      }
      if (mode === 'pending-then-info') {
        queueMicrotask(() => client.emit({ transactions: [{ id: 'pending-txn', productId: PRODUCT_ID }] }));
        throw { code: '20', userCancelled: false };
      }
      if (mode === 'ok-twice') {
        const paid = receipt('dup-txn');
        queueMicrotask(() => client.emit(paid.customer));
        return paid;
      }
      return receipt('txn-1');
    },
    async restore() {
      if (options.restore === 'fail') throw new Error('restore failed');
      return options.history ?? { transactions: [{ id: 'old', productId: PRODUCT_ID }] };
    },
  };
  return client;
}

function emptyHealth(): Health {
  return { hearts: 0, refillStartedAt: 1_700_000_000_000, spentAttempt: null };
}

describe('classifyPurchaseError', () => {
  it('maps RevenueCat codes onto cancel, pending and failure', () => {
    expect(classifyPurchaseError({ userCancelled: true, code: '2' })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '1' })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '20' })).toBe('pending');
    expect(classifyPurchaseError({ code: '5' })).toBe('unavailable');
    expect(classifyPurchaseError({ code: '2' })).toBe('failed');
    expect(classifyPurchaseError('boom')).toBe('failed');
  });
});

describe('RevenueCat heart refill', () => {
  it('exposes the localized store price and never a guessed amount', async () => {
    const billing = createRevenueCatBilling(fakeClient(), { apiKey: 'goog_test', lateMs: 5 });
    await billing.boot();
    expect(billing.available()).toBe(true);
    expect(billing.price(PRODUCT.heartRefill)).toBe(PRICE);
    expect(billing.price(PRODUCT.premium)).toBeNull();
  });

  it('stays unavailable without an API key or a catalogue product', async () => {
    const missingKey = createRevenueCatBilling(fakeClient(), { apiKey: '', lateMs: 5 });
    await missingKey.boot();
    expect(missingKey.available()).toBe(false);
    await expect(missingKey.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'unavailable',
    });

    const missingProduct = createRevenueCatBilling(fakeClient({ products: [] }), { apiKey: 'goog_test', lateMs: 5 });
    await missingProduct.boot();
    expect(missingProduct.available()).toBe(false);
    expect(missingProduct.price(PRODUCT.heartRefill)).toBeNull();
  });

  it('returns a claim id on success so a caller can fill once', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'ok-twice' }), { apiKey: 'goog_test', lateMs: 5 });
    const result = await billing.purchase(PRODUCT.heartRefill);
    expect(result).toEqual({ ok: true, product: PRODUCT.heartRefill, claimId: 'dup-txn' });
    const first = claimFill(emptyHealth(), result.ok ? result.claimId : '', 1_700_000_000_000);
    const again = claimFill(first.health, result.ok ? result.claimId : '', 1_700_000_000_000);
    expect(first.granted).toBe(true);
    expect(first.health.hearts).toBe(5);
    expect(again.granted).toBe(false);
  });

  it('does not fill hearts when the player cancels', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'cancel' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'cancelled',
    });
    expect(emptyHealth().hearts).toBe(0);
  });

  it('does not fill hearts when the store reports a pending payment', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'pending' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'pending',
    });
  });

  it('does not fill from a CustomerInfo update that races a pending sheet', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'pending-then-info' }), { apiKey: 'goog_test', lateMs: 30 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'pending',
    });
    expect(emptyHealth().hearts).toBe(0);
  });

  it('does not fill hearts when the store fails', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'fail' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'failed',
    });
  });

  it('treats a cancelled sheet that later reports a paid transaction as success', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'cancel-then-info' }), { apiKey: 'goog_test', lateMs: 30 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: true, product: PRODUCT.heartRefill, claimId: 'late-txn',
    });
  });

  it('does not restore consumable refills as a permanent purchase', async () => {
    const billing = createRevenueCatBilling(fakeClient({
      history: { transactions: [{ id: 'old-fill', productId: PRODUCT_ID }] },
    }), { apiKey: 'goog_test', lateMs: 5 });
    await billing.boot();
    await expect(billing.restore()).resolves.toEqual({ ok: true, premium: false });
    expect(billing.premium()).toBe(false);
    expect(emptyHealth().hearts).toBe(0);
  });

  it('configures once', async () => {
    const client = fakeClient();
    const billing = createRevenueCatBilling(client, { apiKey: 'goog_test', lateMs: 5 });
    await billing.boot();
    await billing.boot();
    expect(client.configures).toBe(1);
  });

  it('rejects a second purchase while one is already in flight', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'slow' }), { apiKey: 'goog_test', lateMs: 5 });
    const first = billing.purchase(PRODUCT.heartRefill);
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'failed',
    });
    await expect(first).resolves.toEqual({ ok: true, product: PRODUCT.heartRefill, claimId: 'txn-slow' });
  });

  it('does not grant when the store omits a transaction id', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'empty-txn' }), { apiKey: 'goog_test', lateMs: 5 });
    await expect(billing.purchase(PRODUCT.heartRefill)).resolves.toEqual({
      ok: false, product: PRODUCT.heartRefill, reason: 'failed',
    });
  });
});

describe('heart refill through the facade', () => {
  it('records success and still requires a claim id to fill', async () => {
    const billing = createRevenueCatBilling(fakeClient({ purchase: 'ok' }), { apiKey: 'goog_test', lateMs: 5 });
    const commerce = createMonetization({ billing });
    expect(commerce.productPrice(PRODUCT.heartRefill)).toBeNull();
    await billing.boot();
    expect(commerce.productPrice(PRODUCT.heartRefill)).toBe(PRICE);
    const result = await commerce.purchase(PRODUCT.heartRefill);
    expect(result).toEqual({ ok: true, product: PRODUCT.heartRefill, claimId: 'txn-1' });
  });
});
