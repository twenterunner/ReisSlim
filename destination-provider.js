import { ENGINE_VERSION, validCoordinate } from './config.js';
import { resolveOrigin } from './trip-model.js';
import { haversineKm } from './route-engine.js';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
const DISCOVERY_SCHEMA = 3;
const GOLDEN_ANGLE = 137.507764;

const clone = value => JSON.parse(JSON.stringify(value));
async function respectNominatimRateLimit() {
  const previous = Number(globalThis.__reisslimNominatimRequestAt || 0);
  const waitMs = Math.max(0, 1050 - (Date.now() - previous));
  if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
  globalThis.__reisslimNominatimRequestAt = Date.now();
}
const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const pointOf = element => {
  const lat = finite(element?.lat ?? element?.center?.lat);
  const lon = finite(element?.lon ?? element?.center?.lon);
  return validCoordinate({ lat, lon }) ? { lat, lon } : null;
};

function destinationPoint(origin, distanceKm, bearingDegrees) {
  const radius = 6371; const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = origin.lat * Math.PI / 180; const lon1 = origin.lon * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceKm / radius) + Math.cos(lat1) * Math.sin(distanceKm / radius) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(distanceKm / radius) * Math.cos(lat1), Math.cos(distanceKm / radius) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
}

export function discoverySeeds(trip, cursor = 0, count = 8, resolution = null) {
  const origin = resolveOrigin(trip);
  const bounds = resolution?.bounds;
  if (bounds) {
    const [south, north, west, east] = bounds;
    const rows = Math.max(2, Math.ceil(Math.sqrt(count)));
    return Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / rows); const column = index % rows;
      const jitter = ((cursor + index) % 5) * .015;
      return {
        lat: south + (north - south) * Math.min(.92, .12 + row / Math.max(1, rows - 1) * .76 + jitter),
        lon: west + (east - west) * Math.min(.92, .12 + column / Math.max(1, rows - 1) * .76 - jitter),
        sequence: cursor * count + index,
        targeted: true
      };
    });
  }
  const centre = resolution?.point || trip.destinationPoint || origin;
  if (!centre) return [];
  const global = trip.travelMode && trip.travelMode !== 'direct';
  const legs = Math.max(1, Math.min(5, Math.floor((trip.days - 1) / 2)));
  const reach = resolution ? Math.max(160, trip.maxDrive * 62 * Math.max(1, Math.floor(trip.days / 5)))
    : global ? Math.min(15000, 1800 + trip.days * 540) : Math.max(220, Math.min(3600, trip.maxDrive * 76 * legs));
  const ring = .24 + ((cursor % 11) / 10) * .7;
  return Array.from({ length: count }, (_, index) => {
    const sequence = cursor * count + index;
    const distanceKm = reach * Math.max(.16, Math.min(.98, ring + ((index % 3) - 1) * .09));
    return { ...destinationPoint(centre, distanceKm, sequence * GOLDEN_ANGLE), distanceKm, sequence, targeted: Boolean(resolution) };
  });
}

function parseBounds(value) {
  const numbers = Array.isArray(value) ? value.map(Number) : [];
  if (numbers.length !== 4 || numbers.some(number => !Number.isFinite(number))) return null;
  const [south, north, west, east] = numbers;
  return south < north && west < east ? [south, north, west, east] : null;
}

export function normalizeDestinationResolution(query, match) {
  const point = { lat: Number(match?.lat), lon: Number(match?.lon) };
  if (!validCoordinate(point)) return null;
  return {
    id: `${match.osm_type || 'place'}-${match.osm_id || slug(query)}`,
    query: String(query || '').trim(),
    name: match.display_name?.split(',')[0] || String(query || '').trim(),
    displayName: match.display_name || String(query || '').trim(),
    geographicType: match.type || match.addresstype || 'place',
    geographicClass: match.class || 'place',
    importance: finite(match.importance),
    point,
    bounds: parseBounds(match.boundingbox),
    provider: 'OpenStreetMap Nominatim',
    providerId: match.osm_id ? `${match.osm_type || 'object'}/${match.osm_id}` : null,
    sourceUrl: match.osm_id ? `https://www.openstreetmap.org/${match.osm_type || 'node'}/${match.osm_id}` : null,
    confidence: finite(match.importance) !== null ? 'provider-evidence' : 'limited',
    fetchedAt: new Date().toISOString()
  };
}

async function fetchJson(url, options, fetchImpl, timeoutMs) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Provider ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

export async function resolveDestination(query, { fetchImpl = globalThis.fetch, endpoint = NOMINATIM_ENDPOINT, timeoutMs = 8000 } = {}) {
  const value = String(query || '').trim();
  if (!value || typeof fetchImpl !== 'function') return null;
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ q: value, format: 'jsonv2', limit: '3', addressdetails: '1', extratags: '1', namedetails: '1' });
  try {
    await respectNominatimRateLimit();
    const matches = await fetchJson(url, { headers: { accept: 'application/json', 'accept-language': 'nl,en;q=0.8' } }, fetchImpl, timeoutMs);
    return normalizeDestinationResolution(value, matches?.[0]);
  } catch { return null; }
}

export function buildDiscoveryQuery(trip, cursor = 0, resolution = null) {
  const seeds = discoverySeeds(trip, cursor, 8, resolution);
  const radius = resolution?.bounds ? 70000 : 46000;
  const clauses = seeds.map(seed => {
    const around = `around:${radius},${seed.lat.toFixed(4)},${seed.lon.toFixed(4)}`;
    return [
      `nwr(${around})["place"~"city|town|village"]["name"];`,
      `nwr(${around})["tourism"~"attraction|viewpoint|museum|zoo|theme_park"]["name"];`,
      `nwr(${around})["boundary"="national_park"]["name"];`,
      `nwr(${around})["leisure"="nature_reserve"]["name"];`,
      `nwr(${around})["aeroway"="aerodrome"]["name"];`,
      `nwr(${around})["tourism"~"hotel|guest_house|hostel|camp_site|caravan_site"];`,
      `nwr(${around})["amenity"~"restaurant|cafe|fuel"];`
    ].join('');
  }).join('\n');
  return `[out:json][timeout:12][maxsize:25165824];\n(\n${clauses}\n);\nout center tags 420;`;
}

function evidenceTags(tags = {}) {
  const result = new Set();
  const text = Object.entries(tags).map(([key, value]) => `${key}=${value}`).join(' ').toLowerCase();
  if (/national_park|nature_reserve|viewpoint|natural=|mountain|peak|waterfall|forest/.test(text)) result.add('natuur');
  if (/peak|mountain|alpine|volcano/.test(text)) result.add('bergen');
  if (/beach|coast|bay|island|sea|lake|water/.test(text)) { result.add('kust'); result.add('zwemmen'); }
  if (/museum|heritage|historic|archaeological|castle|monument|wikidata|wikipedia/.test(text)) result.add('cultuur');
  if (/restaurant|cafe|market|winery|brewery/.test(text)) result.add('eten');
  if (/camp_site|caravan_site|motorhome/.test(text)) result.add('camper');
  if (/theme_park|zoo|playground|family/.test(text)) result.add('kinderen');
  if (/scenic|viewpoint|mountain_pass/.test(text)) result.add('motor');
  if (/hiking|walking|trail|route=hiking/.test(text)) result.add('wandelen');
  return [...result];
}

function roleOf(tags = {}) {
  if (tags.aeroway === 'aerodrome') return 'gateway';
  if (tags.place) return 'settlement';
  if (['hotel', 'guest_house', 'hostel', 'camp_site', 'caravan_site'].includes(tags.tourism)) return 'accommodation';
  if (['restaurant', 'cafe', 'fuel'].includes(tags.amenity)) return 'service';
  return 'highlight';
}

export function normalizeAnchorElements(payload) {
  const seen = new Set();
  return (payload?.elements || []).map(element => {
    const point = pointOf(element); const tags = element.tags || {}; const name = tags['name:nl'] || tags.name || tags.brand;
    if (!point || !name) return null;
    const id = `${element.type}-${element.id}`;
    if (seen.has(id)) return null;
    seen.add(id);
    const evidence = evidenceTags(tags);
    const population = finite(tags.population);
    const importance = roleOf(tags) === 'gateway' ? 82
      : tags.place === 'city' ? 78 : tags.place === 'town' ? 66
        : roleOf(tags) === 'highlight' ? 72 : roleOf(tags) === 'accommodation' ? 44 : 36;
    return {
      id, providerId: id, name, point, role: roleOf(tags), tags: evidence, rawTags: tags,
      importance: Math.min(100, importance + (population ? Math.min(12, Math.log10(Math.max(10, population)) * 2) : 0)),
      confidence: evidence.length || tags.place || tags.aeroway ? 'provider-evidence' : 'limited',
      provider: 'OpenStreetMap Overpass', sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      fetchedAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

function nearestSettlement(anchor, settlements) {
  return settlements.map(item => ({ item, distance: haversineKm(anchor.point, item.point) || Infinity })).sort((a, b) => a.distance - b.distance)[0]?.item || null;
}

function activityFrom(anchor) {
  const type = anchor.tags[0] || 'cultuur';
  return {
    type,
    title: `Bezoek ${anchor.name}; controleer toegang en openingstijden bij de bron.`,
    rainAlternative: `Kies een beschutte activiteit nabij ${anchor.name} wanneer het weer of de toegang tegenvalt.`,
    tags: anchor.tags.length ? anchor.tags : ['cultuur'],
    sourceUrl: anchor.sourceUrl,
    provider: anchor.provider
  };
}

function profileFromCluster(trip, resolution, seed, anchors, index, allAnchors = anchors) {
  const origin = resolveOrigin(trip); const settlements = anchors.filter(item => item.role === 'settlement');
  const bases = settlements.slice().sort((a, b) => (haversineKm(a.point, seed.point) || Infinity) - (haversineKm(b.point, seed.point) || Infinity)).slice(0, Math.max(2, Math.min(6, Math.ceil(trip.days / 3))));
  if (!bases.some(item => item.id === seed.id)) bases.unshift(seed);
  const localHighlights = anchors.filter(item => item.role === 'highlight');
  const distantHighlights = allAnchors.filter(item => item.role === 'highlight' && !localHighlights.some(local => local.id === item.id));
  const highlights = [...localHighlights, ...distantHighlights].sort((a, b) => b.importance - a.importance).slice(0, 16);
  const tags = [...new Set([...anchors.flatMap(item => item.tags), ...highlights.flatMap(item => item.tags)])];
  const accommodations = anchors.filter(item => item.role === 'accommodation').length;
  const services = anchors.filter(item => item.role === 'service').length;
  const gateways = anchors.filter(item => item.role === 'gateway');
  const basePoints = bases.slice(0, 6).map(item => ({ name: item.name, ...item.point, providerId: item.providerId, sourceUrl: item.sourceUrl }));
  const targetPoint = basePoints[0] || seed.point;
  const distanceDirect = origin ? haversineKm(origin, targetPoint) : haversineKm(resolution?.point, targetPoint);
  const multimodal = trip.travelMode !== 'direct';
  const distanceKm = Math.max(1, Math.round((distanceDirect || 250) * (multimodal ? 1 : 1.16)));
  const profileHighlights = highlights.map((item, highlightIndex) => {
    const base = nearestSettlement(item, bases) || seed;
    return {
      id: item.id, name: item.name, baseName: base.name, point: item.point, overnightPoint: base.point,
      sequence: highlightIndex + 1, priority: Math.max(4, Math.min(10, Math.round(item.importance / 10))),
      minimumTripDays: 3 + Math.floor(highlightIndex / 2), minimumNights: highlightIndex < 3 ? 2 : 1,
      tags: item.tags, activity: activityFrom(item).title, rainAlternative: activityFrom(item).rainAlternative,
      evidence: `${item.provider} · ${item.providerId}`, gateway: false, remote: false, sourceUrl: item.sourceUrl
    };
  });
  profileHighlights.unshift({
    id: seed.id, name: seed.name, baseName: seed.name, point: seed.point, overnightPoint: seed.point,
    sequence: 0, priority: 9, minimumTripDays: 3, minimumNights: 1, tags: seed.tags,
    activity: `Gebruik ${seed.name} als toegang en eerste oriëntatie.`, rainAlternative: `Plan aankomstbuffer in ${seed.name}.`,
    evidence: `${seed.provider} · ${seed.providerId}`, gateway: true, sourceUrl: seed.sourceUrl
  });
  const neutral = 5;
  const family = tags.includes('kinderen') ? 8 : neutral;
  const motorcycle = tags.includes('motor') || tags.includes('bergen') ? 8 : neutral;
  const camper = tags.includes('camper') || accommodations >= 4 ? 8 : neutral;
  return {
    id: `dynamic-${slug(resolution?.name || seed.name)}-${slug(seed.name)}-${index + 1}`,
    name: resolution && resolution.geographicType !== 'city' ? `${seed.name} · ${resolution.name}` : `${seed.name} & omgeving`,
    country: resolution?.displayName || resolution?.name || 'Dynamisch ontdekt gebied',
    distanceKm, driveHours: Number((distanceKm / (multimodal ? 780 : 76)).toFixed(1)),
    nightMid: 125, activityDaily: 48, toll: 0, tags,
    season: [], family, motorcycle, camper, weather: neutral, crowds: neutral,
    summary: `${anchors.length} actuele providerankers rond ${seed.name}; ${highlights.length} highlights, ${accommodations} verblijfsignalen en ${services} services gevonden.`,
    pros: [`${highlights.length} evidence-backed highlights`, `${bases.length} mogelijke uitvalsbases`, `${gateways.length || 1} toegangssignaal`],
    cons: ['Prijzen en beschikbaarheid zijn niet bevestigd', 'Neutrale kenmerken blijven laag-vertrouwen totdat bronnen bewijs leveren'],
    routeStops: basePoints.slice(1).map((base, stopIndex) => ({ ...base, progress: (stopIndex + 1) / basePoints.length })),
    bases: basePoints.length ? basePoints : [{ name: seed.name, ...seed.point }],
    highlights: profileHighlights,
    activities: highlights.slice(0, 8).map(activityFrom),
    dynamic: true, discoverySource: 'OpenStreetMap Nominatim + Overpass', discoveredAt: new Date().toISOString(),
    evidence: {
      anchors: anchors.length, highlights: highlights.length, settlements: settlements.length,
      accommodations, services, gateways: gateways.length, neutralFields: ['weather', 'crowds', ...(family === neutral ? ['family'] : []), ...(motorcycle === neutral ? ['motorcycle'] : []), ...(camper === neutral ? ['camper'] : [])]
    },
    provider: { name: 'OpenStreetMap', resolutionId: resolution?.providerId || null, sourceUrl: resolution?.sourceUrl || seed.sourceUrl, fetchedAt: new Date().toISOString(), confidence: anchors.length >= 8 ? 'reasonable' : 'limited' },
    roadDistanceFactor: 1.16
  };
}

export function clusterDestinationRegions(trip, resolution, anchors, { limit = Number.POSITIVE_INFINITY } = {}) {
  const settlements = anchors.filter(item => item.role === 'settlement').sort((a, b) => b.importance - a.importance);
  const gateways = anchors.filter(item => item.role === 'gateway').sort((a, b) => b.importance - a.importance);
  const seeds = [...gateways.slice(0, 2), ...settlements].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
  const radiusKm = Math.max(140, Math.min(600, trip.maxDrive * 90));
  const chosenSeeds = [];
  for (const candidate of seeds) {
    if (!chosenSeeds.some(existing => (haversineKm(existing.point, candidate.point) || 0) < radiusKm * .35)) chosenSeeds.push(candidate);
    if (chosenSeeds.length >= limit) break;
  }
  if (!chosenSeeds.length && resolution?.point) {
    chosenSeeds.push({ id: resolution.id, providerId: resolution.providerId || resolution.id, name: resolution.name, point: resolution.point, role: 'settlement', tags: [], importance: 60, confidence: resolution.confidence, provider: resolution.provider, sourceUrl: resolution.sourceUrl });
  }
  return chosenSeeds.map((seed, index) => {
    const cluster = anchors.filter(anchor => (haversineKm(seed.point, anchor.point) || Infinity) <= radiusKm);
    return profileFromCluster(trip, resolution, seed, cluster.length ? cluster : [seed], index, anchors);
  });
}

export function buildDiscoveryCacheKey(trip, { cursor = 0, resolution = null } = {}) {
  const origin = resolveOrigin(trip);
  const identity = {
    schema: DISCOVERY_SCHEMA, engine: ENGINE_VERSION, cursor,
    origin: origin ? [Number(origin.lat.toFixed(4)), Number(origin.lon.toFixed(4))] : trip.origin,
    query: String(trip.destinationQuery || '').trim().toLocaleLowerCase('nl-NL'),
    resolution: resolution ? { id: resolution.providerId || resolution.id, type: resolution.geographicType, bounds: resolution.bounds, point: resolution.point } : null,
    travelMode: trip.travelMode, transport: trip.transport, routeTopology: trip.routeTopology,
    days: trip.days, startMonth: String(trip.startDate || '').slice(0, 7), maxDrive: trip.maxDrive,
    maxChanges: trip.maxChanges, preferences: [...(trip.preferences || [])].sort().map(id => [id, trip.preferenceWeights?.[id] || 2])
  };
  return `reisslim.destination-discovery.v${DISCOVERY_SCHEMA}:${encodeURIComponent(JSON.stringify(identity))}`;
}

async function fetchOverpass(query, endpoints, fetchImpl, timeoutMs) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const body = new URLSearchParams({ data: query }).toString();
      const payload = await fetchJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: 'application/json' }, body }, fetchImpl, timeoutMs);
      return { payload, endpoint };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Geen Overpass-provider beschikbaar.');
}

export async function discoverDestinationBatch(trip, {
  cursor = 0, excludedIds = [], fetchImpl = globalThis.fetch, endpoints = OVERPASS_ENDPOINTS,
  storage = globalThis.localStorage, resolution: suppliedResolution = null, timeoutMs = 15000
} = {}) {
  if (typeof fetchImpl !== 'function') return { destinations: [], anchors: [], live: false, reason: 'Dynamic destination discovery is currently unavailable. No unrelated fallback trips have been generated.' };
  const resolution = suppliedResolution || (trip.destinationQuery ? await resolveDestination(trip.destinationQuery, { fetchImpl }) : null);
  if (trip.destinationQuery && !resolution) return { destinations: [], anchors: [], live: false, reason: 'De opgegeven bestemming kon niet dynamisch worden gevonden. Er zijn geen ongerelateerde fallbackreizen gegenereerd.' };
  const query = buildDiscoveryQuery(trip, cursor, resolution);
  if (!query.includes('nwr(')) return { destinations: [], anchors: [], live: false, reason: 'Dynamic destination discovery is currently unavailable. No unrelated fallback trips have been generated.' };
  const cacheKey = buildDiscoveryCacheKey(trip, { cursor, resolution });
  try {
    const record = JSON.parse(storage?.getItem(cacheKey) || 'null');
    if (record?.payload && Date.now() - record.savedAt < 14 * 24 * 60 * 60 * 1000) {
      const anchors = normalizeAnchorElements(record.payload);
      const destinations = clusterDestinationRegions(trip, resolution, anchors).filter(item => !excludedIds.includes(item.id));
      destinations.forEach(item => { item.discoveryCache = { cached: true, ageMs: Date.now() - record.savedAt, key: cacheKey }; });
      return { destinations, anchors, live: true, cached: true, cacheAgeMs: Date.now() - record.savedAt, source: record.endpoint || 'OpenStreetMap Overpass', resolution };
    }
  } catch { /* exact-query cache is optional */ }
  try {
    const { payload, endpoint } = await fetchOverpass(query, endpoints, fetchImpl, timeoutMs);
    try { storage?.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), endpoint, payload })); } catch { /* optional */ }
    const anchors = normalizeAnchorElements(payload);
    const destinations = clusterDestinationRegions(trip, resolution, anchors).filter(item => !excludedIds.includes(item.id));
    destinations.forEach(item => { item.discoveryCache = { cached: false, ageMs: 0, key: cacheKey }; });
    if (!destinations.length) return { destinations: [], anchors, live: false, reason: 'Geen bruikbare dynamische regio kon uit de huidige providerdata worden opgebouwd. Er zijn geen catalogusreizen toegevoegd.', resolution };
    return { destinations, anchors, live: true, cached: false, source: endpoint, resolution };
  } catch (error) {
    return { destinations: [], anchors: [], live: false, reason: 'Dynamic destination discovery is currently unavailable. No unrelated fallback trips have been generated.', error: error?.name || 'provider-error', resolution };
  }
}

export function normalizeDiscoveredDestinations(trip, payload, options = {}) {
  const anchors = normalizeAnchorElements(payload);
  return clusterDestinationRegions(trip, options.resolution || null, anchors, options.limit ? { limit: options.limit } : {}).filter(item => !(options.excludedIds || []).includes(item.id));
}

export const destinationDiscoveryConfig = Object.freeze({
  nominatimEndpoint: NOMINATIM_ENDPOINT,
  overpassEndpoints: OVERPASS_ENDPOINTS,
  schema: DISCOVERY_SCHEMA,
  attribution: '© OpenStreetMap-bijdragers, ODbL',
  coverage: 'zero-catalogue-global-staged'
});

export const cloneDiscoveryValue = clone;
