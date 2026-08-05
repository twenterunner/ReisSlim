import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

export const OVERTURE_EXTRACTION_SCHEMA_VERSION = 2;
export const PINNED_OVERTURE_RELEASE = '2026-06-17.0';
export const PINNED_OVERTURE_SCHEMA = 'v1.17.0';
export const OVERTURE_STAC_HOST = 'stac.overturemaps.org';
export const OVERTURE_ASSET_HOSTS = Object.freeze(new Set([
  'overturemaps-us-west-2.s3.us-west-2.amazonaws.com',
  'overturemapswestus2.blob.core.windows.net'
]));

const TYPE_PATHS = Object.freeze({
  place: '/theme=places/type=place/',
  segment: '/theme=transportation/type=segment/'
});
const EXTRACTION_POLICIES = Object.freeze({
  place: Object.freeze({ queryVersion: 2, rowLimit: 50, limitScope: 'per-category-per-base' }),
  segment: Object.freeze({ queryVersion: 3, rowLimit: 25, limitScope: 'per-road-class-per-base' })
});
const GROUP_LIMITS = Object.freeze({ pois: 15, accommodations: 8, restaurants: 5, services: 5 });

function normalizeText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function parseOvertureBBox(value) {
  const parts = value && typeof value === 'object' && !Array.isArray(value)
    ? [value.west, value.south, value.east, value.north].map(Number)
    : Array.isArray(value) ? value.map(Number) : String(value || '').split(',').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) throw new TypeError('bbox must contain west,south,east,north numbers');
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new RangeError('bbox coordinates are outside WGS84 bounds or have invalid ordering');
  }
  return Object.freeze({ west, south, east, north });
}

function normalizeCountryCode(value) {
  if (value === null || value === undefined || value === '') return null;
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new TypeError('countryCode must be a two-letter ISO code');
  return code;
}

export function normalizeOvertureBasePoint(value, bbox) {
  const bounds = parseOvertureBBox(bbox);
  const fallback = value === null || value === undefined;
  // Keep plan identities stable across runtimes: binary floating-point midpoint
  // artefacts must not create a different cache key for the same WGS84 box.
  const coordinate = number => Math.round(number * 1e10) / 1e10;
  const lat = coordinate(fallback ? (bounds.south + bounds.north) / 2 : Number(value.lat));
  const lon = coordinate(fallback ? (bounds.west + bounds.east) / 2 : Number(value.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new TypeError('basePoint requires valid WGS84 lat and lon values');
  }
  if (lat < bounds.south || lat > bounds.north || lon < bounds.west || lon > bounds.east) {
    throw new RangeError('basePoint must fall inside its extraction bbox');
  }
  return Object.freeze({
    lat,
    lon,
    name: fallback || !value.name ? null : String(value.name),
    source: fallback ? 'bbox-center' : String(value.source || 'catalog-anchor')
  });
}

function normalizeBatchRequest(request, index, defaultCountryCode = null) {
  const baseId = String(request?.baseId || '').trim();
  if (!baseId) throw new TypeError(`Batch request ${index + 1} requires baseId`);
  const bbox = parseOvertureBBox(request.bbox);
  return Object.freeze({
    baseId,
    countryCode: normalizeCountryCode(request.countryCode || defaultCountryCode),
    bbox,
    basePoint: normalizeOvertureBasePoint(request.basePoint, bbox)
  });
}

function unionBBoxes(requests) {
  return Object.freeze(requests.reduce((union, request) => ({
    west: Math.min(union.west, request.bbox.west),
    south: Math.min(union.south, request.bbox.south),
    east: Math.max(union.east, request.bbox.east),
    north: Math.max(union.north, request.bbox.north)
  }), { west: 180, south: 90, east: -180, north: -90 }));
}

export function validateOvertureAsset(asset, { release = PINNED_OVERTURE_RELEASE, type } = {}) {
  if (!asset?.id || !asset?.url) throw new TypeError('Overture asset requires id and url');
  if (!TYPE_PATHS[type]) throw new TypeError(`Unsupported Overture type: ${type}`);
  const url = new URL(asset.url);
  if (url.protocol !== 'https:' || !OVERTURE_ASSET_HOSTS.has(url.hostname)) throw new Error(`Untrusted Overture asset host: ${url.hostname}`);
  const releasePrefix = `/release/${release}`;
  if (!url.pathname.startsWith(releasePrefix) || !url.pathname.includes(TYPE_PATHS[type])) {
    throw new Error(`Asset path does not match pinned ${release} ${type} dataset`);
  }
  if (!url.pathname.endsWith('.parquet')) throw new Error('Overture assets must be Parquet files');
  return { ...asset, id: String(asset.id), url: url.href };
}

export function buildOverturePlan({ bbox, type, assets, release = PINNED_OVERTURE_RELEASE, baseId = null, countryCode = null, basePoint = null }) {
  if (release !== PINNED_OVERTURE_RELEASE) throw new Error(`This extractor is pinned to Overture ${PINNED_OVERTURE_RELEASE}`);
  const normalizedBBox = parseOvertureBBox(bbox);
  const normalizedAssets = [...(assets || [])].map(asset => validateOvertureAsset(asset, { release, type }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!normalizedAssets.length) throw new Error('No Overture assets intersect the requested bbox');
  if (new Set(normalizedAssets.map(asset => asset.id)).size !== normalizedAssets.length) throw new Error('Overture asset IDs must be unique');
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const normalizedBaseId = baseId === null || baseId === undefined || baseId === '' ? null : String(baseId);
  const identityInput = {
    schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
    mode: 'single',
    release,
    type,
    bbox: normalizedBBox,
    assets: normalizedAssets,
    baseId: normalizedBaseId,
    countryCode: normalizedCountryCode,
    basePoint: normalizeOvertureBasePoint(basePoint, normalizedBBox),
    extractionPolicy: EXTRACTION_POLICIES[type]
  };
  return Object.freeze({
    ...identityInput,
    overtureSchemaVersion: PINNED_OVERTURE_SCHEMA,
    identity: createHash('sha256').update(canonicalJson(identityInput)).digest('hex'),
    source: 'Overture Maps STAC collections index'
  });
}

export function buildOvertureBatchPlan({ type, requests, assets, release = PINNED_OVERTURE_RELEASE, countryCode = null }) {
  if (release !== PINNED_OVERTURE_RELEASE) throw new Error(`This extractor is pinned to Overture ${PINNED_OVERTURE_RELEASE}`);
  if (!TYPE_PATHS[type]) throw new TypeError(`Unsupported Overture type: ${type}`);
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const normalizedRequests = [...(requests || [])]
    .map((request, index) => normalizeBatchRequest(request, index, normalizedCountryCode))
    .sort((left, right) => left.baseId.localeCompare(right.baseId, 'en'));
  if (!normalizedRequests.length) throw new Error('An Overture batch plan requires at least one base request');
  if (new Set(normalizedRequests.map(request => request.baseId)).size !== normalizedRequests.length) {
    throw new Error('Overture batch request baseIds must be unique');
  }
  if (normalizedCountryCode && normalizedRequests.some(request => request.countryCode !== normalizedCountryCode)) {
    throw new Error('Every batch request must use the plan countryCode');
  }
  const normalizedAssets = [...(assets || [])].map(asset => validateOvertureAsset(asset, { release, type }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!normalizedAssets.length) throw new Error('No Overture assets intersect the requested base bboxes');
  if (new Set(normalizedAssets.map(asset => asset.id)).size !== normalizedAssets.length) throw new Error('Overture asset IDs must be unique');
  const identityInput = {
    schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
    mode: 'batch',
    release,
    type,
    countryCode: normalizedCountryCode,
    bbox: unionBBoxes(normalizedRequests),
    requests: normalizedRequests,
    assets: normalizedAssets,
    extractionPolicy: EXTRACTION_POLICIES[type]
  };
  return Object.freeze({
    ...identityInput,
    overtureSchemaVersion: PINNED_OVERTURE_SCHEMA,
    identity: createHash('sha256').update(canonicalJson(identityInput)).digest('hex'),
    source: 'Overture Maps STAC collections index'
  });
}

export function validateOverturePlan(plan) {
  const rebuilt = plan?.mode === 'batch' || Array.isArray(plan?.requests)
    ? buildOvertureBatchPlan(plan)
    : buildOverturePlan(plan);
  if (plan.identity && rebuilt.identity !== plan.identity) throw new Error('Overture plan identity does not match its material inputs');
  return rebuilt;
}

class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; this.waiters = []; }
  async acquire() {
    if (this.active < this.limit) { this.active += 1; return; }
    await new Promise(resolve => this.waiters.push(resolve));
    this.active += 1;
  }
  release() { this.active -= 1; this.waiters.shift()?.(); }
}

export class BoundedRangeCache {
  constructor(maxBytes = 16 * 1024 * 1024) { this.maxBytes = maxBytes; this.bytes = 0; this.entries = new Map(); }
  get(key) {
    const value = this.entries.get(key);
    if (!value) return null;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }
  set(key, value) {
    const body = Buffer.from(value.body || value);
    if (body.length > this.maxBytes) return;
    if (this.entries.has(key)) this.bytes -= this.entries.get(key).body.length;
    this.entries.delete(key);
    this.entries.set(key, { ...value, body });
    this.bytes += body.length;
    while (this.bytes > this.maxBytes && this.entries.size) {
      const oldest = this.entries.keys().next().value;
      this.bytes -= this.entries.get(oldest).body.length;
      this.entries.delete(oldest);
    }
  }
}

function requestOnce(asset, { method, range, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const url = new URL(asset.url);
    const headers = { 'user-agent': 'ReisSlim-Overture-catalogue/1.0', 'accept-encoding': 'identity' };
    if (range) headers.range = range;
    const request = https.request({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method,
      family: 4,
      timeout: timeoutMs,
      rejectUnauthorized: true,
      headers
    }, response => {
      const expected = range ? parseRange(range, Number.MAX_SAFE_INTEGER) : null;
      if (expected && response.statusCode !== 206) {
        response.destroy();
        reject(new Error(`Overture range upstream returned HTTP ${response.statusCode}; refusing a possible full response`));
        return;
      }
      if (expected) {
        const contentRange = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(String(response.headers['content-range'] || ''));
        if (!contentRange || Number(contentRange[1]) !== expected.start || Number(contentRange[2]) !== expected.end) {
          response.destroy();
          reject(new Error('Overture upstream returned a mismatched Content-Range'));
          return;
        }
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (expected && bytes > expected.length) response.destroy(new Error('Overture upstream exceeded the requested byte range'));
        else if (method !== 'HEAD') chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Overture upstream timeout')));
    request.on('error', reject);
    request.end();
  });
}

export async function requestOfficialOvertureAsset(asset, options = {}) {
  const retries = Math.max(0, Math.min(3, Number(options.retries ?? 2)));
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await requestOnce(asset, { method: options.method, range: options.range, timeoutMs: options.timeoutMs || 30_000 });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === retries) return response;
      lastError = new Error(`Overture upstream returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 150 * 2 ** attempt));
  }
  throw lastError;
}

function parseRange(value, maximumBytes) {
  const match = /^bytes=(\d+)-(\d+)$/.exec(String(value || ''));
  if (!match) throw Object.assign(new Error('A single explicit byte range is required'), { status: 416 });
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw Object.assign(new Error('Invalid byte range'), { status: 416 });
  }
  if (end - start + 1 > maximumBytes) throw Object.assign(new Error('Requested range exceeds proxy limit'), { status: 413 });
  return { start, end, header: `bytes=${start}-${end}`, length: end - start + 1 };
}

function copyHeaders(headers, allowed) {
  return Object.fromEntries(allowed.filter(name => headers?.[name] !== undefined).map(name => [name, headers[name]]));
}

export async function createOvertureRangeProxy({
  plan,
  host = '127.0.0.1',
  port = 0,
  maxRangeBytes = 8 * 1024 * 1024,
  maxCacheBytes = 16 * 1024 * 1024,
  maxConcurrency = 4,
  upstream = requestOfficialOvertureAsset
}) {
  const validated = validateOverturePlan(plan);
  if (!Number.isFinite(maxRangeBytes) || maxRangeBytes < 1 || maxRangeBytes > 64 * 1024 * 1024) throw new RangeError('maxRangeBytes must be between 1 byte and 64 MiB');
  if (!Number.isFinite(maxCacheBytes) || maxCacheBytes < 0 || maxCacheBytes > 512 * 1024 * 1024) throw new RangeError('maxCacheBytes must be between 0 and 512 MiB');
  const assets = new Map(validated.assets.map(asset => [asset.id, asset]));
  const cache = new BoundedRangeCache(maxCacheBytes);
  const semaphore = new Semaphore(Math.max(1, Math.min(8, maxConcurrency)));
  const inFlight = new Map();
  const metrics = {
    upstreamRequests: 0, headRequests: 0, rangeRequests: 0, cacheHits: 0,
    rejectedRequests: 0, upstreamBytes: 0, errors: [], ranges: []
  };

  async function obtain(asset, method, range = null) {
    const key = `${asset.id}:${method}:${range || ''}`;
    if (method === 'GET') {
      const cached = cache.get(key);
      if (cached) { metrics.cacheHits += 1; return cached; }
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const operation = (async () => {
      await semaphore.acquire();
      try {
        metrics.upstreamRequests += 1;
        const response = await upstream(asset, { method, range, timeoutMs: 30_000, retries: 2 });
        if (method === 'HEAD' && response.status !== 200) throw new Error(`HEAD returned HTTP ${response.status}`);
        if (method === 'GET' && response.status !== 206) throw new Error(`Range request returned HTTP ${response.status}; full responses are forbidden`);
        const result = { status: response.status, headers: response.headers || {}, body: Buffer.from(response.body || []) };
        metrics.upstreamBytes += result.body.length;
        if (method === 'GET') cache.set(key, result);
        return result;
      } finally {
        semaphore.release();
      }
    })();
    inFlight.set(key, operation);
    try { return await operation; } finally { inFlight.delete(key); }
  }

  const server = http.createServer(async (request, response) => {
    const started = performance.now();
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/metrics') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ...metrics, cacheBytes: cache.bytes, cacheEntries: cache.entries.size }));
        return;
      }
      const match = /^\/assets\/([^/]+)\.parquet$/.exec(url.pathname);
      const asset = match ? assets.get(decodeURIComponent(match[1])) : null;
      if (!asset || !['HEAD', 'GET'].includes(request.method)) {
        metrics.rejectedRequests += 1;
        response.writeHead(404).end();
        return;
      }
      if (request.method === 'HEAD') {
        metrics.headRequests += 1;
        const result = await obtain(asset, 'HEAD');
        response.writeHead(200, copyHeaders(result.headers, ['accept-ranges', 'content-length', 'content-type', 'etag', 'last-modified']));
        response.end();
        return;
      }
      const range = parseRange(request.headers.range, maxRangeBytes);
      metrics.rangeRequests += 1;
      if (metrics.ranges.length < 1_000) metrics.ranges.push(range.header);
      else metrics.droppedRangeMetrics = (metrics.droppedRangeMetrics || 0) + 1;
      const result = await obtain(asset, 'GET', range.header);
      if (result.body.length !== range.length) throw new Error(`Upstream range length mismatch: expected ${range.length}, received ${result.body.length}`);
      const contentRange = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(String(result.headers['content-range'] || ''));
      if (!contentRange || Number(contentRange[1]) !== range.start || Number(contentRange[2]) !== range.end) throw new Error('Upstream Content-Range does not match the requested bytes');
      response.writeHead(206, copyHeaders(result.headers, ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']));
      response.end(result.body);
    } catch (error) {
      metrics.errors.push(error.message);
      if (error.status) metrics.rejectedRequests += 1;
      if (!response.headersSent) response.writeHead(error.status || 502, { 'content-type': 'text/plain' });
      response.end(error.message);
    } finally {
      metrics.lastRequestMs = Math.round(performance.now() - started);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const address = server.address();
  const origin = `http://${host}:${address.port}`;
  return {
    server, origin, metrics,
    assetUrls: Object.fromEntries(validated.assets.map(asset => [asset.id, `${origin}/assets/${encodeURIComponent(asset.id)}.parquet`])),
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

function overtureGroup(category) {
  const value = normalizeText(category).replaceAll(' ', '_');
  if (/hotel|lodging|motel|hostel|guest_house|bed_and_breakfast|campground|camping|resort/.test(value)) return 'accommodations';
  if (/restaurant|cafe|coffee_shop|food_court|bakery|bar$|pub$/.test(value)) return 'restaurants';
  if (/gas_station|charging_station|parking|automotive_service|vehicle_service|rest_area|toilet|ferry_terminal/.test(value)) return 'services';
  if (/historic|museum|park|nature|viewpoint|attraction|landmark|zoo|aquarium|garden|beach|mountain|theatre|gallery|winery|monument|castle|heritage/.test(value)) return 'pois';
  return null;
}

function statusFor(group) {
  return {
    accommodations: 'Named accommodation candidate — availability and price not verified.',
    restaurants: 'Named food candidate — opening hours, availability and price not verified.',
    pois: 'Named place candidate — access and opening status not verified.',
    services: 'Named service candidate — current service status not verified.'
  }[group];
}

export function normalizeOvertureRecord(record, plan) {
  if (plan.type === 'segment') {
    if (!record?.id) return null;
    return {
      id: `overture-${record.id}`, providerId: record.id, provider: 'Overture Maps', type: 'transportation-segment',
      subtype: record.subtype || null, roadClass: record.road_class || record.class || null,
      roadSurface: record.road_surface || null, routes: record.routes || [], accessRestrictions: record.access_restrictions || [],
      speedLimits: record.speed_limits || [], geometryWkbBase64: record.geometry_base64 || null,
      bbox: record.bbox || null, sources: record.sources || [], confidence: null,
      release: plan.release, license: 'ODbL 1.0', attribution: '© OpenStreetMap contributors, Overture Maps Foundation'
    };
  }
  const group = overtureGroup(record?.basic_category);
  const name = String(record?.name || '').trim();
  if (!record?.id || !name || !group || !Number.isFinite(Number(record.lat)) || !Number.isFinite(Number(record.lon))) return null;
  const upstreamSources = Array.isArray(record.sources) ? record.sources : [];
  return {
    id: `overture-${record.id}`,
    providerId: record.id,
    name,
    type: record.basic_category,
    category: group === 'pois' ? 'poi' : group === 'accommodations' ? 'accommodation' : group === 'restaurants' ? 'restaurant' : 'service',
    group,
    baseId: plan.baseId || null,
    countryCode: plan.countryCode || null,
    lat: Number(record.lat),
    lon: Number(record.lon),
    provider: 'Overture Maps',
    source: `Overture Maps ${plan.release} Places`,
    sourceUrl: plan.assets[0]?.url || 'https://overturemaps.org/',
    sources: upstreamSources,
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : null,
    lastChecked: plan.release.slice(0, 10),
    taxonomy: record.taxonomy || null,
    addresses: record.addresses || [],
    websites: record.websites || [],
    operatingStatus: record.operating_status || null,
    vehicleFit: { car: 'unknown', motorcycle: 'unknown' },
    vehicleFitEvidence: { car: [], motorcycle: [] },
    openingHours: null,
    parkingEvidence: null,
    status: statusFor(group),
    licenceEvidence: upstreamSources.map(source => source?.license).filter(Boolean)
  };
}

export function normalizeOvertureExtraction(records, plan) {
  const validated = validateOverturePlan(plan);
  const seen = new Set();
  const normalized = [];
  for (const record of records || []) {
    const item = normalizeOvertureRecord(record, validated);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
  }
  normalized.sort((left, right) => (left.group || left.type).localeCompare(right.group || right.type)
    || (left.name || left.id).localeCompare(right.name || right.id, 'en'));
  const groups = validated.type === 'place'
    ? Object.fromEntries(Object.keys(GROUP_LIMITS).map(group => [group, normalized.filter(item => item.group === group).slice(0, GROUP_LIMITS[group])]))
    : null;
  return {
    schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
    planIdentity: validated.identity,
    provider: 'Overture Maps',
    release: validated.release,
    type: validated.type,
    bbox: validated.bbox,
    baseId: validated.baseId,
    countryCode: validated.countryCode,
    records: normalized,
    rawRecords: structuredClone(records || []),
    groups,
    counts: validated.type === 'place' ? Object.fromEntries(Object.entries(groups).map(([group, items]) => [group, items.length])) : { segments: normalized.length },
    attribution: validated.type === 'segment' ? '© OpenStreetMap contributors, Overture Maps Foundation' : 'Overture Maps Foundation; preserve each record source licence'
  };
}
