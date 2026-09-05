import { CartItem, OrderStatus } from '../src/types';

export const normalizeKdsScopeKey = (value: unknown): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const getKdsItemStatus = (item: CartItem, fallbackStatus: OrderStatus): OrderStatus =>
  item.status || fallbackStatus;

const getKdsWorkflowItems = (items: CartItem[]): CartItem[] =>
  items.filter(item => item.kdsRouted !== false);

/**
 * KDS can advance the main order only as an aggregate of every non-cancelled
 * item. COMPLETED means cooked at KDS level; only all-SERVED items make the
 * order SERVED. A partially progressed order remains PREPARING.
 */
export const getAggregateKdsOrderStatus = (
  items: CartItem[],
  fallbackStatus: OrderStatus,
): OrderStatus => {
  const workflowItems = getKdsWorkflowItems(items);
  const activeItems = workflowItems.filter(item => getKdsItemStatus(item, fallbackStatus) !== OrderStatus.CANCELLED);
  if (activeItems.length === 0) {
    const statuses = items.map(item => getKdsItemStatus(item, fallbackStatus));
    if (statuses.length > 0 && statuses.every(status => status === OrderStatus.CANCELLED)) return OrderStatus.CANCELLED;
    const nonCancelledStatuses = statuses.filter(status => status !== OrderStatus.CANCELLED);
    if (nonCancelledStatuses.length > 0 && nonCancelledStatuses.every(status => status === OrderStatus.SERVED)) {
      return OrderStatus.SERVED;
    }
    return fallbackStatus;
  }

  const statuses = activeItems.map(item => getKdsItemStatus(item, fallbackStatus));
  if (statuses.every(status => status === OrderStatus.SERVED)) return OrderStatus.SERVED;
  if (statuses.some(status => (
    status === OrderStatus.PREPARING
    || status === OrderStatus.COMPLETED
    || status === OrderStatus.SERVED
  ))) return OrderStatus.PREPARING;
  if (statuses.some(status => status === OrderStatus.ONGOING)) return OrderStatus.ONGOING;
  if (statuses.some(status => status === OrderStatus.PENDING)) return OrderStatus.PENDING;
  return fallbackStatus;
};

export const areAllKdsItemsCooked = (items: CartItem[], fallbackStatus: OrderStatus): boolean => {
  const activeItems = getKdsWorkflowItems(items)
    .filter(item => getKdsItemStatus(item, fallbackStatus) !== OrderStatus.CANCELLED);
  return activeItems.length > 0 && activeItems.every(item => {
    const status = getKdsItemStatus(item, fallbackStatus);
    return status === OrderStatus.COMPLETED || status === OrderStatus.SERVED;
  });
};

export const areAllKdsItemsServed = (items: CartItem[], fallbackStatus: OrderStatus): boolean => {
  const activeItems = getKdsWorkflowItems(items)
    .filter(item => getKdsItemStatus(item, fallbackStatus) !== OrderStatus.CANCELLED);
  return activeItems.length > 0
    && activeItems.every(item => getKdsItemStatus(item, fallbackStatus) === OrderStatus.SERVED);
};

export const markKdsScopeServed = (
  items: CartItem[],
  fallbackStatus: OrderStatus,
  scopeCategories: string[],
): CartItem[] => {
  const scopeKeys = new Set(scopeCategories.map(normalizeKdsScopeKey).filter(Boolean));
  const hasScope = scopeKeys.size > 0;

  return items.map(item => {
    if (hasScope && !scopeKeys.has(normalizeKdsScopeKey(item.category))) return item;
    const status = getKdsItemStatus(item, fallbackStatus);
    if (status === OrderStatus.CANCELLED || status === OrderStatus.SERVED) return item;
    if (status !== OrderStatus.COMPLETED) return item;
    return { ...item, status: OrderStatus.SERVED };
  });
};

export const ensureKdsItemIdentities = (items: CartItem[]): CartItem[] =>
  items.map(item => {
    if (item.kdsItemId) return item;
    const generatedId = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `kds-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { ...item, kdsItemId: generatedId };
  });

const getLegacyItemFingerprint = (item: CartItem): string => JSON.stringify([
  item.id,
  item.name,
  item.category,
  item.selectedSize,
  item.selectedTemp,
  item.selectedOtherVariant,
  item.selectedVariantOption,
  item.savedBillId,
  item.savedBillLineId,
]);

/** Finds the same item in a freshly fetched order, including legacy rows. */
export const findCurrentKdsItemIndex = (
  items: CartItem[],
  targetItem: CartItem,
  preferredIndex: number,
): number => {
  if (targetItem.kdsItemId) {
    const index = items.findIndex(item => item.kdsItemId === targetItem.kdsItemId);
    if (index >= 0) return index;
  }
  if (targetItem.savedBillLineId) {
    const index = items.findIndex(item => item.savedBillLineId === targetItem.savedBillLineId);
    if (index >= 0) return index;
  }
  if (items[preferredIndex] && getLegacyItemFingerprint(items[preferredIndex]) === getLegacyItemFingerprint(targetItem)) {
    return preferredIndex;
  }
  return items.findIndex(item => getLegacyItemFingerprint(item) === getLegacyItemFingerprint(targetItem));
};
