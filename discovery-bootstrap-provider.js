import { validCoordinate } from './config.js';
import { normalizePhotonPlace } from './geocoding-provider.js';
import { haversineKm } from './route-engine.js';

const PHOTON_REVERSE_ENDPOINT = 'https://photon.komoot.io/reverse';
const WIKIPEDIA_ENDPOINT = 'https://en.wikipedia.org/w/api.php';

async function fetchJson(url, { fetchImpl, timeoutMs, signal }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Provider ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}

function settlementFeature(feature) {
  const properties = feature?.properties || {};
  const type = String(properties.osm_value || properties.type || properties.layer || '').toLowerCase();
  const layer = String(properties.layer || '').toLowerCase();
  return ['city', 'town', 'village', 'locality', 'municipality', 'district'].includes(type)
    || ['city', 'locality', 'district'].includes(layer);
}

export function normalizePhotonSettlements(payload) {
  const seen = new Set();
  return (payload?.features || []).filter(settlementFeature).map((feature, index) => {
    const place = normalizePhotonPlace('', feature);
    if (!place) return null;
    const id = place.providerId || place.id;
    if (seen.has(id)) return null;
    seen.add(id);
    return {
      id: `photon-${String(id).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      providerId: id,
      name: place.name,
      point: place.point,
      role: 'settlement',
      tags: [],
      rawTags: { place: place.geographicType },
      countryCode: place.countryCode,
      countryName: place.countryName,
      importance: Math.max(55, 72 - index * 3),
      confidence: 'provider-evidence',
      provider: place.provider,
      sourceUrl: place.sourceUrl,
      fetchedAt: place.fetchedAt
    };
  }).filter(Boolean);
}

export function normalizeWikipediaAnchors(payload, base) {
  const pages = Object.values(payload?.query?.pages || {});
  return pages.map((page, index) => {
    const coordinate = page.coordinates?.[0];
    const point = { lat: Number(coordinate?.lat), lon: Number(coordinate?.lon) };
    if (!page.title || !validCoordinate(point) || page.title.toLocaleLowerCase('en') === base.name.toLocaleLowerCase('en')) return null;
    return {
      id: `wikipedia-${page.pageid}`,
      providerId: `wikipedia/${page.pageid}`,
      name: page.title,
      point,
      role: 'highlight',
      tags: ['cultuur'],
      rawTags: { wikipedia: page.title },
      importance: Math.max(48, 66 - index * 2),
      confidence: 'limited',
      provider: 'Wikipedia GeoSearch',
      sourceUrl: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
      fetchedAt: new Date().toISOString(),
      baseProviderId: base.providerId,
      countryCode: base.countryCode || null,
      countryName: base.countryName || null
    };
  }).filter(Boolean);
}

async function inBatches(items, concurrency, worker) {
  const results = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...await Promise.all(items.slice(index, index + concurrency).map(worker)));
  }
  return results;
}

export async function bootstrapSettlementAnchors(seeds, {
  fetchImpl = globalThis.fetch,
  endpoint = PHOTON_REVERSE_ENDPOINT,
  maxSeeds = 3,
  timeoutMs = 4500,
  signal
} = {}) {
  if (typeof fetchImpl !== 'function') return { anchors: [], warnings: ['Photon bootstrap: geen netwerkfunctie.'], provider: 'Photon (OpenStreetMap)' };
  const warnings = [];
  const batches = await inBatches((seeds || []).filter(validCoordinate).slice(0, maxSeeds), 2, async seed => {
    try {
      const url = new URL(endpoint);
      url.searchParams.set('lat', Number(seed.lat).toFixed(5));
      url.searchParams.set('lon', Number(seed.lon).toFixed(5));
      url.searchParams.set('radius', '300');
      url.searchParams.set('limit', '5');
      url.searchParams.append('layer', 'city');
      url.searchParams.append('layer', 'locality');
      const payload = await fetchJson(url, { fetchImpl, timeoutMs, signal });
      return normalizePhotonSettlements(payload);
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`Photon settlement bootstrap: ${error?.message || 'niet beschikbaar'}`);
      return [];
    }
  });
  const anchors = [];
  for (const anchor of batches.flat()) {
    if (!anchors.some(existing => existing.providerId === anchor.providerId || (haversineKm(existing.point, anchor.point) || Infinity) < 4)) anchors.push(anchor);
  }
  return { anchors, warnings, provider: 'Photon (OpenStreetMap)' };
}

export async function enrichSettlementHighlights(settlements, {
  fetchImpl = globalThis.fetch,
  endpoint = WIKIPEDIA_ENDPOINT,
  maxBases = 2,
  timeoutMs = 4000,
  signal
} = {}) {
  if (typeof fetchImpl !== 'function') return { anchors: [], warnings: ['Wikipedia enrichment: geen netwerkfunctie.'], provider: 'Wikipedia GeoSearch' };
  const warnings = [];
  const batches = await inBatches((settlements || []).filter(item => validCoordinate(item.point)).slice(0, maxBases), 2, async base => {
    try {
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        action: 'query', generator: 'geosearch', ggscoord: `${base.point.lat}|${base.point.lon}`,
        ggsradius: '10000', ggslimit: '8', ggsnamespace: '0', prop: 'coordinates|info', inprop: 'url', format: 'json', origin: '*'
      });
      const payload = await fetchJson(url, { fetchImpl, timeoutMs, signal });
      return normalizeWikipediaAnchors(payload, base);
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`Wikipedia enrichment: ${error?.message || 'niet beschikbaar'}`);
      return [];
    }
  });
  const anchors = [];
  for (const anchor of batches.flat()) if (!anchors.some(existing => existing.providerId === anchor.providerId)) anchors.push(anchor);
  return { anchors, warnings, provider: 'Wikipedia GeoSearch' };
}

export const discoveryBootstrapConfig = Object.freeze({
  photonReverseEndpoint: PHOTON_REVERSE_ENDPOINT,
  wikipediaEndpoint: WIKIPEDIA_ENDPOINT,
  coverage: 'dynamic-independent-evidence'
});
