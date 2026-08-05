import { ENGINE_VERSION, STORAGE_SCHEMA_VERSION } from './config.js';
import { normalizeTrip } from './trip-model.js';

export const STORAGE_KEYS = {
  current: 'reisslim.current.v9', trips: 'reisslim.trips.v9',
  legacyCurrent: ['reisslim.current.v8', 'reisslim.current.v7', 'reisslim.current.v6', 'reisslim.current.v5', 'reisslim.current.v4', 'reisslim.current.v3', 'reisslim.current.v2', 'reisslim.current'],
  legacyTrips: ['reisslim.trips.v8', 'reisslim.trips.v7', 'reisslim.trips.v6', 'reisslim.trips.v5', 'reisslim.trips.v4', 'reisslim.trips.v3', 'reisslim.trips.v2']
};

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function migrateState(input) {
  if (!input || typeof input !== 'object' || !input.trip) return null;
  const trip = normalizeTrip(input.trip);
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    trip,
    destinationId: input.destinationId || input.destination?.id || null,
    destinationProfile: input.destinationProfile?.dynamic ? input.destinationProfile : null,
    compareIds: Array.isArray(input.compareIds) ? input.compareIds.slice(0, 4) : [],
    savedProposalIds: Array.isArray(input.savedProposalIds) ? input.savedProposalIds : [],
    dismissedIds: Array.isArray(input.dismissedIds) ? input.dismissedIds : [],
    selectedVariantId: input.selectedVariantId || null,
    optimized: Boolean(input.optimized),
    needsRebuild: Number(input.schemaVersion) !== STORAGE_SCHEMA_VERSION
      || Number(input.engineVersion) !== ENGINE_VERSION
      || !input.plan,
    savedAt: input.savedAt || new Date().toISOString()
  };
}

function readFirst(storage, keys) {
  for (const key of keys) {
    let value = null;
    try { value = safeParse(storage.getItem(key), null); } catch { value = null; }
    if (value) return { key, value };
  }
  return null;
}

export function saveDraft(state, storage = localStorage) {
  const record = { ...state, schemaVersion: STORAGE_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, savedAt: new Date().toISOString() };
  storage.setItem(STORAGE_KEYS.current, JSON.stringify(record));
  return record;
}

export function loadDraft(storage = localStorage) {
  const found = readFirst(storage, [STORAGE_KEYS.current, ...STORAGE_KEYS.legacyCurrent]);
  if (!found) return null;
  const migrated = migrateState(found.value);
  if (migrated && found.key !== STORAGE_KEYS.current) {
    saveDraft(migrated, storage);
    try { storage.removeItem(found.key); } catch { /* best effort */ }
  }
  return migrated;
}

export function clearDraft(storage = localStorage) {
  [STORAGE_KEYS.current, ...STORAGE_KEYS.legacyCurrent].forEach(key => {
    try { storage.removeItem(key); } catch { /* best effort */ }
  });
}

export function loadTrips(storage = localStorage) {
  const found = readFirst(storage, [STORAGE_KEYS.trips, ...STORAGE_KEYS.legacyTrips]);
  const records = Array.isArray(found?.value) ? found.value.map(migrateState).filter(Boolean) : [];
  const sorted = records.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  if (found && found.key !== STORAGE_KEYS.trips) storage.setItem(STORAGE_KEYS.trips, JSON.stringify(sorted));
  return sorted;
}

export function saveTrip(state, storage = localStorage) {
  const record = saveDraft(state, storage);
  const existing = loadTrips(storage).filter(item => item.trip.id !== record.trip.id);
  const updated = [record, ...existing].slice(0, 20);
  storage.setItem(STORAGE_KEYS.trips, JSON.stringify(updated));
  return updated;
}

export function deleteTrip(id, storage = localStorage) {
  const updated = loadTrips(storage).filter(item => item.trip.id !== id);
  storage.setItem(STORAGE_KEYS.trips, JSON.stringify(updated));
  return updated;
}
