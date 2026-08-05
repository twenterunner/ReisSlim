import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { loadCountryPack } from '../catalog-index.js';
import {
  buildOvertureBatchPlan, buildOverturePlan, PINNED_OVERTURE_RELEASE
} from '../scripts/overture-infrastructure.mjs';
import {
  mergeOvertureBaseEvidence, mergeOvertureCorridorEvidence, mergePackOvertureEvidence,
  normalizeOvertureBatchExtraction, normalizeOvertureExtraction
} from '../scripts/overture-normalization.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);

function asset(type = 'place') {
  return {
    id: `${type}-asset`,
    url: `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${PINNED_OVERTURE_RELEASE}/theme=${type === 'place' ? 'places' : 'transportation'}/type=${type}/part-00001-fixture-c000.zstd.parquet`
  };
}

function plan(type = 'place', overrides = {}) {
  return buildOverturePlan({
    bbox: [18, -34, 18.1, -33.9],
    basePoint: { lat: -33.95, lon: 18.05 },
    type,
    assets: [asset(type)],
    baseId: 'base-a',
    countryCode: 'ZA',
    ...overrides
  });
}

function base() {
  return {
    id: 'base-a', countryCode: 'ZA', name: 'Base A', lat: -33.95, lon: 18.05,
    role: 'overnight-base', roadAccess: null, roadSurface: null,
    vehicleFit: {
      car: { suitability: 'unknown', evidence: [] },
      motorcycle: { suitability: 'unknown', evidence: [] }
    },
    recommendations: {
      pois: [{
        id: 'gn-duplicate', providerId: '1', provider: 'GeoNames', name: 'Shared Museum',
        category: 'poi', baseId: 'base-a', lat: -33.949, lon: 18.051,
        distanceFromBaseKm: 0.2, confidence: 0.62,
        sourceUrl: 'https://www.geonames.org/1/', vehicleFit: { car: 'unknown', motorcycle: 'unknown' }
      }],
      accommodations: [], restaurants: [], services: []
    },
    sources: [{ provider: 'GeoNames', id: 'base-a', license: 'CC BY 4.0' }]
  };
}

test('places use bbox/base-point distance, evidence ranking, human links, and per-source licences', () => {
  const records = [
    { id: 'far-high', name: 'Far Museum', basic_category: 'museum', lat: -33.91, lon: 18.09, confidence: 0.91,
      addresses: [{ country: 'ZA' }], sources: [{ dataset: 'OpenStreetMap', record_id: 'node/1', license: 'ODbL-1.0' }] },
    { id: 'near-low', name: 'Near Museum', basic_category: 'museum', lat: -33.949, lon: 18.051, confidence: 0.75,
      addresses: [{ country: 'ZA' }], sources: [{ dataset: 'meta', record_id: 'place/2', license: 'CDLA-Permissive-2.0' }] },
    { id: 'hotel', name: 'Named Hotel', basic_category: 'hotel', lat: -33.95, lon: 18.052, confidence: 0.85,
      addresses: [{ country: 'ZA' }], sources: [{ dataset: 'meta', record_id: 'place/3', license: 'CDLA-Permissive-2.0' }] },
    { id: 'shop', name: 'Retail Noise', basic_category: 'fashion_and_apparel_store', lat: -33.95, lon: 18.05, confidence: 0.99 }
  ];
  const bundle = normalizeOvertureExtraction(records, plan());
  assert.equal(bundle.groups.pois.length, 2);
  assert.equal(bundle.groups.accommodations.length, 1);
  assert.equal(bundle.records.some(item => item.name === 'Retail Noise'), false);
  assert.ok(bundle.groups.pois[0].confidence >= bundle.groups.pois[1].confidence);
  assert.ok(Number.isFinite(bundle.groups.pois[0].distanceFromBaseKm));
  assert.match(bundle.groups.pois[0].rankingEvidence.method, /confidence-and-distance/);
  assert.match(bundle.groups.pois[0].sourceUrl, /^https:\/\/explore\.overturemaps\.org\//);
  assert.doesNotMatch(bundle.groups.pois[0].sourceUrl, /\.parquet/);
  assert.equal(bundle.assetProvenance[0].url.endsWith('.parquet'), true);
  assert.equal(bundle.groups.accommodations[0].sources.some(source => source.license === 'CDLA-Permissive-2.0'), true);
  assert.match(bundle.groups.accommodations[0].status, /availability and price not verified/);
  assert.equal(bundle.groups.accommodations[0].vehicleFit.motorcycle, 'unknown');
});

test('cross-border addresses are rejected and unknown country evidence is explicitly bounded and uncertain', () => {
  const records = [
    { id: 'wrong-country', name: 'Cross-border Hotel', basic_category: 'hotel', lat: -33.95, lon: 18.05, addresses: [{ country: 'NA' }] },
    { id: 'unknown-country', name: 'Unverified Hotel', basic_category: 'hotel', lat: -33.951, lon: 18.051, addresses: [] },
    { id: 'outside-bbox', name: 'Outside Hotel', basic_category: 'hotel', lat: -33.5, lon: 18.5, addresses: [] }
  ];
  const bundle = normalizeOvertureExtraction(records, plan());
  assert.deepEqual(bundle.records.map(item => item.providerId), ['unknown-country']);
  assert.equal(bundle.records[0].boundaryEvidence.status, 'bbox-only-country-unverified');
  assert.match(bundle.records[0].boundaryEvidence.warning, /exact extraction bbox/);
});

test('non-Latin named evidence survives diversity selection up to the retention target', () => {
  const records = ['Отас', 'Автосервис Азид', 'Мастерская Восток', 'Гараж Мир', 'Сервис Центр'].map((name, index) => ({
    id: `cyrillic-service-${index + 1}`,
    name,
    basic_category: 'automotive_service',
    lat: -33.95 + index / 10000,
    lon: 18.05 + index / 10000,
    confidence: .9 - index / 100,
    addresses: [{ country: 'ZA' }]
  }));
  const bundle = normalizeOvertureExtraction(records, plan());
  assert.equal(bundle.sourceAvailable.services, 5);
  assert.equal(bundle.groups.services.length, 5);
  assert.deepEqual(new Set(bundle.groups.services.map(item => item.name)), new Set(records.map(item => item.name)));
});

test('batch normalization groups envelopes per requested base and retains raw rows only at bundle root', () => {
  const batch = buildOvertureBatchPlan({
    type: 'place', countryCode: 'ZA', assets: [asset('place')],
    requests: [
      { baseId: 'base-a', bbox: [18, -34, 18.1, -33.9], basePoint: { lat: -33.95, lon: 18.05 } },
      { baseId: 'base-b', bbox: [19, -34, 19.1, -33.9], basePoint: { lat: -33.95, lon: 19.05 } }
    ]
  });
  const envelopes = [
    { baseId: 'base-a', record: { id: 'a', name: 'A Museum', basic_category: 'museum', lat: -33.95, lon: 18.051, addresses: [{ country: 'ZA' }] } },
    { baseId: 'base-b', record: { id: 'b', name: 'B Museum', basic_category: 'museum', lat: -33.95, lon: 19.051, addresses: [{ country: 'ZA' }] } }
  ];
  const result = normalizeOvertureBatchExtraction(envelopes, batch);
  assert.equal(result.bundles.length, 2);
  assert.equal(result.records.length, 2);
  assert.equal(result.rawRecords.length, 2);
  assert.equal(Object.hasOwn(result.bundles[0], 'rawRecords'), false);
  assert.deepEqual(result.bundles.map(bundle => bundle.baseId), ['base-a', 'base-b']);
  assert.ok(result.bundles.every(bundle => bundle.records[0].distanceFromBaseKm < 1));
  assert.throws(() => normalizeOvertureBatchExtraction([{ baseId: 'foreign', record: envelopes[0].record }], batch), /unknown or missing baseId/);
});

test('transportation normalization retains explicit road, access, timing, geometry and licence evidence without invention', async () => {
  const records = (await readFile(join(ROOT, 'tests/fixtures/overture-segments-raw.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const bundle = normalizeOvertureExtraction(records, plan('segment'));
  const road = bundle.records.find(item => item.providerId === 'segment-1');
  const ferry = bundle.records.find(item => item.providerId === 'segment-2');
  assert.deepEqual(road.roadClass, ['secondary']);
  assert.deepEqual(road.roadSurface, ['asphalt']);
  assert.equal(road.toll, true);
  assert.equal(road.ferry, null);
  assert.equal(road.curvatureSignal, 7);
  assert.equal(road.elevationSignal, 4);
  assert.equal(road.vehicleFit.car.suitability, 'limited');
  assert.equal(road.vehicleFit.motorcycle.suitability, 'supported');
  assert.equal(ferry.ferry, true);
  assert.equal(ferry.toll, null);
  assert.equal(road.license, 'ODbL 1.0');
  assert.match(road.attribution, /OpenStreetMap contributors/);
  assert.equal(bundle.rawRecords.length, 2);
});

test('base merge deduplicates GeoNames/OSM-style recommendations by normalized name and proximity', () => {
  const places = normalizeOvertureExtraction([
    { id: 'shared', name: 'Shared Museum', basic_category: 'museum', lat: -33.9491, lon: 18.0511, confidence: 0.9,
      addresses: [{ country: 'ZA' }], sources: [{ dataset: 'OpenStreetMap', record_id: 'node/77', license: 'ODbL-1.0' }] },
    { id: 'other', name: 'Another Museum', basic_category: 'museum', lat: -33.96, lon: 18.06, confidence: 0.8, addresses: [{ country: 'ZA' }] }
  ], plan());
  const merged = mergeOvertureBaseEvidence(base(), { places });
  assert.equal(merged.recommendations.pois.filter(item => item.name === 'Shared Museum').length, 1);
  const shared = merged.recommendations.pois.find(item => item.name === 'Shared Museum');
  assert.equal(shared.sources.some(source => source.provider === 'Overture Maps'), true);
  assert.equal(shared.sources.some(source => source.provider === 'GeoNames'), true);
  assert.equal(merged.overtureEnrichment.sourceAvailable.pois, 2);
  assert.equal(merged.overtureEnrichment.counts.pois, 2);
});

test('corridor and pack merge use only explicitly linked transportation geometry and emit release metadata', async () => {
  const rawSegments = (await readFile(join(ROOT, 'tests/fixtures/overture-segments-raw.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const segments = normalizeOvertureExtraction(rawSegments, plan('segment'));
  const corridor = {
    id: 'corridor-a-b', fromAnchorId: 'base-a', toAnchorId: 'base-b', roadClass: null, surface: null,
    ferry: null, toll: null, curvatureSignal: null, elevationSignal: null,
    geometry: [[-33.95, 18.05], [-33.9, 18.1]], geometryType: 'fallback-straight-line',
    source: { provider: 'ReisSlim', basedOn: 'coordinates' }, sourceIds: [], evidence: [], confidence: 0.25
  };
  const enrichedCorridor = mergeOvertureCorridorEvidence(corridor, segments);
  assert.deepEqual(enrichedCorridor.roadClass, ['secondary', 'primary']);
  assert.deepEqual(enrichedCorridor.surface, ['asphalt', 'paved']);
  assert.equal(enrichedCorridor.geometryType, 'overture-segment-coordinates');
  assert.equal(enrichedCorridor.geometryEvidence.length, 2);
  assert.equal(enrichedCorridor.vehicleCompatibility.motorcycle.suitability, 'supported');
  assert.equal(enrichedCorridor.overtureEvidence.license, 'ODbL 1.0');

  const places = normalizeOvertureExtraction([
    { id: 'stay', name: 'Named Stay', basic_category: 'hotel', lat: -33.95, lon: 18.051, addresses: [{ country: 'ZA' }] }
  ], plan());
  const pack = {
    schemaVersion: 1, catalogVersion: 'test', dataVersion: 'test', country: { code: 'ZA', name: 'South Africa' },
    sources: [{ provider: 'GeoNames', license: 'CC BY 4.0' }], anchors: [base(), { ...base(), id: 'base-b', name: 'Base B' }], corridors: [corridor]
  };
  const merged = mergePackOvertureEvidence(pack, {
    placeBundles: [places], segmentBundles: [segments], corridorBundles: [{ corridorId: corridor.id, bundle: segments }]
  });
  assert.match(merged.dataVersion, new RegExp(`overture-${PINNED_OVERTURE_RELEASE.replaceAll('.', '\\.')}`));
  assert.equal(merged.enrichments.overtureMaps.release, PINNED_OVERTURE_RELEASE);
  assert.equal(merged.enrichments.overtureMaps.enrichedBaseCount, 1);
  assert.equal(merged.anchors[1].overtureEnrichment, undefined,
    'anchors without an exact evidence bundle must not be marked as enriched');
  assert.equal(merged.sources.some(source => source.dataset === 'places' && source.license === 'CDLA-Permissive-2.0'), true);
  assert.equal(merged.sources.some(source => source.dataset === 'transportation' && source.license === 'ODbL 1.0'), true);
  assert.equal(merged.corridors[0].overtureEvidence.segmentCount, 2);
  const repeated = mergePackOvertureEvidence(merged, {
    placeBundles: [places], segmentBundles: [segments], corridorBundles: [{ corridorId: corridor.id, bundle: segments }]
  });
  assert.equal((repeated.dataVersion.match(/\+overture-/g) || []).length, 1, 'pack merge must be idempotent');
  assert.equal(repeated.sources.length, merged.sources.length, 'pack sources must not duplicate on rebuild');
  assert.equal(repeated.anchors[1].overtureEnrichment, undefined);
});

test('CLI merge writes one flat country pack and matching manifest metadata without touching source packs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reisslim-overture-merge-'));
  try {
    const pack = await loadCountryPack('ZA');
    const anchor = pack.anchors[0];
    const evidencePlan = plan('place', {
      bbox: [anchor.lon - 0.05, anchor.lat - 0.05, anchor.lon + 0.05, anchor.lat + 0.05],
      basePoint: { lat: anchor.lat, lon: anchor.lon },
      baseId: anchor.id
    });
    const evidence = normalizeOvertureExtraction([{
      id: 'cli-hotel', name: 'CLI Evidence Hotel', basic_category: 'hotel', lat: anchor.lat, lon: anchor.lon, confidence: 0.999,
      addresses: [{ country: 'ZA' }], sources: [{ dataset: 'meta', record_id: 'cli/1', license: 'CDLA-Permissive-2.0' }]
    }], evidencePlan);
    const evidencePath = join(directory, 'places.json');
    const packPath = join(directory, 'catalog-za.js');
    const indexPath = join(directory, 'catalog-index.js');
    await writeFile(evidencePath, JSON.stringify(evidence), 'utf8');
    await execFileAsync(process.execPath, [join(ROOT, 'scripts/overture-catalog.mjs'), 'merge', '--country-code=ZA',
      `--places=${evidencePath}`, `--pack-output=${packPath}`, `--index-output=${indexPath}`], { cwd: ROOT });
    const [packSource, indexSource] = await Promise.all([readFile(packPath, 'utf8'), readFile(indexPath, 'utf8')]);
    assert.match(packSource, /CLI Evidence Hotel/);
    assert.match(packSource, new RegExp(`overture-${PINNED_OVERTURE_RELEASE.replaceAll('.', '\\.')}`));
    assert.match(indexSource, /overtureMaps/);
    assert.match(indexSource, new RegExp(`overture-${PINNED_OVERTURE_RELEASE.replaceAll('.', '\\.')}`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
