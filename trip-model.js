import { originCatalog, preferenceDefinitions, transportProfiles } from './config.js';

const FIELD_IDS = ['tripName', 'origin', 'startDate', 'days', 'budget', 'adults', 'children', 'transport', 'maxDrive', 'maxChanges', 'comfort', 'notes'];

export function uniqueId() {
  return globalThis.crypto?.randomUUID?.() || `trip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function localDate(offsetDays = 0, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function resolveOrigin(origin) {
  const key = String(origin || '').trim().toLocaleLowerCase('nl-NL');
  return originCatalog[key] ? { ...originCatalog[key] } : null;
}

export function normalizeTrip(input = {}) {
  const preferences = Array.isArray(input.preferences)
    ? input.preferences.filter(id => preferenceDefinitions.some(([known]) => known === id))
    : [];
  const weights = Object.fromEntries(preferences.map(id => [id, Math.max(1, Math.min(3, Number(input.preferenceWeights?.[id]) || 2))]));
  return {
    id: input.id || uniqueId(),
    tripName: String(input.tripName || '').trim().slice(0, 60),
    origin: String(input.origin || '').trim(),
    startDate: String(input.startDate || ''),
    days: Number(input.days),
    budget: Number(input.budget),
    adults: Number(input.adults),
    children: Number(input.children || 0),
    transport: transportProfiles[input.transport] ? input.transport : 'car',
    maxDrive: Number(input.maxDrive),
    maxChanges: Number(input.maxChanges),
    comfort: ['budget', 'mid', 'comfort'].includes(input.comfort) ? input.comfort : 'mid',
    notes: String(input.notes || '').trim().slice(0, 500),
    preferences,
    preferenceWeights: weights,
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

export function validateTripInput(trip) {
  const errors = [];
  if (!trip.origin) errors.push('Vul een vertrekplaats in.');
  if (!trip.startDate || Number.isNaN(new Date(`${trip.startDate}T12:00:00`).getTime())) errors.push('Kies een geldige startdatum.');
  if (!Number.isInteger(trip.days) || trip.days < 3 || trip.days > 30) errors.push('Kies 3 tot 30 reisdagen.');
  if (!Number.isFinite(trip.budget) || trip.budget < 500) errors.push('Het budget moet minimaal €500 zijn.');
  if (!Number.isInteger(trip.adults) || trip.adults < 1 || trip.adults > 8) errors.push('Kies 1 tot 8 volwassenen.');
  if (!Number.isInteger(trip.children) || trip.children < 0 || trip.children > 8) errors.push('Kies 0 tot 8 kinderen.');
  if (!Number.isFinite(trip.maxDrive) || trip.maxDrive < 2 || trip.maxDrive > 10) errors.push('Kies 2 tot 10 uur maximale rijtijd per dag.');
  if (!Number.isInteger(trip.maxChanges) || trip.maxChanges < 1 || trip.maxChanges > 10) errors.push('Kies 1 tot 10 accommodatiewissels.');
  return errors;
}

export function getFormElements(root = document) {
  return Object.fromEntries(FIELD_IDS.map(id => [id, root.getElementById(id)]));
}

export function readTripForm(existingId = null, root = document) {
  const form = getFormElements(root);
  const preferences = [...root.querySelectorAll('[data-pref]:checked')].map(element => element.value);
  const preferenceWeights = Object.fromEntries(preferences.map(id => [id, Number(root.querySelector(`[data-priority="${id}"]`)?.value || 2)]));
  return normalizeTrip({
    id: existingId || undefined,
    ...Object.fromEntries(Object.entries(form).map(([key, element]) => [key, element?.value])),
    preferences,
    preferenceWeights
  });
}

export function writeTripForm(trip = {}, root = document) {
  const form = getFormElements(root);
  for (const [key, element] of Object.entries(form)) {
    if (element && trip[key] !== undefined && trip[key] !== null) element.value = String(trip[key]);
  }
  root.querySelectorAll('[data-pref]').forEach(box => { box.checked = trip.preferences?.includes(box.value) || false; });
  root.querySelectorAll('[data-priority]').forEach(select => {
    const selected = root.querySelector(`[data-pref][value="${select.dataset.priority}"]`)?.checked;
    select.value = String(trip.preferenceWeights?.[select.dataset.priority] || 2);
    select.disabled = !selected;
  });
}
