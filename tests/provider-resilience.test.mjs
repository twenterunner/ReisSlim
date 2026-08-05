import test from 'node:test';
import assert from 'node:assert/strict';
import { geocodePlace, normalizeBoundaryGeometry, pointInBoundary } from '../geocoding-provider.js';
import { normalizePhotonSettlements, selectSignificantSettlements } from '../discovery-bootstrap-provider.js';
import { buildBoundarySamples, buildDiscoveryCacheKey, buildDiscoveryQueries, clusterDestinationRegions, discoverDestinationBatch, normalizeDestinationResolution } from '../destination-provider.js';
import { buildItinerary } from '../itinerary-engine.js';
import { normalizeTrip } from '../trip-model.js';

const response = data => ({ ok: true, status: 200, json: async () => data });
const photonFeature = (name, lat, lon, id, type = 'city', countryCode = 'ZZ') => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name, city: name, country: 'Dynamic evidence country', countrycode: countryCode, osm_key: 'place', osm_value: type, layer: 'city', osm_type: 'N', osm_id: id }
});
const wikiPayload = (name, lat, lon, id) => ({ query: { pages: { [id]: {
  pageid: id, title: name, fullurl: `https://en.wikipedia.org/?curid=${id}`,
  coordinates: [{ lat, lon }]
} } } });
const rectangle = (south, north, west, east) => ({
  type: 'Polygon',
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
});
const screenshotTrip = overrides => normalizeTrip({
  origin: 'Saasveld', originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
  destinationQuery: '', startDate: '2026-09-03', days: 3, budget: 10000,
  adults: 1, children: 1, travelMode: 'direct', transport: 'motorcycle', routeTopology: 'loop',
  maxDrive: 5, maxChanges: 5, comfort: 'mid', strictBudget: true, strictDrive: true,
  strictChanges: true, allowStretch: true, liveData: true, preferences: ['natuur', 'motor'],
  preferenceWeights: { natuur: 3, motor: 3 }, ...overrides
});

test('secondary geocoder resolves a typed place when Nominatim is unavailable', async () => {
  const calls = [];
  const result = await geocodePlace('Croatia', {
    storage: null,
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).includes('nominatim')) throw new Error('primary offline');
      return response({ features: [photonFeature('Croatia', 45.1, 15.2, 214885, 'country')] });
    }
  });
  assert.equal(result.status, 'fresh-secondary');
  assert.equal(result.resolution.name, 'Croatia');
  assert.equal(result.resolution.provider, 'Photon (OpenStreetMap)');
  assert.equal(calls.length, 2);
});

test('blank three-day motorcycle request survives Overpass failure with independent named evidence', async () => {
  let reverseCalls = 0;
  let wikiCalls = 0;
  const result = await discoverDestinationBatch(screenshotTrip(), {
    storage: null,
    endpoints: ['https://overpass.invalid/api'],
    timeoutMs: 5,
    deadlineMs: 40,
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('overpass.invalid')) throw new Error('Overpass 504');
      if (value.includes('photon.komoot.io/reverse')) {
        reverseCalls += 1;
        const parsed = new URL(value);
        const lat = Number(parsed.searchParams.get('lat'));
        const lon = Number(parsed.searchParams.get('lon'));
        return response({ features: [photonFeature(`Routebase ${reverseCalls}`, lat, lon, 1000 + reverseCalls)] });
      }
      if (value.includes('wikipedia.org/w/api.php')) {
        wikiCalls += 1;
        const parsed = new URL(value);
        const [lat, lon] = parsed.searchParams.get('ggscoord').split('|').map(Number);
        return response(wikiPayload(`Named highlight ${wikiCalls}`, lat + .01, lon + .01, 2000 + wikiCalls));
      }
      throw new Error(`Unexpected URL ${value}`);
    }
  });
  assert.equal(result.live, true);
  assert.equal(result.outcome, 'degraded');
  assert.ok(result.destinations.length >= 1);
  assert.ok(reverseCalls >= 1);
  assert.ok(wikiCalls >= 1);
  assert.match(result.source, /Photon/);
  assert.doesNotMatch(result.reason || '', /Dynamic destination discovery is currently unavailable/);
  assert.ok(result.anchors.every(anchor => anchor.providerId && anchor.point && anchor.provider));

  const plan = buildItinerary(screenshotTrip(), result.destinations[0]);
  assert.equal(plan.days.length, 3);
  assert.match(plan.days[1].primaryPlan, /Named highlight/);
  assert.notEqual(plan.days[0].to, 'Dynamisch ontdekt gebied');
  assert.equal(plan.days.at(-1).to, 'Saasveld');
});

test('broad country fallback yields named regional bases instead of a country-centroid stay', async () => {
  const resolved = normalizeDestinationResolution('South Africa', {
    osm_type: 'relation', osm_id: 87565, display_name: 'South Africa', addresstype: 'country', type: 'administrative', class: 'boundary',
    importance: .9, boundingbox: ['-35', '-22', '16', '33'], lat: '-30.56', lon: '22.94', address: { country: 'South Africa', country_code: 'za' },
    geojson: rectangle(-35, -22, 16, 33)
  });
  const names = [
    ['Stampriet', -24.34, 18.40, 'NA'],
    ['Cape Town', -33.925, 18.424], ['Knysna', -34.036, 23.047],
    ['Mbombela', -25.475, 30.969], ['Durban', -29.858, 31.022]
  ];
  let reverseCalls = 0;
  let wikiCalls = 0;
  const request = screenshotTrip({ destinationQuery: 'South Africa', days: 14, travelMode: 'fly-ride', maxChanges: 6 });
  const result = await discoverDestinationBatch(request, {
    resolution: resolved, storage: null, endpoints: ['https://overpass.invalid/api'], timeoutMs: 5, deadlineMs: 40,
    fetchImpl: async url => {
      const value = String(url);
      if (value.includes('overpass.invalid')) throw new Error('Overpass 504');
      if (value.includes('photon.komoot.io/reverse')) {
        const [name, lat, lon, countryCode = 'ZA'] = names[reverseCalls % names.length];
        reverseCalls += 1;
        return response({ features: [photonFeature(name, lat, lon, 3000 + reverseCalls, 'city', countryCode)] });
      }
      if (value.includes('wikipedia.org/w/api.php')) {
        const parsed = new URL(value);
        const [lat, lon] = parsed.searchParams.get('ggscoord').split('|').map(Number);
        wikiCalls += 1;
        return response(wikiPayload(`Regional highlight ${wikiCalls}`, lat + .03, lon + .03, 4000 + wikiCalls));
      }
      throw new Error(`Unexpected URL ${value}`);
    }
  });
  assert.ok(result.destinations.length >= 3);
  assert.ok(result.anchors.every(anchor => anchor.countryCode !== 'NA'));
  assert.ok(result.destinations.every(item => item.bases[0].name !== 'South Africa'));
  assert.ok(result.destinations.some(item => item.highlights.some(highlight => /Regional highlight/.test(highlight.name))));
  const plan = buildItinerary(request, result.destinations[0]);
  assert.ok(plan.days.some(day => /Regional highlight/.test(day.primaryPlan)));
  assert.ok(new Set(plan.days.map(day => day.overnight)).size >= 2);
});

test('all-provider outage returns a structured infrastructure outcome without fabricated trips', async () => {
  const result = await discoverDestinationBatch(screenshotTrip(), {
    storage: null, endpoints: ['https://overpass.invalid/api'], timeoutMs: 5, deadlineMs: 30,
    fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.equal(result.live, false);
  assert.equal(result.outcome, 'provider-unavailable');
  assert.deepEqual(result.destinations, []);
  assert.match(result.reason, /onafhankelijke settlementprovider/);
});

test('boundary-aware macro samples stay inside polygons and outside holes', () => {
  const boundary = normalizeBoundaryGeometry({
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
    ]
  });
  const samples = buildBoundarySamples({ bounds: [0, 10, 0, 10], boundary }, 0, 8);
  assert.equal(samples.length, 8);
  assert.ok(samples.every(sample => pointInBoundary(sample, boundary)));
  assert.ok(samples.every(sample => !(sample.lat > 4 && sample.lat < 6 && sample.lon > 4 && sample.lon < 6)));
  assert.ok(samples.every(sample => sample.scale === 'macro'));
});

test('macro settlement ranking prefers significant cities and towns over nearby suburbs', () => {
  const payload = { features: [
    photonFeature('Metro suburb', 1, 1, 501, 'suburb'),
    { ...photonFeature('Evidence City', 1.04, 1.04, 502, 'city'), properties: { ...photonFeature('Evidence City', 1.04, 1.04, 502, 'city').properties, population: 900000 } },
    { ...photonFeature('Regional Town', 4, 4, 503, 'town'), properties: { ...photonFeature('Regional Town', 4, 4, 503, 'town').properties, population: 45000 } }
  ] };
  const normalized = normalizePhotonSettlements(payload, { sample: { lat: 1, lon: 1, sequence: 0 } });
  const ranked = selectSignificantSettlements(normalized, { minSeparationKm: 20 });
  assert.deepEqual(ranked.map(item => item.name), ['Evidence City', 'Regional Town']);
  assert.ok(ranked[0].importance > normalized.find(item => item.name === 'Metro suburb').importance);
  assert.ok(ranked.every(item => item.macroCandidate));
});

test('broad dynamic evidence creates diverse regional concepts without suburbs, centroids, or cross-boundary anchors', () => {
  const resolved = normalizeDestinationResolution('Evidence Republic', {
    osm_type: 'relation', osm_id: 99001, display_name: 'Evidence Republic', addresstype: 'country', type: 'administrative', class: 'boundary',
    importance: .8, boundingbox: ['0', '7', '0', '7'], lat: '3.5', lon: '3.5', address: { country: 'Evidence Republic', country_code: 'zz' },
    geojson: rectangle(0, 7, 0, 7)
  });
  const settlement = (id, name, lat, lon, importance, macroType = 'city', countryCode = 'ZZ') => ({
    id, providerId: id, name, point: { lat, lon }, role: 'settlement', tags: [], rawTags: { place: macroType },
    importance, macroType, macroCandidate: ['city', 'town', 'municipality'].includes(macroType), countryCode,
    countryEvidence: 'provider', confidence: 'provider-evidence', provider: 'Recorded provider', sourceUrl: `https://example.test/${id}`
  });
  const highlight = (id, name, lat, lon) => ({
    id, providerId: id, name, point: { lat, lon }, role: 'highlight', tags: ['natuur'], rawTags: { tourism: 'attraction' },
    importance: 78, countryCode: 'ZZ', countryEvidence: 'provider', confidence: 'provider-evidence', provider: 'Recorded provider', sourceUrl: `https://example.test/${id}`
  });
  const anchors = [
    settlement('city-a', 'Alpha City', 1, 1, 94), settlement('suburb-a', 'Alpha Suburb', 1.03, 1.03, 35, 'suburb'),
    settlement('city-b', 'Beta City', 1, 5.5, 88), settlement('city-c', 'Gamma City', 5.5, 3.2, 84),
    settlement('outside', 'Outside City', 8, 3, 99, 'city', 'YY'),
    highlight('highlight-a', 'Alpha Reserve', 1.1, 1.1), highlight('highlight-b', 'Beta Coast', 1.1, 5.4), highlight('highlight-c', 'Gamma Peak', 5.4, 3.2),
    highlight('outside-highlight', 'Outside Monument', 8.1, 3)
  ];
  const request = screenshotTrip({ destinationQuery: 'Evidence Republic', days: 12, maxDrive: 2, travelMode: 'fly-ride' });
  const concepts = clusterDestinationRegions(request, resolved, anchors);
  assert.equal(concepts.length, 3);
  assert.deepEqual(new Set(concepts.map(item => item.bases[0].name)), new Set(['Alpha City', 'Beta City', 'Gamma City']));
  assert.doesNotMatch(JSON.stringify(concepts), /Alpha Suburb|Outside City|Outside Monument|Evidence Republic"\s*,\s*"lat/);
  assert.ok(concepts.every(item => item.highlights.some(highlightItem => /Reserve|Coast|Peak/.test(highlightItem.name))));
});

test('a broad boundary never becomes a country-centroid proposal without regional evidence', () => {
  const resolved = normalizeDestinationResolution('Empty Republic', {
    osm_type: 'relation', osm_id: 99002, display_name: 'Empty Republic', addresstype: 'country', type: 'administrative', class: 'boundary',
    boundingbox: ['0', '10', '0', '10'], lat: '5', lon: '5', geojson: rectangle(0, 10, 0, 10)
  });
  assert.deepEqual(clusterDestinationRegions(screenshotTrip({ destinationQuery: 'Empty Republic' }), resolved, []), []);
});

test('large relation discovery scopes every macro query to the resolved boundary area', () => {
  const resolved = normalizeDestinationResolution('Area Country', {
    osm_type: 'relation', osm_id: 99003, display_name: 'Area Country', addresstype: 'country', type: 'administrative', class: 'boundary',
    boundingbox: ['-20', '20', '-25', '25'], lat: '0', lon: '0'
  });
  const stages = buildDiscoveryQueries(screenshotTrip({ destinationQuery: 'Area Country', days: 18 }), 0, resolved);
  assert.ok(stages.length === 2 && stages.every(stage => stage.boundaryProviderId === 'relation/99003'));
  assert.ok(stages.every(stage => stage.query.includes('map_to_area->.targetArea')));
  assert.ok(stages.every(stage => [...stage.query.matchAll(/nwr([^;]+);/g)].every(match => match[1].includes('(area.targetArea)'))));
  assert.ok(stages[0].query.includes('(around:') && !stages[0].query.includes('][name](-20.0000'));
});

test('exact stale geocoding cache survives a transient outage without substituting another place', async () => {
  const records = new Map();
  const storage = { getItem: key => records.get(key) || null, setItem: (key, value) => records.set(key, value) };
  globalThis.__reisslimNominatimRequestAt = 0;
  const first = await geocodePlace('Evidence City', {
    storage,
    fetchImpl: async url => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('polygon_geojson'), '1');
      return response([{ osm_type: 'relation', osm_id: 73001, display_name: 'Evidence City, Evidence Republic', addresstype: 'city', type: 'administrative', class: 'boundary', lat: '2', lon: '3', boundingbox: ['1', '3', '2', '4'] }]);
    }
  });
  assert.equal(first.status, 'fresh');
  for (const [key, value] of records) {
    const record = JSON.parse(value); record.savedAt = Date.now() - 100 * 24 * 60 * 60 * 1000; records.set(key, JSON.stringify(record));
  }
  globalThis.__reisslimNominatimRequestAt = 0;
  const stale = await geocodePlace('Evidence City', { storage, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(stale.status, 'stale-cache');
  assert.equal(stale.resolution.providerId, 'relation/73001');
  assert.equal(stale.resolution.stale, true);
  assert.match(stale.warnings.at(-1), /exact passende oudere/);
});

test('exact cached discovery is boundary-filtered before it can create proposals', async () => {
  const resolved = normalizeDestinationResolution('Cache Country', {
    osm_type: 'relation', osm_id: 99004, display_name: 'Cache Country', addresstype: 'country', type: 'administrative', class: 'boundary',
    boundingbox: ['0', '6', '0', '6'], lat: '3', lon: '3', address: { country_code: 'zz' }, geojson: rectangle(0, 6, 0, 6)
  });
  const request = screenshotTrip({ destinationQuery: 'Cache Country', days: 10, travelMode: 'fly-ride' });
  const key = buildDiscoveryCacheKey(request, { resolution: resolved });
  const cachedAnchors = [
    { id: 'inside', providerId: 'inside', name: 'Inside City', point: { lat: 2, lon: 2 }, role: 'settlement', tags: [], rawTags: { place: 'city' }, importance: 90, macroCandidate: true, countryCode: 'ZZ', provider: 'Recorded cache' },
    { id: 'outside', providerId: 'outside', name: 'Outside City', point: { lat: 8, lon: 2 }, role: 'settlement', tags: [], rawTags: { place: 'city' }, importance: 99, macroCandidate: true, countryCode: 'YY', provider: 'Recorded cache' }
  ];
  const record = JSON.stringify({ savedAt: Date.now(), endpoint: 'Recorded exact cache', anchors: cachedAnchors, payload: { elements: [] }, degraded: false, warnings: [] });
  const storage = { getItem: candidate => candidate === key ? record : null, setItem: () => {} };
  const result = await discoverDestinationBatch(request, { resolution: resolved, storage, fetchImpl: async () => { throw new Error('network should not be used'); } });
  assert.equal(result.cached, true);
  assert.deepEqual(result.anchors.map(item => item.name), ['Inside City']);
  assert.deepEqual(result.destinations.map(item => item.bases[0].name), ['Inside City']);
});

test('an already-aborted discovery cannot return cached data or write provider results', async () => {
  const controller = new AbortController(); controller.abort();
  let writes = 0; let requests = 0;
  const storage = { getItem: () => null, setItem: () => { writes += 1; } };
  await assert.rejects(
    discoverDestinationBatch(screenshotTrip(), { storage, signal: controller.signal, fetchImpl: async () => { requests += 1; return response({ elements: [] }); } }),
    error => error?.name === 'AbortError'
  );
  assert.equal(requests, 0);
  assert.equal(writes, 0);
});

test('aborting concurrent macro providers rejects once and never populates the exact cache', async () => {
  const controller = new AbortController();
  let writes = 0; let requests = 0;
  const storage = { getItem: () => null, setItem: () => { writes += 1; } };
  const fetchImpl = async (url, options = {}) => {
    requests += 1;
    return await new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException(`aborted ${url}`, 'AbortError'));
      options.signal?.addEventListener('abort', abort, { once: true });
    });
  };
  const pending = discoverDestinationBatch(screenshotTrip(), {
    storage, signal: controller.signal, fetchImpl, endpoints: ['https://overpass.invalid/api'], timeoutMs: 500, deadlineMs: 1000
  });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, error => error?.name === 'AbortError');
  assert.ok(requests >= 2, 'Overpass and macro bootstrap should both have started');
  assert.equal(writes, 0);
});
