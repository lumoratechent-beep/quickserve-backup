// lib/sharedSettings.ts
// Lightweight utility for syncing settings across users via the restaurants.settings JSONB column.
// No new tables or extra queries — piggybacks on the already-fetched restaurant data.

import { supabase } from './supabase';

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
