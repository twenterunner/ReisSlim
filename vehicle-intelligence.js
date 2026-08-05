import { transportProfiles } from './config.js';

export const legacyTransportAliases = { camper: 'motorhome' };

const PROHIBITED_SUITABILITY = new Set(['prohibited', 'unsuitable', 'not suitable', 'not supported', 'forbidden', 'denied', 'blocked', 'inaccessible', 'no', 'false']);
const SUPPORTED_SUITABILITY = new Set(['supported', 'suitable', 'permitted', 'allowed', 'yes', 'true']);
const LIMITED_SUITABILITY = new Set(['limited', 'conditional', 'restricted', 'caution']);
const ROUGH_SURFACE_PATTERN = /\b(unpaved|gravel|dirt|sand|ground|mud|earth|track)\b/i;
const MOTORCYCLE_ONLY_RECOMMENDATION_PATTERN = /\b(motorcycles?|motorbikes?|motorfiets(?:en)?|motorrad(?:fahrer|hotel)?|bikers?|moto(?:s|cyclisme)?|motorcycle[- ]?(?:hotel|parking|repair|service)|bike[- ]?hotel)\b/i;
const CAR_SERVICE_EVIDENCE_PATTERN = /\b(automotive|auto[- ]?(?:parts|repair|service)|car[- ]?(?:parts|repair|service|parking)|tyres?|tires?|wheel alignment|vehicle repair|motor vehicle)\b/i;

const normalizedEvidence = value => {
  if (Array.isArray(value)) return value.flatMap(normalizedEvidence);
  if (value && typeof value === 'object') {
    const preferred = value.values ?? value.value ?? value.surface ?? value.tags;
    return preferred === undefined ? Object.values(value).flatMap(normalizedEvidence) : normalizedEvidence(preferred);
  }
  return String(value || '').trim() ? [String(value).trim()] : [];
};

/**
 * Decode catalogue/provider suitability without treating unknown evidence as a
 * prohibition. All runtime consumers use this decoder so a structured
 * `prohibited` value cannot be accidentally interpreted as truthy support.
 */
export function decodeVehicleSuitability(value) {
  const evidence = value && typeof value === 'object'
    ? normalizedEvidence(value.evidence || value.reasons || value.reason || [])
    : [];
  if (value === false || value === null) return { status: value === false ? 'prohibited' : 'unknown', score: value === false ? 0 : 5, evidence, explicit: value === false };
  if (value === true) return { status: 'supported', score: 8, evidence, explicit: true };
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return { status: 'prohibited', score: 0, evidence, explicit: true };
    return { status: value < 4 ? 'limited' : 'supported', score: Math.max(0, Math.min(10, value)), evidence, explicit: true };
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim() && Number.isFinite(numeric)) return decodeVehicleSuitability(numeric);
    const status = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (PROHIBITED_SUITABILITY.has(status)) return { status: 'prohibited', score: 0, evidence, explicit: true };
    if (SUPPORTED_SUITABILITY.has(status)) return { status: 'supported', score: 8, evidence, explicit: true };
    if (LIMITED_SUITABILITY.has(status)) return { status: 'limited', score: 3, evidence, explicit: true };
    return { status: 'unknown', score: 5, evidence, explicit: false };
  }
  if (value && typeof value === 'object') {
    if (value.allowed === false || value.suitable === false || value.compatible === false) {
      return { status: 'prohibited', score: 0, evidence, explicit: true };
    }
    const decodedStatus = decodeVehicleSuitability(value.suitability ?? value.status ?? value.allowed ?? value.suitable ?? value.compatible);
    const numericScore = Number(value.score);
    return {
      ...decodedStatus,
      score: decodedStatus.status === 'prohibited'
        ? 0
        : Number.isFinite(numericScore) ? Math.max(0, Math.min(10, numericScore)) : decodedStatus.score,
      evidence: [...new Set([...decodedStatus.evidence, ...evidence])],
      explicit: decodedStatus.explicit || evidence.length > 0
    };
  }
  return { status: 'unknown', score: 5, evidence, explicit: false };
}

export function vehicleSuitabilityFor(value, vehicle) {
  const suitabilityRecordKeys = ['suitability', 'status', 'allowed', 'suitable', 'compatible', 'score', 'evidence'];
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    && !suitabilityRecordKeys.some(key => Object.hasOwn(value, key))
    ? value[transportId(vehicle)]
    : value;
  return decodeVehicleSuitability(raw);
}

function recommendationEvidenceText(item) {
  const values = [
    item?.name,
    item?.type,
    item?.category,
    item?.group,
    item?.vehicleOnly,
    item?.vehicleNote,
    item?.reason,
    item?.evidence,
    item?.taxonomy,
    item?.vehicleCategoryEvidence,
    item?.vehicleFitEvidence,
    item?.parkingEvidence,
    item?.accessEvidence
  ];
  return normalizedEvidence(values).join(' ').replace(/[_-]+/g, ' ');
}

function explicitlySupportsVehicle(item, vehicle) {
  const canonical = transportId(vehicle);
  if (Array.isArray(item?.vehicleFit)) return item.vehicleFit.map(transportId).includes(canonical);
  const suitability = vehicleSuitabilityFor(item?.vehicleFit, canonical);
  if (['supported', 'limited'].includes(suitability.status) && suitability.explicit) return true;
  const evidence = item?.vehicleFitEvidence && typeof item.vehicleFitEvidence === 'object' && !Array.isArray(item.vehicleFitEvidence)
    ? item.vehicleFitEvidence[canonical]
    : null;
  return normalizedEvidence(evidence).length > 0;
}

/**
 * Apply evidence-aware vehicle filtering to named provider recommendations.
 * Provider names are never rewritten. A motorcycle-specific service or stay is
 * simply omitted from car plans unless the source also supplies affirmative
 * car-service/access evidence.
 */
export function recommendationVehicleCompatible(item, vehicle) {
  const canonical = transportId(vehicle);
  if ((item?.prohibitedVehicles || []).map(transportId).includes(canonical)) return false;
  if (Array.isArray(item?.vehicleFit) && item.vehicleFit.length && !item.vehicleFit.map(transportId).includes(canonical)) return false;
  if (item?.vehicleFit && !Array.isArray(item.vehicleFit)
    && vehicleSuitabilityFor(item.vehicleFit, canonical).status === 'prohibited') return false;

  const recommendationType = String(item?.type || item?.category || '').trim().toLowerCase();
  const isVehicleSensitive = /accommodation|hotel|hostel|guest|camp|lodg|service|repair|garage|parts/.test(recommendationType);
  if (canonical !== 'car' || !isVehicleSensitive) return true;

  const evidence = recommendationEvidenceText(item);
  if (!MOTORCYCLE_ONLY_RECOMMENDATION_PATTERN.test(evidence)) return true;
  return explicitlySupportsVehicle(item, 'car') || CAR_SERVICE_EVIDENCE_PATTERN.test(evidence);
}

export function surfaceEvidenceValues(value) {
  return [...new Set(normalizedEvidence(value).map(item => item.toLowerCase().replace(/[_-]+/g, ' ')))];
}

export function hasRoughSurfaceEvidence(value) {
  return surfaceEvidenceValues(value).some(item => ROUGH_SURFACE_PATTERN.test(item));
}

export function surfacePolicyConflict(trip, value) {
  const surfaces = surfaceEvidenceValues(value);
  if (!surfaces.length) return false;
  if (trip?.roadSurfacePolicy === 'paved-only' && surfaces.some(item => ROUGH_SURFACE_PATTERN.test(item))) return true;
  const disallowed = (trip?.unacceptableRoadSurfaces || []).map(item => String(item).trim().toLowerCase()).filter(Boolean);
  return disallowed.some(item => surfaces.some(surface => surface === item || surface.includes(item)));
}

export function exceedsFuelRange(trip, serviceSpacingKm) {
  const spacing = Number(serviceSpacingKm);
  const range = Number(trip?.fuelRangeKm);
  return Number.isFinite(spacing) && spacing > 0 && Number.isFinite(range) && range > 0 && spacing > range;
}

export function transportId(value) {
  const id = legacyTransportAliases[value] || value;
  return transportProfiles[id] ? id : 'car';
}

export function vehicleProfile(tripOrId) {
  const id = typeof tripOrId === 'string' ? tripOrId : tripOrId?.transport;
  return transportProfiles[transportId(id)];
}

export function vehicleSpec(trip) {
  const profile = vehicleProfile(trip);
  return {
    transport: transportId(trip?.transport),
    routeMode: profile.routeMode,
    routeStyle: ['balanced', 'fastest', 'scenic'].includes(trip?.routeStyle) ? trip.routeStyle : 'balanced',
    fuelRangeKm: positive(trip?.fuelRangeKm, profile.defaultFuelRangeKm),
    maxSpeedKmh: profile.supportsDimensions ? positive(trip?.vehicleMaxSpeedKmh, profile.defaultMaxSpeedKmh) : null,
    heightM: profile.supportsDimensions ? positive(trip?.vehicleHeightM, profile.defaultHeightM) : null,
    lengthM: profile.supportsDimensions ? positive(trip?.vehicleLengthM, profile.defaultLengthM) : null,
    weightKg: profile.supportsDimensions ? positive(trip?.vehicleWeightKg, profile.defaultWeightKg) : null
  };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function estimateLegTiming(trip, { distanceKm, roadHours, arrival = true } = {}) {
  const profile = vehicleProfile(trip);
  const spec = vehicleSpec(trip);
  const movingHours = Math.max(0, Number(roadHours) || 0);
  const distance = Math.max(0, Number(distanceKm) || 0);
  const restStops = movingHours <= .25 ? 0 : Math.floor(Math.max(0, movingHours - .05) / profile.breakEveryHours);
  const fuelStops = Math.max(0, Math.ceil(distance / Math.max(80, spec.fuelRangeKm * .86)) - 1);
  const stopCount = Math.max(restStops, fuelStops);
  const restMinutes = restStops * profile.breakMinutes;
  const additionalFuelMinutes = Math.max(0, fuelStops - restStops) * profile.fuelStopMinutes;
  const weatherReserveMinutes = Math.round(movingHours * (profile.weatherReserveMinutesPerHour || 0));
  const arrivalMinutes = arrival ? profile.arrivalBufferMinutes : 0;
  const nonDrivingMinutes = restMinutes + additionalFuelMinutes + weatherReserveMinutes + arrivalMinutes;
  return {
    roadHours: Number(movingHours.toFixed(1)),
    elapsedHours: Number((movingHours + nonDrivingMinutes / 60).toFixed(1)),
    breakHours: Number((nonDrivingMinutes / 60).toFixed(1)),
    restStops,
    fuelStops,
    stopCount,
    restMinutes,
    weatherReserveMinutes,
    arrivalMinutes
  };
}

export function adjustProviderMovingHours(trip, roadHours, { carProfile = false } = {}) {
  const movingHours = Math.max(0, Number(roadHours) || 0);
  if (!carProfile || transportId(trip?.transport) !== 'motorcycle') return movingHours;
  return movingHours * Math.max(1, Number(vehicleProfile(trip).roadTimeFactor) || 1);
}

export function minimumTravelLegs(trip, distanceKm, roadHours, maximum = 8) {
  for (let legs = 1; legs <= maximum; legs += 1) {
    const timing = estimateLegTiming(trip, { distanceKm: distanceKm / legs, roadHours: roadHours / legs });
    if (timing.elapsedHours <= trip.maxDrive + .05) return legs;
  }
  return maximum;
}

export function travelGuidance(trip, timing) {
  const id = transportId(trip.transport);
  const stopText = timing.stopCount
    ? `${timing.stopCount} geplande pauze${timing.stopCount === 1 ? '' : 's'}`
    : 'een korte pauze naar behoefte';
  if (id === 'motorcycle') return `Plan ${stopText}, bewaak actieradius en weer, en vermijd een zwaar programma na aankomst.`;
  if (id === 'motorhome') return `Plan ${stopText}, controleer hoogte- en gewichtsbeperkingen en reserveer tijd voor aankomst en opstellen.`;
  if (id === 'caravan') return `Plan ${stopText}, vermijd krappe toegangswegen en arriveer ruim vóór sluiting van de camping.`;
  return `Plan ${stopText} en houd parkeren en aankomsttijd vrij van het activiteitenprogramma.`;
}

export function vehicleMatchLabel(trip) {
  return vehicleProfile(trip).accommodationLabel;
}
