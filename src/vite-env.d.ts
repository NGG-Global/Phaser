/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** RevenueCat Google Play public SDK key. Empty keeps native billing on the stub. */
  readonly VITE_REVENUECAT_GOOGLE_API_KEY?: string;
}
