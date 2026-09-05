import assert from 'node:assert/strict';
import test from 'node:test';
import { CartItem, OrderStatus } from '../src/types';
import {
  areAllKdsItemsServed,
  getAggregateKdsOrderStatus,
  markKdsScopeServed,
} from './kdsOrderState';
import { compressPosSettings, expandPosSettings } from './sharedSettings';

const item = (name: string, category: string, status: OrderStatus): CartItem => ({
  id: name,
  name,
  category,
  description: '',
  image: '',
  price: 1,
  quantity: 1,
  restaurantId: 'restaurant-1',
  status,
});

test('serving Food leaves Drink items unchanged and keeps the order preparing', () => {
  const original = [
    item('Burger', 'Food', OrderStatus.COMPLETED),
    item('Coke', 'Drinks', OrderStatus.PREPARING),
    item('Milo', 'Drinks', OrderStatus.PENDING),
  ];
  const updated = markKdsScopeServed(original, OrderStatus.PREPARING, ['Food']);

  assert.equal(updated[0].status, OrderStatus.SERVED);
  assert.equal(updated[1].status, OrderStatus.PREPARING);
  assert.equal(updated[2].status, OrderStatus.PENDING);
  assert.equal(getAggregateKdsOrderStatus(updated, OrderStatus.PREPARING), OrderStatus.PREPARING);
});

test('the order becomes served only when every active department item is served', () => {
  const updated = [
    item('Burger', 'Food', OrderStatus.SERVED),
    item('Coke', 'Drinks', OrderStatus.SERVED),
    item('Unavailable', 'Dessert', OrderStatus.CANCELLED),
  ];

  assert.equal(areAllKdsItemsServed(updated, OrderStatus.PREPARING), true);
  assert.equal(getAggregateKdsOrderStatus(updated, OrderStatus.PREPARING), OrderStatus.SERVED);
});

test('departments can finish sequentially without sharing their mutable status', () => {
  const cooked = [
    item('Burger', 'Food', OrderStatus.COMPLETED),
    item('Coke', 'Drinks', OrderStatus.COMPLETED),
  ];

  const foodServed = markKdsScopeServed(cooked, OrderStatus.PREPARING, ['Food']);
  assert.deepEqual(foodServed.map(entry => entry.status), [OrderStatus.SERVED, OrderStatus.COMPLETED]);
  assert.equal(getAggregateKdsOrderStatus(foodServed, OrderStatus.PREPARING), OrderStatus.PREPARING);

  const drinksServed = markKdsScopeServed(foodServed, OrderStatus.PREPARING, ['Drinks']);
  assert.deepEqual(drinksServed.map(entry => entry.status), [OrderStatus.SERVED, OrderStatus.SERVED]);
  assert.equal(getAggregateKdsOrderStatus(drinksServed, OrderStatus.PREPARING), OrderStatus.SERVED);
});

test('single-department orders retain the normal cooked then served workflow', () => {
  const cooked = [item('Burger', 'Food', OrderStatus.COMPLETED)];
  assert.equal(getAggregateKdsOrderStatus(cooked, OrderStatus.PREPARING), OrderStatus.PREPARING);

  const served = markKdsScopeServed(cooked, OrderStatus.PREPARING, ['Food']);
  assert.equal(served[0].status, OrderStatus.SERVED);
  assert.equal(getAggregateKdsOrderStatus(served, OrderStatus.PREPARING), OrderStatus.SERVED);
});

test('already-served unrouted items do not complete an order while routed work is pending', () => {
  const items = [
    item('Burger', 'Food', OrderStatus.PENDING),
    { ...item('Retail Bag', 'Retail', OrderStatus.SERVED), kdsRouted: false },
  ];

  assert.equal(getAggregateKdsOrderStatus(items, OrderStatus.PENDING), OrderStatus.PENDING);
  const foodServed = markKdsScopeServed(
    [{ ...items[0], status: OrderStatus.COMPLETED }, items[1]],
    OrderStatus.PREPARING,
    ['Food'],
  );
  assert.equal(getAggregateKdsOrderStatus(foodServed, OrderStatus.PREPARING), OrderStatus.SERVED);
});

test('an order containing only unrouted auto-served items is served', () => {
  const items = [{ ...item('Retail Bag', 'Retail', OrderStatus.SERVED), kdsRouted: false }];
  assert.equal(getAggregateKdsOrderStatus(items, OrderStatus.ONGOING), OrderStatus.SERVED);
});

test('non-default kitchen ticket settings survive database compression', () => {
  const compressed = compressPosSettings({
    kitchenTicket: {
      printLargeOrderNumber: false,
      numberOfCopies: 3,
      autoPrintOnNewOrder: true,
    },
  }, 'Test Restaurant');
  const expanded = expandPosSettings(compressed, 'Test Restaurant');

  assert.deepEqual(expanded.kitchenTicket, {
    printLargeOrderNumber: false,
    numberOfCopies: 3,
    autoPrintOnNewOrder: true,
  });
});
