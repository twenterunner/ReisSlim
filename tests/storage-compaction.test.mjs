import test from 'node:test';
import assert from 'node:assert/strict';

import { buildItinerary } from '../itinerary-engine.js';
import { buildProposalPortfolio } from '../proposal-engine.js';
import {
  COMPACT_SNAPSHOT_FORMAT,
  MAX_SAVED_RECORD_CHARACTERS,
  STORAGE_KEYS,
  compactSavedState,
  loadDraft,
  loadTrips,
  migrateState,
  saveDraft,
  saveTrip
} from '../storage.js';
import { normalizeTrip } from '../trip-model.js';

class MemoryStorage {
  constructor(maximumCharacters = Infinity) {
    this.data = new Map();
    this.maximumCharacters = maximumCharacters;
  }

  getItem(key) { return this.data.get(key) ?? null; }

  setItem(key, value) {
    const text = String(value);
    const next = new Map(this.data); next.set(key, text);
    const size = [...next.entries()].reduce((sum, [itemKey, itemValue]) => sum + itemKey.length + itemValue.length, 0);
    if (size > this.maximumCharacters) {
      const error = new Error('recorded localStorage quota'); error.name = 'QuotaExceededError'; error.code = 22;
      throw error;
    }
    this.data = next;
  }

  removeItem(key) { this.data.delete(key); }

  size() { return [...this.data.entries()].reduce((sum, [key, value]) => sum + key.length + value.length, 0); }
}

function trip(id = 'saved-trip', overrides = {}) {
  return normalizeTrip({
    id, tripName: `Saved ${id}`, origin: 'Saasveld', originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    destinationQuery: 'Testland', startDate: '2027-06-01', days: 8, budget: 8000, adults: 2, children: 0,
    transport: 'car', travelMode: 'fly-drive', routeTopology: 'loop', tripPace: 'balanced', routeStyle: 'balanced',
    fuelRangeKm: 600, maxDrive: 8, maxChanges: 7, comfort: 'mid', strictBudget: true, strictDrive: true,
    strictChanges: true, liveData: false, preferences: ['natuur'], preferenceWeights: { natuur: 3 }, ...overrides
  });
}

function richDestination({ recommendationCount = 360, geometryPoints = 600, vehicle = 'car' } = {}) {
  const bases = [
    { id: 'base-a', providerId: 'node/a', name: 'Alpha', lat: -33.9, lon: 18.4, tags: ['natuur'], vehicleFit: { car: 'supported', motorcycle: 'supported' } },
    { id: 'base-b', providerId: 'node/b', name: 'Bravo', lat: -33.2, lon: 19.2, tags: ['natuur'], vehicleFit: { car: 'supported', motorcycle: 'supported' } },
    { id: 'base-c', providerId: 'node/c', name: 'Charlie', lat: -32.8, lon: 18.7, tags: ['cultuur'], vehicleFit: { car: 'supported', motorcycle: 'supported' } }
  ];
  const highlights = bases.map((base, index) => ({
    id: base.id, providerId: base.providerId, name: base.name, baseName: base.name,
    point: { lat: base.lat, lon: base.lon }, overnightPoint: { lat: base.lat, lon: base.lon }, sequence: index,
    priority: 9 - index, minimumTripDays: 3, minimumNights: 1, tags: base.tags,
    activity: `Named activity in ${base.name}`, rainAlternative: `Named museum in ${base.name}`,
    gateway: index === 0, vehicleFit: base.vehicleFit, catalogue: true
  }));
  const corridors = [
    ['a-b', bases[0], bases[1]], ['b-c', bases[1], bases[2]], ['c-a', bases[2], bases[0]]
  ].map(([id, from, to]) => ({
    id, fromAnchorId: from.id, toAnchorId: to.id, from: from.id, to: to.id,
    distanceKm: 130, carMovingHours: 2, motorcycleMovingHours: 2.2, surface: ['asphalt'],
    fuelServiceSpacingKm: 70, vehicleCompatibility: { car: 'supported', motorcycle: 'supported' },
    evidence: ['Recorded road evidence'], fallbackGeometry: Array.from({ length: geometryPoints }, (_, index) => ({
      lat: from.lat + (to.lat - from.lat) * index / Math.max(1, geometryPoints - 1),
      lon: from.lon + (to.lon - from.lon) * index / Math.max(1, geometryPoints - 1)
    }))
  }));
  const types = ['activity', 'accommodation', 'restaurant', 'fuel', 'rest', 'service'];
  const catalogueRecommendations = Array.from({ length: recommendationCount }, (_, index) => {
    const base = bases[index % bases.length];
    const type = types[index % types.length];
    return {
      id: `recommendation-${index}`, providerId: `node/${10000 + index}`, provider: 'Recorded provider',
      name: `Named ${type} ${index}`, type, point: { lat: base.lat + index / 100000, lon: base.lon + index / 100000 },
      associatedBase: base.name, vehicleFit: { car: 'supported', motorcycle: 'supported' },
      source: 'Recorded provider', sourceUrl: `https://example.test/${index}`, confidence: 0.8,
      reason: 'x'.repeat(4000), catalogue: true
    };
  });
  return {
    id: 'catalog-testland-alpha', name: 'Alpha regional loop', country: 'Testland', countryCode: 'TS', regionId: 'TS:alpha',
    dynamic: true, catalogue: true, vehicleProfileId: vehicle, distanceKm: 900, driveHours: 12,
    nightMid: 120, activityDaily: 35, toll: 10, tags: ['natuur', 'cultuur'], season: [4, 5, 6, 7, 8, 9],
    family: 8, motorcycle: 8, camper: 5, weather: 5, crowds: 5,
    summary: 'Source-backed regional loop.', pros: ['Named evidence'], cons: ['Availability unverified'],
    bases, accessGateway: bases[0], highlights,
    activities: highlights.map(item => ({ type: item.tags[0], title: item.activity, rainAlternative: item.rainAlternative, tags: item.tags })),
    corridors, catalogueRecommendations, routeStops: [], evidence: { anchors: 3, corridors: 3 },
    provider: { name: 'Recorded provider', sourceUrl: 'https://example.test/source', confidence: 'reasonable' },
    destinationScope: { geographicType: 'country-region', providerId: 'TS' }, roadDistanceFactor: 1.16
  };
}

test('saved drafts omit derived plans and compact heavy evidence while retaining an offline-rebuildable profile', () => {
  const storage = new MemoryStorage();
  const currentTrip = trip();
  const destinationProfile = richDestination();
  const largePlan = { days: Array.from({ length: 8 }, (_, day) => ({ day: day + 1, geometry: Array.from({ length: 2000 }, (_, index) => ({ lat: index / 100, lon: index / 100 })) })) };
  const originalSize = JSON.stringify({ trip: currentTrip, destinationProfile, plan: largePlan }).length;
  const record = saveDraft({ trip: currentTrip, destinationId: destinationProfile.id, destinationProfile, plan: largePlan }, storage);
  const stored = JSON.parse(storage.getItem(STORAGE_KEYS.current));

  assert.equal(record.snapshotFormat, COMPACT_SNAPSHOT_FORMAT);
  assert.equal(Object.hasOwn(stored, 'plan'), false);
  assert.equal(stored.needsRebuild, true);
  assert.ok(JSON.stringify(stored).length <= MAX_SAVED_RECORD_CHARACTERS);
  assert.ok(JSON.stringify(stored).length < originalSize / 5);
  assert.ok(stored.destinationProfile.catalogueRecommendations.some(item => item.name.startsWith('Named accommodation')));
  assert.ok(stored.destinationProfile.corridors.every(item => item.fallbackGeometry.length <= 2));

  const restored = loadDraft(storage);
  const rebuilt = buildItinerary(restored.trip, restored.destinationProfile);
  assert.equal(rebuilt.days.length, restored.trip.days);
  assert.equal(rebuilt.days[0].from, restored.trip.origin);
  assert.equal(rebuilt.days.at(-1).to, restored.trip.origin);
  const portfolio = buildProposalPortfolio(restored.trip, [restored.destinationProfile]);
  assert.ok(portfolio.candidates.some(item => item.id === restored.destinationId));
});

test('current-schema full snapshots migrate in place to compact rebuild records', () => {
  const storage = new MemoryStorage();
  const destinationProfile = richDestination({ recommendationCount: 40, geometryPoints: 30 });
  storage.setItem(STORAGE_KEYS.current, JSON.stringify({
    schemaVersion: 10, engineVersion: 11, trip: trip('legacy-current'), destinationId: destinationProfile.id,
    destinationProfile, plan: { days: [{ day: 1, vehicleProfileId: 'car' }] }, savedAt: '2027-01-01T00:00:00.000Z'
  }));
  const restored = loadDraft(storage);
  const rewritten = JSON.parse(storage.getItem(STORAGE_KEYS.current));
  assert.equal(restored.schemaVersion, 10);
  assert.equal(restored.snapshotFormat, COMPACT_SNAPSHOT_FORMAT);
  assert.equal(restored.needsRebuild, true);
  assert.equal(Object.hasOwn(rewritten, 'plan'), false);
  assert.equal(rewritten.destinationProfile.id, destinationProfile.id);
});

test('legacy saved-trip arrays migrate to the current key without retaining duplicated plans', () => {
  const storage = new MemoryStorage();
  const destinationProfile = richDestination({ recommendationCount: 30, geometryPoints: 20 });
  storage.setItem('reisslim.trips.v9', JSON.stringify([{
    schemaVersion: 9, engineVersion: 10, trip: trip('legacy-list'), destinationId: destinationProfile.id,
    destinationProfile, plan: { days: [{ day: 1, geometry: Array(100).fill({ lat: 1, lon: 2 }) }] }, savedAt: '2027-01-02T00:00:00.000Z'
  }]));
  const migrated = loadTrips(storage);
  const current = JSON.parse(storage.getItem(STORAGE_KEYS.trips));
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].trip.id, 'legacy-list');
  assert.equal(current[0].snapshotFormat, COMPACT_SNAPSHOT_FORMAT);
  assert.equal(Object.hasOwn(current[0], 'plan'), false);
  assert.equal(storage.getItem('reisslim.trips.v9'), null);
});

test('a stale destination profile from another vehicle is invalidated instead of contaminating the rebuild', () => {
  const destinationProfile = richDestination({ recommendationCount: 10, geometryPoints: 4, vehicle: 'motorcycle' });
  const migrated = migrateState({ trip: trip('vehicle-switch', { transport: 'car' }), destinationId: destinationProfile.id, destinationProfile });
  assert.equal(migrated.vehicleProfileInvalidated, true);
  assert.equal(migrated.destinationId, null);
  assert.equal(migrated.destinationProfile, null);
  assert.equal(migrated.needsRebuild, true);

  const legacyProfile = { ...destinationProfile, vehicleProfileId: null,
    catalogueRecommendations: destinationProfile.catalogueRecommendations.map(item => ({ ...item, vehicleProfileId: 'motorcycle' })) };
  const inferred = migrateState({ trip: trip('legacy-vehicle-switch', { transport: 'car' }), destinationId: legacyProfile.id, destinationProfile: legacyProfile });
  assert.equal(inferred.vehicleProfileInvalidated, true);
  assert.equal(inferred.destinationProfile, null);
});

test('quota-aware trip history preserves the newest compact records and evicts only older history', () => {
  const storage = new MemoryStorage(360_000);
  const destinationProfile = richDestination({ recommendationCount: 90, geometryPoints: 80 });
  for (let index = 0; index < 12; index += 1) {
    assert.doesNotThrow(() => saveTrip({
      trip: trip(`quota-${index}`), destinationId: destinationProfile.id,
      destinationProfile: { ...destinationProfile, id: `${destinationProfile.id}-${index}` },
      plan: { days: [{ day: 1, geometry: Array.from({ length: 500 }, (_, point) => ({ lat: point, lon: point })) }] }
    }, storage));
  }
  const trips = loadTrips(storage);
  assert.ok(trips.length >= 1 && trips.length < 12);
  assert.equal(trips[0].trip.id, 'quota-11');
  assert.ok(trips.every(item => item.snapshotFormat === COMPACT_SNAPSHOT_FORMAT && !Object.hasOwn(item, 'plan')));
  assert.ok(storage.size() <= storage.maximumCharacters);
});

test('compaction is deterministic and preserves current storage-schema compatibility', () => {
  const state = { trip: trip('deterministic'), destinationId: 'catalog-testland-alpha', destinationProfile: richDestination({ recommendationCount: 80, geometryPoints: 40 }), savedAt: '2027-02-01T00:00:00.000Z' };
  const first = compactSavedState(state);
  const second = compactSavedState(state);
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 10);
  assert.equal(first.engineVersion, 11);
  assert.equal(first.snapshotFormat, COMPACT_SNAPSHOT_FORMAT);
});
