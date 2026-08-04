import { resolveOrigin } from './trip-model.js';
import { haversineKm } from './route-engine.js';

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const GOLDEN_ANGLE = 137.507764;
const clone = value => JSON.parse(JSON.stringify(value));
const countryNames = { AT: 'Oostenrijk', BE: 'België', CH: 'Zwitserland', CZ: 'Tsjechië', DE: 'Duitsland', DK: 'Denemarken', ES: 'Spanje', FR: 'Frankrijk', GB: 'Verenigd Koninkrijk', HR: 'Kroatië', IT: 'Italië', LU: 'Luxemburg', NL: 'Nederland', NO: 'Noorwegen', PL: 'Polen', PT: 'Portugal', SE: 'Zweden', SI: 'Slovenië', SK: 'Slowakije' };
const countryCosts = { CH: 185, DK: 155, NO: 165, SE: 145, AT: 150, IT: 150, FR: 140, DE: 125, BE: 125, CZ: 105, PL: 100, SI: 125, HR: 120, ES: 125, PT: 115 };

function destinationPoint(origin, distanceKm, bearingDegrees) {
  const radius = 6371; const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = origin.lat * Math.PI / 180; const lon1 = origin.lon * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceKm / radius) + Math.cos(lat1) * Math.sin(distanceKm / radius) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(distanceKm / radius) * Math.cos(lat1), Math.cos(distanceKm / radius) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
}

export function discoverySeeds(trip, cursor = 0, count = 8) {
  const origin = resolveOrigin(trip);
  if (!origin) return [];
  if (trip.destinationPoint) {
    return Array.from({ length: count }, (_, index) => {
      const sequence = cursor * count + index;
      const distanceKm = 12 + (index % 4) * 24 + cursor * 8;
      return { ...destinationPoint(trip.destinationPoint, distanceKm, sequence * GOLDEN_ANGLE), distanceKm, sequence, targeted: true };
    });
  }
  const global = trip.travelMode && trip.travelMode !== 'direct';
  const legs = Math.max(1, Math.min(4, Math.floor((trip.days - 1) / 2)));
  const reach = global ? Math.min(14500, 2200 + trip.days * 520) : Math.max(220, Math.min(3400, trip.maxDrive * 78 * legs));
  const ring = .28 + ((cursor % 9) / 8) * .66;
  return Array.from({ length: count }, (_, index) => {
    const sequence = cursor * count + index;
    const distanceKm = reach * Math.max(global ? .32 : .22, Math.min(.96, ring + ((index % 3) - 1) * .08));
    return { ...destinationPoint(origin, distanceKm, sequence * GOLDEN_ANGLE), distanceKm, sequence };
  });
}

export function buildDiscoveryQuery(trip, cursor = 0) {
  const seeds = discoverySeeds(trip, cursor);
  const clauses = seeds.map(point => `nwr(around:42000,${point.lat.toFixed(4)},${point.lon.toFixed(4)})["place"~"city|town"]["name"];nwr(around:42000,${point.lat.toFixed(4)},${point.lon.toFixed(4)})["boundary"="national_park"]["name"];`).join('\n');
  return `[out:json][timeout:12][maxsize:16777216];\n(\n${clauses}\n);\nout center 180;`;
}

const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
const hash = value => [...String(value)].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
const pointOf = element => Number.isFinite(element.lat) && Number.isFinite(element.lon) ? { lat: element.lat, lon: element.lon } : Number.isFinite(element.center?.lat) && Number.isFinite(element.center?.lon) ? { lat: element.center.lat, lon: element.center.lon } : null;

function corridorStops(origin, target, name, distanceKm) {
  const count = Math.max(2, Math.min(6, Math.ceil(distanceKm / 280)));
  return Array.from({ length: count }, (_, index) => {
    const progress = (index + 1) / (count + 1);
    return { name: `Routepunt ${index + 1} richting ${name}`, lat: origin.lat + (target.lat - origin.lat) * progress, lon: origin.lon + (target.lon - origin.lon) * progress, progress };
  });
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
  return {
    id: `osm-${slug(name)}-${Math.round(point.lat * 100)}-${Math.round(point.lon * 100)}`, name: `${name} & omgeving`, country,
    distanceKm, driveHours: Number((distanceKm / (multimodal ? 780 : 88)).toFixed(1)), nightMid, activityDaily: 38 + seed % 25, toll: multimodal ? 0 : Math.round(distanceKm * (['FR','IT','AT','CH'].includes(code) ? .08 : .025)),
    tags: ['natuur', 'cultuur', 'eten', ...(trip.children ? ['kinderen'] : []), ...(trip.transport === 'motorcycle' ? ['motor'] : [])],
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

export function normalizeDiscoveredDestinations(trip, payload, { excludedIds = [], limit = 16 } = {}) {
  const excluded = new Set(excludedIds); const seenNames = new Set();
  const maximumDistance = trip.travelMode && trip.travelMode !== 'direct' ? 15000 : 3600;
  return (payload?.elements || []).map(element => dynamicProfile(trip, element)).filter(Boolean)
    .filter(item => item.distanceKm >= 120 && item.distanceKm <= maximumDistance && !excluded.has(item.id))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
    .filter(item => { const key = item.name.toLocaleLowerCase('nl-NL'); if (seenNames.has(key)) return false; seenNames.add(key); return true; })
    .slice(0, limit);
}

export async function discoverDestinationBatch(trip, { cursor = 0, excludedIds = [], fetchImpl = fetch, endpoint = DEFAULT_ENDPOINT, storage = globalThis.localStorage } = {}) {
  const query = buildDiscoveryQuery(trip, cursor);
  if (!query.includes('nwr(')) return { destinations: [], live: false, reason: 'Vertrekcoördinaten ontbreken.' };
  const cacheKey = `reisslim.destination-discovery.v2:${trip.origin}:${trip.travelMode}:${trip.days}:${trip.maxDrive}:${cursor}`;
  try {
    const cached = storage?.getItem(cacheKey);
    if (cached) return { destinations: normalizeDiscoveredDestinations(trip, JSON.parse(cached), { excludedIds }), live: true, cached: true, source: 'OpenStreetMap Overpass' };
  } catch { /* cache is optional */ }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ data: query }), signal: controller.signal });
    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    const payload = await response.json();
    try { storage?.setItem(cacheKey, JSON.stringify(payload)); } catch { /* cache is optional */ }
    return { destinations: normalizeDiscoveredDestinations(trip, payload, { excludedIds }), live: true, cached: false, source: 'OpenStreetMap Overpass' };
  } catch (error) {
    return { destinations: [], live: false, reason: error.name === 'AbortError' ? 'Live ontdekking duurde te lang.' : 'Live ontdekking is tijdelijk niet beschikbaar.' };
  } finally { clearTimeout(timer); }
}

export const destinationDiscoveryConfig = Object.freeze({ endpoint: DEFAULT_ENDPOINT, attribution: '© OpenStreetMap-bijdragers, ODbL', coverage: 'global-staged', publicInstanceNote: 'Eén compacte, door de gebruiker gestarte batch per actie; voor productie op schaal is een eigen/proxy-instantie nodig.' });
