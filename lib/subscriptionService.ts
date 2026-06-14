import { supabase } from './supabase';
import { Subscription, PlanId } from '../src/types';
import {
  getEffectiveSubscriptionExpiry,
  isSubscriptionLockDue,
} from './subscriptionAccess';

/** Days before expiry to start showing renewal reminders */
export const RENEWAL_WARNING_DAYS = 3;
/** Days before expiry to escalate to an urgent reminder */
export const RENEWAL_URGENT_DAYS = 1;

export type RenewalStatus =
  | 'ok'              // No action needed
  | 'warning'         // 3 days or fewer until expiry
  | 'urgent'          // 1 day or fewer until expiry
  | 'blocked';        // Expired or explicitly locked

export type SubscriptionAccessLockState = 'active' | 'scheduled' | 'locked';

export async function getSubscription(restaurantId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();

  if (error || !data) return null;
  return data as Subscription;
}

export function isTrialActive(sub: Subscription, now: Date = new Date()): boolean {
  if (sub.status !== 'trialing') return false;
  return new Date(sub.trial_end) > now;
}

/**
 * Returns the subscription end date (current_period_end for paid plans, trial_end for trials).
 */
export function getSubscriptionEndDate(sub: Subscription): Date | null {
  return getEffectiveSubscriptionExpiry(sub);
}

/**
 * Days remaining until subscription expires. Negative = days past expiry.
 */
export function daysUntilExpiry(sub: Subscription, now: Date = new Date()): number {
  const end = getSubscriptionEndDate(sub);
  if (!end) return 0;
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getSubscriptionAccessLockState(sub: Subscription | null | undefined, now: Date = new Date()): SubscriptionAccessLockState {
  if (!sub) return 'active';
  if (sub.access_locked === true) return 'locked';
  if (isSubscriptionLockDue(sub, now)) return 'locked';

  const lockAt = sub.access_lock_at ? new Date(sub.access_lock_at) : null;
  const hasValidLockAt = lockAt && !Number.isNaN(lockAt.getTime());
  return hasValidLockAt ? 'scheduled' : 'active';
}

export function isSubscriptionAccessLocked(sub: Subscription | null | undefined, now: Date = new Date()): boolean {
  return getSubscriptionAccessLockState(sub, now) === 'locked';
}

/**
 * Determines the renewal status for a subscription.
 */
export function getRenewalStatus(sub: Subscription, now: Date = new Date()): RenewalStatus {
  if (isSubscriptionAccessLocked(sub, now)) return 'blocked';

  // Canceled / unpaid subscriptions are always blocked
  if (sub.status === 'canceled' || sub.status === 'unpaid') return 'blocked';
  if (sub.status === 'pending_payment') return 'blocked';

  // past_due = Stripe auto-charge failed — always show urgent regardless of auto-renew
  if (sub.status === 'past_due') return 'urgent';

  // If auto-renew is ON (Stripe handles renewal), no reminders needed
  // cancel_at_period_end=false means Stripe will auto-charge before end date
  if (sub.stripe_subscription_id && sub.cancel_at_period_end === false) return 'ok';

  const days = daysUntilExpiry(sub, now);

  if (days <= RENEWAL_URGENT_DAYS) return 'urgent';
  if (days <= RENEWAL_WARNING_DAYS) return 'warning';
  return 'ok';
}

/**
 * Checks if a subscription is currently active.
 * Accounts for current_period_end on paid plans.
 */
export function isSubscriptionActive(sub: Subscription, now: Date = new Date()): boolean {
  if (isSubscriptionAccessLocked(sub, now)) return false;

  if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'pending_payment') return false;
  if (sub.status === 'trialing') return isTrialActive(sub, now);

  // For active / past_due statuses, access ends at the stored expiry.
  const end = getSubscriptionEndDate(sub);
  if (!end) return sub.status === 'active';

  return end > now;
}

export function isPendingPayment(sub: Subscription): boolean {
  return sub.status === 'pending_payment';
}

export function daysLeftInTrial(sub: Subscription): number {
  if (sub.status !== 'trialing') return 0;
  const end = new Date(sub.trial_end).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}
