import { clamp, validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { buildTravelReadiness } from './travel-readiness.js';
import { transportId, vehicleProfile } from './vehicle-intelligence.js';

const TRAVEL_KINDS = new Set(['outward', 'return', 'transfer']);
const GENERIC_SOURCE = /offline|categorievoorstel|reisslim|estimate|raming/i;
const GENERIC_NAME = /^(hotel|appartement|camping|camperplaats|caravancamping|diner|restaurant|activiteit|motorvriendelijk verblijf|comfortabele parkeer)/i;

const round = value => Math.round(clamp(Number(value) || 0));
const ratio = (numerator, denominator, empty = 0) => denominator > 0 ? clamp(numerator / denominator, 0, 1) : empty;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const normalize = value => String(value || '').trim().toLocaleLowerCase('nl-NL');
const unique = values => new Set(values.filter(Boolean)).size;

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
  return Boolean(name && name.length > 3 && !GENERIC_NAME.test(name));
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
    .filter(day => day.kind !== 'return' && day.overnightRole !== 'transit' && day.toPoint?.role !== 'transit' && normalize(day.overnight) && normalize(day.overnight) !== origin)
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
  const activityDays = days.filter(day => day.kind === 'stay');
  const primary = activityDays.map(day => normalize(day.primaryPlan)).filter(Boolean);
  const activityRecommendations = (plan.recommendations || [])
    .filter(item => ['activity', 'poi', 'attraction'].includes(item.type)
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
  const corridors = days.map(corridorKey).filter(Boolean);
  const corridorCounts = new Map();
  corridors.forEach(key => corridorCounts.set(key, (corridorCounts.get(key) || 0) + 1));
  const repeatedCorridors = [...corridorCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const transferEdges = days.filter(day => day.kind === 'transfer').map(directedEdge).filter(Boolean);
  const seen = new Set();
  let reversals = 0;
  for (const edge of transferEdges) {
    const [from, to] = edge.split('>');
    if (seen.has(`${to}>${from}`)) reversals += 1;
    seen.add(edge);
  }
  return {
    corridors: corridors.length,
    uniqueCorridors: corridorCounts.size,
    repetitionRatio: ratio(repeatedCorridors, corridors.length),
    transferEdges: transferEdges.length,
    backtrackingRatio: ratio(reversals, Math.max(1, transferEdges.length - 1))
  };
}

function geographicCoverageMetrics(trip, destination, days) {
  const origin = normalize(trip.origin);
  const points = [];
  for (const day of days) {
    if (normalize(day.overnight) === origin || day.toPoint?.role === 'transit') continue;
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

function recommendationMetrics(trip, plan, baseMetrics) {
  const all = plan.recommendations || [];
  const relevantPois = all.filter(item => ['activity', 'poi', 'attraction', 'restaurant'].includes(item.type));
  const identities = relevantPois.map(item => `${normalize(item.type)}:${normalize(item.name)}`).filter(value => !value.endsWith(':'));
  const accommodations = all.filter(item => item.type === 'accommodation');
  const coveredBases = new Set();
  for (const day of plan.days || []) {
    if ((day.recommendations || []).some(item => item.type === 'accommodation')) coveredBases.add(normalize(day.overnight));
  }
  const vehicle = transportId(trip.transport);
  const compatible = all.filter(item => item.vehicleProfileId === vehicle || item.vehicleFit?.includes(vehicle)).length;
  return {
    all,
    relevantPois,
    poiUniqueRatio: ratio(unique(identities), identities.length, 1),
    namedPoiRatio: ratio(relevantPois.filter(namedRecommendation).length, relevantPois.length),
    evidenceRatio: ratio(all.reduce((sum, item) => sum + recommendationEvidence(item), 0), all.length),
    accommodations,
    accommodationCoverage: ratio([...baseMetrics.counts.keys()].filter(base => coveredBases.has(base)).length, baseMetrics.uniqueBases, baseMetrics.uniqueBases ? 0 : 1),
    uniqueAccommodationRatio: ratio(unique(accommodations.map(item => normalize(item.name))), accommodations.length, 1),
    namedAccommodationRatio: ratio(accommodations.filter(namedRecommendation).length, accommodations.length),
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
  if (context.fillerDays > 0) reasons.push(`${context.fillerDays} verblijfsdag(en) hebben geen onderscheidend, evidence-backed doel.`);
  return { passed: reasons.length === 0, reasons };
}

export const qualityDimensionLabels = Object.freeze({
  coverage: 'Dekking',
  baseQuality: 'Kwaliteit uitvalsbases',
  nightAllocation: 'Nachtverdeling',
  coherence: 'Routesamenhang',
  backtracking: 'Beperking terugrijden',
  corridorRepetition: 'Corridorvariatie',
  poiUniqueness: 'Unieke POI\'s',
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
  const recommendations = recommendationMetrics(trip, plan, bases);
  const complete = completenessMetrics(trip, plan, days);
  const travelDays = days.filter(day => TRAVEL_KINDS.has(day.kind));
  const excessive = days.filter(day => day.exceedsDailyLimit || Number(day.elapsedHours ?? day.driveHours ?? 0) > Number(trip.maxDrive) + .05).length;
  const continuityBreaks = days.filter((day, index) => index > 0 && normalize(days[index - 1].to) !== normalize(day.from)).length;
  const locationBreaks = days.filter(day => !TRAVEL_KINDS.has(day.kind) && normalize(day.from) !== normalize(day.to)).length;
  const routedSegments = days.filter(day => (day.geometry || []).filter(validCoordinate).length > 1).length;
  const liveRouteSegments = days.filter(day => ['tomtom', 'openrouteservice', 'osrm'].includes(normalize(day.routeSource))).length;
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
  const routeCoverage = ratio(routedSegments, days.length);
  const travelGeometryCoverage = ratio(travelDays.filter(day => (day.geometry || []).filter(validCoordinate).length > 1).length, travelDays.length, 1);
  const routeEvidence = plan.routing?.live ? 1 : plan.routeGraph?.evidence?.length ? .65 : .35;
  const graphEvidenceItems = (plan.routeGraph?.graph || destination.highlights || []).filter(item => item.evidence || item.source || item.providerId).length;
  const graphEvidenceRatio = ratio(graphEvidenceItems, (plan.routeGraph?.graph || destination.highlights || []).length, .35);
  const supportsDimensions = vehicleProfile(trip).supportsDimensions;
  const dimensionsReady = !supportsDimensions || [trip.vehicleHeightM, trip.vehicleLengthM, trip.vehicleWeightKg].every(value => Number.isFinite(Number(value)) && Number(value) > 0);
  const budgetRatio = Number(budget.total || 0) / Math.max(1, Number(trip.budget || 0));

  const rawDimensions = {
    coverage: clamp(8 + baseCoverage * 35 + experiences.coverageRatio * 35 + geographic.ratio * 22),
    baseQuality: clamp(18 + coordinateCoverage * 32 + namedBaseRatio * 22 + recommendations.accommodationCoverage * 28),
    nightAllocation: clamp(100 - singleNightPenalty - dominancePenalty - hardChangeExcess * 18 + bases.multiNightShare * 6),
    coherence: clamp(100 - continuityBreaks * 28 - locationBreaks * 18 - excessive * 34 - (complete.startsAtOrigin ? 0 : 28) - (complete.returnsToOrigin ? 0 : 28)),
    backtracking: clamp(100 - repetition.backtrackingRatio * 88),
    corridorRepetition: clamp(100 - repetition.repetitionRatio * 92),
    poiUniqueness: clamp(recommendations.poiUniqueRatio * 58 + recommendations.namedPoiRatio * 24 + (1 - experiences.repeatedExperienceRatio) * 18),
    evidenceQuality: clamp(recommendations.evidenceRatio * 48 + graphEvidenceRatio * 27 + routeEvidence * 25),
    accommodationQuality: clamp(recommendations.accommodationCoverage * 46 + recommendations.uniqueAccommodationRatio * 18 + recommendations.namedAccommodationRatio * 20 + recommendations.vehicleCompatibility * 16),
    touringRoadQuality: clamp(travelGeometryCoverage * 38 + routeCoverage * 20 + exploration * .34 + (liveRouteSegments ? 8 : 0)),
    vehicleSuitability: clamp(recommendations.vehicleCompatibility * 72 + (dimensionsReady ? 18 : 0) + (readiness ? 10 : 4)),
    completeness: clamp(complete.dayCountRatio * 28 + complete.dateRatio * 22 + complete.fieldRatio * 22 + complete.recommendationCoverage * 14 + (complete.startsAtOrigin ? 7 : 0) + (complete.returnsToOrigin ? 7 : 0)),
    uncertainty: clamp(recommendations.evidenceRatio * 36 + graphEvidenceRatio * 22 + routeEvidence * 24 + (plan.placeData?.live ? 10 : 3) + (plan.routing?.live ? 8 : 2))
  };
  const weights = {
    coverage: 1.25, baseQuality: .75, nightAllocation: .9, coherence: 1.35,
    backtracking: .7, corridorRepetition: .8, poiUniqueness: .9, evidenceQuality: 1.05,
    accommodationQuality: .9, touringRoadQuality: .9, vehicleSuitability: 1.1,
    completeness: 1.25, uncertainty: .9
  };
  const weightTotal = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let rawOverall = Object.entries(weights).reduce((sum, [key, weight]) => sum + rawDimensions[key] * weight, 0) / weightTotal;
  const constraintRejected = plan.constraintStatus?.category === 'rejected' || plan.feasible === false;
  if (constraintRejected) rawOverall = Math.min(55, rawOverall);
  else if (plan.constraintStatus?.category === 'stretch') rawOverall = Math.min(70, rawOverall);
  if (budgetRatio > 1 && trip.strictBudget !== false) rawOverall = Math.min(55, rawOverall);
  if (weakMicroLoop) rawOverall = Math.min(54, rawOverall);

  const dimensions = Object.fromEntries(Object.entries(rawDimensions).map(([key, value]) => [key, round(value)]));
  const gate = qualityGate(dimensions, { constraintRejected, weakMicroLoop, weakGeographicCoverage, geographic, fillerDays: experiences.fillerDays });
  if (!gate.passed) rawOverall = Math.min(rawOverall, 64);
  const deductions = [...gate.reasons];
  if (excessive) deductions.push(`${excessive} rijdag${excessive === 1 ? '' : 'en'} boven de ingestelde limiet.`);
  if (budgetRatio > 1) deductions.push(`Indicatieve begroting €${Math.round(budget.total - trip.budget)} boven budget.`);
  if (repetition.backtrackingRatio > .25) deductions.push('De route rijdt meerdere transfercorridors in tegengestelde richting terug.');
  if (repetition.repetitionRatio > .35) deductions.push('Dezelfde routecorridor komt op te veel dagen terug.');
  if (recommendations.evidenceRatio < .45) deductions.push('Veel plaatsen en verblijven hebben alleen generieke of zwakke evidence.');
  if (recommendations.accommodationCoverage < 1) deductions.push('Niet iedere overnachtingsbasis heeft een passende accommodatie-optie.');

  const improvementRecommendations = [];
  if (dimensions.coverage < 60) improvementRecommendations.push({ key: 'coverage', text: 'Voeg alleen haalbare, geografisch samenhangende ankers toe en verdeel de verblijfsnachten over meer dan één sterke basis.', impact: 16 });
  if (dimensions.nightAllocation < 60) improvementRecommendations.push({ key: 'nightAllocation', text: 'Verminder éénnachtstops en voorkom dat vrijwel de hele reis op één zwak onderbouwde basis blijft.', impact: 14 });
  if (dimensions.coherence < 70) improvementRecommendations.push({ key: 'coherence', text: 'Herbouw de dagvolgorde zodat iedere dag aansluit op de vorige en alle etappes binnen de daglimiet blijven.', impact: 18 });
  if (dimensions.corridorRepetition < 65 || dimensions.backtracking < 65) improvementRecommendations.push({ key: 'routeStructure', text: 'Verwijder een herhaalde heen-en-weer-corridor of kies een echte lus met een andere terugweg.', impact: 12 });
  if (dimensions.poiUniqueness < 65) improvementRecommendations.push({ key: 'poiUniqueness', text: 'Vervang herhaalde generieke activiteiten door unieke, routegebonden POI-evidence.', impact: 12 });
  if (dimensions.evidenceQuality < 60 || dimensions.uncertainty < 60) improvementRecommendations.push({ key: 'evidence', text: 'Verrijk de gekozen bases, wegen, POI’s en verblijven met bron, actualiteit en expliciete onzekerheid.', impact: 14 });
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
      poiUniqueRatio: recommendations.poiUniqueRatio,
      evidenceRatio: recommendations.evidenceRatio,
      accommodationCoverage: recommendations.accommodationCoverage,
      recommendationCoverage: complete.recommendationCoverage,
      weakMicroLoop,
      weakGeographicCoverage,
      achievedRouteSpanKm: Math.round(geographic.achievedSpanKm),
      targetRouteSpanKm: Math.round(geographic.targetSpanKm),
      continuityBreaks,
      budgetRatio,
      readinessScore: readiness?.score ?? null
    },
    disclaimer: 'Planning-quality indicator op basis van transparante, deterministische structuur- en evidencecontroles; geen wetenschappelijk gevalideerde score.'
  };
}
