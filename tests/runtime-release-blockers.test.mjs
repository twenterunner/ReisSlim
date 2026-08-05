import test from 'node:test';
import assert from 'node:assert/strict';

import { loadCountryModuleRetryably } from '../catalog-index.js';
import { evaluatePlanConstraints } from '../constraint-engine.js';
import { buildItinerary } from '../itinerary-engine.js';
import { graphEdge, planHighlightRoute } from '../route-graph-engine.js';
import { enrichPlanWithLiveRouting } from '../routing-provider.js';
import { materialTripFingerprint, normalizeTrip } from '../trip-model.js';
import { decodeVehicleSuitability } from '../vehicle-intelligence.js';
import { primarySyntheticDestination } from './fixtures/synthetic-destinations.mjs';

function makeTrip(overrides = {}) {
  return normalizeTrip({
    id: 'runtime-guards', tripName: 'Runtime guard test', origin: 'Saasveld',
    originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 }, startDate: '2027-06-01',
    days: 8, budget: 8000, adults: 2, children: 0, transport: 'car', travelMode: 'direct',
    routeTopology: 'loop', tripPace: 'balanced', routeStyle: 'balanced', fuelRangeKm: 600,
    maxDrive: 8, maxChanges: 8, comfort: 'mid', strictBudget: true, strictDrive: true,
    strictChanges: true, allowStretch: false, liveData: false, remoteTravel: false,
    preferences: ['natuur'], preferenceWeights: { natuur: 2 }, ...overrides
  });
}

function nodes() {
  return [
    { id: 'a', name: 'Alpha', baseName: 'Alpha', overnightPoint: { lat: 0, lon: 0 } },
    { id: 'b', name: 'Bravo', baseName: 'Bravo', overnightPoint: { lat: 0, lon: 1 } }
  ];
}

function destinationWithCorridor(corridor = {}) {
  return {
    corridors: [{
      id: 'a-b', from: 'a', to: 'b', distanceKm: 120, carMovingHours: 2,
      motorcycleMovingHours: 2.1, fallbackGeometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }],
      vehicleCompatibility: {}, ...corridor
    }]
  };
}

test('material trip fingerprint covers every route-affecting vehicle and policy input', () => {
  const base = makeTrip();
  const materialChanges = [
    { routeStyle: 'scenic' }, { fuelRangeKm: 420 },
    { strictBudget: false }, { strictDrive: false }, { strictChanges: false },
    { allowStretch: true }, { remoteTravel: true }, { privateMode: true }, { notes: 'Avoid exposed roads' },
    { roadSurfacePolicy: 'paved-only' }, { unacceptableRoadSurfaces: ['gravel'] },
    { destinationPoint: { name: 'Target', lat: 1, lon: 2 } }
  ];
  for (const change of materialChanges) {
    const changed = normalizeTrip({ ...base, ...change });
    assert.notEqual(materialTripFingerprint(base), materialTripFingerprint(changed), JSON.stringify(change));
  }
  const largeVehicle = makeTrip({ transport: 'motorhome', vehicleHeightM: 3.1, vehicleLengthM: 7.2, vehicleWeightKg: 3500, vehicleMaxSpeedKmh: 100 });
  for (const change of [{ vehicleHeightM: 3.5 }, { vehicleLengthM: 9 }, { vehicleWeightKg: 4200 }, { vehicleMaxSpeedKmh: 90 }]) {
    assert.notEqual(materialTripFingerprint(largeVehicle), materialTripFingerprint(normalizeTrip({ ...largeVehicle, ...change })), JSON.stringify(change));
  }
  assert.equal(materialTripFingerprint(base), materialTripFingerprint({ ...base, tripName: 'Cosmetic rename', updatedAt: '2099-01-01' }));
});

test('shared suitability decoder rejects every supported prohibition shape', () => {
  for (const value of [false, 0, 'prohibited', 'unsuitable', { suitability: 'prohibited' }, { status: 'unsuitable' }, { allowed: false }, { suitable: false }]) {
    assert.equal(decodeVehicleSuitability(value).status, 'prohibited', JSON.stringify(value));
  }
  assert.equal(decodeVehicleSuitability({ suitability: 'supported', evidence: ['access=yes'] }).status, 'supported');
  assert.equal(decodeVehicleSuitability('unknown').status, 'unknown');
});

test('route edges enforce structured vehicle, fuel-range and selected surface hard gates', () => {
  const [from, to] = nodes();
  const prohibited = graphEdge(makeTrip(), from, to, destinationWithCorridor({
    vehicleCompatibility: { car: { suitability: 'prohibited', evidence: ['motor_vehicle=no'] } }
  }));
  assert.equal(prohibited.vehicleProhibited, true);
  assert.equal(prohibited.vehicleCompatible, false);

  const fuel = graphEdge(makeTrip({ transport: 'motorcycle', fuelRangeKm: 200 }), from, to, destinationWithCorridor({
    fuelServiceSpacingKm: 260, vehicleCompatibility: { motorcycle: 'supported' }
  }));
  assert.equal(fuel.fuelRangeExceeded, true);
  assert.equal(fuel.vehicleCompatible, false);

  const surface = graphEdge(makeTrip({ roadSurfacePolicy: 'paved-only' }), from, to, destinationWithCorridor({
    surface: ['gravel'], vehicleCompatibility: { car: 'supported' }
  }));
  assert.equal(surface.surfaceConflict, true);
  assert.equal(surface.vehicleCompatible, false);

  const unknown = graphEdge(makeTrip(), from, to, destinationWithCorridor({ surface: null, fuelServiceSpacingKm: null }));
  assert.equal(unknown.vehicleCompatible, true, 'unknown evidence must remain unknown rather than becoming a fabricated prohibition');
});

test('beam route planning cannot select an explicitly prohibited corridor', () => {
  const destination = {
    dynamic: true,
    highlights: [
      { id: 'a', name: 'Alpha', baseName: 'Alpha', point: { lat: 0, lon: 0 }, overnightPoint: { lat: 0, lon: 0 }, gateway: true, priority: 8 },
      { id: 'b', name: 'Bravo', baseName: 'Bravo', point: { lat: 0, lon: 1 }, overnightPoint: { lat: 0, lon: 1 }, priority: 10 }
    ],
    ...destinationWithCorridor({ vehicleCompatibility: { car: { suitability: 'prohibited', evidence: ['motor_vehicle=no'] } } })
  };
  const route = planHighlightRoute(makeTrip({ days: 6 }), destination);
  assert.equal(route.route.some(item => item.baseName === 'Bravo'), false);
});

test('canonical plan constraint gate reports vehicle, surface and fuel violations as hard failures', () => {
  const trip = makeTrip({ days: 3, fuelRangeKm: 200, roadSurfacePolicy: 'paved-only' });
  const plan = {
    days: [
      { day: 1, from: 'Saasveld', to: 'Alpha', elapsedHours: 2, overnight: 'Alpha', vehicleProhibited: true, vehicleCompatible: false },
      { day: 2, from: 'Alpha', to: 'Bravo', elapsedHours: 2, overnight: 'Bravo', surfaceConflict: true, vehicleCompatible: false },
      { day: 3, from: 'Bravo', to: 'Saasveld', elapsedHours: 2, overnight: 'Saasveld', fuelRangeExceeded: true, fuelServiceSpacingKm: 280, vehicleCompatible: false }
    ],
    accommodationChanges: 2
  };
  const result = evaluatePlanConstraints(trip, plan, { total: 1000 });
  assert.equal(result.exact, false);
  assert.deepEqual(new Set(result.violations.map(item => item.key)), new Set(['vehicleCompatibility', 'roadSurface', 'fuelRange']));
});

test('OSRM car-profile duration is adjusted before motorcycle rests and buffers are applied', async () => {
  const response = {
    ok: true,
    json: async () => ({ routes: [{
      distance: 120000,
      duration: 7200,
      geometry: { coordinates: [[6.81, 52.33], [7.1, 51.8], [7.5, 51.2]] }
    }] })
  };
  const fetchImpl = async () => response;
  const motorcycle = makeTrip({ transport: 'motorcycle', liveData: true });
  const motorcyclePlan = await enrichPlanWithLiveRouting(
    motorcycle, primarySyntheticDestination, buildItinerary(motorcycle, primarySyntheticDestination),
    { fetchImpl, storage: null }
  );
  const car = makeTrip({ transport: 'car', liveData: true });
  const carPlan = await enrichPlanWithLiveRouting(
    car, primarySyntheticDestination, buildItinerary(car, primarySyntheticDestination),
    { fetchImpl, storage: null }
  );
  const motorcycleTravel = motorcyclePlan.days.find(day => ['outward', 'transfer', 'return'].includes(day.kind));
  const carTravel = carPlan.days.find(day => ['outward', 'transfer', 'return'].includes(day.kind));
  assert.equal(carTravel.roadHours, 2);
  assert.equal(motorcycleTravel.roadHours, 2.1);
  assert.ok(motorcycleTravel.elapsedHours > carTravel.elapsedHours);
});

test('a failed country-module import is evicted and the next load retries', async () => {
  const cache = new Map();
  const loaded = new Set();
  let attempts = 0;
  const loader = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('recorded import failure');
    return { COUNTRY_PACK: { country: { code: 'TS' } } };
  };
  await assert.rejects(loadCountryModuleRetryably('TS', loader, cache, loaded), /recorded import failure/);
  assert.equal(cache.has('TS'), false);
  assert.equal(loaded.has('TS'), false);
  const pack = await loadCountryModuleRetryably('TS', loader, cache, loaded);
  assert.equal(pack.country.code, 'TS');
  assert.equal(attempts, 2);
  assert.equal(loaded.has('TS'), true);
});
