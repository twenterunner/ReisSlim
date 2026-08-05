import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCatalogueEvidence, buildDestinationProfiles } from '../catalog-runtime.js';
import { normalizeTrip } from '../trip-model.js';

function anchor(id, name, lat, lon, {
  significance = 50,
  gateway = false,
  car = 'supported',
  motorcycle = 'supported'
} = {}) {
  const fit = suitability => ({
    suitability,
    evidence: [`OpenStreetMap access evidence for ${id}`]
  });
  return {
    id,
    countryCode: 'TS',
    name,
    lat,
    lon,
    adminRegion: 'Test Region',
    role: gateway ? 'gateway-capital' : 'overnight-base',
    gateway,
    themes: ['nature', 'scenic road'],
    significance: { score: significance, evidence: ['provider significance evidence'] },
    vehicleFit: { car: fit(car), motorcycle: fit(motorcycle) },
    recommendations: { pois: [], accommodations: [], restaurants: [], services: [] },
    sources: [{
      provider: 'OpenStreetMap',
      id: `node/${id}`,
      url: `https://www.openstreetmap.org/node/${id}`,
      license: 'ODbL'
    }],
    confidence: 0.8,
    lastChecked: '2026-08-05'
  };
}

function corridor(id, from, to, coordinates, {
  car,
  motorcycle,
  roadClass,
  scenicEvidence = [],
  curvatureSignal = 0,
  elevationSignal = 0
}) {
  return {
    id,
    fromAnchorId: from,
    toAnchorId: to,
    name: `${from} to ${to}`,
    distanceKm: 118,
    carMovingMinutes: 95,
    motorcycleMovingMinutes: 108,
    motorcycleElapsedMinutes: 138,
    roadClass: [roadClass],
    surface: ['asphalt'],
    scenicEvidence,
    curvatureSignal,
    elevationSignal,
    fuelServiceSpacingKm: 70,
    serviceEvidence: 2,
    ferry: false,
    toll: false,
    geometry: coordinates.map(([lat, lon]) => ({ lat, lon })),
    geometryType: 'osm-way-sequence',
    geometrySource: 'OpenStreetMap way geometry',
    vehicleCompatibility: {
      car: { suitability: car, evidence: [`OSM car access for ${id}`] },
      motorcycle: { suitability: motorcycle, evidence: [`OSM motorcycle access for ${id}`] }
    },
    sourceIds: [`way/${id}`],
    evidence: [`OpenStreetMap highway=${roadClass}`, 'OpenStreetMap surface=asphalt'],
    source: {
      provider: 'OpenStreetMap',
      id: `way/${id}`,
      url: `https://www.openstreetmap.org/way/${id}`,
      license: 'ODbL'
    },
    confidence: 0.86
  };
}

function enrichedPack() {
  return {
    schemaVersion: 1,
    catalogVersion: 'test-osm-evidence-1',
    dataVersion: 'test-osm-evidence-1',
    generatedAt: '2026-08-05',
    country: {
      code: 'TS',
      name: 'Testland',
      aliases: ['Testland'],
      bounds: { south: -1, west: -1, north: 3, east: 3 }
    },
    sources: [{ provider: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL' }],
    anchors: [
      anchor('1000', 'Gateway', 0, 0, { significance: 100, gateway: true }),
      anchor('1001', 'Practical North', 0, 1, { car: 'supported', motorcycle: 'limited' }),
      anchor('1002', 'Practical Coast', 0, 2, { car: 'supported', motorcycle: 'limited' }),
      anchor('1003', 'Scenic Pass', 1, 0, { car: 'limited', motorcycle: 'supported' }),
      anchor('1004', 'Mountain Road', 2, 0, { car: 'limited', motorcycle: 'supported' })
    ],
    corridors: [
      corridor('2001', '1000', '1001', [[0, 0], [0, .5], [0, 1]], {
        car: 'supported', motorcycle: 'limited', roadClass: 'primary'
      }),
      corridor('2002', '1001', '1002', [[0, 1], [0, 1.5], [0, 2]], {
        car: 'supported', motorcycle: 'limited', roadClass: 'primary'
      }),
      corridor('2003', '1000', '1003', [[0, 0], [.5, .1], [1, 0]], {
        car: 'limited', motorcycle: 'supported', roadClass: 'secondary',
        scenicEvidence: ['viewpoint relation', 'protected landscape', 'mountain road', 'touring route'],
        curvatureSignal: 8,
        elevationSignal: 7
      }),
      corridor('2004', '1003', '1004', [[1, 0], [1.5, .15], [2, 0]], {
        car: 'limited', motorcycle: 'supported', roadClass: 'secondary',
        scenicEvidence: ['viewpoint relation', 'protected landscape', 'mountain road', 'touring route'],
        curvatureSignal: 9,
        elevationSignal: 8
      })
    ]
  };
}

function trip(vehicle) {
  return normalizeTrip({
    id: `corridor-${vehicle}`,
    tripName: `Corridor evidence ${vehicle}`,
    origin: 'Gateway',
    originPoint: { name: 'Gateway', lat: 0, lon: 0 },
    destinationQuery: 'Testland',
    startDate: '2027-06-01',
    days: 10,
    budget: 6000,
    adults: 2,
    children: 0,
    transport: vehicle,
    travelMode: vehicle === 'motorcycle' ? 'fly-ride' : 'fly-drive',
    routeTopology: 'loop',
    tripPace: 'balanced',
    routeStyle: vehicle === 'motorcycle' ? 'touring' : 'balanced',
    fuelRangeKm: vehicle === 'motorcycle' ? 260 : 650,
    maxDrive: 6,
    maxChanges: 5,
    comfort: 'mid',
    liveData: false,
    preferences: ['natuur'],
    preferenceWeights: { natuur: 2 }
  });
}

test('catalogue evidence audit rejects universal unknown vehicle fit and synthetic-only corridors', () => {
  const unknown = {
    ...enrichedPack(),
    anchors: enrichedPack().anchors.map(item => ({
      ...item,
      vehicleFit: {
        car: { suitability: 'unknown', evidence: [] },
        motorcycle: { suitability: 'unknown', evidence: [] }
      }
    })),
    corridors: enrichedPack().corridors.map(item => ({
      ...item,
      sourceIds: [],
      evidence: [],
      roadClass: null,
      surface: null,
      scenicEvidence: [],
      curvatureSignal: null,
      elevationSignal: null,
      source: { provider: 'ReisSlim', basedOn: 'derived coordinates' },
      geometryType: 'fallback-straight-line',
      geometrySource: 'fallback-straight-line'
    }))
  };

  const audit = auditCatalogueEvidence(unknown);
  assert.equal(audit.valid, false);
  assert.ok(audit.failures.includes('universal-unknown-vehicle-suitability'));
  assert.ok(audit.failures.includes('synthetic-only-corridor-evidence'));
  assert.equal(audit.sourceBackedCorridors, 0);
});

test('source-backed vehicle evidence creates structurally different car and motorcycle base sequences', () => {
  const pack = enrichedPack();
  const audit = auditCatalogueEvidence(pack);
  assert.equal(audit.valid, true);
  assert.equal(audit.knownCarAnchors, pack.anchors.length);
  assert.equal(audit.knownMotorcycleAnchors, pack.anchors.length);
  assert.equal(audit.sourceBackedCorridors, pack.corridors.length);

  const carProfile = buildDestinationProfiles(pack, trip('car'), { limit: 1 })[0];
  const motorcycleProfile = buildDestinationProfiles(pack, trip('motorcycle'), { limit: 1 })[0];
  const carBases = carProfile.bases.map(base => base.id);
  const motorcycleBases = motorcycleProfile.bases.map(base => base.id);

  assert.deepEqual(carBases, ['1000', '1001', '1002']);
  assert.deepEqual(motorcycleBases, ['1000', '1003', '1004']);
  assert.notDeepEqual(carBases, motorcycleBases,
    'vehicle-specific source evidence must alter the selected touring sequence, not just labels or timing');
});
