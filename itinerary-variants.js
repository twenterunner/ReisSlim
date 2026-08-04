import { buildBudget } from './budget-engine.js';
import { evaluatePlanConstraints } from './constraint-engine.js';
import { buildItinerary } from './itinerary-engine.js';
import { calculateTripQuality } from './trip-quality-engine.js';

const definitions = Object.freeze([
  { id: 'relaxed', label: 'Rustig', summary: 'Eén vaste basis waar mogelijk, extra herstelruimte en weinig lokale kilometers.', baseLimit: 1, activityFactor: .82, localFactor: .7 },
  { id: 'balanced', label: 'Gebalanceerd', summary: 'Een evenwichtige mix van route, activiteiten, rust en accommodatie.', baseLimit: 2, activityFactor: 1, localFactor: 1 },
  { id: 'active', label: 'Actief', summary: 'Meer afwisseling en buitenactiviteiten, met een hoger tempo en iets meer lokale kilometers.', baseLimit: 3, activityFactor: 1.12, localFactor: 1.28 }
]);

const clone = value => JSON.parse(JSON.stringify(value));

function adaptPlan(plan, definition) {
  const next = clone(plan);
  for (const day of next.days) {
    if (!['stay', 'flex'].includes(day.kind)) continue;
    day.distanceKm = Math.round(Number(day.distanceKm || 0) * definition.localFactor);
    day.roadHours = Number((Number(day.roadHours || 0) * definition.localFactor).toFixed(1));
    day.driveHours = day.roadHours;
    day.elapsedHours = day.roadHours;
    if (definition.id === 'relaxed' && day.kind === 'stay' && day.day % 3 === 0) {
      day.kind = 'flex'; day.typeLabel = 'Flexibele rustdag'; day.activityType = 'rust';
      day.primaryPlan = 'Houd deze dag licht: uitslapen, boodschappen en hoogstens één korte activiteit dichtbij.';
    }
  }
  next.variantId = definition.id;
  next.variantLabel = definition.label;
  return next;
}

export function buildItineraryVariant(trip, destination, variantId = 'balanced') {
  const definition = definitions.find(item => item.id === variantId) || definitions[1];
  const variantDestination = {
    ...destination,
    bases: destination.bases.slice(0, Math.max(1, Math.min(definition.baseLimit, destination.bases.length))),
    activityDaily: Math.round(destination.activityDaily * definition.activityFactor)
  };
  const plan = adaptPlan(buildItinerary(trip, variantDestination), definition);
  const budget = buildBudget(trip, variantDestination, plan);
  const constraintStatus = evaluatePlanConstraints(trip, plan, budget, { allowStretch: destination.category === 'stretch' });
  plan.constraintStatus = constraintStatus;
  plan.feasible = constraintStatus.exact;
  plan.warnings = [...new Set([...(plan.warnings || []), ...constraintStatus.violations.map(item => item.detail)])];
  const quality = calculateTripQuality(trip, variantDestination, plan, budget);
  return {
    id: definition.id,
    label: definition.label,
    summary: definition.summary,
    destination: variantDestination,
    plan,
    budget,
    quality,
    constraintStatus,
    metrics: {
      total: budget.total,
      maxDrive: constraintStatus.maxElapsed,
      changes: plan.accommodationChanges,
      flexDays: plan.days.filter(day => day.kind === 'flex').length,
      activityDays: plan.days.filter(day => day.kind === 'stay').length
    }
  };
}

export function buildItineraryVariants(trip, destination) {
  return definitions.map(definition => buildItineraryVariant(trip, destination, definition.id));
}

export function getItineraryVariantDefinition(id) {
  return definitions.find(item => item.id === id) || definitions[1];
}
