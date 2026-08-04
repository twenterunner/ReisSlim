import { haversineKm, interpolateRoutePoint } from './route-engine.js';

const toRadians = value => value * Math.PI / 180;
const toDegrees = value => value * 180 / Math.PI;

function shiftedPoint(point, origin, destination, offsetKm, progress) {
  const middleLatitude = toRadians((origin.lat + destination.lat) / 2);
  const dLat = destination.lat - origin.lat;
  const dLon = (destination.lon - origin.lon) * Math.cos(middleLatitude);
  const length = Math.hypot(dLat, dLon) || 1;
  const perpendicularLat = -dLon / length;
  const perpendicularLon = dLat / length / Math.max(.2, Math.cos(middleLatitude));
  const degrees = offsetKm / 111;
  return {
    ...point,
    lat: Number((point.lat + perpendicularLat * degrees).toFixed(5)),
    lon: Number((point.lon + perpendicularLon * degrees).toFixed(5)),
    progress,
    alternate: true
  };
}

export function buildAlternativeReturnNodes(origin, destination, legCount, { offsetKm = 55 } = {}) {
  const required = Math.max(0, legCount - 1);
  const stops = [];
  for (let index = 1; index <= required; index += 1) {
    const progress = index / legCount;
    const direct = interpolateRoutePoint(origin, destination, progress, {});
    const wave = Math.sin(Math.PI * progress);
    stops.push(shiftedPoint(direct, origin, destination, offsetKm * wave, progress));
  }
  return [
    { ...destination, progress: 1, role: 'destination' },
    ...stops.reverse().map((point, index) => ({ ...point, name: `Alternatieve terugcorridor ${index + 1}`, role: 'overnight' })),
    { ...origin, progress: 0, role: 'return' }
  ];
}

function sampleGeometry(points, intervalKm = 25) {
  const samples = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]; const to = points[index + 1];
    const distance = haversineKm(from, to) || 0;
    const count = Math.max(1, Math.ceil(distance / intervalKm));
    for (let step = 0; step < count; step += 1) samples.push(interpolateRoutePoint(from, to, step / count));
  }
  if (points.length) samples.push(points.at(-1));
  return samples.filter(Boolean);
}

export function geometryOverlap(outbound = [], inbound = [], thresholdKm = 18) {
  const first = sampleGeometry(outbound); const second = sampleGeometry(inbound);
  if (!first.length || !second.length) return 1;
  const matched = second.filter(point => first.some(other => (haversineKm(point, other) ?? Infinity) <= thresholdKm)).length;
  return Number((matched / second.length).toFixed(2));
}

export function routeExplorationMetrics(outbound = [], inbound = []) {
  const overlap = geometryOverlap(outbound, inbound);
  return { overlap, explorationScore: Math.round((1 - overlap) * 100), method: 'sampled-geodesic-overlap', thresholdKm: 18 };
}
