import { supabase } from './supabase';
import { Subscription, PlanId } from '../src/types';

/** Days before expiry to start showing renewal reminders */
export const RENEWAL_WARNING_DAYS = 7;
/** Days before expiry to escalate to urgent reminder */
export const RENEWAL_URGENT_DAYS = 3;
/** Grace period days after expiry before fully blocking access */
export const GRACE_PERIOD_DAYS = 7;

export type RenewalStatus =
  | 'ok'              // No action needed
  | 'warning'         // 7 days or fewer until expiry
  | 'urgent'          // 3 days or fewer until expiry
  | 'grace'           // Expired but within grace period
  | 'blocked';        // Past grace period — access restricted

export async function getSubscription(restaurantId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();

  if (error || !data) return null;
  return data as Subscription;
}

export function isTrialActive(sub: Subscription): boolean {
  if (sub.status !== 'trialing') return false;
  return new Date(sub.trial_end) > new Date();
}

/**
 * Returns the subscription end date (current_period_end for paid plans, trial_end for trials).
 */
export function getSubscriptionEndDate(sub: Subscription): Date | null {
  const dateStr = sub.current_period_end || sub.trial_end;
  if (!dateStr) return null;
  return new Date(dateStr);
}

/**
 * Days remaining until subscription expires. Negative = days past expiry.
 */
export function daysUntilExpiry(sub: Subscription): number {
  const end = getSubscriptionEndDate(sub);
  if (!end) return 0;
  return Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Determines the renewal status for a subscription.
 */
export function getRenewalStatus(sub: Subscription): RenewalStatus {
  // Canceled / unpaid subscriptions are always blocked
  if (sub.status === 'canceled' || sub.status === 'unpaid') return 'blocked';
  if (sub.status === 'pending_payment') return 'blocked';

  // past_due = Stripe auto-charge failed — always show urgent regardless of auto-renew
  if (sub.status === 'past_due') return 'urgent';

  // If auto-renew is ON (Stripe handles renewal), no reminders needed
  // cancel_at_period_end=false means Stripe will auto-charge before end date
  if (sub.stripe_subscription_id && sub.cancel_at_period_end === false) return 'ok';

  const days = daysUntilExpiry(sub);

  if (days < -GRACE_PERIOD_DAYS) return 'blocked';
  if (days < 0) return 'grace';
  if (days <= RENEWAL_URGENT_DAYS) return 'urgent';
  if (days <= RENEWAL_WARNING_DAYS) return 'warning';
  return 'ok';
}

/**
 * Checks if a subscription is currently active (including grace period).
 * Accounts for current_period_end on paid plans.
 */
export function isSubscriptionActive(sub: Subscription): boolean {
  if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'pending_payment') return false;
  if (sub.status === 'trialing') return isTrialActive(sub);

  // For active / past_due statuses, check if within period + grace
  const end = getSubscriptionEndDate(sub);
  if (!end) return sub.status === 'active';

  const graceEnd = new Date(end.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  return new Date() <= graceEnd;
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
