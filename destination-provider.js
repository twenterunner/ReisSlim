import { ENGINE_VERSION, validCoordinate } from './config.js';
import { resolveOrigin } from './trip-model.js';
import { haversineKm } from './route-engine.js';
import { geocodePlace, normalizeNominatimPlace } from './geocoding-provider.js';
import { bootstrapSettlementAnchors, enrichSettlementHighlights } from './discovery-bootstrap-provider.js';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const DISCOVERY_SCHEMA = 6;
const GOLDEN_ANGLE = 137.507764;
const DISCOVERY_DEADLINE_MS = 6500;

const clone = value => JSON.parse(JSON.stringify(value));
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

function halton(index, base) {
  let fraction = 1; let result = 0; let value = Math.max(1, index);
  while (value > 0) { fraction /= base; result += fraction * (value % base); value = Math.floor(value / base); }
  return result;
}

export function discoverySeeds(trip, cursor = 0, count = 8, resolution = null) {
  const origin = resolveOrigin(trip);
  const bounds = resolution?.bounds;
  if (bounds) {
    const [south, north, west, east] = bounds;
    const firstPass = [[.5, .5], [.2, .2], [.25, .75], [.75, .75]];
    return Array.from({ length: count }, (_, index) => {
      const sequence = cursor * count + index;
      const [latFraction, lonFraction] = cursor === 0 && firstPass[index]
        ? firstPass[index]
        : [.08 + halton(sequence + 1, 2) * .84, .08 + halton(sequence + 1, 3) * .84];
      return {
        lat: south + (north - south) * latFraction,
        lon: west + (east - west) * lonFraction,
        sequence,
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

export function normalizeDestinationResolution(query, match) {
  return normalizeNominatimPlace(query, match);
}

async function fetchJson(url, options, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const externalSignal = options?.signal;
  const abort = () => controller.abort();
  externalSignal?.addEventListener?.('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Provider ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abort);
  }
}

export async function resolveDestination(query, options = {}) {
  const result = await geocodePlace(query, {
    fetchImpl: options.fetchImpl,
    storage: options.storage,
    nominatimEndpoint: options.endpoint,
    photonEndpoint: options.photonEndpoint,
    nominatimTimeoutMs: options.timeoutMs,
    photonTimeoutMs: options.photonTimeoutMs,
    signal: options.signal
  });
  return result.resolution ? { ...result.resolution, geocodingStatus: result.status, geocodingWarnings: result.warnings } : null;
}

export function recommendAccessMode(trip, resolution) {
  if (trip?.travelMode !== 'direct' || !resolution?.point) return null;
  const origin = resolveOrigin(trip);
  const distanceKm = origin ? haversineKm(origin, resolution.point) : null;
  if (!Number.isFinite(distanceKm)) return null;
  const localRoadReachKm = Math.max(1200, Number(trip.maxDrive || 5) * 65 * Math.max(2, Math.floor(Number(trip.days || 7) * .35)));
  if (distanceKm <= localRoadReachKm) return null;
  const modes = {
    car: { travelMode: 'fly-drive', transport: 'car', label: 'Fly-drive' },
    motorcycle: { travelMode: 'fly-ride', transport: 'motorcycle', label: 'Fly-ride' },
    motorhome: { travelMode: 'fly-camper', transport: 'motorhome', label: 'Fly-camper' }
  };
  const recommendation = modes[trip.transport];
  return {
    required: true,
    automatic: Boolean(recommendation),
    distanceKm: Math.round(distanceKm),
    roadReachKm: Math.round(localRoadReachKm),
    ...(recommendation || {}),
    reason: recommendation
      ? `${resolution.name} ligt hemelsbreed circa ${Math.round(distanceKm).toLocaleString('nl-NL')} km van ${trip.origin}; ${recommendation.label} houdt de ingestelde dagelijkse rijlimiet beschikbaar voor de rondreis ter plaatse.`
      : `${resolution.name} ligt buiten een realistische rechtstreekse wegcorridor voor deze reisduur. Kies een passende toegang of een dichterbij gelegen bestemming.`
  };
}

function bboxOf(resolution) {
  if (!resolution?.bounds) return null;
  const [south, north, west, east] = resolution.bounds;
  return `${south.toFixed(4)},${west.toFixed(4)},${north.toFixed(4)},${east.toFixed(4)}`;
}

function boundaryIsBroad(resolution) {
  if (!resolution?.bounds) return ['country', 'state', 'region', 'administrative'].includes(String(resolution?.geographicType || '').toLowerCase());
  const [south, north, west, east] = resolution.bounds;
  return north - south > 3 || east - west > 4;
}

function pointWithinBounds(point, bounds) {
  if (!validCoordinate(point) || !Array.isArray(bounds) || bounds.length !== 4) return true;
  const [south, north, west, east] = bounds.map(Number);
  return point.lat >= south && point.lat <= north && point.lon >= west && point.lon <= east;
}

function anchorMatchesResolution(anchor, resolution) {
  if (!resolution) return true;
  const expectedCountry = String(resolution.countryCode || '').trim().toUpperCase();
  const actualCountry = String(anchor.countryCode || '').trim().toUpperCase();
  if (expectedCountry && actualCountry && expectedCountry !== actualCountry) return false;
  return !resolution.bounds || pointWithinBounds(anchor.point, resolution.bounds);
}

export function buildDiscoveryQueries(trip, cursor = 0, resolution = null) {
  const bbox = bboxOf(resolution);
  const broad = boundaryIsBroad(resolution);
  const seeds = discoverySeeds(trip, cursor, bbox ? 4 : 3, resolution);
  if (!seeds.length) return [];
  const settlementClauses = bbox && !broad
    ? [
      `nwr["place"="city"]["name"](${bbox});`,
      `nwr["place"="town"]["name"](${bbox});`,
      `nwr["aeroway"="aerodrome"]["name"](${bbox});`
    ]
    : seeds.map(seed => `nwr(around:90000,${seed.lat.toFixed(4)},${seed.lon.toFixed(4)})["place"~"city|town|village"]["name"];`);
  const enrichmentClauses = seeds.flatMap(seed => {
    const around = `around:36000,${seed.lat.toFixed(4)},${seed.lon.toFixed(4)}`;
    return [
      `nwr(${around})["tourism"~"attraction|viewpoint|museum"]["name"];`,
      `nwr(${around})["boundary"="national_park"]["name"];`,
      `nwr(${around})["leisure"="nature_reserve"]["name"];`,
      `nwr(${around})["tourism"~"hotel|guest_house|camp_site|caravan_site"]["name"];`
    ];
  });
  return [
    { stage: 'anchors', query: `[out:json][timeout:6][maxsize:8388608];\n(\n${settlementClauses.join('\n')}\n);\nout center tags 120;` },
    { stage: 'enrichment', query: `[out:json][timeout:6][maxsize:8388608];\n(\n${enrichmentClauses.join('\n')}\n);\nout center tags 180;` }
  ];
}

export function buildDiscoveryQuery(trip, cursor = 0, resolution = null) {
  return buildDiscoveryQueries(trip, cursor, resolution)[0]?.query || '';
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
      countryCode: String(tags['addr:country'] || tags['is_in:country_code'] || tags['ISO3166-1'] || '').trim().toUpperCase() || null,
      importance: Math.min(100, importance + (population ? Math.min(12, Math.log10(Math.max(10, population)) * 2) : 0)),
      confidence: evidence.length || tags.place || tags.aeroway ? 'provider-evidence' : 'limited',
      provider: 'OpenStreetMap Overpass', sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      fetchedAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

function resolutionAnchor(resolution) {
  if (!resolution?.point) return null;
  const geographicType = String(resolution.geographicType || '').toLowerCase();
  const localTypes = ['city', 'town', 'village', 'municipality', 'locality', 'island', 'national_park', 'park'];
  if (!localTypes.includes(geographicType) && boundaryIsBroad(resolution)) return null;
  return {
    id: `resolution-${slug(resolution.providerId || resolution.id)}`,
    providerId: resolution.providerId || resolution.id,
    name: resolution.name,
    point: resolution.point,
    role: 'settlement',
    tags: [],
    rawTags: { place: geographicType || 'place' },
    importance: 74,
    confidence: resolution.confidence || 'limited',
    provider: resolution.provider,
    sourceUrl: resolution.sourceUrl,
    countryCode: resolution.countryCode || null,
    countryName: resolution.countryName || null,
    fetchedAt: resolution.fetchedAt || new Date().toISOString()
  };
}

function mergeAnchors(...groups) {
  const merged = [];
  for (const anchor of groups.flat()) {
    if (!anchor?.point || merged.some(existing => existing.providerId === anchor.providerId || (existing.role === anchor.role && (haversineKm(existing.point, anchor.point) || Infinity) < 2))) continue;
    merged.push(anchor);
  }
  return merged;
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
  const localIds = new Set(localHighlights.map(item => item.id));
  const contextualHighlights = allAnchors.filter(item => item.role === 'highlight' && !localIds.has(item.id) && item.importance >= 65)
    .sort((a, b) => b.importance - a.importance || (haversineKm(seed.point, a.point) || Infinity) - (haversineKm(seed.point, b.point) || Infinity))
    .slice(0, 8);
  const highlights = [...localHighlights.sort((a, b) => b.importance - a.importance), ...contextualHighlights].slice(0, 16);
  const tags = [...new Set([...anchors.flatMap(item => item.tags), ...highlights.flatMap(item => item.tags)])];
  const accommodations = anchors.filter(item => item.role === 'accommodation').length;
  const services = anchors.filter(item => item.role === 'service').length;
  const gateways = anchors.filter(item => item.role === 'gateway');
  const providerNames = [...new Set(anchors.map(item => item.provider).filter(Boolean))];
  const basePoints = bases.slice(0, 6).map(item => ({ name: item.name, ...item.point, providerId: item.providerId, sourceUrl: item.sourceUrl }));
  const targetPoint = basePoints[0] || seed.point;
  const distanceDirect = origin ? haversineKm(origin, targetPoint) : haversineKm(resolution?.point, targetPoint);
  const multimodal = trip.travelMode !== 'direct';
  const distanceKm = Math.max(1, Math.round((distanceDirect || 250) * (multimodal ? 1 : 1.16)));
  const profileHighlights = highlights.map((item, highlightIndex) => {
    const base = nearestSettlement(item, bases) || seed;
    const contextOnly = !localIds.has(item.id);
    const distanceFromRegionKm = Math.round(haversineKm(seed.point, item.point) || 0);
    return {
      id: item.id, name: item.name, baseName: base.name, point: item.point, overnightPoint: base.point,
      sequence: highlightIndex + 1, priority: Math.max(4, Math.min(10, Math.round(item.importance / 10))),
      minimumTripDays: 3 + Math.floor(highlightIndex / 2), minimumNights: 1,
      tags: item.tags, activity: activityFrom(item).title, rainAlternative: activityFrom(item).rainAlternative,
      evidence: `${item.provider} · ${item.providerId}`, gateway: false, remote: false, sourceUrl: item.sourceUrl,
      contextOnly, distanceFromRegionKm
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
    dynamic: true, discoverySource: providerNames.join(' + ') || resolution?.provider || 'Dynamische providerdata', discoveredAt: new Date().toISOString(),
    evidence: {
      anchors: anchors.length, highlights: highlights.length, settlements: settlements.length,
      accommodations, services, gateways: gateways.length, neutralFields: ['weather', 'crowds', ...(family === neutral ? ['family'] : []), ...(motorcycle === neutral ? ['motorcycle'] : []), ...(camper === neutral ? ['camper'] : [])]
    },
    provider: { name: providerNames.join(' + ') || resolution?.provider || 'Dynamische providerdata', resolutionId: resolution?.providerId || null, sourceUrl: resolution?.sourceUrl || seed.sourceUrl, fetchedAt: new Date().toISOString(), confidence: anchors.length >= 8 ? 'reasonable' : 'limited' },
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
  if (!chosenSeeds.length && resolution?.point && !boundaryIsBroad(resolution)) {
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

async function fetchOverpass(query, endpoints, fetchImpl, timeoutMs, deadlineAt, { preferredEndpoint = null, signal } = {}) {
  let lastError = null;
  const ordered = preferredEndpoint
    ? [preferredEndpoint, ...endpoints.filter(endpoint => endpoint !== preferredEndpoint)]
    : endpoints;
  for (const endpoint of ordered) {
    if (signal?.aborted) throw new DOMException('Discovery cancelled', 'AbortError');
    const remainingMs = Math.max(0, deadlineAt - Date.now());
    if (remainingMs < 250) break;
    try {
      const body = new URLSearchParams({ data: query }).toString();
      const payload = await fetchJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: 'application/json' }, body, signal }, fetchImpl, Math.min(timeoutMs, remainingMs));
      return { payload, endpoint };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Geen Overpass-provider beschikbaar.');
}

function typedDestinationFallback(trip, resolution, excludedIds, warning) {
  if (!resolution || boundaryIsBroad(resolution)) return [];
  return clusterDestinationRegions(trip, resolution, [])
    .filter(item => !excludedIds.includes(item.id))
    .map(item => ({
      ...item,
      summary: `${resolution.displayName} is rechtstreeks door ${resolution.provider} gevonden. Detailankers zijn tijdelijk niet beschikbaar; deze optie gebruikt daarom alleen geverifieerde bestemmingscoordinaten en neutrale aannames.`,
      pros: ['Getypte bestemming is rechtstreeks gegeocodeerd', 'Geen ongerelateerde catalogusbestemming toegevoegd'],
      cons: [warning || 'POI- en verblijfsverrijking is tijdelijk niet beschikbaar', 'Regio-indeling en beschikbaarheid vragen aanvullende live data'],
      dynamic: true,
      degraded: true,
      discoverySource: `${resolution.provider} - beperkte live modus`,
      evidence: { ...item.evidence, anchors: 1, highlights: 0, settlements: 1, providerWarnings: [warning].filter(Boolean) },
      provider: {
        name: resolution.provider, resolutionId: resolution.providerId || resolution.id,
        sourceUrl: resolution.sourceUrl, fetchedAt: resolution.fetchedAt || new Date().toISOString(), confidence: 'limited'
      }
    }));
}

export async function discoverDestinationBatch(trip, {
  cursor = 0, excludedIds = [], fetchImpl = globalThis.fetch, endpoints = OVERPASS_ENDPOINTS,
  storage: suppliedStorage, resolution: suppliedResolution = null, timeoutMs = 3500,
  deadlineMs = DISCOVERY_DEADLINE_MS, signal
} = {}) {
  let storage = suppliedStorage;
  if (storage === undefined) {
    try { storage = globalThis.localStorage || null; } catch { storage = null; }
  }
  const resolution = suppliedResolution || (trip.destinationQuery
    ? await resolveDestination(trip.destinationQuery, { fetchImpl, storage, signal })
    : null);
  if (trip.destinationQuery && !resolution) return {
    destinations: [], anchors: [], live: false, outcome: 'unresolved-destination',
    reason: 'De opgegeven bestemming kon door geen geocodingprovider worden gevonden. Controleer de spelling of probeer opnieuw.'
  };
  const accessRecommendation = recommendAccessMode(trip, resolution);
  const stages = buildDiscoveryQueries(trip, cursor, resolution);
  const cacheKey = buildDiscoveryCacheKey(trip, { cursor, resolution });
  let cacheRecord = null;
  try {
    cacheRecord = JSON.parse(storage?.getItem(cacheKey) || 'null');
    const maximumAge = cacheRecord?.degraded ? 30 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;
    if (cacheRecord && Date.now() - cacheRecord.savedAt < maximumAge) {
      const anchors = Array.isArray(cacheRecord.anchors) ? cacheRecord.anchors : normalizeAnchorElements(cacheRecord.payload);
      const allCandidates = anchors.length
        ? clusterDestinationRegions(trip, resolution, anchors)
        : typedDestinationFallback(trip, resolution, [], cacheRecord.warning);
      const destinations = allCandidates.filter(item => !excludedIds.includes(item.id));
      destinations.forEach(item => { item.discoveryCache = { cached: true, ageMs: Date.now() - cacheRecord.savedAt, key: cacheKey }; });
      return {
        destinations, anchors, live: true, cached: true, degraded: Boolean(cacheRecord.degraded),
        outcome: destinations.length ? (cacheRecord.degraded ? 'degraded' : 'success') : 'no-unseen-results',
        reason: destinations.length ? null : 'Alle dynamisch gevonden regio\'s zijn al getoond. Kies Toon meer reisopties later opnieuw of wijzig de zoekrichting.',
        cacheAgeMs: Date.now() - cacheRecord.savedAt, source: cacheRecord.endpoint || 'Dynamische providercache',
        warnings: cacheRecord.warnings || [cacheRecord.warning].filter(Boolean), resolution, accessRecommendation
      };
    }
  } catch { /* exact-query cache is optional */ }

  const directFallback = warning => typedDestinationFallback(trip, resolution, excludedIds, warning);
  if (!stages.length || typeof fetchImpl !== 'function') {
    const destinations = directFallback('Live ankerproviders zijn niet beschikbaar.');
    return destinations.length
      ? { destinations, anchors: [], live: true, degraded: true, outcome: 'degraded', source: resolution?.provider, warnings: ['Live ankerproviders zijn niet beschikbaar.'], resolution, accessRecommendation }
      : { destinations: [], anchors: [], live: false, outcome: 'provider-unavailable', reason: 'Dynamische bestemmingontdekking is tijdelijk niet beschikbaar; er zijn geen ongerelateerde reizen toegevoegd.', resolution, accessRecommendation };
  }

  const seeds = discoverySeeds(trip, cursor, resolution?.bounds ? 4 : 3, resolution);
  const needsBootstrap = !resolution || boundaryIsBroad(resolution);
  const bootstrapPromise = needsBootstrap
    ? bootstrapSettlementAnchors(seeds, { fetchImpl, maxSeeds: resolution?.bounds ? 4 : 3, timeoutMs: Math.min(4500, deadlineMs), signal })
    : Promise.resolve({ anchors: [], warnings: [], provider: null });
  const deadlineAt = Date.now() + Math.max(1000, deadlineMs);
  const elements = [];
  const usedEndpoints = [];
  const warnings = [];
  let preferredEndpoint = null;
  for (const stage of stages) {
    try {
      const { payload, endpoint } = await fetchOverpass(stage.query, endpoints, fetchImpl, timeoutMs, deadlineAt, { preferredEndpoint, signal });
      elements.push(...(payload?.elements || []));
      usedEndpoints.push(endpoint);
      preferredEndpoint = endpoint;
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`${stage.stage}: ${error?.name === 'AbortError' ? 'provider-timeout' : String(error?.message || 'provider-error')}`);
      if (stage.stage === 'anchors') break;
    }
  }
  const bootstrap = await bootstrapPromise;
  warnings.push(...bootstrap.warnings);
  const payload = { elements };
  const resolvedAnchor = resolutionAnchor(resolution);
  const bootstrapAnchors = bootstrap.anchors.filter(anchor => anchorMatchesResolution(anchor, resolution));
  const normalizedProviderAnchors = normalizeAnchorElements(payload).filter(anchor => anchorMatchesResolution(anchor, resolution));
  const boundedProviderAnchors = boundaryIsBroad(resolution) && bootstrapAnchors.length
    ? normalizedProviderAnchors.filter(anchor => bootstrapAnchors.some(base => (haversineKm(anchor.point, base.point) || Infinity) <= 120))
    : normalizedProviderAnchors;
  let anchors = mergeAnchors(boundedProviderAnchors, bootstrapAnchors, resolvedAnchor ? [resolvedAnchor] : []);
  if (!anchors.some(item => item.role === 'highlight') && anchors.some(item => item.role === 'settlement')) {
    const wikipedia = await enrichSettlementHighlights(
      anchors.filter(item => item.role === 'settlement').sort((a, b) => b.importance - a.importance),
      { fetchImpl, maxBases: trip.days >= 8 ? 3 : 2, timeoutMs: 4000, signal }
    );
    anchors = mergeAnchors(anchors, wikipedia.anchors.filter(anchor => anchorMatchesResolution(anchor, resolution)));
    warnings.push(...wikipedia.warnings);
  }
  const sources = [...new Set(anchors.map(item => item.provider).filter(Boolean))];
  let allCandidates = clusterDestinationRegions(trip, resolution, anchors);
  if (!allCandidates.length && resolution) allCandidates = typedDestinationFallback(trip, resolution, [], warnings[0]);
  let destinations = allCandidates.filter(item => !excludedIds.includes(item.id));
  destinations.forEach(item => {
    item.discoveryCache = { cached: false, ageMs: 0, key: cacheKey };
    if (warnings.length) {
      item.degraded = true;
      item.evidence.providerWarnings = warnings;
      item.cons = [...new Set([...item.cons, 'Een deel van de live verrijking reageerde niet binnen de tijdslimiet'])];
    }
  });
  const degraded = Boolean(warnings.length) || !elements.length;
  if (destinations.length) {
    try {
      storage?.setItem(cacheKey, JSON.stringify({
        savedAt: Date.now(), endpoint: sources.join(' + ') || resolution?.provider || 'Dynamische providerdata',
        payload, anchors, degraded, warnings
      }));
    } catch { /* optional */ }
    return {
      destinations, anchors, live: true, cached: false, degraded, outcome: degraded ? 'degraded' : 'success',
      source: sources.join(' + ') || usedEndpoints.join(' + ') || resolution?.provider || 'Dynamische providerdata',
      warnings, resolution, accessRecommendation
    };
  }
  if (allCandidates.length) return {
    destinations: [], anchors, live: true, degraded, outcome: 'no-unseen-results',
    reason: 'Alle dynamisch gevonden regio\'s zijn al getoond; dit is geen providerfout.',
    warnings, resolution, accessRecommendation
  };
  if (cacheRecord && Date.now() - cacheRecord.savedAt < 90 * 24 * 60 * 60 * 1000) {
    const staleAnchors = Array.isArray(cacheRecord.anchors) ? cacheRecord.anchors : normalizeAnchorElements(cacheRecord.payload);
    const staleDestinations = clusterDestinationRegions(trip, resolution, staleAnchors).filter(item => !excludedIds.includes(item.id));
    staleDestinations.forEach(item => {
      item.degraded = true;
      item.discoveryCache = { cached: true, stale: true, ageMs: Date.now() - cacheRecord.savedAt, key: cacheKey };
      item.cons = [...new Set([...item.cons, 'Live providers reageerden niet; exact passende oudere evidence wordt getoond'])];
    });
    if (staleDestinations.length) return {
      destinations: staleDestinations, anchors: staleAnchors, live: true, cached: true, stale: true, degraded: true,
      outcome: 'degraded', source: cacheRecord.endpoint || 'Exacte oudere providercache', warnings, resolution, accessRecommendation
    };
  }
  return {
    destinations: [], anchors, live: false, outcome: 'provider-unavailable',
    reason: resolution
      ? 'De bestemming is gevonden, maar de onafhankelijke ankerproviders konden geen routeerbare plaatsen leveren. Probeer opnieuw.'
      : 'Dynamische plaatsontdekking reageert tijdelijk niet. Overpass en de onafhankelijke settlementprovider leverden geen routeerbare plaatsen; er zijn geen ongerelateerde reizen toegevoegd.',
    error: warnings[0] || 'provider-error', resolution, accessRecommendation
  };
}

export function normalizeDiscoveredDestinations(trip, payload, options = {}) {
  const anchors = normalizeAnchorElements(payload);
  return clusterDestinationRegions(trip, options.resolution || null, anchors, options.limit ? { limit: options.limit } : {}).filter(item => !(options.excludedIds || []).includes(item.id));
}

export const destinationDiscoveryConfig = Object.freeze({
  geocodingProviders: ['OpenStreetMap Nominatim', 'Photon (OpenStreetMap)'],
  overpassEndpoints: OVERPASS_ENDPOINTS,
  independentAnchorProviders: ['Photon (OpenStreetMap)', 'Wikipedia GeoSearch'],
  schema: DISCOVERY_SCHEMA,
  attribution: '© OpenStreetMap-bijdragers, ODbL',
  coverage: 'zero-catalogue-global-staged'
});

export const cloneDiscoveryValue = clone;
