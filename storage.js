import { ENGINE_VERSION, STORAGE_SCHEMA_VERSION } from './config.js';
import { normalizeTrip } from './trip-model.js';

export const STORAGE_KEYS = {
  current: 'reisslim.current.v10', trips: 'reisslim.trips.v10',
  legacyCurrent: ['reisslim.current.v9', 'reisslim.current.v8', 'reisslim.current.v7', 'reisslim.current.v6', 'reisslim.current.v5', 'reisslim.current.v4', 'reisslim.current.v3', 'reisslim.current.v2', 'reisslim.current'],
  legacyTrips: ['reisslim.trips.v9', 'reisslim.trips.v8', 'reisslim.trips.v7', 'reisslim.trips.v6', 'reisslim.trips.v5', 'reisslim.trips.v4', 'reisslim.trips.v3', 'reisslim.trips.v2']
};

export const COMPACT_SNAPSHOT_FORMAT = 'compact-v1';
export const MAX_SAVED_RECORD_CHARACTERS = 160_000;
export const MAX_SAVED_TRIPS_CHARACTERS = 900_000;
const MAX_SAVED_TRIPS = 20;

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

const normalizeText = value => String(value || '').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
const boundedText = (value, maximum = 800) => value === null || value === undefined ? null : String(value).slice(0, maximum);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

function boundedValue(value, depth = 0) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return boundedText(value, depth ? 600 : 1200);
  if (depth >= 3) return null;
  if (Array.isArray(value)) return value.slice(0, 24).map(item => boundedValue(item, depth + 1)).filter(item => item !== null);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 36)
      .map(([key, item]) => [key, boundedValue(item, depth + 1)])
      .filter(([, item]) => item !== null && item !== undefined));
  }
  return null;
}

function safeUrl(value) {
  const url = boundedText(value, 2048);
  return url && !/^(data|blob):/i.test(url) ? url : null;
}

function compactPoint(value) {
  const lat = finite(value?.lat ?? value?.point?.lat);
  const lon = finite(value?.lon ?? value?.point?.lon);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    lat,
    lon,
    ...(['name', 'role', 'source', 'providerId', 'confidence', 'approximate']
      .filter(key => value?.[key] !== undefined)
      .reduce((result, key) => ({ ...result, [key]: boundedValue(value[key], 1) }), {}))
  };
}

function compactGeometry(value) {
  const points = (Array.isArray(value) ? value : []).map(compactPoint).filter(Boolean);
  if (points.length <= 2) return points;
  return [points[0], points.at(-1)];
}

function compactBase(base) {
  const point = compactPoint(base);
  if (!point || !base?.name) return null;
  return {
    id: boundedText(base.id, 160), providerId: boundedText(base.providerId, 160), name: boundedText(base.name, 160),
    ...point, sourceUrl: safeUrl(base.sourceUrl), confidence: boundedValue(base.confidence),
    tags: (base.tags || []).slice(0, 20).map(tag => boundedText(tag, 80)),
    vehicleFit: boundedValue(base.vehicleFit), vehicleFitEvidence: boundedValue(base.vehicleFitEvidence)
  };
}

function compactHighlight(item) {
  const point = compactPoint(item?.point || item);
  const overnightPoint = compactPoint(item?.overnightPoint || item?.point || item);
  if (!item?.name || !point || !overnightPoint) return null;
  return {
    id: boundedText(item.id, 180), providerId: boundedText(item.providerId, 180), name: boundedText(item.name, 180),
    baseName: boundedText(item.baseName || item.name, 180), point, overnightPoint,
    sequence: finite(item.sequence), priority: finite(item.priority), minimumTripDays: finite(item.minimumTripDays), minimumNights: finite(item.minimumNights),
    tags: (item.tags || []).slice(0, 20).map(tag => boundedText(tag, 80)), activity: boundedText(item.activity, 700),
    rainAlternative: boundedText(item.rainAlternative, 700), evidence: boundedValue(item.evidence), gateway: Boolean(item.gateway),
    remote: Boolean(item.remote), contextOnly: Boolean(item.contextOnly), distanceFromRegionKm: finite(item.distanceFromRegionKm),
    roadEvidence: boundedValue(item.roadEvidence), vehicleFit: boundedValue(item.vehicleFit), vehicleFitEvidence: boundedValue(item.vehicleFitEvidence),
    sourceUrl: safeUrl(item.sourceUrl), confidence: boundedValue(item.confidence), fetchedAt: boundedText(item.fetchedAt, 80), catalogue: Boolean(item.catalogue)
  };
}

function compactCorridor(item) {
  const geometry = compactGeometry(item?.fallbackGeometry || item?.geometry);
  if (!item?.id && !item?.from && !item?.fromAnchorId) return null;
  return {
    id: boundedText(item.id, 180), fromAnchorId: boundedText(item.fromAnchorId, 180), toAnchorId: boundedText(item.toAnchorId, 180),
    from: boundedText(item.from, 180), to: boundedText(item.to, 180), fromName: boundedText(item.fromName, 180), toName: boundedText(item.toName, 180),
    name: boundedText(item.name, 240), intermediateAnchorIds: (item.intermediateAnchorIds || []).slice(0, 12).map(id => boundedText(id, 180)),
    distanceKm: finite(item.distanceKm), carMovingHours: finite(item.carMovingHours ?? item.carHours), carHours: finite(item.carHours ?? item.carMovingHours),
    motorcycleMovingHours: finite(item.motorcycleMovingHours), motorcycleElapsedHours: finite(item.motorcycleElapsedHours),
    scenicValue: finite(item.scenicValue), curvatureSignal: finite(item.curvatureSignal), elevationSignal: finite(item.elevationSignal),
    surface: boundedValue(item.surface), roadClass: boundedValue(item.roadClass), ferry: boundedValue(item.ferry), toll: boundedValue(item.toll),
    fuelServiceSpacingKm: finite(item.fuelServiceSpacingKm), serviceEvidence: finite(item.serviceEvidence),
    vehicleCompatibility: boundedValue(item.vehicleCompatibility), sourceIds: (item.sourceIds || []).slice(0, 16).map(id => boundedText(id, 180)),
    evidence: boundedValue(item.evidence), seasonalLimitations: boundedValue(item.seasonalLimitations), fallbackGeometry: geometry,
    geometryType: geometry.length > 1 ? 'compact-endpoints' : boundedText(item.geometryType, 80), geometrySource: boundedText(item.geometrySource, 180),
    estimateMethod: boundedText(item.estimateMethod, 180), source: boundedValue(item.source), sourceUrl: safeUrl(item.sourceUrl),
    providerId: boundedText(item.providerId, 180), confidenceScore: finite(item.confidenceScore), confidence: boundedValue(item.confidence)
  };
}

function compactRecommendation(item) {
  const point = compactPoint(item?.point || item);
  if (!item?.name || !point) return null;
  return {
    id: boundedText(item.id, 200), providerId: boundedText(item.providerId, 200), provider: boundedText(item.provider, 160),
    name: boundedText(item.name, 220), type: boundedText(item.type, 80), point, associatedBase: boundedText(item.associatedBase, 180),
    vehicleFit: boundedValue(item.vehicleFit), prohibitedVehicles: (item.prohibitedVehicles || []).slice(0, 6).map(value => boundedText(value, 40)),
    vehicleFitEvidence: boundedValue(item.vehicleFitEvidence), vehicleCategoryEvidence: boundedValue(item.vehicleCategoryEvidence),
    parkingEvidence: boundedValue(item.parkingEvidence), accessEvidence: boundedValue(item.accessEvidence),
    sourceVehicleFit: boundedValue(item.sourceVehicleFit),
    openingHours: boundedText(item.openingHours, 400), source: boundedText(item.source, 180), sourceUrl: safeUrl(item.sourceUrl), url: safeUrl(item.url),
    confidence: boundedValue(item.confidence), lastChecked: boundedText(item.lastChecked, 80), license: boundedText(item.license, 180),
    verified: false, live: false, catalogue: Boolean(item.catalogue), genericFallback: Boolean(item.genericFallback),
    availabilityWarning: boundedText(item.availabilityWarning, 500), reason: boundedText(item.reason, 700),
    vehicleProfileId: boundedText(item.vehicleProfileId, 40), vehicleFitExplanation: boundedText(item.vehicleFitExplanation, 700)
  };
}

function recommendationLimits(level) {
  if (level >= 5) return { activity: 1, accommodation: 1, restaurant: 1, fuel: 1, rest: 0, service: 0, default: 0 };
  if (level === 4) return { activity: 2, accommodation: 2, restaurant: 1, fuel: 1, rest: 1, service: 1, default: 1 };
  if (level >= 3) return { activity: 3, accommodation: 2, restaurant: 1, fuel: 1, rest: 1, service: 1, default: 1 };
  if (level === 2) return { activity: 5, accommodation: 3, restaurant: 2, fuel: 2, rest: 2, service: 2, default: 2 };
  if (level === 1) return { activity: 8, accommodation: 5, restaurant: 3, fuel: 3, rest: 3, service: 3, default: 3 };
  return { activity: 15, accommodation: 8, restaurant: 5, fuel: 4, rest: 4, service: 4, default: 4 };
}

function compactRecommendations(items, baseNames, level) {
  const limits = recommendationLimits(level);
  const counts = new Map();
  const output = [];
  for (const item of items || []) {
    const base = normalizeText(item?.associatedBase);
    if (baseNames.size && !baseNames.has(base)) continue;
    const type = normalizeText(item?.type) || 'default';
    const key = `${base}|${type}`;
    const limit = limits[type] ?? limits.default;
    if ((counts.get(key) || 0) >= limit) continue;
    const compact = compactRecommendation(item);
    if (!compact) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
    output.push(compact);
  }
  return output;
}

export function compactDestinationProfile(profile, { level = 0 } = {}) {
  if (!profile || typeof profile !== 'object' || (!profile.dynamic && !profile.catalogue)) return null;
  const bases = (profile.bases || []).map(compactBase).filter(Boolean).slice(0, 10);
  const baseNames = new Set(bases.map(base => normalizeText(base.name)));
  const highlightLimit = [64, 42, 28, 18, 12, 10][Math.max(0, Math.min(5, level))];
  const highlights = (profile.highlights || []).slice().sort((left, right) => {
    const leftBase = baseNames.has(normalizeText(left?.baseName));
    const rightBase = baseNames.has(normalizeText(right?.baseName));
    return Number(right?.gateway) - Number(left?.gateway) || Number(rightBase) - Number(leftBase)
      || Number(right?.priority || 0) - Number(left?.priority || 0) || Number(left?.sequence || 0) - Number(right?.sequence || 0);
  }).map(compactHighlight).filter(Boolean).slice(0, highlightLimit);
  const anchorIds = new Set([...bases.map(base => base.id), ...highlights.map(item => item.id)].filter(Boolean));
  const corridorLimit = [96, 64, 40, 24, 16, 12][Math.max(0, Math.min(5, level))];
  const corridors = (profile.corridors || []).slice().sort((left, right) => {
    const leftTouches = Number(anchorIds.has(left?.fromAnchorId || left?.from)) + Number(anchorIds.has(left?.toAnchorId || left?.to));
    const rightTouches = Number(anchorIds.has(right?.fromAnchorId || right?.from)) + Number(anchorIds.has(right?.toAnchorId || right?.to));
    return rightTouches - leftTouches || Number(right?.confidenceScore || 0) - Number(left?.confidenceScore || 0);
  }).map(compactCorridor).filter(Boolean).slice(0, corridorLimit);
  const catalogueRecommendations = compactRecommendations(profile.catalogueRecommendations || [], baseNames, level);
  const compact = {};
  const omitted = new Set([
    'bases', 'accessGateway', 'highlights', 'activities', 'corridors', 'catalogueRecommendations', 'recommendations', 'routeStops',
    'score', 'dimensions', 'estimate', 'budget', 'route', 'matches', 'intentMatch', 'minimumDays', 'feasible', 'category',
    'constraintStatus', 'destinationConstraintStatus', 'compromises', 'planQuality', 'planQualityStatus', 'planStructure', 'previewBudget'
  ]);
  for (const [key, value] of Object.entries(profile)) {
    if (omitted.has(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) compact[key] = boundedValue(value);
  }
  Object.assign(compact, {
    tags: (profile.tags || []).slice(0, 30).map(tag => boundedText(tag, 80)),
    season: (profile.season || []).slice(0, 12).map(Number).filter(Number.isFinite),
    pros: (profile.pros || []).slice(0, 12).map(item => boundedText(item, 500)),
    cons: (profile.cons || []).slice(0, 12).map(item => boundedText(item, 500)),
    bases,
    accessGateway: compactBase(profile.accessGateway) || compactPoint(profile.accessGateway),
    highlights,
    activities: (profile.activities || []).slice(0, highlightLimit).map(item => ({
      type: boundedText(item?.type, 80), title: boundedText(item?.title, 700), rainAlternative: boundedText(item?.rainAlternative, 700),
      tags: (item?.tags || []).slice(0, 20).map(tag => boundedText(tag, 80))
    })),
    corridors,
    catalogueRecommendations,
    routeStops: (profile.routeStops || []).slice(0, 20).map(compactPoint).filter(Boolean),
    evidence: boundedValue(profile.evidence), provider: boundedValue(profile.provider), destinationScope: boundedValue(profile.destinationScope),
    vehicleEvidence: boundedValue(profile.vehicleEvidence), image: profile.image ? {
      url: safeUrl(profile.image.url), sourceUrl: safeUrl(profile.image.sourceUrl), attribution: boundedText(profile.image.attribution, 500),
      author: boundedText(profile.image.author, 240), license: boundedText(profile.image.license, 160)
    } : null
  });
  return compact;
}

export function compactSavedState(input = {}) {
  if (!input || typeof input !== 'object' || !input.trip) return null;
  const trip = normalizeTrip(input.trip);
  const sourceProfile = input.destinationProfile?.dynamic || input.destinationProfile?.catalogue ? input.destinationProfile : null;
  const recommendationVehicles = [...new Set([...(sourceProfile?.catalogueRecommendations || []), ...(sourceProfile?.recommendations || [])]
    .map(item => item?.vehicleProfileId).filter(Boolean))];
  const profileVehicle = sourceProfile?.vehicleProfileId || (recommendationVehicles.length === 1 ? recommendationVehicles[0] : null);
  const vehicleProfileInvalidated = Boolean(profileVehicle && profileVehicle !== trip.transport);
  let record = null;
  for (let level = 0; level <= 5; level += 1) {
    const destinationProfile = vehicleProfileInvalidated ? null : compactDestinationProfile(sourceProfile, { level });
    record = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      snapshotFormat: COMPACT_SNAPSHOT_FORMAT,
      compactionLevel: level,
      trip,
      destinationId: vehicleProfileInvalidated ? null : input.destinationId || input.destination?.id || destinationProfile?.id || null,
      destinationProfile,
      compareIds: Array.isArray(input.compareIds) ? input.compareIds.slice(0, 4) : [],
      savedProposalIds: Array.isArray(input.savedProposalIds) ? input.savedProposalIds.slice(0, 40) : [],
      dismissedIds: Array.isArray(input.dismissedIds) ? input.dismissedIds.slice(0, 100) : [],
      selectedVariantId: input.selectedVariantId || null,
      optimized: Boolean(input.optimized),
      vehicleProfileInvalidated,
      needsRebuild: true,
      savedAt: input.savedAt || new Date().toISOString()
    };
    if (JSON.stringify(record).length <= MAX_SAVED_RECORD_CHARACTERS) break;
  }
  if (JSON.stringify(record).length > MAX_SAVED_RECORD_CHARACTERS && record.destinationProfile) {
    record.compactionLevel = 6;
    record.destinationProfile = {
      ...record.destinationProfile,
      highlights: (record.destinationProfile.highlights || []).slice(0, 10),
      corridors: (record.destinationProfile.corridors || []).slice(0, 8),
      catalogueRecommendations: (record.destinationProfile.catalogueRecommendations || []).slice(0, 12),
      activities: (record.destinationProfile.activities || []).slice(0, 10)
    };
  }
  if (JSON.stringify(record).length > MAX_SAVED_RECORD_CHARACTERS && record.destinationProfile) {
    record.compactionLevel = 7;
    record.destinationProfile = {
      ...record.destinationProfile,
      highlights: (record.destinationProfile.highlights || []).slice(0, 8),
      corridors: (record.destinationProfile.corridors || []).slice(0, 4),
      catalogueRecommendations: [],
      activities: (record.destinationProfile.activities || []).slice(0, 8),
      evidence: null,
      provider: null,
      vehicleEvidence: null,
      image: null
    };
  }
  return record;
}

export function migrateState(input) {
  return compactSavedState(input);
}

function readFirst(storage, keys) {
  for (const key of keys) {
    let value = null;
    try { value = safeParse(storage.getItem(key), null); } catch { value = null; }
    if (value) return { key, value };
  }
  return null;
}

function quotaExceeded(error) {
  return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014;
}

function sortedUniqueRecords(records) {
  const seen = new Set();
  return (records || []).map(compactSavedState).filter(Boolean)
    .sort((left, right) => new Date(right.savedAt || 0) - new Date(left.savedAt || 0))
    .filter(record => {
      const id = record.trip?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function fitTripList(records) {
  const fitted = sortedUniqueRecords(records).slice(0, MAX_SAVED_TRIPS);
  while (fitted.length > 1 && JSON.stringify(fitted).length > MAX_SAVED_TRIPS_CHARACTERS) fitted.pop();
  return fitted;
}

function persistTripRecords(records, storage) {
  const fitted = fitTripList(records);
  while (fitted.length) {
    try {
      storage.setItem(STORAGE_KEYS.trips, JSON.stringify(fitted));
      return fitted;
    } catch (error) {
      if (!quotaExceeded(error) || fitted.length === 1) throw error;
      fitted.pop();
    }
  }
  storage.setItem(STORAGE_KEYS.trips, '[]');
  return [];
}

function writeDraftWithHistoryEviction(record, storage) {
  const payload = JSON.stringify(record);
  try {
    storage.setItem(STORAGE_KEYS.current, payload);
    return record;
  } catch (error) {
    if (!quotaExceeded(error)) throw error;
  }
  const history = fitTripList(safeParse(storage.getItem(STORAGE_KEYS.trips), []));
  while (history.length) {
    history.pop();
    storage.setItem(STORAGE_KEYS.trips, JSON.stringify(history));
    try {
      storage.setItem(STORAGE_KEYS.current, payload);
      return record;
    } catch (error) {
      if (!quotaExceeded(error)) throw error;
    }
  }
  storage.setItem(STORAGE_KEYS.current, payload);
  return record;
}

export function saveDraft(state, storage = localStorage) {
  const record = compactSavedState({ ...state, savedAt: new Date().toISOString() });
  if (!record) throw new TypeError('Een reisconcept zonder geldige trip kan niet worden opgeslagen.');
  return writeDraftWithHistoryEviction(record, storage);
}

export function loadDraft(storage = localStorage) {
  const found = readFirst(storage, [STORAGE_KEYS.current, ...STORAGE_KEYS.legacyCurrent]);
  if (!found) return null;
  const migrated = migrateState(found.value);
  if (migrated && (found.key !== STORAGE_KEYS.current || found.value.snapshotFormat !== COMPACT_SNAPSHOT_FORMAT)) {
    writeDraftWithHistoryEviction(migrated, storage);
    if (found.key !== STORAGE_KEYS.current) {
      try { storage.removeItem(found.key); } catch { /* best effort */ }
    }
  }
  return migrated;
}

export function clearDraft(storage = localStorage) {
  [STORAGE_KEYS.current, ...STORAGE_KEYS.legacyCurrent].forEach(key => {
    try { storage.removeItem(key); } catch { /* best effort */ }
  });
}

export function loadTrips(storage = localStorage) {
  const found = readFirst(storage, [STORAGE_KEYS.trips, ...STORAGE_KEYS.legacyTrips]);
  if (!found) return [];
  const rawRecords = Array.isArray(found.value) ? found.value : [];
  const sorted = sortedUniqueRecords(rawRecords);
  const requiresRewrite = found.key !== STORAGE_KEYS.trips || rawRecords.length !== sorted.length
    || rawRecords.length > MAX_SAVED_TRIPS || JSON.stringify(rawRecords).length > MAX_SAVED_TRIPS_CHARACTERS
    || rawRecords.some((item, index) => item?.snapshotFormat !== COMPACT_SNAPSHOT_FORMAT || Object.hasOwn(item || {}, 'plan')
      || item?.trip?.id !== sorted[index]?.trip?.id);
  const persisted = requiresRewrite ? persistTripRecords(sorted, storage) : fitTripList(sorted);
  if (found.key !== STORAGE_KEYS.trips) {
    try { storage.removeItem(found.key); } catch { /* best effort */ }
  }
  return persisted;
}

export function saveTrip(state, storage = localStorage) {
  const record = saveDraft(state, storage);
  const existing = loadTrips(storage).filter(item => item.trip.id !== record.trip.id);
  return persistTripRecords([record, ...existing], storage);
}

export function deleteTrip(id, storage = localStorage) {
  return persistTripRecords(loadTrips(storage).filter(item => item.trip.id !== id), storage);
}
