import type { Restaurant, User } from '../src/types';

export function buildAdminVendorDirectory(restaurants: Restaurant[], users: User[], vendors: User[]) {
  const accounts = new Map<string, User>();
  // Prefer the full user record when the owner also appears in the vendor list.
  for (const user of [...vendors, ...users]) accounts.set(user.id, user);
  const restaurantsById = new Map(restaurants.map(restaurant => [restaurant.id, restaurant]));
  const restaurantsByOwner = new Map(restaurants.map(restaurant => [restaurant.vendorId, restaurant]));
  const restaurantByUserId = new Map<string, Restaurant>();
  const usersByRestaurantId = new Map<string, User[]>();

  for (const user of accounts.values()) {
    const restaurant = (user.restaurantId ? restaurantsById.get(user.restaurantId) : undefined)
      || restaurantsByOwner.get(user.id);
    if (!restaurant) continue;
    restaurantByUserId.set(user.id, restaurant);
    const assigned = usersByRestaurantId.get(restaurant.id) || [];
    assigned.push(user);
    usersByRestaurantId.set(restaurant.id, assigned);
  }

  return { restaurantByUserId, usersByRestaurantId };
}
