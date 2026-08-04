import { originCatalog, transportProfiles, validCoordinate } from './config.js';
import { resolveOrigin } from './trip-model.js';

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
  const profile = transportProfiles[trip.transport] || transportProfiles.car;
  const oneWayDistanceKm = Math.max(1, Math.round(destination.distanceKm * distanceRatio));
  const oneWayDriveHours = Number((destination.driveHours * distanceRatio * profile.timeFactor).toFixed(1));
  return {
    origin: origin ? { ...origin, name: trip.origin, role: 'origin' } : null,
    originKnown: Boolean(origin),
    destination: { ...destinationPoint, role: 'destination' },
    oneWayDistanceKm,
    oneWayDriveHours,
    requiredLegs: Math.max(1, Math.ceil(oneWayDriveHours / trip.maxDrive)),
    warning: origin ? null : `Voor ${trip.origin} ontbreken offline coördinaten; afstanden gebruiken Saasveld als indicatief Nederlands vertrekanker.`
  };
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
  const fallbackOrigin = { ...anchorOrigin, name: trip.origin, role: 'origin', approximate: true };
  const origin = metrics.origin || fallbackOrigin;
  const stops = selectRouteStops(destination, legCount).map(point => ({ ...point, role: 'overnight' }));
  return {
    metrics,
    outbound: [origin, ...stops, { ...metrics.destination, progress: 1 }],
    inbound: [{ ...metrics.destination, progress: 1 }, ...stops.slice().reverse(), { ...origin, role: 'return' }]
  };
}

export function segmentMetrics(from, to, totalDistanceKm, totalDriveHours) {
  const fromProgress = Number.isFinite(from.progress) ? from.progress : 0;
  const toProgress = Number.isFinite(to.progress) ? to.progress : 1;
  const share = Math.max(.02, Math.abs(toProgress - fromProgress));
  return {
    distanceKm: Math.max(1, Math.round(totalDistanceKm * share)),
    driveHours: Number((totalDriveHours * share).toFixed(1))
  };
}
