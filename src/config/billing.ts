/**
 * Store product identifiers and the public RevenueCat SDK key.
 * The Google key is injected at build time; an empty key keeps native billing
 * on the stub so a debug APK without a dashboard project cannot charge anyone.
 */
export const REVENUECAT = {
  googleApiKey: (typeof import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY === 'string'
    ? import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY
    : ''),
} as const;
