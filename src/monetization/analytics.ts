/**
 * Typed commerce events, no provider attached. A scene or the monetization
 * facade calls `track`; sinks can listen in tests, and a real analytics SDK
 * can be installed later without touching call sites.
 */

export const ANALYTICS_EVENTS = [
  'health_empty',
  'rewarded_offer_shown',
  'rewarded_started',
  'rewarded_completed',
  'rewarded_failed',
  'purchase_offer_shown',
  'purchase_started',
  'purchase_completed',
  'purchase_cancelled',
  'purchase_failed',
] as const;

export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];

export interface AnalyticsPayloads {
  readonly health_empty: { readonly level: number };
  readonly rewarded_offer_shown: { readonly placement: 'map' | 'play' };
  readonly rewarded_started: Record<string, never>;
  readonly rewarded_completed: Record<string, never>;
  readonly rewarded_failed: { readonly reason: 'unavailable' | 'cancelled' | 'failed' };
  readonly purchase_offer_shown: { readonly product: string };
  readonly purchase_started: { readonly product: string };
  readonly purchase_completed: { readonly product: string };
  readonly purchase_cancelled: { readonly product: string };
  readonly purchase_failed: { readonly product: string; readonly reason: 'unavailable' | 'cancelled' | 'failed' | 'pending' };
}

export type AnalyticsSink = <K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]) => void;

let sink: AnalyticsSink = defaultSink;

function defaultSink<K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]): void {
  if (import.meta.env.DEV) console.debug('[analytics]', event, payload);
}

/** Swap the sink (tests, or a future provider). Returns the previous sink so a test can restore it. */
export function installAnalytics(next: AnalyticsSink): AnalyticsSink {
  const previous = sink;
  sink = next;
  return previous;
}

export function track<K extends AnalyticsEvent>(event: K, payload: AnalyticsPayloads[K]): void {
  try { sink(event, payload); } catch { /* a sink must never take the game down */ }
}
