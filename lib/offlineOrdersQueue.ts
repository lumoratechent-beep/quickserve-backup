import { CartItem, OrderStatus } from '../src/types';

export interface OfflineOrder {
  id: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  timestamp: number;
  customer_id: string;
  restaurant_id: string;
  table_number: string;
  location_name: string;
  remark: string;
  createdAt: number; // When it was queued
  synced?: boolean; // Whether it's been successfully synced
}

const QUEUE_STORAGE_KEY = 'qs_offline_orders_queue';

/**
 * Add an order to the offline queue
 */
export const addOfflineOrder = (order: OfflineOrder): void => {
  try {
    const existing = getOfflineOrders();
    const updated = [...existing, order];
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to add order to offline queue:', error);
  }
};

/**
 * Get all queued offline orders
 */
export const getOfflineOrders = (): OfflineOrder[] => {
  try {
    const data = localStorage.getItem(QUEUE_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to retrieve offline orders:', error);
    return [];
  }
};

/**
 * Get unsynced offline orders
 */
export const getUnsyncedOrders = (): OfflineOrder[] => {
  const orders = getOfflineOrders();
  return orders.filter(o => !o.synced);
};

/**
 * Mark an order as synced
 */
export const markOrderAsSynced = (orderId: string): void => {
  try {
    const orders = getOfflineOrders();
    const updated = orders.map(o => 
      o.id === orderId ? { ...o, synced: true } : o
    );
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to mark order as synced:', error);
  }
};

/**
 * Remove an order from the queue
 */
export const removeOfflineOrder = (orderId: string): void => {
  try {
    const orders = getOfflineOrders();
    const updated = orders.filter(o => o.id !== orderId);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to remove offline order:', error);
  }
};

/**
 * Clear all offline orders
 */
export const clearOfflineQueue = (): void => {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify([]));
  } catch (error) {
    console.error('Failed to clear offline queue:', error);
  }
};

/**
 * Check if user is online
 */
export const isOnline = (): boolean => {
  return navigator.onLine;
};

/**
 * Add online/offline listeners
 */
export const onOnlineStatusChange = (callback: (isOnline: boolean) => void): (() => void) => {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return unsubscribe function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};
