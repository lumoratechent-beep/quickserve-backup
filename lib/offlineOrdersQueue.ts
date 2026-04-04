import { CartItem, OrderStatus, OrderSource } from '../src/types';

export interface OfflineOrder {
  id: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  timestamp: number;
  customer_id: string;
  restaurant_id: string;
  table_number: string;
  dining_type?: string;
  location_name: string;
  remark: string;
  payment_method?: string;
  cashier_name?: string;
  amount_received?: number;
  change_amount?: number;
  order_source?: OrderSource;
  createdAt: number; // When it was queued
  synced?: boolean; // Whether it's been successfully synced
}

const QUEUE_STORAGE_KEY = 'qs_offline_orders_queue';
const ORDER_NUMBER_TRACKER_KEY = 'qs_offline_order_numbers';

/**
 * Track the highest order number per location code
 */
interface OrderNumberTracker {
  [code: string]: number;
}

/**
 * Get order number tracker
 */
const getOrderNumberTracker = (): OrderNumberTracker => {
  try {
    const data = localStorage.getItem(ORDER_NUMBER_TRACKER_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to retrieve order number tracker:', error);
    return {};
  }
};

/**
 * Update order number tracker with highest number for a code
 */
export const updateOrderNumberTracker = (code: string, nextNum: number): void => {
  try {
    const tracker = getOrderNumberTracker();
    // Only update if the new number is higher than what we have
    if (nextNum > (tracker[code] || 0)) {
      tracker[code] = nextNum;
      localStorage.setItem(ORDER_NUMBER_TRACKER_KEY, JSON.stringify(tracker));
    }
  } catch (error) {
    console.error('Failed to update order number tracker:', error);
  }
};

/**
 * Get the next order number for a location code
 */
export const getNextOrderNumber = (code: string): number => {
  try {
    const tracker = getOrderNumberTracker();
    return (tracker[code] || 0) + 1;
  } catch (error) {
    console.error('Failed to get next order number:', error);
    return 1;
  }
};

/**
 * Extract order number from an order ID
 * Only processes NEW sequential format (IOI0000042)
 * Returns 0 for old timestamp-based format (IOI90621796173) to ignore them
 * This prevents old orders from interfering with new sequential numbering
 */
export const extractOrderNumber = (orderId: string, code: string): number => {
  try {
    if (!orderId || !code) {
      console.warn(`Invalid input: orderId="${orderId}", code="${code}"`);
      return 0;
    }
    if (!orderId.startsWith(code)) {
      console.warn(`Order ID "${orderId}" doesn't start with code "${code}"`);
      return 0;
    }
    
    const numPart = orderId.substring(code.length);
    
    // Only process NEW sequential format: exactly 7 digits, zero-padded (e.g., "0000042")
    // Ignore old timestamp format (which has more digits and no zero-padding)
    if (!/^\d{7}$/.test(numPart)) {
      console.log(`Ignoring old timestamp-format order ${orderId} (not 7-digit sequential)`);
      return 0;
    }
    
    const num = parseInt(numPart, 10);
    if (isNaN(num)) {
      console.warn(`Failed to parse order number from "${numPart}" (full ID: ${orderId})`);
      return 0;
    }
    
    console.log(`Extracted sequential order number ${num} from ${orderId}`);
    return num;
  } catch (error) {
    console.error('Failed to extract order number:', error, { orderId, code });
    return 0;
  }
};

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
