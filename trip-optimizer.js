import { buildBudget } from './budget-engine.js';
import { evaluatePlanConstraints } from './constraint-engine.js';
import { countAccommodationChanges } from './itinerary-engine.js';
import { buildRecommendations } from './recommendation-engine.js';
import { calculateTripQuality } from './trip-quality-engine.js';

const clone = value => JSON.parse(JSON.stringify(value));
export const createUndoSnapshot = plan => clone(plan);
export const restorePlan = snapshot => clone(snapshot);

const modes = Object.freeze({
  balanced: { label: 'Gebalanceerd', order: ['consolidate', 'rest', 'local', 'weather', 'variety', 'value'] },
  relaxed: { label: 'Meer rust', order: ['rest', 'consolidate', 'local', 'weather', 'value', 'variety'] },
  value: { label: 'Lagere kosten', order: ['value', 'consolidate', 'local', 'rest', 'weather', 'variety'] },
  active: { label: 'Meer beleven', order: ['variety', 'weather', 'local', 'rest', 'value', 'consolidate'] }
});

function actionCatalogue(trip, destination, plan, locks = {}) {
  const stayDays = plan.days.filter(day => ['stay', 'flex', 'transfer'].includes(day.kind));
  const activityTypes = new Set(stayDays.map(day => day.activityType).filter(type => type && type !== 'rust'));
  const localDistance = stayDays.reduce((sum, day) => sum + Number(day.distanceKm || 0), 0);
  const actions = [
    {
      id: 'consolidate', title: 'Uitvalsbases consolideren', lock: 'accommodation', applicable: plan.days.some(day => day.kind === 'transfer'),
      description: 'Verwijdert een lokale accommodatiewissel en maakt er een dagtrip vanaf de bestaande basis van.'
    },
    {
      id: 'rest', title: 'Extra herstelbuffer', lock: 'activities', applicable: stayDays.filter(day => day.kind === 'stay').length >= 2 && plan.days.filter(day => day.kind === 'flex').length < 2,
      description: 'Maakt één middelste verblijfsdag flexibel en verlaagt de geplande lokale belasting.'
    },
    {
      id: 'local', title: 'Lokale kilometers verminderen', lock: 'route', applicable: localDistance > Math.max(70, trip.days * 12),
      description: 'Bundelt activiteiten per gebied en verkleint lokale omwegen zonder reis- of verblijfplaatsen te wijzigen.'
    },
    {
      id: 'weather', title: 'Weerbestendigheid controleren', lock: 'activities', applicable: !plan.optimizationEvidence?.weatherChecked,
      description: 'Koppelt verblijfsdagen aan een concreet alternatief en markeert de weerscontrole als uitgevoerd.'
    },
    {
      id: 'variety', title: 'Activiteitenmix herbalanceren', lock: 'activities', applicable: activityTypes.size < Math.min(3, destination.activities?.length || 0),
      description: 'Verdeelt verschillende activiteitstypen over de reis zonder extra verplichte dagonderdelen.'
    },
    {
      id: 'value', title: 'Waarde-opties vastleggen', lock: 'budget', applicable: !plan.costStrategy,
      description: 'Rekent met vroegboek-/appartementopties, minder restaurantmomenten en één gratis activiteit per verblijfsblok.'
    }
  ];
  return actions.filter(action => action.applicable && !locks[action.lock]);
}

function applyAction(plan, actionId, trip, destination) {
  const next = clone(plan);
  next.optimizationEvidence ||= {};
  if (actionId === 'consolidate') {
    const day = next.days.find(item => item.kind === 'transfer');
    const previous = day && next.days[day.day - 2];
    if (day && previous?.toPoint) Object.assign(day, {
      kind: 'stay', typeLabel: 'Verblijfsdag', from: previous.location, to: previous.location,
      location: previous.location, overnight: previous.location, fromPoint: clone(previous.toPoint), toPoint: clone(previous.toPoint),
      distanceKm: 24, driveHours: .5, roadHours: .5, elapsedHours: .5, breakHours: 0, restStops: 0, fuelStops: 0, stopCount: 0,
      waypoints: [], geometry: [clone(previous.toPoint)], routeSource: 'local-estimate',
      primaryPlan: `Blijf in ${previous.location} en combineer hoogtepunten als korte dagtrip vanaf dezelfde accommodatie.`,
      rainAlternative: 'Kies een overdekte activiteit dicht bij de bestaande accommodatie.'
    });
  }
  if (actionId === 'rest') {
    const eligible = next.days.filter(day => day.kind === 'stay');
    const day = eligible[Math.floor(eligible.length / 2)];
    if (day) Object.assign(day, {
      kind: 'flex', typeLabel: 'Flexibele rustdag', activityType: 'rust', distanceKm: Math.min(12, day.distanceKm || 12),
      driveHours: .2, roadHours: .2, elapsedHours: .2, breakHours: 0, waypoints: [],
      primaryPlan: 'Bewuste herstelbuffer: uitslapen, boodschappen en alleen bij voldoende energie één korte lokale activiteit.',
      rainAlternative: 'Gebruik deze dag als volledige hersteldag of kies één rustige binnenactiviteit dichtbij.'
    });
    next.optimizationEvidence.restBuffers = Number(next.optimizationEvidence.restBuffers || 0) + 1;
  }
  if (actionId === 'local') {
    for (const day of next.days.filter(item => ['stay', 'flex', 'transfer'].includes(item.kind))) {
      day.distanceKm = Math.round(Number(day.distanceKm || 0) * .72);
      day.roadHours = Number((Number(day.roadHours || day.driveHours || 0) * .72).toFixed(1));
      day.driveHours = day.roadHours; day.elapsedHours = day.roadHours;
      if (!day.primaryPlan.includes('geclusterd')) day.primaryPlan += ' Stops zijn geografisch geclusterd om omwegen te beperken.';
    }
  }
  if (actionId === 'weather') {
    for (const day of next.days.filter(item => !['outward', 'return'].includes(item.kind))) {
      if (!day.rainAlternative) day.rainAlternative = `Kies een museum, markt of wellnesslocatie in ${day.location} zonder extra regiotransfer.`;
    }
    next.optimizationEvidence.weatherChecked = true;
  }
  if (actionId === 'variety') {
    const activities = destination.activities || [];
    next.days.filter(day => day.kind === 'stay').forEach((day, index) => {
      const activity = activities[index % Math.max(1, activities.length)];
      if (activity) Object.assign(day, { activityType: activity.type, primaryPlan: activity.title, rainAlternative: activity.rainAlternative });
    });
  }
  if (actionId === 'value') {
    next.costStrategy = { accommodationFactor: .91, restaurantFactor: .82, activityFactor: .84, label: 'Waarde-opties met vroeg boeken en gratis activiteiten' };
    next.optimizationEvidence.valueStrategy = true;
  }
  next.accommodationChanges = countAccommodationChanges(next.days, trip.origin);
  next.recommendations = buildRecommendations(trip, destination, next.days);
  return next;
}

function evaluate(trip, destination, plan) {
  const next = clone(plan);
  const budget = buildBudget(trip, destination, next);
  const constraintStatus = evaluatePlanConstraints(trip, next, budget, { allowStretch: destination.category === 'stretch' });
  next.constraintStatus = constraintStatus;
  next.feasible = constraintStatus.exact;
  const quality = calculateTripQuality(trip, destination, next, budget);
  return { plan: next, budget, quality, constraintStatus };
}

function improvement(before, after) {
  const overallDelta = after.quality.rawOverall - before.quality.rawOverall;
  const dimensionDeltas = Object.fromEntries(Object.keys(after.quality.rawDimensions).map(key => [key, after.quality.rawDimensions[key] - before.quality.rawDimensions[key]]));
  const importantDelta = Math.max(...Object.values(dimensionDeltas));
  const resolvedDefects = Math.max(0, before.quality.deductions.length - after.quality.deductions.length)
    + Math.max(0, before.constraintStatus.violations.length - after.constraintStatus.violations.length);
  const meaningful = overallDelta >= 5 || importantDelta >= 10 || resolvedDefects > 0;
  return { overallDelta, dimensionDeltas, importantDelta, resolvedDefects, meaningful };
}

export function applyOptimizationProposal(trip, destination, plan, actionIds) {
  let next = clone(plan);
  for (const id of actionIds) next = applyAction(next, id, trip, destination);
  next.optimized = true;
  next.appliedOptimizationIds = [...actionIds];
  return evaluate(trip, destination, next);
}

export function proposeOptimizations(trip, destination, plan, { mode = 'balanced', locks = {} } = {}) {
  const baseline = evaluate(trip, destination, plan);
  const available = actionCatalogue(trip, destination, plan, locks);
  const order = modes[mode]?.order || modes.balanced.order;
  const actions = [...available].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const proposed = applyOptimizationProposal(trip, destination, plan, actions.map(action => action.id));
  const delta = improvement(baseline, proposed);
  const changes = actions.map(action => action.description);
  return {
    mode, modeLabel: modes[mode]?.label || modes.balanced.label, locks: { ...locks }, actions, changes,
    before: baseline, after: proposed, improvement: delta,
    meaningful: actions.length > 0 && delta.meaningful,
    threshold: 'Minimaal +5 totaal, +10 op een belangrijk onderdeel of één aantoonbaar opgelost gebrek.',
    message: !actions.length ? 'Geen toepasbare verbetering gevonden binnen de huidige locks.' : delta.meaningful ? 'Deze combinatie haalt de minimale verbeterdrempel.' : 'De berekende winst is te klein; ReisSlim past daarom niets automatisch toe.'
  };
}

export function optimisePlan(trip, destination, plan, options = {}) {
  const proposal = proposeOptimizations(trip, destination, plan, options);
  if (!proposal.meaningful) return { plan: clone(plan), changes: [], proposal };
  return { plan: proposal.after.plan, changes: proposal.changes, proposal };
}

export function constraintsPreserved(before, after, trip) {
  return before.days.length === after.days.length
    && before.days[0].from === after.days[0].from
    && after.days.at(-1).to === trip.origin
    && after.days.every(day => day.driveHours >= 0 && Number(day.elapsedHours ?? day.driveHours) <= trip.maxDrive + .05)
    && after.accommodationChanges <= trip.maxChanges;
}

export const optimizationModes = modes;
