import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  OSM_ENRICHMENT_SCHEMA_VERSION, boundingBoxForBase, buildOverpassQuery,
  enrichmentCacheIdentity, fetchOverpassJson, mergeBaseEnrichment,
  mergePackEnrichments, parseOverpassResponse, runBounded, selectImportantBases
} from '../scripts/osm-enrichment.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/overpass-base-sample.json', import.meta.url), 'utf8'));
const base = {
  id: 'gn-3352136', countryCode: 'NA', name: 'Windhoek', lat: -22.55941, lon: 17.08323,
  role: 'gateway-capital', significance: { score: 100, population: 386219 },
  recommendations: { pois: [], accommodations: [], restaurants: [], services: [] },
  sources: [{ provider: 'GeoNames', id: '3352136', url: 'https://www.geonames.org/3352136/', license: 'CC BY 4.0' }],
  vehicleFit: {
    car: { suitability: 'unknown', evidence: [] },
    motorcycle: { suitability: 'unknown', evidence: [] }
  }
};

test('Overpass query is bounded, named-only for recommendations, and capped', () => {
  const bounds = boundingBoxForBase(base, 12);
  assert.ok(bounds.south < base.lat && bounds.north > base.lat);
  assert.ok(bounds.west < base.lon && bounds.east > base.lon);
  const query = buildOverpassQuery(base, { radiusKm: 12, timeoutSeconds: 25, outputLimit: 900 });
  assert.match(query, /^\[out:json\]\[timeout:25\]/);
  assert.match(query, /->\.accommodations/);
  assert.match(query, /->\.food/);
  assert.match(query, /->\.services/);
  assert.match(query, /->\.pois/);
  assert.match(query, /way\["highway"/);
  assert.match(query, /relation\["type"="route"\]\["route"/);
  assert.match(query, /\.accommodations out tags center qt 180;/);
  assert.match(query, /\.food out tags center qt 180;/);
  assert.match(query, /\.services out tags center qt 180;/);
  assert.match(query, /\.pois out tags center qt 360;/);
  assert.match(query, /\.roads out tags center qt 200;/);
  assert.doesNotMatch(query, /out meta/);
  assert.doesNotMatch(query, /{{bbox}}/);
});

test('cache identity changes with endpoint, coordinates, base or query', () => {
  const query = buildOverpassQuery(base);
  const first = enrichmentCacheIdentity({ endpoint: 'https://one.test/api', base, query });
  assert.equal(first.length, 64);
  assert.notEqual(first, enrichmentCacheIdentity({ endpoint: 'https://two.test/api', base, query }));
  assert.notEqual(first, enrichmentCacheIdentity({ endpoint: 'https://one.test/api', base: { ...base, lat: base.lat + 0.01 }, query }));
  assert.notEqual(first, enrichmentCacheIdentity({ endpoint: 'https://one.test/api', base, query: `${query}\n` }));
});

test('parser emits only real named categorized evidence with OSM provenance', () => {
  const parsed = parseOverpassResponse(fixture, base, {
    endpoint: 'https://overpass-api.de/api/interpreter',
    retrievedAt: '2026-08-05T12:00:00.000Z',
    queryBounds: boundingBoxForBase(base)
  });
  assert.equal(parsed.schemaVersion, OSM_ENRICHMENT_SCHEMA_VERSION);
  assert.deepEqual(parsed.counts, { pois: 1, accommodations: 1, restaurants: 1, services: 2 });
  const all = Object.values(parsed.recommendations).flat();
  assert.equal(all.length, 5);
  assert.ok(all.every(item => item.name && item.provider === 'OpenStreetMap'));
  assert.ok(all.every(item => item.providerId.includes('/') && item.sourceUrl.startsWith('https://www.openstreetmap.org/')));
  assert.ok(all.every(item => !/Unrelated Pharmacy/.test(item.name)));
  assert.equal(parsed.recommendations.accommodations[0].parkingEvidence.includes('covered=yes'), true);
  assert.equal(parsed.recommendations.accommodations[0].vehicleFit.motorcycle, 'supported');
  assert.equal(parsed.recommendations.restaurants[0].openingHours, 'Tu-Su 08:00-16:00');
  assert.deepEqual(parsed.roadSurface.values, ['asphalt']);
  assert.ok(parsed.roadAccess.highwayClasses.includes('primary'));
  assert.equal(parsed.services.fuelCount, 1);
  assert.equal(parsed.services.motorcycleParkingCount, 1);
  assert.equal(parsed.vehicleFit.car.suitability, 'supported');
  assert.equal(parsed.vehicleFit.motorcycle.suitability, 'supported');
  assert.equal(parsed.touringRoutes[0].name, 'Evidence Touring Route');
  assert.equal(parsed.touringRoutes[0].route, 'motorcycle');
});

test('merging is deterministic, deduplicates same named nearby evidence and adds ODbL metadata', () => {
  const parsed = parseOverpassResponse(fixture, base, {
    endpoint: 'https://overpass-api.de/api/interpreter', retrievedAt: '2026-08-05T12:00:00.000Z'
  });
  const withDuplicate = {
    ...base,
    recommendations: {
      ...base.recommendations,
      accommodations: [{
        id: 'gn-existing', providerId: '123', provider: 'GeoNames', name: 'Hotel Evidence', category: 'accommodation',
        baseId: base.id, lat: -22.56101, lon: 17.08601, sourceUrl: 'https://www.geonames.org/123/', vehicleFit: { car: 'unknown', motorcycle: 'unknown' }
      }]
    }
  };
  const merged = mergeBaseEnrichment(withDuplicate, parsed);
  assert.equal(merged.recommendations.accommodations.filter(item => item.name === 'Hotel Evidence').length, 1);
  const hotel = merged.recommendations.accommodations.find(item => item.name === 'Hotel Evidence');
  assert.equal(hotel.sources.length, 2);
  assert.ok(hotel.parkingEvidence.includes('covered=yes'));
  assert.equal(merged.osmEnrichment.schemaVersion, OSM_ENRICHMENT_SCHEMA_VERSION);
  assert.equal(merged.vehicleFit.motorcycle.suitability, 'supported');
  const pack = mergePackEnrichments({
    schemaVersion: 1, dataVersion: 'test-1', country: { code: 'NA' }, anchors: [withDuplicate], corridors: [], sources: [], stats: {}
  }, [parsed]);
  assert.match(pack.dataVersion, /\+osm-1$/);
  assert.equal(pack.sources.at(-1).license, 'ODbL 1.0');
  assert.equal(pack.enrichments.openStreetMap.attribution, '© OpenStreetMap contributors');
  assert.equal(pack.stats.namedRecommendations, 5);
});

test('important-base selection balances significance and geography without country branches', () => {
  const anchors = Array.from({ length: 30 }, (_, index) => ({
    id: `base-${index}`, name: `Base ${index}`, countryCode: 'ZZ', role: 'overnight-base',
    lat: index < 20 ? 50 + index * 0.001 : 50 + index / 2,
    lon: index < 20 ? 5 + index * 0.001 : 5 + index / 3,
    significance: { score: 100 - index, population: 100000 - index }
  }));
  const selected = selectImportantBases({ anchors }, 5);
  assert.equal(selected.length, 5);
  assert.equal(selected[0].id, 'base-0');
  assert.ok(selected.some(item => item.id >= 'base-20'));
});

test('scale-derived base target uses broad coverage for large packs and all bases for microstates', () => {
  const large = {
    country: { bounds: { south: -35, west: 16, north: -22, east: 33 } },
    anchors: Array.from({ length: 200 }, (_, index) => ({
      id: `large-${index}`, name: `Large ${index}`, countryCode: 'ZZ', role: 'overnight-base',
      lat: -34 + (index % 20) * 0.6, lon: 17 + Math.floor(index / 20) * 1.4,
      significance: { score: 100 - index / 10, population: 100000 - index }
    }))
  };
  assert.equal(selectImportantBases(large).length, 20);
  const microstate = { anchors: large.anchors.slice(0, 7) };
  assert.equal(selectImportantBases(microstate).length, 7);
});

test('bounded runner preserves order and honors concurrency', async () => {
  let active = 0; let maximum = 0;
  const output = await runBounded([1, 2, 3, 4], async value => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  }, { concurrency: 2, minimumDelayMs: 0 });
  assert.deepEqual(output, [2, 4, 6, 8]);
  assert.ok(maximum <= 2);
});

test('Overpass fetch retries transient responses and sends a POST form query', async () => {
  let calls = 0;
  const requests = [];
  const payload = { elements: [] };
  const fetchImpl = async (url, options) => {
    calls += 1; requests.push({ url, options });
    if (calls === 1) return { ok: false, status: 429, headers: { get: () => '0' } };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => payload };
  };
  const result = await fetchOverpassJson('[out:json];out;', {
    endpoint: 'https://example.test/interpreter', fetchImpl, retries: 1, baseDelayMs: 0, timeoutMs: 1000
  });
  assert.equal(result, payload);
  assert.equal(calls, 2);
  assert.equal(requests[0].options.method, 'POST');
  assert.match(requests[0].options.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  assert.match(requests[0].options.body, /^data=/);
});
