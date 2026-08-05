import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { CATALOG_VERSION, COUNTRY_SPECS } from './catalog-countries.mjs';
import { selectTouringAnchors, significanceScore } from './catalog-ranking.mjs';
import { buildCatalogLocator, catalogLocatorModule } from './catalog-locator-generator.mjs';
import { GEONAMES_SNAPSHOT, geonamesInput } from './geonames-input-manifest.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE_DIR = process.env.REISSLIM_CATALOG_CACHE || join(tmpdir(), 'reisslim-geonames-cache');
const BASE_URL = GEONAMES_SNAPSHOT.baseUrl;
const GENERATED_DATE = GEONAMES_SNAPSHOT.snapshotDate;
if (process.env.SOURCE_DATE_EPOCH
    && Number(process.env.SOURCE_DATE_EPOCH) !== GEONAMES_SNAPSHOT.sourceDateEpoch) {
  throw new Error(`SOURCE_DATE_EPOCH must be ${GEONAMES_SNAPSHOT.sourceDateEpoch} for pinned snapshot ${GEONAMES_SNAPSHOT.id}`);
}
const REFRESH = process.argv.includes('--refresh');
const VALIDATE_ONLY = process.argv.includes('--validate-only');
const COVERAGE_ONLY = process.argv.includes('--coverage-only');
const ALLOW_DROP_OSM = process.argv.includes('--allow-drop-osm');
const SOURCE = Object.freeze({
  provider: 'GeoNames',
  url: 'https://download.geonames.org/export/dump/',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  termsUrl: 'https://www.geonames.org/export/',
  retrievedAt: GENERATED_DATE,
  snapshotId: GEONAMES_SNAPSHOT.id,
  warranty: 'Data supplied as-is; accuracy, timeliness and completeness are not guaranteed.'
});
const SHAPES_URL = `${BASE_URL}/shapes_simplified_low.json.zip`;
const COUNTRY_INFO_URL = `${BASE_URL}/countryInfo.txt`;

const accommodationCodes = new Set(['HTL', 'GHSE', 'RHSE', 'CMP', 'HUT', 'RSRT']);
const restaurantCodes = new Set(['REST', 'CAFE']);
const serviceCodes = new Set(['HLT', 'PKLT', 'FY', 'FYT', 'TOLL']);
const poiCodes = new Set([
  'MUS', 'CSTL', 'PAL', 'MNMT', 'MONU', 'CH', 'CTHSE', 'ARCH', 'CAVE', 'PK', 'MT', 'PASS',
  'CAPE', 'BAY', 'LK', 'FLLS', 'GLCR', 'CNYN', 'VLC', 'ISL', 'PRK', 'RESN', 'RES', 'SPA', 'BCH',
  'ANS', 'RUIN', 'HSTS', 'OBPT', 'LTHSE', 'GDN', 'ZOO', 'FT', 'AMTH', 'PAN', 'HLL', 'DUNE', 'RK', 'VAL', 'AREA', 'HBR'
]);
const anchorFeatureCodes = new Set([
  'PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLG', 'PRK', 'RESN', 'PK', 'MT', 'PASS', 'CAPE', 'BAY',
  'LK', 'FLLS', 'GLCR', 'CNYN', 'VLC', 'ISL', 'CSTL', 'PAL', 'MUS', 'MNMT', 'MONU', 'ARCH', 'CAVE', 'SPA', 'BCH',
  'ANS', 'RUIN', 'HSTS', 'OBPT', 'LTHSE', 'GDN', 'ZOO', 'FT', 'AMTH', 'PPLQ', 'AIRP', 'PAN', 'HLL', 'DUNE', 'RK', 'VAL', 'AREA', 'HBR'
]);
function normaliseText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function parseRecord(line) {
  const columns = line.split('\t');
  if (columns.length < 19) return null;
  const lat = Number(columns[4]);
  const lon = Number(columns[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: columns[0], name: columns[1], asciiName: columns[2], alternateNames: columns[3], lat, lon,
    featureClass: columns[6], featureCode: columns[7], countryCode: columns[8], admin1: columns[10],
    admin2: columns[11], population: Number(columns[14]) || 0, elevation: Number(columns[15]) || null,
    dem: Number(columns[16]) > -9999 ? Number(columns[16]) : null,
    timezone: columns[17] || null, modificationDate: columns[18] || null
  };
}

function findZipEntry(buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('Invalid ZIP: end-of-central-directory not found');
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');
    if (!name.endsWith('/') && !name.toLowerCase().includes('readme')) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local header');
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(start, start + compressedSize);
      if (method === 0) return compressed.toString('utf8');
      if (method === 8) return inflateRawSync(compressed).toString('utf8');
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  throw new Error('ZIP contains no file entry');
}

function verifyPinnedInput(fileName, data) {
  const pinned = geonamesInput(fileName);
  const hash = createHash('sha256').update(data).digest('hex');
  if (data.length !== pinned.bytes || hash !== pinned.sha256) {
    throw new Error(`${fileName} does not match pinned GeoNames snapshot ${GEONAMES_SNAPSHOT.id}: expected ${pinned.bytes} bytes/${pinned.sha256}, received ${data.length} bytes/${hash}. Restore the exact snapshot; do not publish a mutable rebuild under the same catalogue version.`);
  }
  return data;
}

async function downloadPinned(fileName, url) {
  await mkdir(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, fileName);
  if (!REFRESH && existsSync(path)) return verifyPinnedInput(fileName, await readFile(path));
  const response = await fetch(url, { headers: { 'User-Agent': 'ReisSlim-catalog-generator/1.3 (+https://github.com/twenterunner/ReisSlim)' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const data = verifyPinnedInput(fileName, Buffer.from(await response.arrayBuffer()));
  await writeFile(path, data);
  return data;
}

async function downloadCountry(code) {
  const fileName = `${code}.zip`;
  return downloadPinned(fileName, `${BASE_URL}/${fileName}`);
}

async function downloadAuxiliary(fileName, url) {
  return downloadPinned(fileName, url);
}

function geometryBounds(geometry) {
  const bounds = { south: 90, west: 180, north: -90, east: -180 };
  const visit = value => {
    if (Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      bounds.west = Math.min(bounds.west, value[0]); bounds.east = Math.max(bounds.east, value[0]);
      bounds.south = Math.min(bounds.south, value[1]); bounds.north = Math.max(bounds.north, value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  return bounds;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let current = 0, prior = ring.length - 1; current < ring.length; prior = current++) {
    const [xi, yi] = ring[current];
    const [xj, yj] = ring[prior];
    const crosses = ((yi > point.lat) !== (yj > point.lat))
      && (point.lon < (xj - xi) * (point.lat - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  return pointInRing(point, polygon[0]) && !polygon.slice(1).some(hole => pointInRing(point, hole));
}

function pointInGeometry(point, geometry) {
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(polygon => pointInPolygon(point, polygon));
  return false;
}

function pointToSegmentDistanceKm(point, start, end) {
  const latitudeScale = 111.32;
  const longitudeScale = Math.max(1, Math.cos(point.lat * Math.PI / 180) * 111.32);
  const px = point.lon * longitudeScale;
  const py = point.lat * latitudeScale;
  const ax = start[0] * longitudeScale;
  const ay = start[1] * latitudeScale;
  const bx = end[0] * longitudeScale;
  const by = end[1] * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const factor = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + factor * dx), py - (ay + factor * dy));
}

function distanceToGeometryBoundaryKm(point, geometry, stopBelowKm = 0) {
  let nearest = Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 0; index < ring.length; index += 1) {
        nearest = Math.min(nearest, pointToSegmentDistanceKm(point, ring[index], ring[(index + 1) % ring.length]));
        if (nearest <= stopBelowKm) return nearest;
      }
    }
  }
  return nearest;
}

function pointInGeometryWithTolerance(point, geometry, toleranceKm = 8) {
  return pointInGeometry(point, geometry) || distanceToGeometryBoundaryKm(point, geometry, toleranceKm) <= toleranceKm;
}

function pointInBounds(point, bounds) {
  return point.lat >= bounds.south && point.lat <= bounds.north && point.lon >= bounds.west && point.lon <= bounds.east;
}

function intersectBounds(first, second) {
  return {
    south: Math.max(first.south, second.south), west: Math.max(first.west, second.west),
    north: Math.min(first.north, second.north), east: Math.min(first.east, second.east)
  };
}

function touringGeometryNearCapital(geometry, capital, maximumDetachedDistanceKm = 1300) {
  if (!capital || geometry.type !== 'MultiPolygon') return geometry;
  const retained = geometry.coordinates.filter(polygon => {
    if (pointInPolygon(capital, polygon)) return true;
    let nearest = Infinity;
    for (const ring of polygon) {
      for (const [lon, lat] of ring) nearest = Math.min(nearest, distanceKm(capital, { lat, lon }));
    }
    return nearest <= maximumDetachedDistanceKm;
  });
  return retained.length ? { type: 'MultiPolygon', coordinates: retained } : geometry;
}

const EUROPE_TOURING_ENVELOPE = Object.freeze({ south: 34, west: -25, north: 72.5, east: 60 });

async function loadBoundaryContext() {
  const [shapeZip, countryInfoBuffer] = await Promise.all([
    downloadAuxiliary('shapes_simplified_low.json.zip', SHAPES_URL),
    downloadAuxiliary('countryInfo.txt', COUNTRY_INFO_URL)
  ]);
  const shapes = JSON.parse(findZipEntry(shapeZip));
  const geonameIds = new Map(countryInfoBuffer.toString('utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const columns = line.split('\t');
    return [columns[0], columns[16]];
  }));
  const shapesById = new Map(shapes.features.map(feature => [String(feature.properties.geoNameId), feature.geometry]));
  return new Map(COUNTRY_SPECS.map(spec => {
    const geometry = shapesById.get(String(geonameIds.get(spec.code)));
    if (!geometry) throw new Error(`No GeoNames boundary shape for ${spec.code}`);
    return [spec.code, { geometry, bounds: geometryBounds(geometry) }];
  }));
}

function distanceKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function recordUrl(record) {
  return `https://www.geonames.org/${record.id}/`;
}

function roleFor(record) {
  if (record.featureCode === 'PPLQ') return 'cultural-highlight';
  if (record.featureClass === 'P') return record.featureCode === 'PPLC' ? 'gateway-capital' : 'overnight-base';
  if (['PRK', 'RESN'].includes(record.featureCode)) return 'protected-area';
  if (['PASS'].includes(record.featureCode)) return 'scenic-road-anchor';
  if (record.featureCode === 'AIRP') return 'access-gateway';
  if (['PK', 'MT', 'FLLS', 'GLCR', 'CNYN', 'VLC', 'CAVE', 'PAN', 'HLL', 'DUNE', 'RK', 'VAL'].includes(record.featureCode)) return 'natural-highlight';
  if (['CSTL', 'PAL', 'MUS', 'MNMT', 'MONU', 'ARCH', 'ANS', 'RUIN', 'HSTS', 'FT', 'AMTH'].includes(record.featureCode)) return 'cultural-highlight';
  if (['CAPE', 'BAY', 'LK', 'ISL', 'BCH'].includes(record.featureCode)) return 'landscape-anchor';
  return 'touring-anchor';
}

function themesFor(record) {
  if (record.featureClass === 'P') return ['culture', 'food', 'services'];
  if (['CSTL', 'PAL', 'MUS', 'MNMT', 'MONU', 'ARCH'].includes(record.featureCode)) return ['culture', 'history'];
  if (['CAPE', 'BAY', 'ISL', 'BCH'].includes(record.featureCode)) return ['coast', 'nature'];
  if (['PK', 'MT', 'PASS', 'FLLS', 'GLCR', 'CNYN', 'VLC', 'CAVE', 'PRK', 'RESN'].includes(record.featureCode)) return ['nature', 'scenery'];
  return ['touring'];
}

function addNearbyRecommendationEvidence(records) {
  const cellSize = 0.5;
  const gridKey = record => `${Math.floor(record.lat / cellSize)}:${Math.floor(record.lon / cellSize)}`;
  const grid = new Map();
  for (const record of records) {
    const category = recommendationCategory(record);
    if (!category || category === 'pois') continue;
    const key = gridKey(record);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(record);
  }
  for (const record of records) {
    if (!isAnchorCandidate(record, true)) continue;
    const row = Math.floor(record.lat / cellSize);
    const column = Math.floor(record.lon / cellSize);
    let count = 0;
    for (let latOffset = -2; latOffset <= 2; latOffset += 1) {
      for (let lonOffset = -2; lonOffset <= 2; lonOffset += 1) {
        for (const nearby of grid.get(`${row + latOffset}:${column + lonOffset}`) || []) {
          if (distanceKm(record, nearby) <= 60) count += 1;
        }
      }
    }
    record.nearbyRecommendationCount = count;
  }
}

function isAnchorCandidate(record, allowSmallPlaces = false) {
  if (anchorFeatureCodes.has(record.featureCode)) return true;
  if (record.featureClass !== 'P') return false;
  return record.population >= (allowSmallPlaces ? 1 : 1000);
}

function selectAnchors(records, target) {
  const allowSmallPlaces = target <= 70;
  return selectTouringAnchors(records.filter(record => isAnchorCandidate(record, allowSmallPlaces)), target);
}

function recommendationCategory(record) {
  if (record.featureClass !== 'S' && !poiCodes.has(record.featureCode)) return null;
  if (accommodationCodes.has(record.featureCode)) return 'accommodations';
  if (restaurantCodes.has(record.featureCode)) return 'restaurants';
  if (serviceCodes.has(record.featureCode)) return 'services';
  if (poiCodes.has(record.featureCode)) return 'pois';
  return null;
}

function makeRecommendation(record, base, category, distance) {
  const labels = {
    accommodations: 'Named accommodation candidate — availability and price not verified.',
    restaurants: 'Named food candidate — opening hours, availability and price not verified.',
    pois: 'Named place candidate — access and opening status not verified.',
    services: 'Named service candidate — current service status not verified.'
  };
  return {
    id: `gn-${base.id}-${record.id}`,
    providerId: record.id,
    name: record.name,
    type: record.featureCode,
    category: category === 'accommodations' ? 'accommodation' : category.replace(/s$/, ''),
    baseId: `gn-${base.id}`,
    lat: record.lat,
    lon: record.lon,
    distanceFromBaseKm: Math.round(distance * 10) / 10,
    estimatedDetourKm: null,
    provider: 'GeoNames',
    source: 'GeoNames country extract',
    sourceUrl: recordUrl(record),
    confidence: record.population > 0 ? 0.72 : 0.62,
    lastChecked: record.modificationDate,
    vehicleFit: { car: 'unknown', motorcycle: 'unknown' },
    openingHours: null,
    parkingEvidence: null,
    evidence: { featureClass: record.featureClass, featureCode: record.featureCode },
    status: labels[category]
  };
}

function recommendationsFor(base, recommendationRecords) {
  const limits = { pois: 5, accommodations: 3, restaurants: 2, services: 1 };
  const maximumDistance = { pois: 75, accommodations: 40, restaurants: 30, services: 45 };
  const grouped = { pois: [], accommodations: [], restaurants: [], services: [] };
  const nearby = recommendationRecords.map(record => ({ record, distance: distanceKm(base, record) }))
    .sort((a, b) => a.distance - b.distance);
  for (const { record, distance } of nearby) {
    const category = recommendationCategory(record);
    if (!category || grouped[category].length >= limits[category] || distance > maximumDistance[category]) continue;
    if (record.id === base.id || grouped[category].some(item => item.providerId === record.id)) continue;
    grouped[category].push(makeRecommendation(record, base, category, distance));
  }
  return grouped;
}

function assignRecommendations(bases, recommendationRecords) {
  const limits = { pois: 5, accommodations: 3, restaurants: 2, services: 1 };
  const maximumDistance = { pois: 75, accommodations: 40, restaurants: 30, services: 45 };
  const assignments = new Map(bases.map(base => [base.id, { pois: [], accommodations: [], restaurants: [], services: [] }]));
  for (const record of recommendationRecords) {
    const category = recommendationCategory(record);
    if (!category) continue;
    const nearest = bases.map(base => ({ base, distance: distanceKm(base, record) })).sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > maximumDistance[category] || nearest.base.id === record.id) continue;
    assignments.get(nearest.base.id)[category].push({ record, distance: nearest.distance });
  }
  for (const [baseId, grouped] of assignments) {
    const base = bases.find(candidate => candidate.id === baseId);
    for (const category of Object.keys(grouped)) {
      grouped[category] = grouped[category].sort((a, b) => a.distance - b.distance)
        .slice(0, limits[category]).map(({ record, distance }) => makeRecommendation(record, base, category, distance));
    }
  }
  return assignments;
}

function makeAnchor(record, countryCode, recommendations) {
  const role = roleFor(record);
  const score = significanceScore(record);
  const aliases = [...new Set([record.asciiName, ...record.alternateNames.split(',').slice(0, 8)]
    .map(normaliseText).filter(name => name && name !== normaliseText(record.name)))];
  return {
    id: `gn-${record.id}`,
    countryCode,
    name: record.name,
    aliases,
    localName: record.name,
    lat: record.lat,
    lon: record.lon,
    adminRegion: record.admin1 || null,
    role,
    themes: themesFor(record),
    minNights: 1,
    maxNights: role === 'gateway-capital' || role === 'overnight-base' ? (score >= 100 ? 4 : 3) : 2,
    stayEvidence: 'ReisSlim planning prior derived from GeoNames feature role and significance; not a provider recommendation.',
    seasons: null,
    gateway: role === 'gateway-capital' ? { type: 'national-capital', evidence: record.featureCode } : null,
    roadAccess: null,
    roadSurface: null,
    remoteness: null,
    services: null,
    vehicleFit: {
      car: { suitability: 'unknown', evidence: [] },
      motorcycle: { suitability: 'unknown', evidence: [] }
    },
    significance: {
      population: record.population || null,
      featureClass: record.featureClass,
      featureCode: record.featureCode,
      score,
      evidence: ['GeoNames feature classification', ...(record.population ? ['GeoNames population'] : []),
        ...(record.alternateNames ? ['GeoNames alternate-name evidence'] : []),
        ...(record.nearbyRecommendationCount ? ['Nearby named GeoNames travel-service evidence'] : [])]
    },
    recommendations,
    sources: [{ provider: 'GeoNames', id: record.id, url: recordUrl(record), license: 'CC BY 4.0' }],
    confidence: record.population > 0 || anchorFeatureCodes.has(record.featureCode) ? 0.72 : 0.55,
    lastChecked: record.modificationDate
  };
}

function buildCorridors(anchors) {
  const pairs = new Map();
  for (const from of anchors) {
    const nearest = anchors.filter(anchor => anchor.id !== from.id)
      .map(to => ({ to, distance: distanceKm(from, to) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, anchors.length < 20 ? 2 : 3);
    for (const { to, distance } of nearest) {
      const ordered = [from, to].sort((a, b) => a.id.localeCompare(b.id));
      const key = `${ordered[0].id}--${ordered[1].id}`;
      if (pairs.has(key)) continue;
      const carMovingMinutes = Math.max(8, Math.round(distance / 70 * 60));
      const motorcycleMovingMinutes = Math.round(carMovingMinutes * 1.05);
      const motorcycleRestMinutes = Math.floor(motorcycleMovingMinutes / 90) * 20;
      pairs.set(key, {
        id: `geo-${key}`,
        fromAnchorId: ordered[0].id,
        toAnchorId: ordered[1].id,
        intermediateAnchorIds: [],
        name: `${ordered[0].name} – ${ordered[1].name}`,
        distanceKm: Math.round(distance),
        carMovingMinutes,
        motorcycleElapsedMinutes: motorcycleMovingMinutes + motorcycleRestMinutes,
        roadClass: null,
        surface: null,
        elevationSignal: null,
        curvatureSignal: null,
        scenicEvidence: [],
        ferry: null,
        toll: null,
        fuelServiceSpacingKm: null,
        seasonalLimitations: null,
        geometry: [[ordered[0].lat, ordered[0].lon], [ordered[1].lat, ordered[1].lon]],
        geometryType: 'fallback-straight-line',
        estimateMethod: 'derived-geodesic-estimate; not a road route',
        source: { provider: 'ReisSlim', basedOn: 'GeoNames coordinates', license: 'CC BY 4.0 attribution applies to coordinates' },
        confidence: 0.25
      });
    }
  }
  return [...pairs.values()];
}

function calculateBounds(records) {
  return records.reduce((bounds, record) => ({
    south: Math.min(bounds.south, record.lat), west: Math.min(bounds.west, record.lon),
    north: Math.max(bounds.north, record.lat), east: Math.max(bounds.east, record.lon)
  }), { south: 90, west: 180, north: -90, east: -180 });
}

function packStats(anchors, corridors) {
  const recommendations = anchors.flatMap(anchor => Object.values(anchor.recommendations).flat());
  return {
    anchors: anchors.length,
    corridors: corridors.length,
    pois: recommendations.filter(item => item.category === 'poi').length,
    accommodations: recommendations.filter(item => item.category === 'accommodation').length,
    restaurants: recommendations.filter(item => item.category === 'restaurant').length,
    services: recommendations.filter(item => item.category === 'service').length,
    namedRecommendations: recommendations.length
  };
}

function validatePack(pack) {
  const failures = [];
  if (!pack.country?.code || !Array.isArray(pack.anchors) || !Array.isArray(pack.corridors)) failures.push('invalid pack root');
  const expectedArchive = geonamesInput(`${pack.country?.code}.zip`);
  if (pack.generatedAt !== GEONAMES_SNAPSHOT.snapshotDate
      || pack.sourceSnapshot?.id !== GEONAMES_SNAPSHOT.id
      || pack.sourceSnapshot?.countryExtract?.sha256 !== expectedArchive.sha256
      || pack.sourceSnapshot?.countryExtract?.bytes !== expectedArchive.bytes) {
    failures.push('missing or stale pinned GeoNames source identity');
  }
  const ids = new Set();
  for (const anchor of pack.anchors || []) {
    if (!anchor.id || ids.has(anchor.id)) failures.push(`duplicate/missing anchor id ${anchor.id}`);
    ids.add(anchor.id);
    if (anchor.countryCode !== pack.country.code) failures.push(`${anchor.id}: wrong country code`);
    if (!anchor.name || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lon)) failures.push(`${anchor.id}: invalid place data`);
    if (!anchor.sources?.some(source => source.provider === 'GeoNames' && source.id && source.url)) failures.push(`${anchor.id}: missing provenance`);
    for (const recommendation of Object.values(anchor.recommendations || {}).flat()) {
      if (!recommendation.name || !recommendation.providerId || !recommendation.sourceUrl) failures.push(`${anchor.id}: invalid recommendation`);
      const geoNamesRecord = recommendation.provider === 'GeoNames' || recommendation.source === 'GeoNames country extract';
      if (geoNamesRecord && recommendation.category === 'restaurant' && recommendation.type !== 'REST' && recommendation.type !== 'CAFE') failures.push(`${anchor.id}: non-food GeoNames feature classified as restaurant`);
      if (geoNamesRecord && recommendation.category === 'service' && ['RSTN', 'RSTP'].includes(recommendation.type)) failures.push(`${anchor.id}: rail GeoNames feature classified as road service`);
    }
  }
  for (const corridor of pack.corridors || []) {
    if (!ids.has(corridor.fromAnchorId) || !ids.has(corridor.toAnchorId)) failures.push(`${corridor.id}: invalid endpoint`);
    if (corridor.geometryType !== 'fallback-straight-line' || !corridor.estimateMethod?.includes('not a road route')) failures.push(`${corridor.id}: dishonest fallback geometry`);
  }
  if (failures.length) throw new Error(`${pack.country.code} catalogue validation failed:\n${failures.slice(0, 20).join('\n')}`);
}

async function buildPack(spec, boundary) {
  const zip = await downloadCountry(spec.code);
  const countryInput = geonamesInput(`${spec.code}.zip`);
  const text = findZipEntry(zip);
  const countryRecords = text.split(/\r?\n/).filter(Boolean).map(parseRecord)
    .filter(record => record?.countryCode === spec.code && pointInBounds(record, boundary.bounds));
  const capital = countryRecords.filter(record => record.featureCode === 'PPLC').sort((a, b) => b.population - a.population)[0] || null;
  const touringGeometry = touringGeometryNearCapital(boundary.geometry, capital);
  const touringBounds = geometryBounds(touringGeometry);
  const catalogBounds = spec.scope === 'transcontinental-country'
    ? intersectBounds(touringBounds, EUROPE_TOURING_ENVELOPE)
    : touringBounds;
  const records = countryRecords.filter(record => pointInBounds(record, touringBounds)
    && (spec.scope !== 'transcontinental-country' || pointInBounds(record, EUROPE_TOURING_ENVELOPE))
    && (isAnchorCandidate(record, spec.targetAnchors <= 70) || recommendationCategory(record))
    && pointInGeometryWithTolerance(record, touringGeometry));
  if (!records.length) throw new Error(`No GeoNames records for ${spec.code}`);
  addNearbyRecommendationEvidence(records);
  const candidateRecords = records.filter(record => isAnchorCandidate(record, spec.targetAnchors <= 70));
  const selected = selectAnchors(candidateRecords, spec.targetAnchors);
  const recommendationRecords = records.filter(record => recommendationCategory(record));
  const assignments = assignRecommendations(selected, recommendationRecords);
  const anchors = selected.map(record => makeAnchor(record, spec.code, assignments.get(record.id)));
  const corridors = buildCorridors(anchors);
  const pack = {
    schemaVersion: 1,
    catalogVersion: CATALOG_VERSION,
    dataVersion: CATALOG_VERSION,
    generatedAt: GENERATED_DATE,
    sourceSnapshot: {
      id: GEONAMES_SNAPSHOT.id,
      snapshotDate: GEONAMES_SNAPSHOT.snapshotDate,
      sourceDateEpoch: GEONAMES_SNAPSHOT.sourceDateEpoch,
      countryExtract: { file: `${spec.code}.zip`, ...countryInput },
      boundaryExtract: { file: 'shapes_simplified_low.json.zip', ...geonamesInput('shapes_simplified_low.json.zip') },
      countryMetadata: { file: 'countryInfo.txt', ...geonamesInput('countryInfo.txt') }
    },
    country: {
      code: spec.code, name: spec.name, aliases: spec.aliases, bounds: catalogBounds, scope: spec.scope,
      boundaryEvidence: 'GeoNames shapes_simplified_low with an 8 km coastline/source-coordinate tolerance', boundaryToleranceKm: 8
    },
    anchors,
    corridors,
    stats: packStats(anchors, corridors),
    sources: [{
      ...SOURCE,
      countryExtract: `${BASE_URL}/${spec.code}.zip`,
      inputFile: `${spec.code}.zip`,
      inputBytes: countryInput.bytes,
      inputSha256: countryInput.sha256
    }]
  };
  validatePack(pack);
  return pack;
}

function packModule(pack) {
  return `// Generated by scripts/generate-catalog.mjs from GeoNames CC BY 4.0. Do not edit manually.\nexport const COUNTRY_PACK = Object.freeze(${JSON.stringify(pack)});\nexport default COUNTRY_PACK;\n`;
}

export function indexModule(manifest) {
  const loaders = Object.keys(manifest).map(code => `  ${JSON.stringify(code)}: () => import('./catalog-${code.toLowerCase()}.js')`).join(',\n');
  return `// Generated by scripts/generate-catalog.mjs. Country modules are loaded only on demand.
import { CATALOG_LOCATOR } from './catalog-locator.js?v=1300';
import { createCatalogLocatorRuntime } from './catalog-locator-runtime.js?v=1300';
export const CATALOG_VERSION = ${JSON.stringify(CATALOG_VERSION)};
export const CATALOGUE_MANIFEST = Object.freeze(${JSON.stringify(manifest)});
export const COUNTRY_CATALOG_MANIFEST = CATALOGUE_MANIFEST;
export const SUPPORTED_COUNTRY_CODES = Object.freeze(Object.keys(CATALOGUE_MANIFEST));

const loaders = Object.freeze({
${loaders}
});
const packCache = new Map();
const loadedCodes = new Set();
const resolvedPacks = new Map();

const normalize = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function resolveCatalogCountry(input) {
  if (!input) return null;
  const explicitCode = typeof input === 'object' ? (input.countryCode || input.code) : null;
  const query = normalize(explicitCode || input);
  if (!query) return null;
  const exact = SUPPORTED_COUNTRY_CODES.find(code => code.toLowerCase() === query)
    || SUPPORTED_COUNTRY_CODES.find(code => [CATALOGUE_MANIFEST[code].name, ...CATALOGUE_MANIFEST[code].aliases].some(value => normalize(value) === query));
  if (exact) return CATALOGUE_MANIFEST[exact];
  const suffix = SUPPORTED_COUNTRY_CODES
    .map(code => CATALOGUE_MANIFEST[code])
    .filter(entry => [entry.name, ...entry.aliases].some(value => { const alias = normalize(value); return alias.length > 3 && (query.endsWith(\` \${alias}\`) || query.startsWith(\`\${alias} \`)); }))
    .sort((a, b) => b.name.length - a.name.length)[0];
  return suffix || null;
}

const locatorRuntime = createCatalogLocatorRuntime(CATALOG_LOCATOR, CATALOGUE_MANIFEST, resolveCatalogCountry);
export const resolveCatalogLocation = locatorRuntime.resolveLocation;
export const resolveCatalogLocationFromPoint = locatorRuntime.resolveLocationFromPoint;
export const resolveCatalogCountryFromPoint = locatorRuntime.resolveCountryFromPoint;

export function loadCountryModuleRetryably(code, loader, cache = packCache, loaded = loadedCodes) {
  if (!cache.has(code)) {
    const request = Promise.resolve().then(loader)
      .then(module => {
        const pack = module?.COUNTRY_PACK || module?.default;
        if (!pack) throw new Error(\`Touringpakket \${code} bevat geen COUNTRY_PACK export.\`);
        loaded.add(code);
        resolvedPacks.set(code, pack);
        return pack;
      })
      .catch(error => {
        if (cache.get(code) === request) cache.delete(code);
        loaded.delete(code);
        resolvedPacks.delete(code);
        throw error;
      });
    cache.set(code, request);
  }
  return cache.get(code);
}

export async function loadCountryPack(input) {
  const entry = resolveCatalogCountry(input);
  if (!entry) return null;
  return loadCountryModuleRetryably(entry.code, loaders[entry.code]);
}

export function getLoadedCountryCodes() { return [...loadedCodes]; }
export function getLoadedCountryPack(input) { const entry = resolveCatalogCountry(input); return entry ? resolvedPacks.get(entry.code) || null : null; }
export function resetCatalogueCache() { packCache.clear(); loadedCodes.clear(); resolvedPacks.clear(); }
export function catalogueRequestFor(input) { const entry = resolveCatalogCountry(input); return entry ? { countryCode: entry.code, catalogVersion: CATALOG_VERSION } : null; }
export function getCatalogLocatorStats() { return { ...locatorRuntime.stats, loadedCountryPacks: loadedCodes.size }; }
`;
}

export function coverageMarkdown(packs) {
  const totals = packs.reduce((sum, pack) => {
    for (const [key, value] of Object.entries(pack.stats)) sum[key] = (sum[key] || 0) + value;
    return sum;
  }, {});
  const rows = packs.map(pack => `| ${pack.country.code} | ${pack.country.name} | ${pack.country.scope} | ${pack.stats.anchors} | ${pack.stats.corridors} | ${pack.stats.pois} | ${pack.stats.accommodations} | ${pack.stats.restaurants} | ${pack.stats.services} |`).join('\n');
  return `# ReisSlim catalogue coverage\n\nGenerated deterministically from GeoNames snapshot \`${GEONAMES_SNAPSHOT.id}\` (${GENERATED_DATE}) with catalogue version \`${CATALOG_VERSION}\`. Every input archive is pinned by byte count and SHA-256 in \`scripts/geonames-input-manifest.mjs\`.\n\nThe checked-in country packs are deterministic offline snapshots generated from the official [GeoNames country extracts](${BASE_URL}/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). GeoNames supplies the data as-is without a guarantee of accuracy, timeliness or completeness. Individual records link to their GeoNames source.\n\nThe packs contain real named GeoNames features only. Counts below are evidence-dependent: small countries are not padded. Missing accommodation, restaurant, parking, road-surface, opening-hours, price and availability evidence remains unknown. Corridors connect nearby real anchors using a geodesic distance estimate and straight fallback geometry; they are not verified road routes. Live routing must replace that geometry when available. Transcontinental packs are explicitly limited to the European touring envelope used during generation.\n\nTotals: **${totals.anchors} anchors**, **${totals.corridors} derived adjacency edges**, **${totals.pois} POI associations**, **${totals.accommodations} accommodation associations**, **${totals.restaurants} restaurant associations**, and **${totals.services} service associations** across **${packs.length} countries**. Each source recommendation is assigned to one nearest qualifying base inside its country pack.\n\n| ISO | Country | Scope | Anchors | Corridors | POIs | Accommodation | Restaurants | Services |\n|---|---|---|---:|---:|---:|---:|---:|---:|\n${rows}\n\n## Rebuild and validate\n\n\`\`\`powershell\nnode --use-system-ca scripts/generate-catalog.mjs\nnode scripts/generate-catalog.mjs --validate-only\n\`\`\`\n\nSet \`REISSLIM_CATALOG_CACHE\` to choose the external download cache. Raw inputs are not committed. \`--refresh\` redownloads the official URLs but still rejects bytes that do not match the pinned manifest; changing a snapshot requires an explicit versioned manifest update.\n`;
}

async function validateExisting() {
  const index = await import(`../catalog-index.js?validate=${Date.now()}`);
  if (index.CATALOG_VERSION !== CATALOG_VERSION) throw new Error('catalog-index version mismatch');
  if (index.getCatalogLocatorStats().catalogVersion !== CATALOG_VERSION) throw new Error('catalog-locator version mismatch');
  for (const spec of COUNTRY_SPECS) {
    const pack = await index.loadCountryPack(spec.code);
    validatePack(pack);
  }
  console.log(`Validated ${COUNTRY_SPECS.length} country packs (${CATALOG_VERSION}).`);
}

async function writeExistingCoverage() {
  const index = await import(`../catalog-index.js?coverage=${Date.now()}`);
  const packs = [];
  for (const spec of COUNTRY_SPECS) {
    const pack = await index.loadCountryPack(spec.code);
    validatePack(pack);
    packs.push(pack);
  }
  await writeFile(join(ROOT, 'CATALOG_COVERAGE.md'), coverageMarkdown(packs), 'utf8');
  console.log(`Updated CATALOG_COVERAGE.md from ${packs.length} validated release packs.`);
}

async function assertEnrichmentWillNotBeDropped() {
  if (ALLOW_DROP_OSM) return;
  const enriched = [];
  for (const spec of COUNTRY_SPECS) {
    const path = join(ROOT, `catalog-${spec.code.toLowerCase()}.js`);
    if (!existsSync(path)) continue;
    const source = await readFile(path, 'utf8');
    if (source.includes('"openStreetMap"') || source.includes('"osmEnrichment"')) enriched.push(spec.code);
  }
  if (enriched.length) {
    throw new Error(`Refusing to overwrite OSM-enriched country packs (${enriched.join(', ')}). Run npm run catalog:rebuild to regenerate GeoNames and immediately reapply the exact external Overpass cache, or pass --allow-drop-osm only for an intentional intermediate stage.`);
  }
}

const executedDirectly = Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (executedDirectly) {
  if (VALIDATE_ONLY) {
    await validateExisting();
  } else if (COVERAGE_ONLY) {
    await writeExistingCoverage();
  } else {
    await assertEnrichmentWillNotBeDropped();
    const boundaries = await loadBoundaryContext();
    const packs = [];
    for (const [index, spec] of COUNTRY_SPECS.entries()) {
      process.stdout.write(`[${index + 1}/${COUNTRY_SPECS.length}] ${spec.code} ${spec.name} ... `);
      const pack = await buildPack(spec, boundaries.get(spec.code));
      await writeFile(join(ROOT, `catalog-${spec.code.toLowerCase()}.js`), packModule(pack), 'utf8');
      packs.push(pack);
      console.log(`${pack.stats.anchors} anchors, ${pack.stats.namedRecommendations} recommendation associations`);
    }
    const manifest = Object.fromEntries(packs.map(pack => [pack.country.code, {
      code: pack.country.code,
      name: pack.country.name,
      aliases: pack.country.aliases,
      bounds: pack.country.bounds,
      scope: pack.country.scope,
      module: `./catalog-${pack.country.code.toLowerCase()}.js`,
      schemaVersion: pack.schemaVersion,
      catalogVersion: pack.catalogVersion,
      generatedAt: pack.generatedAt,
      counts: pack.stats,
      recordCounts: pack.stats,
      anchorCount: pack.stats.anchors,
      source: {
        provider: 'GeoNames',
        license: 'CC BY 4.0',
        url: `${BASE_URL}/${pack.country.code}.zip`,
        snapshotId: GEONAMES_SNAPSHOT.id,
        inputBytes: pack.sourceSnapshot.countryExtract.bytes,
        inputSha256: pack.sourceSnapshot.countryExtract.sha256
      }
    }]));
    const locator = buildCatalogLocator(packs, CATALOG_VERSION);
    await writeFile(join(ROOT, 'catalog-locator.js'), catalogLocatorModule(locator), 'utf8');
    await writeFile(join(ROOT, 'catalog-index.js'), indexModule(manifest), 'utf8');
    await writeFile(join(ROOT, 'CATALOG_COVERAGE.md'), coverageMarkdown(packs), 'utf8');
    console.log(`Generated ${packs.length} country packs, ${locator.records.length} compact locator records and catalog-index.js.`);
  }
}
