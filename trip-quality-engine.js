import { clamp, validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { buildTravelReadiness } from './travel-readiness.js';
import { surfaceEvidenceValues, transportId, vehicleProfile, vehicleSuitabilityFor } from './vehicle-intelligence.js';

const TRAVEL_KINDS = new Set(['outward', 'return', 'transfer']);
const GENERIC_SOURCE = /offline|categorievoorstel|reisslim|estimate|raming/i;
const GENERIC_NAME = /^(?:local hotel|hotel (?:in|near|nabij|voor)|appartement (?:in|near|nabij)|camping (?:in|near|nabij)|camperplaats|caravancamping|diner in|restaurant (?:in|near|nabij|met)|activiteit(?: in)?|motorvriendelijk verblijf|verblijf passend bij|comfortabele parkeer|brandstof- en ruststop|ruststop \d+|tankstation binnen)\b/i;
const LIVE_ROUTE_SOURCES = new Set(['tomtom', 'openrouteservice', 'osrm']);
const ESTIMATED_ROUTE_SOURCE = /estimate|estimated|fallback|raming|local-base|multimodal-planning|offline-corridor/i;
const TRANSIT_ROLES = new Set(['transit', 'catalogue-transit', 'access-transit']);
const UNKNOWN_EVIDENCE = /^(?:unknown|onbekend|unverified|not verified|niet geverifieerd|not supplied|niet opgegeven|none|null|n\/a|na)$/i;

const round = value => Math.round(clamp(Number(value) || 0));
const ratio = (numerator, denominator, empty = 0) => denominator > 0 ? clamp(numerator / denominator, 0, 1) : empty;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const normalize = value => String(value || '').trim().toLocaleLowerCase('nl-NL');
const unique = values => new Set(values.filter(Boolean)).size;

function transitRole(value) {
  const role = normalize(value);
  return TRANSIT_ROLES.has(role) || role.endsWith('-transit') || role.startsWith('transit-');
}

function transitDay(day) {
  return Boolean(day?.isTransit || day?.transit === true || transitRole(day?.overnightRole) || transitRole(day?.toPoint?.role));
}

function evidenceValues(value) {
  if (Array.isArray(value)) return value.flatMap(evidenceValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(evidenceValues);
  if (typeof value === 'boolean') return value ? ['true'] : [];
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
  const text = String(value ?? '').trim();
  return text && !UNKNOWN_EVIDENCE.test(text) ? [text] : [];
}

const hasEvidence = value => evidenceValues(value).length > 0;

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function recommendationEvidence(item) {
  if (!item) return 0;
  if (item.live || item.verified) return 1;
  if (item.providerId || item.providerObjectId) return .9;
  if (item.source && !GENERIC_SOURCE.test(item.source)) return .72;
  return item.source ? .2 : 0;
}

function namedRecommendation(item) {
  const name = String(item?.name || '').trim();
  return Boolean(!item?.genericFallback && name && name.length > 3 && !GENERIC_NAME.test(name));
}

function namedEvidenceRecommendation(item) {
  return namedRecommendation(item) && recommendationEvidence(item) >= .7;
}

function coordinateKey(point, precision = 2) {
  return validCoordinate(point) ? `${Number(point.lat).toFixed(precision)},${Number(point.lon).toFixed(precision)}` : '';
}

function corridorKey(day) {
  const points = (day.geometry || []).filter(validCoordinate).map(point => coordinateKey(point));
  const names = [normalize(day.from), normalize(day.to)].filter(Boolean);
  const sequence = points.length > 1 ? points : names;
  if (sequence.length < 2) return '';
  const forward = sequence.join('>');
  const reverse = [...sequence].reverse().join('>');
  return forward < reverse ? forward : reverse;
}

function directedEdge(day) {
  const from = normalize(day.from);
  const to = normalize(day.to);
  return from && to && from !== to ? `${from}>${to}` : '';
}

function overnightMetrics(trip, destination, days) {
  const origin = normalize(trip.origin);
  const nights = days
    .filter(day => day.kind !== 'return' && !transitDay(day) && normalize(day.overnight) && normalize(day.overnight) !== origin)
    .map(day => normalize(day.overnight));
  const counts = new Map();
  nights.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
  const blocks = [];
  for (const name of nights) {
    if (blocks.at(-1)?.name === name) blocks.at(-1).nights += 1;
    else blocks.push({ name, nights: 1 });
  }
  const requestedCapacity = Math.max(1, Math.min(Number(trip.maxChanges || 0) + 1, 4));
  const durationTarget = trip.days >= 12 ? 3 : trip.days >= 7 ? 2 : 1;
  const targetBases = Math.min(requestedCapacity, durationTarget);
  const destinationName = normalize(destination.name);
  const namedBases = [...counts.keys()].filter(name => name && name !== destinationName).length;
  return {
    nights,
    counts,
    blocks,
    targetBases,
    uniqueBases: counts.size,
    namedBases,
    largestShare: counts.size ? Math.max(...counts.values()) / Math.max(1, nights.length) : 1,
    singleNightShare: ratio(blocks.filter(block => block.nights === 1).length, blocks.length, 1),
    multiNightShare: ratio(blocks.filter(block => block.nights >= 2).reduce((sum, block) => sum + block.nights, 0), nights.length)
  };
}

function experienceMetrics(destination, plan, days) {
  const activityDays = days.filter(day => day.kind === 'stay' && !transitDay(day));
  const transitDayNumbers = new Set(days.filter(transitDay).map(day => Number(day.day)));
  const primary = activityDays.map(day => normalize(day.primaryPlan)).filter(Boolean);
  const activityRecommendations = (plan.recommendations || [])
    .filter(item => ['activity', 'poi', 'attraction'].includes(item.type)
      && !transitDayNumbers.has(Number(item.associatedDay ?? item.day))
      && !item.genericFallback && namedRecommendation(item) && recommendationEvidence(item) >= .7)
    .map(item => normalize(item.name)).filter(Boolean);
  const identities = [...primary, ...activityRecommendations];
  const graphCandidates = (plan.routeGraph?.graph || destination.highlights || []).filter(item => !item.contextOnly).length;
  const available = Math.max(graphCandidates, destination.activities?.length || 0, 1);
  const target = Math.max(1, Math.min(Math.max(1, days.length - 2), tripExperienceTarget(days.length)));
  const unsupportedFlexDays = days.filter(day => day.kind === 'flex' && !day.activityId
    && !(day.recommendations || []).some(item => ['activity', 'poi', 'attraction'].includes(item.type)
      && !item.genericFallback && namedRecommendation(item) && recommendationEvidence(item) >= .7)).length;
  const allowedRecoveryDays = days.length >= 7 ? Math.max(1, Math.floor(days.length / 7)) : 0;
  return {
    activityDays,
    identities,
    uniqueExperiences: unique(identities),
    repeatedExperienceRatio: 1 - ratio(unique(identities), identities.length, 1),
    target,
    coverageRatio: ratio(unique(identities), target),
    unsupportedFlexDays,
    allowedRecoveryDays,
    fillerDays: Math.max(0, unsupportedFlexDays - allowedRecoveryDays),
    availableEvidence: available
  };
}

function tripExperienceTarget(days) {
  if (days >= 14) return 8;
  if (days >= 10) return 6;
  if (days >= 7) return 4;
  return Math.max(1, days - 2);
}

function routeRepetitionMetrics(days) {
  const travelDays = days.filter(day => TRAVEL_KINDS.has(day.kind));
  const corridors = travelDays.map(corridorKey).filter(Boolean);
  const corridorCounts = new Map();
  corridors.forEach(key => corridorCounts.set(key, (corridorCounts.get(key) || 0) + 1));
  const repeatedCorridors = [...corridorCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const travelEdges = travelDays.map(directedEdge).filter(Boolean);
  const seen = new Set();
  let reversals = 0;
  for (const edge of travelEdges) {
    const [from, to] = edge.split('>');
    if (seen.has(`${to}>${from}`)) reversals += 1;
    seen.add(edge);
  }
  return {
    corridors: corridors.length,
    uniqueCorridors: corridorCounts.size,
    repetitionRatio: ratio(repeatedCorridors, corridors.length),
    travelEdges: travelEdges.length,
    reversedTravelEdges: reversals,
    backtrackingRatio: ratio(reversals, Math.max(1, travelEdges.length - 1))
  };
}

function geographicCoverageMetrics(trip, destination, days) {
  const origin = normalize(trip.origin);
  const points = [];
  for (const day of days) {
    if (normalize(day.overnight) === origin || transitDay(day)) continue;
    const candidate = validCoordinate(day.toPoint) ? day.toPoint : validCoordinate(day.fromPoint) ? day.fromPoint : null;
    if (candidate && !points.some(existing => (haversineKm(existing, candidate) ?? Infinity) < 2)) points.push(candidate);
  }
  let achievedSpanKm = 0;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) achievedSpanKm = Math.max(achievedSpanKm, haversineKm(points[left], points[right]) || 0);
  }
  const type = normalize(destination.destinationScope?.geographicType);
  const boundarySpanKm = Number(destination.destinationScope?.boundarySpanKm || 0);
  const broadScope = ['country', 'state', 'region', 'administrative'].includes(type) || boundarySpanKm >= 350;
  const dailyReachKm = Number(trip.maxDrive || 5) * (transportId(trip.transport) === 'motorcycle' ? 55 : 62);
  const targetSpanKm = broadScope && Number(trip.days) >= 10
    ? Math.min(dailyReachKm, Math.max(80, boundarySpanKm * .08))
    : 0;
  return {
    achievedSpanKm,
    targetSpanKm,
    broadScope,
    adequate: !targetSpanKm || achievedSpanKm >= targetSpanKm * .75,
    ratio: targetSpanKm ? ratio(achievedSpanKm, targetSpanKm) : 1
  };
}

function destinationStayMetrics(destination, days, geographic) {
  const accessDays = days.filter(day => day.kind === 'outward' || day.kind === 'return').length;
  const explicitTransitDays = days.filter(transitDay).length;
  const destinationDays = days.filter(day => day.kind !== 'outward' && day.kind !== 'return' && !transitDay(day)).length;
  const purposeDays = days.filter(day => !transitDay(day) && ['stay', 'flex', 'transfer'].includes(day.kind)).length;
  const destinationShare = ratio(destinationDays, days.length);
  const purposeShare = ratio(purposeDays, days.length);
  const applies = geographic.broadScope && days.length >= 10;
  const minimumShare = applies ? .45 : 0;
  const scoreRatio = applies
    ? clamp(ratio(destinationShare, .62) * .72 + ratio(purposeShare, .55) * .28, 0, 1)
    : 1;
  return {
    applies,
    accessDays,
    explicitTransitDays,
    destinationDays,
    purposeDays,
    destinationShare,
    purposeShare,
    minimumShare,
    scoreRatio,
    excessiveAccessBurden: applies && destinationShare + .0001 < minimumShare
  };
}

function routeSegmentEvidence(day) {
  const source = normalize(day?.routeSource);
  const confidence = normalize(day?.routeConfidence);
  const hasGeometry = (day?.geometry || []).filter(validCoordinate).length > 1;
  if (LIVE_ROUTE_SOURCES.has(source) || /live|provider-routed|verified-route/.test(confidence)) return 1;
  if (source === 'catalogue-corridor') {
    const roadEvidence = hasEvidence(day?.surfaceEvidence) || hasEvidence(day?.roadClassEvidence) || hasEvidence(day?.corridorId);
    return roadEvidence ? .82 : .68;
  }
  if (/recorded-road-fixture|recorded-route/.test(source)) return .85;
  if (ESTIMATED_ROUTE_SOURCE.test(source) || /estimated|fallback/.test(confidence)) return hasGeometry ? .12 : 0;
  return hasGeometry ? .42 : 0;
}

function routeEvidenceMetrics(travelDays) {
  const scores = travelDays.map(routeSegmentEvidence);
  const geometryCoverage = ratio(travelDays.filter(day => (day.geometry || []).filter(validCoordinate).length > 1).length, travelDays.length, 1);
  const liveCoverage = ratio(travelDays.filter(day => LIVE_ROUTE_SOURCES.has(normalize(day.routeSource))).length, travelDays.length);
  const estimatedCoverage = ratio(travelDays.filter(day => ESTIMATED_ROUTE_SOURCE.test(normalize(day.routeSource))
    || /estimated|fallback/.test(normalize(day.routeConfidence))).length, travelDays.length);
  return {
    ratio: average(scores),
    geometryCoverage,
    liveCoverage,
    estimatedCoverage,
    allEstimated: Boolean(travelDays.length) && estimatedCoverage === 1
  };
}

function explicitVehicleEvidence(item, vehicle) {
  const sourceFit = item?.sourceVehicleFit ?? item?.vehicleSuitability ?? item?.vehicleCompatibility ?? item?.vehicleFit;
  const suitability = vehicleSuitabilityFor(sourceFit, vehicle);
  const fitEvidence = item?.vehicleFitEvidence && typeof item.vehicleFitEvidence === 'object' && !Array.isArray(item.vehicleFitEvidence)
    ? item.vehicleFitEvidence[vehicle]
    : item?.vehicleFitEvidence;
  return hasEvidence(fitEvidence)
    || hasEvidence(item?.vehicleCategoryEvidence)
    || (suitability.explicit && suitability.status !== 'unknown');
}

function vehicleEvidenceMetrics(trip, travelDays, recommendations, baseMetrics) {
  const vehicle = transportId(trip.transport);
  const accessKnown = travelDays.filter(day => hasEvidence(day.vehicleSuitabilityEvidence)
    || (String(day.vehicleSuitability || '').trim() && normalize(day.vehicleSuitability) !== 'unknown')).length;
  const surfaceKnown = travelDays.filter(day => surfaceEvidenceValues(day.surfaceEvidence).length > 0).length;
  const fuelKnown = travelDays.filter(day => Number.isFinite(Number(day.fuelServiceSpacingKm)) && Number(day.fuelServiceSpacingKm) > 0).length;
  const accommodations = recommendations.accommodations || [];
  const parkingKnown = accommodations.filter(item => hasEvidence(item.parkingEvidence) || hasEvidence(item.accessEvidence)
    || explicitVehicleEvidence(item, vehicle)).length;
  const accessRatio = ratio(accessKnown, travelDays.length, travelDays.length ? 0 : 1);
  const surfaceRatio = ratio(surfaceKnown, travelDays.length, travelDays.length ? 0 : 1);
  const fuelRatio = ratio(fuelKnown, travelDays.length, travelDays.length ? 0 : 1);
  const parkingRatio = ratio(parkingKnown, accommodations.length, baseMetrics.uniqueBases ? 0 : 1);
  return {
    accessRatio,
    surfaceRatio,
    fuelRatio,
    parkingRatio,
    overall: average([accessRatio, surfaceRatio, fuelRatio, parkingRatio])
  };
}

function recommendationMetrics(trip, plan, baseMetrics) {
  const all = plan.recommendations || [];
  const transitDayNumbers = new Set((plan.days || []).filter(transitDay).map(day => Number(day.day)));
  const touring = all.filter(item => !transitDayNumbers.has(Number(item.associatedDay ?? item.day)));
  const relevantPois = touring.filter(item => ['activity', 'poi', 'attraction', 'restaurant'].includes(item.type));
  const activityPois = touring.filter(item => ['activity', 'poi', 'attraction'].includes(item.type));
  const restaurants = touring.filter(item => item.type === 'restaurant');
  const services = all.filter(item => ['fuel', 'rest', 'service', 'charging'].includes(item.type));
  const identities = relevantPois.map(item => `${normalize(item.type)}:${normalize(item.name)}`).filter(value => !value.endsWith(':'));
  const accommodations = touring.filter(item => item.type === 'accommodation');
  const coveredBases = new Set();
  const namedCoveredBases = new Set();
  for (const day of plan.days || []) {
    if (transitDay(day)) continue;
    if ((day.recommendations || []).some(item => item.type === 'accommodation')) coveredBases.add(normalize(day.overnight));
    if ((day.recommendations || []).some(item => item.type === 'accommodation' && namedEvidenceRecommendation(item))) namedCoveredBases.add(normalize(day.overnight));
  }
  const vehicle = transportId(trip.transport);
  const compatible = all.filter(item => item.vehicleProfileId === vehicle || item.vehicleFit?.includes(vehicle)).length;
  const namedPoiEvidenceRatio = ratio(activityPois.filter(namedEvidenceRecommendation).length, activityPois.length);
  const namedRestaurantEvidenceRatio = ratio(restaurants.filter(namedEvidenceRecommendation).length, restaurants.length);
  const namedServiceEvidenceRatio = ratio(services.filter(namedEvidenceRecommendation).length, services.length);
  const namedAccommodationEvidenceRatio = ratio(accommodations.filter(namedEvidenceRecommendation).length, accommodations.length);
  const namedAccommodationCoverage = ratio([...baseMetrics.counts.keys()].filter(base => namedCoveredBases.has(base)).length,
    baseMetrics.uniqueBases, baseMetrics.uniqueBases ? 0 : 1);
  const accommodationEvidenceComponent = namedAccommodationEvidenceRatio * .55 + namedAccommodationCoverage * .45;
  const namedEvidenceCompleteness = namedPoiEvidenceRatio * .38 + accommodationEvidenceComponent * .32
    + namedRestaurantEvidenceRatio * .15 + namedServiceEvidenceRatio * .15;
  return {
    all,
    relevantPois,
    activityPois,
    restaurants,
    services,
    poiUniqueRatio: ratio(unique(identities), identities.length, 1),
    namedPoiRatio: ratio(relevantPois.filter(namedRecommendation).length, relevantPois.length),
    namedPoiEvidenceRatio,
    namedRestaurantEvidenceRatio,
    namedServiceEvidenceRatio,
    namedEvidenceCompleteness,
    evidenceRatio: ratio(all.reduce((sum, item) => sum + recommendationEvidence(item), 0), all.length),
    accommodations,
    accommodationCoverage: ratio([...baseMetrics.counts.keys()].filter(base => coveredBases.has(base)).length, baseMetrics.uniqueBases, baseMetrics.uniqueBases ? 0 : 1),
    namedAccommodationCoverage,
    uniqueAccommodationRatio: ratio(unique(accommodations.map(item => normalize(item.name))), accommodations.length, 1),
    namedAccommodationRatio: ratio(accommodations.filter(namedRecommendation).length, accommodations.length),
    namedAccommodationEvidenceRatio,
    vehicleCompatibility: ratio(compatible, all.length, 1)
  };
}

function completenessMetrics(trip, plan, days) {
  const exactDates = days.filter((day, index) => day.date === addDays(trip.startDate, index)).length;
  const requiredFields = days.reduce((sum, day) => sum + ['kind', 'from', 'to', 'location', 'overnight', 'primaryPlan'].filter(key => String(day[key] || '').trim()).length, 0);
  const recommendationDays = days.filter(day => Array.isArray(day.recommendations) && day.recommendations.length).length;
  const startsAtOrigin = normalize(days[0]?.from) === normalize(trip.origin);
  const returnsToOrigin = normalize(days.at(-1)?.to) === normalize(trip.origin);
  return {
    dayCountRatio: ratio(days.length, Number(trip.days) || 0),
    dateRatio: ratio(exactDates, days.length),
    fieldRatio: ratio(requiredFields, days.length * 6),
    recommendationCoverage: ratio(recommendationDays, days.length),
    startsAtOrigin,
    returnsToOrigin
  };
}

function qualityGate(dimensions, context) {
  const reasons = [];
  if (context.constraintRejected) reasons.push('Een of meer harde reisvoorwaarden worden niet gehaald.');
  if (dimensions.coverage < 45) reasons.push('Te weinig verschillende reisankers en ervaringen voor de reisduur.');
  if (dimensions.coherence < 60) reasons.push('De dagroute is niet voldoende aaneengesloten of bevat te zware etappes.');
  if (dimensions.completeness < 75) reasons.push('De canonieke dagplanning is onvolledig.');
  if (context.weakMicroLoop) reasons.push('De reis herhaalt voor deze duur vrijwel dezelfde basis, ervaring en routecorridor.');
  if (context.weakGeographicCoverage) reasons.push(`De route bestrijkt circa ${Math.round(context.geographic.achievedSpanKm)} km; voor deze lange ${context.geographic.broadScope ? 'land- of regiovraag' : 'reis'} is minimaal circa ${Math.round(context.geographic.targetSpanKm * .75)} km nodig om een stedelijke microlus te vermijden.`);
  if (context.destinationStay.excessiveAccessBurden) reasons.push(`Slechts ${context.destinationStay.destinationDays} van ${context.totalDays} dagen vinden in het gevraagde reisgebied plaats; voor deze lange land- of regioreis is de toegangsbelasting te groot.`);
  if (context.weakNamedEvidence) reasons.push('Te weinig genoemde POI-, accommodatie-, horeca- en service-evidence is gekoppeld aan de canonieke reis.');
  if (context.fillerDays > 0) reasons.push(`${context.fillerDays} verblijfsdag(en) hebben geen onderscheidend, evidence-backed doel.`);
  return { passed: reasons.length === 0, reasons };
}

export const qualityDimensionLabels = Object.freeze({
  coverage: 'Dekking',
  destinationStay: 'Bestemmingstijd versus toegang',
  baseQuality: 'Kwaliteit uitvalsbases',
  nightAllocation: 'Nachtverdeling',
  coherence: 'Routesamenhang',
  backtracking: 'Beperking terugrijden',
  corridorRepetition: 'Corridorvariatie',
  poiUniqueness: 'Unieke POI\'s',
  namedEvidence: 'Genoemde evidence-compleetheid',
  evidenceQuality: 'Bewijskwaliteit',
  accommodationQuality: 'Accommodatiekwaliteit',
  touringRoadQuality: 'Toerroutkwaliteit',
  vehicleSuitability: 'Voertuigmatch',
  completeness: 'Compleetheid',
  uncertainty: 'Onzekerheidsbeheersing'
});

export function calculateTripQuality(trip, destination, plan, budget) {
  const days = plan.days || [];
  plan.readiness ||= buildTravelReadiness(trip, destination, plan);
  const readiness = plan.readiness;
  const bases = overnightMetrics(trip, destination, days);
  const experiences = experienceMetrics(destination, plan, days);
  const repetition = routeRepetitionMetrics(days);
  const geographic = geographicCoverageMetrics(trip, destination, days);
  const destinationStay = destinationStayMetrics(destination, days, geographic);
  const recommendations = recommendationMetrics(trip, plan, bases);
  const complete = completenessMetrics(trip, plan, days);
  const travelDays = days.filter(day => TRAVEL_KINDS.has(day.kind));
  const routeEvidenceMetricsResult = routeEvidenceMetrics(travelDays);
  const vehicleEvidence = vehicleEvidenceMetrics(trip, travelDays, recommendations, bases);
  const excessive = days.filter(day => day.exceedsDailyLimit || Number(day.elapsedHours ?? day.driveHours ?? 0) > Number(trip.maxDrive) + .05).length;
  const continuityBreaks = days.filter((day, index) => index > 0 && normalize(days[index - 1].to) !== normalize(day.from)).length;
  const locationBreaks = days.filter(day => !TRAVEL_KINDS.has(day.kind) && normalize(day.from) !== normalize(day.to)).length;
  const exploration = clamp(Number(plan.routeMetrics?.exploration?.explorationScore ?? (100 - repetition.repetitionRatio * 100)));
  const baseCoverage = ratio(bases.uniqueBases, bases.targetBases);
  const distinctExperienceRatio = ratio(experiences.uniqueExperiences, Math.max(1, experiences.activityDays.length));
  const weakMicroLoop = days.length >= 10
    && bases.uniqueBases <= 1
    && distinctExperienceRatio < .45
    && (repetition.repetitionRatio > .35 || experiences.repeatedExperienceRatio > .45);
  const weakGeographicCoverage = geographic.broadScope && days.length >= 10 && !geographic.adequate;
  const coordinateCoverage = ratio(days.filter(day => validCoordinate(day.toPoint)).length, days.length);
  const namedBaseRatio = ratio(bases.namedBases, bases.uniqueBases, bases.uniqueBases ? 0 : 1);
  const singleNightPenalty = bases.singleNightShare * 42;
  const dominancePenalty = bases.targetBases > 1 ? clamp((bases.largestShare - .65) / .35, 0, 1) * 58 : 0;
  const hardChangeExcess = Math.max(0, Number(plan.accommodationChanges || 0) - Number(trip.maxChanges || 0));
  const travelGeometryCoverage = routeEvidenceMetricsResult.geometryCoverage;
  const routeEvidence = routeEvidenceMetricsResult.ratio;
  const graphEvidenceItems = (plan.routeGraph?.graph || destination.highlights || []).filter(item => item.evidence || item.source || item.providerId).length;
  const graphEvidenceRatio = ratio(graphEvidenceItems, (plan.routeGraph?.graph || destination.highlights || []).length, .35);
  const supportsDimensions = vehicleProfile(trip).supportsDimensions;
  const dimensionsReady = !supportsDimensions || [trip.vehicleHeightM, trip.vehicleLengthM, trip.vehicleWeightKg].every(value => Number.isFinite(Number(value)) && Number(value) > 0);
  const budgetRatio = Number(budget.total || 0) / Math.max(1, Number(trip.budget || 0));
  const severeBacktracking = repetition.travelEdges >= 4 && repetition.backtrackingRatio > .5;
  const weakNamedEvidence = destinationStay.applies && recommendations.namedEvidenceCompleteness < .45;

  const rawDimensions = {
    coverage: clamp(8 + baseCoverage * 35 + experiences.coverageRatio * 35 + geographic.ratio * 22),
    destinationStay: clamp(destinationStay.scoreRatio * 100),
    baseQuality: clamp(18 + coordinateCoverage * 32 + namedBaseRatio * 22 + recommendations.accommodationCoverage * 28),
    nightAllocation: clamp(100 - singleNightPenalty - dominancePenalty - hardChangeExcess * 18 + bases.multiNightShare * 6),
    coherence: clamp(100 - continuityBreaks * 28 - locationBreaks * 18 - excessive * 34 - (complete.startsAtOrigin ? 0 : 28) - (complete.returnsToOrigin ? 0 : 28)),
    backtracking: clamp(100 - repetition.backtrackingRatio * 88),
    corridorRepetition: clamp(100 - repetition.repetitionRatio * 92),
    poiUniqueness: clamp(recommendations.poiUniqueRatio * 54 + recommendations.namedPoiEvidenceRatio * 28 + (1 - experiences.repeatedExperienceRatio) * 18),
    namedEvidence: clamp(recommendations.namedEvidenceCompleteness * 100),
    evidenceQuality: clamp(recommendations.evidenceRatio * 34 + recommendations.namedEvidenceCompleteness * 23 + graphEvidenceRatio * 22 + routeEvidence * 21),
    accommodationQuality: clamp(recommendations.accommodationCoverage * 36 + recommendations.uniqueAccommodationRatio * 16 + recommendations.namedAccommodationEvidenceRatio * 20 + recommendations.namedAccommodationCoverage * 14 + recommendations.vehicleCompatibility * 14),
    touringRoadQuality: clamp(travelGeometryCoverage * 12 + routeEvidence * 52 + exploration * .18 + routeEvidenceMetricsResult.liveCoverage * 18),
    vehicleSuitability: clamp(recommendations.vehicleCompatibility * 20 + vehicleEvidence.overall * 65 + (dimensionsReady ? 5 : 0) + (readiness ? 10 : 4)),
    completeness: clamp(complete.dayCountRatio * 28 + complete.dateRatio * 22 + complete.fieldRatio * 22 + complete.recommendationCoverage * 14 + (complete.startsAtOrigin ? 7 : 0) + (complete.returnsToOrigin ? 7 : 0)),
    uncertainty: clamp(recommendations.evidenceRatio * 36 + graphEvidenceRatio * 22 + routeEvidence * 24 + (plan.placeData?.live ? 10 : 3) + (plan.routing?.live ? 8 : 2))
  };
  const weights = {
    coverage: 1.25, destinationStay: 1.15, baseQuality: .75, nightAllocation: .9, coherence: 1.35,
    backtracking: .7, corridorRepetition: .8, poiUniqueness: .9, namedEvidence: 1.0, evidenceQuality: 1.05,
    accommodationQuality: .9, touringRoadQuality: .9, vehicleSuitability: 1.1,
    completeness: 1.25, uncertainty: .9
  };
  const weightTotal = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let rawOverall = Object.entries(weights).reduce((sum, [key, weight]) => sum + rawDimensions[key] * weight, 0) / weightTotal;
  const constraintCategory = plan.constraintStatus?.category;
  const constraintRejected = constraintCategory === 'rejected'
    || (plan.feasible === false && constraintCategory !== 'stretch');
  if (constraintRejected) rawOverall = Math.min(55, rawOverall);
  else if (plan.constraintStatus?.category === 'stretch') rawOverall = Math.min(70, rawOverall);
  if (budgetRatio > 1 && trip.strictBudget !== false) rawOverall = Math.min(55, rawOverall);
  if (weakMicroLoop) rawOverall = Math.min(54, rawOverall);

  const dimensions = Object.fromEntries(Object.entries(rawDimensions).map(([key, value]) => [key, round(value)]));
  const gate = qualityGate(dimensions, {
    constraintRejected,
    weakMicroLoop,
    weakGeographicCoverage,
    geographic,
    destinationStay,
    totalDays: days.length,
    weakNamedEvidence,
    fillerDays: experiences.fillerDays
  });
  if (!gate.passed) rawOverall = Math.min(rawOverall, 64);
  const deductions = [...gate.reasons];
  if (excessive) deductions.push(`${excessive} rijdag${excessive === 1 ? '' : 'en'} boven de ingestelde limiet.`);
  if (budgetRatio > 1) deductions.push(`Indicatieve begroting €${Math.round(budget.total - trip.budget)} boven budget.`);
  if (repetition.backtrackingRatio > .25) deductions.push('De heen-, transfer- en terugroute rijdt meerdere corridors in tegengestelde richting terug.');
  if (repetition.repetitionRatio > .35) deductions.push('Dezelfde routecorridor komt op te veel dagen terug.');
  if (recommendations.evidenceRatio < .45) deductions.push('Veel plaatsen en verblijven hebben alleen generieke of zwakke evidence.');
  if (recommendations.namedEvidenceCompleteness < .55) deductions.push('De dekking met genoemde, brongebonden POI\'s, verblijven, horeca en services is beperkt.');
  if (vehicleEvidence.overall < .5) deductions.push('Wegtoegang, oppervlak, brandstofafstand of parkeerevidence voor het gekozen voertuig is grotendeels onbekend.');
  if (routeEvidenceMetricsResult.allEstimated) deductions.push('Alle toeretappes gebruiken geschatte geometrie; dit is geen bewijs voor route- of wegkwaliteit.');
  if (recommendations.accommodationCoverage < 1) deductions.push('Niet iedere overnachtingsbasis heeft een passende accommodatie-optie.');

  const improvementRecommendations = [];
  if (dimensions.destinationStay < 60) improvementRecommendations.push({ key: 'destinationStay', text: 'Verminder toegangs- en terugreisdagen of kies een dichterbij gelegen reisgebied zodat voldoende dagen echt op de bestemming plaatsvinden.', impact: 18 });
  if (dimensions.coverage < 60) improvementRecommendations.push({ key: 'coverage', text: 'Voeg alleen haalbare, geografisch samenhangende ankers toe en verdeel de verblijfsnachten over meer dan één sterke basis.', impact: 16 });
  if (dimensions.nightAllocation < 60) improvementRecommendations.push({ key: 'nightAllocation', text: 'Verminder éénnachtstops en voorkom dat vrijwel de hele reis op één zwak onderbouwde basis blijft.', impact: 14 });
  if (dimensions.coherence < 70) improvementRecommendations.push({ key: 'coherence', text: 'Herbouw de dagvolgorde zodat iedere dag aansluit op de vorige en alle etappes binnen de daglimiet blijven.', impact: 18 });
  if (dimensions.corridorRepetition < 65 || dimensions.backtracking < 65) improvementRecommendations.push({ key: 'routeStructure', text: 'Verwijder een herhaalde heen-en-weer-corridor of kies een echte lus met een andere terugweg.', impact: 12 });
  if (dimensions.poiUniqueness < 65) improvementRecommendations.push({ key: 'poiUniqueness', text: 'Vervang herhaalde generieke activiteiten door unieke, routegebonden POI-evidence.', impact: 12 });
  if (dimensions.namedEvidence < 60 || dimensions.evidenceQuality < 60 || dimensions.uncertainty < 60) improvementRecommendations.push({ key: 'evidence', text: 'Verrijk de gekozen bases, wegen, POI’s en verblijven met bron, actualiteit en expliciete onzekerheid.', impact: 14 });
  if (!improvementRecommendations.length) improvementRecommendations.push({ key: 'general', text: 'De structuur is sterk; controleer kort voor vertrek actuele wegen, openingstijden, prijzen en beschikbaarheid.', impact: 0 });

  return {
    overall: round(rawOverall), rawOverall, dimensions, rawDimensions,
    dimensionLabels: qualityDimensionLabels,
    deductions: [...new Set(deductions)],
    recommendations: improvementRecommendations.slice(0, 6),
    gate,
    passes: gate.passed,
    evidence: {
      excessiveDays: excessive,
      uniqueBases: bases.uniqueBases,
      targetBases: bases.targetBases,
      baseBlocks: bases.blocks,
      uniqueExperiences: experiences.uniqueExperiences,
      targetExperiences: experiences.target,
      fillerDays: experiences.fillerDays,
      availableExperienceEvidence: experiences.availableEvidence,
      corridorRepetitionRatio: repetition.repetitionRatio,
      backtrackingRatio: repetition.backtrackingRatio,
      reversedTravelEdges: repetition.reversedTravelEdges,
      travelEdges: repetition.travelEdges,
      poiUniqueRatio: recommendations.poiUniqueRatio,
      evidenceRatio: recommendations.evidenceRatio,
      namedEvidenceCompleteness: recommendations.namedEvidenceCompleteness,
      namedAccommodationCoverage: recommendations.namedAccommodationCoverage,
      accommodationCoverage: recommendations.accommodationCoverage,
      recommendationCoverage: complete.recommendationCoverage,
      destinationDays: destinationStay.destinationDays,
      accessDays: destinationStay.accessDays,
      explicitTransitDays: destinationStay.explicitTransitDays,
      destinationStayShare: destinationStay.destinationShare,
      excessiveAccessBurden: destinationStay.excessiveAccessBurden,
      routeEvidenceRatio: routeEvidenceMetricsResult.ratio,
      estimatedGeometryRatio: routeEvidenceMetricsResult.estimatedCoverage,
      allGeometryEstimated: routeEvidenceMetricsResult.allEstimated,
      vehicleEvidence,
      weakMicroLoop,
      weakGeographicCoverage,
      weakNamedEvidence,
      severeBacktracking,
      achievedRouteSpanKm: Math.round(geographic.achievedSpanKm),
      targetRouteSpanKm: Math.round(geographic.targetSpanKm),
      continuityBreaks,
      budgetRatio,
      readinessScore: readiness?.score ?? null
    },
    disclaimer: 'Planning-quality indicator op basis van transparante, deterministische structuur- en evidencecontroles; geen wetenschappelijk gevalideerde score.'
  };
}
