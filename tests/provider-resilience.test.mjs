import test from 'node:test';
import assert from 'node:assert/strict';
import { geocodePlace } from '../geocoding-provider.js';
import { discoverDestinationBatch, normalizeDestinationResolution } from '../destination-provider.js';
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
    importance: .9, boundingbox: ['-35', '-22', '16', '33'], lat: '-30.56', lon: '22.94', address: { country: 'South Africa', country_code: 'za' }
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
