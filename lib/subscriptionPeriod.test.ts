import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateNextSubscriptionPeriod } from './subscriptionPeriod';

test('extends an active monthly plan from its future expiry', () => {
  const now = new Date('2026-06-12T01:01:04.333Z');
  const { periodStart, periodEnd } = calculateNextSubscriptionPeriod(
    '2026-06-24T12:38:13.926Z',
    false,
    now
  );

  assert.equal(periodStart.toISOString(), '2026-06-24T12:38:13.926Z');
  assert.equal(periodEnd.toISOString(), '2026-07-24T12:38:13.926Z');
});

test('starts an expired monthly renewal at the renewal time', () => {
  const now = new Date('2026-06-12T01:01:04.333Z');
  const { periodStart, periodEnd } = calculateNextSubscriptionPeriod(
    '2026-05-25T12:38:13.926Z',
    false,
    now
  );

  assert.equal(periodStart.toISOString(), '2026-06-12T01:01:04.333Z');
  assert.equal(periodEnd.toISOString(), '2026-07-12T01:01:04.333Z');
});

test('uses the renewal time when no valid expiry exists', () => {
  const now = new Date('2026-06-12T01:01:04.333Z');
  const { periodStart, periodEnd } = calculateNextSubscriptionPeriod('invalid', true, now);

  assert.equal(periodStart.toISOString(), '2026-06-12T01:01:04.333Z');
  assert.equal(periodEnd.toISOString(), '2027-06-12T01:01:04.333Z');
});
