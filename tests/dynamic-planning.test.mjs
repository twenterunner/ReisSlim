import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDiscoveryCacheKey, clusterDestinationRegions, discoverDestinationBatch, normalizeAnchorElements, normalizeDestinationResolution } from '../destination-provider.js';
import { buildItinerary, collectRouteSegments } from '../itinerary-engine.js';
import { buildMapModel } from '../map-view.js';
import { buildRecommendations, recommendationsMatchVehicle } from '../recommendation-engine.js';
import { normalizeTrip } from '../trip-model.js';

const root = new URL('..', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
const node = (id, name, lat, lon, tags = {}) => ({ type: 'node', id, lat, lon, tags: { name, ...tags } });
const fixture = entries => ({ elements: entries });
const resolution = (name, id, bounds, point) => normalizeDestinationResolution(name, {
  osm_type: 'relation', osm_id: id, display_name: name, type: 'country', class: 'boundary', importance: .85,
  boundingbox: bounds.map(String), lat: String(point.lat), lon: String(point.lon)
});
const trip = overrides => normalizeTrip({
  origin: 'Saasveld', originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 }, startDate: '2026-10-05',
  days: 14, budget: 9000, adults: 2, children: 0, travelMode: 'fly-drive', routeTopology: 'loop',
  transport: 'car', maxDrive: 5, maxChanges: 6, comfort: 'mid', strictBudget: true, strictDrive: true,
  strictChanges: true, allowStretch: true, liveData: true, preferences: ['natuur', 'cultuur'], preferenceWeights: { natuur: 3, cultuur: 2 },
  ...overrides
});

const countryFixtures = {
  'South Africa': fixture([
    node(1, 'Cape Town', -33.925, 18.424, { place: 'city', population: '4600000' }), node(2, 'Knysna', -34.036, 23.047, { place: 'town' }),
    node(3, 'Mbombela', -25.475, 30.969, { place: 'city' }), node(4, 'Durban', -29.858, 31.022, { place: 'city' }),
    node(11, 'Table Mountain', -33.962, 18.409, { tourism: 'attraction', natural: 'peak', wikidata: 'Q164598' }),
    node(12, 'Garden Route National Park', -34.02, 23.04, { boundary: 'national_park', tourism: 'attraction' }),
    node(13, 'Blyde River Canyon', -24.59, 30.80, { tourism: 'viewpoint', natural: 'cliff' }),
    node(14, 'uShaka Marine World', -29.87, 31.05, { tourism: 'attraction' })
  ]),
  Croatia: fixture([
    node(21, 'Zagreb', 45.815, 15.982, { place: 'city' }), node(22, 'Pula', 44.867, 13.85, { place: 'city' }),
    node(23, 'Zadar', 44.119, 15.232, { place: 'city' }), node(24, 'Split', 43.508, 16.44, { place: 'city' }),
    node(25, 'Plitvice Lakes', 44.88, 15.61, { boundary: 'national_park', tourism: 'attraction', wikidata: 'Q183654' }),
    node(26, 'Diocletian Palace', 43.508, 16.44, { tourism: 'attraction', historic: 'archaeological_site' })
  ]),
  Bulgaria: fixture([
    node(31, 'Sofia', 42.697, 23.321, { place: 'city' }), node(32, 'Plovdiv', 42.135, 24.745, { place: 'city' }),
    node(33, 'Veliko Tarnovo', 43.075, 25.617, { place: 'city' }), node(34, 'Varna', 43.214, 27.914, { place: 'city' }),
    node(35, 'Rila Monastery', 42.133, 23.34, { tourism: 'attraction', historic: 'monastery', wikidata: 'Q201293' }),
    node(36, 'Rhodope Mountains', 41.65, 24.57, { tourism: 'viewpoint', natural: 'mountain_range' })
  ]),
  Namibia: fixture([
    node(41, 'Windhoek', -22.56, 17.083, { place: 'city', aeroway: 'aerodrome' }), node(42, 'Sesriem', -24.486, 15.8, { place: 'village' }),
    node(43, 'Swakopmund', -22.678, 14.526, { place: 'city' }), node(44, 'Khorixas', -20.37, 14.96, { place: 'town' }),
    node(45, 'Otjiwarongo', -20.464, 16.647, { place: 'town' }), node(46, 'Outjo', -20.107, 16.154, { place: 'town' }),
    node(51, 'Sossusvlei', -24.73, 15.34, { tourism: 'attraction', natural: 'sand' }), node(52, 'Spitzkoppe', -21.83, 15.19, { tourism: 'viewpoint', natural: 'peak' }),
    node(53, 'Twyfelfontein', -20.59, 14.37, { tourism: 'attraction', historic: 'archaeological_site', wikidata: 'Q215980' }),
    node(54, 'Etosha National Park', -18.95, 16.33, { boundary: 'national_park', tourism: 'attraction' }),
    node(55, 'Waterberg Plateau', -20.45, 17.24, { boundary: 'national_park', tourism: 'viewpoint' }),
    node(56, 'Fish River Canyon', -27.59, 17.61, { tourism: 'viewpoint', natural: 'cliff' })
  ])
};

test('production proposal flow has no destination catalogue import or service-worker entry', () => {
  assert.doesNotMatch(source('app.js'), /from ['"]\.\/destinations\.js/);
  assert.doesNotMatch(source('service-worker.js'), /['"]\.\/destinations\.js['"]/);
  assert.doesNotMatch(source('destination-provider.js'), /Namibia|South Africa|Croatia|Bulgaria|Slovenia|Dolomites|Black Forest/i);
});

test('recorded country provider responses produce dynamic regional concepts without templates', () => {
  const definitions = {
    'South Africa': [[-35, -22, 16, 33], { lat: -30.56, lon: 22.94 }], Croatia: [[42.3, 46.6, 13.3, 19.5], { lat: 45.1, lon: 15.2 }],
    Bulgaria: [[41.2, 44.3, 22.3, 28.7], { lat: 42.73, lon: 25.49 }], Namibia: [[-29, -16.8, 11.7, 25.3], { lat: -22.56, lon: 17.08 }]
  };
  for (const [name, payload] of Object.entries(countryFixtures)) {
    const [bounds, point] = definitions[name];
    const concepts = clusterDestinationRegions(trip({ destinationQuery: name }), resolution(name, name.length, bounds, point), normalizeAnchorElements(payload));
    assert.ok(concepts.length >= 2, `${name} should create more than one region concept`);
    assert.ok(concepts.every(item => item.dynamic && item.provider?.name === 'OpenStreetMap'));
    assert.ok(concepts.some(item => item.highlights.length > 1));
  }
});

test('Namibia golden case is a generic multi-base graph and omits an infeasible southern highlight', () => {
  const request = trip({ destinationQuery: 'Namibia', days: 14, maxDrive: 5, maxChanges: 6 });
  const concepts = clusterDestinationRegions(request, resolution('Namibia', 99, [-29, -16.8, 11.7, 25.3], { lat: -22.56, lon: 17.08 }), normalizeAnchorElements(countryFixtures.Namibia));
  const destination = concepts.sort((a, b) => b.highlights.length - a.highlights.length)[0];
  const plan = buildItinerary(request, destination);
  const bases = new Set(plan.days.filter(day => day.overnight !== request.origin).map(day => day.overnight));
  assert.equal(plan.days.length, 14);
  assert.ok(bases.size >= 3);
  assert.ok(plan.omittedHighlights.some(item => /Fish River Canyon/i.test(item.name)));
  assert.equal(plan.days.at(-1).to, request.origin);
});

test('every graph travel day is a selectable map segment and map/plan share canonical data', () => {
  const request = trip({ destinationQuery: 'Croatia', days: 12, maxChanges: 5 });
  const destination = clusterDestinationRegions(request, resolution('Croatia', 7, [42.3, 46.6, 13.3, 19.5], { lat: 45.1, lon: 15.2 }), normalizeAnchorElements(countryFixtures.Croatia))[0];
  const plan = buildItinerary(request, destination);
  const travelDays = plan.days.filter(day => ['outward', 'transfer', 'return'].includes(day.kind) && day.geometry.length > 1);
  const segments = collectRouteSegments(plan);
  const model = buildMapModel(plan);
  assert.ok(travelDays.every(day => segments.some(segment => segment.day === day.day)));
  assert.deepEqual(model.segments.map(item => item.day), segments.map(item => item.day));
});

test('vehicle switching rebuilds recommendations without profile contamination', () => {
  const days = [{ day: 1, kind: 'stay', from: 'Base', to: 'Base', location: 'Base', overnight: 'Base', toPoint: { lat: 1, lon: 1 }, waypoints: [], primaryPlan: 'Wandeling' }];
  const destination = { bases: [{ name: 'Base', lat: 1, lon: 1 }] };
  buildRecommendations(trip({ travelMode: 'fly-ride', transport: 'motorcycle' }), destination, days);
  assert.match(JSON.stringify(days), /Motorvriendelijk/);
  buildRecommendations(trip({ transport: 'car' }), destination, days);
  assert.doesNotMatch(JSON.stringify(days), /motorvriendelijk|motorparking|motorhotel/i);
  assert.ok(recommendationsMatchVehicle({ recommendations: days[0].recommendations }, 'car'));
  const camperDays = structuredClone(days); buildRecommendations(trip({ travelMode: 'fly-camper', transport: 'motorhome' }), destination, camperDays);
  const caravanDays = structuredClone(days); buildRecommendations(trip({ travelMode: 'direct', transport: 'caravan' }), destination, caravanDays);
  assert.notEqual(camperDays[0].sleepProposal.name, caravanDays[0].sleepProposal.name);
});

test('discovery cache identity changes for every material planning input', () => {
  const base = trip({ destinationQuery: 'Croatia' });
  const resolved = resolution('Croatia', 7, [42.3, 46.6, 13.3, 19.5], { lat: 45.1, lon: 15.2 });
  const key = buildDiscoveryCacheKey(base, { resolution: resolved });
  for (const changed of [
    { destinationQuery: 'Bulgaria' }, { travelMode: 'fly-ride', transport: 'motorcycle' }, { days: 18 }, { maxDrive: 6 },
    { maxChanges: 3 }, { routeTopology: 'open-jaw' }, { preferences: ['eten'] }
  ]) assert.notEqual(buildDiscoveryCacheKey(normalizeTrip({ ...base, ...changed }), { resolution: resolved }), key);
});

test('provider failure cannot produce unrelated fallback proposals', async () => {
  const result = await discoverDestinationBatch(trip({ destinationQuery: '' }), {
    storage: null, endpoints: ['https://invalid.test'], fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.equal(result.live, false);
  assert.deepEqual(result.destinations, []);
  assert.match(result.reason, /No unrelated fallback trips have been generated/);
});

test('an unknown geocoded region works without a production code release', () => {
  const request = trip({ destinationQuery: 'Example Archipelago' });
  const resolved = resolution('Example Archipelago', 12345, [-8, -4, 140, 145], { lat: -6, lon: 142 });
  const anchors = normalizeAnchorElements(fixture([
    node(9001, 'Harbour Town', -6.1, 142.1, { place: 'town', aeroway: 'aerodrome' }),
    node(9002, 'Cloud Forest', -6.3, 142.3, { tourism: 'viewpoint', natural: 'forest' }),
    node(9003, 'North Village', -5.8, 142.5, { place: 'village' })
  ]));
  const concepts = clusterDestinationRegions(request, resolved, anchors);
  assert.ok(concepts.length && concepts[0].name.includes('Example Archipelago'));
});
