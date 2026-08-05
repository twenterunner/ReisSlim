import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCatalogCountry } from '../catalog-index.js';
import { discoverCatalogueConcepts, enrichPlanWithCatalogue } from '../catalog-runtime.js';
import { buildItinerary } from '../itinerary-engine.js';
import { haversineKm } from '../route-engine.js';
import { normalizeTrip } from '../trip-model.js';

function makeTrip(destinationQuery, overrides = {}) {
  return normalizeTrip({
    id: `catalogue-acceptance-${destinationQuery}-${overrides.transport || 'car'}`,
    tripName: `${destinationQuery} touring acceptance`,
    origin: 'Saasveld',
    originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    destinationQuery,
    startDate: '2027-05-01',
    days: 14,
    budget: 14000,
    adults: 2,
    children: 0,
    transport: 'car',
    travelMode: 'fly-drive',
    routeTopology: 'loop',
    tripPace: 'balanced',
    routeStyle: 'balanced',
    maxDrive: 6,
    maxChanges: 8,
    comfort: 'mid',
    strictBudget: true,
    strictDrive: true,
    strictChanges: true,
    allowStretch: false,
    liveData: false,
    fuelRangeKm: 650,
    preferences: ['natuur', 'cultuur', 'scenic'],
    preferenceWeights: { natuur: 3, cultuur: 2, scenic: 3 },
    ...overrides
  });
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('en');
}

async function conceptsAndPlan(trip) {
  const resolution = resolveCatalogCountry(trip.destinationQuery);
  assert.ok(resolution, `${trip.destinationQuery} must be covered by the catalogue`);
  const discovery = await discoverCatalogueConcepts(trip, { resolution, limit: 6 });
  assert.ok(discovery.destinations.length > 0, `${trip.destinationQuery} returned no catalogue concepts`);
  const plan = await enrichPlanWithCatalogue(trip, discovery.destinations[0], buildItinerary(trip, discovery.destinations[0]));
  return { discovery, destination: discovery.destinations[0], plan };
}

function compressedBases(plan, origin) {
  const normalizedOrigin = normalize(origin);
  return plan.days.map(day => normalize(day.overnight))
    .filter(base => base && base !== normalizedOrigin)
    .filter((base, index, list) => index === 0 || base !== list[index - 1]);
}

function assertChronology(plan) {
  for (let index = 1; index < plan.days.length; index += 1) {
    assert.equal(normalize(plan.days[index].from), normalize(plan.days[index - 1].overnight),
      `day ${plan.days[index].day} does not begin at the prior overnight location`);
  }
}

function assertNoPingPong(plan, origin) {
  const bases = compressedBases(plan, origin);
  const pingPong = bases.some((base, index) => index >= 3
    && base === bases[index - 2]
    && bases[index - 1] === bases[index - 3]);
  assert.equal(pingPong, false, `base sequence contains A→B→A→B: ${bases.join(' → ')}`);
}

function assertNoFiller(plan) {
  const stayPurposes = plan.days
    .filter(day => ['stay', 'flex'].includes(day.kind))
    .map(day => normalize(day.primaryPlan))
    .filter(Boolean);
  assert.equal(new Set(stayPurposes).size, stayPurposes.length, 'stay days repeat activity text');

  const namedPoiIds = (plan.recommendations || [])
    .filter(item => ['activity', 'poi', 'attraction', 'restaurant'].includes(item.type) && item.genericFallback !== true)
    .map(item => item.providerId)
    .filter(Boolean);
  assert.equal(new Set(namedPoiIds).size, namedPoiIds.length, 'named POIs repeat across days');
}

function overnightMetrics(plan, origin) {
  const normalizedOrigin = normalize(origin);
  const nights = plan.days.map(day => normalize(day.overnight)).filter(base => base && base !== normalizedOrigin);
  const counts = new Map();
  nights.forEach(base => counts.set(base, (counts.get(base) || 0) + 1));
  return {
    distinct: counts.size,
    dominantShare: Math.max(0, ...counts.values()) / Math.max(1, nights.length)
  };
}

function coverageKm(plan, origin) {
  const normalizedOrigin = normalize(origin);
  const points = plan.days
    .filter(day => normalize(day.overnight) !== normalizedOrigin)
    .flatMap(day => [day.toPoint, day.overnightPoint])
    .filter(point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon)));
  let maximum = 0;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      maximum = Math.max(maximum, haversineKm(points[left], points[right]) || 0);
    }
  }
  return maximum;
}

function conceptIdentity(destination) {
  const structure = destination.planStructure || {};
  return JSON.stringify({
    gateway: structure.gateway || destination.accessGateway?.id || destination.bases?.[0]?.id || destination.bases?.[0]?.name,
    bases: structure.bases || destination.bases?.map(base => base.id || base.name),
    corridors: structure.corridors || destination.corridors?.map(corridor => corridor.id || `${corridor.fromAnchorId}>${corridor.toAnchorId}`) || []
  });
}

function assertCountryTourQuality(trip, result, { minimumCoverageKm }) {
  const { discovery, plan } = result;
  assert.ok(discovery.destinations.length >= 3, `${trip.destinationQuery} should return at least three concepts`);
  assert.ok(new Set(discovery.destinations.map(conceptIdentity)).size >= 3, `${trip.destinationQuery} concepts are not materially distinct`);

  const overnights = overnightMetrics(plan, trip.origin);
  assert.ok(overnights.distinct >= 3, `${trip.destinationQuery} long tour uses only ${overnights.distinct} meaningful bases`);
  assert.ok(overnights.dominantShare <= 0.6, `${trip.destinationQuery} spends ${(overnights.dominantShare * 100).toFixed(0)}% of nights at one base`);
  assert.ok(coverageKm(plan, trip.origin) >= minimumCoverageKm, `${trip.destinationQuery} route is an implausibly small metropolitan loop`);
  assert.ok(Math.max(...plan.days.map(day => Number(day.driveHours || 0))) <= trip.maxDrive + 0.01, `${trip.destinationQuery} exceeds maximum daily elapsed travel time`);
  assert.ok(plan.accommodationChanges <= trip.maxChanges, `${trip.destinationQuery} exceeds accommodation-change constraint`);
  assertChronology(plan);
  assertNoPingPong(plan, trip.origin);
  assertNoFiller(plan);
}

test('14-day South Africa catalogue case produces several coherent multi-base regional tours', async () => {
  const trip = makeTrip('South Africa');
  const result = await conceptsAndPlan(trip);
  assertCountryTourQuality(trip, result, { minimumCoverageKm: 150 });
});

test('14-day Namibia catalogue case produces a coherent multi-base loop without filler', async () => {
  const trip = makeTrip('Namibia', { maxDrive: 6.5, fuelRangeKm: 600 });
  const result = await conceptsAndPlan(trip);
  assertCountryTourQuality(trip, result, { minimumCoverageKm: 200 });
});

test('European catalogue case produces distinct feasible car and motorcycle tours from Saasveld', async () => {
  const carTrip = makeTrip('Germany', { travelMode: 'roadtrip', transport: 'car', days: 12, maxDrive: 6 });
  const motorcycleTrip = makeTrip('Germany', {
    travelMode: 'roadtrip', transport: 'motorcycle', days: 12, maxDrive: 6,
    fuelRangeKm: 260, routeStyle: 'touring'
  });
  const [car, motorcycle] = await Promise.all([conceptsAndPlan(carTrip), conceptsAndPlan(motorcycleTrip)]);
  assertCountryTourQuality(carTrip, car, { minimumCoverageKm: 100 });
  assertCountryTourQuality(motorcycleTrip, motorcycle, { minimumCoverageKm: 100 });

  const carRoute = conceptIdentity(car.destination);
  const motorcycleRoute = conceptIdentity(motorcycle.destination);
  const carElapsed = car.plan.days.reduce((sum, day) => sum + Number(day.driveHours || 0), 0);
  const motorcycleElapsed = motorcycle.plan.days.reduce((sum, day) => sum + Number(day.driveHours || 0), 0);
  assert.ok(carRoute !== motorcycleRoute || motorcycleElapsed > carElapsed,
    'European motorcycle result must use a different corridor portfolio or slower elapsed-time plan');
});

test('catalogue constraints never pass filler or missing route connectivity merely because it is affordable', async () => {
  const trip = makeTrip('South Africa');
  const { plan } = await conceptsAndPlan(trip);
  const bases = compressedBases(plan, trip.origin);
  assert.ok(bases.length >= 3);
  assertNoPingPong(plan, trip.origin);
  assertNoFiller(plan);
  assert.ok(plan.routeFeasibility, 'catalogue plans must expose route-evidence feasibility');
  assert.equal(plan.routeFeasibility.normalExactEligible, false,
    'the current pack has no route-backed base connections and must not be labelled exact');
  assert.equal(plan.feasible, false,
    'missing road connectivity must keep this otherwise structurally useful route incomplete');
  assert.match(plan.routeFeasibility.summary, /stretch|indicatief|onvolledig|mist weg- of ferryevidence/i);
});
