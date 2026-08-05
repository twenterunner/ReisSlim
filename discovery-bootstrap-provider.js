import { validCoordinate } from './config.js';
import { normalizePhotonPlace } from './geocoding-provider.js';
import { haversineKm } from './route-engine.js';

const PHOTON_REVERSE_ENDPOINT = 'https://photon.komoot.io/reverse';
const WIKIPEDIA_ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const SETTLEMENT_IMPORTANCE = Object.freeze({
  city: 88, town: 76, municipality: 70, village: 58, locality: 44,
  district: 34, suburb: 28, neighbourhood: 24, hamlet: 22
});

const throwIfAborted = signal => {
  if (signal?.aborted) throw new DOMException('Discovery cancelled', 'AbortError');
};

async function fetchJson(url, { fetchImpl, timeoutMs, signal }) {
  throwIfAborted(signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
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
  return Object.hasOwn(SETTLEMENT_IMPORTANCE, type) || Object.hasOwn(SETTLEMENT_IMPORTANCE, layer)
    || ['city', 'locality', 'district'].includes(layer);
}

function settlementType(properties = {}) {
  const candidates = [properties.osm_value, properties.type, properties.layer].map(value => String(value || '').toLowerCase());
  return candidates.find(value => Object.hasOwn(SETTLEMENT_IMPORTANCE, value)) || 'locality';
}

function settlementImportance(properties, type, index) {
  const population = Number(properties.population);
  const populationBonus = Number.isFinite(population) && population > 0 ? Math.min(10, Math.log10(Math.max(10, population)) * 1.7) : 0;
  const capitalBonus = properties.capital || properties.osm_key === 'capital' ? 8 : 0;
  const evidenceBonus = properties.wikidata || properties.wikipedia ? 4 : 0;
  return Math.min(100, (SETTLEMENT_IMPORTANCE[type] || 40) + populationBonus + capitalBonus + evidenceBonus - Math.min(4, index));
}

export function normalizePhotonSettlements(payload, { sample = null } = {}) {
  const seen = new Set();
  return (payload?.features || []).filter(settlementFeature).map((feature, index) => {
    const place = normalizePhotonPlace('', feature);
    if (!place) return null;
    const properties = feature.properties || {};
    const type = settlementType(properties);
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
      rawTags: { place: type, population: properties.population, capital: properties.capital },
      countryCode: place.countryCode,
      countryName: place.countryName,
      countryEvidence: 'provider',
      importance: settlementImportance(properties, type, index),
      macroType: type,
      macroCandidate: ['city', 'town', 'municipality'].includes(type),
      sampleSequence: sample?.sequence ?? null,
      distanceToSampleKm: validCoordinate(sample) ? Number((haversineKm(sample, place.point) || 0).toFixed(1)) : null,
      confidence: 'provider-evidence',
      provider: place.provider,
      sourceUrl: place.sourceUrl,
      fetchedAt: place.fetchedAt
    };
  }).filter(Boolean);
}

export function selectSignificantSettlements(anchors, { limit = Number.POSITIVE_INFINITY, minSeparationKm = 24 } = {}) {
  const ranked = [...(anchors || [])].filter(anchor => anchor?.role === 'settlement' && validCoordinate(anchor.point))
    .sort((left, right) => right.importance - left.importance
      || Number(Boolean(right.macroCandidate)) - Number(Boolean(left.macroCandidate))
      || (left.distanceToSampleKm ?? Infinity) - (right.distanceToSampleKm ?? Infinity)
      || left.name.localeCompare(right.name));
  const hasMacroEvidence = ranked.some(anchor => anchor.macroCandidate || anchor.importance >= 68);
  const eligible = hasMacroEvidence ? ranked.filter(anchor => anchor.macroCandidate || anchor.importance >= 55) : ranked;
  const selected = [];
  for (const candidate of eligible) {
    if (selected.some(existing => existing.providerId === candidate.providerId)) continue;
    const nearbyIndex = selected.findIndex(existing => (haversineKm(existing.point, candidate.point) ?? Infinity) < minSeparationKm);
    if (nearbyIndex >= 0) {
      if (candidate.importance > selected[nearbyIndex].importance) selected[nearbyIndex] = candidate;
      continue;
    }
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected.sort((left, right) => right.importance - left.importance || left.name.localeCompare(right.name));
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
      countryName: base.countryName || null,
      countryEvidence: 'inherited-proximity'
    };
  }).filter(Boolean);
}

async function inBatches(items, concurrency, worker, signal) {
  const results = [];
  for (let index = 0; index < items.length; index += concurrency) {
    throwIfAborted(signal);
    results.push(...await Promise.all(items.slice(index, index + concurrency).map(worker)));
  }
  return results;
}

export async function bootstrapSettlementAnchors(seeds, {
  fetchImpl = globalThis.fetch,
  endpoint = PHOTON_REVERSE_ENDPOINT,
  maxSeeds = 8,
  timeoutMs = 4500,
  signal
} = {}) {
  if (typeof fetchImpl !== 'function') return { anchors: [], warnings: ['Photon bootstrap: geen netwerkfunctie.'], provider: 'Photon (OpenStreetMap)' };
  const warnings = [];
  const sampledSeeds = (seeds || []).filter(validCoordinate).slice(0, maxSeeds);
  const batches = await inBatches(sampledSeeds, 2, async seed => {
    throwIfAborted(signal);
    try {
      const url = new URL(endpoint);
      url.searchParams.set('lat', Number(seed.lat).toFixed(5));
      url.searchParams.set('lon', Number(seed.lon).toFixed(5));
      url.searchParams.set('radius', '300');
      url.searchParams.set('limit', '5');
      url.searchParams.append('layer', 'city');
      url.searchParams.append('layer', 'locality');
      const payload = await fetchJson(url, { fetchImpl, timeoutMs, signal });
      return normalizePhotonSettlements(payload, { sample: seed });
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`Photon settlement bootstrap: ${error?.message || 'niet beschikbaar'}`);
      return [];
    }
  }, signal);
  const anchors = selectSignificantSettlements(batches.flat(), {
    limit: maxSeeds,
    minSeparationKm: sampledSeeds.some(seed => seed.targeted) ? 35 : 18
  });
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
  }, signal);
  const anchors = [];
  for (const anchor of batches.flat()) if (!anchors.some(existing => existing.providerId === anchor.providerId)) anchors.push(anchor);
  return { anchors, warnings, provider: 'Wikipedia GeoSearch' };
}

export const discoveryBootstrapConfig = Object.freeze({
  photonReverseEndpoint: PHOTON_REVERSE_ENDPOINT,
  wikipediaEndpoint: WIKIPEDIA_ENDPOINT,
  coverage: 'dynamic-independent-evidence'
});
