import assert from 'node:assert/strict';
import test from 'node:test';
import { CartItem, OrderStatus } from '../src/types';
import {
  areAllKdsItemsServed,
  cancelKdsItem,
  cancelOrderItemsForKds,
  getAggregateKdsOrderStatus,
  getCurrentKdsTicketItems,
  markKdsScopeServed,
  reconcilePosKdsItems,
} from './kdsOrderState';
import { compressPosSettings, expandPosSettings } from './sharedSettings';
import { getKdsItemConfigurationKey, getKdsPreparationDetails } from './kdsItemDetails';

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

test('a POS quantity reduction preserves the old instruction as cancelled', () => {
  const original = [{ ...item('TEH O AIS', 'Drinks', OrderStatus.PREPARING), quantity: 3, kdsItemId: 'drink-1' }];
  const result = reconcilePosKdsItems(
    original,
    [{ ...original[0], quantity: 1 }],
    OrderStatus.PREPARING,
    { now: 100, createId: () => 'revision-1' },
  );

  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(entry => entry.quantity), [3, 1]);
  assert.deepEqual(result.items.map(entry => entry.status), [OrderStatus.CANCELLED, OrderStatus.PREPARING]);
  assert.equal(result.items[0].kdsChangeType, 'SUPERSEDED');
  assert.equal(result.items[0].kitchenCancelReason, 'Quantity changed from x3 to x1');
  assert.equal(result.items[1].kdsChangeType, 'CORRECTED');
});

test('removing a POS item keeps a durable cancelled kitchen line', () => {
  const original = [{ ...item('TEH O AIS', 'Drinks', OrderStatus.PENDING), kdsItemId: 'drink-1' }];
  const result = reconcilePosKdsItems(original, [], OrderStatus.PENDING, { now: 200 });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, OrderStatus.CANCELLED);
  assert.equal(result.items[0].kdsChangeType, 'REMOVED');
  assert.equal(result.status, OrderStatus.CANCELLED);
});

test('adding an item to an active order appends it to the existing ticket', () => {
  const burger = { ...item('Burger', 'Food', OrderStatus.PREPARING), kdsItemId: 'burger-1' };
  const fries = { ...item('Fries', 'Food', OrderStatus.PENDING), status: undefined };
  const result = reconcilePosKdsItems(
    [burger],
    [burger, fries],
    OrderStatus.PREPARING,
    { now: 300, createId: () => 'fries-1' },
  );

  assert.equal(result.createdPostServedTicket, false);
  assert.equal(result.items[1].kdsChangeType, 'ADDED');
  assert.equal(result.items[1].kdsTicketKind, undefined);
  assert.equal(result.items[1].status, OrderStatus.PENDING);
});

test('adding after served creates a current KDS ticket containing only new items', () => {
  const burger = { ...item('Burger', 'Food', OrderStatus.SERVED), kdsItemId: 'burger-1' };
  const coke = { ...item('Coke', 'Drinks', OrderStatus.SERVED), kdsItemId: 'coke-1' };
  const fries = { ...item('Fries', 'Food', OrderStatus.PENDING), status: undefined };
  let id = 0;
  const result = reconcilePosKdsItems(
    [burger, coke],
    [burger, coke, fries],
    OrderStatus.SERVED,
    { now: 400, createId: () => `new-${++id}` },
  );
  const currentTicket = getCurrentKdsTicketItems(result.items);

  assert.equal(result.createdPostServedTicket, true);
  assert.deepEqual(currentTicket.map(entry => entry.name), ['Fries']);
  assert.equal(currentTicket[0].kdsTicketKind, 'POST_SERVED');
  assert.equal(result.status, OrderStatus.PENDING);
});

test('another addition stays in the active post-served update ticket', () => {
  const served = { ...item('Burger', 'Food', OrderStatus.SERVED), kdsItemId: 'burger-1' };
  const firstUpdate = {
    ...item('Fries', 'Food', OrderStatus.PREPARING),
    kdsItemId: 'fries-1',
    kdsChangeType: 'ADDED' as const,
    kdsChangedAt: 400,
    kdsTicketId: 'update-400',
    kdsTicketKind: 'POST_SERVED' as const,
  };
  const dessert = { ...item('Cake', 'Food', OrderStatus.PENDING), status: undefined };
  const result = reconcilePosKdsItems(
    [served, firstUpdate],
    [served, firstUpdate, dessert],
    OrderStatus.PREPARING,
    { now: 450, createId: () => 'cake-1' },
  );

  assert.deepEqual(getCurrentKdsTicketItems(result.items).map(entry => entry.name), ['Fries', 'Cake']);
  assert.equal(result.currentItems[2].kdsTicketId, 'update-400');
  assert.equal(result.createdPostServedTicket, false);
});

test('cancelling an item after served creates a cancellation-only update ticket', () => {
  const burger = { ...item('Burger', 'Food', OrderStatus.SERVED), kdsItemId: 'burger-1' };
  const coke = { ...item('Coke', 'Drinks', OrderStatus.SERVED), kdsItemId: 'coke-1' };
  const result = reconcilePosKdsItems(
    [burger, coke],
    [coke],
    OrderStatus.SERVED,
    { now: 475, createId: () => 'cancel-ticket' },
  );
  const currentTicket = getCurrentKdsTicketItems(result.items);

  assert.deepEqual(currentTicket.map(entry => entry.name), ['Burger']);
  assert.equal(currentTicket[0].status, OrderStatus.CANCELLED);
  assert.equal(result.status, OrderStatus.CANCELLED);
});

test('whole-order cancellation marks every routed department item but not unrouted retail', () => {
  const original = [
    { ...item('Burger', 'Food', OrderStatus.PREPARING), kdsRouted: true },
    { ...item('Coke', 'Drinks', OrderStatus.PENDING), kdsRouted: true },
    { ...item('Bag', 'Retail', OrderStatus.SERVED), kdsRouted: false },
  ];
  const cancelled = cancelOrderItemsForKds(original, OrderStatus.PREPARING, 'Order cancelled via POS', 500);

  assert.deepEqual(cancelled.map(entry => entry.status), [
    OrderStatus.CANCELLED,
    OrderStatus.CANCELLED,
    OrderStatus.SERVED,
  ]);
  assert.deepEqual(cancelled.slice(0, 2).map(entry => entry.kdsChangedAt), [500, 500]);
  assert.deepEqual(cancelled.slice(0, 2).map(entry => entry.cancelSource), ['POS', 'POS']);
  assert.deepEqual(cancelled.slice(0, 2).map(entry => entry.cancelledAt), [500, 500]);
});

test('KDS cancellation changes only the targeted in-scope item and keeps an optional reason', () => {
  const burger = { ...item('Burger', 'Food', OrderStatus.PREPARING), kdsItemId: 'burger-1', price: 12 };
  const drink = { ...item('Tea', 'Drinks', OrderStatus.PREPARING), kdsItemId: 'drink-1', price: 3 };
  const result = cancelKdsItem([burger, drink], OrderStatus.PREPARING, burger, 0, {
    reason: 'Sold Out',
    cancelledBy: 'kitchen-user',
    now: 600,
    isInScope: entry => entry.category === 'Food',
  });

  assert.ok(result);
  assert.equal(result.cancelledValue, 12);
  assert.equal(result.items[0].status, OrderStatus.CANCELLED);
  assert.equal(result.items[0].kitchenCancelReason, 'Sold Out');
  assert.equal(result.items[0].cancelledBy, 'kitchen-user');
  assert.equal(result.items[0].cancelledAt, 600);
  assert.equal(result.items[0].cancelSource, 'KDS');
  assert.equal(result.items[1], drink);
});

test('KDS cancellation allows no reason and rejects another department item', () => {
  const burger = { ...item('Burger', 'Food', OrderStatus.PENDING), kdsItemId: 'burger-1' };
  const drink = { ...item('Tea', 'Drinks', OrderStatus.PENDING), kdsItemId: 'drink-1' };
  const options = { now: 700, isInScope: (entry: CartItem) => entry.category === 'Food' };

  const noReason = cancelKdsItem([burger, drink], OrderStatus.PENDING, burger, 0, options);
  assert.ok(noReason);
  assert.equal(noReason.items[0].kitchenCancelReason, undefined);
  assert.equal(cancelKdsItem([burger, drink], OrderStatus.PENDING, drink, 1, options), null);
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

test('KDS preparation details include every non-empty item configuration', () => {
  const configured: CartItem = {
    ...item('Chicken Burger', 'Food', OrderStatus.PENDING),
    selectedVariantOption: 'Spicy',
    selectedOtherVariant: 'Brioche',
    otherVariantName: 'bun type',
    selectedModifiers: { Doneness: 'Well Done', Sauce: '' },
    selectedSize: 'Large',
    selectedTemp: 'Extra Hot',
    selectedAddOns: [
      { name: 'Cheese', price: 1, quantity: 1 },
      { name: 'Egg', price: 2, quantity: 2 },
    ],
    selectedMixMatch: [
      { label: 'Side', choice: 'Fries', priceModifier: 0 },
      { label: 'Drink', choice: 'Coke', priceModifier: 0 },
    ],
    remark: 'No onion',
  };

  assert.deepEqual(getKdsPreparationDetails(configured).map(detail => [detail.label, detail.value]), [
    ['Variant', 'Spicy'],
    ['Bun Type', 'Brioche'],
    ['Doneness', 'Well Done'],
    ['Portion', 'Large'],
    ['Thermal Option', 'Extra Hot'],
    ['Add-On', 'Cheese, Egg x2'],
    ['Mix & Match', 'Side: Fries + Drink: Coke'],
    ['Remark', 'No onion'],
  ]);
});

test('cart configuration identity distinguishes modifier, add-on and mix-and-match choices', () => {
  const base = item('Burger', 'Food', OrderStatus.PENDING);
  const first = {
    ...base,
    selectedModifiers: { Sauce: 'Chilli' },
    selectedAddOns: [{ name: 'Egg', price: 1, quantity: 1 }],
    selectedMixMatch: [{ label: 'Drink', choice: 'Coke', priceModifier: 0 }],
  };
  const second = {
    ...base,
    selectedModifiers: { Sauce: 'Mayo' },
    selectedAddOns: [{ name: 'Cheese', price: 1, quantity: 1 }],
    selectedMixMatch: [{ label: 'Drink', choice: 'Tea', priceModifier: 0 }],
  };

  assert.notEqual(getKdsItemConfigurationKey(first), getKdsItemConfigurationKey(second));
});
