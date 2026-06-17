import assert from 'node:assert/strict';
import test from 'node:test';
import { Subscription } from '../src/types';
import {
  getRenewalStatus,
  getSubscriptionAccessLockState,
  isSubscriptionActive,
} from './subscriptionService';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'subscription-id',
    restaurant_id: 'restaurant-id',
    plan_id: 'basic',
    status: 'active',
    billing_interval: 'monthly',
    trial_start: '2026-06-01T00:00:00.000Z',
    trial_end: '2026-06-30T00:00:00.000Z',
    current_period_start: '2026-06-01T00:00:00.000Z',
    current_period_end: '2026-06-30T00:00:00.000Z',
    cancel_at_period_end: true,
    access_locked: false,
    access_lock_at: null,
    access_locked_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

test('does not show a renewal reminder more than three days before expiry', () => {
  const sub = makeSubscription();
  assert.equal(getRenewalStatus(sub, new Date('2026-06-26T23:59:59.000Z')), 'ok');
});

test('shows reminders only during the final three days', () => {
  const sub = makeSubscription();
  assert.equal(getRenewalStatus(sub, new Date('2026-06-27T00:00:00.000Z')), 'warning');
  assert.equal(getRenewalStatus(sub, new Date('2026-06-29T00:00:00.000Z')), 'urgent');
});

test('automatically locks access at the exact expiry time with no grace period', () => {
  const sub = makeSubscription();
  const expiry = new Date('2026-06-30T00:00:00.000Z');

  assert.equal(getSubscriptionAccessLockState(sub, expiry), 'locked');
  assert.equal(getRenewalStatus(sub, expiry), 'blocked');
  assert.equal(isSubscriptionActive(sub, expiry), false);
});

test('keeps access active immediately before expiry', () => {
  const sub = makeSubscription();
  const beforeExpiry = new Date('2026-06-29T23:59:59.999Z');

  assert.equal(getSubscriptionAccessLockState(sub, beforeExpiry), 'active');
  assert.equal(isSubscriptionActive(sub, beforeExpiry), true);
});

test('honors an admin-scheduled lock before the plan expiry', () => {
  const sub = makeSubscription({
    current_period_end: '2026-07-30T00:00:00.000Z',
    access_lock_at: '2026-06-28T12:00:00.000Z',
  });

  assert.equal(
    getSubscriptionAccessLockState(sub, new Date('2026-06-28T11:59:59.999Z')),
    'scheduled'
  );
  assert.equal(
    getSubscriptionAccessLockState(sub, new Date('2026-06-28T12:00:00.000Z')),
    'locked'
  );
});
