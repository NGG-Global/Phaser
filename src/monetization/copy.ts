import type { PurchaseReason, RewardedReason } from './types';

/** Workshop-voice copy when a watch does not grant a heart. Game state is unchanged. */
export function rewardedFeedback(reason: RewardedReason): string {
  switch (reason) {
    case 'unavailable': return 'No ad just now.';
    case 'cancelled': return 'The ad closed before a heart.';
    case 'failed': return "The ad didn't finish.";
  }
}

/** Workshop-voice copy when a refill purchase does not restore hearts. */
export function purchaseFeedback(reason: PurchaseReason): string {
  switch (reason) {
    case 'unavailable': return "The store isn't available.";
    case 'cancelled': return 'Purchase cancelled.';
    case 'failed': return "The purchase didn't finish.";
    case 'pending': return 'The store is still checking.';
  }
}
