import {
  OVERTURE_EXTRACTION_SCHEMA_VERSION,
  PINNED_OVERTURE_SCHEMA,
  validateOverturePlan
} from './overture-infrastructure.mjs';

const GROUP_LIMITS = Object.freeze({ pois: 15, accommodations: 8, restaurants: 5, services: 5 });

const PLACE_GROUPS = Object.freeze({
  accommodations: new Set([
    'hotel', 'lodging', 'motel', 'hostel', 'guest_house', 'bed_and_breakfast',
    'campground', 'camping', 'camp_site', 'caravan_site', 'resort',
    'private_lodging', 'holiday_rental', 'inn'
  ]),
  restaurants: new Set([
    'restaurant', 'fast_food_restaurant', 'cafe', 'coffee_shop', 'food_court',
    'bakery', 'bar', 'pub', 'smoothie_juice_bar', 'tea_room', 'ice_cream_shop'
  ]),
  services: new Set([
    'gas_station', 'fuel_station', 'charging_station', 'ev_charging_station',
    'parking', 'automotive_service', 'vehicle_service', 'car_repair',
    'motorcycle_repair', 'rest_area', 'public_restroom', 'toilet',
    'ferry_terminal', 'vehicle_parts_store', 'tire_shop'
  ]),
  pois: new Set([
    'historic_site', 'museum', 'park', 'national_park', 'nature_reserve',
    'protected_area', 'viewpoint', 'scenic_viewpoint', 'tourist_attraction',
    'landmark', 'zoo', 'aquarium', 'garden', 'botanical_garden', 'beach',
    'mountain', 'theatre_venue', 'art_gallery', 'winery', 'monument',
    'castle', 'heritage_site', 'science_attraction', 'amusement_park',
    'amusement_attraction', 'animal_attraction', 'public_plaza'
  ])
});

export const OVERTURE_PLACES_SOURCE = Object.freeze({
  provider: 'Overture Maps',
  dataset: 'places',
  url: 'https://explore.overturemaps.org/',
  license: 'CDLA-Permissive-2.0',
  licenseUrl: 'https://cdla.dev/permissive-2-0/',
  attribution: 'Overture Maps Foundation and the source datasets listed on each record'
});

export const OVERTURE_TRANSPORTATION_SOURCE = Object.freeze({
  provider: 'Overture Maps',
  dataset: 'transportation',
  url: 'https://explore.overturemaps.org/',
  license: 'ODbL 1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  attribution: '\u00a9 OpenStreetMap contributors, Overture Maps Foundation'
});

function normalizeText(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values) {
  return [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
}

function uniqueSources(values) {
  const result = new Map();
  for (const source of (values || []).filter(Boolean)) {
    const key = [source.provider, source.dataset, source.release, source.planIdentity || source.id, source.url]
      .map(value => String(value || '')).join('|');
    result.set(key, result.has(key) ? { ...result.get(key), ...source } : source);
  }
  return [...result.values()];
}

function list(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function explorerUrl(providerId) {
  const url = new URL(OVERTURE_PLACES_SOURCE.url);
  url.searchParams.set('id', String(providerId));
  return url.href;
}

function pointForPlan(plan) {
  const point = plan?.basePoint;
  const lat = finite(point?.lat ?? point?.latitude);
  const lon = finite(point?.lon ?? point?.lng ?? point?.longitude);
  if (lat !== null && lon !== null) return { lat, lon };
  if (!plan?.bbox) return null;
  return {
    lat: (Number(plan.bbox.south) + Number(plan.bbox.north)) / 2,
    lon: (Number(plan.bbox.west) + Number(plan.bbox.east)) / 2
  };
}

function haversineKm(left, right) {
  if (![left?.lat, left?.lon, right?.lat, right?.lon].every(value => Number.isFinite(Number(value)))) return null;
  const radians = value => Number(value) * Math.PI / 180;
  const dLat = radians(Number(right.lat) - Number(left.lat));
  const dLon = radians(Number(right.lon) - Number(left.lon));
  const firstLat = radians(left.lat);
  const secondLat = radians(right.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function groupFor(category, explicitGroup = null) {
  if (Object.hasOwn(GROUP_LIMITS, explicitGroup)) return explicitGroup;
  const value = normalizeText(category).replaceAll(' ', '_');
  return Object.entries(PLACE_GROUPS).find(([, categories]) => categories.has(value))?.[0] || null;
}

function categoryFor(group) {
  return { pois: 'poi', accommodations: 'accommodation', restaurants: 'restaurant', services: 'service' }[group];
}

function statusFor(group) {
  return {
    accommodations: 'Named accommodation candidate \u2014 availability and price not verified.',
    restaurants: 'Named food candidate \u2014 opening hours, availability and price not verified.',
    pois: 'Named place candidate \u2014 access and opening status not verified.',
    services: 'Named service candidate \u2014 current service status not verified.'
  }[group];
}

function sourceRecords(rawSources, themeSource, providerId) {
  const overture = {
    provider: themeSource.provider,
    dataset: themeSource.dataset,
    id: String(providerId),
    url: explorerUrl(providerId),
    license: themeSource.license,
    licenseUrl: themeSource.licenseUrl,
    attribution: themeSource.attribution
  };
  const upstream = list(rawSources).filter(source => source && typeof source === 'object').map(source => ({
    provider: String(source.provider || source.dataset || 'Overture source dataset'),
    dataset: source.dataset ? String(source.dataset) : null,
    property: source.property ? String(source.property) : null,
    id: source.record_id !== undefined ? String(source.record_id) : source.id !== undefined ? String(source.id) : null,
    url: safeHttpUrl(source.url || source.source_url),
    license: source.license || source.licence || null,
    licenseUrl: safeHttpUrl(source.license_url || source.licence_url),
    attribution: source.attribution || null,
    updateTime: source.update_time || source.updated_at || null,
    confidence: finite(source.confidence)
  }));
  return [overture, ...upstream].filter((source, index, all) => all.findIndex(candidate =>
    `${candidate.provider}:${candidate.dataset || ''}:${candidate.id || ''}:${candidate.property || ''}` ===
    `${source.provider}:${source.dataset || ''}:${source.id || ''}:${source.property || ''}`) === index);
}

function fitValue(value) {
  const item = typeof value === 'string' ? { suitability: value } : value || {};
  return {
    suitability: ['supported', 'limited', 'prohibited', 'unknown'].includes(item.suitability) ? item.suitability : 'unknown',
    evidence: unique(list(item.evidence).map(String))
  };
}

function mergeFit(primary, secondary) {
  const left = fitValue(primary);
  const right = fitValue(secondary);
  return {
    suitability: left.suitability === 'unknown' ? right.suitability : left.suitability,
    evidence: unique([...left.evidence, ...right.evidence])
  };
}

function explicitFit(record) {
  const input = record?.vehicleFit || record?.vehicle_fit || {};
  return { car: fitValue(input.car), motorcycle: fitValue(input.motorcycle) };
}

function restrictionFit(restrictions) {
  const states = { car: [], motorcycle: [] };
  const evidence = { car: [], motorcycle: [] };
  const visit = value => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const serialized = normalizeText(JSON.stringify(value));
    const access = normalizeText(value.access_type || value.access || value.value || value.permission || '');
    const state = /denied|prohibited|^no$/.test(access) ? 'prohibited'
      : /destination|customers|delivery|limited|conditional/.test(access) ? 'limited'
        : /allowed|^yes$|designated|permissive/.test(access) ? 'supported' : null;
    if (state && /motorcycle/.test(serialized)) {
      states.motorcycle.push(state);
      evidence.motorcycle.push(`Overture access restriction: ${access}`);
    }
    if (state && /motorcar|automobile|\bcar\b|motor vehicle/.test(serialized)) {
      states.car.push(state);
      evidence.car.push(`Overture access restriction: ${access}`);
    }
    Object.values(value).forEach(visit);
  };
  visit(restrictions);
  const summarize = vehicle => ({
    suitability: states[vehicle].includes('prohibited') ? 'prohibited'
      : states[vehicle].includes('limited') ? 'limited'
        : states[vehicle].includes('supported') ? 'supported' : 'unknown',
    evidence: unique(evidence[vehicle])
  });
  return { car: summarize('car'), motorcycle: summarize('motorcycle') };
}

function roadClassFit(record) {
  const classes = evidenceValues(record?.road_class ?? record?.roadClass ?? record?.class)
    .map(value => normalizeText(value).replaceAll(' ', '_'));
  const surfaces = evidenceValues(record?.road_surface ?? record?.roadSurface ?? record?.surface)
    .map(value => normalizeText(value).replaceAll(' ', '_'));
  const motorRoads = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street']);
  const supported = classes.find(value => motorRoads.has(value));
  const track = classes.includes('track');
  const rough = surfaces.find(value => ['unpaved', 'gravel', 'dirt', 'ground', 'sand'].includes(value));
  const value = supported ? 'supported' : track ? 'limited' : 'unknown';
  const evidence = supported
    ? [`Overture road class=${supported} is a general motor-road class; segment-specific restrictions still apply.`]
    : track ? [`Overture road class=track requires vehicle- and surface-specific review${rough ? ` (${rough})` : ''}.`] : [];
  return {
    car: { suitability: value, evidence },
    motorcycle: { suitability: value, evidence }
  };
}

function resolveSegmentFit(supplied, restriction, roadClass) {
  const resolve = vehicle => {
    const explicit = fitValue(supplied[vehicle]);
    const restricted = fitValue(restriction[vehicle]);
    const inferred = fitValue(roadClass[vehicle]);
    if (explicit.suitability !== 'unknown') return explicit;
    if (['prohibited', 'limited'].includes(restricted.suitability)) return restricted;
    if (restricted.suitability === 'supported') return mergeFit(restricted, inferred);
    return inferred;
  };
  return { car: resolve('car'), motorcycle: resolve('motorcycle') };
}

function evidenceValues(value) {
  return unique(list(value).flatMap(item => {
    if (typeof item === 'string' || typeof item === 'number') return [String(item)];
    if (!item || typeof item !== 'object') return [];
    return [item.value, item.surface, item.class, item.road_class, item.name].filter(Boolean).map(String);
  }));
}

function explicitBoolean(record, field, flagPattern) {
  if (typeof record?.[field] === 'boolean') return record[field];
  const flags = evidenceValues(record?.road_flags || record?.roadFlags || record?.flags);
  return flagPattern && flags.some(value => flagPattern.test(normalizeText(value))) ? true : null;
}

function geometryPoints(value) {
  if (!Array.isArray(value)) return null;
  const points = value.map(point => Array.isArray(point)
    ? { lat: finite(point[0]), lon: finite(point[1]) }
    : { lat: finite(point?.lat), lon: finite(point?.lon ?? point?.lng) });
  return points.length >= 2 && points.every(point => point.lat !== null && point.lon !== null) ? points : null;
}

function recommendationOrder(left, right) {
  const score = item => (item.confidence ?? 0.5) * 100 - Math.min(item.distanceFromBaseKm ?? 100, 100) * 0.3;
  const merit = score(right) - score(left);
  if (merit) return merit;
  return String(left.providerId).localeCompare(String(right.providerId), 'en');
}

function selectDiverseRecords(items, limit) {
  const selected = [];
  const names = new Set();
  const types = new Map();
  for (const item of [...items].sort(recommendationOrder)) {
    const name = normalizeText(item.name);
    const type = normalizeText(item.type).replaceAll(' ', '_');
    // Diversity is a ranking preference, not a reason to discard otherwise useful named
    // evidence below the group's retention limit. Names remain unique and types remain counted.
    const typeLimit = limit;
    if (!name || names.has(name) || (types.get(type) || 0) >= typeLimit) continue;
    selected.push(item);
    names.add(name);
    types.set(type, (types.get(type) || 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function normalizeOverturePlace(record, plan) {
  const providerId = record?.providerId || record?.id;
  const group = groupFor(record?.basic_category || record?.type || record?.category, record?.group);
  const name = String(record?.name || '').trim();
  const lat = finite(record?.lat);
  const lon = finite(record?.lon);
  if (!providerId || !name || !group || lat === null || lon === null) return null;
  if (plan?.bbox && (lon < plan.bbox.west || lon > plan.bbox.east || lat < plan.bbox.south || lat > plan.bbox.north)) return null;
  const addressCountries = unique(list(record.addresses).map(address => String(address?.country || '').trim().toUpperCase()).filter(Boolean));
  const requestedCountry = String(plan.countryCode || '').trim().toUpperCase();
  if (requestedCountry && addressCountries.length && !addressCountries.includes(requestedCountry)) return null;
  const center = pointForPlan(plan);
  const distance = haversineKm(center, { lat, lon });
  const fit = explicitFit(record);
  const sources = sourceRecords(record.sources, OVERTURE_PLACES_SOURCE, providerId);
  return {
    id: String(providerId).startsWith('overture-') ? String(providerId) : `overture-${providerId}`,
    providerId: String(providerId),
    name,
    type: record.basic_category || record.type || record.category,
    category: categoryFor(group),
    group,
    baseId: plan.baseId || null,
    countryCode: plan.countryCode || null,
    lat,
    lon,
    distanceFromBaseKm: distance === null ? null : Math.round(distance * 10) / 10,
    rankingEvidence: {
      confidence: finite(record.confidence),
      distanceFromBaseKm: distance === null ? null : Math.round(distance * 10) / 10,
      method: 'confidence-and-distance-with-per-category-diversity-quota'
    },
    estimatedDetourKm: null,
    provider: 'Overture Maps',
    source: `Overture Maps ${plan.release} Places`,
    sourceUrl: explorerUrl(providerId),
    sources,
    confidence: finite(record.confidence),
    lastChecked: record.lastChecked || record.last_checked || plan.release.slice(0, 10),
    taxonomy: record.taxonomy || null,
    addresses: record.addresses || [],
    boundaryEvidence: addressCountries.length
      ? { status: 'address-country-match', countryCodes: addressCountries }
      : { status: 'bbox-only-country-unverified', countryCodes: [], warning: 'No address-country evidence; retained only because coordinates fall inside the exact extraction bbox.' },
    websites: record.websites || [],
    operatingStatus: record.operating_status || record.operatingStatus || null,
    vehicleFit: { car: fit.car.suitability, motorcycle: fit.motorcycle.suitability },
    vehicleFitEvidence: { car: fit.car.evidence, motorcycle: fit.motorcycle.evidence },
    openingHours: record.opening_hours || record.openingHours || null,
    parkingEvidence: record.parking_evidence || record.parkingEvidence || null,
    accessEvidence: record.access_evidence || record.accessEvidence || null,
    roadSurfaceEvidence: record.road_surface_evidence || record.roadSurfaceEvidence || null,
    status: statusFor(group),
    license: OVERTURE_PLACES_SOURCE.license,
    licenseUrl: OVERTURE_PLACES_SOURCE.licenseUrl,
    attribution: OVERTURE_PLACES_SOURCE.attribution,
    licenceEvidence: unique(sources.slice(1).map(source => source.license).filter(Boolean))
  };
}

export function normalizeOvertureSegment(record, plan) {
  const providerId = record?.providerId || record?.id;
  if (!providerId) return null;
  const restrictions = structuredClone(record.access_restrictions || record.accessRestrictions || []);
  const suppliedFit = explicitFit(record);
  const derivedFit = restrictionFit(restrictions);
  const classFit = roadClassFit(record);
  const subtype = record.subtype || null;
  return {
    id: String(providerId).startsWith('overture-') ? String(providerId) : `overture-${providerId}`,
    providerId: String(providerId),
    provider: 'Overture Maps',
    type: 'transportation-segment',
    subtype,
    roadClass: evidenceValues(record.road_class ?? record.roadClass ?? record.class),
    roadSurface: evidenceValues(record.road_surface ?? record.roadSurface ?? record.surface),
    routes: structuredClone(record.routes || []),
    accessRestrictions: restrictions,
    speedLimits: structuredClone(record.speed_limits || record.speedLimits || []),
    roadFlags: structuredClone(record.road_flags || record.roadFlags || []),
    ferry: typeof record.ferry === 'boolean' ? record.ferry : /ferry/.test(normalizeText(subtype)) ? true : null,
    toll: explicitBoolean(record, 'toll', /(^| )toll(ed)?( |$)/),
    curvatureSignal: finite(record.curvature_signal ?? record.curvatureSignal),
    elevationSignal: finite(record.elevation_signal ?? record.elevationSignal),
    geometry: geometryPoints(record.geometry || record.geometryCoordinates),
    geometryWkbBase64: record.geometry_base64 || record.geometryWkbBase64 || null,
    bbox: structuredClone(record.bbox || null),
    corridorId: record.corridorId || record.corridor_id || null,
    fromAnchorId: record.fromAnchorId || record.from_anchor_id || null,
    toAnchorId: record.toAnchorId || record.to_anchor_id || null,
    vehicleFit: {
      ...resolveSegmentFit(suppliedFit, derivedFit, classFit)
    },
    source: `Overture Maps ${plan.release} Transportation`,
    sourceUrl: explorerUrl(providerId),
    sources: sourceRecords(record.sources, OVERTURE_TRANSPORTATION_SOURCE, providerId),
    confidence: finite(record.confidence),
    lastChecked: record.lastChecked || record.last_checked || plan.release.slice(0, 10),
    release: plan.release,
    license: OVERTURE_TRANSPORTATION_SOURCE.license,
    licenseUrl: OVERTURE_TRANSPORTATION_SOURCE.licenseUrl,
    attribution: OVERTURE_TRANSPORTATION_SOURCE.attribution
  };
}

function normalizedBundle(records, validated, { planIdentity = validated.identity, rawRecords = null } = {}) {
  const normalize = validated.type === 'segment' ? normalizeOvertureSegment : normalizeOverturePlace;
  const seen = new Set();
  const normalized = [];
  for (const record of records || []) {
    const item = normalize(record, validated);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
  }
  normalized.sort((left, right) => (left.group || left.type).localeCompare(right.group || right.type) || recommendationOrder(left, right));
  const groups = validated.type === 'place'
    ? Object.fromEntries(Object.keys(GROUP_LIMITS).map(group => [group,
      selectDiverseRecords(normalized.filter(item => item.group === group), GROUP_LIMITS[group])]))
    : null;
  const sourceAvailable = validated.type === 'place'
    ? Object.fromEntries(Object.keys(GROUP_LIMITS).map(group => [group, normalized.filter(item => item.group === group).length]))
    : { segments: normalized.length };
  const source = validated.type === 'segment' ? OVERTURE_TRANSPORTATION_SOURCE : OVERTURE_PLACES_SOURCE;
  return {
    schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
    planIdentity,
    provider: 'Overture Maps',
    release: validated.release,
    overtureSchemaVersion: validated.overtureSchemaVersion || PINNED_OVERTURE_SCHEMA,
    type: validated.type,
    bbox: validated.bbox,
    basePoint: pointForPlan(validated),
    baseId: validated.baseId,
    countryCode: validated.countryCode,
    records: normalized,
    ...(rawRecords === null ? {} : { rawRecords: structuredClone(rawRecords) }),
    groups,
    counts: validated.type === 'place'
      ? Object.fromEntries(Object.entries(groups).map(([group, items]) => [group, items.length]))
      : { segments: normalized.length },
    sourceAvailable,
    assetProvenance: validated.assets.map(asset => ({ id: asset.id, url: asset.url, rowCount: asset.rowCount ?? null })),
    retrievedAt: validated.retrievedAt || null,
    license: source.license,
    attribution: source.attribution
  };
}

export function normalizeOvertureExtraction(records, plan) {
  const validated = validateOverturePlan(plan);
  if (validated.mode === 'batch') throw new TypeError('Batch plans require normalizeOvertureBatchExtraction');
  return normalizedBundle(records, validated, { rawRecords: records || [] });
}

export function normalizeOvertureBatchExtraction(envelopes, plan) {
  const validated = validateOverturePlan(plan);
  if (validated.mode !== 'batch' || !Array.isArray(validated.requests)) throw new TypeError('A validated batch Overture plan is required');
  const requests = new Map(validated.requests.map(request => [request.baseId, request]));
  const recordsByBase = new Map(validated.requests.map(request => [request.baseId, []]));
  for (const envelope of envelopes || []) {
    if (!requests.has(envelope?.baseId) || !envelope?.record) {
      throw new Error(`Raw Overture batch row has an unknown or missing baseId: ${envelope?.baseId || '(missing)'}`);
    }
    recordsByBase.get(envelope.baseId).push(envelope.record);
  }
  const bundles = validated.requests.map(request => normalizedBundle(recordsByBase.get(request.baseId), {
    ...validated,
    mode: 'single',
    bbox: request.bbox,
    basePoint: request.basePoint,
    baseId: request.baseId,
    countryCode: request.countryCode || validated.countryCode
  }, { planIdentity: validated.identity }));
  const records = bundles.flatMap(bundle => bundle.records);
  const keys = validated.type === 'place' ? Object.keys(GROUP_LIMITS) : ['segments'];
  const sum = field => Object.fromEntries(keys.map(key => [key, bundles.reduce((total, bundle) => total + Number(bundle[field][key] || 0), 0)]));
  const source = validated.type === 'segment' ? OVERTURE_TRANSPORTATION_SOURCE : OVERTURE_PLACES_SOURCE;
  return {
    schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
    mode: 'batch',
    planIdentity: validated.identity,
    provider: 'Overture Maps',
    release: validated.release,
    overtureSchemaVersion: validated.overtureSchemaVersion || PINNED_OVERTURE_SCHEMA,
    type: validated.type,
    countryCode: validated.countryCode,
    records,
    rawRecords: structuredClone(envelopes || []),
    bundles,
    counts: sum('counts'),
    sourceAvailable: sum('sourceAvailable'),
    assetProvenance: validated.assets.map(asset => ({ id: asset.id, url: asset.url, rowCount: asset.rowCount ?? null })),
    retrievedAt: plan.retrievedAt || null,
    license: source.license,
    attribution: source.attribution
  };
}

function itemSources(item) {
  if (Array.isArray(item?.sources) && item.sources.length) return item.sources;
  return item?.provider || item?.providerId
    ? [{ provider: item.provider || 'Unknown provider', id: item.providerId || item.id || null, url: item.sourceUrl || null }]
    : [];
}

function sameNamedPlace(left, right) {
  if (left.category !== right.category || normalizeText(left.name) !== normalizeText(right.name)) return false;
  const distance = haversineKm(left, right);
  return distance !== null && distance <= 0.5;
}

function mergeRecommendation(existing, overture) {
  const sources = [...itemSources(existing), ...itemSources(overture)].filter((source, index, all) => all.findIndex(candidate =>
    `${candidate.provider || ''}:${candidate.dataset || ''}:${candidate.id || ''}:${candidate.property || ''}` ===
    `${source.provider || ''}:${source.dataset || ''}:${source.id || ''}:${source.property || ''}`) === index);
  const car = mergeFit(
    { suitability: existing.vehicleFit?.car, evidence: existing.vehicleFitEvidence?.car },
    { suitability: overture.vehicleFit?.car, evidence: overture.vehicleFitEvidence?.car }
  );
  const motorcycle = mergeFit(
    { suitability: existing.vehicleFit?.motorcycle, evidence: existing.vehicleFitEvidence?.motorcycle },
    { suitability: overture.vehicleFit?.motorcycle, evidence: overture.vehicleFitEvidence?.motorcycle }
  );
  const distances = [existing.distanceFromBaseKm, overture.distanceFromBaseKm].filter(Number.isFinite);
  return {
    ...structuredClone(existing),
    distanceFromBaseKm: distances.length ? Math.min(...distances) : null,
    confidence: Math.max(existing.confidence ?? 0, overture.confidence ?? 0) || null,
    openingHours: existing.openingHours || overture.openingHours || null,
    parkingEvidence: existing.parkingEvidence || overture.parkingEvidence || null,
    accessEvidence: existing.accessEvidence || overture.accessEvidence || null,
    roadSurfaceEvidence: existing.roadSurfaceEvidence || overture.roadSurfaceEvidence || null,
    vehicleFit: { car: car.suitability, motorcycle: motorcycle.suitability },
    vehicleFitEvidence: { car: car.evidence, motorcycle: motorcycle.evidence },
    sources,
    overtureEvidence: {
      providerId: overture.providerId,
      sourceUrl: overture.sourceUrl,
      status: overture.status
    }
  };
}

function aggregateSegments(bundle) {
  const segments = (bundle?.records || []).filter(record => record.type === 'transportation-segment');
  const summarizeFit = vehicle => {
    const fits = segments.map(segment => fitValue(segment.vehicleFit?.[vehicle]));
    const suitability = fits.some(fit => fit.suitability === 'supported') ? 'supported'
      : fits.some(fit => fit.suitability === 'limited') ? 'limited'
        : fits.some(fit => fit.suitability === 'prohibited') ? 'prohibited' : 'unknown';
    return { suitability, evidence: unique(fits.flatMap(fit => fit.evidence)) };
  };
  return {
    segments,
    roadClass: unique(segments.flatMap(record => list(record.roadClass))),
    surface: unique(segments.flatMap(record => list(record.roadSurface))),
    sourceIds: unique(segments.map(record => record.providerId)).slice(0, 50),
    accessRestrictions: segments.flatMap(record => list(record.accessRestrictions)).slice(0, 50),
    speedLimits: segments.flatMap(record => list(record.speedLimits)).slice(0, 50),
    routes: segments.flatMap(record => list(record.routes)).slice(0, 50),
    ferry: segments.some(record => record.ferry === true) ? true : null,
    toll: segments.some(record => record.toll === true) ? true : null,
    curvatureSignal: Math.max(...segments.map(record => record.curvatureSignal).filter(Number.isFinite), -Infinity),
    elevationSignal: Math.max(...segments.map(record => record.elevationSignal).filter(Number.isFinite), -Infinity),
    vehicleFit: {
      car: summarizeFit('car'),
      motorcycle: summarizeFit('motorcycle')
    }
  };
}

function mergeAnchorFit(existing, incoming) {
  return mergeFit(existing, incoming);
}

export function mergeOvertureBaseEvidence(base, { places = null, segments = null } = {}) {
  if (!places && !segments) {
    const unchanged = structuredClone(base);
    const metadata = unchanged.overtureEnrichment;
    if (metadata && !metadata.release && !metadata.placePlanIdentity && !metadata.segmentPlanIdentity) {
      delete unchanged.overtureEnrichment;
    }
    return unchanged;
  }
  if (places?.baseId && places.baseId !== base.id) return structuredClone(base);
  if (segments?.baseId && segments.baseId !== base.id) return structuredClone(base);
  const recommendations = structuredClone(base.recommendations || { pois: [], accommodations: [], restaurants: [], services: [] });
  for (const group of Object.keys(GROUP_LIMITS)) {
    recommendations[group] ||= [];
    for (const item of places?.groups?.[group] || []) {
      const duplicate = recommendations[group].findIndex(existing => sameNamedPlace(existing, item));
      if (duplicate >= 0) recommendations[group][duplicate] = mergeRecommendation(recommendations[group][duplicate], item);
      else recommendations[group].push(structuredClone(item));
    }
    recommendations[group] = recommendations[group].sort(recommendationOrder).slice(0, GROUP_LIMITS[group]);
  }
  const aggregate = aggregateSegments(segments);
  const sources = [...(base.sources || [])];
  if (places) sources.push({ ...OVERTURE_PLACES_SOURCE, id: places.planIdentity,
    release: places.release, planIdentity: places.planIdentity });
  if (segments) sources.push({ ...OVERTURE_TRANSPORTATION_SOURCE, id: segments.planIdentity,
    release: segments.release, planIdentity: segments.planIdentity });
  return {
    ...structuredClone(base),
    recommendations,
    roadAccess: aggregate.segments.length ? {
      ...(base.roadAccess || {}),
      highwayClasses: unique([...(base.roadAccess?.highwayClasses || []), ...aggregate.roadClass]),
      accessRestrictions: [...(base.roadAccess?.accessRestrictions || []), ...aggregate.accessRestrictions],
      speedLimits: [...(base.roadAccess?.speedLimits || []), ...aggregate.speedLimits],
      sourceIds: unique([...(base.roadAccess?.sourceIds || []), ...aggregate.sourceIds]),
      evidence: 'Nearby Overture Transportation segments; not a routed access guarantee.'
    } : base.roadAccess || null,
    roadSurface: aggregate.surface.length ? {
      ...(base.roadSurface || {}),
      values: unique([...(base.roadSurface?.values || []), ...aggregate.surface]),
      sourceIds: unique([...(base.roadSurface?.sourceIds || []), ...aggregate.sourceIds]),
      evidence: 'Observed on nearby Overture Transportation segments; corridor-wide surface is not verified.'
    } : base.roadSurface || null,
    vehicleFit: {
      car: mergeAnchorFit(base.vehicleFit?.car, aggregate.vehicleFit.car),
      motorcycle: mergeAnchorFit(base.vehicleFit?.motorcycle, aggregate.vehicleFit.motorcycle)
    },
    sources: uniqueSources(sources),
    overtureEnrichment: {
      schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
      release: places?.release || segments?.release || null,
      retrievedAt: places?.retrievedAt || segments?.retrievedAt || null,
      placePlanIdentity: places?.planIdentity || null,
      segmentPlanIdentity: segments?.planIdentity || null,
      counts: {
        pois: places?.counts?.pois || 0,
        accommodations: places?.counts?.accommodations || 0,
        restaurants: places?.counts?.restaurants || 0,
        services: places?.counts?.services || 0,
        segments: aggregate.segments.length
      },
      sourceAvailable: {
        pois: places?.sourceAvailable?.pois || 0,
        accommodations: places?.sourceAvailable?.accommodations || 0,
        restaurants: places?.sourceAvailable?.restaurants || 0,
        services: places?.sourceAvailable?.services || 0,
        segments: segments?.sourceAvailable?.segments || segments?.records?.length || 0
      }
    }
  };
}

function geometryEvidence(segments) {
  return segments.filter(record => record.geometryWkbBase64 || record.geometry).map(record => ({
    providerId: record.providerId,
    bbox: record.bbox,
    encoding: record.geometryWkbBase64 ? 'wkb-base64' : 'coordinate-array',
    value: record.geometryWkbBase64 || record.geometry,
    sourceUrl: record.sourceUrl
  }));
}

export function mergeOvertureCorridorEvidence(corridor, segmentBundle) {
  const aggregate = aggregateSegments(segmentBundle);
  if (!aggregate.segments.length) return structuredClone(corridor);
  const explicitGeometry = aggregate.segments.find(record => record.geometry && record.corridorId === corridor.id)?.geometry || null;
  const sources = uniqueSources([...(corridor.sources || (corridor.source ? [corridor.source] : [])), {
    ...OVERTURE_TRANSPORTATION_SOURCE,
    release: segmentBundle.release,
    planIdentity: segmentBundle.planIdentity
  }]);
  return {
    ...structuredClone(corridor),
    roadClass: unique([...list(corridor.roadClass), ...aggregate.roadClass]),
    surface: unique([...list(corridor.surface), ...aggregate.surface]),
    accessRestrictions: [...(corridor.accessRestrictions || []), ...aggregate.accessRestrictions],
    speedLimits: [...(corridor.speedLimits || []), ...aggregate.speedLimits],
    routes: [...(corridor.routes || []), ...aggregate.routes],
    ferry: aggregate.ferry === true ? true : corridor.ferry ?? null,
    toll: aggregate.toll === true ? true : corridor.toll ?? null,
    curvatureSignal: aggregate.curvatureSignal === -Infinity ? corridor.curvatureSignal ?? null : aggregate.curvatureSignal,
    elevationSignal: aggregate.elevationSignal === -Infinity ? corridor.elevationSignal ?? null : aggregate.elevationSignal,
    geometry: explicitGeometry || corridor.geometry,
    geometryType: explicitGeometry ? 'overture-segment-coordinates' : corridor.geometryType,
    geometrySource: explicitGeometry ? 'Overture Transportation explicitly linked corridor geometry' : corridor.geometrySource,
    geometryEvidence: geometryEvidence(aggregate.segments),
    vehicleCompatibility: {
      car: mergeAnchorFit(corridor.vehicleCompatibility?.car, aggregate.vehicleFit.car),
      motorcycle: mergeAnchorFit(corridor.vehicleCompatibility?.motorcycle, aggregate.vehicleFit.motorcycle)
    },
    sourceIds: unique([...(corridor.sourceIds || []), ...aggregate.sourceIds]),
    sources,
    evidence: unique([
      ...(corridor.evidence || []),
      ...aggregate.roadClass.map(value => `Overture road class=${value}`),
      ...aggregate.surface.map(value => `Overture road surface=${value}`),
      ...(aggregate.accessRestrictions.length ? ['Overture access-restriction evidence retained'] : []),
      ...(aggregate.speedLimits.length ? ['Overture speed-limit evidence retained'] : []),
      ...(aggregate.ferry === true ? ['Overture ferry evidence'] : []),
      ...(aggregate.toll === true ? ['Overture toll evidence'] : [])
    ]),
    overtureEvidence: {
      schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
      release: segmentBundle.release,
      planIdentity: segmentBundle.planIdentity,
      segmentCount: aggregate.segments.length,
      license: OVERTURE_TRANSPORTATION_SOURCE.license,
      attribution: OVERTURE_TRANSPORTATION_SOURCE.attribution
    }
  };
}

function mergeOvertureEndpointEvidence(corridor, segmentBundles) {
  const bundles = (segmentBundles || []).filter(Boolean);
  const aggregate = aggregateSegments({ records: bundles.flatMap(bundle => bundle.records || []) });
  if (!aggregate.segments.length) return structuredClone(corridor);
  const baseIds = unique(bundles.map(bundle => bundle.baseId));
  const sources = uniqueSources([...(corridor.sources || (corridor.source ? [corridor.source] : [])), {
    ...OVERTURE_TRANSPORTATION_SOURCE,
    release: bundles[0].release,
    planIdentity: bundles[0].planIdentity,
    evidenceScope: 'corridor-endpoint-context'
  }]);
  return {
    ...structuredClone(corridor),
    sourceIds: unique([...(corridor.sourceIds || []), ...aggregate.sourceIds]).slice(0, 50),
    sources,
    evidence: unique([
      ...(corridor.evidence || []),
      `Overture Transportation road evidence sampled near catalogue endpoint${baseIds.length === 1 ? '' : 's'} ${baseIds.join(', ')}; full corridor routing, surface and access are not verified.`
    ]),
    overtureEndpointEvidence: {
      schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
      release: bundles[0].release,
      planIdentities: unique(bundles.map(bundle => bundle.planIdentity)),
      baseIds,
      sourceIds: aggregate.sourceIds,
      roadClasses: aggregate.roadClass,
      surfaces: aggregate.surface,
      vehicleFit: aggregate.vehicleFit,
      license: OVERTURE_TRANSPORTATION_SOURCE.license,
      attribution: OVERTURE_TRANSPORTATION_SOURCE.attribution,
      warning: 'Endpoint road context only; not evidence for the complete connecting corridor.'
    }
  };
}

function packStats(anchors, corridors) {
  const recommendations = anchors.flatMap(anchor => Object.values(anchor.recommendations || {}).flat());
  return {
    anchors: anchors.length,
    corridors: corridors.length,
    pois: recommendations.filter(item => item.category === 'poi').length,
    accommodations: recommendations.filter(item => item.category === 'accommodation').length,
    restaurants: recommendations.filter(item => item.category === 'restaurant').length,
    services: recommendations.filter(item => item.category === 'service').length,
    namedRecommendations: recommendations.length
  };
}

export function mergePackOvertureEvidence(pack, { placeBundles = [], segmentBundles = [], corridorBundles = [] } = {}) {
  const placesByBase = new Map(placeBundles.filter(bundle => bundle?.baseId).map(bundle => [bundle.baseId, bundle]));
  const segmentsByBase = new Map(segmentBundles.filter(bundle => bundle?.baseId).map(bundle => [bundle.baseId, bundle]));
  const anchors = (pack.anchors || []).map(base => mergeOvertureBaseEvidence(base, {
    places: placesByBase.get(base.id) || null,
    segments: segmentsByBase.get(base.id) || null
  }));
  const linkedCorridors = new Map(corridorBundles.map(entry => [entry.corridorId || entry.bundle?.corridorId, entry.bundle || entry])
    .filter(([corridorId]) => corridorId));
  let corridors = (pack.corridors || []).map(corridor => linkedCorridors.has(corridor.id)
    ? mergeOvertureCorridorEvidence(corridor, linkedCorridors.get(corridor.id)) : structuredClone(corridor));
  const endpointBundles = new Map();
  for (const bundle of segmentBundles.filter(bundle => bundle?.baseId && bundle.records?.length)) {
    const candidate = corridors.filter(corridor => corridor.fromAnchorId === bundle.baseId || corridor.toAnchorId === bundle.baseId)
      .sort((left, right) => Number(left.distanceKm || Infinity) - Number(right.distanceKm || Infinity)
        || left.id.localeCompare(right.id, 'en'))[0];
    if (!candidate) continue;
    if (!endpointBundles.has(candidate.id)) endpointBundles.set(candidate.id, []);
    endpointBundles.get(candidate.id).push(bundle);
  }
  corridors = corridors.map(corridor => endpointBundles.has(corridor.id)
    ? mergeOvertureEndpointEvidence(corridor, endpointBundles.get(corridor.id)) : corridor);
  const bundles = [...placeBundles, ...segmentBundles, ...linkedCorridors.values()].filter(Boolean);
  const planIdentities = unique(bundles.map(bundle => bundle.planIdentity));
  const retrievedAt = bundles.map(bundle => bundle.retrievedAt).filter(Boolean).sort().at(-1) || null;
  const hasPlaces = placeBundles.length > 0;
  const hasTransportation = segmentBundles.length > 0 || linkedCorridors.size > 0;
  const sources = [...(pack.sources || [])];
  if (hasPlaces) sources.push({ ...OVERTURE_PLACES_SOURCE, release: placeBundles[0]?.release || null,
    overtureSchemaVersion: placeBundles[0]?.overtureSchemaVersion || PINNED_OVERTURE_SCHEMA });
  if (hasTransportation) sources.push({ ...OVERTURE_TRANSPORTATION_SOURCE,
    release: (segmentBundles[0] || linkedCorridors.values().next().value)?.release || null,
    overtureSchemaVersion: (segmentBundles[0] || linkedCorridors.values().next().value)?.overtureSchemaVersion || PINNED_OVERTURE_SCHEMA });
  return {
    ...structuredClone(pack),
    dataVersion: bundles.length
      ? `${String(pack.dataVersion || '').split('+overture-')[0]}+overture-${bundles[0]?.release || 'unknown'}`
      : pack.dataVersion,
    anchors,
    corridors,
    stats: packStats(anchors, corridors),
    sources: uniqueSources(sources),
    enrichments: {
      ...(pack.enrichments || {}),
      overtureMaps: {
        schemaVersion: OVERTURE_EXTRACTION_SCHEMA_VERSION,
        release: bundles[0]?.release || null,
        overtureSchemaVersion: bundles[0]?.overtureSchemaVersion || PINNED_OVERTURE_SCHEMA,
        enrichedBaseCount: new Set([...placesByBase.keys(), ...segmentsByBase.keys()]).size,
        retrievedAt,
        planIdentities,
        license: hasPlaces && hasTransportation ? `${OVERTURE_PLACES_SOURCE.license}; ${OVERTURE_TRANSPORTATION_SOURCE.license}`
          : hasTransportation ? OVERTURE_TRANSPORTATION_SOURCE.license : OVERTURE_PLACES_SOURCE.license,
        attribution: hasTransportation ? OVERTURE_TRANSPORTATION_SOURCE.attribution : OVERTURE_PLACES_SOURCE.attribution
      }
    }
  };
}
