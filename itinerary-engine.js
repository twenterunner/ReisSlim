import { validCoordinate } from './config.js';
import { buildBreakWaypoints, buildTravelNodes, haversineKm, segmentMetrics } from './route-engine.js';
import { buildRecommendations } from './recommendation-engine.js';
import { estimateLegTiming, transportId, travelGuidance } from './vehicle-intelligence.js';

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
  const requestedTravelDays = Math.max(1, Math.floor((trip.days - 1) / 2));
  const firstPass = buildTravelNodes(trip, destination, 1);
  const requiredLegs = firstPass.metrics.requiredLegs;
  const usedLegs = Math.min(requiredLegs, requestedTravelDays);
  const { metrics, outbound, inbound } = buildTravelNodes(trip, destination, usedLegs);
  const days = [];

  for (let index = 0; index < outbound.length - 1; index += 1) {
    days.push(makeTravelDay('outward', outbound[index], outbound[index + 1], metrics, trip, usedLegs));
  }

  const stayCount = trip.days - usedLegs * 2;
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
  const recommendations = buildRecommendations(trip, destination, days);

  const minimumDays = requiredLegs * 2 + 1;
  const excessiveDays = days.filter(day => day.exceedsDailyLimit);
  const warnings = [];
  if (minimumDays > trip.days) warnings.push(`Deze bestemming vraagt minimaal ${minimumDays} dagen om onder ${trip.maxDrive} uur rijden per dag te blijven. De huidige ${trip.days}-daagse planning markeert de te lange rijdagen.`);
  if (metrics.warning) warnings.push(metrics.warning);
  if (excessiveDays.length) warnings.push(`${excessiveDays.length} rijdag${excessiveDays.length === 1 ? '' : 'en'} overschrijdt de ingestelde daglimiet.`);
  const accommodationChanges = countAccommodationChanges(days, trip.origin);
  if (accommodationChanges > trip.maxChanges) warnings.push(`De route vraagt circa ${accommodationChanges} accommodatiewissels; jouw voorkeur is maximaal ${trip.maxChanges}.`);

  return {
    days, routeMetrics: metrics, requiredLegs, usedLegs, minimumDays,
    feasible: minimumDays <= trip.days && excessiveDays.length === 0,
    warnings, accommodationChanges, recommendations,
    routing: { source: 'offline-corridor', label: 'Offline corridorraming', live: false },
    origin: { name: trip.origin, ...(metrics.origin || {}) }
  };
}

export function countAccommodationChanges(days, origin) {
  const overnights = days.map(day => day.overnight).filter(name => name && name !== origin);
  return overnights.reduce((count, name, index) => count + (index > 0 && name !== overnights[index - 1] ? 1 : 0), 0);
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
  return (plan?.days || []).filter(day => Array.isArray(day.geometry) && day.geometry.filter(validCoordinate).length > 1)
    .map(day => ({
      day: day.day,
      kind: day.kind,
      source: day.routeSource || plan.routing?.source || 'offline-corridor',
      points: day.geometry.filter(validCoordinate).map(point => ({ ...point }))
    }));
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
      if (validCoordinate(item.point)) points.push({ ...item.point, name: item.name, role: item.type, day: day.day, date: day.date });
    }
  }
  return points;
}
