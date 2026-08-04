import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrip } from '../trip-model.js';
import { destinations } from '../destinations.js';
import { buildItinerary } from '../itinerary-engine.js';
import { buildBudget } from '../budget-engine.js';
import { rankDestinations, scoreDestination } from '../destination-engine.js';
import { calculateTripQuality } from '../trip-quality-engine.js';
import { constraintsPreserved, createUndoSnapshot, optimisePlan, restorePlan } from '../trip-optimizer.js';
import { createGpx, createJson, safeFilename } from '../gpx-generator.js';
import { migrateState, loadDraft, saveDraft } from '../storage.js';

const makeTrip = overrides => normalizeTrip({
  id: 'fixed-trip', tripName: 'Testreis', origin: 'Utrecht', startDate: '2026-07-01',
  days: 10, budget: 4000, adults: 2, children: 2, transport: 'car',
  maxDrive: 5, maxChanges: 6, comfort: 'mid', preferences: ['natuur', 'bergen', 'kinderen'],
  preferenceWeights: { natuur: 3, bergen: 3, kinderen: 2 }, ...overrides
});
const slovenia = destinations.find(item => item.id === 'slovenia');

test('Day 1 starts from the entered origin', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.days[0].from, 'Utrecht');
  assert.notEqual(plan.days[0].to, 'Utrecht');
});

test('Final day returns to the entered origin', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.days.at(-1).to, 'Utrecht');
  assert.equal(plan.days.at(-1).kind, 'return');
});

test('Origin is never treated as a destination stay', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.days.some(day => ['stay', 'flex', 'transfer'].includes(day.kind) && day.location === trip.origin), false);
});

test('Itinerary day count exactly matches the requested duration', () => {
  for (const days of [3, 5, 9, 14, 30]) assert.equal(buildItinerary(makeTrip({ days }), slovenia).days.length, days);
});

test('Maximum daily driving is respected for sufficient trips', () => {
  const trip = makeTrip({ days: 10, maxDrive: 5 }); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.feasible, true);
  assert.ok(Math.max(...plan.days.map(day => day.driveHours)) <= trip.maxDrive);
});

test('Insufficient-duration trips are explicit and still structurally complete', () => {
  const trip = makeTrip({ days: 3, maxDrive: 4 }); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.feasible, false);
  assert.equal(plan.days.length, trip.days);
  assert.ok(plan.warnings.some(item => item.includes('minimaal')));
  assert.ok(plan.days.some(day => day.exceedsDailyLimit));
});

test('Budget totals are internally consistent', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia); const budget = buildBudget(trip, slovenia, plan);
  assert.equal(budget.total, budget.rows.reduce((sum, [, value]) => sum + value, 0));
  assert.equal(budget.remaining, trip.budget - budget.total);
  assert.equal(budget.perDay, Math.round(budget.total / trip.days));
});

test('Destination rankings are stable for fixed inputs', () => {
  const trip = makeTrip();
  assert.deepEqual(rankDestinations(trip, destinations).map(item => [item.id, item.score]), rankDestinations(trip, destinations).map(item => [item.id, item.score]));
});

test('Trip-quality scores remain between 0 and 100', () => {
  const trip = makeTrip(); const destination = scoreDestination(trip, slovenia); const plan = buildItinerary(trip, destination); const budget = buildBudget(trip, destination, plan); const quality = calculateTripQuality(trip, destination, plan, budget);
  assert.ok(quality.overall >= 0 && quality.overall <= 100);
  Object.values(quality.dimensions).forEach(score => assert.ok(score >= 0 && score <= 100));
});

test('Optimisation preserves essential constraints', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia); const result = optimisePlan(trip, slovenia, plan);
  assert.equal(constraintsPreserved(plan, result.plan, trip), true);
  assert.equal(result.plan.days.length, trip.days);
  assert.equal(result.plan.days.at(-1).to, trip.origin);
});

test('Optimisation supports one-step undo', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia); const snapshot = createUndoSnapshot(plan); const optimized = optimisePlan(trip, slovenia, plan).plan;
  assert.notDeepEqual(optimized, plan);
  assert.deepEqual(restorePlan(snapshot), plan);
});

function assertWellFormedXml(xml) {
  const stripped = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!--.*?-->/gs, '');
  const stack = [];
  for (const match of stripped.matchAll(/<\/?([A-Za-z_:][\w:.-]*)(?:\s[^>]*)?\/?>/g)) {
    const token = match[0]; const name = match[1];
    if (token.startsWith('</')) assert.equal(stack.pop(), name, `Unexpected closing tag ${name}`);
    else if (!token.endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, []);
}

test('GPX is well-formed XML and only contains valid coordinates', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia); const xml = createGpx(trip, slovenia, plan);
  assertWellFormedXml(xml);
  assert.match(xml, /<gpx version="1\.1"/);
  for (const [, lat, lon] of xml.matchAll(/(?:wpt|trkpt) lat="([^"]+)" lon="([^"]+)"/g)) {
    assert.ok(Math.abs(Number(lat)) <= 90); assert.ok(Math.abs(Number(lon)) <= 180);
  }
});

test('JSON export is parseable and export filenames are safe', () => {
  const payload = { version: '0.6.0', trip: makeTrip() };
  assert.deepEqual(JSON.parse(createJson(payload)), payload);
  assert.equal(safeFilename('Slovenië / Test 2026', 'gpx'), 'slovenie-test-2026.gpx');
});

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

test('Old stored data migrates without crashing and discards stale derived plans', () => {
  const legacy = { trip: makeTrip(), destination: { id: 'slovenia' }, itinerary: [{ location: 'Saasveld' }], savedAt: '2026-01-01T00:00:00Z' };
  const migrated = migrateState(legacy);
  assert.equal(migrated.destinationId, 'slovenia');
  assert.equal(migrated.needsRebuild, true);
  assert.equal('itinerary' in migrated, false);
  const storage = new MemoryStorage(); storage.setItem('reisslim.current.v2', JSON.stringify(legacy));
  assert.doesNotThrow(() => loadDraft(storage));
  saveDraft(migrated, storage); assert.ok(storage.getItem('reisslim.current.v3'));
});
