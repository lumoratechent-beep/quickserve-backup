// lib/sharedSettings.ts
// Lightweight utility for syncing settings across users via the restaurants.settings JSONB column.
// No new tables or extra queries — piggybacks on the already-fetched restaurant data.

import { supabase } from './supabase';

// ─── POS Settings Defaults (for delta compression) ─────────────────────────
// Used by compressPosSettings / expandPosSettings to store only non-default
// values in the DB, reducing per-write payload size by ~80–90% for typical
// restaurants that keep most settings at their defaults.
export const POS_DEFAULTS = {
  font: 'Inter',
  currency: 'MYR',
  receipt: {
    businessName: '',        // dynamic — always overridden by restaurant.name at expand time
    businessAddressLine1: '',
    businessAddressLine2: '',
    businessPhone: '',
    headerText: '',
    footerText: 'Thank you! Please come again.',
    showOrderNumber: true,
    showCashierName: false,
    showDateTime: true,
    showCustomerName: false,
    showTableNumber: true,
    showItems: true,
    showRemark: true,
    showTotal: true,
    showTaxes: false,
    showOrderSource: false,
    showAmountReceived: true,
    showChange: true,
    autoPrintAfterSale: false,
    printReceiptForRefund: false,
    openCashDrawerOnPayment: false,
    titleSize: 2,
    titleFont: 'A',
    titleAlignment: 'center',
    headerSize: 1,
    headerFont: 'A',
    headerAlignment: 'center',
    footerSize: 1,
    footerFont: 'A',
    footerAlignment: 'center',
  },
  orderList: {
    businessName: '',        // dynamic — always overridden by restaurant.name at expand time
    businessAddressLine1: '',
    businessAddressLine2: '',
    businessPhone: '',
    headerText: '',
    footerText: '',
    showOrderNumber: true,
    showCashierName: false,
    showDateTime: true,
    showCustomerName: false,
    showTableNumber: true,
    showItems: true,
    showItemPrice: false,
    showRemark: true,
    showTotal: false,
    showTaxes: false,
    showOrderSource: false,
    showAmountReceived: false,
    showChange: false,
    showPaymentMethod: false,
    autoPrintAfterSale: false,
    printReceiptForRefund: false,
    openCashDrawerOnPayment: false,
    titleSize: 2,
    titleFont: 'A',
    titleAlignment: 'center',
    headerSize: 1,
    headerFont: 'A',
    headerAlignment: 'center',
    footerSize: 1,
    footerFont: 'A',
    footerAlignment: 'center',
  },
  kitchenTicket: {
    printLargeOrderNumber: true,
    numberOfCopies: 1,
    autoPrintOnNewOrder: false,
  } as Record<string, unknown>,
  features: {
    autoPrintReceipt: false,
    autoOpenDrawer: false,
    dineInEnabled: true,
    takeawayEnabled: true,
    deliveryEnabled: false,
    savedBillEnabled: false,
    tableManagementEnabled: false,
    tableCount: 20,
    tableRows: 4,
    tableColumns: 5,
    floorEnabled: false,
    floorCount: 1,
    customerDisplayEnabled: false,
    kitchenEnabled: false,
    qrEnabled: false,
    tablesideOrderingEnabled: false,
    onlineShopEnabled: false,
    shiftEnabled: false,
  } as Record<string, unknown>,
  paymentTypes: [
    { id: 'cash', name: 'CASH' },
    { id: 'qr', name: 'QR' },
  ],
  kitchenSettings: { autoAccept: false, autoPrint: false } as Record<string, unknown>,
  qrOrderSettings: { autoApprove: false, autoPrint: false } as Record<string, unknown>,
  onlinePaymentMethods: [
    { id: 'cod', label: 'COD (Cash on Delivery)', enabled: true },
    { id: 'online', label: 'Online Payment', enabled: false },
  ],
  onlineDeliveryOptions: [
    { id: 'pickup', type: 'pickup', label: 'Pickup', enabled: true, fee: 0 },
    { id: 'lalamove', type: 'lalamove', label: 'Lalamove', enabled: false, fee: 0 },
    { id: 'postage', type: 'postage', label: 'Postage', enabled: false, fee: 0 },
  ],
};

// Keys managed by POS settings sync — everything else (backoffice, orderCode, etc.) passes through unchanged.
const POS_OWNED_KEYS = new Set([
  'font', 'currency', 'taxes', 'printers', 'receipt', 'orderList', 'receiptConfig', 'kitchenTicket', 'features',
  'paymentTypes', 'kitchenSettings', 'onlinePaymentMethods', 'onlineDeliveryOptions',
  'qrLocationLabel', 'qrOrderSettings', 'receiptFormatting',
]);

/** Look up a restaurant's name from the localStorage cache (used inside async helpers). */
function getRestaurantNameFromCache(restaurantId: string): string {
  try {
    const cached = localStorage.getItem('qs_cache_restaurants');
    if (!cached) return '';
    const list: Array<{ id: string; name: string }> = JSON.parse(cached);
    return list.find(r => r.id === restaurantId)?.name ?? '';
  } catch {
    return '';
  }
}

/**
 * Compress a full POS settings object to only store values that differ from defaults.
 * Non-POS keys (backoffice, orderCode, etc.) are passed through unchanged.
 * Always store the full version in localStorage for fast offline access;
 * only store the delta in the DB to reduce payload size (~80–90% for typical restaurants).
 */
export function compressPosSettings(
  settings: Record<string, any>,
  restaurantName: string,
): Record<string, any> {
  const result: Record<string, any> = {};

  // Pass through non-POS keys (backoffice, orderCode, etc.) unchanged.
  for (const [k, v] of Object.entries(settings)) {
    if (!POS_OWNED_KEYS.has(k)) result[k] = v;
  }

  // Scalar fields — omit when equal to default.
  if (settings.font !== undefined && settings.font !== POS_DEFAULTS.font) result.font = settings.font;
  if (settings.currency !== undefined && settings.currency !== POS_DEFAULTS.currency) result.currency = settings.currency;
  if (settings.qrLocationLabel) result.qrLocationLabel = settings.qrLocationLabel;

  // Empty-by-default arrays — omit entirely when empty.
  if (Array.isArray(settings.taxes) && settings.taxes.length > 0) result.taxes = settings.taxes;
  if (Array.isArray(settings.printers) && settings.printers.length > 0) result.printers = settings.printers;

  // receipt — only store fields that differ from defaults.
  if (settings.receipt && typeof settings.receipt === 'object') {
    const delta: Record<string, any> = {};
    const r = settings.receipt as Record<string, any>;
    const d = POS_DEFAULTS.receipt as Record<string, any>;
    if (r.businessName !== undefined && r.businessName !== restaurantName) delta.businessName = r.businessName;
    for (const key of Object.keys(d)) {
      if (key === 'businessName') continue;
      if (r[key] !== undefined && r[key] !== d[key]) delta[key] = r[key];
    }
    if (Object.keys(delta).length > 0) result.receipt = delta;
  }

  // orderList — only store fields that differ from defaults.
  if (settings.orderList && typeof settings.orderList === 'object') {
    const delta: Record<string, any> = {};
    const r = settings.orderList as Record<string, any>;
    const d = POS_DEFAULTS.orderList as Record<string, any>;
    if (r.businessName !== undefined && r.businessName !== restaurantName) delta.businessName = r.businessName;
    for (const key of Object.keys(d)) {
      if (key === 'businessName') continue;
      if (r[key] !== undefined && r[key] !== d[key]) delta[key] = r[key];
    }
    if (Object.keys(delta).length > 0) result.orderList = delta;
  }

  // features — only store fields that differ from defaults.
  if (settings.features && typeof settings.features === 'object') {
    const delta: Record<string, any> = {};
    for (const [k, v] of Object.entries(settings.features as Record<string, any>)) {
      if (v !== POS_DEFAULTS.features[k]) delta[k] = v;
    }
    if (Object.keys(delta).length > 0) result.features = delta;
  }

  // paymentTypes — store only if different from default.
  if (Array.isArray(settings.paymentTypes)) {
    if (JSON.stringify(settings.paymentTypes) !== JSON.stringify(POS_DEFAULTS.paymentTypes)) {
      result.paymentTypes = settings.paymentTypes;
    }
  }

  // kitchenSettings — only store fields that differ.
  if (settings.kitchenSettings && typeof settings.kitchenSettings === 'object') {
    const delta: Record<string, any> = {};
    for (const [k, v] of Object.entries(settings.kitchenSettings as Record<string, any>)) {
      if (v !== POS_DEFAULTS.kitchenSettings[k]) delta[k] = v;
    }
    if (Object.keys(delta).length > 0) result.kitchenSettings = delta;
  }

  // qrOrderSettings — only store fields that differ.
  if (settings.qrOrderSettings && typeof settings.qrOrderSettings === 'object') {
    const delta: Record<string, any> = {};
    for (const [k, v] of Object.entries(settings.qrOrderSettings as Record<string, any>)) {
      if (v !== POS_DEFAULTS.qrOrderSettings[k]) delta[k] = v;
    }
    if (Object.keys(delta).length > 0) result.qrOrderSettings = delta;
  }

  // onlinePaymentMethods — store only if different from default.
  if (Array.isArray(settings.onlinePaymentMethods)) {
    if (JSON.stringify(settings.onlinePaymentMethods) !== JSON.stringify(POS_DEFAULTS.onlinePaymentMethods)) {
      result.onlinePaymentMethods = settings.onlinePaymentMethods;
    }
  }

  // onlineDeliveryOptions — store only if different from default.
  if (Array.isArray(settings.onlineDeliveryOptions)) {
    if (JSON.stringify(settings.onlineDeliveryOptions) !== JSON.stringify(POS_DEFAULTS.onlineDeliveryOptions)) {
      result.onlineDeliveryOptions = settings.onlineDeliveryOptions;
    }
  }

  return result;
}

/**
 * Expand a compressed settings delta back to the full POS settings object.
 * Call this after reading settings from the DB so all consumers see a complete object.
 * Safe to call on already-expanded settings (backward compatible with old full-format DB rows).
 */
export function expandPosSettings(
  delta: Record<string, any>,
  restaurantName: string,
): Record<string, any> {
  const receiptDelta = delta.receipt && typeof delta.receipt === 'object'
    ? (delta.receipt as Record<string, any>)
    : {};
  const legacyAddress = typeof receiptDelta.businessAddress === 'string'
    ? receiptDelta.businessAddress
    : '';
  const orderListDelta = delta.orderList && typeof delta.orderList === 'object'
    ? (delta.orderList as Record<string, any>)
    : {};
  const orderListLegacyAddress = typeof orderListDelta.businessAddress === 'string'
    ? orderListDelta.businessAddress
    : '';

  return {
    ...delta,
    font: delta.font ?? POS_DEFAULTS.font,
    currency: delta.currency ?? POS_DEFAULTS.currency,
    taxes: delta.taxes ?? [],
    printers: delta.printers ?? [],
    receipt: {
      ...POS_DEFAULTS.receipt,
      businessName: restaurantName,
      ...receiptDelta,
      businessAddressLine1: receiptDelta.businessAddressLine1 ?? legacyAddress,
      businessAddressLine2: receiptDelta.businessAddressLine2 ?? POS_DEFAULTS.receipt.businessAddressLine2,
    },
    orderList: {
      ...POS_DEFAULTS.orderList,
      businessName: restaurantName,
      ...orderListDelta,
      businessAddressLine1: orderListDelta.businessAddressLine1 ?? orderListLegacyAddress,
      businessAddressLine2: orderListDelta.businessAddressLine2 ?? POS_DEFAULTS.orderList.businessAddressLine2,
    },
    features: {
      ...POS_DEFAULTS.features,
      ...(delta.features && typeof delta.features === 'object' ? delta.features : {}),
    },
    paymentTypes: delta.paymentTypes ?? POS_DEFAULTS.paymentTypes,
    kitchenTicket: {
      ...POS_DEFAULTS.kitchenTicket,
      ...(delta.kitchenTicket && typeof delta.kitchenTicket === 'object' ? delta.kitchenTicket : {}),
    },
    kitchenSettings: {
      ...POS_DEFAULTS.kitchenSettings,
      ...(delta.kitchenSettings && typeof delta.kitchenSettings === 'object' ? delta.kitchenSettings : {}),
    },
    qrOrderSettings: {
      ...POS_DEFAULTS.qrOrderSettings,
      ...(delta.qrOrderSettings && typeof delta.qrOrderSettings === 'object' ? delta.qrOrderSettings : {}),
    },
    onlinePaymentMethods: delta.onlinePaymentMethods ?? POS_DEFAULTS.onlinePaymentMethods,
    onlineDeliveryOptions: delta.onlineDeliveryOptions ?? POS_DEFAULTS.onlineDeliveryOptions,
  };
}

// ─── Back Office Data Sync ─────────────────────────────────────────────────
// Keeps localStorage as primary (fast) store; syncs to restaurants.settings.backoffice
// as a durable cross-device backup. Zero new tables, zero new queries.

const _pendingSync: Record<string, ReturnType<typeof setTimeout>> = {};
const SYNC_DELAY = 3000; // ms debounce

const BACKOFFICE_LS_KEYS: { local: (id: string) => string; remote: string }[] = [
  { local: id => `finance_${id}_expenses`, remote: 'expenses' },
  { local: id => `inv_${id}_suppliers`, remote: 'suppliers' },
  { local: id => `inv_${id}_purchase_orders`, remote: 'purchase_orders' },
  { local: id => `inv_${id}_transfer_orders`, remote: 'transfer_orders' },
  { local: id => `inv_${id}_adjustments`, remote: 'adjustments' },
  { local: id => `inv_${id}_counts`, remote: 'counts' },
  { local: id => `inv_${id}_productions`, remote: 'productions' },
  { local: id => `inv_${id}_history`, remote: 'history' },
  { local: id => `contact_${id}_customers`, remote: 'customers' },
  { local: id => `staff_${id}`, remote: 'staff' },
  { local: id => `stock_${id}`, remote: 'stock' },
];

// 12-month retention cutoff for timestamped entries
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

function pruneOldEntries(arr: any[]): any[] {
  const cutoff = Date.now() - RETENTION_MS;
  return arr.filter(e => {
    const ts = e.timestamp ?? e.createdAt ?? e.startedAt;
    return !ts || ts > cutoff;
  });
}

/**
 * Load back-office data: localStorage → settings.backoffice.{key} → fallback.
 * If localStorage is empty but JSONB has data, hydrate localStorage for speed next time.
 */
export function loadBackofficeData<T>(
  localStorageKey: string,
  restaurantSettings: Record<string, any> | undefined,
  remoteKey: string,
  fallback: T,
): T {
  try {
    const local = localStorage.getItem(localStorageKey);
    if (local) return JSON.parse(local);
  } catch { /* ignore */ }

  const dbValue = restaurantSettings?.backoffice?.[remoteKey];
  if (dbValue !== undefined && dbValue !== null) {
    try { localStorage.setItem(localStorageKey, JSON.stringify(dbValue)); } catch { /* ignore */ }
    return dbValue as T;
  }
  return fallback;
}

/**
 * Debounced sync of ALL back-office localStorage data into restaurants.settings.backoffice.
 * Call after any save; multiple rapid saves batch into one DB write.
 */
export function syncBackofficeToDb(restaurantId: string) {
  if (_pendingSync[restaurantId]) clearTimeout(_pendingSync[restaurantId]);
  _pendingSync[restaurantId] = setTimeout(async () => {
    delete _pendingSync[restaurantId];

    const backoffice: Record<string, any> = {};
    for (const { local, remote } of BACKOFFICE_LS_KEYS) {
      try {
        const raw = localStorage.getItem(local(restaurantId));
        if (raw) {
          let parsed = JSON.parse(raw);
          // prune timestamped arrays to keep JSONB lean
          if (Array.isArray(parsed) && ['adjustments', 'history'].includes(remote)) {
            parsed = pruneOldEntries(parsed);
          }
          backoffice[remote] = parsed;
        }
      } catch { /* skip corrupt keys */ }
    }

    let currentSettings: Record<string, any> = {};
    try {
      const cached = localStorage.getItem(`qs_settings_${restaurantId}`);
      if (cached) currentSettings = JSON.parse(cached);
    } catch { /* ignore */ }

    await saveSettingsToDb(restaurantId, currentSettings, 'backoffice', backoffice);
  }, SYNC_DELAY);
}

/**
 * Save a settings sub-key to the restaurants.settings JSONB column.
 * Merges the new value into the existing settings object so other keys are preserved.
 * Also caches to localStorage for offline access.
 */
export async function saveSettingsToDb(
  restaurantId: string,
  currentSettings: Record<string, any> | undefined,
  key: string,
  value: any
): Promise<boolean> {
  const merged = {
    ...(currentSettings || {}),
    [key]: value,
  };

  // Cache FULL version to localStorage for fast offline access.
  localStorage.setItem(`qs_settings_${restaurantId}`, JSON.stringify(merged));

  // Compress POS settings before DB write to reduce payload size.
  const restaurantName = getRestaurantNameFromCache(restaurantId);
  const toStore = compressPosSettings(merged, restaurantName);

  try {
    const { error } = await supabase
      .from('restaurants')
      .update({ settings: toStore })
      .eq('id', restaurantId);

    if (error) {
      console.warn(`Cloud save failed for settings.${key}:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`Cloud save failed for settings.${key}:`, e);
    return false;
  }
}

/**
 * Save the complete settings bundle for a restaurant to the DB and localStorage cache.
 * Use this when multiple settings change at once to avoid partial overwrites.
 */
export async function saveAllSettingsToDb(
  restaurantId: string,
  settings: Record<string, any>,
  restaurantName?: string,
): Promise<boolean> {
  // Always persist FULL version to localStorage for fast offline access.
  localStorage.setItem(`qs_settings_${restaurantId}`, JSON.stringify(settings));

  // Compress POS settings before DB write to reduce payload size.
  const name = restaurantName ?? getRestaurantNameFromCache(restaurantId);
  const toStore = compressPosSettings(settings, name);

  try {
    const { error } = await supabase
      .from('restaurants')
      .update({ settings: toStore })
      .eq('id', restaurantId);

    if (error) {
      console.warn('Cloud save failed for settings bundle:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Cloud save failed for settings bundle:', e);
    return false;
  }
}

/**
 * Load a settings sub-key. Priority: DB (restaurant.settings) > localStorage > defaults.
 * Since restaurant data is already fetched and passed as a prop, this is zero-cost.
 */
export function loadSharedSetting<T>(
  restaurantSettings: Record<string, any> | undefined,
  key: string,
  localStorageKey: string,
  defaults: T
): T {
  // 1. Try DB value (already in memory via restaurant prop)
  const dbValue = restaurantSettings?.[key];
  if (dbValue !== undefined && dbValue !== null) {
    if (typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults) && typeof dbValue === 'object' && !Array.isArray(dbValue)) {
      return { ...defaults, ...dbValue } as T;
    }
    return dbValue as T;
  }

  // 2. Try localStorage fallback
  try {
    const local = localStorage.getItem(localStorageKey);
    if (local) {
      const parsed = JSON.parse(local);
      if (typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults) && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...defaults, ...parsed } as T;
      }
      return parsed as T;
    }
  } catch {
    // ignore parse errors
  }

  // 3. Defaults
  return defaults;
}

// ─── Cross-Device Settings Sync ─────────────────────────────────────────────
// Fetch and update settings from the server to ensure consistency across devices.

/**
 * Fetch restaurant settings from the server (GET /api/settings).
 * Use this on app initialization to hydrate settings from the latest server state.
 */
export async function fetchSettingsFromServer(restaurantId: string): Promise<Record<string, any> | null> {
  try {
    const response = await fetch(`/api/settings?restaurantId=${restaurantId}`);
    if (!response.ok) {
      console.warn(`Failed to fetch settings: ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    return data.settings || {};
  } catch (error) {
    console.warn('Failed to fetch settings from server:', error);
    return null;
  }
}

/**
 * Update a specific feature flag on the server (POST /api/settings).
 * Call this when a feature is toggled to ensure cross-device sync.
 */
export async function updateFeatureOnServer(
  restaurantId: string,
  featureName: string,
  enabled: boolean,
  currentSettings: Record<string, any>
): Promise<boolean> {
  try {
    const updated = {
      ...currentSettings,
      features: {
        ...currentSettings.features,
        [featureName]: enabled,
      },
    };

    const response = await fetch(`/api/settings?restaurantId=${restaurantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: updated }),
    });

    if (!response.ok) {
      console.warn(`Failed to update feature: ${response.statusText}`);
      return false;
    }

    // Update localStorage cache
    localStorage.setItem(`qs_settings_${restaurantId}`, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.warn(`Failed to update feature on server:`, error);
    return false;
  }
}

/**
 * Update any settings sub-key on the server (POST /api/settings).
 * Generic function for syncing any settings changes.
 */
export async function updateSettingOnServer(
  restaurantId: string,
  key: string,
  value: any,
  currentSettings: Record<string, any>
): Promise<boolean> {
  try {
    const updated = {
      ...currentSettings,
      [key]: value,
    };

    const response = await fetch(`/api/settings?restaurantId=${restaurantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: updated }),
    });

    if (!response.ok) {
      console.warn(`Failed to update setting: ${response.statusText}`);
      return false;
    }

    // Update localStorage cache
    localStorage.setItem(`qs_settings_${restaurantId}`, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.warn(`Failed to update setting on server:`, error);
    return false;
  }
}
