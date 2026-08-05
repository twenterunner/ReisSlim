import { validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { resolveOrigin } from './trip-model.js';
import {
  estimateLegTiming,
  exceedsFuelRange,
  hasRoughSurfaceEvidence,
  minimumTravelLegs,
  surfaceEvidenceValues,
  surfacePolicyConflict,
  transportId,
  vehicleSuitabilityFor
} from './vehicle-intelligence.js';

const SPEED_KMH = { car: 82, motorcycle: 72, motorhome: 64, caravan: 59 };
const BEAM_WIDTH = 36;
const MAX_BASES = 6;
const LIVE_ROUTE_SOURCES = new Set(['osrm', 'tomtom', 'openrouteservice']);

const point = value => validCoordinate(value) ? { lat: Number(value.lat), lon: Number(value.lon) } : null;
const normalizedText = value => String(value || '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');

function nodeIdentities(node) {
  return new Set([node?.id, node?.providerId, node?.baseName, node?.name]
    .map(normalizedText)
    .filter(Boolean));
}

function corridorEndpointMatches(endpoint, identities) {
  const values = [endpoint?.id, endpoint?.anchorId, endpoint?.providerId, endpoint?.name, endpoint]
    .map(value => typeof value === 'object' ? '' : normalizedText(value))
    .filter(Boolean);
  return values.some(value => identities.has(value));
}

function catalogueCorridor(destination, from, to) {
  const fromIds = nodeIdentities(from);
  const toIds = nodeIdentities(to);
  for (const corridor of destination.corridors || []) {
    const forward = corridorEndpointMatches(corridor.from || corridor.fromId || corridor.fromAnchor || corridor.fromAnchorId, fromIds)
      && corridorEndpointMatches(corridor.to || corridor.toId || corridor.toAnchor || corridor.toAnchorId, toIds);
    const reverse = corridorEndpointMatches(corridor.to || corridor.toId || corridor.toAnchor || corridor.toAnchorId, fromIds)
      && corridorEndpointMatches(corridor.from || corridor.fromId || corridor.fromAnchor || corridor.fromAnchorId, toIds);
    if (forward || reverse) return { corridor, reverse };
  }
  return null;
}

function islandEvidence(node) {
  const role = normalizedText(node?.geographicRole || node?.touringRole || node?.role);
  const featureCode = normalizedText(node?.featureCode || node?.significance?.featureCode);
  const tags = (node?.tags || []).map(normalizedText);
  const explicitlyRequired = node?.requiresFerryAccess === true || node?.islandAccess === 'ferry-required';
  const island = explicitlyRequired || featureCode === 'isl' || role.includes('island') || tags.includes('island');
  return { island, explicitlyRequired };
}

function explicitRoadDisconnection(node) {
  const value = node?.roadAccess;
  if (value === false) return true;
  if (value && typeof value === 'object' && (value.allowed === false || value.connected === false)) return true;
  return /^(?:none|no|prohibited|disconnected)$/.test(normalizedText(value));
}

function explicitFerryEvidence(corridor, routeBacked) {
  const value = corridor?.ferryEvidence ?? corridor?.ferry;
  const ferry = value === true || value?.required === true || value?.present === true || value?.value === true;
  const sourceIds = Array.isArray(corridor?.sourceIds) && corridor.sourceIds.some(Boolean);
  const evidence = Array.isArray(corridor?.evidence) && corridor.evidence.some(item => /ferry|veer|boat/i.test(String(item)));
  return Boolean(ferry && (routeBacked || sourceIds || evidence));
}

function catalogueConnectivity(corridor, from, to, routeBacked, endpointContext) {
  const island = islandEvidence(from).island || islandEvidence(to).island;
  const ferryEvidenceExplicit = explicitFerryEvidence(corridor, routeBacked);
  if (ferryEvidenceExplicit) return {
    status: 'confirmed-ferry', classification: 'confirmed', selectable: true,
    requiresFerryEvidence: island, ferryEvidenceExplicit
  };
  if (island && !routeBacked && !ferryEvidenceExplicit) return {
    status: 'missing-island-access-evidence', classification: 'incomplete', selectable: false,
    requiresFerryEvidence: true, ferryEvidenceExplicit
  };
  if (routeBacked) return {
    status: 'confirmed-road', classification: 'confirmed', selectable: true,
    requiresFerryEvidence: island, ferryEvidenceExplicit
  };
  return {
    status: endpointContext ? 'estimated-endpoint-context' : 'estimated-adjacency',
    classification: 'estimated', selectable: true, requiresFerryEvidence: false, ferryEvidenceExplicit
  };
}

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
    roadEvidence: item.roadEvidence || null,
    vehicleFit: item.vehicleFit || item.vehicleCompatibility || null,
    vehicleFitEvidence: item.vehicleFitEvidence || null,
    geographicRole: item.geographicRole || item.touringRole || item.role || null,
    featureCode: item.featureCode || item.significance?.featureCode || null,
    islandAccess: item.islandAccess || null,
    requiresFerryAccess: item.requiresFerryAccess === true,
    roadAccess: item.roadAccess ?? null
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
      distanceFromRegionKm: 0,
      vehicleFit: base.vehicleFit || null,
      vehicleFitEvidence: base.vehicleFitEvidence || null,
      geographicRole: base.geographicRole || base.touringRole || base.role || null,
      featureCode: base.featureCode || base.significance?.featureCode || null,
      islandAccess: base.islandAccess || null,
      requiresFerryAccess: base.requiresFerryAccess === true,
      roadAccess: base.roadAccess ?? null
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
    distanceFromRegionKm: 0,
    vehicleFit: base.vehicleFit || null,
    vehicleFitEvidence: base.vehicleFitEvidence || null,
    geographicRole: base.geographicRole || base.touringRole || base.role || null,
    featureCode: base.featureCode || base.significance?.featureCode || null,
    islandAccess: base.islandAccess || null,
    requiresFerryAccess: base.requiresFerryAccess === true,
    roadAccess: base.roadAccess ?? null
  })).filter(item => item.point);
}

function edgeConstraintStatus(trip, vehicleCompatibility, surface, fuelServiceSpacingKm) {
  const vehicle = transportId(trip.transport);
  const suitability = vehicleSuitabilityFor(vehicleCompatibility, vehicle);
  const surfaces = surfaceEvidenceValues(surface);
  const heavyVehicleSurfaceConflict = ['motorhome', 'caravan'].includes(vehicle) && hasRoughSurfaceEvidence(surfaces);
  const surfaceConflict = heavyVehicleSurfaceConflict || surfacePolicyConflict(trip, surfaces);
  const fuelRangeExceeded = exceedsFuelRange(trip, fuelServiceSpacingKm);
  const vehicleProhibited = suitability.status === 'prohibited';
  return {
    vehicleCompatible: !vehicleProhibited && !surfaceConflict && !fuelRangeExceeded,
    vehicleProhibited,
    vehicleSuitability: suitability.status,
    vehicleSuitabilityEvidence: suitability.evidence,
    surfaceConflict,
    fuelRangeExceeded,
    surfaceEvidence: surfaces,
    fuelServiceSpacingKm: Number.isFinite(Number(fuelServiceSpacingKm)) ? Number(fuelServiceSpacingKm) : null
  };
}

export function graphEdge(trip, from, to, destination = {}) {
  const catalogueMatch = catalogueCorridor(destination, from, to);
  if (catalogueMatch) {
    const { corridor, reverse } = catalogueMatch;
    const vehicle = transportId(trip.transport);
    const distanceKm = Math.max(1, Math.round(Number(corridor.distanceKm) || haversineKm(from.overnightPoint, to.overnightPoint) * 1.16 || 1));
    const carMovingHours = Number(corridor.carMovingHours || corridor.carHours || corridor.roadHours);
    const motorcycleMovingHours = Number(corridor.motorcycleMovingHours);
    const suppliedHours = vehicle === 'motorcycle'
      ? (Number.isFinite(motorcycleMovingHours) && motorcycleMovingHours > 0
          ? motorcycleMovingHours
          : (Number.isFinite(carMovingHours) && carMovingHours > 0 ? carMovingHours * 1.05 : NaN))
      : carMovingHours;
    const speed = SPEED_KMH[vehicle] || SPEED_KMH.car;
    const roadHours = Number((Number.isFinite(suppliedHours) && suppliedHours > 0 ? suppliedHours : distanceKm / speed).toFixed(1));
    const timing = estimateLegTiming(trip, { distanceKm, roadHours, arrival: true });
    const suppliedMotorcycleElapsed = Number(corridor.motorcycleElapsedHours);
    if (vehicle === 'motorcycle' && Number.isFinite(suppliedMotorcycleElapsed) && suppliedMotorcycleElapsed > 0) {
      timing.catalogueElapsedHours = suppliedMotorcycleElapsed;
      timing.elapsedHours = Number(Math.max(timing.elapsedHours, suppliedMotorcycleElapsed).toFixed(1));
    }
    const surface = corridor.surface || corridor.surfaceEvidence || null;
    const vehicleCompatibility = corridor.vehicleCompatibility || {};
    const constraints = edgeConstraintStatus(trip, vehicleCompatibility, surface, corridor.fuelServiceSpacingKm);
    const suppliedGeometry = (corridor.fallbackGeometry || corridor.geometry || []).filter(validCoordinate).map(point);
    const geometry = reverse ? suppliedGeometry.slice().reverse() : suppliedGeometry;
    const routeBacked = corridor.routeEvidenceScope === 'route';
    const endpointContext = corridor.routeEvidenceScope === 'endpoint-context' || Boolean(corridor.overtureEndpointEvidence);
    const connectivity = catalogueConnectivity(corridor, from, to, routeBacked, endpointContext);
    return {
      from: from.id, to: to.id, distanceKm, roadHours, elapsedHours: timing.elapsedHours, timing,
      corridorIdentity: corridor.id || [String(from.baseName || from.id), String(to.baseName || to.id)].sort().join('>'),
      corridorId: corridor.id || null,
      geometry,
      routeSource: routeBacked ? 'catalogue-corridor' : 'catalogue-fallback-geometry',
      source: routeBacked
        ? corridor.source || 'ReisSlim touringcatalogus'
        : endpointContext ? 'ReisSlim geschatte corridor; brondata dekt alleen de eindpuntomgeving' : 'ReisSlim geschatte corridor',
      confidence: routeBacked ? corridor.confidence || 'catalogue-evidence'
        : endpointContext ? 'estimated-endpoint-context' : 'estimated-corridor',
      routeEvidenceScope: routeBacked ? 'route' : endpointContext ? 'endpoint-context' : 'estimated',
      routeEvidenceClassification: connectivity.classification,
      connectivityStatus: connectivity.status,
      routeSelectable: connectivity.selectable,
      requiresFerryEvidence: connectivity.requiresFerryEvidence,
      ferryEvidenceExplicit: connectivity.ferryEvidenceExplicit,
      scenicValue: Math.max(0, Math.min(10, Number(corridor.scenicValue) || 0)),
      surfaceEvidence: constraints.surfaceEvidence,
      roadClassEvidence: [corridor.roadClass].filter(Boolean),
      vehicleCompatible: constraints.vehicleCompatible,
      vehicleProhibited: constraints.vehicleProhibited,
      vehicleSuitability: constraints.vehicleSuitability,
      vehicleSuitabilityEvidence: constraints.vehicleSuitabilityEvidence,
      surfaceConflict: constraints.surfaceConflict,
      fuelRangeExceeded: constraints.fuelRangeExceeded,
      uncertainty: Number(corridor.confidenceScore) < .5 || corridor.geometryType === 'fallback-straight-line'
        ? 'estimated-corridor'
        : corridor.confidence || 'catalogue-evidence',
      serviceEvidence: corridor.serviceEvidence !== null && corridor.serviceEvidence !== undefined && Number.isFinite(Number(corridor.serviceEvidence))
        ? Number(corridor.serviceEvidence)
        : corridor.fuelServiceSpacingKm !== null && corridor.fuelServiceSpacingKm !== undefined && Number.isFinite(Number(corridor.fuelServiceSpacingKm))
          ? Math.max(0, 10 - Number(corridor.fuelServiceSpacingKm) / 50)
          : Number(destination.evidence?.services || 0),
      fuelServiceSpacingKm: constraints.fuelServiceSpacingKm,
      tollEvidence: corridor.tollEvidence ?? corridor.toll ?? null,
      ferryEvidence: corridor.ferryEvidence ?? corridor.ferry ?? null,
      seasonalLimitations: corridor.seasonalLimitations || null
    };
  }
  const directKm = haversineKm(from.overnightPoint, to.overnightPoint) || 0;
  const distanceKm = Math.max(1, Math.round(directKm * (destination.roadDistanceFactor || 1.16)));
  const speed = SPEED_KMH[transportId(trip.transport)] || SPEED_KMH.car;
  const roadHours = Number((distanceKm / speed).toFixed(1));
  const timing = estimateLegTiming(trip, { distanceKm, roadHours, arrival: true });
  const evidence = [from.roadEvidence, to.roadEvidence].filter(Boolean);
  const scenicValue = Math.min(10, evidence.reduce((sum, item) => sum + (item.scenic ? 5 : 0) + (item.routeRelation ? 2 : 0), 0));
  const uncertainSurface = evidence.some(item => !item.surface) && evidence.length > 0;
  const vehicle = transportId(trip.transport);
  const compatibilityEvidence = evidence.map(item => item.vehicleCompatibility?.[vehicle]
    ?? item.vehicleFit?.[vehicle]
    ?? (vehicle === 'motorcycle' ? item.motorcycleAccess : undefined)).filter(value => value !== undefined);
  const vehicleCompatibility = compatibilityEvidence.some(value => vehicleSuitabilityFor(value, vehicle).status === 'prohibited')
    ? { [vehicle]: 'prohibited' }
    : {};
  const surfaceEvidence = evidence.map(item => item.surface).filter(Boolean);
  const constraints = edgeConstraintStatus(trip, vehicleCompatibility, surfaceEvidence, null);
  const island = islandEvidence(from).island || islandEvidence(to).island;
  const roadDisconnected = explicitRoadDisconnection(from) || explicitRoadDisconnection(to);
  return {
    from: from.id, to: to.id, distanceKm, roadHours, elapsedHours: timing.elapsedHours, timing,
    corridorIdentity: [String(from.baseName || from.id), String(to.baseName || to.id)].sort().join('>'),
    scenicValue, surfaceEvidence: constraints.surfaceEvidence,
    roadClassEvidence: evidence.map(item => item.roadClass).filter(Boolean), vehicleCompatible: constraints.vehicleCompatible,
    vehicleProhibited: constraints.vehicleProhibited, vehicleSuitability: constraints.vehicleSuitability,
    vehicleSuitabilityEvidence: constraints.vehicleSuitabilityEvidence,
    surfaceConflict: constraints.surfaceConflict, fuelRangeExceeded: constraints.fuelRangeExceeded, fuelServiceSpacingKm: null,
    routeSource: island || roadDisconnected ? 'missing-connectivity' : 'geodesic-fallback',
    confidence: island || roadDisconnected ? 'incomplete-connectivity' : 'estimated-geodesic',
    routeEvidenceScope: island || roadDisconnected ? 'none' : 'estimated',
    routeEvidenceClassification: island || roadDisconnected ? 'incomplete' : 'estimated',
    connectivityStatus: island ? 'missing-island-access-evidence' : roadDisconnected ? 'missing-road-connectivity' : 'estimated-geodesic',
    routeSelectable: !island && !roadDisconnected,
    requiresFerryEvidence: island,
    ferryEvidenceExplicit: false,
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
    const edge = graphEdge(trip, path[index - 1].representative, path[index].representative, destination);
    if (!edge.vehicleCompatible || edge.elapsedHours > trip.maxDrive + .05) return false;
  }
  if (shouldReturnToGateway(trip, path)) {
    const edge = graphEdge(trip, path.at(-1).representative, gatewayGroup.representative, destination);
    if (!edge.vehicleCompatible || edge.elapsedHours > trip.maxDrive + .05) return false;
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
            + (destination.catalogue && Number(trip.days) >= 8 ? Math.min(9, edge.distanceKm / 25) : 0)
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

function liveRouteDay(day) {
  const source = normalizedText(day?.routeSource);
  return [...LIVE_ROUTE_SOURCES].some(provider => source.includes(provider));
}

function roadEvidenceForDay(day, trip) {
  const access = ['outward', 'return'].includes(day.kind);
  const internal = day.kind === 'transfer';
  const surfaceAccess = trip.travelMode === 'rail-ferry' && access;
  const directAccess = trip.travelMode === 'direct' && access;
  if (!internal && !surfaceAccess && !directAccess) return null;
  if (liveRouteDay(day)) return { classification: 'confirmed', reason: null };
  if (day.routeEvidenceClassification === 'confirmed'
      || ['confirmed-road', 'confirmed-ferry'].includes(day.connectivityStatus)) return { classification: 'confirmed', reason: null };
  if (day.requiresFerryEvidence && !day.ferryEvidenceExplicit && day.routeEvidenceScope !== 'route') return {
    classification: 'incomplete',
    reason: `Dag ${day.day || '?'} bereikt een eilandanker zonder expliciet bronbewijs voor een ferry of vaste wegverbinding.`
  };
  if (day.connectivityStatus === 'missing-island-access-evidence') return {
    classification: 'incomplete',
    reason: `Dag ${day.day || '?'} mist bronbewijs voor de noodzakelijke eilandverbinding.`
  };
  if (internal && (day.connectivityStatus === 'missing-road-connectivity' || day.routeEvidenceScope === 'none')) return {
    classification: 'incomplete',
    reason: `Dag ${day.day || '?'} verbindt twee touringbases zonder catalogus-, weg- of ferryevidence.`
  };
  if (day.routeEvidenceScope === 'route') return { classification: 'confirmed', reason: null };
  return {
    classification: 'estimated',
    reason: `Dag ${day.day || '?'} gebruikt alleen geschatte of geodetische routeconnectiviteit.`
  };
}

export function assessPlanRouteFeasibility(trip, plan) {
  const assessed = (plan?.days || []).map(day => ({ day, evidence: roadEvidenceForDay(day, trip) }))
    .filter(item => item.evidence);
  const incomplete = assessed.filter(item => item.evidence.classification === 'incomplete');
  const estimated = assessed.filter(item => item.evidence.classification === 'estimated');
  const confirmed = assessed.filter(item => item.evidence.classification === 'confirmed');
  const status = incomplete.length ? 'incomplete' : estimated.length ? 'estimated' : assessed.length ? 'confirmed' : 'local-only';
  const reasons = [...new Set([...incomplete, ...estimated].map(item => item.evidence.reason).filter(Boolean))];
  return {
    status,
    normalExactEligible: status === 'confirmed' || status === 'local-only',
    suggestedCategory: status === 'incomplete' ? 'incomplete' : status === 'estimated' ? 'stretch' : 'exact',
    assessedRoadDays: assessed.length,
    confirmedRoadDays: confirmed.length,
    estimatedRoadDays: estimated.length,
    incompleteRoadDays: incomplete.length,
    confirmedRatio: assessed.length ? Number((confirmed.length / assessed.length).toFixed(3)) : null,
    reasons,
    summary: status === 'confirmed'
      ? 'Alle geplande weg- en ferry-etappes hebben expliciete route-evidence.'
      : status === 'local-only'
        ? 'Dit plan bevat geen catalogusoverstap tussen touringbases.'
        : status === 'estimated'
          ? `${estimated.length} weg- of ferry-etappe${estimated.length === 1 ? '' : 's'} is alleen indicatief en wordt daarom als stretch getoond.`
          : `${incomplete.length} noodzakelijke verbinding${incomplete.length === 1 ? '' : 'en'} mist weg- of ferryevidence; dit plan is onvolledig en niet selecteerbaar.`
  };
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
  const rawGraph = normalizeHighlightGraph(destination);
  const prohibited = rawGraph.filter(node => vehicleSuitabilityFor(node.vehicleFit, trip.transport).status === 'prohibited');
  const graph = rawGraph.filter(node => !prohibited.includes(node));
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
  const omitted = [...graph.filter(item => item.id !== gateway.id && !selectedIds.has(item.id)).map(item => ({
    ...item,
    reason: omittedReason(item, trip, selectedBaseNames, selectedIds),
    estimatedAdditionalDays: item.contextOnly
      ? Math.max(1, Math.ceil(item.distanceFromRegionKm / Math.max(120, trip.maxDrive * 60)))
      : selectedBaseNames.has(normalizedText(item.baseName)) ? 1 : 2
  })), ...prohibited.map(item => ({
    ...item,
    reason: `${item.name} is weggelaten omdat de bron het gekozen voertuig expliciet uitsluit.`,
    estimatedAdditionalDays: 0,
    vehicleProhibited: true
  }))];
  const additionalDayEstimates = omitted.map(item => item.estimatedAdditionalDays).filter(days => days > 0);
  const minimumAdditionalDays = additionalDayEstimates.length ? Math.min(...additionalDayEstimates) : 0;
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
