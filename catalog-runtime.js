import {
  CATALOG_VERSION,
  CATALOGUE_MANIFEST,
  getLoadedCountryPack,
  loadCountryPack,
  resolveCatalogCountry,
  resolveCatalogCountryFromPoint,
  resolveCatalogLocation,
  resolveCatalogLocationFromPoint
} from './catalog-index.js?v=1300';
import { validCoordinate } from './config.js?v=1300';
import { haversineKm } from './route-engine.js?v=1300';
import { accommodationIdentity, annotateAccommodationContinuity } from './recommendation-engine.js?v=1300';
import { resolveOrigin } from './trip-model.js?v=1300';
import {
  estimateLegTiming,
  exceedsFuelRange,
  hasRoughSurfaceEvidence,
  minimumTravelLegs,
  recommendationVehicleCompatible,
  surfacePolicyConflict,
  transportId,
  vehicleSuitabilityFor
} from './vehicle-intelligence.js?v=1300';

const CATALOGUE_SOURCE = 'ReisSlim touring catalogue';
const MAX_GENERATED_CONCEPTS = 12;
const MAX_BASES = 7;
const MAX_TRANSIT_COUNTRY_PACKS = 10;
const PREFERENCE_TAGS = new Set(['natuur', 'bergen', 'zwemmen', 'wandelen', 'kinderen', 'motor', 'cultuur', 'eten', 'kust', 'budget']);

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const normalizeText = value => String(value || '').trim().toLocaleLowerCase('en').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = value => normalizeText(value).replace(/\s+/g, '-').slice(0, 72);
const unique = values => [...new Set((values || []).filter(Boolean))];
const point = value => {
  const candidate = { lat: finite(value?.lat ?? value?.point?.lat), lon: finite(value?.lon ?? value?.point?.lon) };
  return validCoordinate(candidate) ? candidate : null;
};
const throwIfAborted = signal => {
  if (signal?.aborted) throw new DOMException('Catalogue discovery cancelled', 'AbortError');
};

function sourceRecord(value, fallback = null) {
  const source = value?.sources?.[0] || value?.source || fallback || {};
  if (typeof source === 'string') return {
    provider: value?.provider || source,
    id: value?.providerId || value?.id || null,
    url: value?.sourceUrl || value?.url || null,
    license: value?.license || fallback?.license || null
  };
  return {
    provider: source.provider || source.name || fallback?.provider || CATALOGUE_SOURCE,
    id: source.id || source.providerId || value?.providerId || value?.id || null,
    url: source.url || source.sourceUrl || value?.sourceUrl || value?.url || null,
    license: source.license || fallback?.license || null
  };
}

function normalizeThemes(anchor) {
  const raw = unique([...(anchor?.themes || []), ...(anchor?.tags || [])]).map(normalizeText);
  const tags = [];
  for (const item of raw) {
    if (PREFERENCE_TAGS.has(item)) tags.push(item);
    if (/mountain|alpine|pass|highland|berg/.test(item)) tags.push('bergen', 'natuur', 'wandelen');
    if (/coast|beach|sea|ocean|island|kust/.test(item)) tags.push('kust', 'natuur');
    if (/park|nature|reserve|wildlife|forest|desert|lake|waterfall/.test(item)) tags.push('natuur');
    if (/museum|heritage|historic|culture|castle|monument/.test(item)) tags.push('cultuur');
    if (/food|wine|restaurant|culinary/.test(item)) tags.push('eten');
    if (/motor|scenic road|touring|pass/.test(item)) tags.push('motor');
  }
  return unique(tags);
}

function vehicleFitValue(value, vehicle) {
  return vehicleSuitabilityFor(value, vehicle).score;
}

function explicitVehicleEvidence(value, vehicle) {
  const decoded = vehicleSuitabilityFor(value, vehicle);
  return decoded.explicit && decoded.status !== 'unknown';
}

function significanceScore(anchor) {
  const supplied = finite(anchor?.significance?.score ?? anchor?.importance);
  if (supplied !== null) return clamp(supplied, 0, 100);
  const population = Math.max(0, finite(anchor?.significance?.population ?? anchor?.population) || 0);
  return population ? clamp(18 + Math.log10(population + 1) * 12, 20, 88) : 50;
}

function islandAccessFor(anchor) {
  const featureCode = normalizeText(anchor?.significance?.featureCode || anchor?.featureCode);
  const role = normalizeText(anchor?.role);
  const themes = (anchor?.themes || anchor?.tags || []).map(normalizeText);
  const ferryRequired = anchor?.requiresFerryAccess === true
    || anchor?.gateway?.type === 'ferry'
    || anchor?.roadAccess?.requiresFerry === true;
  const island = ferryRequired || featureCode === 'isl' || role.includes('island') || themes.includes('island');
  return { island, ferryRequired };
}

function normalizeAnchor(anchor, pack, index) {
  const anchorPoint = point(anchor);
  if (!anchorPoint || !anchor?.name) return null;
  const fallbackSource = pack.sources?.[0] || null;
  const source = sourceRecord(anchor, fallbackSource);
  const islandAccess = islandAccessFor(anchor);
  return {
    ...anchor,
    id: anchor.id || `${pack.country.code.toLowerCase()}-anchor-${index + 1}`,
    providerId: source.id || anchor.id || `${pack.country.code}-${index + 1}`,
    name: String(anchor.name).trim(),
    point: anchorPoint,
    lat: anchorPoint.lat,
    lon: anchorPoint.lon,
    adminRegion: anchor.adminRegion || anchor.region || null,
    role: anchor.role || 'touring-anchor',
    featureCode: anchor.featureCode || anchor.significance?.featureCode || null,
    islandAccess: islandAccess.island ? (islandAccess.ferryRequired ? 'ferry-required' : 'connection-evidence-required') : null,
    requiresFerryAccess: islandAccess.ferryRequired,
    tags: normalizeThemes(anchor),
    significanceScore: significanceScore(anchor),
    source,
    sourceUrl: source.url,
    confidence: anchor.confidence || 'catalogue-source-evidence',
    lastChecked: anchor.lastChecked || pack.generatedAt || null
  };
}

function normalizeGeometry(geometry, from, to) {
  const points = (Array.isArray(geometry) ? geometry : [])
    .map(candidate => point(candidate))
    .filter(Boolean);
  return points.length >= 2 ? points : [from?.point, to?.point].filter(Boolean);
}

function evidenceStrength(value) {
  if (Number.isFinite(Number(value))) return clamp(Number(value), 0, 10);
  if (Array.isArray(value)) return clamp(value.length * 2, 0, 10);
  if (value && typeof value === 'object') return clamp(Object.values(value).filter(Boolean).length * 2, 0, 10);
  return value ? 5 : 0;
}

function evidenceValues(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  if (value && typeof value === 'object') return evidenceValues(value.values || value.value || value.tags || []);
  return value ? [normalizeText(value)] : [];
}

function corridorHasSourceEvidence(corridor) {
  if (corridor?.routeEvidenceScope === 'endpoint-context'
      || (corridor?.overtureEndpointEvidence && !corridor?.overtureEvidence)) return false;
  const provider = normalizeText(corridor?.source);
  const sourceIds = Array.isArray(corridor?.sourceIds) ? corridor.sourceIds.filter(Boolean) : [];
  const evidence = Array.isArray(corridor?.evidence) ? corridor.evidence.filter(Boolean) : [];
  const providerBacked = provider && !/reisslim|derived geodesic|fallback/.test(provider);
  const roadEvidence = evidenceValues(corridor?.roadClass).length || evidenceValues(corridor?.surface).length
    || evidenceStrength(corridor?.scenicEvidence) > 0 || evidenceStrength(corridor?.curvatureSignal) > 0
    || evidenceStrength(corridor?.elevationSignal) > 0;
  return Boolean((providerBacked || sourceIds.length) && (evidence.length || roadEvidence));
}

function normalizeCorridors(pack, anchors) {
  const byId = new Map(anchors.map(anchor => [anchor.id, anchor]));
  return (pack.corridors || []).map((corridor, index) => {
    const from = byId.get(corridor.fromAnchorId || corridor.fromId);
    const to = byId.get(corridor.toAnchorId || corridor.toId);
    if (!from || !to || from.id === to.id) return null;
    const source = sourceRecord(corridor, pack.sources?.[0]);
    const directKm = haversineKm(from.point, to.point) || 0;
    const distanceKm = Math.max(1, Math.round(finite(corridor.distanceKm) || directKm * 1.16));
    const carMinutes = finite(corridor.carMovingMinutes);
    const motorcycleMovingMinutes = finite(corridor.motorcycleMovingMinutes);
    const motorcycleElapsedMinutes = finite(corridor.motorcycleElapsedMinutes);
    const routeBacked = corridorHasSourceEvidence(corridor);
    const endpointContext = corridor.overtureEndpointEvidence || null;
    return {
      id: corridor.id || `${pack.country.code.toLowerCase()}-corridor-${index + 1}`,
      fromAnchorId: from.id,
      toAnchorId: to.id,
      from: from.id,
      to: to.id,
      fromName: from.name,
      toName: to.name,
      intermediateAnchorIds: unique(corridor.intermediateAnchorIds || []),
      name: corridor.name || `${from.name} – ${to.name}`,
      distanceKm,
      carMovingHours: Number(((carMinutes ?? distanceKm / 76 * 60) / 60).toFixed(1)),
      carHours: Number(((carMinutes ?? distanceKm / 76 * 60) / 60).toFixed(1)),
      motorcycleMovingHours: motorcycleMovingMinutes === null ? null : Number((motorcycleMovingMinutes / 60).toFixed(1)),
      motorcycleElapsedHours: motorcycleElapsedMinutes === null ? null : Number((motorcycleElapsedMinutes / 60).toFixed(1)),
      scenicValue: evidenceStrength(corridor.scenicEvidence),
      curvatureSignal: evidenceStrength(corridor.curvatureSignal),
      elevationSignal: evidenceStrength(corridor.elevationSignal),
      surface: corridor.surface || null,
      roadClass: corridor.roadClass || null,
      ferry: corridor.ferry ?? null,
      toll: corridor.toll ?? null,
      fuelServiceSpacingKm: finite(corridor.fuelServiceSpacingKm),
      serviceEvidence: finite(corridor.serviceEvidence),
      vehicleCompatibility: corridor.vehicleCompatibility || {},
      sourceIds: unique(corridor.sourceIds || []),
      evidence: unique(corridor.evidence || []),
      overtureEvidence: corridor.overtureEvidence || null,
      overtureEndpointEvidence: endpointContext,
      routeEvidenceScope: routeBacked ? 'route' : endpointContext ? 'endpoint-context' : 'estimated',
      seasonalLimitations: corridor.seasonalLimitations || null,
      fallbackGeometry: normalizeGeometry(corridor.geometry, from, to),
      geometryType: corridor.geometryType || null,
      geometrySource: corridor.geometrySource || corridor.geometryType || null,
      estimateMethod: corridor.estimateMethod || null,
      source: source.provider,
      sourceUrl: source.url,
      providerId: source.id || corridor.id || null,
      confidenceScore: finite(corridor.confidence),
      confidence: routeBacked
        ? corridor.confidence || 'catalogue-road-evidence'
        : endpointContext ? 'estimated-corridor-with-endpoint-context' : 'catalogue-inferred-corridor'
    };
  }).filter(Boolean);
}

export function auditCatalogueEvidence(pack) {
  const anchors = Array.isArray(pack?.anchors) ? pack.anchors : [];
  const corridors = Array.isArray(pack?.corridors) ? pack.corridors : [];
  const knownCarAnchors = anchors.filter(anchor => explicitVehicleEvidence(anchor.vehicleFit, 'car')).length;
  const knownMotorcycleAnchors = anchors.filter(anchor => explicitVehicleEvidence(anchor.vehicleFit, 'motorcycle')).length;
  const sourceBackedCorridors = corridors.filter(corridor => {
    const source = sourceRecord(corridor, pack?.sources?.[0]);
    return corridorHasSourceEvidence({ ...corridor, source: source.provider });
  }).length;
  const endpointContextCorridors = corridors.filter(corridor =>
    Boolean(corridor?.overtureEndpointEvidence || corridor?.routeEvidenceScope === 'endpoint-context')).length;
  const failures = [];
  if (anchors.length && knownCarAnchors === 0 && knownMotorcycleAnchors === 0) failures.push('universal-unknown-vehicle-suitability');
  if (corridors.length && sourceBackedCorridors === 0 && endpointContextCorridors === 0) failures.push('synthetic-only-corridor-evidence');
  return {
    valid: failures.length === 0,
    failures,
    anchors: anchors.length,
    corridors: corridors.length,
    knownCarAnchors,
    knownMotorcycleAnchors,
    sourceBackedCorridors,
    endpointContextCorridors
  };
}

function preferenceEvidence(anchor, trip) {
  return (anchor.tags || []).reduce((score, tag) => score + (trip.preferences?.includes(tag) ? Number(trip.preferenceWeights?.[tag] || 2) : 0), 0);
}

function adjacentCorridorEvidence(anchor, corridors, vehicle) {
  return corridors.filter(corridor => corridor.fromAnchorId === anchor.id || corridor.toAnchorId === anchor.id)
    .reduce((score, corridor) => score + (vehicle === 'motorcycle'
      ? corridor.scenicValue * 1.2 + corridor.curvatureSignal + corridor.elevationSignal * .45
        + (vehicleFitValue(corridor.vehicleCompatibility, vehicle) - 5) * 1.5
      : (corridor.roadClass ? 2 : 0) + (corridor.surface ? 2 : 0) + (corridor.ferry === false ? 1 : 0)
        + (vehicleFitValue(corridor.vehicleCompatibility, vehicle) - 5) * 1.5)
      + (corridorHasSourceEvidence(corridor) ? 2 : 0), 0);
}

function corridorVehicleUtility(corridor, trip) {
  if (!corridor) return -4;
  const vehicle = transportId(trip.transport);
  if (!corridorHardCompatible(corridor, trip)) return -24;
  const compatibility = vehicleFitValue(corridor.vehicleCompatibility, vehicle);
  const sourceBonus = corridorHasSourceEvidence(corridor) ? 4 : -2;
  const surfaces = evidenceValues(corridor.surface);
  const roadClasses = evidenceValues(corridor.roadClass);
  const paved = surfaces.some(value => /asphalt|paved|concrete|paving stone/.test(value));
  const rough = surfaces.some(value => /unpaved|gravel|dirt|sand|ground|mud|track/.test(value));
  const majorRoad = roadClasses.some(value => /motorway|trunk|primary|secondary/.test(value));
  const unsuitableRoad = roadClasses.some(value => /path|footway|cycleway|bridleway|steps/.test(value));
  let utility = (compatibility - 5) * 4 + sourceBonus;
  if (vehicle === 'motorcycle') {
    utility += corridor.scenicValue * 1.6 + corridor.curvatureSignal * 1.25 + corridor.elevationSignal * .45;
    if (paved) utility += 3;
    if (rough && compatibility <= 5) utility -= 7;
    if (Number.isFinite(corridor.fuelServiceSpacingKm)) {
      const range = Math.max(80, Number(trip.fuelRangeKm || 260));
      utility += corridor.fuelServiceSpacingKm <= range * .72 ? 3 : corridor.fuelServiceSpacingKm > range ? -15 : -2;
    }
  } else if (vehicle === 'car') {
    if (paved) utility += 5;
    if (majorRoad) utility += 4;
    if (rough && compatibility <= 5) utility -= 6;
    utility += Math.min(4, Math.max(0, Number(corridor.serviceEvidence || 0)));
  }
  if (unsuitableRoad) utility -= 20;
  return clamp(utility, -24, 32);
}

function corridorHardCompatible(corridor, trip) {
  if (!corridor) return true;
  const vehicle = transportId(trip.transport);
  if (vehicleSuitabilityFor(corridor.vehicleCompatibility, vehicle).status === 'prohibited') return false;
  if (exceedsFuelRange(trip, corridor.fuelServiceSpacingKm)) return false;
  if (surfacePolicyConflict(trip, corridor.surface)) return false;
  return !(['motorhome', 'caravan'].includes(vehicle) && hasRoughSurfaceEvidence(corridor.surface));
}

function anchorScore(anchor, trip, corridors) {
  const vehicle = transportId(trip.transport);
  const gateway = anchor.gateway || /gateway|airport|ferry|station/.test(normalizeText(anchor.role)) ? 7 : 0;
  const vehicleEvidence = vehicleFitValue(anchor.vehicleFit, vehicle) * 3;
  const routeEvidence = Math.min(24, adjacentCorridorEvidence(anchor, corridors, vehicle));
  const remotePenalty = anchor.remoteness === 'high' && vehicle !== 'motorcycle' ? 5 : 0;
  return anchor.significanceScore + gateway + vehicleEvidence + preferenceEvidence(anchor, trip) * 3 + routeEvidence - remotePenalty;
}

function countrySpanKm(anchors) {
  let maximum = 0;
  const sample = anchors.slice(0, 80);
  for (let left = 0; left < sample.length; left += 1) {
    for (let right = left + 1; right < sample.length; right += 1) maximum = Math.max(maximum, haversineKm(sample[left].point, sample[right].point) || 0);
  }
  return maximum;
}

function chooseSeeds(anchors, trip, corridors, count) {
  const ordered = anchors.slice().sort((a, b) => anchorScore(b, trip, corridors) - anchorScore(a, trip, corridors) || a.name.localeCompare(b.name, 'en'));
  if (!ordered.length) return [];
  const span = Math.max(80, countrySpanKm(ordered));
  const selected = [ordered[0]];
  while (selected.length < count) {
    const next = ordered.filter(candidate => !selected.includes(candidate)).map(candidate => {
      const separation = Math.min(...selected.map(seed => haversineKm(seed.point, candidate.point) || 0));
      return { candidate, merit: anchorScore(candidate, trip, corridors) + Math.min(70, separation / span * 105), separation };
    }).sort((a, b) => b.merit - a.merit || b.separation - a.separation || a.candidate.name.localeCompare(b.candidate.name, 'en'))[0];
    if (!next) break;
    selected.push(next.candidate);
  }
  return selected;
}

function dailyReachKm(trip) {
  const vehicle = transportId(trip.transport);
  const effectiveSpeed = { car: 72, motorcycle: 62, motorhome: 55, caravan: 50 }[vehicle] || 68;
  return Math.max(120, Number(trip.maxDrive || 5) * effectiveSpeed * .88);
}

function catalogueLegEstimate(from, to, trip, corridors) {
  const vehicle = transportId(trip.transport);
  const corridor = corridors.find(item => (item.fromAnchorId === from.id && item.toAnchorId === to.id)
    || (item.fromAnchorId === to.id && item.toAnchorId === from.id));
  const directKm = haversineKm(from.point, to.point) || Infinity;
  const distanceKm = corridor?.distanceKm || directKm * 1.16;
  if (vehicle === 'motorcycle' && Number(corridor?.motorcycleElapsedHours) > 0) {
    return { distanceKm, elapsedHours: Number(corridor.motorcycleElapsedHours), corridor,
      compatible: corridorHardCompatible(corridor, trip), vehicleUtility: corridorVehicleUtility(corridor, trip) };
  }
  const speed = { car: 82, motorcycle: 72, motorhome: 64, caravan: 59 }[vehicle] || 82;
  const suppliedMovingHours = vehicle === 'motorcycle'
    ? Number(corridor?.motorcycleMovingHours) || Number(corridor?.carMovingHours) * 1.05
    : Number(corridor?.carMovingHours || corridor?.carHours);
  const roadHours = Number.isFinite(suppliedMovingHours) && suppliedMovingHours > 0 ? suppliedMovingHours : distanceKm / speed;
  return { distanceKm, elapsedHours: estimateLegTiming(trip, { distanceKm, roadHours, arrival: true }).elapsedHours,
    corridor, compatible: corridorHardCompatible(corridor, trip), vehicleUtility: corridorVehicleUtility(corridor, trip) };
}

function hasNamedAccommodationEvidence(anchor) {
  const candidates = anchor?.recommendations?.accommodations || anchor?.accommodations || [];
  return candidates.some(item => item?.name
    && (item?.providerId || item?.id)
    && (item?.sourceUrl || item?.url || item?.sources?.some(source => source?.url || source?.sourceUrl)));
}

function stayCapableAnchor(anchor) {
  const role = normalizeText(anchor?.role);
  return /overnight base|gateway capital|access gateway|settlement/.test(role)
    || hasNamedAccommodationEvidence(anchor);
}

function selectBases(seed, cluster, trip, corridors) {
  const target = clamp(Math.ceil(Number(trip.days || 7) / 3.4), 1, Math.min(MAX_BASES, Number(trip.maxChanges || 0) + 1));
  const reach = dailyReachKm(trip);
  const countrySpan = countrySpanKm(cluster);
  const minimumSeparation = clamp(countrySpan / Math.max(4, target * 1.6), 22, 95);
  const selected = [seed];
  let current = seed;
  while (selected.length < target) {
    const candidates = cluster.filter(candidate => stayCapableAnchor(candidate) && !selected.includes(candidate))
      .map(candidate => {
        const leg = catalogueLegEstimate(current, candidate, trip, corridors);
        const legKm = leg.distanceKm;
        const separation = Math.min(...selected.map(base => haversineKm(base.point, candidate.point) || 0));
        const revisitingPenalty = separation < minimumSeparation ? 80 : 0;
        const progression = separation / Math.max(1, minimumSeparation) * 9;
        return { candidate, legKm, elapsedHours: leg.elapsedHours, compatible: leg.compatible,
          merit: anchorScore(candidate, trip, corridors) + progression + leg.vehicleUtility * 1.7
            - legKm / Math.max(40, reach) * 11 - revisitingPenalty };
      })
      .filter(item => item.compatible && item.legKm <= reach * 1.03 && item.elapsedHours <= Number(trip.maxDrive || 5) + .05)
      .sort((a, b) => b.merit - a.merit || a.legKm - b.legKm || a.candidate.name.localeCompare(b.candidate.name, 'en'));
    if (!candidates.length || candidates[0].merit < 15) break;
    current = candidates[0].candidate;
    selected.push(current);
  }
  return selected;
}

function recommendationArrays(anchor) {
  const recommendations = anchor.recommendations || {};
  return [
    ['activity', recommendations.pois || anchor.pois || []],
    ['accommodation', recommendations.accommodations || anchor.accommodations || []],
    ['restaurant', recommendations.restaurants || anchor.restaurants || []],
    ['service', recommendations.services || anchor.serviceLocations || []]
  ];
}

function recommendationType(defaultType, item) {
  const text = normalizeText(item?.type || item?.category || defaultType);
  if (/fuel|petrol|gas station|charging/.test(text)) return 'fuel';
  if (/rest|service area/.test(text)) return 'rest';
  if (/hotel|guest|hostel|camp|accommodation|lodg/.test(text)) return 'accommodation';
  if (/restaurant|cafe|food/.test(text)) return 'restaurant';
  if (/service|repair|garage/.test(text)) return 'service';
  return defaultType === 'poi' ? 'activity' : defaultType;
}

function normalizedVehicleFit(item) {
  if (Array.isArray(item?.vehicleFit)) return unique(item.vehicleFit.map(transportId));
  if (item?.vehicleFit && typeof item.vehicleFit === 'object') {
    return Object.entries(item.vehicleFit)
      .filter(([, value]) => ['supported', 'limited'].includes(vehicleSuitabilityFor(value).status))
      .map(([vehicle]) => transportId(vehicle));
  }
  return [];
}

function vehicleEligible(item, vehicle) {
  return recommendationVehicleCompatible(item, vehicle);
}

function normalizeRecommendation(item, defaultType, anchor, pack, index) {
  if (!item?.name) return null;
  const itemPoint = point(item) || anchor.point;
  if (!itemPoint) return null;
  const source = sourceRecord(item, anchor.source || pack.sources?.[0]);
  const type = recommendationType(defaultType, item);
  const providerId = source.id || item.providerId || item.id;
  if (!providerId || !source.url) return null;
  return {
    id: `catalogue-${pack.country.code.toLowerCase()}-${slug(anchor.id)}-${type}-${slug(providerId || index)}`,
    providerId: String(providerId),
    provider: source.provider,
    name: String(item.name).trim(),
    type,
    point: itemPoint,
    associatedBase: anchor.name,
    vehicleFit: normalizedVehicleFit(item),
    prohibitedVehicles: item.vehicleFit && !Array.isArray(item.vehicleFit) && typeof item.vehicleFit === 'object'
      ? Object.keys(item.vehicleFit).map(transportId).filter(vehicle => vehicleSuitabilityFor(item.vehicleFit, vehicle).status === 'prohibited')
      : [],
    vehicleFitEvidence: item.vehicleFitEvidence || item.evidence || null,
    vehicleCategoryEvidence: {
      type: item.type || null,
      category: item.category || null,
      group: item.group || null,
      taxonomy: item.taxonomy || null,
      status: item.status || null
    },
    parkingEvidence: item.parkingEvidence || item.parking || null,
    openingHours: item.openingHours || null,
    source: source.provider,
    sourceUrl: source.url,
    url: item.website || source.url,
    confidence: item.confidence || anchor.confidence || 'catalogue-source-evidence',
    lastChecked: item.lastChecked || anchor.lastChecked || pack.generatedAt || null,
    license: source.license,
    verified: false,
    live: false,
    catalogue: true,
    genericFallback: false,
    availabilityWarning: type === 'accommodation'
      ? 'Genoemde accommodatiekandidaat — beschikbaarheid en prijs zijn niet geverifieerd.'
      : type === 'restaurant'
        ? 'Opening, prijs en toegankelijkheid zijn niet geverifieerd.'
        : 'Opening en toegankelijkheid zijn niet geverifieerd.'
  };
}

function recommendationsForAnchors(anchors, pack) {
  const seen = new Set();
  const output = [];
  for (const anchor of anchors) {
    for (const [defaultType, items] of recommendationArrays(anchor)) {
      for (const [index, item] of (items || []).entries()) {
        const recommendation = normalizeRecommendation(item, defaultType, anchor, pack, index);
        if (!recommendation) continue;
        const identity = `${recommendation.provider}:${recommendation.providerId}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        output.push(recommendation);
      }
    }
  }
  return output;
}

function conceptEvidenceConfidence(bases, corridors, recommendations, vehicle) {
  const pairs = bases.slice(1).map((base, index) => [bases[index], base]);
  const matched = pairs.map(([from, to]) => corridors.find(corridor =>
    (corridor.fromAnchorId === from.id && corridor.toAnchorId === to.id)
      || (corridor.fromAnchorId === to.id && corridor.toAnchorId === from.id))).filter(Boolean);
  const routeBacked = matched.filter(corridorHasSourceEvidence).length;
  const endpointContext = matched.filter(corridor => !corridorHasSourceEvidence(corridor)
    && corridor.routeEvidenceScope === 'endpoint-context').length;
  const estimated = matched.length - routeBacked - endpointContext;
  const missing = pairs.length - matched.length;
  const sourceBackedBases = bases.filter(base => base.source?.id && base.source?.url
    && !/reisslim|fallback|derived/.test(normalizeText(base.source?.provider))).length;
  const namedRecommendations = recommendations.filter(item => item.providerId && item.sourceUrl
    && !item.genericFallback).length;
  const explicitVehicle = bases.filter(base => explicitVehicleEvidence(base.vehicleFit, vehicle)).length;
  const anchorRatio = sourceBackedBases / Math.max(1, bases.length);
  const routeRatio = pairs.length ? routeBacked / pairs.length : .5;
  const recommendationRatio = Math.min(1, namedRecommendations / Math.max(3, bases.length * 3));
  const vehicleRatio = explicitVehicle / Math.max(1, bases.length);
  let score = anchorRatio * .32 + routeRatio * .38 + recommendationRatio * .18 + vehicleRatio * .12;
  if (pairs.length && routeBacked === 0) score = Math.min(score, .48);
  if (missing) score = Math.min(score, .3);
  score = Number(score.toFixed(3));
  return {
    score,
    label: score >= .7 && (!pairs.length || routeBacked === pairs.length) ? 'reasonable' : score >= .34 ? 'limited' : 'low',
    sourceBackedBases,
    totalBases: bases.length,
    namedRecommendations,
    explicitVehicleBases: explicitVehicle,
    requiredBaseConnections: pairs.length,
    routeBackedConnections: routeBacked,
    endpointContextConnections: endpointContext,
    estimatedConnections: estimated,
    missingConnections: missing,
    method: 'weighted-anchor-route-recommendation-vehicle-evidence'
  };
}

function roadEvidenceFor(anchor, corridors) {
  const adjacent = corridors.filter(corridor => corridor.fromAnchorId === anchor.id || corridor.toAnchorId === anchor.id)
    .sort((a, b) => b.scenicValue + b.curvatureSignal - a.scenicValue - a.curvatureSignal)[0];
  if (!adjacent) return null;
  return {
    scenic: adjacent.scenicValue > 0,
    scenicValue: adjacent.scenicValue,
    curvatureSignal: adjacent.curvatureSignal,
    elevationSignal: adjacent.elevationSignal,
    surface: adjacent.surface,
    roadClass: adjacent.roadClass,
    routeRelation: true,
    motorcycleAccess: vehicleSuitabilityFor(anchor.vehicleFit, 'motorcycle').status === 'prohibited' ? 'no' : null,
    source: adjacent.source,
    providerId: adjacent.providerId
  };
}

function highlightForAnchor(anchor, base, sequence, trip, corridors) {
  const evidence = [anchor.source.provider, anchor.source.id].filter(Boolean).join(' · ');
  return {
    id: anchor.id,
    providerId: anchor.providerId,
    name: anchor.name,
    baseName: base.name,
    point: anchor.point,
    overnightPoint: base.point,
    sequence,
    priority: clamp(Math.round(anchor.significanceScore / 10), 4, 10),
    minimumTripDays: Math.max(3, 2 + Math.floor(sequence / 2)),
    minimumNights: clamp(finite(anchor.minNights) || 1, 1, 4),
    tags: anchor.tags,
    activity: `Bezoek ${anchor.name}; controleer actuele toegang en opening bij de bron.`,
    rainAlternative: `Gebruik een beschutte, genoemde catalogusactiviteit nabij ${base.name} wanneer die voor deze dag beschikbaar is.`,
    evidence,
    gateway: sequence === 0,
    remote: anchor.remoteness === 'high',
    sourceUrl: anchor.sourceUrl,
    confidence: anchor.confidence,
    fetchedAt: anchor.lastChecked,
    catalogue: true,
    geographicRole: anchor.role || null,
    featureCode: anchor.featureCode || null,
    islandAccess: anchor.islandAccess || null,
    requiresFerryAccess: anchor.requiresFerryAccess === true,
    roadAccess: anchor.roadAccess ?? null,
    roadEvidence: roadEvidenceFor(anchor, corridors),
    vehicleSuitability: vehicleFitValue(anchor.vehicleFit, transportId(trip.transport)),
    vehicleFit: anchor.vehicleFit || null,
    vehicleFitEvidence: vehicleSuitabilityFor(anchor.vehicleFit, transportId(trip.transport)).evidence
  };
}

function poiHighlights(base, recommendations, startSequence, trip, corridors) {
  return recommendations.filter(item => item.associatedBase === base.name && item.type === 'activity')
    .slice(0, 6)
    .map((item, index) => ({
      id: item.id,
      providerId: item.providerId,
      name: item.name,
      baseName: base.name,
      point: item.point,
      overnightPoint: base.point,
      sequence: startSequence + index,
      priority: 7,
      minimumTripDays: 3,
      minimumNights: 1,
      tags: base.tags,
      activity: `Bezoek ${item.name}; opening en toegang zijn niet live geverifieerd.`,
      rainAlternative: `Kies een beschutte catalogusactiviteit in ${base.name} als ${item.name} niet passend blijkt.`,
      evidence: `${item.source} · ${item.providerId}`,
      gateway: false,
      remote: false,
      sourceUrl: item.sourceUrl,
      confidence: item.confidence,
      fetchedAt: item.lastChecked,
      catalogue: true,
      geographicRole: base.role || null,
      featureCode: base.featureCode || null,
      islandAccess: base.islandAccess || null,
      requiresFerryAccess: base.requiresFerryAccess === true,
      roadAccess: base.roadAccess ?? null,
      roadEvidence: roadEvidenceFor(base, corridors),
      vehicleSuitability: vehicleFitValue(base.vehicleFit, transportId(trip.transport)),
      vehicleFit: base.vehicleFit || null,
      vehicleFitEvidence: vehicleSuitabilityFor(base.vehicleFit, transportId(trip.transport)).evidence
    }));
}

function regionName(seed, bases, index) {
  const companion = (bases || []).find(base => normalizeText(base?.name) !== normalizeText(seed?.name));
  return companion ? `${seed.name} en ${companion.name}` : `${seed.name} en omgeving ${index + 1}`;
}

function profileFromSeed(pack, trip, seed, anchors, allCorridors, index) {
  const span = countrySpanKm(anchors);
  const durationFactor = clamp(Number(trip.days || 7) / 12, .8, 1.25);
  const maximumRegionalRadius = Math.max(180, Math.min(520, (span || 580) * .55));
  const radius = clamp(dailyReachKm(trip) * durationFactor, Math.min(90, span || 90), maximumRegionalRadius);
  let cluster = anchors.filter(anchor => (haversineKm(seed.point, anchor.point) || 0) <= radius);
  if (cluster.length < 8) cluster = anchors.slice().sort((a, b) => (haversineKm(seed.point, a.point) || 0) - (haversineKm(seed.point, b.point) || 0)).slice(0, Math.min(24, anchors.length));
  const clusterIds = new Set(cluster.map(anchor => anchor.id));
  const corridors = allCorridors.filter(corridor => clusterIds.has(corridor.fromAnchorId) && clusterIds.has(corridor.toAnchorId));
  const stayCandidates = cluster.filter(stayCapableAnchor);
  const gatewayCandidates = stayCandidates.filter(anchor => anchor.gateway || /gateway|airport|ferry|station/.test(normalizeText(anchor.role)));
  const nearbyGateways = gatewayCandidates.filter(anchor => (haversineKm(seed.point, anchor.point) ?? Infinity) <= Math.max(120, dailyReachKm(trip) * .65));
  const nearbyStayCandidates = stayCandidates.filter(anchor => (haversineKm(seed.point, anchor.point) ?? Infinity) <= Math.max(120, dailyReachKm(trip) * .65));
  const gatewayPool = nearbyGateways.length ? nearbyGateways
    : nearbyStayCandidates.length ? nearbyStayCandidates
      : stayCandidates.length ? stayCandidates : [seed];
  const gateway = gatewayPool.slice().sort((a, b) => {
    const aMerit = anchorScore(a, trip, corridors) - (haversineKm(seed.point, a.point) || 0) / 30;
    const bMerit = anchorScore(b, trip, corridors) - (haversineKm(seed.point, b.point) || 0) / 30;
    return bMerit - aMerit || a.name.localeCompare(b.name, 'en');
  })[0] || seed;
  const bases = selectBases(gateway, cluster, trip, corridors);
  const selectedBaseIds = new Set(bases.map(base => base.id));
  const settlementRole = anchor => /overnight base|gateway capital/.test(normalizeText(anchor?.role));
  const secondaryAnchors = cluster.filter(anchor => !selectedBaseIds.has(anchor.id)
      && !(settlementRole(anchor) && bases.some(base => settlementRole(base)
        && (haversineKm(anchor.point, base.point) ?? Infinity) < 20)))
    .sort((left, right) => anchorScore(right, trip, corridors) - anchorScore(left, trip, corridors)
      || (haversineKm(seed.point, left.point) || 0) - (haversineKm(seed.point, right.point) || 0))
    .slice(0, Math.min(12, Math.max(4, Number(trip.days || 7))));
  const touringAnchorIds = new Set([...selectedBaseIds, ...secondaryAnchors.map(anchor => anchor.id)]);
  const retainedCorridors = corridors.filter(corridor => touringAnchorIds.has(corridor.fromAnchorId) && touringAnchorIds.has(corridor.toAnchorId)).slice(0, 96);
  const recommendations = recommendationsForAnchors(cluster, pack);
  const highlights = [];
  let sequence = 0;
  for (const base of bases) highlights.push(highlightForAnchor(base, base, sequence++, trip, retainedCorridors));
  for (const anchor of secondaryAnchors) highlights.push(highlightForAnchor(anchor, anchor, sequence++, trip, retainedCorridors));
  for (const base of bases) {
    highlights.push(...poiHighlights(base, recommendations, sequence, trip, retainedCorridors));
    sequence = highlights.length;
  }
  const tags = unique([...cluster.flatMap(anchor => anchor.tags), ...(transportId(trip.transport) === 'motorcycle' && retainedCorridors.some(corridor => corridor.scenicValue || corridor.curvatureSignal) ? ['motor'] : [])]);
  const origin = resolveOrigin(trip);
  const directKm = origin ? haversineKm(origin, gateway.point) : null;
  const distanceKm = Math.max(1, Math.round((directKm ?? 350) * 1.16));
  const vehicle = transportId(trip.transport);
  const averageVehicleFit = bases.reduce((sum, base) => sum + vehicleFitValue(base.vehicleFit, vehicle), 0) / Math.max(1, bases.length);
  const services = recommendations.filter(item => ['fuel', 'rest', 'service'].includes(item.type)).length;
  const conceptConfidence = conceptEvidenceConfidence(bases, retainedCorridors, recommendations, vehicle);
  const region = regionName(seed, bases, index);
  return {
    id: `catalog-${pack.country.code.toLowerCase()}-${slug(seed.id || seed.name)}`,
    name: `${region} · ${pack.country.name}`,
    country: pack.country.name,
    countryCode: pack.country.code,
    regionId: `${pack.country.code}:${slug(seed.adminRegion || seed.name)}`,
    distanceKm,
    driveHours: Number((distanceKm / 76).toFixed(1)),
    nightMid: 125,
    activityDaily: 45,
    costEvidence: {
      sourceBacked: false,
      source: 'ReisSlim generieke kostenprior; geen actuele lokale prijsbron',
      status: 'indicative-unverified'
    },
    toll: retainedCorridors.some(corridor => corridor.toll === true) ? 30 : 0,
    tags,
    season: unique(cluster.flatMap(anchor => anchor.seasons || [])).map(Number).filter(month => month >= 1 && month <= 12),
    family: clamp(Math.round(vehicle === 'car' ? averageVehicleFit : 5), 1, 10),
    motorcycle: clamp(Math.round(bases.reduce((sum, base) => sum + vehicleFitValue(base.vehicleFit, 'motorcycle'), 0) / Math.max(1, bases.length)), 1, 10),
    camper: 5,
    weather: 5,
    crowds: 5,
    summary: `${cluster.length} bronankers vormen een ${bases.length}-basis touringconcept rond ${seed.name}; live prijzen en beschikbaarheid zijn niet vereist voor de routeopbouw.`,
    pros: [`${bases.length} betekenisvolle uitvalsbases`, `${highlights.length} genoemde ankers en activiteiten`, `${retainedCorridors.length} bron- of afgeleide corridors`],
    cons: ['Prijzen en beschikbaarheid zijn niet live geverifieerd', 'Onbekende weg- en parkingvelden blijven expliciet onbekend'],
    routeStops: [],
    bases: bases.map(base => ({ id: base.id, providerId: base.providerId, name: base.name, ...base.point, sourceUrl: base.sourceUrl,
      confidence: base.confidence, tags: base.tags, vehicleFit: base.vehicleFit || null,
      vehicleFitEvidence: vehicleSuitabilityFor(base.vehicleFit, vehicle).evidence,
      geographicRole: base.role || null, featureCode: base.featureCode || null,
      islandAccess: base.islandAccess || null, requiresFerryAccess: base.requiresFerryAccess === true,
      roadAccess: base.roadAccess ?? null })),
    accessGateway: { id: gateway.id, providerId: gateway.providerId, name: gateway.name, ...gateway.point, sourceUrl: gateway.sourceUrl,
      geographicRole: gateway.role || null, featureCode: gateway.featureCode || null,
      islandAccess: gateway.islandAccess || null, requiresFerryAccess: gateway.requiresFerryAccess === true,
      roadAccess: gateway.roadAccess ?? null },
    highlights,
    activities: highlights.slice(0, Math.max(8, Number(trip.days || 7))).map(highlight => ({ type: highlight.tags[0] || 'cultuur', title: highlight.activity, rainAlternative: highlight.rainAlternative, tags: highlight.tags })),
    corridors: retainedCorridors,
    catalogueRecommendations: recommendations,
    dynamic: true,
    catalogue: true,
    catalogVersion: pack.dataVersion || CATALOG_VERSION,
    discoverySource: CATALOGUE_SOURCE,
    discoveredAt: pack.generatedAt,
    lastChecked: pack.generatedAt,
    evidence: {
      anchors: cluster.length,
      highlights: highlights.length,
      accommodations: recommendations.filter(item => item.type === 'accommodation').length,
      restaurants: recommendations.filter(item => item.type === 'restaurant').length,
      services,
      corridors: retainedCorridors.length,
      routeBackedConnections: conceptConfidence.routeBackedConnections,
      estimatedConnections: conceptConfidence.estimatedConnections,
      missingConnections: conceptConfidence.missingConnections,
      confidence: conceptConfidence,
      neutralFields: ['weather', 'crowds', 'camper']
    },
    confidence: conceptConfidence.label,
    evidenceConfidence: conceptConfidence,
    provider: {
      name: CATALOGUE_SOURCE,
      resolutionId: pack.country.code,
      sourceUrl: pack.sources?.[0]?.url || null,
      fetchedAt: pack.generatedAt,
      confidence: conceptConfidence.label,
      confidenceScore: conceptConfidence.score,
      confidenceMethod: conceptConfidence.method,
      licence: pack.sources?.[0]?.license || null
    },
    destinationScope: { geographicType: 'country-region', boundarySpanKm: Math.round(span), providerId: pack.country.code },
    roadDistanceFactor: 1.16,
    vehicleProfileId: vehicle,
    vehicleEvidence: { score: averageVehicleFit, source: 'catalogue anchor and corridor evidence' }
  };
}

function resolutionScopedAnchors(anchors, resolution, trip) {
  if (!resolution) return anchors;
  const geographicType = normalizeText(resolution.geographicType || resolution.type);
  if (['country', 'country region', 'administrative country', 'catalogue'].includes(geographicType)) return anchors;
  const bounds = Array.isArray(resolution.bounds) && resolution.bounds.length === 4
    ? resolution.bounds.map(Number)
    : null;
  if (bounds?.every(Number.isFinite)) {
    const [south, north, west, east] = bounds;
    const inside = anchors.filter(anchor => anchor.lat >= south && anchor.lat <= north
      && (east >= west ? anchor.lon >= west && anchor.lon <= east : anchor.lon >= west || anchor.lon <= east));
    if (inside.length >= Math.min(6, anchors.length)) return inside;
  }
  const focus = point(resolution);
  if (!focus) return anchors;
  const radiusKm = Math.max(90, dailyReachKm(trip) * Math.min(1.8, Math.max(1, Number(trip.days || 7) / 8)));
  const nearby = anchors.filter(anchor => (haversineKm(focus, anchor.point) ?? Infinity) <= radiusKm);
  if (nearby.length >= Math.min(6, anchors.length)) return nearby;
  return anchors.slice().sort((left, right) => (haversineKm(focus, left.point) ?? Infinity) - (haversineKm(focus, right.point) ?? Infinity))
    .slice(0, Math.min(Math.max(12, Number(trip.days || 7) * 2), anchors.length));
}

export function buildDestinationProfiles(pack, trip, { limit = 6, excludedIds = [], resolution = null } = {}) {
  if (!pack?.country?.code || !Array.isArray(pack.anchors)) return [];
  const vehicle = transportId(trip.transport);
  const normalizedAnchors = pack.anchors.map((anchor, index) => normalizeAnchor(anchor, pack, index)).filter(Boolean)
    .filter(anchor => vehicleSuitabilityFor(anchor.vehicleFit, vehicle).status !== 'prohibited');
  const anchors = resolutionScopedAnchors(normalizedAnchors, resolution, trip);
  if (!anchors.length) return [];
  const corridors = normalizeCorridors(pack, anchors);
  const requestedCount = clamp(Number(limit) + (excludedIds?.length || 0), 3, MAX_GENERATED_CONCEPTS);
  const seeds = chooseSeeds(anchors, trip, corridors, Math.min(requestedCount, anchors.length));
  const excluded = new Set(excludedIds || []);
  return seeds.map((seed, index) => profileFromSeed(pack, trip, seed, anchors, corridors, index))
    .filter(profile => !excluded.has(profile.id))
    .slice(0, Math.max(1, Number(limit) || 6));
}

function catalogueResolution(entry, pack) {
  const anchors = (pack?.anchors || []).map(point).filter(Boolean);
  const centre = anchors.length ? {
    lat: anchors.reduce((sum, item) => sum + item.lat, 0) / anchors.length,
    lon: anchors.reduce((sum, item) => sum + item.lon, 0) / anchors.length
  } : null;
  const latitudes = anchors.map(item => item.lat);
  const longitudes = anchors.map(item => item.lon);
  return {
    id: `catalogue-country-${entry.code}`,
    providerId: entry.code,
    code: entry.code,
    countryCode: entry.code,
    name: entry.name,
    displayName: entry.name,
    geographicType: 'country',
    geographicClass: 'catalogue',
    point: centre,
    bounds: anchors.length ? [Math.min(...latitudes), Math.max(...latitudes), Math.min(...longitudes), Math.max(...longitudes)] : null,
    provider: CATALOGUE_SOURCE,
    sourceUrl: pack?.sources?.[0]?.url || null,
    confidence: 'catalogue-source-evidence',
    fetchedAt: pack?.generatedAt || null
  };
}

function countryCodeForKnownOrigin(trip) {
  const explicit = trip?.originCountryCode || trip?.originPoint?.countryCode;
  if (explicit) return explicit;
  const origin = resolveOrigin(trip);
  return resolveCatalogCountryFromPoint(origin)?.code || null;
}

function estimatedDirectAccessLegs(trip, from, to) {
  if (trip?.travelMode !== 'direct' || !validCoordinate(from) || !validCoordinate(to)) return 1;
  const vehicle = transportId(trip.transport);
  const speed = { car: 82, motorcycle: 72, motorhome: 64, caravan: 59 }[vehicle] || 82;
  const distanceKm = Math.max(1, (haversineKm(from, to) || 1) * 1.16);
  return minimumTravelLegs(trip, distanceKm, distanceKm / speed);
}

function directTransitCountryCodes(trip, destinations, destinationCountryCode) {
  const origin = resolveOrigin(trip);
  if (trip?.travelMode !== 'direct' || !validCoordinate(origin)) return [];
  const codes = [];
  for (const destination of destinations || []) {
    const gateway = point(destination?.accessGateway);
    if (!gateway) continue;
    const legs = estimatedDirectAccessLegs(trip, origin, gateway);
    for (let index = 1; index < legs; index += 1) {
      const ratio = index / legs;
      const estimated = {
        lat: Number((origin.lat + (gateway.lat - origin.lat) * ratio).toFixed(5)),
        lon: Number((origin.lon + (gateway.lon - origin.lon) * ratio).toFixed(5))
      };
      const named = resolveCatalogLocationFromPoint(estimated, {
        maximumDistanceKm: 65,
        preferOvernightBase: true
      });
      const code = named?.countryCode || resolveCatalogCountryFromPoint(estimated)?.code;
      if (code && code !== destinationCountryCode && !codes.includes(code)) codes.push(code);
      if (codes.length >= MAX_TRANSIT_COUNTRY_PACKS) return codes;
    }
  }
  return codes;
}

async function preloadDirectTransitPacks(trip, destinations, destinationCountryCode, signal) {
  const requestedCodes = directTransitCountryCodes(trip, destinations, destinationCountryCode);
  const loadedCodes = [];
  for (const code of requestedCodes) {
    throwIfAborted(signal);
    try {
      if (await loadCountryPack(code)) loadedCodes.push(code);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // A transit pack is optional enrichment. The itinerary keeps its honest named
      // corridor anchor and warning when this one pack cannot be loaded.
    }
  }
  for (const destination of destinations || []) destination.transitCountryCodes = [...loadedCodes];
  return loadedCodes;
}

export async function discoverCatalogueConcepts(trip, { resolution = null, limit = 6, excludedIds = [], signal = null } = {}) {
  throwIfAborted(signal);
  const query = String(trip?.destinationQuery || '').trim();
  const destinationPoint = point(trip?.destinationPoint);
  const originPoint = resolveOrigin(trip);
  const offlineResolution = resolution
    || (query ? resolveCatalogLocation(query) : null)
    || (destinationPoint ? resolveCatalogLocationFromPoint(destinationPoint) : null)
    || (!query && originPoint ? resolveCatalogLocationFromPoint(originPoint) : null);
  const entry = resolveCatalogCountry(offlineResolution?.countryCode || offlineResolution?.code)
    || resolveCatalogCountry(offlineResolution?.countryName || offlineResolution?.displayName)
    || resolveCatalogCountry(query)
    || resolveCatalogCountryFromPoint(destinationPoint)
    || (!query ? resolveCatalogCountry(countryCodeForKnownOrigin(trip)) : null);
  if (!entry) {
    const requested = query || offlineResolution?.name || 'Deze bestemming';
    return {
      destinations: [], anchors: [], live: false, cached: false, outcome: query ? 'unsupported-country' : 'catalogue-destination-required',
      source: CATALOGUE_SOURCE, resolution: offlineResolution,
      reason: query
        ? `${requested} staat nog niet in de samengestelde ReisSlim-touringcatalogus. Er is geen ongerelateerd land als vervanging gebruikt.`
        : 'Voer een land uit de ReisSlim-touringcatalogus in om offline reisconcepten te maken.'
    };
  }
  const pack = await loadCountryPack(entry.code);
  throwIfAborted(signal);
  if (!pack) return {
    destinations: [], anchors: [], live: false, cached: false, outcome: 'catalogue-pack-unavailable', source: CATALOGUE_SOURCE,
    resolution: offlineResolution || { code: entry.code, countryCode: entry.code, name: entry.name },
    reason: `Het touringpakket voor ${entry.name} kon niet worden geladen. Er is geen ongerelateerde vervanging gemaakt.`
  };
  const catalogueCountry = catalogueResolution(entry, pack);
  const scopedResolution = offlineResolution?.point ? offlineResolution : null;
  const destinations = buildDestinationProfiles(pack, trip, { limit, excludedIds, resolution: scopedResolution });
  const transitCountryCodes = await preloadDirectTransitPacks(trip, destinations, entry.code, signal);
  throwIfAborted(signal);
  return {
    destinations,
    anchors: (pack.anchors || []).map((anchor, index) => normalizeAnchor(anchor, pack, index)).filter(Boolean),
    live: false,
    cached: true,
    degraded: false,
    outcome: destinations.length ? 'catalogue' : 'no-unseen-results',
    source: CATALOGUE_SOURCE,
    resolution: {
      ...catalogueCountry,
      ...(offlineResolution || {}),
      code: entry.code,
      countryCode: entry.code,
      name: offlineResolution?.name || entry.name
    },
    catalogVersion: pack.dataVersion || CATALOG_VERSION,
    transitCountryCodes,
    manifest: CATALOGUE_MANIFEST?.[entry.code] || entry,
    reason: destinations.length ? null : `Alle beschikbare touringconcepten voor ${entry.name} zijn al getoond.`
  };
}

function recommendationReason(item, vehicle) {
  if (item.type === 'accommodation') {
    if (vehicle === 'motorcycle') return item.parkingEvidence
      ? `Catalogusverblijf met vastgelegde parkingevidence: ${typeof item.parkingEvidence === 'string' ? item.parkingEvidence : 'zie bron'}. Beschikbaarheid en prijs zijn niet geverifieerd.`
      : 'Genoemde accommodatie voor deze basis; beveiliging en overdekking van motorparking zijn niet geverifieerd.';
    if (vehicle === 'car') return item.parkingEvidence
      ? `Genoemde accommodatie met parkingevidence uit de catalogus; voorwaarden, prijs en beschikbaarheid zijn niet geverifieerd.`
      : 'Genoemde accommodatie voor deze basis; parkeermogelijkheid, prijs en beschikbaarheid zijn niet geverifieerd.';
    return 'Genoemde accommodatiekandidaat; voertuigvoorzieningen, prijs en beschikbaarheid zijn niet geverifieerd.';
  }
  return `${item.name} is als genoemde cataloguslocatie aan deze dag gekoppeld; opening en actuele toegankelijkheid zijn niet geverifieerd.`;
}

function vehicleFitExplanation(item, vehicle) {
  const evidence = item.vehicleFitEvidence;
  const selected = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence[vehicle] : evidence;
  if (selected && !(vehicle === 'car' && /motor(?:cycle|fiets|vriendelijk|parking|hotel)/i.test(String(selected)))) return String(selected);
  if (item.type === 'accommodation') return recommendationReason(item, vehicle);
  return 'Voertuiggeschiktheid is niet verder gespecificeerd in de brondata.';
}

function dayRecommendation(item, day, trip, rank = 0) {
  const vehicle = transportId(trip.transport);
  return {
    ...item,
    id: `day-${day.day}-${item.type}-catalogue-${slug(item.providerId)}`,
    day: day.day,
    associatedDay: day.day,
    associatedBase: day.overnight,
    reason: recommendationReason(item, vehicle),
    vehicleFit: [vehicle],
    vehicleProfileId: vehicle,
    vehicleFitExplanation: vehicleFitExplanation(item, vehicle),
    coordinateRole: 'catalogue-location',
    straightLineDistanceKm: validCoordinate(item.point) && validCoordinate(day.toPoint || day.fromPoint)
      ? Number((haversineKm(item.point, day.toPoint || day.fromPoint) || 0).toFixed(1))
      : null,
    rank: rank + 1
  };
}

function baseRecommendations(destination, baseName, vehicle) {
  const normalizedBase = normalizeText(baseName);
  return (destination.catalogueRecommendations || [])
    .filter(item => normalizeText(item.associatedBase) === normalizedBase && vehicleEligible(item, vehicle));
}

function transitAnchorForDay(day, pack) {
  const dayPoint = point(day?.toPoint);
  if (!dayPoint || !pack?.anchors?.length) return null;
  const requestedId = normalizeText(day?.toPoint?.providerId).replace(/^gn /, '');
  const anchors = pack.anchors.map((anchor, index) => normalizeAnchor(anchor, pack, index)).filter(Boolean);
  const direct = anchors.find(anchor => {
    const ids = [anchor.id, anchor.providerId, anchor.source?.id]
      .map(value => normalizeText(value).replace(/^gn /, ''));
    return requestedId && ids.includes(requestedId);
  });
  if (direct) return direct;
  return anchors
    .filter(stayCapableAnchor)
    .map(anchor => ({ anchor, distanceKm: haversineKm(dayPoint, anchor.point) ?? Infinity }))
    .filter(item => item.distanceKm <= 65)
    .sort((left, right) => left.distanceKm - right.distanceKm
      || right.anchor.significanceScore - left.anchor.significanceScore
      || left.anchor.name.localeCompare(right.anchor.name, 'en'))[0]?.anchor || null;
}

function transitRecommendationsForPlan(plan, destination) {
  const allowedCodes = new Set([destination?.countryCode, ...(destination?.transitCountryCodes || [])].filter(Boolean));
  const output = [];
  for (const day of plan?.days || []) {
    if (day.overnightRole !== 'catalogue-transit' || !validCoordinate(day.toPoint)) continue;
    const entry = resolveCatalogCountryFromPoint(day.toPoint);
    if (!entry?.code || !allowedCodes.has(entry.code)) continue;
    const pack = getLoadedCountryPack(entry.code);
    if (!pack) continue;
    const anchor = transitAnchorForDay(day, pack);
    if (!anchor) continue;
    for (const item of recommendationsForAnchors([anchor], pack)) {
      output.push({
        ...item,
        associatedBase: day.overnight,
        associatedBaseId: anchor.id,
        transitCountryCode: entry.code,
        transitEvidence: true
      });
    }
  }
  return output;
}

function sanitizeVehicleFallback(item, vehicle) {
  const declaredVehicle = item.vehicleProfileId
    || (Array.isArray(item.vehicleFit) && item.vehicleFit.length === 1 ? item.vehicleFit[0] : null);
  if (declaredVehicle && transportId(declaredVehicle) !== vehicle) return null;
  if (vehicle === 'car' && item.genericFallback
    && /motor(?:cycle|fiets|vriendelijk|parking|hotel|reiziger)/i.test([item.name, item.reason, item.vehicleFitExplanation].filter(Boolean).join(' '))) return null;
  const output = { ...item, vehicleFit: [vehicle], vehicleProfileId: vehicle };
  if (vehicle === 'motorcycle' && item.type === 'accommodation' && !item.parkingEvidence) {
    output.name = `Verblijf passend bij motorreizigers in of nabij ${item.associatedBase || ''}`.trim();
    output.reason = 'Beveiliging en overdekking van motorparking zijn niet geverifieerd; controleer dit vóór boeken.';
  }
  return output;
}

function accommodationRank(item) {
  return Number(Boolean(item?.live)) * 100
    + Number(Boolean(item?.providerId)) * 20
    + Number(!item?.genericFallback) * 10
    + Math.max(0, Math.min(9, Number(item?.confidence) || 0));
}

function canonicalAccommodationOptions(plan, destination, trip, vehicle) {
  const byBase = new Map();
  const firstDayByBase = new Map();
  for (const day of plan.days || []) {
    const baseKey = normalizeText(day.overnight);
    if (!baseKey || (day.kind === 'return' && normalizeText(day.to) === normalizeText(trip.origin))) continue;
    if (!firstDayByBase.has(baseKey)) firstDayByBase.set(baseKey, day);
    const candidates = [day.sleepProposal, ...(day.accommodationOptions || []), ...(day.recommendations || [])]
      .filter(item => item?.type === 'accommodation')
      .map(item => sanitizeVehicleFallback(item, vehicle))
      .filter(Boolean);
    if (!byBase.has(baseKey)) byBase.set(baseKey, []);
    byBase.get(baseKey).push(...candidates);
  }
  for (const [baseKey, day] of firstDayByBase) {
    const catalogueCandidates = baseRecommendations(destination, day.overnight, vehicle)
      .filter(item => item.type === 'accommodation')
      .map((item, index) => dayRecommendation(item, day, trip, index));
    byBase.get(baseKey).push(...catalogueCandidates);
  }
  for (const [baseKey, candidates] of byBase) {
    const seen = new Set();
    const uniqueCandidates = candidates
      .sort((left, right) => accommodationRank(right) - accommodationRank(left)
        || String(left.name || '').localeCompare(String(right.name || ''), 'nl'))
      .filter(item => {
        const identity = accommodationIdentity(item, firstDayByBase.get(baseKey)?.overnight || baseKey);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .slice(0, 3);
    byBase.set(baseKey, uniqueCandidates);
  }
  return byBase;
}

export function enrichPlanWithCatalogue(trip, destination, plan) {
  if (!destination?.catalogue || !plan?.days) return plan;
  const vehicle = transportId(trip.transport);
  const used = new Set();
  const transitRecommendations = transitRecommendationsForPlan(plan, destination);
  const recommendationDestination = transitRecommendations.length ? {
    ...destination,
    catalogueRecommendations: [...(destination.catalogueRecommendations || []), ...transitRecommendations]
  } : destination;
  const accommodationByBase = canonicalAccommodationOptions(plan, recommendationDestination, trip, vehicle);
  const desiredForDay = day => day.kind === 'unplanned'
    ? []
    : ['stay', 'flex'].includes(day.kind)
      ? ['activity', 'restaurant']
      : ['fuel', 'rest', 'restaurant', 'service'];

  for (const [dayIndex, day] of plan.days.entries()) {
    const isHomecoming = day.kind === 'return' && normalizeText(day.to) === normalizeText(trip.origin);
    const catalogueItems = isHomecoming ? [] : baseRecommendations(recommendationDestination, day.overnight, vehicle);
    const selected = [];
    for (const type of desiredForDay(day)) {
      const maximum = 1;
      const matches = catalogueItems.filter(item => item.type === type && !used.has(`${item.provider}:${item.providerId}`)).slice(0, maximum);
      for (const item of matches) {
        const identity = `${item.provider}:${item.providerId}`;
        used.add(identity);
        selected.push(dayRecommendation(item, day, trip, selected.length));
      }
    }
    const existing = (day.recommendations || []).map(item => sanitizeVehicleFallback(item, vehicle))
      .filter(item => item && item.type !== 'accommodation');
    const namedEvidence = existing.filter(item => !item.genericFallback && item.providerId);
    const namedTypes = new Set(namedEvidence.map(item => item.type));
    const retainedCatalogue = selected.filter(item => !namedTypes.has(item.type));
    const suppliedTypes = new Set([...namedTypes, ...retainedCatalogue.map(item => item.type)]);
    day.recommendations = [...namedEvidence, ...retainedCatalogue, ...existing.filter(item => !item.providerId && !suppliedTypes.has(item.type))]
      .filter((item, index, list) => item.genericFallback || list.findIndex(other => other.providerId && other.providerId === item.providerId) === index);
    const baseKey = normalizeText(day.overnight);
    const canonicalAccommodations = accommodationByBase.get(baseKey) || [];
    const dayOptions = canonicalAccommodations.map((item, index) => ({
      ...item,
      id: `day-${day.day}-accommodation-pinned-${slug(item.providerId || item.id || item.name)}-${index + 1}`,
      day: day.day,
      associatedDay: day.day,
      associatedBase: day.overnight,
      accommodationIdentity: accommodationIdentity(item, day.overnight)
    }));
    day.accommodationOptions = dayOptions;
    day.sleepProposal = dayOptions[0] || null;
    const arrivedAtBase = dayIndex === 0 || normalizeText(plan.days[dayIndex - 1]?.overnight) !== baseKey;
    if (arrivedAtBase) day.recommendations.push(...dayOptions);
  }

  const accommodationAudit = annotateAccommodationContinuity(plan.days, trip.origin);
  plan.accommodationChanges = accommodationAudit.totalChanges;
  plan.accommodationPropertyChanges = accommodationAudit.propertyChanges;
  plan.accommodationStays = accommodationAudit.stays;

  plan.recommendations = plan.days.flatMap(day => day.recommendations || []);
  const namedSeen = new Set();
  plan.recommendations = plan.recommendations.filter(item => {
    if (item.genericFallback || !item.providerId) return true;
    const identity = `${item.provider || item.source}:${item.providerId}`;
    if (namedSeen.has(identity)) return false;
    namedSeen.add(identity);
    return true;
  });
  plan.accommodationOptions = [...accommodationByBase.entries()].map(([normalizedBase, recommendations]) => ({
    base: plan.days.find(day => normalizeText(day.overnight) === normalizedBase)?.overnight || normalizedBase,
    point: plan.days.find(day => normalizeText(day.overnight) === normalizedBase)?.toPoint || null,
    selectedAccommodationIdentity: recommendations[0]
      ? accommodationIdentity(recommendations[0], plan.days.find(day => normalizeText(day.overnight) === normalizedBase)?.overnight || normalizedBase)
      : null,
    recommendations: recommendations.map(item => ({
      ...item,
      accommodationIdentity: accommodationIdentity(item, plan.days.find(day => normalizeText(day.overnight) === normalizedBase)?.overnight || normalizedBase)
    }))
  }));
  const existingPlaceData = plan.placeData || {};
  plan.placeData = {
    ...existingPlaceData,
    live: Boolean(existingPlaceData.live),
    catalogue: true,
    namedPlaces: plan.recommendations.filter(item => !item.genericFallback && item.providerId).length,
    source: existingPlaceData.live ? existingPlaceData.source : CATALOGUE_SOURCE,
    catalogueSource: CATALOGUE_SOURCE,
    catalogVersion: destination.catalogVersion,
    transitCountryCodes: [...new Set(transitRecommendations.map(item => item.transitCountryCode).filter(Boolean))]
  };
  return plan;
}

export { CATALOGUE_SOURCE };
