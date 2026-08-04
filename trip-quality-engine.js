import { clamp } from './config.js';
import { buildTravelReadiness } from './travel-readiness.js';

const weightedAverage = (dimensions, weights) => Object.entries(weights)
  .reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0)
  / Object.values(weights).reduce((sum, weight) => sum + weight, 0);
const round = value => Math.round(clamp(value));

export function calculateTripQuality(trip, destination, plan, budget) {
  plan.readiness ||= buildTravelReadiness(trip, destination, plan);
  const days = plan.days || [];
  const travelDays = days.filter(day => ['outward', 'return', 'transfer'].includes(day.kind)).length;
  const stayDays = days.length - travelDays;
  const excessive = days.filter(day => day.exceedsDailyLimit || Number(day.elapsedHours ?? day.driveHours ?? 0) > trip.maxDrive + .05).length;
  const maxElapsed = Math.max(0, ...days.map(day => Number(day.elapsedHours ?? day.driveHours ?? 0)));
  const flexDays = days.filter(day => day.kind === 'flex').length;
  const activityTypes = new Set(days.map(day => day.activityType).filter(type => type && type !== 'rust'));
  const budgetRatio = budget.total / Math.max(1, trip.budget);
  const recommendationCoverage = days.filter(day => day.recommendations?.length).length / Math.max(1, days.length);
  const namedPlaces = (plan.recommendations || []).filter(item => item.live || item.verified).length;
  const rainCoverage = days.filter(day => !['outward', 'return'].includes(day.kind) && day.rainAlternative).length / Math.max(1, days.filter(day => !['outward', 'return'].includes(day.kind)).length);
  const localDistance = days.filter(day => ['stay', 'flex', 'transfer'].includes(day.kind)).reduce((sum, day) => sum + Number(day.distanceKm || 0), 0);
  const changeExcess = Math.max(0, plan.accommodationChanges - trip.maxChanges);
  const driveUtilisation = maxElapsed / Math.max(1, trip.maxDrive);
  const routeOverlap = Number(plan.routeMetrics?.exploration?.overlap ?? 1);
  const readiness = plan.readiness;
  const livePoiRatio = namedPlaces / Math.max(1, (plan.recommendations || []).length);
  const rawDimensions = {
    driving: clamp(96 - excessive * 34 - Math.max(0, driveUtilisation - .88) * 55 - Math.max(0, travelDays / Math.max(1, trip.days) - .45) * 75 - Math.max(0, localDistance / Math.max(1, trip.days) - 45) * .18),
    budget: clamp(98 - Math.max(0, budgetRatio - .82) * 135 - (budget.conservativeTotal > trip.budget ? 6 : 0)),
    relaxation: clamp(76 + Math.min(14, flexDays * 8) - changeExcess * 22 - Math.max(0, travelDays - stayDays) * 4 + (plan.optimizationEvidence?.restBuffers || 0) * 4),
    family: clamp(trip.children ? (destination.family || 5) * 9.5 - excessive * 18 + flexDays * 3 : 80),
    adventure: clamp((destination.dimensions?.scenery ?? 60) * .55 + (destination.dimensions?.walking ?? 60) * .25 + (destination.dimensions?.swimming ?? 60) * .2),
    weather: clamp((destination.weather || 5) * 8 + rainCoverage * 20 + (plan.optimizationEvidence?.weatherChecked ? 6 : 0)),
    variety: clamp(42 + activityTypes.size * 14 + Math.min(10, flexDays * 3)),
    crowds: clamp((destination.crowds || 5) * 10),
    realism: clamp((days.length === trip.days ? 28 : 0) + (plan.feasible ? 27 : 5) + (plan.routeMetrics?.originKnown ? 13 : 5) + recommendationCoverage * 12 + (plan.routing?.live ? 12 : 6) + Math.min(5, namedPlaces)),
    completeness: clamp((days.length === trip.days ? 45 : 5) + recommendationCoverage * 30 + rainCoverage * 15 + (plan.accessSegments?.length || !trip.travelMode || trip.travelMode === 'direct' ? 10 : 0)),
    routeEfficiency: clamp(92 - excessive * 30 - Math.max(0, localDistance / Math.max(1, trip.days) - 55) * .3),
    routeExploration: clamp(100 - routeOverlap * 80),
    vehicleSuitability: clamp((destination.dimensions?.transport || 50) * .75 + (plan.recommendations || []).every(item => item.vehicleFit?.includes(trip.transport) || trip.travelMode !== 'direct') * 25),
    safetyReadiness: clamp(readiness?.score ?? 45),
    poiQuality: clamp(35 + recommendationCoverage * 25 + livePoiRatio * 40),
    bookingReadiness: clamp(plan.accessSegments?.some(segment => segment.bookable === false) ? 38 : plan.placeData?.live ? 68 : 45),
    documentationReadiness: clamp(readiness ? 100 - readiness.blockers * 15 : 35)
  };
  const weights = { driving: 1.2, budget: 1.05, relaxation: .85, family: trip.children ? .8 : .3, adventure: .55, weather: .7, variety: .55, crowds: .35, realism: 1.2, completeness: 1, routeEfficiency: .8, routeExploration: .55, vehicleSuitability: 1, safetyReadiness: 1.15, poiQuality: .8, bookingReadiness: .65, documentationReadiness: .8 };
  let rawOverall = weightedAverage(rawDimensions, weights);
  if (plan.constraintStatus?.category === 'rejected') rawOverall = Math.min(55, rawOverall);
  else if (plan.constraintStatus?.category === 'stretch') rawOverall = Math.min(70, rawOverall);
  const dimensions = Object.fromEntries(Object.entries(rawDimensions).map(([key, value]) => [key, round(value)]));
  const deductions = [];
  if (excessive) deductions.push(`${excessive} rijdag${excessive === 1 ? '' : 'en'} boven de ingestelde limiet.`);
  if (budget.total > trip.budget) deductions.push(`Indicatieve begroting €${budget.total - trip.budget} boven budget.`);
  if (budget.conservativeTotal > trip.budget && budget.total <= trip.budget) deductions.push('De voorzichtige bovengrens ligt boven budget; houd extra reserve aan.');
  if (changeExcess) deductions.push('Meer accommodatiewissels dan gewenst.');
  if (!plan.routeMetrics?.originKnown) deductions.push('Vertrekcoördinaten ontbreken in de offline catalogus.');
  if (!plan.routing?.live) deductions.push('De route gebruikt nog een offline corridorraming in plaats van live wegdata.');
  if (!flexDays && stayDays >= 3) deductions.push('Geen expliciete flexibele rustdag.');
  if (rainCoverage < 1) deductions.push('Niet iedere verblijfsdag heeft een concreet regenalternatief.');
  const recommendations = [];
  if (excessive) recommendations.push({ key: 'driving', text: `Voeg minimaal ${Math.max(1, plan.minimumDays - trip.days)} reisdag(en) toe of kies een dichterbij gelegen bestemming.`, impact: Math.min(30, excessive * 10) });
  if (!flexDays && stayDays >= 3) recommendations.push({ key: 'relaxation', text: 'Maak één verblijfsdag flexibel en plan daar geen verplichte hoofdactiviteit.', impact: 8 });
  if (changeExcess) recommendations.push({ key: 'changes', text: 'Gebruik één bestemmingbasis en maak andere plaatsen dagtrips.', impact: 12 });
  if (activityTypes.size < 3) recommendations.push({ key: 'variety', text: 'Wissel natuur, cultuur, water en rust bewuster af.', impact: 10 });
  if (budget.total > trip.budget || budget.conservativeTotal > trip.budget) recommendations.push({ key: 'budget', text: 'Kies aantoonbaar goedkopere verblijven en minder betaalde activiteiten; verhoog het budget niet automatisch.', impact: 12 });
  if (rainCoverage < 1) recommendations.push({ key: 'weather', text: 'Koppel iedere buitenactiviteit aan een specifieke binnenoptie in dezelfde regio.', impact: 10 });
  if (!recommendations.length) recommendations.push({ key: 'general', text: 'Het plan is evenwichtig; controleer vlak voor vertrek live omstandigheden en prijzen.', impact: 0 });
  return {
    overall: round(rawOverall), rawOverall, dimensions, rawDimensions, deductions,
    recommendations: recommendations.slice(0, 5),
    evidence: { excessiveDays: excessive, maxElapsed, flexDays, activityTypes: activityTypes.size, rainCoverage, localDistanceKm: Math.round(localDistance), budgetRatio },
    disclaimer: 'Planning-quality indicator op basis van transparante, deterministische vuistregels; geen wetenschappelijk gevalideerde score.'
  };
}
