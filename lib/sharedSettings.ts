// lib/sharedSettings.ts
// Lightweight utility for syncing settings across users via the restaurants.settings JSONB column.
// No new tables or extra queries — piggybacks on the already-fetched restaurant data.

import { supabase } from './supabase';

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

  // Cache to localStorage immediately
  localStorage.setItem(`qs_settings_${restaurantId}`, JSON.stringify(merged));

  try {
    const { error } = await supabase
      .from('restaurants')
      .update({ settings: merged })
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
  settings: Record<string, any>
): Promise<boolean> {
  // Always persist to localStorage for offline access
  localStorage.setItem(`qs_settings_${restaurantId}`, JSON.stringify(settings));

  try {
    const { error } = await supabase
      .from('restaurants')
      .update({ settings })
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
