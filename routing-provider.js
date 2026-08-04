import { routingConfig, validCoordinate } from './config.js';
import { buildRecommendations } from './recommendation-engine.js';
import { estimateLegTiming, minimumTravelLegs, transportId, vehicleSpec } from './vehicle-intelligence.js';
import { applyDaySchedules } from './plan-solver.js';

const SETTINGS_KEY = 'reisslim.integration.v1';
const OSRM_URL = 'https://router.project-osrm.org';
const ORS_URL = 'https://api.heigit.org/openrouteservice';

function storageOrNull() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readRoutingSettings(storage = storageOrNull()) {
  try {
    const value = JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}');
    return { orsApiKey: String(value.orsApiKey || '').trim() };
  } catch { return { orsApiKey: '' }; }
}

export function saveRoutingSettings(settings, storage = storageOrNull()) {
  const safe = { orsApiKey: String(settings?.orsApiKey || '').trim() };
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(safe)); } catch { /* local setting is best effort */ }
  return safe;
}

export function routingEndpoint() {
  return String(globalThis.REISSLIM_ROUTING_API_URL || routingConfig.apiUrl || '').trim();
}

export function routingConfigured(trip = null, settings = readRoutingSettings()) {
  if (trip?.liveData === false) return false;
  if (/^https:\/\//.test(routingEndpoint()) || settings.orsApiKey) return true;
  return trip ? ['car', 'motorcycle'].includes(transportId(trip.transport)) : false;
}

export function buildRoutingRequest(trip, day) {
  return {
    day: day.day,
    origin: { lat: day.fromPoint.lat, lon: day.fromPoint.lon },
    destination: { lat: day.toPoint.lat, lon: day.toPoint.lon },
    waypoints: [],
    vehicle: vehicleSpec(trip)
  };
}

function waypointsOnGeometry(geometry, timing, transport) {
  const count = Math.max(0, timing.stopCount || 0);
  if (geometry.length < 2 || !count) return [];
  return Array.from({ length: count }, (_, index) => {
    const position = Math.min(geometry.length - 1, Math.max(1, Math.round((index + 1) * (geometry.length - 1) / (count + 1))));
    return {
      ...geometry[position],
      name: timing.fuelStops > index ? `Brandstof- en ruststop ${index + 1}` : `Ruststop ${index + 1}`,
      role: timing.fuelStops > index ? 'fuel' : 'rest',
      transport,
      approximate: true
    };
  });
}

function applyResult(trip, day, result) {
  const geometry = Array.isArray(result.geometry) ? result.geometry.filter(validCoordinate) : [];
  if (geometry.length < 2 || !Number.isFinite(result.distanceKm) || !Number.isFinite(result.roadHours)) return false;
  const timing = estimateLegTiming(trip, {
    distanceKm: result.distanceKm,
    roadHours: result.roadHours,
    arrival: day.kind !== 'return' || day.to !== trip.origin
  });
  Object.assign(day, {
    distanceKm: Math.round(result.distanceKm),
    roadHours: timing.roadHours,
    driveHours: timing.elapsedHours,
    elapsedHours: timing.elapsedHours,
    breakHours: timing.breakHours,
    restStops: timing.restStops,
    fuelStops: timing.fuelStops,
    stopCount: timing.stopCount,
    waypoints: waypointsOnGeometry(geometry, timing, trip.transport),
    geometry,
    routeSource: result.provider || 'live-provider',
    exceedsDailyLimit: timing.elapsedHours > trip.maxDrive + .05
  });
  return true;
}

async function fetchWithTimeout(url, options, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Routeprovider antwoordde met ${response.status}.`);
    return response.json();
  } finally { clearTimeout(timeout); }
}

async function fetchGatewayRoute(apiUrl, request, fetchImpl, timeoutMs) {
  return fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request)
  }, fetchImpl, timeoutMs);
}

function normalizeOsrmRoute(payload) {
  const route = payload?.routes?.[0];
  const coordinates = route?.geometry?.coordinates || [];
  if (!route) throw new Error('OSRM leverde geen route.');
  return {
    provider: 'osrm',
    distanceKm: route.distance / 1000,
    roadHours: route.duration / 3600,
    geometry: coordinates.map(([lon, lat]) => ({ lat, lon }))
  };
}

async function fetchOsrmRoute(trip, request, fetchImpl, timeoutMs, baseUrl = OSRM_URL) {
  if (!['car', 'motorcycle'].includes(transportId(trip.transport))) throw new Error('OSRM wordt niet gebruikt voor grote voertuigen.');
  const { origin, destination } = request;
  const url = new URL(`/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`, baseUrl);
  url.search = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'false', alternatives: 'false' });
  return normalizeOsrmRoute(await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, fetchImpl, timeoutMs));
}

function normalizeOrsRoute(payload) {
  const feature = payload?.features?.[0];
  const summary = feature?.properties?.summary;
  const coordinates = feature?.geometry?.coordinates || [];
  if (!summary) throw new Error('OpenRouteService leverde geen route.');
  return {
    provider: 'openrouteservice',
    distanceKm: summary.distance / 1000,
    roadHours: summary.duration / 3600,
    geometry: coordinates.map(([lon, lat]) => ({ lat, lon }))
  };
}

async function fetchOrsRoute(trip, request, apiKey, fetchImpl, timeoutMs, baseUrl = ORS_URL) {
  const vehicle = vehicleSpec(trip);
  const heavy = ['motorhome', 'caravan'].includes(vehicle.transport);
  const profile = heavy ? 'driving-hgv' : 'driving-car';
  const body = { coordinates: [[request.origin.lon, request.origin.lat], [request.destination.lon, request.destination.lat]], instructions: false };
  if (heavy) {
    body.options = {
      vehicle_type: 'goods',
      profile_params: { restrictions: { height: vehicle.heightM, length: vehicle.lengthM, weight: vehicle.weightKg / 1000 } }
    };
  }
  const url = `${baseUrl}/v2/directions/${profile}/geojson`;
  const payload = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  }, fetchImpl, timeoutMs);
  return normalizeOrsRoute(payload);
}

async function fetchRouteForDay(trip, day, options, fetchImpl, timeoutMs) {
  const request = buildRoutingRequest(trip, day);
  const gateway = options.apiUrl ?? routingEndpoint();
  if (gateway) return fetchGatewayRoute(gateway, request, fetchImpl, timeoutMs);
  const settings = options.settings || readRoutingSettings(options.storage);
  if (settings.orsApiKey) return fetchOrsRoute(trip, request, settings.orsApiKey, fetchImpl, timeoutMs, options.orsUrl);
  return fetchOsrmRoute(trip, request, fetchImpl, timeoutMs, options.osrmUrl);
}

const providerLabel = source => ({
  tomtom: routingConfig.providerLabel,
  openrouteservice: 'OpenRouteService wegroute',
  osrm: 'OSRM wegroute (auto-profiel)'
})[source] || 'Live wegroute';

export async function enrichPlanWithLiveRouting(trip, destination, plan, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!routingConfigured(trip, options.settings || readRoutingSettings(options.storage)) || typeof fetchImpl !== 'function') return plan;
  const next = typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(plan)
    : JSON.parse(JSON.stringify(plan));
  const routeDays = next.days.filter(day => ['outward', 'return', 'transfer'].includes(day.kind)
    && validCoordinate(day.fromPoint) && validCoordinate(day.toPoint));
  const settled = await Promise.allSettled(routeDays.map(day => fetchRouteForDay(
    trip, day, options, fetchImpl, options.timeoutMs || routingConfig.requestTimeoutMs
  )));
  let applied = 0;
  const providers = [];
  settled.forEach((entry, index) => {
    if (entry.status === 'fulfilled' && applyResult(trip, routeDays[index], entry.value)) {
      applied += 1;
      providers.push(entry.value.provider || 'live-provider');
    }
  });
  if (!applied) {
    next.routing = { ...next.routing, error: 'Live routering niet beschikbaar; offline corridor blijft actief.' };
    return next;
  }

  const outbound = next.days.filter(day => day.kind === 'outward');
  next.routeMetrics.oneWayDistanceKm = outbound.reduce((sum, day) => sum + day.distanceKm, 0);
  next.routeMetrics.oneWayRoadHours = Number(outbound.reduce((sum, day) => sum + day.roadHours, 0).toFixed(1));
  next.routeMetrics.oneWayElapsedHours = Number(outbound.reduce((sum, day) => sum + day.driveHours, 0).toFixed(1));
  next.routeMetrics.oneWayDriveHours = next.routeMetrics.oneWayElapsedHours;
  next.routeMetrics.breakHours = Number(outbound.reduce((sum, day) => sum + day.breakHours, 0).toFixed(1));
  next.requiredLegs = minimumTravelLegs(trip, next.routeMetrics.oneWayDistanceKm, next.routeMetrics.oneWayRoadHours);
  next.routeMetrics.requiredLegs = next.requiredLegs;
  next.minimumDays = next.requiredLegs * 2 + 1;
  const singleProvider = new Set(providers).size === 1 ? providers[0] : 'mixed';
  next.routeMetrics.routeSource = applied === routeDays.length ? singleProvider : 'mixed';
  applyDaySchedules(trip, next.days);
  next.recommendations = buildRecommendations(trip, destination, next.days);
  const excessive = next.days.filter(day => day.exceedsDailyLimit).length;
  next.feasible = next.minimumDays <= trip.days && excessive === 0 && next.accommodationChanges <= trip.maxChanges;
  const warnings = [];
  if (next.minimumDays > trip.days) warnings.push(`De live route vraagt minimaal ${next.minimumDays} dagen om onder ${trip.maxDrive} uur totale reistijd per dag te blijven.`);
  if (next.routeMetrics.warning) warnings.push(next.routeMetrics.warning);
  if (excessive) warnings.push(`${excessive} rijdag${excessive === 1 ? '' : 'en'} overschrijdt volgens de live route de ingestelde totale daglimiet.`);
  if (next.accommodationChanges > trip.maxChanges) warnings.push(`De route vraagt circa ${next.accommodationChanges} accommodatiewissels; jouw maximum is ${trip.maxChanges}.`);
  next.warnings = warnings;
  next.routing = {
    source: applied === routeDays.length ? singleProvider : 'mixed',
    label: applied === routeDays.length ? providerLabel(singleProvider) : 'Gedeeltelijk live, gedeeltelijk offline',
    live: applied === routeDays.length,
    completedSegments: applied,
    totalSegments: routeDays.length,
    error: applied < routeDays.length ? 'Niet alle segmenten konden live worden berekend.' : null
  };
  return next;
}
