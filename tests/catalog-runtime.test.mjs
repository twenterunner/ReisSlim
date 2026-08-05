import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCountryPack, resolveCatalogCountry } from '../catalog-index.js';
import {
  buildDestinationProfiles,
  discoverCatalogueConcepts,
  enrichPlanWithCatalogue
} from '../catalog-runtime.js';
import { buildItinerary } from '../itinerary-engine.js';
import { normalizeTrip } from '../trip-model.js';
import { recommendationVehicleCompatible } from '../vehicle-intelligence.js';

function makeTrip(destinationQuery, overrides = {}) {
  return normalizeTrip({
    id: `catalogue-${destinationQuery}-${overrides.transport || 'car'}`,
    tripName: `Catalogue acceptance: ${destinationQuery}`,
    origin: 'Saasveld',
    originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    destinationQuery,
    startDate: '2027-05-01',
    days: 14,
    budget: 12000,
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
    fuelRangeKm: 600,
    preferences: ['natuur', 'cultuur', 'scenic'],
    preferenceWeights: { natuur: 3, cultuur: 2, scenic: 3 },
    ...overrides
  });
}

async function discover(trip, limit = 6) {
  const resolution = resolveCatalogCountry(trip.destinationQuery);
  assert.ok(resolution, `test destination ${trip.destinationQuery} should resolve`);
  const result = await discoverCatalogueConcepts(trip, { resolution, limit });
  return { resolution, result };
}

async function buildPlan(trip, destination) {
  const basePlan = buildItinerary(trip, destination);
  return await enrichPlanWithCatalogue(trip, destination, basePlan);
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('en');
}

function compressedBaseSequence(plan, origin) {
  const normalizedOrigin = normalize(origin);
  return (plan.days || [])
    .map(day => normalize(day.overnight))
    .filter(base => base && base !== normalizedOrigin)
    .filter((base, index, list) => index === 0 || base !== list[index - 1]);
}

function hasPingPong(sequence) {
  return sequence.some((base, index) => index >= 3
    && base === sequence[index - 2]
    && sequence[index - 1] === sequence[index - 3]);
}

function visibleRecommendationText(plan) {
  return (plan.recommendations || []).flatMap(item => {
    const generatedReason = item.name && item.reason
      ? String(item.reason).split(String(item.name)).join('')
      : item.reason;
    return [item.genericFallback ? item.name : null, generatedReason, item.vehicleFitExplanation];
  }).filter(Boolean).join(' ');
}

function namedRecommendation(item) {
  return Boolean(item?.name && item?.providerId && item?.genericFallback !== true);
}

function distinctBases(plan, origin) {
  const normalizedOrigin = normalize(origin);
  return new Set((plan.days || []).map(day => normalize(day.overnight)).filter(base => base && base !== normalizedOrigin));
}

function structuralIdentity(destination, plan) {
  return JSON.stringify({
    destination: destination.id || destination.providerId,
    bases: compressedBaseSequence(plan, ''),
    corridors: destination.planStructure?.corridors || [],
    topology: destination.planStructure?.topology || null
  });
}

test('catalogue discovery is deterministic, provider-shaped and works with network providers disabled', { concurrency: false }, async () => {
  const trip = makeTrip('South Africa');
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('network disabled by deterministic catalogue test');
  };

  try {
    const { result } = await discover(trip);
    assert.equal(fetchCalls, 0, 'catalogue discovery must not invoke a live provider');
    assert.equal(result.live, false);
    assert.equal(result.cached, true);
    assert.equal(result.outcome, 'catalogue');
    assert.equal(result.source, 'ReisSlim touring catalogue');
    assert.ok(result.destinations.length >= 3 && result.destinations.length <= 6);
    assert.ok(result.anchors.length >= result.destinations.length);

    const repeated = await discover(trip);
    assert.deepEqual(
      repeated.result.destinations.map(item => item.id),
      result.destinations.map(item => item.id),
      'same request should produce stable catalogue concepts'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('catalogue destination profiles retain named evidence instead of generic generated characteristics', async () => {
  const trip = makeTrip('Namibia');
  const { resolution, result } = await discover(trip);
  const pack = await loadCountryPack(resolution.code);
  const profiles = buildDestinationProfiles(pack, trip, { limit: 6 });
  const destinations = profiles?.length ? profiles : result.destinations;
  assert.ok(destinations.length >= 3);
  for (const destination of destinations) {
    assert.ok(destination.id && destination.name);
    const conceptLabel = destination.name.split('·')[0];
    assert.ok(
      (destination.bases || []).some(base => conceptLabel.includes(base.name))
        || (destination.highlights || []).some(highlight => conceptLabel.includes(highlight.name)),
      `concept title must use a named touring anchor instead of a raw provider region code: ${destination.name}`
    );
    assert.ok(destination.provider?.name || destination.discoverySource);
    assert.ok((destination.bases || []).every(base => base.name && Number.isFinite(Number(base.lat)) && Number.isFinite(Number(base.lon))));
    assert.ok((destination.highlights || []).every(highlight => highlight.name && highlight.providerId && highlight.sourceUrl));
    assert.doesNotMatch(JSON.stringify(destination.evidence || {}), /hash|random|seeded suitability/i);
  }
});

test('catalogue enrichment supplies named POIs and accommodations associated with canonical days and bases', async () => {
  const trip = makeTrip('South Africa');
  const { result } = await discover(trip);
  const plan = await buildPlan(trip, result.destinations[0]);
  const named = (plan.recommendations || []).filter(namedRecommendation);
  const pois = named.filter(item => ['activity', 'poi', 'attraction', 'restaurant'].includes(item.type));
  const accommodations = named.filter(item => item.type === 'accommodation');
  assert.ok(pois.length > 0, 'catalogue plan should include named POIs');
  assert.ok(accommodations.length > 0, 'catalogue plan should include named accommodations');

  const days = new Set(plan.days.map(day => day.day));
  const bases = new Set(plan.days.map(day => normalize(day.overnight)).filter(Boolean));
  for (const item of named) {
    assert.ok(days.has(item.associatedDay ?? item.day), `${item.name} references an unknown day`);
    assert.ok(bases.has(normalize(item.associatedBase)), `${item.name} references an unknown overnight base`);
    assert.ok(item.providerId && (item.sourceUrl || item.url), `${item.name} lacks provider evidence`);
    assert.equal(item.verified, false, `${item.name} must not claim live verification`);
  }

  const identities = named.map(item => item.providerId);
  assert.equal(new Set(identities).size, identities.length, 'named recommendations must be deduplicated across days');
});

test('car and motorcycle catalogue results differ materially and do not contaminate vehicle copy', async () => {
  const carTrip = makeTrip('South Africa', { transport: 'car', fuelRangeKm: 650 });
  const motorcycleTrip = makeTrip('South Africa', {
    transport: 'motorcycle', travelMode: 'fly-ride', fuelRangeKm: 260, routeStyle: 'touring'
  });
  const [carDiscovery, motorcycleDiscovery] = await Promise.all([discover(carTrip), discover(motorcycleTrip)]);
  const [carPlan, motorcyclePlan] = await Promise.all([
    buildPlan(carTrip, carDiscovery.result.destinations[0]),
    buildPlan(motorcycleTrip, motorcycleDiscovery.result.destinations[0])
  ]);

  assert.doesNotMatch(visibleRecommendationText(carPlan), /motor(?:cycle|fiets|vriendelijk|parking|hotel)/i);
  assert.equal(carPlan.recommendations.some(item => item.name === 'Heyneman Marine and Motorcycles'), false,
    'a source-backed motorcycle-only service must be filtered from a car plan, not renamed');
  assert.ok((carPlan.recommendations || []).every(item => item.vehicleProfileId === 'car' && item.vehicleFit?.includes('car')));
  assert.ok((motorcyclePlan.recommendations || []).every(item => item.vehicleProfileId === 'motorcycle' && item.vehicleFit?.includes('motorcycle')));

  const carIdentity = structuralIdentity(carDiscovery.result.destinations[0], carPlan);
  const motorcycleIdentity = structuralIdentity(motorcycleDiscovery.result.destinations[0], motorcyclePlan);
  const carElapsed = carPlan.days.reduce((sum, day) => sum + Number(day.driveHours || 0), 0);
  const motorcycleElapsed = motorcyclePlan.days.reduce((sum, day) => sum + Number(day.driveHours || 0), 0);
  assert.ok(carIdentity !== motorcycleIdentity || motorcycleElapsed > carElapsed,
    'motorcycle selection must change route structure or total elapsed travel time');

  for (const item of (motorcyclePlan.recommendations || []).filter(rec => rec.type === 'accommodation')) {
    const copy = `${item.name} ${item.reason || ''}`;
    if (/secure|covered|veilig|overdekt/i.test(copy) && !/not verified|niet geverifieerd/i.test(copy)) {
      assert.ok(item.parkingEvidence, `${item.name} mentions secure parking without catalogue evidence`);
    }
    if (!item.parkingEvidence) {
      assert.match(copy, /not verified|niet geverifieerd|onbekend/i,
        `${item.name} must disclose that motorcycle parking evidence is unknown`);
    }
  }
});

test('named motorcycle-only services require affirmative car evidence before entering a car plan', () => {
  const motorcycleOnly = {
    name: 'Provider-supplied Motorcycles Workshop',
    type: 'service',
    vehicleFit: { car: 'unknown', motorcycle: 'unknown' },
    vehicleCategoryEvidence: { taxonomy: { primary: 'motorcycle_parts_store' } }
  };
  assert.equal(recommendationVehicleCompatible(motorcycleOnly, 'car'), false);
  assert.equal(recommendationVehicleCompatible(motorcycleOnly, 'motorcycle'), true);
  assert.equal(recommendationVehicleCompatible({ ...motorcycleOnly, name: 'Provider-supplied Workshop' }, 'car'), false,
    'provider taxonomy alone must prevent a motorcycle-only service entering a car plan');
  assert.equal(recommendationVehicleCompatible({
    ...motorcycleOnly,
    vehicleFit: { car: 'supported', motorcycle: 'supported' }
  }, 'car'), true, 'explicit source support for cars should keep the real provider name usable');
});

test('excluded catalogue concepts are not returned again when requesting more proposals', async () => {
  const trip = makeTrip('Germany', { travelMode: 'roadtrip', maxDrive: 6 });
  const first = await discover(trip, 3);
  const excludedIds = first.result.destinations.map(item => item.id);
  const second = await discoverCatalogueConcepts(trip, { resolution: first.resolution, limit: 3, excludedIds });
  assert.equal(second.destinations.some(item => excludedIds.includes(item.id)), false);
});

test('a gateway seed remains eligible at zero distance instead of being replaced by a weaker airport', async () => {
  const trip = makeTrip('Namibia');
  const { result } = await discover(trip);
  const windhoekConcept = result.destinations.find(item => /windhoek/i.test(item.name));
  assert.ok(windhoekConcept, 'expected a Windhoek-seeded catalogue concept');
  assert.equal(windhoekConcept.accessGateway.name, 'Windhoek');
  assert.equal(windhoekConcept.bases[0].name, 'Windhoek');
  const plan = await buildPlan(trip, windhoekConcept);
  assert.equal(plan.days.some(day => /katutura/i.test(day.overnight)), false,
    'a nearby urban section must not become a separate touring base');
});
