import { clamp, roundScore } from './config.js';
import { buildBudget } from './budget-engine.js';
import { calculateRouteMetrics } from './route-engine.js';
import { transportId } from './vehicle-intelligence.js';
import { STRETCH_LIMITS, closestAdjustments, evaluateDestinationConstraints } from './constraint-engine.js';

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

export function scoreDestination(trip, destination) {
  const month = new Date(`${trip.startDate}T12:00:00`).getMonth() + 1;
  const route = calculateRouteMetrics(trip, destination);
  const relaxedRoute = route.requiredLegs * 2 + 1 > trip.days
    ? calculateRouteMetrics({ ...trip, maxDrive: trip.maxDrive + STRETCH_LIMITS.maxDriveHours }, destination)
    : route;
  const budget = buildBudget(trip, destination);
  const preference = preferenceScore(trip, destination);
  const season = destination.season?.includes(month) ? 90 : 40;
  const vehicle = transportId(trip.transport);
  const transport = vehicle === 'motorcycle'
    ? destination.motorcycle * 10
    : ['motorhome', 'caravan'].includes(vehicle) ? destination.camper * 10 : destination.family * 10;
  const constraintStatus = evaluateDestinationConstraints(trip, { route, relaxedRoute, budget });
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
  const score = roundScore(preference.score * .36 + budgetFit * .2 + season * .14 + transport * .16 + driving * .14);
  const compromises = [];
  compromises.push(...constraintStatus.violations.map(item => item.detail));
  if (season < 60) compromises.push('De reis valt buiten de voorkeursmaanden in de offline bestemmingdata.');
  if (!route.originKnown) compromises.push('De vertrekplaats is niet beschikbaar in de offline coördinatencatalogus.');
  const confidence = route.originKnown ? (destination.routeStops?.length >= route.requiredLegs - 1 ? 'redelijk' : 'beperkt') : 'beperkt';
  const matchLabels = preference.matches.length ? preference.matches.slice(0, 3).join(', ') : 'algemene reiswensen';
  return {
    ...destination, score, dimensions, estimate: budget.total, budget, route, matches: preference.matches,
    minimumDays, feasible: constraintStatus.exact, category: constraintStatus.category,
    constraintStatus, confidence, compromises,
    explanation: constraintStatus.exact
      ? `Past bij ${matchLabels} en blijft binnen je harde voorwaarden voor budget, tijd en wissels.`
      : `Past inhoudelijk bij ${matchLabels}, maar staat alleen als expliciet begrensd stretch-idee in de resultaten.`
  };
}

const byMatch = (a, b) => b.score - a.score || a.estimate - b.estimate || a.name.localeCompare(b.name, 'nl');

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
