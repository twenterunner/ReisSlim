import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCatalogLocatorStats,
  getLoadedCountryCodes,
  resetCatalogueCache,
  resolveCatalogCountryFromPoint,
  resolveCatalogLocation,
  resolveCatalogLocationFromPoint
} from '../catalog-index.js?v=1300';
import { createCatalogLocatorRuntime } from '../catalog-locator-runtime.js';
import { discoverCatalogueConcepts } from '../catalog-runtime.js';
import { buildItinerary, itineraryIntegrityIssues } from '../itinerary-engine.js';
import { buildMapModel } from '../map-view.js';
import { normalizeTrip } from '../trip-model.js';

function trip(overrides = {}) {
  return normalizeTrip({
    id: 'locator-fixture',
    tripName: 'Locator fixture',
    origin: 'Saasveld',
    originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    destinationQuery: '',
    startDate: '2028-05-01',
    days: 8,
    budget: 6000,
    adults: 2,
    children: 0,
    transport: 'car',
    travelMode: 'fly-drive',
    routeTopology: 'loop',
    maxDrive: 6,
    maxChanges: 6,
    comfort: 'mid',
    strictBudget: true,
    strictDrive: true,
    strictChanges: true,
    liveData: false,
    preferences: ['natuur'],
    preferenceWeights: { natuur: 3 },
    ...overrides
  });
}

test('point lookup prefers a stay-capable named anchor over a nearer natural highlight when requested', () => {
  const manifest = {
    TS: { code: 'TS', name: 'Testland', aliases: ['Testland'], bounds: { south: -1, west: -1, north: 1, east: 1 } }
  };
  const locator = {
    schemaVersion: 1,
    catalogVersion: 'fixture-v1',
    records: [
      ['TS', 'gn-natural', 'Near Waterfall', 0, 0.01, 'natural-highlight', 99, 'Nature', ['near waterfall']],
      ['TS', 'gn-overnight', 'Named Touring Town', 0, 0.05, 'overnight-base', 70, 'Central', ['named touring town']],
      ['TS', 'gn-gateway', 'Named Gateway', 0, 0.08, 'access-gateway', 80, 'Central', ['named gateway']]
    ]
  };
  const resolveCountry = input => String(input?.code || input || '').toUpperCase() === 'TS' ? manifest.TS : null;
  const runtime = createCatalogLocatorRuntime(locator, manifest, resolveCountry);

  assert.equal(runtime.resolveLocationFromPoint({ lat: 0, lon: 0 }, { countryCode: 'TS', maximumDistanceKm: 20 }).role,
    'natural-highlight', 'ordinary nearest-place lookup should remain distance based');
  const overnight = runtime.resolveLocationFromPoint({ lat: 0, lon: 0 }, {
    countryCode: 'TS', maximumDistanceKm: 20, preferOvernightBase: true
  });
  assert.equal(overnight.name, 'Named Touring Town');
  assert.equal(overnight.role, 'overnight-base');
  assert.equal(overnight.geographicType, 'city');
});

test('compact locator resolves named cities and origin countries without eager country-pack imports', { concurrency: false }, async () => {
  resetCatalogueCache();
  assert.ok(getCatalogLocatorStats().records >= 6000, 'locator should cover the bundled touring anchors');
  assert.deepEqual(getLoadedCountryCodes(), []);

  const capeTown = resolveCatalogLocation('Cape Town, South Africa');
  const zagreb = resolveCatalogLocation('Zagreb');
  const etosha = resolveCatalogLocation('Etosha National Park');
  assert.equal(capeTown?.countryCode, 'ZA');
  assert.equal(capeTown?.name, 'Cape Town');
  assert.equal(zagreb?.countryCode, 'HR');
  assert.equal(etosha?.geographicType, 'region');
  assert.equal(etosha?.countryCode, 'NA');
  assert.equal(resolveCatalogCountryFromPoint({ lat: -22.56, lon: 17.08 })?.code, 'NA');
  assert.equal(resolveCatalogCountryFromPoint({ lat: 52.33, lon: 6.81 })?.code, 'NL');
  assert.equal(resolveCatalogLocationFromPoint({ lat: 52.33, lon: 6.81 })?.countryCode, 'NL');
  assert.deepEqual(getLoadedCountryCodes(), [], 'locator-only resolution must not import a country pack');

  const result = await discoverCatalogueConcepts(trip({ destinationQuery: 'Cape Town' }), { limit: 3 });
  assert.equal(result.outcome, 'catalogue');
  assert.equal(result.resolution.name, 'Cape Town');
  assert.equal(result.resolution.countryCode, 'ZA');
  assert.equal(result.destinations.length, 3);
  assert.deepEqual(getLoadedCountryCodes(), ['ZA'], 'only the resolved country pack should load');
});

test('map model contains canonical day waypoints and keeps named route-aware service evidence', () => {
  const waypoint = { name: 'Planned fuel interval', lat: 50.5, lon: 5.5, role: 'fuel', approximate: true };
  const service = {
    id: 'named-fuel', providerId: 'osm-node-42', provider: 'OpenStreetMap', source: 'OpenStreetMap',
    sourceUrl: 'https://www.openstreetmap.org/node/42', day: 1, associatedDay: 1, associatedBase: 'Route Base',
    type: 'fuel', name: 'Named Route Fuel', reason: 'Named provider evidence close to the route.',
    point: { lat: 50.51, lon: 5.51 }, genericFallback: false, confidence: 'catalogue-evidence'
  };
  const plan = {
    routing: { source: 'offline-corridor', live: false },
    routeMetrics: { origin: { name: 'Origin', lat: 50, lon: 5 } },
    origin: { name: 'Origin', lat: 50, lon: 5 },
    recommendations: [],
    days: [{
      day: 1, date: '2028-05-01', kind: 'outward', from: 'Origin', to: 'Route Base', overnight: 'Route Base',
      fromPoint: { name: 'Origin', lat: 50, lon: 5 }, toPoint: { name: 'Route Base', lat: 51, lon: 6 },
      geometry: [{ lat: 50, lon: 5 }, waypoint, { lat: 51, lon: 6 }], waypoints: [waypoint], recommendations: [service]
    }]
  };

  const model = buildMapModel(plan);
  const named = model.recommendations.find(item => item.providerId === 'osm-node-42');
  const planned = model.recommendations.find(item => item.plannedWaypoint);
  assert.ok(named, 'named day recommendation should not depend on a stale flattened plan list');
  assert.equal(named.routeAware, true);
  assert.equal(named.day, 1);
  assert.ok(Number(named.routeDistanceKm) < 5);
  assert.ok(planned, 'every canonical day waypoint should be represented on the map');
  assert.equal(planned.type, 'fuel');
  assert.equal(planned.day, 1);
  assert.equal(planned.coordinateRole, 'canonical-route-waypoint');
});

test('sparse evidence allows one recovery day and marks remaining duration incomplete instead of repeating filler', () => {
  const sparseDestination = {
    id: 'sparse-evidence', name: 'Sparse evidence region', country: 'Fixture', dynamic: true,
    distanceKm: 100, driveHours: 2, roadDistanceFactor: 1.1, nightMid: 100, activityDaily: 30, toll: 0,
    tags: ['natuur'], bases: [{ name: 'Gateway', lat: 1, lon: 1 }], activities: [],
    highlights: [{
      id: 'gateway-evidence', providerId: 'gateway-evidence', name: 'Gateway evidence', baseName: 'Gateway',
      point: { lat: 1.04, lon: 1.03 }, overnightPoint: { lat: 1, lon: 1 }, gateway: true,
      sequence: 0, priority: 9, minimumTripDays: 1, minimumNights: 1, tags: ['natuur'],
      activity: 'Visit the one named evidence anchor.', rainAlternative: 'Use the named indoor alternative.', evidence: 'fixture/gateway'
    }]
  };
  const request = trip({ days: 8 });
  const plan = buildItinerary(request, sparseDestination);
  const recoveryDays = plan.days.filter(day => day.activityId === 'planner-recovery-logistics');
  const incompleteDays = plan.days.filter(day => day.kind === 'unplanned');

  assert.equal(plan.days.length, request.days, 'calendar chronology remains explicit');
  assert.equal(recoveryDays.length, 1);
  assert.ok(incompleteDays.length >= 1);
  assert.equal(plan.incompleteDayCount, incompleteDays.length);
  assert.equal(plan.feasible, false);
  assert.equal(plan.days.some(day => /herstel- en keuzedag/i.test(day.primaryPlan)), false);
  assert.match(itineraryIntegrityIssues(plan, request).join(' '), /onvoldoende onderscheidend/i);
  assert.equal(incompleteDays.some(day => day.recommendations?.some(item => item.type === 'activity')), false,
    'incomplete days must not receive fabricated activity recommendations');
});
