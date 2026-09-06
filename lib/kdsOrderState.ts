import { CartItem, OrderStatus } from '../src/types';

export const normalizeKdsScopeKey = (value: unknown): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const getKdsItemStatus = (item: CartItem, fallbackStatus: OrderStatus): OrderStatus =>
  item.status || fallbackStatus;

const getLatestPostServedTicketId = (items: CartItem[]): string | undefined => {
  const latest = items.reduce<CartItem | undefined>((current, item) => {
    if (item.kdsTicketKind !== 'POST_SERVED' || !item.kdsTicketId) return current;
    if (!current || Number(item.kdsChangedAt || 0) >= Number(current.kdsChangedAt || 0)) return item;
    return current;
  }, undefined);
  return latest?.kdsTicketId;
};

/**
 * Returns the item batch represented by the current KDS ticket. Once an order
 * was fully served, a later POS addition is a new batch and the old served
 * lines must not re-enter the active kitchen ticket.
 */
export const getCurrentKdsTicketItems = (items: CartItem[]): CartItem[] => {
  const routedItems = items.filter(item => item.kdsRouted !== false);
  const latestTicketId = getLatestPostServedTicketId(routedItems);
  return latestTicketId
    ? routedItems.filter(item => item.kdsTicketId === latestTicketId)
    : routedItems;
};

const getKdsWorkflowItems = getCurrentKdsTicketItems;

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
    const statusItems = workflowItems.length > 0 ? workflowItems : items;
    const statuses = statusItems.map(item => getKdsItemStatus(item, fallbackStatus));
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

const isHistoricalPosRevision = (item: CartItem): boolean => (
  item.kdsChangeType === 'SUPERSEDED' || item.kdsChangeType === 'REMOVED'
);

export const getCurrentPosItems = (items: CartItem[]): CartItem[] => items.filter(item => !isHistoricalPosRevision(item));

const getPosItemFingerprint = (item: CartItem): string => JSON.stringify([
  item.id,
  item.name,
  item.category,
  item.selectedSize,
  item.selectedTemp,
  item.selectedOtherVariant,
  item.selectedVariantOption,
  item.selectedModifiers || {},
  item.selectedAddOns || [],
  item.selectedMixMatch || [],
  item.remark || '',
]);

const createKdsIdentity = (): string => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `kds-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

export interface ReconcilePosKdsOptions {
  isRouted?: (item: CartItem) => boolean;
  now?: number;
  createId?: () => string;
}

export interface ReconcilePosKdsResult {
  /** Canonical order items, including cancelled historical kitchen instructions. */
  items: CartItem[];
  /** Current POS lines only, with their durable KDS identity/state preserved. */
  currentItems: CartItem[];
  status: OrderStatus;
  createdPostServedTicket: boolean;
}

/**
 * Reconciles a POS item edit without deleting instructions already seen by the
 * kitchen. Superseded/removed lines remain in orders.items as cancelled rows,
 * while current lines retain stable identities for conflict-safe KDS actions.
 */
export const reconcilePosKdsItems = (
  previousItems: CartItem[],
  nextPosItems: CartItem[],
  previousOrderStatus: OrderStatus,
  options: ReconcilePosKdsOptions = {},
): ReconcilePosKdsResult => {
  const now = options.now ?? Date.now();
  const makeId = options.createId ?? createKdsIdentity;
  const isRouted = options.isRouted ?? ((item: CartItem) => item.kdsRouted !== false);
  const previousCurrentItems = previousItems.filter(item => !isHistoricalPosRevision(item));
  const previouslyActiveRoutedItems = previousCurrentItems.filter(item => (
    isRouted(item) && getKdsItemStatus(item, previousOrderStatus) !== OrderStatus.CANCELLED
  ));
  const wasFullyServed = previouslyActiveRoutedItems.length > 0
    && previouslyActiveRoutedItems.every(item => (
      getKdsItemStatus(item, previousOrderStatus) === OrderStatus.SERVED
    ));
  const postServedTicketId = wasFullyServed ? `update-${now}-${makeId()}` : undefined;
  const targetPostServedTicketId = postServedTicketId || getLatestPostServedTicketId(previousCurrentItems);

  const unmatched = new Set(previousCurrentItems.map((_, index) => index));
  const findMatch = (nextItem: CartItem): number => {
    if (nextItem.kdsItemId) {
      const byKdsId = previousCurrentItems.findIndex((item, index) => unmatched.has(index) && item.kdsItemId === nextItem.kdsItemId);
      if (byKdsId >= 0) return byKdsId;
    }
    if (nextItem.savedBillLineId) {
      const byLineId = previousCurrentItems.findIndex((item, index) => unmatched.has(index) && item.savedBillLineId === nextItem.savedBillLineId);
      if (byLineId >= 0) return byLineId;
    }
    const fingerprint = getPosItemFingerprint(nextItem);
    return previousCurrentItems.findIndex((item, index) => unmatched.has(index) && getPosItemFingerprint(item) === fingerprint);
  };

  const canonicalItems: CartItem[] = previousItems.filter(isHistoricalPosRevision);
  const currentItems: CartItem[] = [];

  nextPosItems.forEach(nextItem => {
    const matchIndex = findMatch(nextItem);
    const existing = matchIndex >= 0 ? previousCurrentItems[matchIndex] : undefined;
    if (matchIndex >= 0) unmatched.delete(matchIndex);

    if (!existing) {
      const routed = isRouted(nextItem);
      const added: CartItem = {
        ...nextItem,
        kdsItemId: nextItem.kdsItemId || makeId(),
        kdsRouted: routed,
        status: routed ? OrderStatus.PENDING : OrderStatus.SERVED,
        kitchenStartedAt: undefined,
        kitchenCookedAt: undefined,
        kitchenCancelReason: undefined,
        cancelledBy: undefined,
        cancelledAt: undefined,
        cancelSource: undefined,
        kdsChangeType: 'ADDED',
        kdsChangedAt: now,
        ...(targetPostServedTicketId ? {
          kdsTicketId: targetPostServedTicketId,
          kdsTicketKind: 'POST_SERVED' as const,
        } : {}),
      };
      canonicalItems.push(added);
      currentItems.push(added);
      return;
    }

    const quantityChanged = Number(existing.quantity || 0) !== Number(nextItem.quantity || 0);
    const instructionChanged = quantityChanged || getPosItemFingerprint(existing) !== getPosItemFingerprint(nextItem);
    const requiresNewWork = instructionChanged && (
      wasFullyServed
      || !quantityChanged
      || Number(nextItem.quantity || 0) > Number(existing.quantity || 0)
    );
    if (instructionChanged) {
      canonicalItems.push({
        ...existing,
        kdsItemId: makeId(),
        savedBillLineId: undefined,
        status: OrderStatus.CANCELLED,
        kitchenCancelReason: quantityChanged
          ? `Quantity changed from x${existing.quantity} to x${nextItem.quantity}`
          : 'Item instruction changed via POS',
        kdsChangeType: 'SUPERSEDED',
        kdsChangedAt: now,
        ...(targetPostServedTicketId ? {
          kdsTicketId: targetPostServedTicketId,
          kdsTicketKind: 'POST_SERVED' as const,
        } : {}),
      });
    }

    const routed = existing.kdsRouted ?? isRouted(nextItem);
    const corrected: CartItem = {
      ...nextItem,
      kdsItemId: existing.kdsItemId || nextItem.kdsItemId || makeId(),
      kdsRouted: routed,
      status: requiresNewWork && routed
        ? OrderStatus.PENDING
        : getKdsItemStatus(existing, previousOrderStatus),
      kitchenStartedAt: requiresNewWork ? undefined : existing.kitchenStartedAt,
      kitchenCookedAt: requiresNewWork ? undefined : existing.kitchenCookedAt,
      kitchenCancelReason: instructionChanged ? undefined : existing.kitchenCancelReason,
      cancelledBy: instructionChanged ? undefined : existing.cancelledBy,
      cancelledAt: instructionChanged ? undefined : existing.cancelledAt,
      cancelSource: instructionChanged ? undefined : existing.cancelSource,
      kdsChangeType: instructionChanged ? 'CORRECTED' : existing.kdsChangeType,
      kdsChangedAt: instructionChanged ? now : existing.kdsChangedAt,
      ...(instructionChanged && targetPostServedTicketId ? {
        kdsTicketId: targetPostServedTicketId,
        kdsTicketKind: 'POST_SERVED' as const,
      } : {
        kdsTicketId: existing.kdsTicketId,
        kdsTicketKind: existing.kdsTicketKind,
      }),
    };
    canonicalItems.push(corrected);
    currentItems.push(corrected);
  });

  unmatched.forEach(index => {
    const existing = previousCurrentItems[index];
    if (getKdsItemStatus(existing, previousOrderStatus) === OrderStatus.CANCELLED) {
      canonicalItems.push(existing);
      return;
    }
    canonicalItems.push({
      ...existing,
      status: OrderStatus.CANCELLED,
      kitchenCancelReason: 'Cancelled via POS',
      cancelledAt: now,
      cancelSource: 'POS',
      kdsChangeType: 'REMOVED',
      kdsChangedAt: now,
      ...(postServedTicketId ? {
        kdsTicketId: postServedTicketId,
        kdsTicketKind: 'POST_SERVED' as const,
      } : {}),
    });
  });

  return {
    items: canonicalItems,
    currentItems,
    status: getAggregateKdsOrderStatus(canonicalItems, previousOrderStatus),
    createdPostServedTicket: Boolean(
      postServedTicketId && canonicalItems.some(item => item.kdsTicketId === postServedTicketId),
    ),
  };
};

/** Marks every routed, non-cancelled line so cancellation is durable and departmental. */
export const cancelOrderItemsForKds = (
  items: CartItem[],
  fallbackStatus: OrderStatus,
  reason = 'Order cancelled via POS',
  now = Date.now(),
): CartItem[] => items.map(item => {
  if (item.kdsRouted === false || getKdsItemStatus(item, fallbackStatus) === OrderStatus.CANCELLED) return item;
  return {
    ...item,
    status: OrderStatus.CANCELLED,
    kitchenCancelReason: reason,
    cancelledAt: now,
    cancelSource: 'POS',
    kdsChangeType: item.kdsChangeType === 'SUPERSEDED' ? item.kdsChangeType : 'REMOVED',
    kdsChangedAt: now,
  };
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

export interface CancelKdsItemOptions {
  reason?: string;
  cancelledBy?: string;
  now?: number;
  isInScope?: (item: CartItem) => boolean;
}

/** Cancels exactly one current, routed KDS line and attaches POS-readable audit metadata. */
export const cancelKdsItem = (
  items: CartItem[],
  fallbackStatus: OrderStatus,
  targetItem: CartItem,
  preferredIndex: number,
  options: CancelKdsItemOptions = {},
): { items: CartItem[]; cancelledValue: number } | null => {
  const targetIndex = findCurrentKdsItemIndex(items, targetItem, preferredIndex);
  if (targetIndex < 0) return null;

  const currentTarget = items[targetIndex];
  if (currentTarget.kdsRouted === false) return null;
  if (options.isInScope && !options.isInScope(currentTarget)) return null;
  if (getKdsItemStatus(currentTarget, fallbackStatus) === OrderStatus.CANCELLED) return null;

  const now = options.now ?? Date.now();
  const reason = options.reason?.trim() || undefined;
  return {
    items: items.map((item, index) => index === targetIndex ? {
      ...item,
      status: OrderStatus.CANCELLED,
      kitchenCancelReason: reason,
      cancelledBy: options.cancelledBy?.trim() || 'Kitchen',
      cancelledAt: now,
      cancelSource: 'KDS',
      kdsChangedAt: now,
    } : item),
    cancelledValue: Number(currentTarget.price || 0) * Number(currentTarget.quantity || 0),
  };
};
