# Cross-Device Settings Sync Implementation

## Problem
Kitchen installation status and other settings were not syncing across devices. If you uninstalled kitchen on your PC, it would still be installed when you logged in on your phone.

## Solution Overview
Implemented a three-layer sync mechanism:
1. **API Layer** (`/api/settings.ts`) - GET/POST endpoints for fetching and updating restaurant settings
2. **Library Layer** (`lib/sharedSettings.ts`) - Server sync functions using the new API
3. **UI Layer** - Updated components to POST changes to server when buttons are clicked

## What Changed

### 1. New API Endpoint: `/api/settings.ts`
- **GET** `/api/settings?restaurantId=<id>` - Fetch current restaurant settings from server
- **POST** `/api/settings?restaurantId=<id>` - Update restaurant settings with JSON body `{ settings: {...} }`

### 2. Updated `lib/sharedSettings.ts`
Added three new functions:

#### `fetchSettingsFromServer(restaurantId: string)`
- Fetches latest settings from the server on app initialization
- Called on component mount to ensure cross-device consistency
- Returns the settings object or null on error

#### `updateFeatureOnServer(restaurantId, featureName, enabled, currentSettings)`
- Updates a single feature flag (e.g., kitchenEnabled, tableManagementEnabled)
- Merges new value with currentSettings
- Updates both server and localStorage cache
- Returns boolean success/failure

#### `updateSettingOnServer(restaurantId, key, value, currentSettings)`
- Generic function for updating any settings sub-key (not just features)
- Used for kitchen settings, payment methods, etc.
- Maintains localStorage cache for offline access

### 3. Updated `pages/PosOnlyView.tsx`
- Imported new sync functions
- Added useEffect to fetch fresh settings from server on mount
- Updated `updateFeatureSetting()` to:
  - Call `updateFeatureOnServer()` for all feature toggles
  - Maintain backward compatibility with kitchen_enabled DB column
  - Handle network failures gracefully with localStorage fallback

### 4. Updated `components/OrderSettings.tsx`
- Added restaurantId and currentSettings props
- Created handler functions that sync to server:
  - `handleToggleAccept()` - Syncs kitchenSettings.autoAccept
  - `handleTogglePrint()` - Syncs kitchenSettings.autoPrint
- Calls POST endpoint when settings change

## How It Works

### On Feature Toggle (e.g., Kitchen Install/Uninstall)
1. User clicks install/uninstall button
2. `updateFeatureSetting()` is called
3. Local state updates immediately (fast UX)
4. `updateFeatureOnServer()` is called in background
5. Server updates restaurants.settings JSONB column
6. Other devices fetch fresh settings on next page load or via polling

### On App Initialization
1. Component mounts with feature settings from localStorage
2. `useEffect` fires and calls `fetchSettingsFromServer()`
3. Server returns latest settings
4. Component updates state with server values
5. If server has different values, they override localStorage

### Network Resilience
- If server POST fails, localStorage is still updated
- If server GET fails, defaults to localStorage/passed values
- App remains functional offline with localStorage cache

## Settings Priority
**During Load:**
1. DB (restaurant.settings) - highest priority
2. localStorage - fallback
3. Defaults - lowest priority

**During Save:**
1. Update state immediately (optimistic)
2. POST to server in background
3. Cache in localStorage regardless

## Cookies & Backoffice Data
The same pattern can be extended to:
- Taxes configuration
- Payment methods
- Printer settings
- Kitchen categories
- Any other JSONB stored setting

Just call `updateSettingOnServer()` with the appropriate key and value.

## Example Usage

### In a Component
```typescript
// Import the sync function
import { updateSettingOnServer } from '../lib/sharedSettings';

// When user changes a setting
const handleSaveSetting = async () => {
  const updated = { ...currentSettings, myKey: myValue };
  const success = await updateSettingOnServer(
    restaurantId,
    'myKey',
    myValue,
    currentSettings
  );
  if (!success) {
    toast('Failed to save to server, but local changes saved', 'warning');
  }
};
```

## Database Changes
No new tables needed. Uses existing:
- `restaurants.settings` - JSONB column for POS/feature settings
- `restaurants.kitchen_enabled` - Column for login API compatibility

## Backward Compatibility
- Old code paths still work (localStorage only)
- Server sync is non-blocking
- Graceful degradation if API fails
- `kitchen_enabled` column still synced for login API checks

## Testing Checklist
- [ ] Toggle kitchen on/off on PC
- [ ] Log in on phone - kitchen status matches PC
- [ ] Toggle payment settings - sync across devices
- [ ] Toggle other features (dine-in, takeaway, etc.)
- [ ] Test offline toggle (should work, sync when back online)
- [ ] Check network delay doesn't break UI
- [ ] Verify localStorage/DB consistency
