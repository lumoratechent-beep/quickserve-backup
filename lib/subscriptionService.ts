import { supabase } from './supabase';
import { Subscription, PlanId } from '../src/types';

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

export function isSubscriptionActive(sub: Subscription): boolean {
  return sub.status === 'active' || (sub.status === 'trialing' && isTrialActive(sub));
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
