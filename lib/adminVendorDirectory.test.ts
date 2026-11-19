import assert from 'node:assert/strict';
import test from 'node:test';
import type { Restaurant, User } from '../src/types';
import { buildAdminVendorDirectory } from './adminVendorDirectory';

const restaurants: Restaurant[] = [
  { id: 'cafe', name: 'Corner Cafe', vendorId: 'owner', logo: '', menu: [], location: 'Main Hub' },
  { id: 'bakery', name: 'Bakery', vendorId: 'baker', logo: '', menu: [], location: '' },
];

test('resolves staff assignments and owner records without a restaurant ID', () => {
  const users: User[] = [
    { id: 'owner', username: 'owner', role: 'VENDOR' },
    { id: 'cashier', username: 'cashier', role: 'CASHIER', restaurantId: 'cafe' },
    { id: 'kitchen', username: 'kitchen', role: 'KITCHEN', restaurantId: 'cafe', isActive: false },
    { id: 'baker', username: 'baker', role: 'VENDOR', restaurantId: 'bakery' },
    { id: 'admin', username: 'admin', role: 'ADMIN' },
    { id: 'unknown', username: 'unknown', role: 'MANAGER', restaurantId: 'deleted' },
  ];
  const directory = buildAdminVendorDirectory(restaurants, users, []);
  assert.equal(directory.restaurantByUserId.get('owner')?.name, 'Corner Cafe');
  assert.equal(directory.restaurantByUserId.get('cashier')?.id, 'cafe');
  assert.deepEqual(directory.usersByRestaurantId.get('cafe')?.map(user => user.id), ['owner', 'cashier', 'kitchen']);
  assert.deepEqual(directory.usersByRestaurantId.get('bakery')?.map(user => user.id), ['baker']);
  assert.equal(directory.restaurantByUserId.has('admin'), false);
  assert.equal(directory.restaurantByUserId.has('unknown'), false);
});

test('deduplicates owners and prefers up-to-date full user records', () => {
  const vendor: User = { id: 'owner', username: 'owner', role: 'VENDOR', restaurantId: 'cafe' };
  const updated = { ...vendor, name: 'Cafe Owner', isActive: false };
  const directory = buildAdminVendorDirectory(restaurants, [updated], [vendor]);
  assert.deepEqual(directory.usersByRestaurantId.get('cafe'), [updated]);
});

test('includes owners from the vendor list when missing from user records', () => {
  const vendor: User = { id: 'owner', username: 'owner', role: 'VENDOR' };
  const directory = buildAdminVendorDirectory(restaurants, [], [vendor]);
  assert.deepEqual(directory.usersByRestaurantId.get('cafe'), [vendor]);
  assert.equal(directory.usersByRestaurantId.has('bakery'), false);
});
