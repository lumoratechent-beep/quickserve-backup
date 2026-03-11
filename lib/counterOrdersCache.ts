// lib/counterOrdersCache.ts
import { Order } from '../src/types';

const CACHE_KEY_PREFIX = 'qs_counter_orders_';
const SYNC_TIMESTAMPS_KEY_PREFIX = 'qs_counter_sync_time_';

/**
 * Get all cached counter orders for a restaurant
 */
export const getCachedCounterOrders = (restaurantId: string): Order[] => {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${restaurantId}`);
    return cached ? JSON.parse(cached) : [];
  } catch (error) {
    console.error('Error reading counter orders cache:', error);
    return [];
  }
};

/**
 * Add or update a counter order in cache
 */
export const addCounterOrderToCache = (restaurantId: string, order: Order): void => {
  try {
    const existing = getCachedCounterOrders(restaurantId);
    const filtered = existing.filter(o => o.id !== order.id);
    const updated = [order, ...filtered];
    localStorage.setItem(`${CACHE_KEY_PREFIX}${restaurantId}`, JSON.stringify(updated));
  } catch (error) {
    console.error('Error adding counter order to cache:', error);
  }
};

/**
 * Add multiple counter orders to cache (merge with existing)
 */
export const addCounterOrdersToCache = (restaurantId: string, orders: Order[]): void => {
  try {
    const existing = getCachedCounterOrders(restaurantId);
    const orderMap = new Map(existing.map(o => [o.id, o]));
    
    // Update or add new orders
    orders.forEach(order => {
      orderMap.set(order.id, order);
    });
    
    const updated = Array.from(orderMap.values());
    localStorage.setItem(`${CACHE_KEY_PREFIX}${restaurantId}`, JSON.stringify(updated));
  } catch (error) {
    console.error('Error adding counter orders to cache:', error);
  }
};

/**
 * Remove a specific order from cache
 */
export const removeCounterOrderFromCache = (restaurantId: string, orderId: string): void => {
  try {
    const existing = getCachedCounterOrders(restaurantId);
    const filtered = existing.filter(o => o.id !== orderId);
    localStorage.setItem(`${CACHE_KEY_PREFIX}${restaurantId}`, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing counter order from cache:', error);
  }
};

/**
 * Clear all cached counter orders for a restaurant
 */
export const clearCounterOrdersCache = (restaurantId: string): void => {
  try {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${restaurantId}`);
  } catch (error) {
    console.error('Error clearing counter orders cache:', error);
  }
};

/**
 * Get last sync timestamp for a restaurant
 */
export const getLastSyncTime = (restaurantId: string): number => {
  try {
    const stored = localStorage.getItem(`${SYNC_TIMESTAMPS_KEY_PREFIX}${restaurantId}`);
    return stored ? parseInt(stored, 10) : 0;
  } catch (error) {
    console.error('Error reading last sync time:', error);
    return 0;
  }
};

/**
 * Update last sync timestamp for a restaurant
 */
export const setLastSyncTime = (restaurantId: string): void => {
  try {
    localStorage.setItem(`${SYNC_TIMESTAMPS_KEY_PREFIX}${restaurantId}`, Date.now().toString());
  } catch (error) {
    console.error('Error setting last sync time:', error);
  }
};

// ─── Report Orders Cache ──────────────────────────────────────────────────────
// Stores ALL orders (placed locally + fetched from server) for offline reports.
// Capped at REPORT_ORDERS_MAX to stay within localStorage limits.

const REPORT_ORDERS_KEY_PREFIX = 'qs_report_orders_';
export const REPORT_ORDERS_MAX = 500;

export const getReportOrdersCache = (restaurantId: string): Order[] => {
  try {
    const stored = localStorage.getItem(`${REPORT_ORDERS_KEY_PREFIX}${restaurantId}`);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading report orders cache:', error);
    return [];
  }
};

/**
 * Merge new orders into the report cache, deduplicating by id and keeping
 * the most recent `max` entries sorted newest-first.
 */
export const mergeReportOrdersCache = (
  restaurantId: string,
  orders: Order[],
  max = REPORT_ORDERS_MAX
): void => {
  try {
    const existing = getReportOrdersCache(restaurantId);
    const map = new Map(existing.map(o => [o.id, o]));
    orders.forEach(o => map.set(o.id, o));
    const sorted = Array.from(map.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, max);
    localStorage.setItem(`${REPORT_ORDERS_KEY_PREFIX}${restaurantId}`, JSON.stringify(sorted));
  } catch (error) {
    console.error('Error merging report orders cache:', error);
  }
};
