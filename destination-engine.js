import { clamp, roundScore } from './config.js';
import { buildBudget } from './budget-engine.js';
import { buildItinerary } from './itinerary-engine.js';
import { calculateRouteMetrics, haversineKm } from './route-engine.js';
import { calculateTripQuality } from './trip-quality-engine.js';
import { estimateLegTiming, transportId } from './vehicle-intelligence.js';
import { STRETCH_LIMITS, closestAdjustments, evaluateDestinationConstraints, evaluatePlanConstraints } from './constraint-engine.js';

const tagScore = (destination, tag, matched = 90, unmatched = 45) => destination.tags?.includes(tag) ? matched : unmatched;

function preferenceScore(trip, destination) {
  if (!trip.preferences.length) return { score: 50, matches: [] };
  const possible = trip.preferences.reduce((sum, id) => sum + (trip.preferenceWeights[id] || 2), 0);
  const matches = trip.preferences.filter(id => destination.tags?.includes(id));
  const matched = matches.reduce((sum, id) => sum + (trip.preferenceWeights[id] || 2), 0);
  return { score: roundScore(25 + 75 * matched / Math.max(1, possible)), matches };
}

function budgetScore(total, budget) {
  const ratio = total / Math.max(1, budget);
  if (ratio <= .9) return 100;
  return roundScore(100 - (ratio - .9) * 150);
}

function destinationIntentScore(trip, destination) {
  const query = String(trip.destinationQuery || '').trim().toLocaleLowerCase('nl-NL');
  if (!query || ['verras me', 'overal', 'wereldwijd'].includes(query)) return 0;
  const words = query.split(/\s+/).filter(word => word.length > 2);
  const haystack = [destination.name, destination.country, destination.summary, ...(destination.tags || [])].join(' ').toLocaleLowerCase('nl-NL');
  const matches = words.filter(word => haystack.includes(word)).length;
  return matches ? Math.min(30, 18 + matches * 6) : -12;
}

const normalizedIdentity = value => String(value || '').trim().toLocaleLowerCase('nl-NL');
const coordinateIdentity = point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon))
  ? `${Math.floor(Number(point.lat) / 4)}:${Math.floor(Number(point.lon) / 4)}`
  : '';

function planStructure(trip, destination, plan) {
  const origin = normalizedIdentity(trip.origin);
  const bases = [...new Set((plan.days || [])
    .map(day => normalizedIdentity(day.overnight))
    .filter(name => name && name !== origin))];
  const graphRoute = plan.routeGraph?.route || [];
  const gateway = normalizedIdentity(graphRoute.find(node => node.gateway)?.baseName
    || graphRoute[0]?.baseName
    || plan.days?.find(day => day.kind === 'outward')?.to
    || destination.bases?.[0]?.name);
  const highlights = [...new Set([
    ...(plan.routeGraph?.selected || []).map(item => normalizedIdentity(item.id || item.name)),
    ...(plan.days || []).filter(day => day.kind === 'stay').map(day => normalizedIdentity(day.primaryPlan))
  ].filter(Boolean))];
  const corridors = [...new Set((plan.days || [])
    .filter(day => ['outward', 'transfer', 'return'].includes(day.kind))
    .map(day => {
      const endpoints = [normalizedIdentity(day.from), normalizedIdentity(day.to)].sort();
      return endpoints[0] && endpoints[1] ? `${endpoints[0]}>${endpoints[1]}` : '';
    }).filter(Boolean))];
  const points = destination.bases?.filter(point => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))) || [];
  const centroid = points.length ? {
    lat: points.reduce((sum, point) => sum + Number(point.lat), 0) / points.length,
    lon: points.reduce((sum, point) => sum + Number(point.lon), 0) / points.length
  } : destination.point || destination.center || destination.bases?.[0];
  const providerRegion = destination.regionId || destination.clusterId || destination.boundary?.providerId || destination.destinationBoundary?.providerId;
  const macroRegion = normalizedIdentity(providerRegion) || `${normalizedIdentity(destination.country)}:${coordinateIdentity(centroid)}`;
  return {
    macroRegion,
    country: normalizedIdentity(destination.country),
    gateway,
    bases,
    highlights,
    corridors,
    topology: trip.routeTopology,
    routeDays: (plan.days || []).filter(day => ['outward', 'transfer', 'return'].includes(day.kind)).length
  };
}

function planQualityViolation(quality) {
  const detail = quality.gate.reasons.join(' ');
  return {
    key: 'planQuality',
    label: 'Planstructuur',
    actual: quality.overall,
    limit: 65,
    detail: detail || 'Het canonieke dagplan haalt de minimale structuur- en evidencekwaliteit niet.',
    adjustment: quality.recommendations[0]?.text || 'Ontdek sterkere routeankers of kies een kortere, geografisch samenhangende regio.',
    stretchable: false,
    severity: Math.max(.1, (65 - quality.overall) / 65)
  };
}

function applyProposalQualityGate(trip, plan, quality, structure) {
  const selectedHighlights = plan.routeGraph?.selected?.length
    ?? new Set((plan.days || []).filter(day => day.kind === 'stay').map(day => normalizedIdentity(day.primaryPlan)).filter(Boolean)).size;
  const weakLongMicroLoop = trip.days >= 10
    && structure.bases.length <= 1
    && selectedHighlights <= 1
    && (quality.dimensions.corridorRepetition < 45 || quality.dimensions.nightAllocation < 55);
  if (!weakLongMicroLoop) return quality;
  const reason = 'De ontdekte route blijft voor deze lange reis vrijwel volledig op één basis, één highlight en dezelfde corridor.';
  quality.evidence = { ...quality.evidence, weakMicroLoop: true, proposalWeakMicroLoop: true };
  quality.gate = { passed: false, reasons: [...new Set([...(quality.gate?.reasons || []), reason])] };
  quality.passes = false;
  quality.overall = Math.min(54, quality.overall);
  quality.rawOverall = Math.min(54, quality.rawOverall);
  if (!quality.deductions.includes(reason)) quality.deductions.unshift(reason);
  return quality;
}

function combineConstraintStatuses(trip, destinationStatus, planStatus) {
  const uniqueIssues = issues => issues.filter((item, index, all) => all.findIndex(candidate =>
    candidate.key === item.key && candidate.detail === item.detail) === index);
  const violations = uniqueIssues([...(destinationStatus.violations || []), ...(planStatus.violations || [])]);
  const softConstraints = uniqueIssues([...(destinationStatus.softConstraints || []), ...(planStatus.softConstraints || [])]);
  const rejected = destinationStatus.category === 'rejected' || planStatus.category === 'rejected';
  const stretch = !rejected && violations.length === 1 && violations[0].stretchable && trip.allowStretch !== false;
  const exact = !rejected && violations.length === 0;
  const category = exact ? 'exact' : stretch ? 'stretch' : 'rejected';
  return {
    ...destinationStatus,
    ...planStatus,
    category,
    exact,
    stretch,
    feasible: exact,
    selectable: exact || stretch,
    violations,
    softConstraints,
    stretchPenalty: violations.reduce((sum, item) => sum + Number(item.severity || 0), 0),
    summary: exact
      ? softConstraints.length ? `Harde voorwaarden gehaald; ${softConstraints.length} zachte voorkeur vraagt aandacht.` : 'Alle harde reisvoorwaarden en de route-evidence zijn in orde.'
      : violations.map(item => item.detail).join(' ')
  };
}

export function scoreDestination(trip, destination) {
  const month = new Date(`${trip.startDate}T12:00:00`).getMonth() + 1;
  const route = calculateRouteMetrics(trip, destination);
  const relaxedRoute = route.requiredLegs * 2 + 1 > trip.days
    ? calculateRouteMetrics({ ...trip, maxDrive: trip.maxDrive + STRETCH_LIMITS.maxDriveHours }, destination)
    : route;
  const budget = buildBudget(trip, destination);
  const preference = preferenceScore(trip, destination);
  const season = destination.season?.length ? (destination.season.includes(month) ? 90 : 40) : 50;
  const vehicle = transportId(trip.transport);
  const transport = vehicle === 'motorcycle'
    ? destination.motorcycle * 10
    : ['motorhome', 'caravan'].includes(vehicle) ? destination.camper * 10 : destination.family * 10;
  const constraintStatus = evaluateDestinationConstraints(trip, { route, relaxedRoute, budget });
  if (trip.routeTopology === 'open-jaw' && destination.bases?.length > 1) {
    const from = destination.bases[0]; const to = destination.bases.at(-1);
    const distanceKm = Math.round((haversineKm(from, to) || 0) * 1.25);
    const speed = { car: 52, motorcycle: 50, motorhome: 46, caravan: 43 }[vehicle] || 50;
    const timing = estimateLegTiming(trip, { distanceKm, roadHours: distanceKm / speed, arrival: true });
    if (timing.elapsedHours > trip.maxDrive + .05) {
      constraintStatus.violations.push({ key: 'topology', label: 'Open-jaw transfer', actual: timing.elapsedHours, limit: trip.maxDrive, detail: `De transfer tussen eerste en laatste basis duurt indicatief ${timing.elapsedHours.toFixed(1)} uur en overschrijdt je daglimiet.`, adjustment: `Kies een rondreis, verhoog de daglimiet of selecteer een bestemming met dichter bij elkaar gelegen open-jaw bases.`, stretchable: false, severity: (timing.elapsedHours - trip.maxDrive) / Math.max(1, trip.maxDrive) });
      Object.assign(constraintStatus, { category: 'rejected', exact: false, stretch: false, selectable: false, summary: constraintStatus.violations.map(item => item.detail).join(' ') });
    }
  }
  const minimumDays = constraintStatus.minimumDays;
  const driving = roundScore(100 - Math.max(0, route.requiredLegs - 1) * 15 - Math.max(0, minimumDays - trip.days) * 15);
  const budgetFit = budgetScore(budget.total, trip.budget);
  const dimensions = {
    budget: budgetFit, driving, season, transport, family: destination.family * 10,
    motorcycle: destination.motorcycle * 10, camper: destination.camper * 10,
    scenery: roundScore((tagScore(destination, 'natuur') + tagScore(destination, 'bergen') + tagScore(destination, 'kust')) / 3),
    walking: tagScore(destination, 'wandelen'), swimming: tagScore(destination, 'zwemmen'),
    food: tagScore(destination, 'eten', 90, 55), culture: tagScore(destination, 'cultuur', 90, 50),
    crowds: destination.crowds * 10
  };
  const intentScore = destinationIntentScore(trip, destination);
  const score = roundScore(preference.score * .36 + budgetFit * .2 + season * .14 + transport * .16 + driving * .14 + intentScore);
  const compromises = [];
  compromises.push(...constraintStatus.violations.map(item => item.detail));
  if (destination.season?.length && season < 60) compromises.push('De reis valt buiten de voorkeursmaanden die uit providerbewijs zijn afgeleid.');
  if (!destination.season?.length) compromises.push('Seizoensgeschiktheid is onbekend en telt als neutrale prior met lager vertrouwen.');
  if (!route.originKnown) compromises.push('De vertrekplaats kon niet worden gegeocodeerd; de routebelasting heeft lager vertrouwen.');
  const confidence = destination.catalogue
    ? destination.evidenceConfidence?.label || destination.provider?.confidence || destination.confidence || 'limited'
    : route.originKnown ? (destination.routeStops?.length >= route.requiredLegs - 1 ? 'redelijk' : 'beperkt') : 'beperkt';
  const matchLabels = preference.matches.length ? preference.matches.slice(0, 3).join(', ') : 'algemene reiswensen';
  const scoredDestination = {
    ...destination, score, dimensions, estimate: budget.total, budget, route, matches: preference.matches, intentMatch: intentScore > 0,
    minimumDays, feasible: constraintStatus.exact, category: constraintStatus.category,
    constraintStatus, confidence, compromises,
    explanation: constraintStatus.exact
      ? `Past bij ${matchLabels} en blijft binnen je harde voorwaarden voor budget, tijd en wissels.`
      : `Past inhoudelijk bij ${matchLabels}, maar staat alleen als expliciet begrensd stretch-idee in de resultaten.`
  };
  const canonicalPlan = buildItinerary(trip, scoredDestination);
  const canonicalBudget = buildBudget(trip, scoredDestination, canonicalPlan);
  const planConstraintStatus = evaluatePlanConstraints(trip, canonicalPlan, canonicalBudget, { allowStretch: trip.allowStretch !== false });
  const combinedConstraintStatus = combineConstraintStatuses(trip, constraintStatus, planConstraintStatus);
  canonicalPlan.constraintStatus = combinedConstraintStatus;
  canonicalPlan.feasible = combinedConstraintStatus.exact;
  canonicalPlan.proposalCategory = combinedConstraintStatus.category;
  const structure = planStructure(trip, scoredDestination, canonicalPlan);
  const quality = applyProposalQualityGate(trip, canonicalPlan, calculateTripQuality(trip, scoredDestination, canonicalPlan, canonicalBudget), structure);
  const planSelectable = combinedConstraintStatus.selectable && quality.passes;
  scoredDestination.destinationConstraintStatus = constraintStatus;
  scoredDestination.planConstraintStatus = planConstraintStatus;
  scoredDestination.routeFeasibility = canonicalPlan.routeFeasibility || null;
  if (canonicalPlan.routeFeasibility?.status === 'incomplete') scoredDestination.confidence = 'low';
  else if (canonicalPlan.routeFeasibility?.status === 'estimated' && ['reasonable', 'redelijk'].includes(scoredDestination.confidence)) scoredDestination.confidence = 'limited';
  scoredDestination.constraintStatus = combinedConstraintStatus;
  scoredDestination.category = combinedConstraintStatus.category;
  scoredDestination.feasible = combinedConstraintStatus.exact;
  scoredDestination.compromises = [...new Set([...scoredDestination.compromises, ...combinedConstraintStatus.violations.map(item => item.detail)])];
  if (combinedConstraintStatus.stretch) {
    scoredDestination.explanation = `Past inhoudelijk bij ${matchLabels}, maar de route bevat een expliciet begrensde onzekerheid en wordt daarom alleen als stretch-idee getoond.`;
  }
  if (!planSelectable) {
    const qualityIssue = quality.passes ? null : planQualityViolation(quality);
    const issues = [...combinedConstraintStatus.violations, ...(qualityIssue ? [qualityIssue] : [])]
      .filter((item, index, all) => all.findIndex(candidate => candidate.key === item.key && candidate.detail === item.detail) === index);
    scoredDestination.constraintStatus = {
      ...combinedConstraintStatus,
      category: 'rejected', exact: false, stretch: false, selectable: false,
      violations: issues,
      summary: issues.map(item => item.detail).join(' ')
    };
    scoredDestination.category = 'rejected';
    scoredDestination.feasible = false;
    scoredDestination.rejectionType = qualityIssue ? 'plan-quality' : 'canonical-plan-constraint';
    scoredDestination.compromises = [...scoredDestination.compromises, ...issues.map(item => item.detail)];
    scoredDestination.explanation = qualityIssue
      ? `De bestemming is ontdekt, maar het gegenereerde dagplan is niet selecteerbaar: ${qualityIssue.detail}`
      : `De bestemming is ontdekt, maar het canonieke dagplan schendt een harde reisvoorwaarde.`;
  }
  scoredDestination.planQuality = quality;
  scoredDestination.planQualityStatus = {
    selectable: planSelectable,
    category: planSelectable ? (combinedConstraintStatus.stretch ? 'stretch' : 'accepted') : 'rejected',
    reasons: quality.gate.reasons,
    score: quality.overall
  };
  scoredDestination.planStructure = structure;
  scoredDestination.previewBudget = canonicalBudget;
  return scoredDestination;
}

const byMatch = (a, b) => Number(b.intentMatch) - Number(a.intentMatch) || b.score - a.score || a.estimate - b.estimate || a.name.localeCompare(b.name, 'nl');

export function rankDestinationGroups(trip, destinationList) {
  const scored = destinationList.map(destination => scoreDestination(trip, destination));
  const exact = scored.filter(item => item.category === 'exact').sort(byMatch);
  const stretched = scored.filter(item => item.category === 'stretch')
    .sort((a, b) => a.constraintStatus.stretchPenalty - b.constraintStatus.stretchPenalty || byMatch(a, b))
    .slice(0, STRETCH_LIMITS.visibleProposals);
  const rejected = scored.filter(item => item.category === 'rejected')
    .sort((a, b) => a.constraintStatus.violations.length - b.constraintStatus.violations.length || byMatch(a, b));
  return {
    exact,
    stretched,
    rejected,
    visible: [...exact, ...stretched],
    closestAdjustments: closestAdjustments(rejected)
  };
}

export function rankDestinations(trip, destinationList) {
  return rankDestinationGroups(trip, destinationList).visible;
}

export const scoreInRange = score => clamp(score) === score;
