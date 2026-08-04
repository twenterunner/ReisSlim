export const preferenceDefinitions = [
  ['natuur','Natuur'],['bergen','Bergen'],['zwemmen','Zwemmen'],['wandelen','Wandelen'],
  ['kinderen','Kindvriendelijk'],['motor','Mooie wegen'],['cultuur','Cultuur'],['eten','Eten'],
  ['kust','Kust'],['budget','Budget']
];

const FIELD_IDS = ['origin','startDate','days','budget','adults','children','transport','maxDrive','maxChanges','comfort','notes'];

export function getFormElements() {
  return Object.fromEntries(FIELD_IDS.map(id => [id, document.getElementById(id)]));
}

export function readTripForm(existingId = null) {
  const f = getFormElements();
  const selected = [...document.querySelectorAll('[data-pref]:checked')].map(x => x.value);
  return {
    id: existingId || crypto.randomUUID(),
    origin: f.origin.value.trim(),
    startDate: f.startDate.value,
    days: Number(f.days.value),
    budget: Number(f.budget.value),
    adults: Number(f.adults.value),
    children: Number(f.children.value),
    transport: f.transport.value,
    maxDrive: Number(f.maxDrive.value),
    maxChanges: Number(f.maxChanges.value),
    comfort: f.comfort.value,
    notes: f.notes.value.trim(),
    preferences: selected,
    updatedAt: new Date().toISOString()
  };
}

export function writeTripForm(trip = {}) {
  const f = getFormElements();
  for (const [key, el] of Object.entries(f)) {
    if (!el || trip[key] === undefined || trip[key] === null) continue;
    el.value = String(trip[key]);
  }
  if (Array.isArray(trip.preferences)) {
    document.querySelectorAll('[data-pref]').forEach(box => {
      box.checked = trip.preferences.includes(box.value);
    });
  }
}

export function validateFormTrip(trip) {
  const errors = [];
  if (!trip.origin) errors.push('Vul een vertrekplaats in.');
  if (!trip.startDate) errors.push('Kies een startdatum.');
  if (!Number.isFinite(trip.days) || trip.days < 3 || trip.days > 30) errors.push('Kies 3 tot 30 reisdagen.');
  if (!Number.isFinite(trip.budget) || trip.budget < 500) errors.push('Het budget moet minimaal €500 zijn.');
  if (!Number.isFinite(trip.adults) || trip.adults < 1) errors.push('Er moet minimaal één volwassene reizen.');
  if (!Number.isFinite(trip.maxDrive) || trip.maxDrive < 2 || trip.maxDrive > 10) errors.push('Kies 2 tot 10 uur maximale rijtijd per dag.');
  return errors;
}
