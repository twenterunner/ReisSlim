import { validCoordinate } from './config.js';
import { buildBreakWaypoints, buildTravelNodes, haversineKm, interpolateRoutePoint, segmentMetrics } from './route-engine.js';
import { buildRecommendations } from './recommendation-engine.js';
import { estimateLegTiming, transportId, travelGuidance } from './vehicle-intelligence.js';
import { applyDaySchedules, solveDayAllocation } from './plan-solver.js';
import { buildAlternativeReturnNodes, routeExplorationMetrics } from './route-topology.js';
import { buildAccessSegments, effectiveGroundVehicle, isMultimodal } from './multimodal-engine.js';
import { graphEdge, localHighlightGeometry, planHighlightRoute } from './route-graph-engine.js';

export function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function labelFor(kind) {
  return ({ outward: 'Heenreis', return: 'Terugreis', transfer: 'Bestemmingstransfer', stay: 'Verblijfsdag', flex: 'Flexibele rustdag' })[kind];
}

function chooseActivities(trip, destination) {
  return [...destination.activities].sort((a, b) => {
    const score = item => item.tags.reduce((sum, tag) => sum + (trip.preferences.includes(tag) ? (trip.preferenceWeights[tag] || 2) : 0), 0);
    return score(b) - score(a) || a.title.localeCompare(b.title, 'nl');
  });
}

function makeTravelDay(kind, from, to, route, trip, legCount) {
  const base = segmentMetrics(from, to, route.oneWayDistanceKm, route.oneWayRoadHours);
  const timing = estimateLegTiming(trip, { ...base, arrival: to.role !== 'return' });
  const waypoints = buildBreakWaypoints(from, to, timing, trip.transport);
  const direction = kind === 'outward' ? 'heenreis' : 'terugreis';
  return {
    kind, typeLabel: labelFor(kind), from: from.name, to: to.name, location: to.name,
    fromPoint: { ...from }, toPoint: { ...to }, overnight: to.name,
    distanceKm: base.distanceKm, roadHours: timing.roadHours, driveHours: timing.elapsedHours,
    elapsedHours: timing.elapsedHours, breakHours: timing.breakHours,
    restStops: timing.restStops, fuelStops: timing.fuelStops, stopCount: timing.stopCount,
    waypoints, geometry: [{ ...from }, ...waypoints, { ...to }],
    routeSource: 'offline-corridor',
    primaryPlan: `Rijd van ${from.name} naar ${to.name}. ${travelGuidance(trip, timing)} Houd de ${direction} verder licht.`,
    rainAlternative: 'Pas pauzeplaatsen en vertrektijd aan bij slecht weer; vermijd een vol activiteitenprogramma na aankomst.',
    exceedsDailyLimit: timing.elapsedHours > trip.maxDrive + .05
  };
}

function localTransfer(from, to, trip) {
  const direct = haversineKm(from, to) || 0;
  const distanceKm = Math.max(5, Math.round(direct * 1.25));
  const speeds = { car: 52, motorcycle: 50, motorhome: 46, caravan: 43 };
  const roadHours = Number((distanceKm / speeds[transportId(trip.transport)]).toFixed(1));
  const timing = estimateLegTiming(trip, { distanceKm, roadHours, arrival: true });
  const waypoints = buildBreakWaypoints(from, to, timing, trip.transport);
  return {
    distanceKm, roadHours: timing.roadHours, driveHours: timing.elapsedHours,
    elapsedHours: timing.elapsedHours, breakHours: timing.breakHours,
    restStops: timing.restStops, fuelStops: timing.fuelStops, stopCount: timing.stopCount,
    waypoints, geometry: [{ ...from }, ...waypoints, { ...to }], routeSource: 'offline-corridor'
  };
}

export function buildItinerary(trip, destination) {
  if (destination.dynamic) return buildChronologicalDynamicItinerary(trip, destination);
  if (isMultimodal(trip)) return buildMultimodalItinerary(trip, destination);
  const firstPass = buildTravelNodes(trip, destination, 1);
  const requiredLegs = firstPass.metrics.requiredLegs;
  const preferredLegs = destination.constraintStatus?.travelLegs || requiredLegs;
  const allocation = solveDayAllocation(trip, requiredLegs, preferredLegs);
  const usedLegs = allocation.usedLegs;
  const { metrics, outbound } = buildTravelNodes(trip, destination, usedLegs);
  let { inbound } = buildTravelNodes(trip, destination, usedLegs);
  if (trip.routeTopology !== 'out-and-back' && usedLegs > 1) inbound = buildAlternativeReturnNodes(outbound[0], outbound.at(-1), usedLegs);
  const days = [];

  for (let index = 0; index < outbound.length - 1; index += 1) {
    days.push(makeTravelDay('outward', outbound[index], outbound[index + 1], metrics, trip, usedLegs));
  }

  const stayCount = allocation.stayDays;
  const activities = chooseActivities(trip, destination);
  const travelChanges = Math.max(0, (usedLegs - 1) * 2);
  const allowSecondBase = stayCount >= 5 && trip.maxChanges > travelChanges + 1 && destination.bases.length > 1;
  let baseIndex = 0;
  for (let index = 0; index < stayCount; index += 1) {
    const shouldTransfer = allowSecondBase && index === Math.ceil(stayCount / 2);
    if (shouldTransfer) {
      const from = destination.bases[baseIndex];
      baseIndex = 1;
      const to = destination.bases[baseIndex];
      const metricsLocal = localTransfer(from, to, trip);
      days.push({
        kind: 'transfer', typeLabel: labelFor('transfer'), from: from.name, to: to.name,
        location: to.name, fromPoint: { ...from, role: 'destination' }, toPoint: { ...to, role: 'destination' },
        overnight: to.name, ...metricsLocal,
        primaryPlan: `Verplaats de uitvalsbasis van ${from.name} naar ${to.name} en beperk het programma tot één rustige tussenstop.`,
        rainAlternative: 'Rijd rechtstreeks naar de nieuwe accommodatie en kies daarna een overdekte activiteit dichtbij.'
      });
      continue;
    }
    const base = destination.bases[baseIndex];
    const flexible = stayCount >= 4 && index === Math.floor(stayCount / 2) && !shouldTransfer;
    const activity = activities[index % activities.length];
    days.push({
      kind: flexible ? 'flex' : 'stay', typeLabel: labelFor(flexible ? 'flex' : 'stay'),
      from: base.name, to: base.name, location: base.name, fromPoint: { ...base, role: 'destination' },
      toPoint: { ...base, role: 'destination' }, overnight: base.name,
      distanceKm: flexible ? 15 : 35, driveHours: flexible ? .3 : .7,
      roadHours: flexible ? .3 : .7, elapsedHours: flexible ? .3 : .7, breakHours: 0,
      waypoints: [], geometry: [{ ...base }], routeSource: 'local-estimate',
      activityType: flexible ? 'rust' : activity.type,
      primaryPlan: flexible ? 'Houd deze dag bewust vrij: uitslapen, boodschappen en maximaal één korte lokale activiteit.' : activity.title,
      rainAlternative: flexible ? 'Gebruik de dag als volledige hersteldag of kies een rustige binnenactiviteit dichtbij.' : activity.rainAlternative
    });
  }

  if (allowSecondBase) {
    const secondary = destination.bases[1];
    inbound[0] = { ...secondary, role: 'destination', progress: 1 };
  }
  for (let index = 0; index < inbound.length - 1; index += 1) {
    days.push(makeTravelDay('return', inbound[index], inbound[index + 1], metrics, trip, usedLegs));
  }

  days.forEach((day, index) => {
    day.day = index + 1;
    day.date = addDays(trip.startDate, index);
  });
  applyDaySchedules(trip, days);
  const recommendations = buildRecommendations(trip, destination, days);
  metrics.exploration = routeExplorationMetrics(
    outbound,
    inbound
  );

  const minimumDays = requiredLegs * 2 + 1;
  const excessiveDays = days.filter(day => day.exceedsDailyLimit);
  const warnings = [];
  if (minimumDays > trip.days) warnings.push(`Deze bestemming vraagt minimaal ${minimumDays} dagen om onder ${trip.maxDrive} uur rijden per dag te blijven. De huidige ${trip.days}-daagse planning markeert de te lange rijdagen.`);
  if (metrics.warning) warnings.push(metrics.warning);
  if (excessiveDays.length) warnings.push(`${excessiveDays.length} rijdag${excessiveDays.length === 1 ? '' : 'en'} overschrijdt de ingestelde daglimiet.`);
  const accommodationChanges = countAccommodationChanges(days, trip.origin);
  if (accommodationChanges > trip.maxChanges) warnings.push(`De route vraagt circa ${accommodationChanges} accommodatiewissels; jouw voorkeur is maximaal ${trip.maxChanges}.`);
  if (destination.category === 'stretch' && destination.constraintStatus?.violations?.length) {
    warnings.unshift(`Stretch-idee: ${destination.constraintStatus.violations[0].detail}`);
  }

  return {
    days, routeMetrics: metrics, requiredLegs, usedLegs, minimumDays,
    feasible: minimumDays <= trip.days && excessiveDays.length === 0 && accommodationChanges <= trip.maxChanges,
    proposalCategory: destination.category || 'exact',
    warnings, accommodationChanges, recommendations,
    routing: { source: 'offline-corridor', label: 'Offline corridorraming', live: false },
    origin: { name: trip.origin, ...(metrics.origin || {}) }
  };
}

function buildChronologicalDynamicItinerary(trip, destination) {
  const graphPlan = planHighlightRoute(trip, destination);
  const route = graphPlan.route;
  const gateway = route[0];
  if (!gateway) return buildMultimodalItinerary(trip, destination);
  const multimodal = isMultimodal(trip);
  const groundTrip = { ...trip, transport: multimodal ? effectiveGroundVehicle(trip) : trip.transport };
  const origin = { ...(trip.originPoint || {}), name: trip.origin, role: 'origin' };
  const accessSegments = multimodal ? buildAccessSegments(trip, destination) : [];
  const days = [];
  const usedActivityIds = new Set();
  const usedActivityTexts = new Set();
  const localSpeeds = { car: 48, motorcycle: 44, motorhome: 40, caravan: 37 };

  const accessDay = (kind, fromPoint, fromName, toPoint, toName, transportSegments) => {
    let distanceKm; let timing;
    if (multimodal) {
      distanceKm = 25;
      timing = { roadHours: 1.2, elapsedHours: 1.2, breakHours: 0, restStops: 0, fuelStops: 0, stopCount: 0 };
    } else {
      const edge = graphEdge(groundTrip, { id: `${kind}-from`, overnightPoint: fromPoint }, { id: `${kind}-to`, overnightPoint: toPoint }, destination);
      distanceKm = edge.distanceKm;
      timing = edge.timing;
    }
    const geometry = validCoordinate(fromPoint) && validCoordinate(toPoint) ? [fromPoint, toPoint] : [toPoint].filter(validCoordinate);
    const waypoints = multimodal ? [] : buildBreakWaypoints(fromPoint, toPoint, timing, groundTrip.transport);
    return {
      kind, typeLabel: kind === 'outward' ? (multimodal ? 'Toegang + voertuig ophalen' : 'Heenreis') : 'Terugverbinding',
      from: fromName, to: toName, location: toName, fromPoint, toPoint, overnight: kind === 'return' ? trip.origin : toName,
      distanceKm, roadHours: timing.roadHours, driveHours: timing.elapsedHours, elapsedHours: timing.elapsedHours,
      breakHours: timing.breakHours, restStops: timing.restStops, fuelStops: timing.fuelStops, stopCount: timing.stopCount,
      waypoints, geometry, routeSource: multimodal ? 'multimodal-fallback-geometry' : 'route-graph-estimate', routeConfidence: 'estimated', transportSegments,
      primaryPlan: kind === 'outward'
        ? `Bereik ${toName}, rond de voertuigoverdracht af en houd een aankomstbuffer.`
        : 'Keer via de gekozen toegang terug en houd marge voor voertuigteruggave of de laatste wegverbinding.',
      rainAlternative: kind === 'outward'
        ? `Ga na aankomst rechtstreeks naar de eerste overnachtingsbasis in ${toName}.`
        : 'Vergroot de vertrekmarge en schrap alle optionele stops.',
      exceedsDailyLimit: !multimodal && timing.elapsedHours > trip.maxDrive + .05
    };
  };

  const accessNodes = (fromPoint, fromName, toPoint, toName, legCount, direction) => {
    const nodes = [{ point: fromPoint, name: fromName }];
    for (let index = 1; index < legCount; index += 1) {
      const estimated = interpolateRoutePoint(fromPoint, toPoint, index / legCount, {
        role: 'transit', approximate: true, confidence: 'estimated'
      });
      if (estimated) nodes.push({
        point: estimated,
        name: `Indicatieve transitstop ${index} op de ${direction} (exacte plaats volgt uit routeverrijking)`
      });
    }
    nodes.push({ point: toPoint, name: toName });
    return nodes;
  };

  const appendAccessDays = (kind, fromPoint, fromName, toPoint, toName, legCount, transportSegments) => {
    const direction = kind === 'outward' ? 'heenroute' : 'terugroute';
    const nodes = accessNodes(fromPoint, fromName, toPoint, toName, Math.max(1, Number(legCount) || 1), direction);
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const segment = accessDay(kind, nodes[index].point, nodes[index].name, nodes[index + 1].point, nodes[index + 1].name, index === 0 ? transportSegments : []);
      segment.overnight = kind === 'return' && index === nodes.length - 2 ? trip.origin : nodes[index + 1].name;
      segment.overnightRole = nodes[index + 1].point?.role || (kind === 'return' && index === nodes.length - 2 ? 'return' : 'gateway');
      if (nodes[index + 1].point?.approximate) {
        segment.routeConfidence = 'estimated';
        segment.primaryPlan += ' De overnachtingsplaats is een transparant route-anker en wordt pas als echte plaats getoond wanneer providerdata die bevestigt.';
      }
      days.push(segment);
    }
  };

  const makeStayAtNode = (visit, visitIndex) => {
    const activity = (visit.visitHighlights || [visit]).find(item => {
      const text = String(item.activity || item.name || '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');
      return !usedActivityIds.has(item.id) && !usedActivityTexts.has(text);
    }) || null;
    if (activity) {
      usedActivityIds.add(activity.id);
      usedActivityTexts.add(String(activity.activity || activity.name || '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' '));
    }
    const routeNode = activity || visit;
    const geometry = activity ? localHighlightGeometry(routeNode) : [visit.overnightPoint];
    const distanceKm = geometry.length > 1 ? Math.max(8, Math.round((haversineKm(routeNode.overnightPoint, routeNode.point) || 4) * 2.25)) : 0;
    const speed = localSpeeds[transportId(groundTrip.transport)] || localSpeeds.car;
    const roadHours = Number((distanceKm / speed).toFixed(1));
    const timing = estimateLegTiming(groundTrip, { distanceKm, roadHours, arrival: false });
    const flex = !activity;
    return {
      kind: flex ? 'flex' : 'stay', typeLabel: labelFor(flex ? 'flex' : 'stay'), from: visit.baseName, to: visit.baseName, location: visit.baseName,
      fromPoint: { ...visit.overnightPoint, name: visit.baseName, role: 'overnight' }, toPoint: { ...visit.overnightPoint, name: visit.baseName, role: 'overnight' },
      overnight: visit.baseName, distanceKm, roadHours: timing.roadHours, driveHours: timing.elapsedHours, elapsedHours: timing.elapsedHours,
      breakHours: timing.breakHours, restStops: timing.restStops, fuelStops: timing.fuelStops, stopCount: timing.stopCount,
      waypoints: [], geometry, routeSource: geometry.length > 1 ? 'local-route-estimate' : 'local-base', routeConfidence: 'estimated',
      activityId: activity?.id || null, activityType: activity?.tags?.[0] || (flex ? 'rust' : 'cultuur'),
      primaryPlan: activity?.activity || `Herstel- en keuzedag ${visitIndex + 1} in ${visit.baseName}: houd ruimte voor rust en maximaal een korte, ter plaatse bevestigde activiteit.`,
      rainAlternative: activity?.rainAlternative || `Gebruik deze buffer als rustige binnen- of hersteldag in ${visit.baseName}.`
    };
  };

  const makeTransferToNode = (previous, node) => {
    const edge = graphEdge(groundTrip, previous, node, destination);
    return {
      kind: 'transfer', typeLabel: labelFor('transfer'), from: previous.baseName, to: node.baseName,
      location: node.baseName, fromPoint: { ...previous.overnightPoint, name: previous.baseName, role: 'overnight' },
      toPoint: { ...node.overnightPoint, name: node.baseName, role: node.returnGateway ? 'gateway' : 'overnight' }, overnight: node.baseName,
      distanceKm: edge.distanceKm, roadHours: edge.roadHours, driveHours: edge.elapsedHours, elapsedHours: edge.elapsedHours,
      breakHours: edge.timing.breakHours, restStops: edge.timing.restStops, fuelStops: edge.timing.fuelStops,
      stopCount: edge.timing.stopCount, waypoints: buildBreakWaypoints(previous.overnightPoint, node.overnightPoint, edge.timing, groundTrip.transport),
      geometry: [previous.overnightPoint, node.overnightPoint], routeSource: 'route-graph-estimate', routeConfidence: 'estimated',
      primaryPlan: `Verplaats de uitvalsbasis van ${previous.baseName} naar ${node.baseName}; houd de rest van deze reisdag bewust licht.`,
      rainAlternative: `Rijd rechtstreeks naar ${node.baseName} en schrap optionele omwegen bij slecht weer.`,
      exceedsDailyLimit: edge.elapsedHours > trip.maxDrive + .05
    };
  };

  appendAccessDays(
    'outward', origin, trip.origin,
    { ...gateway.overnightPoint, name: gateway.baseName, role: 'gateway' }, gateway.baseName,
    graphPlan.accessLegs?.outward || 1,
    accessSegments.filter(item => item.direction === 'outbound' || item.id === 'rental-pickup')
  );

  for (let routeIndex = 0; routeIndex < route.length; routeIndex += 1) {
    const visit = route[routeIndex];
    if (!visit.returnGateway) {
      const stayDays = Math.max(0, Number(graphPlan.stayAllocation?.[visit.id] ?? visit.stayDays ?? 0));
      for (let stayIndex = 0; stayIndex < stayDays; stayIndex += 1) days.push(makeStayAtNode(visit, stayIndex));
    }
    const next = route[routeIndex + 1];
    if (next) days.push(makeTransferToNode(visit, next));
  }

  const finalBase = route.at(-1) || gateway;
  appendAccessDays(
    'return', { ...finalBase.overnightPoint, name: finalBase.baseName, role: 'gateway' }, finalBase.baseName,
    { ...origin, role: 'return' }, trip.origin,
    graphPlan.accessLegs?.return || 1,
    accessSegments.filter(item => item.direction === 'return')
  );
  days.forEach((day, index) => { day.day = index + 1; day.date = addDays(trip.startDate, index); });
  applyDaySchedules(groundTrip, days);
  const recommendations = buildRecommendations(groundTrip, destination, days);
  const accommodationChanges = countAccommodationChanges(days, trip.origin);
  const excessiveDays = days.filter(day => day.exceedsDailyLimit);
  const integrityIssues = itineraryIntegrityIssues({ days }, trip);
  const warnings = excessiveDays.map(day => `Dag ${day.day} overschrijdt de limiet van ${trip.maxDrive} uur.`);
  const unresolvedTransitStops = days.filter(day => day.overnightRole === 'transit').length;
  if (unresolvedTransitStops) warnings.push(`${unresolvedTransitStops} transitovernachting(en) zijn nog indicatieve corridorankers; kies pas na live plaatsverrijking een echte genoemde plaats en accommodatie.`);
  warnings.push(...integrityIssues);
  if (graphPlan.omitted.length) warnings.push(`${graphPlan.omitted.length} highlight(s) bewust weggelaten; minimaal ${graphPlan.minimumAdditionalDays || 1} extra dag(en) kunnen de eerstvolgende optie mogelijk maken.`);
  const outward = days[0]; const inbound = days.at(-1);
  const oneWayDistanceKm = multimodal ? Number(destination.distanceKm || 0) : Math.round((Number(outward.distanceKm || 0) + Number(inbound.distanceKm || 0)) / 2);
  const requiredLegs = Math.max(1, days.filter(day => ['outward', 'transfer', 'return'].includes(day.kind)).length - 1);
  const routeMetrics = {
    origin, originKnown: validCoordinate(origin), destination: finalBase.overnightPoint,
    oneWayDistanceKm, oneWayRoadHours: Number(((Number(outward.roadHours || 0) + Number(inbound.roadHours || 0)) / 2).toFixed(1)),
    oneWayElapsedHours: Number(((Number(outward.elapsedHours || 0) + Number(inbound.elapsedHours || 0)) / 2).toFixed(1)),
    oneWayDriveHours: Number(((Number(outward.elapsedHours || 0) + Number(inbound.elapsedHours || 0)) / 2).toFixed(1)),
    breakHours: Number(((Number(outward.breakHours || 0) + Number(inbound.breakHours || 0)) / 2).toFixed(1)),
    requiredLegs, routeSource: 'dynamic-route-graph', exploration: { overlap: 0, explorationScore: 85, method: 'deterministic-beam-route-graph' }
  };
  const plan = {
    days, accessSegments, routeGraph: graphPlan, omittedHighlights: graphPlan.omitted, minimumAdditionalDays: graphPlan.minimumAdditionalDays,
    routeMetrics, requiredLegs, usedLegs: requiredLegs, minimumDays: 3,
    feasible: !excessiveDays.length && !integrityIssues.length && accommodationChanges <= trip.maxChanges,
    proposalCategory: destination.category || 'exact', warnings: [...new Set(warnings)],
    accommodationChanges, recommendations, unresolvedTransitStops, routing: { source: 'dynamic-route-graph', label: 'Chronologische dynamische dagroutegraph', live: false }, origin
  };
  plan.routeSegments = collectRouteSegments(plan);
  return plan;
}

function buildDynamicItinerary(trip, destination) {
  const graphPlan = planHighlightRoute(trip, destination);
  const route = graphPlan.route;
  const gateway = route[0];
  if (!gateway) return buildMultimodalItinerary(trip, destination);
  const groundTrip = { ...trip, transport: isMultimodal(trip) ? effectiveGroundVehicle(trip) : trip.transport };
  const origin = { ...(trip.originPoint || {}), name: trip.origin, role: 'origin' };
  const accessSegments = isMultimodal(trip) ? buildAccessSegments(trip, destination) : [];
  const days = [];
  const accessGeometry = validCoordinate(origin) && !isMultimodal(trip) ? [origin, gateway.overnightPoint] : [gateway.overnightPoint];
  days.push({
    kind: 'outward', typeLabel: isMultimodal(trip) ? 'Toegang + voertuig ophalen' : 'Heenreis',
    from: trip.origin, to: gateway.baseName, location: gateway.baseName, fromPoint: origin,
    toPoint: { ...gateway.overnightPoint, name: gateway.baseName, role: 'gateway' }, overnight: gateway.baseName,
    distanceKm: isMultimodal(trip) ? 25 : Math.max(1, Math.round((haversineKm(origin, gateway.overnightPoint) || destination.distanceKm || 1) * 1.16)),
    roadHours: isMultimodal(trip) ? 1.2 : Number(((haversineKm(origin, gateway.overnightPoint) || destination.distanceKm || 1) / 72).toFixed(1)),
    driveHours: isMultimodal(trip) ? 1.2 : Number(((haversineKm(origin, gateway.overnightPoint) || destination.distanceKm || 1) / 72).toFixed(1)),
    elapsedHours: isMultimodal(trip) ? 1.2 : Number(((haversineKm(origin, gateway.overnightPoint) || destination.distanceKm || 1) / 72).toFixed(1)),
    breakHours: 0, restStops: 0, fuelStops: 0, stopCount: 0, waypoints: [], geometry: accessGeometry,
    routeSource: isMultimodal(trip) ? 'multimodal-planning-estimate' : 'offline-corridor', transportSegments: accessSegments.filter(item => item.direction === 'outbound' || item.id === 'rental-pickup'),
    primaryPlan: `Bereik ${gateway.baseName}, rond de voertuigoverdracht af en houd een aankomstbuffer.`,
    rainAlternative: `Ga na aankomst rechtstreeks naar de eerste overnachtingsbasis in ${gateway.baseName}.`
  });
  const activities = chooseActivities(trip, destination);
  const makeStayAtNode = (node, visitIndex = 0) => {
    const geometry = localHighlightGeometry(node);
    const distanceKm = geometry.length > 1 ? Math.max(8, Math.round((haversineKm(node.overnightPoint, node.point) || 4) * 2.25)) : 0;
    const alternativeActivity = activities[(days.length + visitIndex) % Math.max(1, activities.length)];
    const primaryPlan = visitIndex === 0 || !alternativeActivity ? node.activity : alternativeActivity.title;
    const rainAlternative = visitIndex === 0 || !alternativeActivity ? node.rainAlternative : alternativeActivity.rainAlternative;
    return {
      kind: 'stay', typeLabel: labelFor('stay'), from: node.baseName, to: node.baseName, location: node.baseName,
      fromPoint: { ...node.overnightPoint, name: node.baseName, role: 'overnight' }, toPoint: { ...node.overnightPoint, name: node.baseName, role: 'overnight' },
      overnight: node.baseName, distanceKm, roadHours: Number((distanceKm / 45).toFixed(1)), driveHours: Number((distanceKm / 45).toFixed(1)),
      elapsedHours: Number((distanceKm / 45).toFixed(1)), breakHours: 0, restStops: 0, fuelStops: 0, stopCount: 0, waypoints: [],
      geometry, routeSource: geometry.length > 1 ? 'local-route-estimate' : 'local-base', activityType: node.tags[0] || 'cultuur',
      primaryPlan, rainAlternative
    };
  };
  const makeTransferToNode = (previous, node) => {
    const edge = graphEdge(groundTrip, previous, node, destination);
    const arrivalActivity = !node.returnGateway && edge.elapsedHours <= Math.max(1, trip.maxDrive - 1.5)
      ? ` Na aankomst: ${node.activity}` : '';
    return {
      kind: 'transfer', typeLabel: labelFor('transfer'), from: previous.baseName, to: node.baseName,
      location: node.baseName, fromPoint: { ...previous.overnightPoint, name: previous.baseName, role: 'overnight' },
      toPoint: { ...node.overnightPoint, name: node.baseName, role: node.returnGateway ? 'gateway' : 'overnight' }, overnight: node.baseName,
      distanceKm: edge.distanceKm, roadHours: edge.roadHours, driveHours: edge.elapsedHours, elapsedHours: edge.elapsedHours,
      breakHours: edge.timing.breakHours, restStops: edge.timing.restStops, fuelStops: edge.timing.fuelStops,
      stopCount: edge.timing.stopCount, waypoints: buildBreakWaypoints(previous.overnightPoint, node.overnightPoint, edge.timing, groundTrip.transport),
      geometry: [previous.overnightPoint, node.overnightPoint], routeSource: 'route-graph-estimate',
      primaryPlan: `Verplaats de uitvalsbasis van ${previous.baseName} naar ${node.baseName}. De graph solver koos deze etappe voor samenhang en beperkte terugweg.${arrivalActivity}`,
      rainAlternative: `Rijd rechtstreeks naar ${node.baseName} en schrap optionele omwegen bij slecht weer.`,
      exceedsDailyLimit: edge.elapsedHours > trip.maxDrive + .05
    };
  };

  const gatewayNights = Math.max(1, graphPlan.nightAllocation?.[gateway.id] || gateway.minimumNights || 1);
  for (let index = 1; index < gatewayNights && days.length < trip.days - 1; index += 1) days.push(makeStayAtNode(gateway, index - 1));

  let previous = gateway;
  for (const node of route.slice(1)) {
    if (days.length >= trip.days - 1) break;
    const sameBase = previous.baseName === node.baseName || (haversineKm(previous.overnightPoint, node.overnightPoint) ?? Infinity) < 2;
    days.push(sameBase && !node.returnGateway ? makeStayAtNode(node) : makeTransferToNode(previous, node));
    const allocatedNights = Math.max(1, graphPlan.nightAllocation?.[node.id] || node.minimumNights || 1);
    for (let index = 1; index < allocatedNights && days.length < trip.days - 1; index += 1) days.push(makeStayAtNode(node, index));
    previous = node;
  }
  const finalBase = route.at(-1) || gateway;
  days.push({
    kind: 'return', typeLabel: 'Terugverbinding', from: finalBase.baseName, to: trip.origin, location: trip.origin,
    fromPoint: { ...finalBase.overnightPoint, name: finalBase.baseName, role: 'gateway' }, toPoint: { ...origin, role: 'return' }, overnight: trip.origin,
    distanceKm: isMultimodal(trip) ? 25 : Math.max(1, Math.round((haversineKm(finalBase.overnightPoint, origin) || destination.distanceKm || 1) * 1.16)),
    roadHours: isMultimodal(trip) ? 1.2 : Number(((haversineKm(finalBase.overnightPoint, origin) || destination.distanceKm || 1) / 72).toFixed(1)),
    driveHours: isMultimodal(trip) ? 1.2 : Number(((haversineKm(finalBase.overnightPoint, origin) || destination.distanceKm || 1) / 72).toFixed(1)),
    elapsedHours: isMultimodal(trip) ? 1.2 : Number(((haversineKm(finalBase.overnightPoint, origin) || destination.distanceKm || 1) / 72).toFixed(1)),
    breakHours: 0, restStops: 0, fuelStops: 0, stopCount: 0, waypoints: [],
    geometry: validCoordinate(origin) && !isMultimodal(trip) ? [finalBase.overnightPoint, origin] : [finalBase.overnightPoint],
    routeSource: isMultimodal(trip) ? 'multimodal-planning-estimate' : 'offline-corridor', transportSegments: accessSegments.filter(item => item.direction === 'return'),
    primaryPlan: 'Keer terug via de gekozen gateway en houd marge voor voertuigteruggave of de laatste wegverbinding.',
    rainAlternative: 'Vergroot de vertrekmarge en schrap alle optionele stops.'
  });
  days.forEach((day, index) => { day.day = index + 1; day.date = addDays(trip.startDate, index); });
  applyDaySchedules(groundTrip, days);
  const recommendations = buildRecommendations(groundTrip, destination, days);
  const accommodationChanges = countAccommodationChanges(days, trip.origin);
  const excessiveDays = days.filter(day => day.exceedsDailyLimit);
  const warnings = excessiveDays.map(day => `Dag ${day.day} overschrijdt de limiet van ${trip.maxDrive} uur.`);
  if (graphPlan.omitted.length) warnings.push(`${graphPlan.omitted.length} highlight(s) bewust weggelaten; minimaal ${graphPlan.minimumAdditionalDays || 1} extra dag(en) kunnen de eerstvolgende optie mogelijk maken.`);
  return {
    days, accessSegments, routeGraph: graphPlan, omittedHighlights: graphPlan.omitted, minimumAdditionalDays: graphPlan.minimumAdditionalDays,
    routeMetrics: { origin, originKnown: validCoordinate(origin), destination: finalBase.overnightPoint, oneWayDistanceKm: destination.distanceKm, oneWayRoadHours: 0, oneWayElapsedHours: 0, oneWayDriveHours: 0, breakHours: 0, requiredLegs: Math.max(1, route.length - 1), routeSource: 'dynamic-route-graph', exploration: { overlap: 0, explorationScore: 85, method: 'constrained-route-graph' } },
    requiredLegs: Math.max(1, route.length - 1), usedLegs: Math.max(1, route.length - 1), minimumDays: 3,
    feasible: !excessiveDays.length && accommodationChanges <= trip.maxChanges, proposalCategory: destination.category || 'exact', warnings,
    accommodationChanges, recommendations, routing: { source: 'dynamic-route-graph', label: 'Dynamische dagroutegraph', live: false }, origin
  };
}

function buildMultimodalItinerary(trip, destination) {
  const accessSegments = buildAccessSegments(trip, destination);
  const base = destination.bases[0];
  const openJaw = trip.routeTopology === 'open-jaw' && destination.bases.length > 1;
  const finalBase = openJaw ? destination.bases.at(-1) : base;
  const origin = { ...(trip.originPoint || {}), name: trip.origin, role: 'origin' };
  const activities = chooseActivities(trip, destination);
  const days = [];
  const accessLabel = trip.travelMode.startsWith('fly-') ? 'Vlucht + voertuig ophalen' : 'Trein/ferry + aansluiting';
  days.push({
    kind: 'outward', typeLabel: accessLabel, from: trip.origin, to: base.name, location: base.name,
    fromPoint: origin, toPoint: { ...base, role: 'destination' }, overnight: base.name,
    distanceKm: 25, roadHours: 1.2, driveHours: 1.2, elapsedHours: 1.2, breakHours: 0,
    restStops: 0, fuelStops: 0, stopCount: 0, waypoints: [], geometry: validCoordinate(origin) ? [origin, base] : [base],
    routeSource: 'multimodal-planning-estimate', transportSegments: accessSegments.filter(item => item.direction === 'outbound' || item.id === 'rental-pickup'),
    primaryPlan: `${accessLabel}. Houd ruime marge voor bagage, immigratie, aansluiting en voertuiginspectie; tijden en boekbaarheid zijn nog niet live bevestigd.`,
    rainAlternative: 'Behoud extra aansluitingstijd en rijd na aankomst rechtstreeks naar de eerste uitvalsbasis.'
  });
  for (let index = 1; index < trip.days - 1; index += 1) {
    const switchIndex = Math.ceil((trip.days - 1) / 2);
    const switchDay = openJaw && index === switchIndex;
    const dayBase = openJaw && index >= switchIndex ? finalBase : base;
    const flexible = trip.days >= 6 && index === Math.floor(trip.days / 2);
    const activity = activities[(index - 1) % activities.length];
    if (switchDay) {
      const transfer = localTransfer(base, finalBase, { ...trip, transport: effectiveGroundVehicle(trip) });
      days.push({
        kind: 'transfer', typeLabel: labelFor('transfer'), from: base.name, to: finalBase.name, location: finalBase.name,
        fromPoint: { ...base, role: 'destination' }, toPoint: { ...finalBase, role: 'destination' }, overnight: finalBase.name,
        ...transfer,
        primaryPlan: `Open-jaw transfer van ${base.name} naar ${finalBase.name}. Plan alleen noodzakelijke stops en controleer de wegconditie en brandstofmarge.`,
        rainAlternative: 'Rijd rechtstreeks, houd extra marge en verplaats niet zonder bevestigde wegcondities.'
      });
      continue;
    }
    days.push({
      kind: flexible ? 'flex' : 'stay', typeLabel: labelFor(flexible ? 'flex' : 'stay'), from: dayBase.name, to: dayBase.name,
      location: dayBase.name, fromPoint: { ...dayBase, role: 'destination' }, toPoint: { ...dayBase, role: 'destination' }, overnight: dayBase.name,
      distanceKm: flexible ? 12 : 65, roadHours: flexible ? .3 : 1.5, driveHours: flexible ? .3 : 1.5, elapsedHours: flexible ? .3 : 1.5,
      breakHours: 0, restStops: 0, fuelStops: 0, stopCount: 0, waypoints: [], geometry: [{ ...dayBase }], routeSource: 'local-estimate',
      activityType: flexible ? 'rust' : activity.type,
      primaryPlan: flexible ? 'Hersteldag en logistieke buffer; geen verplichte activiteit.' : activity.title,
      rainAlternative: flexible ? 'Gebruik als volledige buffer of rustige binnenactiviteit dichtbij.' : activity.rainAlternative
    });
  }
  days.push({
    kind: 'return', typeLabel: 'Terugverbinding', from: finalBase.name, to: trip.origin, location: trip.origin,
    fromPoint: { ...finalBase, role: 'destination' }, toPoint: { ...origin, role: 'return' }, overnight: trip.origin,
    distanceKm: 25, roadHours: 1.2, driveHours: 1.2, elapsedHours: 1.2, breakHours: 0,
    restStops: 0, fuelStops: 0, stopCount: 0, waypoints: [], geometry: validCoordinate(origin) ? [finalBase, origin] : [finalBase],
    routeSource: 'multimodal-planning-estimate', transportSegments: accessSegments.filter(item => item.direction === 'return'),
    primaryPlan: 'Lever het huurvoertuig met brandstof- en schadebewijs in en houd ruime marge voor de terugverbinding. Controleer de echte tijden vóór boeken.',
    rainAlternative: 'Vergroot bij slecht weer de marge tussen voertuigteruggave en vertrek.'
  });
  days.forEach((day, index) => { day.day = index + 1; day.date = addDays(trip.startDate, index); });
  applyDaySchedules(trip, days);
  for (const day of days.filter(item => item.routeSource === 'multimodal-planning-estimate')) {
    day.schedule = { activityWindow: 'Verbindingstijden niet bevestigd' };
  }
  const recommendations = buildRecommendations({ ...trip, transport: effectiveGroundVehicle(trip) }, destination, days);
  const accommodationChanges = countAccommodationChanges(days, trip.origin);
  return {
    days,
    accessSegments,
    routeMetrics: { origin, originKnown: validCoordinate(origin), destination: finalBase, oneWayDistanceKm: accessSegments[0]?.distanceKm || destination.distanceKm, oneWayRoadHours: 1.2, oneWayElapsedHours: accessSegments[0]?.durationHours || 0, oneWayDriveHours: 1.2, breakHours: 0, requiredLegs: 1, routeSource: 'multimodal-planning-estimate', exploration: { overlap: 0, explorationScore: openJaw ? 95 : 80, method: openJaw ? 'open-jaw' : 'multimodal-local-loop' } },
    requiredLegs: 1, usedLegs: 1, minimumDays: 3, feasible: !days.some(day => day.exceedsDailyLimit) && accommodationChanges <= trip.maxChanges, proposalCategory: destination.category || 'exact', warnings: ['Internationale verbindingen, tarieven, bagage en huurvoorwaarden zijn indicatief totdat je ze bij de aanbieder bevestigt.'], accommodationChanges, recommendations,
    routing: { source: 'multimodal-planning-estimate', label: 'Multi-modale logistiek + lokale route', live: false }, origin
  };
}

export function countAccommodationChanges(days, origin) {
  const overnights = days.map(day => day.overnight).filter(name => name && name !== origin);
  return overnights.reduce((count, name, index) => count + (index > 0 && name !== overnights[index - 1] ? 1 : 0), 0);
}

export function itineraryIntegrityIssues(plan, trip) {
  const days = plan?.days || [];
  const issues = [];
  if (days.length !== Number(trip.days)) issues.push(`Het chronologische plan bevat ${days.length} in plaats van ${trip.days} dagen.`);
  if (days[0]?.from !== trip.origin) issues.push(`Dag 1 vertrekt niet vanuit ${trip.origin}.`);
  if (days.at(-1)?.to !== trip.origin) issues.push(`De laatste dag keert niet terug naar ${trip.origin}.`);
  for (let index = 1; index < days.length; index += 1) {
    if (days[index].from !== days[index - 1].overnight) issues.push(`Dag ${index + 1} start niet bij de overnachtingsplaats van dag ${index}.`);
  }
  for (const day of days.filter(item => ['outward', 'transfer', 'return'].includes(item.kind))) {
    const points = (day.geometry || []).filter(validCoordinate);
    const fallbackAvailable = validCoordinate(day.fromPoint) && validCoordinate(day.toPoint);
    if (points.length < 2 && !fallbackAvailable) issues.push(`Dag ${day.day || '?'} mist routeerbare begin- of eindcoordinaten.`);
  }
  const activityIds = days.map(day => day.activityId).filter(Boolean);
  if (new Set(activityIds).size !== activityIds.length) issues.push('Een highlight is op meerdere verblijfsdagen herhaald.');
  const activityTexts = days.filter(day => ['stay', 'flex'].includes(day.kind)).map(day => String(day.primaryPlan || '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ')).filter(Boolean);
  if (new Set(activityTexts).size !== activityTexts.length) issues.push('Dezelfde activiteitstekst is op meerdere verblijfsdagen herhaald.');
  return issues;
}

export function collectRoutePoints(plan, { daily = false } = {}) {
  const points = [];
  const origin = plan.routeMetrics?.origin;
  if (validCoordinate(origin)) points.push({ ...origin, name: plan.origin?.name || origin.name, role: 'origin' });
  for (const day of plan.days || []) {
    if (!validCoordinate(day.toPoint)) continue;
    const point = { ...day.toPoint, name: day.to, role: day.kind === 'return' && day.day === plan.days.length ? 'return' : day.toPoint.role, day: day.day, date: day.date };
    if (daily || !points.length || points.at(-1).lat !== point.lat || points.at(-1).lon !== point.lon) points.push(point);
  }
  return points;
}

export function collectRouteSegments(plan) {
  return (plan?.days || []).map(day => {
    let points = Array.isArray(day.geometry) ? day.geometry.filter(validCoordinate).map(point => ({ ...point })) : [];
    const travel = ['outward', 'transfer', 'return'].includes(day.kind);
    if (travel && points.length < 2 && validCoordinate(day.fromPoint) && validCoordinate(day.toPoint)) points = [{ ...day.fromPoint }, { ...day.toPoint }];
    return {
      day: day.day,
      date: day.date,
      kind: day.kind,
      from: day.from,
      to: day.to,
      mode: day.transportSegments?.[0]?.mode || 'road',
      source: day.routeSource || plan.routing?.source || 'offline-corridor',
      confidence: day.routeConfidence || (plan.routing?.live ? 'live' : 'estimated'),
      points
    };
  }).filter(segment => segment.points.length > 1);
}

export function collectRouteGeometry(plan) {
  const points = [];
  for (const segment of collectRouteSegments(plan)) {
    for (const point of segment.points) {
      if (!points.length || points.at(-1).lat !== point.lat || points.at(-1).lon !== point.lon) points.push(point);
    }
  }
  return points;
}

export function collectPlanWaypoints(plan) {
  const points = collectRoutePoints(plan, { daily: true });
  for (const day of plan?.days || []) {
    for (const waypoint of day.waypoints || []) {
      if (validCoordinate(waypoint)) points.push({ ...waypoint, day: day.day, date: day.date });
    }
    for (const item of day.recommendations || []) {
      if (!item.genericFallback && validCoordinate(item.point)) {
        points.push({ ...item.point, name: item.name, role: item.type, day: day.day, date: day.date, providerId: item.providerId || null });
      }
    }
  }
  return points;
}
