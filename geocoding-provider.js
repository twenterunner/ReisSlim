import { validCoordinate } from './config.js';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
const CACHE_SCHEMA = 2;

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function parseNominatimBounds(value) {
  const numbers = Array.isArray(value) ? value.map(Number) : [];
  if (numbers.length !== 4 || numbers.some(number => !Number.isFinite(number))) return null;
  const [south, north, west, east] = numbers;
  return south < north && west < east ? [south, north, west, east] : null;
}

function parsePhotonBounds(value) {
  const numbers = Array.isArray(value) ? value.map(Number) : [];
  if (numbers.length !== 4 || numbers.some(number => !Number.isFinite(number))) return null;
  const [west, north, east, south] = numbers;
  return south < north && west < east ? [south, north, west, east] : null;
}

function osmUrl(type, id) {
  if (!id) return null;
  const normalized = ({ N: 'node', W: 'way', R: 'relation', node: 'node', way: 'way', relation: 'relation' })[type] || 'object';
  return normalized === 'object' ? null : `https://www.openstreetmap.org/${normalized}/${id}`;
}

export function normalizeNominatimPlace(query, match) {
  const point = { lat: Number(match?.lat), lon: Number(match?.lon) };
  if (!validCoordinate(point)) return null;
  const geographicType = match.addresstype || match.type || 'place';
  return {
    id: `${match.osm_type || 'place'}-${match.osm_id || String(query || '').toLowerCase().replace(/\W+/g, '-')}`,
    query: String(query || '').trim(),
    name: match.namedetails?.name || match.display_name?.split(',')[0] || String(query || '').trim(),
    displayName: match.display_name || String(query || '').trim(),
    geographicType,
    geographicClass: match.class || 'place',
    importance: finite(match.importance),
    point,
    bounds: parseNominatimBounds(match.boundingbox),
    countryCode: String(match.address?.country_code || '').trim().toUpperCase() || null,
    countryName: match.address?.country || null,
    provider: 'OpenStreetMap Nominatim',
    providerId: match.osm_id ? `${match.osm_type || 'object'}/${match.osm_id}` : null,
    sourceUrl: osmUrl(match.osm_type, match.osm_id),
    confidence: finite(match.importance) !== null ? 'provider-evidence' : 'limited',
    fetchedAt: new Date().toISOString()
  };
}

export function normalizePhotonPlace(query, feature) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties || {};
  const point = { lat: Number(coordinates?.[1]), lon: Number(coordinates?.[0]) };
  if (!validCoordinate(point)) return null;
  const addressParts = [properties.name, properties.city, properties.county, properties.state, properties.country]
    .filter((value, index, list) => value && list.indexOf(value) === index);
  const geographicType = properties.type || properties.osm_value || properties.layer || 'place';
  return {
    id: `${properties.osm_type || 'photon'}-${properties.osm_id || feature.id || String(query || '').toLowerCase().replace(/\W+/g, '-')}`,
    query: String(query || '').trim(),
    name: properties.name || properties.city || properties.state || properties.country || String(query || '').trim(),
    displayName: addressParts.join(', ') || String(query || '').trim(),
    geographicType,
    geographicClass: properties.osm_key || properties.layer || 'place',
    importance: finite(properties.importance),
    point,
    bounds: parsePhotonBounds(properties.extent),
    countryCode: String(properties.countrycode || properties.country_code || '').trim().toUpperCase() || null,
    countryName: properties.country || null,
    provider: 'Photon (OpenStreetMap)',
    providerId: properties.osm_id ? `${properties.osm_type || 'object'}/${properties.osm_id}` : null,
    sourceUrl: osmUrl(properties.osm_type, properties.osm_id),
    confidence: 'provider-evidence',
    fetchedAt: new Date().toISOString()
  };
}

async function fetchJson(url, { fetchImpl, timeoutMs, signal, headers = {} }) {
  if (signal?.aborted) throw new DOMException('Geocoding cancelled', 'AbortError');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Provider ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}

async function respectNominatimRateLimit(signal) {
  const previous = Number(globalThis.__reisslimNominatimRequestAt || 0);
  const waitMs = Math.max(0, 1050 - (Date.now() - previous));
  if (signal?.aborted) throw new DOMException('Geocoding cancelled', 'AbortError');
  if (waitMs) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', abort); resolve(); }, waitMs);
    const abort = () => { clearTimeout(timer); reject(new DOMException('Geocoding cancelled', 'AbortError')); };
    signal?.addEventListener?.('abort', abort, { once: true });
  });
  globalThis.__reisslimNominatimRequestAt = Date.now();
}

function cacheKey(query) {
  return `reisslim.geocode.v${CACHE_SCHEMA}:${encodeURIComponent(String(query).trim().toLocaleLowerCase('nl-NL'))}`;
}

function readCache(storage, key, maxAgeMs) {
  try {
    const record = JSON.parse(storage?.getItem(key) || 'null');
    return record?.resolution && Date.now() - record.savedAt < maxAgeMs
      ? { ...record.resolution, cached: true, cacheAgeMs: Date.now() - record.savedAt }
      : null;
  } catch { return null; }
}

function writeCache(storage, key, resolution) {
  try { storage?.setItem(key, JSON.stringify({ savedAt: Date.now(), resolution })); } catch { /* cache is optional */ }
}

export async function geocodePlace(query, {
  fetchImpl = globalThis.fetch,
  storage: suppliedStorage,
  nominatimEndpoint = NOMINATIM_ENDPOINT,
  photonEndpoint = PHOTON_ENDPOINT,
  nominatimTimeoutMs = 3500,
  photonTimeoutMs = 5000,
  signal
} = {}) {
  const value = String(query || '').trim();
  if (!value) return { resolution: null, status: 'empty', warnings: [] };
  const storage = suppliedStorage === undefined ? defaultStorage() : suppliedStorage;
  const key = cacheKey(value);
  const cached = readCache(storage, key, 90 * 24 * 60 * 60 * 1000);
  if (cached) return { resolution: cached, status: 'cached', warnings: [] };
  if (typeof fetchImpl !== 'function') return { resolution: null, status: 'unavailable', warnings: ['Geen netwerkfunctie beschikbaar.'] };

  const warnings = [];
  try {
    await respectNominatimRateLimit(signal);
    const url = new URL(nominatimEndpoint);
    url.search = new URLSearchParams({ q: value, format: 'jsonv2', limit: '3', addressdetails: '1', extratags: '1', namedetails: '1' });
    const payload = await fetchJson(url, { fetchImpl, timeoutMs: nominatimTimeoutMs, signal, headers: { 'accept-language': 'nl,en;q=0.8' } });
    const resolution = (payload || []).map(match => normalizeNominatimPlace(value, match)).find(Boolean) || null;
    if (resolution) {
      writeCache(storage, key, resolution);
      return { resolution, status: 'fresh', warnings };
    }
    warnings.push('Nominatim vond geen passend geografisch object.');
  } catch (error) {
    if (signal?.aborted) throw error;
    warnings.push(`Nominatim: ${error?.message || 'niet beschikbaar'}`);
  }

  try {
    const url = new URL(photonEndpoint);
    url.search = new URLSearchParams({ q: value, limit: '5', lang: 'en' });
    const payload = await fetchJson(url, { fetchImpl, timeoutMs: photonTimeoutMs, signal });
    const resolution = (payload?.features || []).map(feature => normalizePhotonPlace(value, feature)).find(Boolean) || null;
    if (resolution) {
      writeCache(storage, key, resolution);
      return { resolution, status: 'fresh-secondary', warnings };
    }
    warnings.push('Photon vond geen passend geografisch object.');
  } catch (error) {
    if (signal?.aborted) throw error;
    warnings.push(`Photon: ${error?.message || 'niet beschikbaar'}`);
  }
  return { resolution: null, status: 'unavailable', warnings };
}

export const geocodingConfig = Object.freeze({
  schema: CACHE_SCHEMA,
  providers: ['OpenStreetMap Nominatim', 'Photon (OpenStreetMap)']
});
