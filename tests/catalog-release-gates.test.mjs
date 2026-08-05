import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueDataQualityMarkdown, validateCatalogReleasePack } from '../scripts/check-catalog-release.mjs';
import {
  OVERTURE_EXTRACTION_SCHEMA_VERSION,
  PINNED_OVERTURE_RELEASE,
  PINNED_OVERTURE_SCHEMA
} from '../scripts/overture-infrastructure.mjs';

const PLAN_A = 'a'.repeat(64);
const PLAN_B = 'b'.repeat(64);

function records(baseId, category, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `overture-${baseId}-${category}-${index + 1}`,
    providerId: `${baseId}-${category}-${index + 1}`,
    name: `${baseId} named ${category} ${index + 1}`,
    category: category === 'pois' ? 'poi' : category.slice(0, -1),
    provider: 'Overture Maps',
    source: `Overture Maps ${PINNED_OVERTURE_RELEASE} Places`,
    sourceUrl: `https://overturemaps.org/${baseId}/${category}/${index + 1}`,
    genericFallback: false
  }));
}

function importantBase(id, name, lat, lon) {
  return {
    id,
    name,
    lat,
    lon,
    role: id === 'base-a' ? 'gateway-capital' : 'overnight-base',
    significance: { score: id === 'base-a' ? 100 : 80, population: 100_000 },
    recommendations: {
      pois: records(id, 'pois', 5),
      accommodations: records(id, 'accommodations', 3),
      restaurants: records(id, 'restaurants', 2),
      services: records(id, 'services', 1)
    },
    vehicleFit: {
      car: { suitability: 'supported', evidence: ['source-backed road and service evidence'] },
      motorcycle: { suitability: 'supported', evidence: ['source-backed road and fuel evidence'] }
    },
    overtureEnrichment: {
      schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
      release: PINNED_OVERTURE_RELEASE,
      overtureSchemaVersion: PINNED_OVERTURE_SCHEMA,
      retrievedAt: '2026-08-05T10:00:00.000Z',
      placePlanIdentity: PLAN_A,
      segmentPlanIdentity: PLAN_B,
      sourceCounts: { pois: 7, accommodations: 4, restaurants: 2, services: 1, segments: 3 },
      counts: { pois: 5, accommodations: 3, restaurants: 2, services: 1, segments: 3 }
    }
  };
}

function releasePack() {
  return {
    schemaVersion: 1,
    catalogVersion: 'fixture-1',
    dataVersion: `fixture-1+overture-${PINNED_OVERTURE_RELEASE}`,
    generatedAt: '2026-08-05',
    country: {
      code: 'TS', name: 'Testland',
      bounds: { south: -1, west: -1, north: 3, east: 3 }
    },
    anchors: [
      importantBase('base-a', 'Gateway', 0, 0),
      importantBase('base-b', 'Coast', 0, 1),
      importantBase('base-c', 'Mountains', 1, 1)
    ],
    corridors: [
      {
        id: 'corridor-a-b', fromAnchorId: 'base-a', toAnchorId: 'base-b',
        providerId: 'segment-a-b', roadClass: 'primary', surface: 'asphalt',
        evidence: ['Overture transportation segment match'],
        source: { provider: 'Overture Maps', id: 'segment-a-b', url: 'https://overturemaps.org/' }
      },
      {
        id: 'corridor-b-c', fromAnchorId: 'base-b', toAnchorId: 'base-c',
        providerId: 'segment-b-c', roadClass: 'secondary', surface: 'asphalt',
        evidence: ['Overture transportation segment match'],
        source: { provider: 'Overture Maps', id: 'segment-b-c', url: 'https://overturemaps.org/' }
      }
    ],
    sources: [
      {
        provider: 'Overture Maps Places', release: PINNED_OVERTURE_RELEASE,
        schemaVersion: PINNED_OVERTURE_SCHEMA, license: 'CDLA Permissive 2.0 and upstream record licences',
        attribution: 'Overture Maps Foundation; preserve per-record source attribution',
        url: `https://docs.overturemaps.org/guides/${PINNED_OVERTURE_RELEASE}/`
      },
      {
        provider: 'Overture Maps Transportation', release: PINNED_OVERTURE_RELEASE,
        schemaVersion: PINNED_OVERTURE_SCHEMA, license: 'ODbL 1.0',
        attribution: '© OpenStreetMap contributors, Overture Maps Foundation',
        url: `https://docs.overturemaps.org/guides/${PINNED_OVERTURE_RELEASE}/`
      }
    ],
    enrichments: {
      overtureMaps: {
        schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
        release: PINNED_OVERTURE_RELEASE,
        overtureSchemaVersion: PINNED_OVERTURE_SCHEMA,
        enrichedBaseCount: 3,
        retrievedAt: '2026-08-05T10:00:00.000Z',
        planIdentities: [PLAN_A, PLAN_B],
        license: 'CDLA Permissive 2.0 and upstream record licences',
        attribution: 'Overture Maps Foundation; preserve per-record source attribution'
      }
    }
  };
}

function endpointContextPack() {
  const pack = releasePack();
  pack.corridors = pack.corridors.map((corridor, index) => ({
    ...corridor,
    providerId: null,
    roadClass: null,
    surface: null,
    geometryType: 'fallback-straight-line',
    geometrySource: 'fallback-straight-line',
    estimateMethod: 'derived-geodesic-estimate; not a road route',
    routeCondition: 'unknown',
    routeEvidenceScope: 'endpoint-context',
    source: { provider: 'ReisSlim', basedOn: 'derived geodesic coordinates' },
    sources: [{
      provider: 'Overture Maps', id: `endpoint-${index + 1}`,
      evidenceScope: 'corridor-endpoint-context', url: 'https://explore.overturemaps.org/'
    }],
    evidence: ['Overture Transportation evidence sampled near a catalogue endpoint; full corridor route and condition are not verified.'],
    overtureEndpointEvidence: {
      release: PINNED_OVERTURE_RELEASE,
      sourceIds: [`endpoint-segment-${index + 1}`]
    }
  }));
  return pack;
}

function failureCodes(pack) {
  return validateCatalogReleasePack(pack).failures.map(item => item.code);
}

test('release gates accept complete pinned source-backed catalogue evidence', () => {
  const result = validateCatalogReleasePack(releasePack());
  assert.equal(result.valid, true, JSON.stringify(result.failures, null, 2));
  assert.deepEqual(result.summary, {
    countryCode: 'TS', requiredBases: 3, enrichedBases: 3,
    knownCarBases: 3, knownMotorcycleBases: 3,
    routeBackedCorridors: 2, endpointContextCorridors: 0, sourceBackedCorridors: 2
  });
});

test('release gates count honest endpoint context separately without promoting it to route-backed evidence', () => {
  const result = validateCatalogReleasePack(endpointContextPack());
  assert.equal(result.valid, true, JSON.stringify(result.failures, null, 2));
  assert.equal(result.summary.routeBackedCorridors, 0);
  assert.equal(result.summary.sourceBackedCorridors, 0);
  assert.equal(result.summary.endpointContextCorridors, 2);

  const dishonest = endpointContextPack();
  dishonest.corridors[0].geometryType = 'osm-way-sequence';
  dishonest.corridors[0].geometrySource = 'Overture Maps route geometry';
  dishonest.corridors[0].estimateMethod = null;
  dishonest.corridors[0].routeCondition = null;
  dishonest.corridors[0].evidence = ['Overture endpoint evidence'];
  const dishonestCodes = failureCodes(dishonest);
  assert.ok(dishonestCodes.includes('dishonest-endpoint-context-label'));
  assert.ok(dishonestCodes.includes('unapplied-source-corridor-evidence'));
});

test('every important base with source segment support is connected by route or endpoint context', () => {
  const disconnected = endpointContextPack();
  disconnected.corridors = disconnected.corridors.slice(0, 1);
  const result = validateCatalogReleasePack(disconnected);
  const failure = result.failures.find(item => item.code === 'unapplied-source-corridor-evidence' && item.anchorId === 'base-c');
  assert.ok(failure, JSON.stringify(result.failures, null, 2));
});

test('release gates require every scale-derived important base and supported named categories', () => {
  const missingBase = releasePack();
  delete missingBase.anchors[1].overtureEnrichment;
  assert.ok(failureCodes(missingBase).includes('missing-important-base-enrichment'));

  const missingNamedEvidence = releasePack();
  missingNamedEvidence.anchors[0].recommendations.restaurants = [];
  assert.ok(failureCodes(missingNamedEvidence).includes('insufficient-named-category-coverage'));

  const unsupportedCategory = releasePack();
  unsupportedCategory.anchors[0].overtureEnrichment.sourceCounts.restaurants = 0;
  unsupportedCategory.anchors[0].recommendations.restaurants = [];
  assert.equal(failureCodes(unsupportedCategory).includes('insufficient-named-category-coverage'), false,
    'a category with explicit zero source support must not be padded with invented records');
});

test('release gates reject universal unknown vehicle fit and synthetic-only corridors', () => {
  const unknown = releasePack();
  for (const anchor of unknown.anchors) {
    anchor.vehicleFit = {
      car: { suitability: 'unknown', evidence: [] },
      motorcycle: { suitability: 'unknown', evidence: [] }
    };
  }
  const unknownCodes = failureCodes(unknown);
  assert.ok(unknownCodes.includes('universal-unknown-car-suitability'));
  assert.ok(unknownCodes.includes('universal-unknown-motorcycle-suitability'));

  const synthetic = releasePack();
  synthetic.corridors = synthetic.corridors.map(corridor => ({
    ...corridor,
    providerId: null,
    roadClass: null,
    surface: null,
    evidence: [],
    source: { provider: 'ReisSlim', basedOn: 'derived geodesic coordinates' },
    geometrySource: 'fallback-straight-line'
  }));
  assert.ok(failureCodes(synthetic).includes('synthetic-only-corridor-evidence'));
});

test('release gates reject stale source, cache and pack versions', () => {
  const stale = releasePack();
  stale.enrichments.overtureMaps.release = '2026-05-20.0';
  stale.sources[0].release = '2026-05-20.0';
  stale.anchors[0].overtureEnrichment.retrievedAt = '2026-01-01T00:00:00.000Z';
  stale.anchors[1].overtureEnrichment.placePlanIdentity = 'not-an-exact-plan-identity';
  stale.dataVersion = 'fixture-1+overture-2026-05-20.0';
  const codes = failureCodes(stale);
  assert.ok(codes.includes('stale-overture-release'));
  assert.ok(codes.includes('missing-overture-source-notice'));
  assert.ok(codes.includes('stale-cache-retrieval'));
  assert.ok(codes.includes('invalid-cache-plan-identity'));
  assert.ok(codes.includes('stale-pack-data-version'));
});

test('release report summarizes evidence coverage without claiming live availability', () => {
  const result = validateCatalogReleasePack(releasePack());
  const report = catalogueDataQualityMarkdown([result]);
  assert.match(report, /3\/3 scale-derived important bases enriched/);
  assert.match(report, /\| TS \| 3 \| 3 \| 3 \| 3 \| 2 \| 0 \| Pass \|/);
  assert.match(report, /do not count as full route-backed evidence/);
  assert.match(report, /not live availability, price, opening status, road condition or safety/);
});
