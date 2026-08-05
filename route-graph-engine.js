import { validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { resolveOrigin } from './trip-model.js';
import { estimateLegTiming, minimumTravelLegs, transportId } from './vehicle-intelligence.js';

const SPEED_KMH = { car: 82, motorcycle: 72, motorhome: 64, caravan: 59 };
const BEAM_WIDTH = 36;
const MAX_BASES = 6;

const point = value => validCoordinate(value) ? { lat: Number(value.lat), lon: Number(value.lon) } : null;
const normalizedText = value => String(value || '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');

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
    evidence: item.evidence || 'Providerbewijs; route en toegang blijven te bevestigen.',
    gateway: Boolean(item.gateway),
    remote: Boolean(item.remote),
    contextOnly: Boolean(item.contextOnly),
    distanceFromRegionKm: Number(item.distanceFromRegionKm) || 0,
    roadEvidence: item.roadEvidence || null
  })).filter(item => item.name && item.point && item.overnightPoint);
  if (supplied.length) {
    const representedBases = base => supplied.some(item => item.baseName === base.name || (haversineKm(item.overnightPoint, base) ?? Infinity) < 2);
    const baseNodes = (destination.bases || []).filter(base => point(base) && !representedBases(base)).map((base, index) => ({
      id: `discovered-base-${index + 1}`,
      name: base.name,
      baseName: base.name,
      point: point(base),
      overnightPoint: point(base),
      sequence: supplied.length + index + 1,
      priority: Math.max(5, 7 - index),
      minimumTripDays: 4 + index * 2,
      minimumNights: 1,
      tags: destination.tags || [],
      activity: destination.activities?.[index % Math.max(1, destination.activities.length)]?.title || `Verken ${base.name} als aanvullende uitvalsbasis.`,
      rainAlternative: destination.activities?.[index % Math.max(1, destination.activities.length)]?.rainAlternative || `Kies een beschutte activiteit nabij ${base.name}.`,
      evidence: 'Dynamisch ontdekte uitvalsbasis met providercoordinaten.',
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
    minimumNights: 1,
    tags: destination.tags || [],
    activity: destination.activities?.[index % Math.max(1, destination.activities.length)]?.title || `Verken ${base.name}.`,
    rainAlternative: destination.activities?.[index % Math.max(1, destination.activities.length)]?.rainAlternative || `Kies een binnenactiviteit in ${base.name}.`,
    evidence: 'Geankerde uitvalsbasis uit het bestemmingsprofiel.',
    gateway: index === 0,
    remote: Boolean(destination.remoteReadinessRequired),
    contextOnly: false,
    distanceFromRegionKm: 0
  })).filter(item => item.point);
}

export function graphEdge(trip, from, to, destination = {}) {
  const directKm = haversineKm(from.overnightPoint, to.overnightPoint) || 0;
  const distanceKm = Math.max(1, Math.round(directKm * (destination.roadDistanceFactor || 1.16)));
  const speed = SPEED_KMH[transportId(trip.transport)] || SPEED_KMH.car;
  const roadHours = Number((distanceKm / speed).toFixed(1));
  const timing = estimateLegTiming(trip, { distanceKm, roadHours, arrival: true });
  const evidence = [from.roadEvidence, to.roadEvidence].filter(Boolean);
  const scenicValue = Math.min(10, evidence.reduce((sum, item) => sum + (item.scenic ? 5 : 0) + (item.routeRelation ? 2 : 0), 0));
  const uncertainSurface = evidence.some(item => !item.surface) && evidence.length > 0;
  const unsuitableSurface = evidence.some(item => ['unpaved', 'gravel', 'ground', 'sand'].includes(String(item.surface || '').toLowerCase()));
  const vehicle = transportId(trip.transport);
  const vehicleCompatible = !(evidence.some(item => item.motorcycleAccess === 'no') && vehicle === 'motorcycle')
    && !(unsuitableSurface && ['motorhome', 'caravan'].includes(vehicle));
  return {
    from: from.id, to: to.id, distanceKm, roadHours, elapsedHours: timing.elapsedHours, timing,
    corridorIdentity: [String(from.baseName || from.id), String(to.baseName || to.id)].sort().join('>'),
    scenicValue, surfaceEvidence: evidence.map(item => item.surface).filter(Boolean),
    roadClassEvidence: evidence.map(item => item.roadClass).filter(Boolean), vehicleCompatible,
    uncertainty: evidence.length ? (uncertainSurface ? 'partial-road-evidence' : 'provider-road-evidence') : 'estimated-corridor',
    serviceEvidence: Number(destination.evidence?.services || 0), tollEvidence: null, ferryEvidence: null
  };
}

function sameOvernightBase(left, right) {
  if (!left || !right) return false;
  if (left.baseName && right.baseName && normalizedText(left.baseName) === normalizedText(right.baseName)) return true;
  return (haversineKm(left.overnightPoint, right.overnightPoint) ?? Infinity) < 2;
}

function uniqueActivities(nodes) {
  const seenIds = new Set();
  const seenText = new Set();
  return nodes.filter(node => {
    const text = normalizedText(node.activity || node.name);
    if (seenIds.has(node.id) || (text && seenText.has(text))) return false;
    seenIds.add(node.id);
    if (text) seenText.add(text);
    return true;
  });
}

function groupByOvernightBase(graph, gateway) {
  const groups = [];
  for (const node of graph.filter(item => !item.contextOnly)) {
    let group = groups.find(item => sameOvernightBase(item.representative, node));
    if (!group) {
      group = { id: `visit-${node.id}`, representative: node, nodes: [] };
      groups.push(group);
    }
    group.nodes.push(node);
    if (node.gateway || node.priority > group.representative.priority) group.representative = node;
  }
  for (const group of groups) {
    const gatewayGroup = group.nodes.some(node => node.id === gateway.id);
    if (gatewayGroup) group.representative = gateway;
    group.gateway = gatewayGroup;
    group.baseName = group.representative.baseName;
    group.overnightPoint = group.representative.overnightPoint;
    group.tags = [...new Set(group.nodes.flatMap(node => node.tags))];
    group.remote = group.nodes.some(node => node.remote);
    group.priority = Math.max(...group.nodes.map(node => node.priority));
    const ordered = group.nodes.slice().sort((a, b) => Number(b.id !== gateway.id) - Number(a.id !== gateway.id) || b.priority - a.priority || a.sequence - b.sequence);
    group.activities = uniqueActivities(ordered);
  }
  return groups.sort((a, b) => Number(b.gateway) - Number(a.gateway) || b.priority - a.priority || a.baseName.localeCompare(b.baseName, 'nl'));
}

export function vehicleSuitabilityScore(group, trip) {
  const tags = new Set(group.tags || []);
  const vehicle = transportId(trip.transport);
  if (vehicle === 'motorcycle') return (tags.has('motor') ? 7 : 0) + (tags.has('bergen') ? 3 : 0) + (tags.has('natuur') ? 1 : 0) - (group.remote ? 2 : 0);
  if (vehicle === 'motorhome') return (tags.has('camper') ? 7 : 0) - (group.remote ? 4 : 0);
  if (vehicle === 'caravan') return (tags.has('camper') ? 5 : 0) - (group.remote ? 6 : 0);
  return (tags.has('kinderen') && Number(trip.children) > 0 ? 2 : 0) - (group.remote ? 1 : 0);
}

function preferenceScore(group, trip) {
  return (group.tags || []).reduce((sum, tag) => sum + (trip.preferences?.includes(tag) ? Number(trip.preferenceWeights?.[tag] || 2) : 0), 0);
}

function groupValue(group, trip) {
  const secondaryEvidence = group.nodes.slice().sort((a, b) => b.priority - a.priority).slice(1, 4).reduce((sum, node) => sum + node.priority * .28, 0);
  return group.priority * 1.7 + secondaryEvidence + preferenceScore(group, trip) * 2 + vehicleSuitabilityScore(group, trip);
}

function shouldReturnToGateway(trip, path) {
  if (path.length < 2 || trip.routeTopology === 'open-jaw') return false;
  return trip.travelMode !== 'direct' || trip.routeTopology === 'out-and-back';
}

function accessLegsBetween(trip, destination, fromPoint, toPoint) {
  if (trip.travelMode !== 'direct') return 1;
  if (!validCoordinate(fromPoint) || !validCoordinate(toPoint)) return 1;
  const edge = graphEdge(trip, { id: 'access-from', overnightPoint: fromPoint }, { id: 'access-to', overnightPoint: toPoint }, destination);
  return minimumTravelLegs(trip, edge.distanceKm, edge.roadHours);
}

function accessLegsForPath(trip, destination, path, gatewayGroup) {
  if (trip.travelMode !== 'direct') return { outward: 1, return: 1 };
  const origin = resolveOrigin(trip);
  if (!origin) return { outward: 1, return: 1 };
  return {
    outward: accessLegsBetween(trip, destination, origin, gatewayGroup.overnightPoint),
    return: accessLegsBetween(trip, destination, path.at(-1)?.overnightPoint || gatewayGroup.overnightPoint, origin)
  };
}

function closingEdge(trip, destination, path, gatewayGroup) {
  const last = path.at(-1);
  if (!last) return null;
  if (shouldReturnToGateway(trip, path)) return graphEdge(trip, last.representative, gatewayGroup.representative, destination);
  if (trip.travelMode === 'direct') {
    const origin = resolveOrigin(trip);
    if (origin) return graphEdge(trip, last.representative, { id: 'trip-origin', overnightPoint: origin }, destination);
  }
  return null;
}

function internalTransitionCount(trip, path) {
  return Math.max(0, path.length - 1) + (shouldReturnToGateway(trip, path) ? 1 : 0);
}

function routeWithinConstraints(trip, destination, path, gatewayGroup) {
  const internalTransitions = internalTransitionCount(trip, path);
  const accessLegs = accessLegsForPath(trip, destination, path, gatewayGroup);
  const accessChanges = trip.travelMode === 'direct' ? Math.max(0, accessLegs.outward - 1) + Math.max(0, accessLegs.return - 1) : 0;
  const changes = internalTransitions + accessChanges;
  const minimumDays = accessLegs.outward + accessLegs.return + internalTransitions + path.length;
  if (changes > Math.max(0, Number(trip.maxChanges) || 0)) return false;
  if (minimumDays > Number(trip.days)) return false;
  for (let index = 1; index < path.length; index += 1) {
    if (graphEdge(trip, path[index - 1].representative, path[index].representative, destination).elapsedHours > trip.maxDrive + .05) return false;
  }
  if (shouldReturnToGateway(trip, path)) {
    const edge = graphEdge(trip, path.at(-1).representative, gatewayGroup.representative, destination);
    if (edge.elapsedHours > trip.maxDrive + .05) return false;
  }
  return true;
}

function beamSearchBases(trip, destination, groups, gatewayGroup) {
  const targetBaseCount = Math.max(1, Math.min(groups.length, MAX_BASES, Math.ceil(Number(trip.days) / 4)));
  const candidates = groups.filter(group => !group.gateway && group.nodes.some(node => node.minimumTripDays <= trip.days));
  let beam = [{ path: [gatewayGroup], used: new Set([gatewayGroup.id]), score: groupValue(gatewayGroup, trip), distanceKm: 0 }];
  const completed = [];

  for (let depth = 1; depth <= targetBaseCount; depth += 1) {
    const next = [];
    for (const state of beam) {
      if (routeWithinConstraints(trip, destination, state.path, gatewayGroup)) completed.push(state);
      if (state.path.length >= targetBaseCount) continue;
      for (const candidate of candidates) {
        if (state.used.has(candidate.id)) continue;
        const previous = state.path.at(-1);
        const edge = graphEdge(trip, previous.representative, candidate.representative, destination);
        if (edge.elapsedHours > trip.maxDrive + .05) continue;
        if (!edge.vehicleCompatible) continue;
        const path = [...state.path, candidate];
        if (!routeWithinConstraints(trip, destination, path, gatewayGroup)) continue;
        const used = new Set(state.used); used.add(candidate.id);
        next.push({
          path,
          used,
          distanceKm: state.distanceKm + edge.distanceKm,
          score: state.score + groupValue(candidate, trip) + 9
            + (trip.routeStyle === 'scenic' || transportId(trip.transport) === 'motorcycle' ? edge.scenicValue * 1.2 : 0)
            + Math.min(3, edge.serviceEvidence * .3)
            - (edge.uncertainty === 'estimated-corridor' ? 2 : 0)
            - edge.elapsedHours * 1.35 - edge.distanceKm / 260
        });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.path.length - a.path.length || b.score - a.score || a.distanceKm - b.distanceKm || a.path.map(item => item.id).join('|').localeCompare(b.path.map(item => item.id).join('|')));
    beam = next.slice(0, BEAM_WIDTH);
  }
  for (const state of beam) if (routeWithinConstraints(trip, destination, state.path, gatewayGroup)) completed.push(state);
  if (!completed.length) return { path: [gatewayGroup], targetBaseCount };
  completed.sort((a, b) => {
    const lengthDifference = Math.min(targetBaseCount, b.path.length) - Math.min(targetBaseCount, a.path.length);
    if (lengthDifference) return lengthDifference;
    const aClosing = closingEdge(trip, destination, a.path, gatewayGroup);
    const bClosing = closingEdge(trip, destination, b.path, gatewayGroup);
    const aScore = a.score - Number(aClosing?.elapsedHours || 0) * 1.2;
    const bScore = b.score - Number(bClosing?.elapsedHours || 0) * 1.2;
    return bScore - aScore || a.distanceKm - b.distanceKm || a.path.map(item => item.id).join('|').localeCompare(b.path.map(item => item.id).join('|'));
  });
  return { ...completed[0], targetBaseCount };
}

function allocateStayDays(trip, destination, basePath, gatewayGroup) {
  const transitions = internalTransitionCount(trip, basePath);
  const accessLegs = accessLegsForPath(trip, destination, basePath, gatewayGroup);
  const available = Math.max(basePath.length, Number(trip.days) - accessLegs.outward - accessLegs.return - transitions);
  const allocation = Object.fromEntries(basePath.map(group => [group.id, 1]));
  let remaining = available - basePath.length;
  while (remaining > 0) {
    const candidate = basePath.slice().sort((a, b) => {
      const aUnseen = Math.max(0, a.activities.length - allocation[a.id]);
      const bUnseen = Math.max(0, b.activities.length - allocation[b.id]);
      const aValue = aUnseen * 20 + a.priority * 2 + a.nodes.length - allocation[a.id] * 3;
      const bValue = bUnseen * 20 + b.priority * 2 + b.nodes.length - allocation[b.id] * 3;
      return bValue - aValue || a.baseName.localeCompare(b.baseName, 'nl');
    })[0];
    allocation[candidate.id] += 1;
    remaining -= 1;
  }
  return { allocation, accessLegs };
}

function visitNode(group, stayDays) {
  const representative = group.representative;
  return {
    ...representative,
    visitId: group.id,
    visitHighlights: group.activities,
    stayDays,
    minimumNights: 1,
    baseEvidenceCount: group.nodes.length,
    vehicleSuitability: group.vehicleSuitability
  };
}

function omittedReason(node, trip, selectedBaseNames, selectedIds) {
  if (node.contextOnly) return `${node.name} ligt circa ${node.distanceFromRegionKm} km buiten deze regionale route en is daarom niet geforceerd.`;
  if (node.minimumTripDays > trip.days) return `${node.name} vraagt een reis van minimaal ${node.minimumTripDays} dagen binnen deze routeopbouw.`;
  if (selectedBaseNames.has(normalizedText(node.baseName)) && !selectedIds.has(node.id)) return `${node.name} is als reserve-highlight bewaard om herhaling en een te vol dagprogramma te voorkomen.`;
  return `${node.name} is weggelaten omdat reistijd, routecoherentie, verblijfsduur of maximaal ${trip.maxChanges} accommodatiewissels zwaarder wegen.`;
}

export function planHighlightRoute(trip, destination) {
  const graph = normalizeHighlightGraph(destination);
  const gateway = graph.find(item => item.gateway) || graph[0];
  if (!gateway) return { graph: [], selected: [], route: [], baseVisits: [], omitted: [], stayAllocation: {}, nightAllocation: {}, minimumAdditionalDays: 0, evidence: [] };

  const groups = groupByOvernightBase(graph, gateway);
  const gatewayGroup = groups.find(group => group.gateway) || groups[0];
  for (const group of groups) group.vehicleSuitability = vehicleSuitabilityScore(group, trip);
  const search = beamSearchBases(trip, destination, groups, gatewayGroup);
  const basePath = search.path;
  const { allocation: stayByGroup, accessLegs } = allocateStayDays(trip, destination, basePath, gatewayGroup);
  const baseVisits = basePath.map(group => visitNode(group, stayByGroup[group.id]));
  const route = [...baseVisits];
  if (shouldReturnToGateway(trip, basePath)) route.push({ ...baseVisits[0], id: `${baseVisits[0].id}-return`, visitId: `${baseVisits[0].visitId}-return`, returnGateway: true, stayDays: 0, minimumNights: 1 });

  const selected = [];
  for (const group of basePath) selected.push(...group.activities.slice(0, stayByGroup[group.id]));
  const selectedIds = new Set(selected.map(item => item.id));
  const selectedBaseNames = new Set(basePath.map(item => normalizedText(item.baseName)));
  const omitted = graph.filter(item => item.id !== gateway.id && !selectedIds.has(item.id)).map(item => ({
    ...item,
    reason: omittedReason(item, trip, selectedBaseNames, selectedIds),
    estimatedAdditionalDays: item.contextOnly
      ? Math.max(1, Math.ceil(item.distanceFromRegionKm / Math.max(120, trip.maxDrive * 60)))
      : selectedBaseNames.has(normalizedText(item.baseName)) ? 1 : 2
  }));
  const minimumAdditionalDays = omitted.length ? Math.min(...omitted.map(item => item.estimatedAdditionalDays)) : 0;
  const stayAllocation = Object.fromEntries(baseVisits.map(item => [item.id, item.stayDays]));
  const nightAllocation = Object.fromEntries(baseVisits.map((item, index) => [item.id, item.stayDays + 1 + (index === 0 && route.at(-1)?.returnGateway ? 1 : 0)]));
  if (route.at(-1)?.returnGateway) nightAllocation[route.at(-1).id] = 1;

  return {
    graph,
    selected,
    route,
    baseVisits,
    omitted,
    stayAllocation,
    nightAllocation,
    minimumAdditionalDays,
    accessLegs,
    search: { strategy: 'deterministic-beam', beamWidth: BEAM_WIDTH, targetBaseCount: search.targetBaseCount, selectedBaseCount: baseVisits.length },
    evidence: [
      `${selected.length} unieke highlights gekozen uit ${Math.max(0, graph.length - 1)} kandidaten`,
      `${baseVisits.length} chronologische uitvalsbases via deterministische beam search`,
      `${route.length - 1} route-edges binnen ${trip.days} dagen`,
      `${omitted.length} highlights bewust weggelaten door duur-, voertuig- of wisselgrenzen`
    ]
  };
}

export function localHighlightGeometry(node) {
  if (!node?.point || !node?.overnightPoint) return [];
  if (haversineKm(node.point, node.overnightPoint) < 2) return [node.overnightPoint];
  return [node.overnightPoint, node.point, node.overnightPoint];
}
