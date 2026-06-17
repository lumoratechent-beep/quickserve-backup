const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateNextSubscriptionPeriod(
  currentEnd: string | null | undefined,
  isAnnual: boolean,
  now: Date = new Date()
): { periodStart: Date; periodEnd: Date } {
  const renewalDate = currentEnd ? new Date(currentEnd) : null;
  const hasValidFutureEnd = renewalDate
    && !Number.isNaN(renewalDate.getTime())
    && renewalDate > now;
  const periodStart = new Date(hasValidFutureEnd ? renewalDate.getTime() : now.getTime());
  const durationDays = isAnnual ? 365 : 30;
  const periodEnd = new Date(periodStart.getTime() + durationDays * DAY_MS);

  return { periodStart, periodEnd };
}
