const CURRENT_KEY = 'reisslim.current.v2';
const LEGACY_CURRENT_KEY = 'reisslim.current';
const TRIPS_KEY = 'reisslim.trips.v2';

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function saveDraft(data) {
  localStorage.setItem(CURRENT_KEY, JSON.stringify({...data, savedAt: new Date().toISOString()}));
}

export function loadDraft() {
  const current = safeParse(localStorage.getItem(CURRENT_KEY), null);
  if (current) return current;
  const legacy = safeParse(localStorage.getItem(LEGACY_CURRENT_KEY), null);
  if (legacy) {
    saveDraft(legacy);
    localStorage.removeItem(LEGACY_CURRENT_KEY);
  }
  return legacy;
}

export function clearDraft() {
  localStorage.removeItem(CURRENT_KEY);
  localStorage.removeItem(LEGACY_CURRENT_KEY);
}

export function saveTrip(data) {
  const all = loadTrips();
  const record = {...data, savedAt: new Date().toISOString()};
  const tripId = record.trip?.id;
  const withoutCurrent = tripId ? all.filter(x => x.trip?.id !== tripId) : all;
  const updated = [record, ...withoutCurrent].slice(0, 20);
  localStorage.setItem(TRIPS_KEY, JSON.stringify(updated));
  return updated;
}

export function loadTrips() {
  return safeParse(localStorage.getItem(TRIPS_KEY), []);
}

// Backwards-compatible aliases used by earlier builds.
export const saveCurrent = saveDraft;
export const loadCurrent = loadDraft;
export const clearCurrent = clearDraft;
