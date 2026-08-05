import { validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { transportId } from './vehicle-intelligence.js';
import { geocodePlace } from './geocoding-provider.js';

const OVERPASS_ENDPOINTS = Object.freeze([
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]);
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_PREFIX = 'reisslim.live.v1.';

const clone = value => typeof globalThis.structuredClone === 'function'
  ? globalThis.structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function cacheKey(namespace, input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${CACHE_PREFIX}${namespace}.${(hash >>> 0).toString(36)}`;
}

function readCache(storage, key, maxAgeMs) {
  if (!storage) return null;
  try {
    const record = JSON.parse(storage.getItem(key));
    return record && Date.now() - record.savedAt <= maxAgeMs ? record.value : null;
  } catch { return null; }
}

function writeCache(storage, key, value) {
  if (!storage) return;
  try { storage.setItem(key, JSON.stringify({ savedAt: Date.now(), value })); } catch { /* cache is best effort */ }
}

const throwIfAborted = signal => {
  if (signal?.aborted) throw new DOMException('Place enrichment cancelled', 'AbortError');
};

async function fetchJson(url, options, timeoutMs, fetchImpl, externalSignal = null) {
  throwIfAborted(externalSignal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  externalSignal?.addEventListener?.('abort', abort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Live databron antwoordde met ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abort);
  }
}

export async function geocodeOrigin(origin, options = {}) {
  const query = String(origin || '').trim();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!query || typeof fetchImpl !== 'function') return null;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const key = cacheKey('geocode', query.toLocaleLowerCase('nl-NL'));
  const cached = readCache(storage, key, 90 * 24 * 60 * 60 * 1000);
  if (cached) return cached;
  try {
    const result = await geocodePlace(query, {
      fetchImpl, storage, nominatimEndpoint: options.nominatimUrl, photonEndpoint: options.photonUrl,
      nominatimTimeoutMs: options.timeoutMs || 3500, photonTimeoutMs: options.photonTimeoutMs || 5000,
      signal: options.signal
    });
    const point = result.resolution
      ? { ...result.resolution.point, name: query, source: result.resolution.provider }
      : null;
    if (!validCoordinate(point)) return null;
    writeCache(storage, key, point);
    return point;
  } catch { return null; }
}

function uniqueAnchors(plan) {
  const candidates = [];
  for (const day of plan.days || []) {
    if (validCoordinate(day.fromPoint)) candidates.push(day.fromPoint);
    if (validCoordinate(day.toPoint) && !(day.kind === 'return' && day.toPoint.role === 'return')) candidates.push(day.toPoint);
    if (validCoordinate(day.activityPoint)) candidates.push(day.activityPoint);
    for (const waypoint of day.waypoints || []) if (validCoordinate(waypoint)) candidates.push(waypoint);
  }
  const unique = [];
  for (const point of candidates) {
    if (!unique.some(item => haversineKm(item, point) < 3)) unique.push({ lat: point.lat, lon: point.lon });
    if (unique.length >= 12) break;
  }
  return unique;
}

function queryForAnchors(anchors) {
  const clauses = anchors.flatMap(point => {
    const around = `around:12000,${Number(point.lat).toFixed(5)},${Number(point.lon).toFixed(5)}`;
    return [
      `nwr(${around})["tourism"~"^(hotel|guest_house|hostel|motel|camp_site|caravan_site)$"];`,
      `nwr(${around})["amenity"~"^(restaurant|cafe|fast_food|fuel|charging_station)$"];`,
      `nwr(${around})["tourism"~"^(attraction|viewpoint|museum|zoo|theme_park|gallery)$"];`,
      `nwr(${around})["historic"]["name"];`,
      `nwr(${around})["leisure"~"^(nature_reserve|park)$"]["name"];`,
      `nwr(${around})["highway"~"^(rest_area|services)$"];`
    ];
  });
  return `[out:json][timeout:12][maxsize:8388608];(${clauses.join('')});out center tags;`;
}

export function buildOverpassQueries(plan, chunkSize = 3) {
  const anchors = uniqueAnchors(plan);
  const queries = [];
  for (let index = 0; index < anchors.length; index += chunkSize) queries.push(queryForAnchors(anchors.slice(index, index + chunkSize)));
  return queries;
}

export function buildOverpassQuery(plan) {
  return buildOverpassQueries(plan).join('\n');
}

function placeType(tags = {}) {
  if (['hotel', 'guest_house', 'hostel', 'motel', 'camp_site', 'caravan_site'].includes(tags.tourism)) return 'accommodation';
  if (['restaurant', 'cafe', 'fast_food'].includes(tags.amenity)) return 'restaurant';
  if (['fuel', 'charging_station'].includes(tags.amenity)) return 'fuel';
  if (['rest_area', 'services'].includes(tags.highway)) return 'rest';
  if (['attraction', 'viewpoint', 'museum', 'zoo', 'theme_park', 'gallery'].includes(tags.tourism) || tags.historic || ['nature_reserve', 'park'].includes(tags.leisure)) return 'activity';
  return null;
}

function normalizePlace(element) {
  const point = { lat: Number(element.lat ?? element.center?.lat), lon: Number(element.lon ?? element.center?.lon) };
  const type = placeType(element.tags);
  if (!type || !validCoordinate(point)) return null;
  const tags = element.tags || {};
  const fallback = { accommodation: 'Verblijf', restaurant: 'Eetgelegenheid', activity: 'Bezienswaardigheid', fuel: 'Tankstation', rest: 'Rustplaats' }[type];
  return {
    id: `${element.type}-${element.id}`,
    osmType: element.type,
    osmId: element.id,
    type,
    name: tags.name || tags['name:en'] || tags.brand || fallback,
    named: Boolean(tags.name || tags['name:en'] || tags.brand),
    point,
    tags,
    openingHours: tags.opening_hours || null,
    website: tags.website || tags['contact:website'] || null,
    url: `https://www.openstreetmap.org/${element.type}/${element.id}`
  };
}

export function normalizeOverpassPlaces(payload) {
  return (payload?.elements || []).map(normalizePlace).filter(Boolean);
}

function suitability(place, recommendation, trip) {
  const vehicle = transportId(trip.transport);
  let score = 0;
  if (place.type === recommendation.type) score += 20;
  if (recommendation.type === 'service' && ['rest', 'fuel', 'accommodation'].includes(place.type)) score += 10;
  if (place.type === 'accommodation') {
    const camping = ['camp_site', 'caravan_site'].includes(place.tags.tourism);
    if (['motorhome', 'caravan'].includes(vehicle)) score += camping ? 20 : -20;
    else score += camping ? -5 : 10;
  }
  if (place.named) score += 12;
  if (place.website) score += 2;
  if (place.openingHours) score += 2;
  return score;
}

function accommodationFitsVehicle(place, vehicle) {
  const camping = ['camp_site', 'caravan_site'].includes(place.tags?.tourism);
  if (vehicle === 'caravan') return ['caravan_site', 'camp_site'].includes(place.tags?.tourism);
  if (vehicle === 'motorhome') return camping;
  return !camping;
}

function accommodationEvidence(place, vehicle) {
  const tags = place.tags || {};
  if (vehicle === 'motorcycle') return tags.covered === 'yes' || tags.parking === 'yes' || tags['parking:condition']
    ? 'Parkeerbewijs staat in de brondata; controleer of dit veilig en overdekt genoeg is.'
    : 'Veilige of overdekte motorparking is niet bevestigd en moet vóór boeken worden gecontroleerd.';
  if (vehicle === 'motorhome') return 'OSM classificeert dit als camper- of campinglocatie; water, stroom, afval en voertuigmaat zijn niet bevestigd.';
  if (vehicle === 'caravan') return 'OSM classificeert dit als camping; aanrijroute, manoeuvreerruimte en standplaatsmaat zijn niet bevestigd.';
  return tags.parking ? 'Parkeersignaal gevonden in de brondata; voorwaarden en beschikbaarheid zijn niet bevestigd.' : 'Parkeermogelijkheid en beschikbaarheid moeten vóór boeken worden gecontroleerd.';
}

function associatedBase(day, trip) {
  if (!day || (day.kind === 'return' && day.to === trip.origin)) return null;
  return day.overnight || day.location || day.to || null;
}

function liveRecommendation(place, day, trip, distanceKm, index = 0) {
  const vehicle = transportId(trip.transport);
  const base = associatedBase(day, trip);
  return {
    id: `day-${day.day}-${place.type}-live-${place.id}`,
    providerId: place.id,
    provider: 'OpenStreetMap Overpass',
    day: day.day,
    associatedDay: day.day,
    associatedBase: base,
    type: place.type,
    name: place.name,
    reason: place.type === 'accommodation'
      ? accommodationEvidence(place, vehicle)
      : `${place.name} ligt bij ${base || day.location || 'de dagroute'}; controleer opening, toegang en actuele geschiktheid bij de bron.`,
    point: place.point,
    vehicleFit: [vehicle],
    vehicleProfileId: vehicle,
    confidence: place.named ? 'named-provider-evidence' : 'category-fallback',
    verified: false,
    live: true,
    genericFallback: !place.named,
    coordinateRole: place.named ? 'provider-location' : 'search-anchor',
    source: 'OpenStreetMap via Overpass',
    sourceUrl: place.url,
    freshness: new Date().toISOString(),
    straightLineDistanceKm: Number(distanceKm.toFixed(1)),
    detourKm: null,
    routeDistanceKm: null,
    openingHours: place.openingHours,
    url: place.website || place.url,
    lastChecked: new Date().toISOString(),
    availabilityWarning: place.type === 'accommodation' ? 'Prijs en beschikbaarheid zijn niet geverifieerd.' : 'Opening en toegankelijkheid zijn niet geverifieerd.',
    rank: index + 1
  };
}

function enrichRecommendations(plan, places, trip) {
  const used = new Set();
  const accommodationOwners = new Map();
  const maximumKm = { accommodation: 12, restaurant: 8, activity: 15, fuel: 10, rest: 10, service: 12 };
  for (const day of plan.days || []) {
    for (const item of day.recommendations || []) {
      if (!validCoordinate(item.point)) continue;
      const candidates = places.filter(place => place.named).map(place => ({ place, distanceKm: haversineKm(item.point, place.point) }))
        .filter(candidate => candidate.distanceKm !== null && candidate.distanceKm <= (maximumKm[item.type] || 10))
        .filter(candidate => item.type === candidate.place.type || (item.type === 'service' && ['rest', 'fuel', 'accommodation'].includes(candidate.place.type)))
        .sort((a, b) => suitability(b.place, item, trip) - suitability(a.place, item, trip) || a.distanceKm - b.distanceKm);
      const selected = candidates.find(candidate => !used.has(candidate.place.id));
      if (!selected) continue;
      if (!['fuel', 'rest'].includes(item.type)) used.add(selected.place.id);
      Object.assign(item, liveRecommendation(selected.place, day, trip, selected.distanceKm));
    }
    const vehicle = transportId(trip.transport);
    const anchor = day.toPoint || day.fromPoint;
    if (validCoordinate(anchor) && !(day.kind === 'return' && day.to === trip.origin)) {
      const baseKey = String(associatedBase(day, trip) || '').trim().toLocaleLowerCase('nl-NL');
      const options = places.filter(place => place.named && place.type === 'accommodation' && accommodationFitsVehicle(place, vehicle)
        && (!accommodationOwners.has(place.id) || accommodationOwners.get(place.id) === baseKey))
        .map(place => ({ place, distanceKm: haversineKm(anchor, place.point) }))
        .filter(item => item.distanceKm !== null && item.distanceKm <= 18)
        .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3)
        .map(({ place, distanceKm }, index) => liveRecommendation(place, day, trip, distanceKm, index));
      if (options.length) {
        options.forEach(option => accommodationOwners.set(option.providerId, baseKey));
        day.recommendations = [...day.recommendations.filter(item => item.type !== 'accommodation'), ...options];
        day.accommodationOptions = options;
      }

      const desiredTypes = ['stay', 'flex'].includes(day.kind)
        ? ['activity', 'restaurant']
        : ['restaurant', 'fuel', 'rest'];
      for (const type of desiredTypes) {
        if (day.recommendations.some(item => item.type === type && item.live && item.name)) continue;
        const selected = places.filter(place => place.named && place.type === type && !used.has(place.id))
          .map(place => ({ place, distanceKm: haversineKm(anchor, place.point) }))
          .filter(item => item.distanceKm !== null && item.distanceKm <= (maximumKm[type] || 15))
          .sort((left, right) => left.distanceKm - right.distanceKm)[0];
        if (!selected) continue;
        used.add(selected.place.id);
        day.recommendations.push(liveRecommendation(selected.place, day, trip, selected.distanceKm));
      }
    }
    day.sleepProposal = day.recommendations?.find(item => item.type === 'accommodation') || null;
  }
  plan.recommendations = (plan.days || []).flatMap(day => day.recommendations || []);
  plan.accommodationOptions = Object.values((plan.days || []).reduce((groups, day) => {
    const base = associatedBase(day, trip);
    if (!base || !day.accommodationOptions?.length) return groups;
    groups[base] ||= { base, point: day.toPoint || day.fromPoint || null, recommendations: [] };
    for (const option of day.accommodationOptions) {
      if (!groups[base].recommendations.some(existing => existing.providerId === option.providerId)) groups[base].recommendations.push(option);
    }
    return groups;
  }, {}));
  return plan;
}

async function fetchPlaces(plan, options, fetchImpl, storage) {
  const queries = buildOverpassQueries(plan);
  if (!queries.length) return [];
  const key = cacheKey('places-v3', queries.join('|'));
  const cached = readCache(storage, key, 7 * 24 * 60 * 60 * 1000);
  if (cached) return cached;
  const endpoints = options.overpassUrl ? [options.overpassUrl] : options.overpassEndpoints || OVERPASS_ENDPOINTS;
  const places = [];
  const failures = [];
  for (const query of queries) {
    throwIfAborted(options.signal);
    let payload = null;
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        payload = await fetchJson(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: new URLSearchParams({ data: query }).toString()
        }, options.timeoutMs || 9000, fetchImpl, options.signal);
        break;
      } catch (error) {
        if (options.signal?.aborted) throw error;
        lastError = error;
      }
    }
    if (!payload && lastError) {
      failures.push(String(lastError?.message || 'provider-error'));
      continue;
    }
    places.push(...normalizeOverpassPlaces(payload));
  }
  if (!places.length && failures.length) throw new Error(failures.at(-1));
  const unique = [];
  for (const place of places) if (!unique.some(item => item.id === place.id)) unique.push(place);
  const result = { places: unique, partialFailures: failures.length, requestedChunks: queries.length };
  writeCache(storage, key, result);
  return result;
}

function dateDifference(dateString, now = new Date()) {
  const date = new Date(`${dateString}T12:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((date - today) / 86400000);
}

async function fetchWeather(trip, destination, options, fetchImpl, storage) {
  const leadDays = dateDifference(trip.startDate, options.now || new Date());
  if (leadDays < -1 || leadDays > 15 || !validCoordinate(destination.bases?.[0])) return null;
  const point = destination.bases[0];
  const url = new URL(options.weatherUrl || WEATHER_URL);
  url.search = new URLSearchParams({
    latitude: String(point.lat), longitude: String(point.lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'auto', forecast_days: '16'
  });
  const key = cacheKey('weather', `${point.lat},${point.lon}`);
  const cached = readCache(storage, key, 2 * 60 * 60 * 1000);
  if (cached) return cached;
  const payload = await fetchJson(url, { headers: { accept: 'application/json' } }, options.timeoutMs || 8000, fetchImpl, options.signal);
  const daily = payload.daily || {};
  const days = (daily.time || []).map((date, index) => ({
    date,
    weatherCode: daily.weather_code?.[index],
    minimumC: daily.temperature_2m_min?.[index],
    maximumC: daily.temperature_2m_max?.[index],
    precipitationChance: daily.precipitation_probability_max?.[index],
    windKmh: daily.wind_speed_10m_max?.[index]
  })).filter(day => day.date >= trip.startDate).slice(0, trip.days);
  const weather = days.length ? { source: 'Open-Meteo', live: true, days, lastChecked: new Date().toISOString() } : null;
  if (weather) writeCache(storage, key, weather);
  return weather;
}

export async function enrichPlanWithPlaces(trip, destination, plan, options = {}) {
  if (trip.liveData === false) return plan;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return plan;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  throwIfAborted(options.signal);
  const next = clone(plan);
  const [placesResult, weatherResult] = await Promise.allSettled([
    fetchPlaces(next, options, fetchImpl, storage),
    fetchWeather(trip, destination, options, fetchImpl, storage)
  ]);
  throwIfAborted(options.signal);
  const placeOutcome = placesResult.status === 'fulfilled' ? placesResult.value : { places: [], partialFailures: 0, requestedChunks: 0 };
  const places = Array.isArray(placeOutcome) ? placeOutcome : placeOutcome.places || [];
  if (places.length) enrichRecommendations(next, places, trip);
  if (weatherResult.status === 'fulfilled' && weatherResult.value) next.weather = weatherResult.value;
  next.placeData = {
    live: places.length > 0,
    source: places.length ? 'OpenStreetMap via Overpass' : 'ReisSlim offline voertuigregels',
    namedPlaces: places.filter(place => place.named).length,
    providers: places.length ? ['OpenStreetMap Overpass'] : [],
    freshness: places.length ? new Date().toISOString() : null,
    weatherLive: Boolean(next.weather?.live),
    partialFailures: Number(placeOutcome.partialFailures || 0),
    requestedChunks: Number(placeOutcome.requestedChunks || 0),
    error: placesResult.status === 'rejected'
      ? 'Live plaatsen niet beschikbaar; offline voorstellen blijven actief.'
      : placeOutcome.partialFailures ? `${placeOutcome.partialFailures} plaatsquerydeel(en) faalden; succesvolle providerresultaten zijn behouden.` : null
  };
  return next;
}
