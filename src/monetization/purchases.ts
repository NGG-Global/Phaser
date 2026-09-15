import { PRODUCT_CATEGORY, Purchases } from '@revenuecat/purchases-capacitor';
import type { CustomerInfo, PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';

import type { CatalogProduct, CustomerSnapshot, PurchasesClient } from './billing';

function snapshot(info: CustomerInfo): CustomerSnapshot {
  return {
    transactions: info.nonSubscriptionTransactions.map(txn => ({
      id: txn.transactionIdentifier,
      productId: txn.productIdentifier,
    })),
  };
}

function catalogOf(product: PurchasesStoreProduct): CatalogProduct {
  return { identifier: product.identifier, priceString: product.priceString, handle: product };
}

/**
 * Thin wrapper around the official RevenueCat Capacitor plugin. Isolated so the
 * adapter tests never import native code, and so Vite leaves this chunk unloaded
 * in the browser.
 */
export function nativePurchasesClient(): PurchasesClient {
  return {
    configure: apiKey => Purchases.configure({ apiKey }),
    async getProducts(ids) {
      const { products } = await Purchases.getProducts({
        productIdentifiers: [...ids],
        type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
      });
      return products.map(catalogOf);
    },
    async purchase(product) {
      const result = await Purchases.purchaseStoreProduct({ product: product.handle as PurchasesStoreProduct });
      return {
        productIdentifier: result.productIdentifier,
        transactionId: result.transaction?.transactionIdentifier ?? '',
        customer: snapshot(result.customerInfo),
      };
    },
    async restore() {
      const { customerInfo } = await Purchases.restorePurchases();
      return snapshot(customerInfo);
    },
    async customerInfo() {
      const { customerInfo } = await Purchases.getCustomerInfo();
      return snapshot(customerInfo);
    },
    async listen(listener) {
      await Purchases.addCustomerInfoUpdateListener(info => { listener(snapshot(info)); });
    },
  };
}
