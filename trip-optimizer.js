import { buildBudget } from './budget-engine.js';
import { evaluatePlanConstraints } from './constraint-engine.js';
import { addDays, buildItinerary, collectRouteSegments, countAccommodationChanges } from './itinerary-engine.js';
import { buildRecommendations } from './recommendation-engine.js';
import { calculateTripQuality } from './trip-quality-engine.js';
import { transportId } from './vehicle-intelligence.js';

const clone = value => JSON.parse(JSON.stringify(value));
const normalize = value => String(value || '').trim().toLocaleLowerCase('nl-NL');
const structuralDay = day => ({
  day: day.day,
  date: day.date,
  kind: day.kind,
  from: day.from,
  to: day.to,
  location: day.location,
  overnight: day.overnight,
  distanceKm: Number(day.distanceKm || 0),
  elapsedHours: Number(day.elapsedHours ?? day.driveHours ?? 0),
  routeSource: day.routeSource || null,
  geometry: (day.geometry || []).map(point => ({ lat: Number(point.lat), lon: Number(point.lon), name: point.name || null, role: point.role || null })),
  waypoints: (day.waypoints || []).map(point => ({ lat: Number(point.lat), lon: Number(point.lon), name: point.name || null, role: point.role || null })),
  recommendationIds: (day.recommendations || []).map(item => item.id || `${item.type}:${item.name}`)
});

const sameStructure = (left, right) => JSON.stringify(structuralDay(left)) === JSON.stringify(structuralDay(right));

export const createUndoSnapshot = plan => clone(plan);
export const restorePlan = snapshot => clone(snapshot);

const modes = Object.freeze({
  balanced: { label: 'Gebalanceerd', order: ['expand-coverage', 'consolidate', 'rest', 'deduplicate-pois', 'simplify-corridors'] },
  relaxed: { label: 'Meer rust', order: ['consolidate', 'rest', 'simplify-corridors', 'deduplicate-pois', 'expand-coverage'] },
  value: { label: 'Minder omwegen', order: ['consolidate', 'simplify-corridors', 'deduplicate-pois', 'expand-coverage', 'rest'] },
  active: { label: 'Meer unieke stops', order: ['expand-coverage', 'deduplicate-pois', 'simplify-corridors', 'consolidate', 'rest'] }
});

function recommendationsAreCurrent(plan, trip) {
  const vehicle = transportId(trip.transport);
  const recommendations = (plan.days || []).flatMap(day => day.recommendations || []);
  return recommendations.length > 0
    && recommendations.every(item => item.vehicleProfileId === vehicle && item.vehicleFit?.includes(vehicle));
}

function canonicalizePlan(trip, destination, input, { rebuildRecommendations = false, rebuildRecommendationDays = [] } = {}) {
  const plan = clone(input);
  plan.days ||= [];
  plan.days.forEach((day, index) => {
    day.day = index + 1;
    day.date = addDays(trip.startDate, index);
    day.distanceKm = Math.max(0, Number(day.distanceKm || 0));
    day.roadHours = Math.max(0, Number(day.roadHours ?? day.driveHours ?? 0));
    day.driveHours = Math.max(0, Number(day.driveHours ?? day.elapsedHours ?? day.roadHours ?? 0));
    day.elapsedHours = Math.max(0, Number(day.elapsedHours ?? day.driveHours ?? 0));
    day.geometry ||= [];
    day.waypoints ||= [];
  });
  if (rebuildRecommendations || !recommendationsAreCurrent(plan, trip)) {
    plan.recommendations = buildRecommendations(trip, destination, plan.days);
  } else if (rebuildRecommendationDays.length) {
    const affected = new Set(rebuildRecommendationDays);
    buildRecommendations(trip, destination, plan.days.filter(day => affected.has(day.day)));
    plan.recommendations = plan.days.flatMap(day => day.recommendations || []);
  } else {
    plan.recommendations = plan.days.flatMap(day => day.recommendations || []);
  }
  plan.accommodationChanges = countAccommodationChanges(plan.days, trip.origin);
  plan.routeSegments = collectRouteSegments(plan);
  plan.optimizationEvidence = { ...(plan.optimizationEvidence || {}), canonicalTripStartDate: trip.startDate, vehicleProfileId: transportId(trip.transport) };
  return plan;
}

function localDayAt(day, name, point, { flex = false, reason = 'structurele consolidatie' } = {}) {
  const anchor = point ? clone(point) : clone(day.fromPoint || day.toPoint || {});
  Object.assign(day, {
    kind: flex ? 'flex' : 'stay',
    typeLabel: flex ? 'Flexibele rustdag' : 'Verblijfsdag',
    from: name,
    to: name,
    location: name,
    overnight: name,
    fromPoint: { ...anchor, name, role: 'overnight' },
    toPoint: { ...anchor, name, role: 'overnight' },
    distanceKm: flex ? 0 : 8,
    roadHours: flex ? 0 : .2,
    driveHours: flex ? 0 : .2,
    elapsedHours: flex ? 0 : .2,
    breakHours: 0,
    restStops: 0,
    fuelStops: 0,
    stopCount: 0,
    waypoints: [],
    geometry: anchor?.lat !== undefined ? [anchor] : [],
    routeSource: 'optimizer-local-structure',
    activityType: flex ? 'rust' : day.activityType,
    primaryPlan: flex
      ? `Hersteldag in ${name}; deze dag vervangt een herhaalde route of activiteit.`
      : `Lokale dag vanuit ${name}; de eerdere omweg is structureel verwijderd.`,
    rainAlternative: `Plan hoogstens één beschutte activiteit dichtbij ${name}.`,
    exceedsDailyLimit: false,
    optimizationReason: reason
  });
}

function findRoundTripBlock(days) {
  for (let start = 0; start < days.length - 1; start += 1) {
    const outward = days[start];
    if (outward.kind !== 'transfer' || normalize(outward.from) === normalize(outward.to)) continue;
    for (let end = start + 1; end < Math.min(days.length, start + 5); end += 1) {
      const returning = days[end];
      if (returning.kind !== 'transfer') continue;
      if (normalize(returning.from) !== normalize(outward.to) || normalize(returning.to) !== normalize(outward.from)) continue;
      const middle = days.slice(start + 1, end);
      if (middle.every(day => !['outward', 'return', 'transfer'].includes(day.kind) && normalize(day.overnight) === normalize(outward.to))) {
        return { start, end, baseName: outward.from, basePoint: outward.fromPoint };
      }
    }
  }
  return null;
}

function repeatedStayIndex(days) {
  const seen = new Map();
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    if (day.kind !== 'stay') continue;
    const key = `${normalize(day.location)}:${normalize(day.primaryPlan)}`;
    if (seen.has(key)) return index;
    seen.set(key, index);
  }
  const stays = days.map((day, index) => ({ day, index })).filter(item => item.day.kind === 'stay');
  return stays.length >= 3 ? stays[Math.floor(stays.length / 2)].index : -1;
}

function duplicatePoiDays(plan) {
  const seen = new Set();
  const affected = new Set();
  for (const day of plan.days || []) {
    for (const item of day.recommendations || []) {
      if (!['activity', 'poi', 'attraction', 'restaurant'].includes(item.type)) continue;
      const key = `${normalize(item.type)}:${normalize(item.name)}`;
      if (!key.endsWith(':') && seen.has(key)) affected.add(day.day);
      else seen.add(key);
    }
  }
  return affected;
}

function hasDuplicateRoutePoints(day) {
  const key = point => `${Number(point?.lat).toFixed(5)},${Number(point?.lon).toFixed(5)}`;
  return (day.geometry || []).some((point, index, points) => index > 0 && key(point) === key(points[index - 1]))
    || (day.waypoints || []).some((point, index, points) => index > 0 && key(point) === key(points[index - 1]));
}

function actionCatalogue(trip, destination, plan, locks = {}) {
  const loop = findRoundTripBlock(plan.days || []);
  const restIndex = repeatedStayIndex(plan.days || []);
  const duplicateDays = duplicatePoiDays(plan);
  const corridorDays = (plan.days || []).filter(hasDuplicateRoutePoints).map(day => day.day);
  const usedBases = new Set((plan.days || []).filter(day => day.overnightRole !== 'transit').map(day => normalize(day.overnight)));
  const expansion = [...(plan.routeGraph?.omitted || []), ...(destination.highlights || [])]
    .filter(item => item?.baseName && !item.contextOnly && !usedBases.has(normalize(item.baseName)))
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0] || null;
  const actions = [
    {
      id: 'expand-coverage', title: 'Zwakke basis vervangen door een sterker routeanker', lock: 'accommodation', applicable: Boolean(expansion) && trip.days >= 7,
      candidateDays: (plan.days || []).filter(day => ['stay', 'flex', 'transfer'].includes(day.kind)).map(day => day.day),
      candidateHighlightId: expansion?.id || null,
      description: `Herbouwt de volledige routegraph met ${expansion?.baseName || 'een evidence-backed reservebasis'} als hoger gewaardeerd anker; dagen, overnachtingen, route, budget en aanbevelingen veranderen samen.`
    },
    {
      id: 'consolidate', title: 'Korte heen-en-weerbasis verwijderen', lock: 'accommodation', applicable: Boolean(loop),
      candidateDays: loop ? Array.from({ length: loop.end - loop.start + 1 }, (_, index) => loop.start + index + 1) : [],
      description: 'Vervangt een korte A–B–A-verblijfsomweg door aaneengesloten dagen vanuit A; de routegraph en overnachtingen veranderen echt.'
    },
    {
      id: 'rest', title: 'Herhaalde verblijfsdag als herstelbuffer', lock: 'activities', applicable: restIndex >= 0 && !(plan.days || []).some(day => day.kind === 'flex'),
      candidateDays: restIndex >= 0 ? [restIndex + 1] : [],
      description: 'Vervangt één concrete verblijfsdag door een routevrije herstelbuffer; dagtype, geometrie en aanbevelingen worden opnieuw opgebouwd.'
    },
    {
      id: 'deduplicate-pois', title: 'Dubbele POI-stops verwijderen', lock: 'activities', applicable: duplicateDays.size > 0,
      candidateDays: [...duplicateDays],
      description: 'Verwijdert alleen werkelijk dubbele activiteit- en restaurantstops op latere dagen; unieke en voertuigpassende opties blijven staan.'
    },
    {
      id: 'simplify-corridors', title: 'Dubbele routepunten opruimen', lock: 'route', applicable: corridorDays.length > 0,
      candidateDays: corridorDays,
      description: 'Verwijdert opeenvolgende dubbele geometrie- en waypointpunten zonder tekst of reistijden kunstmatig te veranderen.'
    }
  ];
  return actions.filter(action => action.applicable && !locks[action.lock]);
}

function applyAction(input, actionId, trip, destination) {
  let next = canonicalizePlan(trip, destination, input);
  if (actionId === 'expand-coverage') {
    const usedBases = new Set(next.days.filter(day => day.overnightRole !== 'transit').map(day => normalize(day.overnight)));
    const expansion = [...(next.routeGraph?.omitted || []), ...(destination.highlights || [])]
      .filter(item => item?.baseName && !item.contextOnly && !usedBases.has(normalize(item.baseName)))
      .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0];
    if (!expansion) return next;
    const expandedDestination = clone(destination);
    expandedDestination.highlights = (expandedDestination.highlights || []).map(item => item.id === expansion.id
      ? { ...item, priority: 10, minimumTripDays: Math.min(Number(item.minimumTripDays || trip.days), trip.days) }
      : { ...item, priority: Math.max(1, Number(item.priority || 6) - (usedBases.has(normalize(item.baseName)) ? 1 : 0)) });
    if (!expandedDestination.bases.some(base => normalize(base.name) === normalize(expansion.baseName))) {
      expandedDestination.bases.push({ name: expansion.baseName, ...(expansion.overnightPoint || expansion.point || {}) });
    }
    next = canonicalizePlan(trip, expandedDestination, buildItinerary(trip, expandedDestination), { rebuildRecommendations: true });
    next.optimizationDestinationPatch = { promotedHighlightId: expansion.id, promotedBase: expansion.baseName };
  }
  if (actionId === 'consolidate') {
    const block = findRoundTripBlock(next.days);
    if (!block) return next;
    for (let index = block.start; index <= block.end; index += 1) {
      localDayAt(next.days[index], block.baseName, block.basePoint, {
        flex: index === block.start + Math.floor((block.end - block.start) / 2),
        reason: 'korte A–B–A-omweg verwijderd'
      });
    }
    next = canonicalizePlan(trip, destination, next, {
      rebuildRecommendationDays: Array.from({ length: block.end - block.start + 1 }, (_, index) => block.start + index + 1)
    });
  }
  if (actionId === 'rest') {
    const index = repeatedStayIndex(next.days);
    if (index < 0 || next.days.some(day => day.kind === 'flex')) return next;
    localDayAt(next.days[index], next.days[index].location, next.days[index].toPoint, { flex: true, reason: 'herhaalde dag vervangen door herstelbuffer' });
    next = canonicalizePlan(trip, destination, next, { rebuildRecommendationDays: [index + 1] });
  }
  if (actionId === 'deduplicate-pois') {
    const seen = new Set();
    const candidateHighlights = (destination.highlights || [])
      .filter(item => item?.name && item?.providerId && item?.sourceUrl)
      .slice().sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0)
        || String(left.name).localeCompare(String(right.name), 'en'));
    const candidateRecommendations = (destination.catalogueRecommendations || destination.recommendations || [])
      .filter(item => item?.name && item?.providerId && item?.sourceUrl);
    const usedProviderIds = new Set(next.days.flatMap(day => day.recommendations || [])
      .map(item => String(item.providerId || '')).filter(Boolean));
    for (const day of next.days) {
      day.recommendations = (day.recommendations || []).flatMap(item => {
        if (!['activity', 'poi', 'attraction', 'restaurant'].includes(item.type)) return [item];
        const key = `${normalize(item.type)}:${normalize(item.name)}`;
        if (!key.endsWith(':') && seen.has(key)) {
          const sameTypeCandidates = item.type === 'restaurant'
            ? candidateRecommendations.filter(candidate => candidate.type === 'restaurant')
            : candidateHighlights;
          const replacement = sameTypeCandidates.find(candidate => {
            const providerId = String(candidate.providerId || '');
            return providerId && !usedProviderIds.has(providerId)
              && normalize(candidate.name) !== normalize(item.name)
              && (!candidate.associatedBase || normalize(candidate.associatedBase) === normalize(day.overnight)
                || !sameTypeCandidates.some(other => normalize(other.associatedBase) === normalize(day.overnight)
                  && !usedProviderIds.has(String(other.providerId || ''))));
          });
          if (!replacement) return [];
          usedProviderIds.add(String(replacement.providerId));
          const replacementItem = {
            ...item,
            id: replacement.id || `optimizer-${replacement.providerId}`,
            providerId: replacement.providerId,
            name: replacement.name,
            point: clone(replacement.point || item.point),
            sourceUrl: replacement.sourceUrl,
            url: replacement.sourceUrl,
            source: replacement.provider || destination.provider?.name || item.source,
            confidence: replacement.confidence || item.confidence,
            genericFallback: false,
            associatedBase: day.overnight,
            reason: `Vervangt een dubbele aanbeveling door het afzonderlijke bronanker ${replacement.name}; actuele toegang blijft ongeverifieerd.`
          };
          const replacementKey = `${normalize(replacementItem.type)}:${normalize(replacementItem.name)}`;
          seen.add(replacementKey);
          if (item.type !== 'restaurant') {
            day.activityId = replacement.id || replacement.providerId;
            day.primaryPlan = replacement.activity || `Bezoek ${replacement.name}; controleer actuele toegang bij de bron.`;
          }
          return [replacementItem];
        }
        seen.add(key);
        return [item];
      });
      day.sleepProposal = day.recommendations.find(item => item.type === 'accommodation') || null;
    }
    next.recommendations = next.days.flatMap(day => day.recommendations || []);
  }
  if (actionId === 'simplify-corridors') {
    const dedupe = points => (points || []).filter((point, index, all) => index === 0
      || Number(point?.lat).toFixed(5) !== Number(all[index - 1]?.lat).toFixed(5)
      || Number(point?.lon).toFixed(5) !== Number(all[index - 1]?.lon).toFixed(5));
    next.days.forEach(day => {
      day.geometry = dedupe(day.geometry);
      day.waypoints = dedupe(day.waypoints);
      day.stopCount = day.waypoints.length;
    });
  }
  next.optimized = true;
  next.appliedOptimizationIds = [...new Set([...(next.appliedOptimizationIds || []), actionId])];
  next.accommodationChanges = countAccommodationChanges(next.days, trip.origin);
  return next;
}

function evaluate(trip, destination, plan) {
  const next = canonicalizePlan(trip, destination, plan);
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
  const importantDelta = Math.max(0, ...Object.values(dimensionDeltas));
  const resolvedDefects = Math.max(0, before.quality.deductions.length - after.quality.deductions.length)
    + Math.max(0, before.constraintStatus.violations.length - after.constraintStatus.violations.length)
    + Math.max(0, before.quality.gate.reasons.length - after.quality.gate.reasons.length);
  const meaningful = overallDelta >= 2 || importantDelta >= 7 || resolvedDefects > 0;
  return { overallDelta, dimensionDeltas, importantDelta, resolvedDefects, meaningful };
}

function planChange(action, before, after) {
  const maximum = Math.max(before.days.length, after.days.length);
  const affectedDays = [];
  const beforeDays = [];
  const afterDays = [];
  for (let index = 0; index < maximum; index += 1) {
    const left = before.days[index];
    const right = after.days[index];
    if (left && right && sameStructure(left, right)) continue;
    affectedDays.push(index + 1);
    beforeDays.push(left ? structuralDay(left) : null);
    afterDays.push(right ? structuralDay(right) : null);
  }
  return {
    actionId: action.id,
    title: action.title,
    description: action.description,
    affectedDays,
    before: beforeDays,
    after: afterDays,
    structural: affectedDays.length > 0
  };
}

function applyActions(trip, destination, plan, actionIds, catalogue = null) {
  let current = canonicalizePlan(trip, destination, plan);
  const changes = [];
  const definitions = catalogue || actionCatalogue(trip, destination, current);
  for (const id of actionIds) {
    const action = definitions.find(item => item.id === id);
    if (!action) continue;
    const before = current;
    const after = applyAction(current, id, trip, destination);
    const change = planChange(action, before, after);
    if (!change.structural) continue;
    current = after;
    changes.push(change);
  }
  return { plan: current, changes };
}

export function applyOptimizationProposal(trip, destination, plan, actionIds) {
  let current = evaluate(trip, destination, plan);
  const catalogue = actionCatalogue(trip, destination, current.plan);
  const acceptedChanges = [];
  for (const id of actionIds || []) {
    const action = catalogue.find(item => item.id === id);
    if (!action) continue;
    const applied = applyActions(trip, destination, current.plan, [id], [action]);
    if (!applied.changes.length) continue;
    const candidate = evaluate(trip, destination, applied.plan);
    if (!candidate.constraintStatus.selectable) continue;
    if (current.quality.passes && !candidate.quality.passes) continue;
    const delta = improvement(current, candidate);
    if (!delta.meaningful) continue;
    acceptedChanges.push(applied.changes[0]);
    current = candidate;
  }
  current.plan.optimized = acceptedChanges.length > 0;
  current.plan.appliedOptimizationIds = acceptedChanges.map(change => change.actionId);
  current.changes = acceptedChanges;
  return current;
}

export function proposeOptimizations(trip, destination, plan, { mode = 'balanced', locks = {} } = {}) {
  const baseline = evaluate(trip, destination, plan);
  const available = actionCatalogue(trip, destination, baseline.plan, locks);
  const order = modes[mode]?.order || modes.balanced.order;
  const ordered = [...available].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  let working = baseline;
  const accepted = [];
  const changeSet = [];

  for (const action of ordered) {
    const applied = applyActions(trip, destination, working.plan, [action.id], [action]);
    if (!applied.changes.length) continue;
    const candidate = evaluate(trip, destination, applied.plan);
    if (!candidate.constraintStatus.selectable) continue;
    if (working.quality.passes && !candidate.quality.passes) continue;
    const delta = improvement(working, candidate);
    if (!(delta.overallDelta >= .75 || delta.importantDelta >= 4 || delta.resolvedDefects > 0)) continue;
    accepted.push({ ...action, affectedDays: applied.changes[0].affectedDays });
    changeSet.push(applied.changes[0]);
    working = candidate;
  }

  const delta = improvement(baseline, working);
  if (!accepted.length || !delta.meaningful) {
    return {
      mode, modeLabel: modes[mode]?.label || modes.balanced.label, locks: { ...locks },
      actions: [], changes: [], changeSet: [], before: baseline, after: baseline,
      improvement: improvement(baseline, baseline), meaningful: false,
      threshold: 'Alleen structurele wijzigingen met ≥2 totaalpunten, ≥7 op een kwaliteitsdimensie of een aantoonbaar opgelost gebrek.',
      message: available.length ? 'De structurele winst is te klein; tekstuele of verwaarloosbare wijzigingen zijn onderdrukt.' : 'Geen structurele verbetering gevonden binnen de huidige locks.'
    };
  }

  return {
    mode, modeLabel: modes[mode]?.label || modes.balanced.label, locks: { ...locks },
    actions: accepted,
    changes: changeSet.map(change => `${change.title}: dag ${change.affectedDays.join(', ')}`),
    changeSet,
    before: baseline,
    after: working,
    improvement: delta,
    meaningful: true,
    threshold: 'Alleen structurele wijzigingen met ≥2 totaalpunten, ≥7 op een kwaliteitsdimensie of een aantoonbaar opgelost gebrek.',
    message: 'Iedere voorgestelde wijziging verandert de canonieke dagstructuur en haalt de minimale verbeterdrempel.'
  };
}

export function optimisePlan(trip, destination, plan, options = {}) {
  const proposal = proposeOptimizations(trip, destination, plan, options);
  if (!proposal.meaningful) return { plan: proposal.before.plan, changes: [], changeSet: [], proposal };
  return { plan: proposal.after.plan, changes: proposal.changes, changeSet: proposal.changeSet, proposal };
}

export function constraintsPreserved(before, after, trip) {
  return before.days.length === after.days.length
    && after.days.length === trip.days
    && before.days[0].from === after.days[0].from
    && after.days[0].date === trip.startDate
    && after.days.every((day, index) => day.day === index + 1 && day.date === addDays(trip.startDate, index))
    && after.days.at(-1).to === trip.origin
    && after.days.every(day => Number(day.driveHours) >= 0 && Number(day.elapsedHours ?? day.driveHours) <= trip.maxDrive + .05)
    && after.accommodationChanges <= trip.maxChanges
    && recommendationsAreCurrent(after, trip);
}

export const optimizationModes = modes;
