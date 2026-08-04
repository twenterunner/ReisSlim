import { clamp, roundScore } from './config.js';

const weightedAverage = (dimensions, weights) => Object.entries(weights)
  .reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0)
  / Object.values(weights).reduce((sum, weight) => sum + weight, 0);

export function calculateTripQuality(trip, destination, plan, budget) {
  const travelDays = plan.days.filter(day => ['outward', 'return', 'transfer'].includes(day.kind)).length;
  const stayDays = plan.days.length - travelDays;
  const excessive = plan.days.filter(day => day.exceedsDailyLimit).length;
  const flexible = plan.days.some(day => day.kind === 'flex');
  const variety = new Set(plan.days.map(day => day.activityType).filter(Boolean)).size;
  const budgetRatio = budget.total / Math.max(1, trip.budget);
  const recommendationCoverage = plan.days.filter(day => day.recommendations?.length).length / Math.max(1, plan.days.length);
  const dimensions = {
    driving: roundScore(100 - excessive * 30 - Math.max(0, travelDays / trip.days - .45) * 100),
    budget: roundScore(100 - Math.max(0, budgetRatio - .9) * 160),
    relaxation: roundScore(90 - Math.max(0, plan.accommodationChanges - trip.maxChanges) * 15 + (flexible ? 10 : 0)),
    family: roundScore(trip.children ? destination.family * 10 - excessive * 15 : 80),
    adventure: roundScore((destination.dimensions?.scenery ?? 60) * .55 + (destination.dimensions?.walking ?? 60) * .25 + (destination.dimensions?.swimming ?? 60) * .2),
    weather: roundScore(destination.weather * 10 - plan.days.filter(day => !day.rainAlternative).length * 10),
    variety: roundScore(45 + variety * 15),
    crowds: roundScore(destination.crowds * 10),
    realism: roundScore((plan.days.length === trip.days ? 30 : 0) + (plan.feasible ? 35 : 0) + (plan.routeMetrics.originKnown ? 15 : 5) + recommendationCoverage * 10 + (plan.routing?.live ? 10 : 5))
  };
  const weights = { driving: 1.3, budget: 1.1, relaxation: 1, family: trip.children ? 1 : .4, adventure: .8, weather: .8, variety: .7, crowds: .5, realism: 1.4 };
  const overall = roundScore(weightedAverage(dimensions, weights));
  const deductions = [];
  if (excessive) deductions.push(`${excessive} rijdag${excessive === 1 ? '' : 'en'} boven de ingestelde limiet.`);
  if (budget.total > trip.budget) deductions.push(`Indicatieve begroting €${budget.total - trip.budget} boven budget.`);
  if (plan.accommodationChanges > trip.maxChanges) deductions.push('Meer accommodatiewissels dan gewenst.');
  if (!plan.routeMetrics.originKnown) deductions.push('Vertrekcoördinaten ontbreken in de offline catalogus.');
  if (!plan.routing?.live) deductions.push('De route gebruikt nog een offline corridorraming in plaats van live wegdata.');
  if (!flexible && stayDays >= 3) deductions.push('Geen expliciete flexibele rustdag.');
  const recommendations = [];
  if (excessive) recommendations.push({ key: 'driving', text: `Voeg minimaal ${Math.max(1, plan.minimumDays - trip.days)} reisdag(en) toe of kies een dichterbij gelegen bestemming.`, impact: Math.min(30, excessive * 10) });
  if (!flexible && stayDays >= 3) recommendations.push({ key: 'relaxation', text: 'Maak één verblijfsdag flexibel en plan daar geen verplichte hoofdactiviteit.', impact: 5 });
  if (plan.accommodationChanges > trip.maxChanges) recommendations.push({ key: 'changes', text: 'Gebruik één bestemmingbasis en maak andere plaatsen dagtrips.', impact: 10 });
  if (variety < 3) recommendations.push({ key: 'variety', text: 'Wissel natuur, cultuur, water en rust bewuster af.', impact: 5 });
  if (budget.total > trip.budget) recommendations.push({ key: 'budget', text: 'Verlaag accommodatiecomfort of restaurantaandeel; verhoog het budget niet automatisch.', impact: 10 });
  if (!recommendations.length) recommendations.push({ key: 'general', text: 'Het plan is evenwichtig; controleer vlak voor vertrek live omstandigheden en prijzen.', impact: 0 });
  return {
    overall: clamp(overall), dimensions, deductions,
    recommendations: recommendations.slice(0, 5),
    disclaimer: 'Planning-quality indicator op basis van transparante vuistregels; geen wetenschappelijk gevalideerde score.'
  };
}
