import { originCatalog, validCoordinate } from './config.js';
import { resolveOrigin } from './trip-model.js';
import { estimateLegTiming, minimumTravelLegs, vehicleProfile } from './vehicle-intelligence.js';

const anchorOrigin = originCatalog.saasveld;
const radians = degrees => degrees * Math.PI / 180;

export function haversineKm(a, b) {
  if (!validCoordinate(a) || !validCoordinate(b)) return null;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(value));
}

export function calculateRouteMetrics(trip, destination) {
  const origin = resolveOrigin(trip.origin);
  const destinationPoint = destination.bases[0];
  const baselineDirect = haversineKm(anchorOrigin, destinationPoint);
  const originDirect = origin ? haversineKm(origin, destinationPoint) : baselineDirect;
  const distanceRatio = baselineDirect ? originDirect / baselineDirect : 1;
  const profile = vehicleProfile(trip);
  const oneWayDistanceKm = Math.max(1, Math.round(destination.distanceKm * distanceRatio));
  const oneWayRoadHours = Number((destination.driveHours * distanceRatio * profile.roadTimeFactor).toFixed(1));
  const oneWayTiming = estimateLegTiming(trip, { distanceKm: oneWayDistanceKm, roadHours: oneWayRoadHours });
  const requiredLegs = minimumCorridorLegs(trip, destination, oneWayDistanceKm, oneWayRoadHours);
  return {
    origin: origin ? { ...origin, name: trip.origin, role: 'origin', progress: 0 } : null,
    originKnown: Boolean(origin),
    destination: { ...destinationPoint, role: 'destination', progress: 1 },
    oneWayDistanceKm,
    oneWayRoadHours,
    oneWayElapsedHours: oneWayTiming.elapsedHours,
    oneWayDriveHours: oneWayTiming.elapsedHours,
    breakHours: oneWayTiming.breakHours,
    requiredLegs,
    routeSource: 'offline-corridor',
    warning: origin ? null : `Voor ${trip.origin} ontbreken offline coördinaten; afstanden gebruiken Saasveld als indicatief Nederlands vertrekanker.`
  };
}

function minimumCorridorLegs(trip, destination, distanceKm, roadHours) {
  const maximum = Math.min(8, Math.max(1, (destination.routeStops?.length || 0) + 1));
  for (let legs = 1; legs <= maximum; legs += 1) {
    const stops = selectRouteStops(destination, legs);
    const nodes = [{ progress: 0 }, ...stops, { progress: 1 }];
    const fits = nodes.slice(0, -1).every((from, index) => {
      const segment = segmentMetrics(from, nodes[index + 1], distanceKm, roadHours);
      return estimateLegTiming(trip, segment).elapsedHours <= trip.maxDrive + .05;
    });
    if (fits) return legs;
  }
  return Math.max(maximum, minimumTravelLegs(trip, distanceKm, roadHours));
}

export function selectRouteStops(destination, legCount) {
  const required = Math.max(0, legCount - 1);
  const available = [...(destination.routeStops || [])];
  const selected = [];
  for (let index = 1; index <= required && available.length; index += 1) {
    const target = index / legCount;
    available.sort((a, b) => Math.abs(a.progress - target) - Math.abs(b.progress - target));
    selected.push(available.shift());
  }
  return selected.sort((a, b) => a.progress - b.progress);
}

export function buildTravelNodes(trip, destination, legCount) {
  const metrics = calculateRouteMetrics(trip, destination);
  const fallbackOrigin = { ...anchorOrigin, name: trip.origin, role: 'origin', progress: 0, approximate: true };
  const origin = metrics.origin || fallbackOrigin;
  const stops = selectRouteStops(destination, legCount).map(point => ({ ...point, role: 'overnight' }));
  return {
    metrics,
    outbound: [origin, ...stops, { ...metrics.destination, progress: 1 }],
    inbound: [{ ...metrics.destination, progress: 1 }, ...stops.slice().reverse(), { ...origin, role: 'return' }]
  };
}

export function segmentMetrics(from, to, totalDistanceKm, totalRoadHours) {
  const fromProgress = Number.isFinite(from.progress) ? from.progress : 0;
  const toProgress = Number.isFinite(to.progress) ? to.progress : 1;
  const share = Math.max(.02, Math.abs(toProgress - fromProgress));
  return {
    distanceKm: Math.max(1, Math.round(totalDistanceKm * share)),
    roadHours: Number((totalRoadHours * share).toFixed(1))
  };
}

export function interpolateRoutePoint(from, to, ratio, attributes = {}) {
  if (!validCoordinate(from) || !validCoordinate(to)) return null;
  return {
    lat: Number((from.lat + (to.lat - from.lat) * ratio).toFixed(5)),
    lon: Number((from.lon + (to.lon - from.lon) * ratio).toFixed(5)),
    ...attributes
  };
}

export function buildBreakWaypoints(from, to, timing, transport) {
  const count = Math.max(0, timing?.stopCount || 0);
  return Array.from({ length: count }, (_, index) => {
    const ratio = (index + 1) / (count + 1);
    return interpolateRoutePoint(from, to, ratio, {
      name: timing.fuelStops > index ? `Brandstof- en ruststop ${index + 1}` : `Ruststop ${index + 1}`,
      role: timing.fuelStops > index ? 'fuel' : 'rest',
      transport,
      approximate: true
    });
  }).filter(Boolean);
}
