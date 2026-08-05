import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const OSM_ENRICHMENT_SCHEMA_VERSION = 1;
export const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const OSM_SOURCE = Object.freeze({
  provider: 'OpenStreetMap',
  attribution: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/',
  license: 'ODbL 1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  termsUrl: 'https://www.openstreetmap.org/copyright',
  warranty: 'OpenStreetMap data is supplied as-is; completeness, access, opening status and availability are not guaranteed.'
});

const ACCOMMODATION_VALUES = new Set([
  'hotel', 'motel', 'hostel', 'guest_house', 'apartment', 'chalet', 'camp_site',
  'caravan_site', 'wilderness_hut', 'alpine_hut'
]);
const FOOD_VALUES = new Set(['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream', 'biergarten']);
const SERVICE_AMENITIES = new Set([
  'fuel', 'charging_station', 'parking', 'motorcycle_parking', 'car_repair',
  'vehicle_inspection', 'toilets', 'drinking_water'
]);
const SERVICE_SHOPS = new Set(['car_repair', 'tyres', 'motorcycle']);
const SERVICE_HIGHWAYS = new Set(['rest_area', 'services']);
const POI_TOURISM = new Set([
  'attraction', 'museum', 'gallery', 'viewpoint', 'artwork', 'information',
  'picnic_site', 'zoo', 'theme_park'
]);
const POI_LEISURE = new Set(['nature_reserve', 'park', 'marina', 'water_park']);
const POI_AMENITIES = new Set(['theatre', 'cinema', 'arts_centre', 'place_of_worship']);
const POI_NATURAL = new Set(['peak', 'volcano', 'waterfall', 'cave_entrance', 'beach', 'spring', 'geyser']);
const ROAD_HIGHWAYS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified',
  'residential', 'living_street', 'service', 'track'
]);
const SAFE_TAGS = Object.freeze([
  'name', 'tourism', 'amenity', 'leisure', 'historic', 'natural', 'shop', 'highway',
  'surface', 'smoothness', 'tracktype', 'access', 'motor_vehicle', 'motorcar',
  'motorcycle', 'bicycle', 'parking', 'parking:lane', 'parking:both', 'covered',
  'supervised', 'locked', 'lit', 'opening_hours', 'website', 'contact:website',
  'operator', 'brand', 'stars', 'wheelchair', 'fee', 'toll', 'ferry', 'type', 'route', 'ref', 'network',
  'scenic', 'ele', 'wikidata', 'wikipedia'
]);
const CATEGORY_LIMITS = Object.freeze({ pois: 15, accommodations: 8, restaurants: 5, services: 4 });

const finite = value => value === null || value === undefined || value === ''
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, places = 1) => {
  const factor = 10 ** places;
  return Math.round(Number(value) * factor) / factor;
};
const normalizeText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unique = values => [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function haversineKm(left, right) {
  const lat1 = finite(left?.lat); const lon1 = finite(left?.lon);
  const lat2 = finite(right?.lat); const lon2 = finite(right?.lon);
  if ([lat1, lon1, lat2, lon2].some(value => value === null)) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const latDelta = radians(lat2 - lat1);
  const lonDelta = radians(lon2 - lon1);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(lonDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function boundingBoxForBase(base, radiusKm = 12) {
  const lat = finite(base?.lat); const lon = finite(base?.lon);
  if (lat === null || lon === null) throw new TypeError('A base with finite lat/lon is required');
  const boundedRadius = Math.max(2, Math.min(25, finite(radiusKm) || 12));
  const latitudeDelta = boundedRadius / 110.574;
  const longitudeDelta = boundedRadius / Math.max(20, 111.320 * Math.cos(lat * Math.PI / 180));
  return {
    south: round(lat - latitudeDelta, 5), west: round(lon - longitudeDelta, 5),
    north: round(lat + latitudeDelta, 5), east: round(lon + longitudeDelta, 5),
    radiusKm: boundedRadius
  };
}

function bboxText(bounds) {
  return [bounds.south, bounds.west, bounds.north, bounds.east].join(',');
}

export function buildOverpassQuery(base, { radiusKm = 12, timeoutSeconds = 30, outputLimit = 1200 } = {}) {
  const bounds = boundingBoxForBase(base, radiusKm);
  const bbox = bboxText(bounds);
  const accessBbox = bboxText(boundingBoxForBase(base, Math.min(3, bounds.radiusKm)));
  const timeout = Math.max(10, Math.min(90, Math.round(finite(timeoutSeconds) || 30)));
  const limit = Math.max(100, Math.min(3000, Math.round(finite(outputLimit) || 1200)));
  const categoryLimit = Math.max(50, Math.floor(limit / 5));
  const poiLimit = Math.max(100, limit - categoryLimit * 3);
  return `[out:json][timeout:${timeout}];\n`
    + `nwr["name"]["tourism"~"^(hotel|motel|hostel|guest_house|apartment|chalet|camp_site|caravan_site|wilderness_hut|alpine_hut)$"](${bbox})->.accommodations;\n`
    + `nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream|biergarten)$"](${bbox})->.food;\n`
    + `(\n`
    + `  nwr["name"]["amenity"~"^(fuel|charging_station|parking|motorcycle_parking|car_repair|vehicle_inspection|toilets|drinking_water)$"](${bbox});\n`
    + `  nwr["name"]["shop"~"^(car_repair|tyres|motorcycle)$"](${bbox});\n`
    + `  nwr["name"]["highway"~"^(rest_area|services)$"](${bbox});\n`
    + `)->.services;\n`
    + `(\n`
    + `  nwr["name"]["tourism"~"^(attraction|museum|gallery|viewpoint|artwork|information|picnic_site|zoo|theme_park)$"](${bbox});\n`
    + `  nwr["name"]["amenity"~"^(theatre|cinema|arts_centre|place_of_worship)$"](${bbox});\n`
    + `  nwr["name"]["leisure"~"^(nature_reserve|park|marina|water_park)$"](${bbox});\n`
    + `  nwr["name"]["historic"](${bbox});\n`
    + `  nwr["name"]["natural"~"^(peak|volcano|waterfall|cave_entrance|beach|spring|geyser)$"](${bbox});\n`
    + `)->.pois;\n`
    + `way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|track)$"](${accessBbox})->.roads;\n`
    + `relation["type"="route"]["route"~"^(road|motorcycle)$"]["name"](${bbox})->.routes;\n`
    + `.accommodations out tags center qt ${categoryLimit};\n`
    + `.food out tags center qt ${categoryLimit};\n`
    + `.services out tags center qt ${categoryLimit};\n`
    + `.pois out tags center qt ${poiLimit};\n`
    + `.roads out tags center qt 200;\n`
    + `.routes out tags center qt 100;`;
}

export function enrichmentCacheIdentity({ endpoint = DEFAULT_OVERPASS_ENDPOINT, base, query }) {
  const material = JSON.stringify({
    schemaVersion: OSM_ENRICHMENT_SCHEMA_VERSION,
    endpoint: String(endpoint), countryCode: base?.countryCode || null,
    baseId: base?.id || null, lat: finite(base?.lat), lon: finite(base?.lon), query: String(query || '')
  });
  return createHash('sha256').update(material).digest('hex');
}

export function cachePathFor(cacheRoot, countryCode, baseId, identity) {
  const safeCountry = String(countryCode || 'unknown').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const safeBase = String(baseId || 'base').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 80);
  return join(cacheRoot, safeCountry, `${safeBase}-${identity}.json`);
}

function coordinatesFor(element) {
  const lat = finite(element?.lat ?? element?.center?.lat);
  const lon = finite(element?.lon ?? element?.center?.lon);
  return lat === null || lon === null ? null : { lat, lon };
}

function osmObjectUrl(element) {
  if (!['node', 'way', 'relation'].includes(element?.type) || !Number.isFinite(Number(element?.id))) return null;
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function classifyTags(tags = {}) {
  if (ACCOMMODATION_VALUES.has(tags.tourism)) return { group: 'accommodations', category: 'accommodation', subtype: `tourism=${tags.tourism}` };
  if (FOOD_VALUES.has(tags.amenity)) return { group: 'restaurants', category: 'restaurant', subtype: `amenity=${tags.amenity}` };
  if (SERVICE_AMENITIES.has(tags.amenity)) return { group: 'services', category: 'service', subtype: `amenity=${tags.amenity}` };
  if (SERVICE_SHOPS.has(tags.shop)) return { group: 'services', category: 'service', subtype: `shop=${tags.shop}` };
  if (SERVICE_HIGHWAYS.has(tags.highway)) return { group: 'services', category: 'service', subtype: `highway=${tags.highway}` };
  if (POI_TOURISM.has(tags.tourism)) return { group: 'pois', category: 'poi', subtype: `tourism=${tags.tourism}` };
  if (POI_LEISURE.has(tags.leisure)) return { group: 'pois', category: 'poi', subtype: `leisure=${tags.leisure}` };
  if (POI_AMENITIES.has(tags.amenity)) return { group: 'pois', category: 'poi', subtype: `amenity=${tags.amenity}` };
  if (POI_NATURAL.has(tags.natural)) return { group: 'pois', category: 'poi', subtype: `natural=${tags.natural}` };
  if (tags.historic) return { group: 'pois', category: 'poi', subtype: `historic=${tags.historic}` };
  return null;
}

function evidenceTags(tags = {}) {
  return Object.fromEntries(SAFE_TAGS.filter(key => tags[key] !== undefined).map(key => [key, tags[key]]));
}

function accessSuitability(tags, vehicle) {
  const direct = tags[vehicle];
  const shared = tags.motor_vehicle ?? tags.access;
  const value = direct ?? shared;
  if (['no', 'private'].includes(value)) return { suitability: 'limited', evidence: [`OSM ${direct !== undefined ? vehicle : (tags.motor_vehicle !== undefined ? 'motor_vehicle' : 'access')}=${value}`] };
  if (['yes', 'designated', 'permissive'].includes(value)) return { suitability: 'supported', evidence: [`OSM ${direct !== undefined ? vehicle : (tags.motor_vehicle !== undefined ? 'motor_vehicle' : 'access')}=${value}`] };
  if (['destination', 'customers', 'delivery'].includes(value)) return { suitability: 'limited', evidence: [`OSM access is limited to ${value}`] };
  if (vehicle === 'car' && (tags.parking || tags.amenity === 'parking')) return { suitability: 'supported', evidence: ['Explicit OSM parking evidence'] };
  if (vehicle === 'motorcycle' && tags.amenity === 'motorcycle_parking') return { suitability: 'supported', evidence: ['Explicit OSM motorcycle-parking evidence'] };
  return { suitability: 'unknown', evidence: [] };
}

function parkingEvidence(tags = {}) {
  const evidence = [];
  if (tags.amenity === 'parking' || tags.amenity === 'motorcycle_parking') evidence.push(`amenity=${tags.amenity}`);
  for (const key of ['parking', 'covered', 'supervised', 'locked', 'lit']) {
    if (tags[key] !== undefined) evidence.push(`${key}=${tags[key]}`);
  }
  return evidence.length ? evidence : null;
}

function statusFor(group) {
  return {
    accommodations: 'Named accommodation candidate — availability and price not verified.',
    restaurants: 'Named food candidate — opening hours, availability and price not verified.',
    pois: 'Named place candidate — access and opening status not verified.',
    services: 'Named service candidate — current service status not verified.'
  }[group];
}

export function parseOverpassElement(element, base) {
  const tags = element?.tags || {};
  const classification = classifyTags(tags);
  const point = coordinatesFor(element);
  const name = String(tags.name || '').trim();
  const sourceUrl = osmObjectUrl(element);
  if (!classification || !point || !name || !sourceUrl) return null;
  const distance = haversineKm(base, point);
  const carFit = accessSuitability(tags, 'car');
  const motorcycleFit = accessSuitability(tags, 'motorcycle');
  return {
    id: `osm-${element.type}-${element.id}`,
    providerId: `${element.type}/${element.id}`,
    osmType: element.type,
    osmId: String(element.id),
    name,
    type: classification.subtype,
    category: classification.category,
    baseId: base.id,
    lat: point.lat,
    lon: point.lon,
    distanceFromBaseKm: distance === null ? null : round(distance, 1),
    estimatedDetourKm: null,
    provider: 'OpenStreetMap',
    source: 'OpenStreetMap via Overpass API',
    sourceUrl,
    sources: [{ provider: 'OpenStreetMap', id: `${element.type}/${element.id}`, url: sourceUrl, license: 'ODbL 1.0' }],
    confidence: 0.78,
    lastChecked: element.timestamp ? String(element.timestamp).slice(0, 10) : null,
    vehicleFit: { car: carFit.suitability, motorcycle: motorcycleFit.suitability },
    vehicleFitEvidence: { car: carFit.evidence, motorcycle: motorcycleFit.evidence },
    openingHours: tags.opening_hours || null,
    parkingEvidence: parkingEvidence(tags),
    accessEvidence: evidenceTags(Object.fromEntries(Object.entries(tags).filter(([key]) => ['access', 'motor_vehicle', 'motorcar', 'motorcycle'].includes(key)))),
    roadSurfaceEvidence: tags.surface ? { surface: tags.surface, smoothness: tags.smoothness || null, tracktype: tags.tracktype || null } : null,
    evidence: { osmTags: evidenceTags(tags) },
    status: statusFor(classification.group),
    _group: classification.group
  };
}

function roadEvidence(element) {
  const tags = element?.tags || {};
  if (element?.type !== 'way' || !ROAD_HIGHWAYS.has(tags.highway)) return null;
  const url = osmObjectUrl(element);
  if (!url) return null;
  return {
    providerId: `way/${element.id}`, sourceUrl: url, highway: tags.highway,
    surface: tags.surface || null, smoothness: tags.smoothness || null, tracktype: tags.tracktype || null,
    access: tags.access || null, motorVehicle: tags.motor_vehicle || null,
    motorcar: tags.motorcar || null, motorcycle: tags.motorcycle || null,
    scenic: tags.scenic || null, toll: tags.toll || null,
    lastChecked: element.timestamp ? String(element.timestamp).slice(0, 10) : null
  };
}

function touringRouteEvidence(element) {
  const tags = element?.tags || {};
  if (element?.type !== 'relation' || tags.type !== 'route' || !['road', 'motorcycle'].includes(tags.route) || !tags.name) return null;
  const url = osmObjectUrl(element);
  if (!url) return null;
  return {
    providerId: `relation/${element.id}`,
    sourceUrl: url,
    name: tags.name,
    route: tags.route,
    ref: tags.ref || null,
    network: tags.network || null,
    operator: tags.operator || null,
    scenic: tags.scenic || null,
    surface: tags.surface || null,
    motorcycle: tags.motorcycle || null,
    evidence: evidenceTags(tags)
  };
}

function serviceKind(item) {
  const subtype = item.type || '';
  if (/amenity=fuel/.test(subtype)) return 'fuel';
  if (/amenity=charging_station/.test(subtype)) return 'charging';
  if (/motorcycle_parking/.test(subtype)) return 'motorcycleParking';
  if (/amenity=parking/.test(subtype)) return 'parking';
  if (/car_repair|vehicle_inspection|shop=tyres|shop=motorcycle/.test(subtype)) return 'vehicleService';
  if (/rest_area|highway=services|toilets|drinking_water/.test(subtype)) return 'rest';
  return 'other';
}

function aggregateAnchorEvidence(recommendations, roads) {
  const roadClasses = unique(roads.map(item => item.highway));
  const surfaces = unique(roads.map(item => item.surface));
  const accessValues = unique(roads.flatMap(item => [item.access, item.motorVehicle]));
  const services = recommendations.services || [];
  const count = kind => services.filter(item => serviceKind(item) === kind).length;
  const fuelDistances = services.filter(item => serviceKind(item) === 'fuel').map(item => item.distanceFromBaseKm).filter(Number.isFinite);
  const carEvidence = [];
  const motorcycleEvidence = [];
  if (count('parking') > 0) carEvidence.push(`${count('parking')} named OSM parking location(s) nearby`);
  if (count('motorcycleParking') > 0) motorcycleEvidence.push(`${count('motorcycleParking')} named OSM motorcycle-parking location(s) nearby`);
  if (count('fuel') > 0) {
    carEvidence.push(`${count('fuel')} named OSM fuel location(s) nearby`);
    motorcycleEvidence.push(`${count('fuel')} named OSM fuel location(s) nearby`);
  }
  return {
    roadAccess: roads.length ? {
      highwayClasses: roadClasses, accessValues, sourceIds: roads.map(item => item.providerId),
      evidence: 'Nearby OSM highway tags; not a routed access guarantee.'
    } : null,
    roadSurface: surfaces.length ? {
      values: surfaces, sourceIds: roads.filter(item => item.surface).map(item => item.providerId),
      evidence: 'Observed on nearby OSM highway ways; corridor-wide surface is not verified.'
    } : null,
    services: {
      fuelCount: count('fuel'), chargingCount: count('charging'), parkingCount: count('parking'),
      motorcycleParkingCount: count('motorcycleParking'), vehicleServiceCount: count('vehicleService'),
      restCount: count('rest'), nearestFuelKm: fuelDistances.length ? Math.min(...fuelDistances) : null,
      evidence: 'Counts of named OSM objects inside the enrichment bounding box.'
    },
    vehicleFit: {
      car: { suitability: carEvidence.length ? 'supported' : 'unknown', evidence: carEvidence },
      motorcycle: { suitability: motorcycleEvidence.length ? 'supported' : 'unknown', evidence: motorcycleEvidence }
    }
  };
}

export function parseOverpassResponse(payload, base, metadata = {}) {
  if (!payload || !Array.isArray(payload.elements)) throw new TypeError('Invalid Overpass JSON: elements array is required');
  const grouped = { pois: [], accommodations: [], restaurants: [], services: [] };
  const seen = new Set();
  const roads = [];
  const touringRoutes = [];
  const checkedDate = metadata.retrievedAt ? String(metadata.retrievedAt).slice(0, 10) : null;
  for (const element of payload.elements) {
    const road = roadEvidence(element);
    if (road) roads.push({ ...road, lastChecked: road.lastChecked || checkedDate });
    const touringRoute = touringRouteEvidence(element);
    if (touringRoute) touringRoutes.push(touringRoute);
    const item = parseOverpassElement(element, base);
    if (!item) continue;
    item.lastChecked ||= checkedDate;
    const key = `${item.category}:${normalizeText(item.name)}:${round(item.lat, 4)}:${round(item.lon, 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = item._group;
    delete item._group;
    grouped[group].push(item);
  }
  for (const [group, items] of Object.entries(grouped)) {
    grouped[group] = items.sort((left, right) => (left.distanceFromBaseKm ?? Infinity) - (right.distanceFromBaseKm ?? Infinity)
      || left.name.localeCompare(right.name, 'en')).slice(0, CATEGORY_LIMITS[group]);
  }
  const aggregate = aggregateAnchorEvidence(grouped, roads);
  return {
    schemaVersion: OSM_ENRICHMENT_SCHEMA_VERSION,
    baseId: base.id,
    countryCode: base.countryCode,
    queryBounds: metadata.queryBounds || null,
    retrievedAt: metadata.retrievedAt || null,
    endpoint: metadata.endpoint || null,
    generator: payload.generator || null,
    recommendations: grouped,
    roads,
    touringRoutes,
    ...aggregate,
    counts: Object.fromEntries(Object.entries(grouped).map(([group, items]) => [group, items.length]))
  };
}

function sourceKey(item) {
  return `${item.provider || ''}:${item.providerId || item.id || ''}`;
}

function sameRecommendation(left, right) {
  if (left.category !== right.category || normalizeText(left.name) !== normalizeText(right.name)) return false;
  const distance = haversineKm(left, right);
  return distance !== null && distance <= 0.5;
}

function mergeRecommendation(existing, enriched) {
  const sources = [...(existing.sources || [{ provider: existing.provider, id: existing.providerId, url: existing.sourceUrl }]), ...(enriched.sources || [])]
    .filter(source => source?.provider && source?.id)
    .filter((source, index, all) => all.findIndex(candidate => `${candidate.provider}:${candidate.id}` === `${source.provider}:${source.id}`) === index);
  return {
    ...existing,
    openingHours: enriched.openingHours || existing.openingHours || null,
    parkingEvidence: enriched.parkingEvidence || existing.parkingEvidence || null,
    accessEvidence: enriched.accessEvidence || existing.accessEvidence || null,
    roadSurfaceEvidence: enriched.roadSurfaceEvidence || existing.roadSurfaceEvidence || null,
    vehicleFit: enriched.vehicleFit || existing.vehicleFit,
    vehicleFitEvidence: enriched.vehicleFitEvidence || existing.vehicleFitEvidence || null,
    evidence: { ...(existing.evidence || {}), ...(enriched.evidence || {}) },
    sources,
    sourceKey: sourceKey(existing)
  };
}

export function mergeBaseEnrichment(base, enrichment) {
  if (!enrichment || enrichment.baseId !== base.id) return structuredClone(base);
  const recommendations = structuredClone(base.recommendations || { pois: [], accommodations: [], restaurants: [], services: [] });
  for (const group of Object.keys(CATEGORY_LIMITS)) {
    recommendations[group] ||= [];
    for (const item of enrichment.recommendations?.[group] || []) {
      const duplicateIndex = recommendations[group].findIndex(existing => sameRecommendation(existing, item));
      if (duplicateIndex >= 0) recommendations[group][duplicateIndex] = mergeRecommendation(recommendations[group][duplicateIndex], item);
      else recommendations[group].push(item);
    }
    recommendations[group] = recommendations[group]
      .sort((left, right) => (right.provider === 'OpenStreetMap') - (left.provider === 'OpenStreetMap')
        || (left.distanceFromBaseKm ?? Infinity) - (right.distanceFromBaseKm ?? Infinity)
        || left.name.localeCompare(right.name, 'en'))
      .slice(0, CATEGORY_LIMITS[group]);
  }
  const sources = [...(base.sources || []), {
    provider: 'OpenStreetMap', id: `enrichment:${base.id}`, url: 'https://www.openstreetmap.org/', license: 'ODbL 1.0'
  }].filter((source, index, all) => all.findIndex(candidate => `${candidate.provider}:${candidate.id}` === `${source.provider}:${source.id}`) === index);
  return {
    ...structuredClone(base),
    recommendations,
    roadAccess: enrichment.roadAccess || base.roadAccess || null,
    roadSurface: enrichment.roadSurface || base.roadSurface || null,
    services: enrichment.services || base.services || null,
    touringRoutes: enrichment.touringRoutes?.length ? enrichment.touringRoutes : base.touringRoutes || [],
    vehicleFit: {
      car: enrichment.vehicleFit?.car?.suitability !== 'unknown' ? enrichment.vehicleFit.car : base.vehicleFit?.car,
      motorcycle: enrichment.vehicleFit?.motorcycle?.suitability !== 'unknown' ? enrichment.vehicleFit.motorcycle : base.vehicleFit?.motorcycle
    },
    sources,
    osmEnrichment: {
      schemaVersion: OSM_ENRICHMENT_SCHEMA_VERSION,
      retrievedAt: enrichment.retrievedAt,
      queryBounds: enrichment.queryBounds,
      endpoint: enrichment.endpoint,
      counts: enrichment.counts
    }
  };
}

function packStats(anchors, corridors) {
  const recommendations = anchors.flatMap(anchor => Object.values(anchor.recommendations || {}).flat());
  return {
    anchors: anchors.length, corridors: corridors.length,
    pois: recommendations.filter(item => item.category === 'poi').length,
    accommodations: recommendations.filter(item => item.category === 'accommodation').length,
    restaurants: recommendations.filter(item => item.category === 'restaurant').length,
    services: recommendations.filter(item => item.category === 'service').length,
    namedRecommendations: recommendations.length
  };
}

export function mergePackEnrichments(pack, enrichments) {
  const byBase = new Map((enrichments || []).filter(Boolean).map(item => [item.baseId, item]));
  const anchors = pack.anchors.map(anchor => byBase.has(anchor.id) ? mergeBaseEnrichment(anchor, byBase.get(anchor.id)) : structuredClone(anchor));
  const retrievedDates = [...byBase.values()].map(item => item.retrievedAt).filter(Boolean).sort();
  const sources = [...(pack.sources || [])];
  if (byBase.size) sources.push({ ...OSM_SOURCE, retrievedAt: retrievedDates.at(-1) || null });
  return {
    ...structuredClone(pack),
    dataVersion: byBase.size ? `${pack.dataVersion}+osm-${OSM_ENRICHMENT_SCHEMA_VERSION}` : pack.dataVersion,
    anchors,
    stats: packStats(anchors, pack.corridors || []),
    sources,
    enrichments: {
      ...(pack.enrichments || {}),
      openStreetMap: {
        schemaVersion: OSM_ENRICHMENT_SCHEMA_VERSION,
        enrichedBaseCount: byBase.size,
        retrievedAt: retrievedDates.at(-1) || null,
        license: 'ODbL 1.0',
        attribution: '© OpenStreetMap contributors'
      }
    }
  };
}

function baseCandidate(anchor) {
  return /gateway|overnight-base|access-gateway/.test(String(anchor?.role || ''));
}

function derivedBaseTarget(pack) {
  const anchors = pack?.anchors || [];
  const bounds = pack?.country?.bounds;
  const diagonal = bounds ? haversineKm(
    { lat: bounds.south, lon: bounds.west }, { lat: bounds.north, lon: bounds.east }
  ) || 0 : 0;
  const candidateCount = anchors.filter(baseCandidate).length;
  if (candidateCount <= 20) return candidateCount;
  if (anchors.length >= 180 || diagonal >= 900) return Math.min(20, candidateCount);
  if (anchors.length >= 120 || diagonal >= 500) return Math.min(14, candidateCount);
  return Math.min(12, candidateCount);
}

export function selectImportantBases(pack, maximum = null) {
  const requested = finite(maximum);
  const limit = Math.max(1, Math.min(20, Math.round(requested === null ? derivedBaseTarget(pack) : requested)));
  const candidates = (pack?.anchors || []).filter(baseCandidate)
    .sort((left, right) => Number(right.significance?.score || 0) - Number(left.significance?.score || 0)
      || Number(right.significance?.population || 0) - Number(left.significance?.population || 0)
      || left.name.localeCompare(right.name, 'en'));
  if (candidates.length <= limit) return candidates;
  const selected = [candidates[0]];
  while (selected.length < limit) {
    const next = candidates.filter(candidate => !selected.includes(candidate)).map(candidate => {
      const separation = Math.min(...selected.map(base => haversineKm(candidate, base) ?? 0));
      const significance = Number(candidate.significance?.score || 0);
      const gatewayBonus = /gateway/.test(candidate.role || '') ? 30 : 0;
      return { candidate, merit: significance + Math.min(100, separation / 3) + gatewayBonus, separation };
    }).sort((left, right) => right.merit - left.merit || right.separation - left.separation
      || left.candidate.name.localeCompare(right.candidate.name, 'en'))[0];
    if (!next) break;
    selected.push(next.candidate);
  }
  return selected;
}

function retryAfterMilliseconds(response, fallback) {
  const raw = response?.headers?.get?.('retry-after');
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(fallback, seconds * 1000);
  const date = Date.parse(raw || '');
  return Number.isFinite(date) ? Math.max(fallback, date - Date.now()) : fallback;
}

export async function fetchOverpassJson(query, {
  endpoint = DEFAULT_OVERPASS_ENDPOINT, timeoutMs = 45000, retries = 3,
  baseDelayMs = 2000, fetchImpl = fetch, signal = null
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener?.('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error('Overpass request timeout')), Math.max(1000, timeoutMs));
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'ReisSlim-catalog-generator/1.3 (+https://github.com/twenterunner/ReisSlim)'
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal
      });
      if (response.ok) return await response.json();
      const error = new Error(`Overpass returned HTTP ${response.status}`);
      error.status = response.status;
      if (![429, 502, 503, 504].includes(response.status) || attempt >= retries) throw error;
      await sleep(retryAfterMilliseconds(response, baseDelayMs * (2 ** attempt)));
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error?.name === 'AbortError' || attempt >= retries) throw error;
      await sleep(baseDelayMs * (2 ** attempt));
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
    }
  }
  throw lastError || new Error('Overpass request failed');
}

export async function readCachedEnrichment(path) {
  if (!existsSync(path)) return null;
  const cached = JSON.parse(await readFile(path, 'utf8'));
  if (cached.schemaVersion !== OSM_ENRICHMENT_SCHEMA_VERSION || !cached.enrichment?.baseId) return null;
  return cached;
}

export async function writeCachedEnrichment(path, record) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function runBounded(tasks, worker, { concurrency = 1, minimumDelayMs = 1000 } = {}) {
  const width = Math.max(1, Math.min(4, Math.round(finite(concurrency) || 1)));
  const results = new Array(tasks.length);
  let cursor = 0;
  async function lane() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(tasks[index], index);
      if (minimumDelayMs > 0 && cursor < tasks.length) await sleep(minimumDelayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, tasks.length) }, lane));
  return results;
}
