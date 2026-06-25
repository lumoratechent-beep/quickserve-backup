const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

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

export function calculatePaidSubscriptionPeriod(
  paidAt: Date | string | number | null | undefined,
  isAnnual: boolean,
  fallback: Date = new Date()
): { periodStart: Date; periodEnd: Date } {
  const periodStart = parseDate(paidAt) || fallback;
  const durationDays = isAnnual ? 365 : 30;
  const periodEnd = new Date(periodStart.getTime() + durationDays * DAY_MS);

  return { periodStart, periodEnd };
}
