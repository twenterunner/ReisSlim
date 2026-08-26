import './ui-feature-flags.js';
import { resolveOrigin } from './trip-model.js';
import { haversineKm } from './route-engine.js';

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const GOLDEN_ANGLE = 137.507764;
const DEFAULT_BATCH_SEEDS = 16;
const DEFAULT_RESULT_LIMIT = 72;
const DISCOVERY_PASSES = 3;
const countryNames = { AT: 'Oostenrijk', BE: 'België', CH: 'Zwitserland', CZ: 'Tsjechië', DE: 'Duitsland', DK: 'Denemarken', ES: 'Spanje', FR: 'Frankrijk', GB: 'Verenigd Koninkrijk', HR: 'Kroatië', IT: 'Italië', LU: 'Luxemburg', NL: 'Nederland', NO: 'Noorwegen', PL: 'Polen', PT: 'Portugal', SE: 'Zweden', SI: 'Slovenië', SK: 'Slowakije' };
const countryCosts = { CH: 185, DK: 155, NO: 165, SE: 145, AT: 150, IT: 150, FR: 140, DE: 125, BE: 125, CZ: 105, PL: 100, SI: 125, HR: 120, ES: 125, PT: 115 };

function destinationPoint(origin, distanceKm, bearingDegrees) {
  const radius = 6371; const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = origin.lat * Math.PI / 180; const lon1 = origin.lon * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceKm / radius) + Math.cos(lat1) * Math.sin(distanceKm / radius) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(distanceKm / radius) * Math.cos(lat1), Math.cos(distanceKm / radius) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
}

function reachFor(trip) {
  const global = trip.travelMode && trip.travelMode !== 'direct';
  const legs = Math.max(1, Math.min(5, Math.floor((trip.days - 1) / 2)));
  return global
    ? Math.min(15000, 2600 + trip.days * 600)
    : Math.max(250, Math.min(4200, trip.maxDrive * 86 * legs));
}

export function discoverySeeds(trip, cursor = 0, count = DEFAULT_BATCH_SEEDS) {
  const origin = resolveOrigin(trip);
  if (!origin) return [];

  if (trip.destinationPoint) {
    const rings = [10, 25, 45, 70, 100, 140];
    return Array.from({ length: count }, (_, index) => {
      const sequence = cursor * count + index;
      const ringIndex = (sequence + cursor) % rings.length;
      const distanceKm = rings[ringIndex] + Math.floor(cursor / 2) * 12;
      return {
        ...destinationPoint(trip.destinationPoint, distanceKm, sequence * GOLDEN_ANGLE),
        distanceKm, sequence, targeted: true, ring: ringIndex
      };
    });
  }

  const global = trip.travelMode && trip.travelMode !== 'direct';
  const reach = reachFor(trip);
  const radialBands = global
    ? [.16, .27, .40, .55, .70, .84, .96]
    : [.12, .20, .30, .42, .56, .70, .84, .96];

  return Array.from({ length: count }, (_, index) => {
    const sequence = cursor * count + index;
    const bandIndex = (sequence + Math.floor(sequence / radialBands.length)) % radialBands.length;
    const jitter = (((sequence * 17) % 9) - 4) * .012;
    const fraction = Math.max(global ? .12 : .08, Math.min(.98, radialBands[bandIndex] + jitter));
    const distanceKm = reach * fraction;
    const bearing = sequence * GOLDEN_ANGLE + (cursor % 5) * 11.25;
    return { ...destinationPoint(origin, distanceKm, bearing), distanceKm, sequence, ring: bandIndex };
  });
}

function queryClauses(point) {
  const around = point.targeted ? 30000 : 36000;
  const lat = point.lat.toFixed(4); const lon = point.lon.toFixed(4);
  return [
    `nwr(around:${around},${lat},${lon})["place"~"city|town|village"]["name"];`,
    `nwr(around:${around},${lat},${lon})["boundary"="national_park"]["name"];`,
    `nwr(around:${around},${lat},${lon})["boundary"="protected_area"]["name"];`,
    `nwr(around:${around},${lat},${lon})["natural"~"peak|bay|beach|water"]["name"];`,
    `nwr(around:${around},${lat},${lon})["tourism"~"attraction|resort"]["name"];`
  ].join('');
}

export function buildDiscoveryQuery(trip, cursor = 0, count = DEFAULT_BATCH_SEEDS) {
  const seeds = discoverySeeds(trip, cursor, count);
  const clauses = seeds.map(queryClauses).join('\n');
  return `[out:json][timeout:16][maxsize:33554432];\n(\n${clauses}\n);\nout center 360;`;
}

const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
const hash = value => [...String(value)].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
const pointOf = element => Number.isFinite(element.lat) && Number.isFinite(element.lon) ? { lat: element.lat, lon: element.lon } : Number.isFinite(element.center?.lat) && Number.isFinite(element.center?.lon) ? { lat: element.center.lat, lon: element.center.lon } : null;

function corridorStops(origin, target, name, distanceKm) {
  const count = Math.max(2, Math.min(7, Math.ceil(distanceKm / 260)));
  return Array.from({ length: count }, (_, index) => {
    const progress = (index + 1) / (count + 1);
    return { name: `Routepunt ${index + 1} richting ${name}`, lat: origin.lat + (target.lat - origin.lat) * progress, lon: origin.lon + (target.lon - origin.lon) * progress, progress };
  });
}

function typeTags(element) {
  const tags = element.tags || {};
  const derived = [];
  if (tags.natural === 'peak') derived.push('bergen', 'wandelen', 'natuur');
  if (['beach', 'bay'].includes(tags.natural)) derived.push('kust', 'zwemmen', 'natuur');
  if (tags.natural === 'water') derived.push('zwemmen', 'natuur');
  if (tags.boundary === 'national_park' || tags.boundary === 'protected_area') derived.push('natuur', 'wandelen');
  if (tags.tourism === 'resort') derived.push('eten');
  if (tags.tourism === 'attraction') derived.push('cultuur');
  return [...new Set(derived)];
}

function dynamicProfile(trip, element) {
  const origin = resolveOrigin(trip); const point = pointOf(element); const name = element.tags?.['name:nl'] || element.tags?.name;
  if (!origin || !point || !name) return null;
  const multimodal = trip.travelMode && trip.travelMode !== 'direct';
  const direct = haversineKm(origin, point); const distanceKm = Math.round(direct * (multimodal ? 1 : 1.18));
  const code = String(element.tags?.['addr:country'] || element.tags?.['is_in:country_code'] || '').toUpperCase();
  const country = countryNames[code] || element.tags?.['is_in:country'] || element.tags?.['addr:country'] || 'Wereldregio';
  const seed = hash(`${name}:${point.lat.toFixed(3)}:${point.lon.toFixed(3)}`);
  const nightMid = countryCosts[code] || 125 + (seed % 25);
  const family = 6 + seed % 4; const motorcycle = 6 + (seed >> 3) % 4; const camper = 6 + (seed >> 5) % 4; const weather = 5 + (seed >> 7) % 4; const crowds = 6 + (seed >> 9) % 4;
  const basePoint = { name, ...point };
  const discoveredTags = typeTags(element);
  return {
    id: `osm-${slug(name)}-${Math.round(point.lat * 100)}-${Math.round(point.lon * 100)}`, name: `${name} & omgeving`, country,
    distanceKm, driveHours: Number((distanceKm / (multimodal ? 780 : 88)).toFixed(1)), nightMid, activityDaily: 38 + seed % 25, toll: multimodal ? 0 : Math.round(distanceKm * (['FR','IT','AT','CH'].includes(code) ? .08 : .025)),
    tags: [...new Set(['natuur', 'cultuur', 'eten', ...discoveredTags, ...(trip.children ? ['kinderen'] : []), ...(trip.transport === 'motorcycle' ? ['motor'] : [])])],
    season: [3,4,5,6,7,8,9,10], family, motorcycle, camper, weather, crowds,
    summary: `Live ontdekt reisgebied rond ${name}; route, verblijf, restaurants en activiteiten worden na selectie met actuele bronnen ingevuld.`,
    pros: ['Geen vast catalogusitem: live ontdekt', 'Wordt volledig voertuigbewust doorgerekend', 'Plaatsen en weer worden na selectie verrijkt'],
    cons: ['Regioprofiel is voorlopig tot live verrijking', 'Prijzen en wegroute moeten nog worden bevestigd'],
    routeStops: corridorStops(origin, point, name, distanceKm), bases: [basePoint],
    activities: [
      { type: 'natuur', title: `Verken het beste natuurgebied binnen korte rijafstand van ${name}.`, rainAlternative: `Kies een museum, markt of wellnesslocatie in ${name}.`, tags: ['natuur','wandelen'] },
      { type: 'cultuur', title: `Combineer het historische centrum van ${name} met een lokale markt.`, rainAlternative: `Bezoek twee compacte binnenlocaties in ${name}.`, tags: ['cultuur','eten'] },
      { type: trip.transport === 'motorcycle' ? 'motor' : 'eten', title: trip.transport === 'motorcycle' ? `Rijd een live gevalideerde landschappelijke lus rond ${name}.` : `Plan een lokale producent en een ontspannen maaltijd rond ${name}.`, rainAlternative: `Kies een korte route en een overdekte culinaire stop in ${name}.`, tags: trip.transport === 'motorcycle' ? ['motor','natuur'] : ['eten'] }
    ],
    dynamic: true, discoverySource: 'OpenStreetMap Overpass', osm: { type: element.type, id: element.id }, discoveredAt: new Date().toISOString()
  };
}

function spatialKey(item) {
  const base = item.bases?.[0];
  return base ? `${Math.round(base.lat * 8) / 8}:${Math.round(base.lon * 8) / 8}` : item.id;
}

export function normalizeDiscoveredDestinations(trip, payload, { excludedIds = [], limit = DEFAULT_RESULT_LIMIT } = {}) {
  const excluded = new Set(excludedIds); const seenNames = new Set(); const seenSpatial = new Map();
  const maximumDistance = trip.travelMode && trip.travelMode !== 'direct' ? 15000 : 4200;
  const candidates = (payload?.elements || []).map(element => dynamicProfile(trip, element)).filter(Boolean)
    .filter(item => item.distanceKm >= 70 && item.distanceKm <= maximumDistance && !excluded.has(item.id))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));

  const deduped = [];
  for (const item of candidates) {
    const nameKey = item.name.toLocaleLowerCase('nl-NL');
    if (seenNames.has(nameKey)) continue;
    const geoKey = spatialKey(item);
    const geoCount = seenSpatial.get(geoKey) || 0;
    if (geoCount >= 3) continue;
    seenNames.add(nameKey);
    seenSpatial.set(geoKey, geoCount + 1);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

async function fetchDiscoveryPayload(trip, cursor, { fetchImpl, endpoint, storage }) {
  const query = buildDiscoveryQuery(trip, cursor);
  if (!query.includes('nwr(')) return { payload: null, cached: false, reason: 'Vertrekcoördinaten ontbreken.' };
  const cacheKey = `reisslim.destination-discovery.v3:${trip.origin}:${trip.destinationQuery || ''}:${trip.travelMode}:${trip.days}:${trip.maxDrive}:${cursor}`;
  try {
    const cached = storage?.getItem(cacheKey);
    if (cached) return { payload: JSON.parse(cached), cached: true };
  } catch { /* optional */ }

  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ data: query }), signal: controller.signal });
    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    const payload = await response.json();
    try { storage?.setItem(cacheKey, JSON.stringify(payload)); } catch { /* optional */ }
    return { payload, cached: false };
  } catch (error) {
    return { payload: null, cached: false, reason: error.name === 'AbortError' ? 'Live ontdekking duurde te lang.' : 'Live ontdekking is tijdelijk niet beschikbaar.' };
  } finally { clearTimeout(timer); }
}

export async function discoverDestinationBatch(trip, { cursor = 0, excludedIds = [], fetchImpl = fetch, endpoint = DEFAULT_ENDPOINT, storage = globalThis.localStorage } = {}) {
  const combined = [];
  let usedCache = true;
  let lastReason = '';

  // One user action now explores three adjacent discovery passes. This produces a
  // much larger candidate universe without changing the app's external API.
  for (let pass = 0; pass < DISCOVERY_PASSES; pass += 1) {
    const currentCursor = cursor * DISCOVERY_PASSES + pass;
    const result = await fetchDiscoveryPayload(trip, currentCursor, { fetchImpl, endpoint, storage });
    usedCache = usedCache && Boolean(result.cached);
    if (result.payload?.elements?.length) combined.push(...result.payload.elements);
    if (result.reason) lastReason = result.reason;
  }

  if (!combined.length) return { destinations: [], live: false, reason: lastReason || 'Geen nieuwe live regio’s gevonden.' };
  const destinations = normalizeDiscoveredDestinations(trip, { elements: combined }, { excludedIds, limit: DEFAULT_RESULT_LIMIT });
  return {
    destinations,
    live: true,
    cached: usedCache,
    source: 'OpenStreetMap Overpass',
    passes: DISCOVERY_PASSES,
    candidateElements: combined.length
  };
}

export const destinationDiscoveryConfig = Object.freeze({
  endpoint: DEFAULT_ENDPOINT,
  attribution: '© OpenStreetMap-bijdragers, ODbL',
  coverage: 'global-multi-ring',
  batchSeeds: DEFAULT_BATCH_SEEDS,
  discoveryPasses: DISCOVERY_PASSES,
  resultLimit: DEFAULT_RESULT_LIMIT,
  publicInstanceNote: 'Meerdere begrensde, door de gebruiker gestarte zoekpasses per actie; voor productie op schaal is een eigen/proxy-instantie nodig.'
});
