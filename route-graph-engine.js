import { validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { estimateLegTiming, transportId } from './vehicle-intelligence.js';

const SPEED_KMH = { car: 82, motorcycle: 72, motorhome: 64, caravan: 59 };

const point = value => validCoordinate(value) ? { lat: Number(value.lat), lon: Number(value.lon) } : null;

export function normalizeHighlightGraph(destination) {
  const supplied = (destination.highlights || []).map((item, index) => ({
    id: item.id || `highlight-${index + 1}`,
    name: item.name,
    baseName: item.baseName || item.name,
    point: point(item.point || item),
    overnightPoint: point(item.overnightPoint || item.point || item),
    sequence: Number.isFinite(item.sequence) ? item.sequence : index + 1,
    priority: Math.max(1, Math.min(10, Number(item.priority) || 6)),
    minimumTripDays: Math.max(3, Number(item.minimumTripDays) || 3),
    minimumNights: Math.max(1, Number(item.minimumNights) || 1),
    tags: [...new Set(item.tags || [])],
    activity: item.activity || `Verken ${item.name} met voldoende tijd voor lokale omstandigheden.`,
    rainAlternative: item.rainAlternative || `Kies een beschutte activiteit of rustmoment nabij ${item.baseName || item.name}.`,
    evidence: item.evidence || 'Bestemmingskennis; route en toegang blijven te bevestigen.',
    gateway: Boolean(item.gateway),
    remote: Boolean(item.remote),
    contextOnly: Boolean(item.contextOnly),
    distanceFromRegionKm: Number(item.distanceFromRegionKm) || 0
  })).filter(item => item.name && item.point && item.overnightPoint);
  if (supplied.length) {
    const representedBases = base => supplied.some(item => item.baseName === base.name || (haversineKm(item.overnightPoint, base) || Infinity) < 2);
    const baseNodes = (destination.bases || []).filter(base => point(base) && !representedBases(base)).map((base, index) => ({
      id: `discovered-base-${index + 1}`,
      name: base.name,
      baseName: base.name,
      point: point(base),
      overnightPoint: point(base),
      sequence: supplied.length + index + 1,
      priority: Math.max(5, 7 - index),
      minimumTripDays: 4 + index * 2,
      minimumNights: 2,
      tags: destination.tags || [],
      activity: destination.activities?.[index % Math.max(1, destination.activities.length)]?.title || `Verken ${base.name} als aanvullende uitvalsbasis.`,
      rainAlternative: destination.activities?.[index % Math.max(1, destination.activities.length)]?.rainAlternative || `Kies een beschutte activiteit nabij ${base.name}.`,
      evidence: 'Dynamisch ontdekte uitvalsbasis met providercoördinaten.',
      gateway: false,
      remote: Boolean(destination.remoteReadinessRequired),
      contextOnly: false,
      distanceFromRegionKm: 0
    }));
    return [...supplied, ...baseNodes].sort((a, b) => a.sequence - b.sequence || b.priority - a.priority);
  }
  return (destination.bases || []).map((base, index) => ({
    id: `base-${index + 1}`,
    name: base.name,
    baseName: base.name,
    point: point(base),
    overnightPoint: point(base),
    sequence: index + 1,
    priority: Math.max(5, 8 - index),
    minimumTripDays: 3,
    minimumNights: index ? 2 : 1,
    tags: destination.tags || [],
    activity: destination.activities?.[index % Math.max(1, destination.activities.length)]?.title || `Verken ${base.name}.`,
    rainAlternative: destination.activities?.[index % Math.max(1, destination.activities.length)]?.rainAlternative || `Kies een binnenactiviteit in ${base.name}.`,
    evidence: 'Geankerde uitvalsbasis uit het bestemmingsprofiel.',
    gateway: index === 0,
    remote: Boolean(destination.remoteReadinessRequired)
  })).filter(item => item.point);
}

export function graphEdge(trip, from, to, destination = {}) {
  const directKm = haversineKm(from.overnightPoint, to.overnightPoint) || 0;
  const distanceKm = Math.max(1, Math.round(directKm * (destination.roadDistanceFactor || 1.16)));
  const speed = SPEED_KMH[transportId(trip.transport)] || SPEED_KMH.car;
  const roadHours = Number((distanceKm / speed).toFixed(1));
  const timing = estimateLegTiming(trip, { distanceKm, roadHours, arrival: true });
  return { from: from.id, to: to.id, distanceKm, roadHours, elapsedHours: timing.elapsedHours, timing };
}

function routeCost(trip, destination, route) {
  return route.slice(1).reduce((sum, node, index) => sum + graphEdge(trip, route[index], node, destination).elapsedHours, 0);
}

function sameOvernightBase(left, right) {
  if (!left || !right) return false;
  if (left.baseName && right.baseName && left.baseName === right.baseName) return true;
  return (haversineKm(left.overnightPoint, right.overnightPoint) || Infinity) < 2;
}

function requiredNights(route, gateway) {
  return route.reduce((sum, item) => sum + item.minimumNights, 0) + (sameOvernightBase(route.at(-1), gateway) ? 0 : 1);
}

function accommodationChanges(route, gateway) {
  let changes = 0;
  for (let index = 1; index < route.length; index += 1) if (!sameOvernightBase(route[index - 1], route[index])) changes += 1;
  if (route.length && !sameOvernightBase(route.at(-1), gateway)) changes += 1;
  return changes;
}

export function planHighlightRoute(trip, destination) {
  const graph = normalizeHighlightGraph(destination);
  const gateway = graph.find(item => item.gateway) || graph[0];
  if (!gateway) return { graph: [], selected: [], route: [], omitted: [], minimumAdditionalDays: 0, evidence: [] };
  const speed = SPEED_KMH[transportId(trip.transport)] || SPEED_KMH.car;
  const candidates = graph.filter(item => item.id !== gateway.id).map(item => {
    if (trip.days > 5 || item.remote || sameOvernightBase(gateway, item)) return item;
    const directKm = haversineKm(gateway.overnightPoint, item.point) || Infinity;
    const distanceKm = Math.round(directKm * 2.25);
    const timing = estimateLegTiming(trip, { distanceKm, roadHours: Number((distanceKm / speed).toFixed(1)), arrival: false });
    return timing.elapsedHours <= trip.maxDrive
      ? { ...item, baseName: gateway.baseName, overnightPoint: gateway.overnightPoint, dayTripFrom: item.baseName }
      : item;
  });
  const eligible = candidates.filter(item => !item.contextOnly && item.minimumTripDays <= trip.days);
  const tooLong = candidates.filter(item => item.minimumTripDays > trip.days);
  const maximumChanges = Math.max(0, Number(trip.maxChanges) || 0);
  const ranked = eligible.slice().sort((a, b) => b.priority - a.priority || a.minimumNights - b.minimumNights || a.sequence - b.sequence);
  const selected = [];
  for (const candidate of ranked) {
    const trial = [gateway, ...selected, candidate].sort((a, b) => a.sequence - b.sequence);
    if (accommodationChanges(trial, gateway) > maximumChanges) continue;
    if (requiredNights(trial, gateway) > trip.days - 1) continue;
    selected.push(candidate);
  }
  selected.sort((a, b) => a.sequence - b.sequence);
  let route = [gateway, ...selected];
  if (!sameOvernightBase(route.at(-1), gateway)) route.push({ ...gateway, id: `${gateway.id}-return`, returnGateway: true, sequence: Number.MAX_SAFE_INTEGER, minimumNights: 1 });
  const hasExcessiveEdge = candidateRoute => candidateRoute.slice(1).some((node, index) => graphEdge(trip, candidateRoute[index], node, destination).elapsedHours > trip.maxDrive + .05);
  while (route.length > 2 && (requiredNights(route, gateway) > trip.days - 1 || accommodationChanges(route, gateway) > maximumChanges || routeCost(trip, destination, route) > trip.maxDrive * Math.max(1, route.length - 1) || hasExcessiveEdge(route))) {
    const burden = node => {
      const index = route.indexOf(node);
      return graphEdge(trip, route[index - 1], node, destination).elapsedHours
        + graphEdge(trip, node, route[index + 1], destination).elapsedHours;
    };
    const removable = route.slice(1, -1).sort((a, b) => a.priority - b.priority || burden(b) - burden(a) || b.minimumNights - a.minimumNights)[0];
    route = route.filter(item => item !== removable);
    const index = selected.findIndex(item => item.id === removable.id);
    if (index >= 0) selected.splice(index, 1);
  }
  const selectedIds = new Set(selected.map(item => item.id));
  const omitted = candidates.filter(item => !selectedIds.has(item.id)).map(item => ({
    ...item,
    reason: item.contextOnly
      ? `${item.name} ligt circa ${item.distanceFromRegionKm} km buiten deze regionale route en is daarom niet geforceerd.`
      : item.minimumTripDays > trip.days
        ? `${item.name} vraagt een reis van minimaal ${item.minimumTripDays} dagen binnen deze routeopbouw.`
        : `Niet opgenomen omdat de beschikbare dagen of maximaal ${trip.maxChanges} accommodatiewissels sterker passende highlights begrenzen.`
  }));
  const minimumAdditionalDays = omitted.length ? Math.max(0, Math.min(...omitted.map(item => item.minimumTripDays)) - trip.days) : 0;
  const usedNights = route.reduce((sum, item) => sum + item.minimumNights, 0);
  let spareNights = Math.max(0, (trip.days - 1) - usedNights);
  const nightAllocation = Object.fromEntries(route.map(item => [item.id, item.minimumNights]));
  const allocationOrder = route.filter(item => !item.returnGateway).sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
  for (let index = 0; spareNights > 0 && allocationOrder.length; index += 1, spareNights -= 1) {
    const node = allocationOrder[index % allocationOrder.length];
    nightAllocation[node.id] += 1;
  }
  return {
    graph,
    selected,
    route,
    omitted,
    nightAllocation,
    minimumAdditionalDays,
    evidence: [
      `${selected.length} highlights gekozen uit ${candidates.length} kandidaten`,
      `${route.length - 1} route-edges binnen ${trip.days} dagen`,
      `${omitted.length} highlights bewust weggelaten door duur- of wisselgrenzen`
    ]
  };
}

export function localHighlightGeometry(node) {
  if (!node?.point || !node?.overnightPoint) return [];
  if (haversineKm(node.point, node.overnightPoint) < 2) return [node.overnightPoint];
  return [node.overnightPoint, node.point, node.overnightPoint];
}
