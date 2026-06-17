export interface SubscriptionAccessDates {
  current_period_end?: string | null;
  trial_end?: string | null;
  access_lock_at?: string | null;
}

function parseValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getEffectiveSubscriptionExpiry(input: SubscriptionAccessDates): Date | null {
  return parseValidDate(input.current_period_end || input.trial_end);
}

export function isSubscriptionLockDue(
  input: SubscriptionAccessDates,
  now: Date = new Date()
): boolean {
  const scheduledLock = parseValidDate(input.access_lock_at);
  if (scheduledLock && scheduledLock <= now) return true;

  const expiry = getEffectiveSubscriptionExpiry(input);
  return Boolean(expiry && expiry <= now);
}
