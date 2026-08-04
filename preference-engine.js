const KEY = 'reisslim.preferences.v1';
const clone = value => JSON.parse(JSON.stringify(value));

export function emptyPreferenceProfile() {
  return { schemaVersion: 1, privateMode: false, activeProfile: 'default', profiles: { default: { name: 'Standaard', signals: {}, events: [] } } };
}

export function loadPreferenceProfile(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY) || 'null');
    return value?.schemaVersion === 1 ? value : emptyPreferenceProfile();
  } catch { return emptyPreferenceProfile(); }
}

export function savePreferenceProfile(profile, storage = globalThis.localStorage) {
  const safe = clone(profile || emptyPreferenceProfile());
  try { storage?.setItem(KEY, JSON.stringify(safe)); } catch { /* local-only and best effort */ }
  return safe;
}

export function recordPreferenceEvent(profile, event) {
  const next = clone(profile || emptyPreferenceProfile());
  if (next.privateMode) return next;
  const active = next.profiles[next.activeProfile] || next.profiles.default;
  const kindWeights = { select: 2, save: 3, dismiss: -3, compare: 1, apply: 2 };
  const weight = kindWeights[event.kind] || 0;
  active.events.push({ kind: event.kind, destinationId: event.destinationId || null, tags: [...(event.tags || [])].slice(0, 8), at: new Date().toISOString() });
  active.events = active.events.slice(-100);
  for (const tag of event.tags || []) {
    const previous = active.signals[tag] || { value: 0, evidence: 0, explicit: false };
    active.signals[tag] = { value: Math.max(-12, Math.min(12, previous.value + weight)), evidence: previous.evidence + 1, explicit: previous.explicit };
  }
  return next;
}

export function preferenceBonus(destination, profile) {
  if (!profile || profile.privateMode) return { score: 0, reasons: [] };
  const active = profile.profiles?.[profile.activeProfile] || profile.profiles?.default;
  const matches = (destination.tags || []).map(tag => ({ tag, signal: active?.signals?.[tag] })).filter(item => item.signal?.evidence >= 2);
  const raw = matches.reduce((sum, item) => sum + item.signal.value * Math.min(1, item.signal.evidence / 5), 0);
  return { score: Math.max(-6, Math.min(6, raw / 3)), reasons: matches.filter(item => item.signal.value > 0).map(item => item.tag).slice(0, 3) };
}

export function exportPreferences(profile) { return JSON.stringify(profile || emptyPreferenceProfile(), null, 2); }

export function importPreferences(text) {
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion !== 1 || !parsed.profiles || typeof parsed.profiles !== 'object') throw new Error('Dit is geen geldige ReisSlim-voorkeurenexport.');
  return clone(parsed);
}

export const preferenceStorageKey = KEY;
