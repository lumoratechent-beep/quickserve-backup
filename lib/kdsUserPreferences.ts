import { supabase } from './supabase';

export type KdsTicketFontSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'EXTRA_LARGE';
export type KdsAlertSound = 'CLASSIC' | 'DOUBLE_BEEP' | 'URGENT_BEEP' | 'KDS_CHIME' | 'SIREN' | 'LONG_BEEP';

export interface KdsUserPreferences {
  ticketsPerPage?: 3 | 4 | 5;
  fontSize?: KdsTicketFontSize;
  alertSound?: KdsAlertSound;
  autoServe?: boolean;
  selectedPrinterId?: string;
}

export const KDS_USER_PREFERENCE_DEFAULTS: Required<Omit<KdsUserPreferences, 'selectedPrinterId'>> & { selectedPrinterId: string } = {
  ticketsPerPage: 4,
  fontSize: 'LARGE',
  alertSound: 'SIREN',
  autoServe: false,
  selectedPrinterId: '',
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

export async function fetchKdsUserPreferences(userId: string): Promise<KdsUserPreferences | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    console.warn('Failed to fetch KDS user preferences:', error?.message || 'User not found');
    return null;
  }

  const preferences = isObject(data.preferences) ? data.preferences.kds : null;
  return isObject(preferences) ? preferences as KdsUserPreferences : {};
}

export async function saveKdsUserPreference<K extends keyof KdsUserPreferences>(
  userId: string,
  key: K,
  value: KdsUserPreferences[K] | null,
): Promise<boolean> {
  if (!userId) return false;
  const valueToStore = value === KDS_USER_PREFERENCE_DEFAULTS[key] ? null : value;
  const { error } = await supabase.rpc('set_user_kds_preference', {
    p_user_id: userId,
    p_key: key,
    p_value: valueToStore,
  });

  if (error) {
    console.warn('Failed to save KDS user preference:', error.message);
    return false;
  }
  return true;
}