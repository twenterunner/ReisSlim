import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrip } from '../trip-model.js';
import { destinations } from '../destinations.js';
import { buildItinerary, collectPlanWaypoints, collectRouteGeometry } from '../itinerary-engine.js';
import { buildBudget } from '../budget-engine.js';
import { rankDestinationGroups, rankDestinations, scoreDestination } from '../destination-engine.js';
import { calculateTripQuality } from '../trip-quality-engine.js';
import { constraintsPreserved, createUndoSnapshot, optimisePlan, restorePlan } from '../trip-optimizer.js';
import { applyOptimizationProposal, proposeOptimizations } from '../trip-optimizer.js';
import { buildProposalPortfolio, getMoreProposals, nearDuplicate, proposalDifference } from '../proposal-engine.js';
import { buildItineraryVariants } from '../itinerary-variants.js';
import { buildDiscoveryQueries, buildDiscoveryQuery, discoverySeeds, discoverDestinationBatch, normalizeDiscoveredDestinations } from '../destination-provider.js';
import { createGpx, createJson, safeFilename } from '../gpx-generator.js';
import { migrateState, loadDraft, saveDraft } from '../storage.js';
import { estimateLegTiming, vehicleSpec } from '../vehicle-intelligence.js';
import { buildRoutingRequest, enrichPlanWithLiveRouting } from '../routing-provider.js';
import { buildTomTomUrl, normalizeTomTomRoute } from '../route-worker.js';
import { evaluatePlanConstraints } from '../constraint-engine.js';
import { buildOverpassQuery, enrichPlanWithPlaces, geocodeOrigin, normalizeOverpassPlaces } from '../place-provider.js';
import { geometryOverlap, routeExplorationMetrics } from '../route-topology.js';
import { buildAccessSegments, estimateAccessCosts } from '../multimodal-engine.js';
import { buildTravelReadiness } from '../travel-readiness.js';
import { createRequestBudget, providerEnvelope, providerHealth } from '../provider-platform.js';
import { applyAssistantPatch, interpretAssistantMessage } from '../assistant-engine.js';
import { emptyPreferenceProfile, preferenceBonus, recordPreferenceEvent } from '../preference-engine.js';
import { weatherCondition, weatherSuitability } from '../weather-engine.js';
import { normalizeCommonsImage } from '../image-provider.js';

const makeTrip = overrides => normalizeTrip({
  id: 'fixed-trip', tripName: 'Testreis', origin: 'Utrecht', startDate: '2026-07-01',
  days: 10, budget: 4000, adults: 2, children: 2, transport: 'car',
  maxDrive: 5, maxChanges: 6, comfort: 'mid', preferences: ['natuur', 'bergen', 'kinderen'],
  preferenceWeights: { natuur: 3, bergen: 3, kinderen: 2 }, ...overrides
});
const slovenia = destinations.find(item => item.id === 'slovenia');

test('Day 1 starts from the entered origin', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.days[0].from, 'Utrecht');
  assert.notEqual(plan.days[0].to, 'Utrecht');
});

test('Final day returns to the entered origin', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.days.at(-1).to, 'Utrecht');
  assert.equal(plan.days.at(-1).kind, 'return');
});

test('Origin is never treated as a destination stay', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.days.some(day => ['stay', 'flex', 'transfer'].includes(day.kind) && day.location === trip.origin), false);
});

test('Itinerary day count exactly matches the requested duration', () => {
  for (const days of [3, 5, 9, 14, 30]) assert.equal(buildItinerary(makeTrip({ days }), slovenia).days.length, days);
});

test('Maximum daily elapsed travel time is respected for sufficient trips', () => {
  const trip = makeTrip({ days: 11, maxDrive: 5, maxChanges: 10 }); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.feasible, true);
  assert.ok(Math.max(...plan.days.map(day => day.driveHours)) <= trip.maxDrive);
});

test('Motorcycle travel includes more elapsed time and breaks than car travel', () => {
  const car = estimateLegTiming(makeTrip({ transport: 'car' }), { distanceKm: 600, roadHours: 4 });
  const motorcycle = estimateLegTiming(makeTrip({ transport: 'motorcycle' }), { distanceKm: 600, roadHours: 4 });
  assert.equal(car.roadHours, motorcycle.roadHours);
  assert.ok(motorcycle.elapsedHours > car.elapsedHours);
  assert.ok(motorcycle.breakHours > car.breakHours);
  assert.ok(motorcycle.restStops > car.restStops);
});

test('Legacy camper trips become motorhome trips with safe vehicle defaults', () => {
  const trip = makeTrip({ transport: 'camper', fuelRangeKm: undefined });
  assert.equal(trip.transport, 'motorhome');
  assert.equal(trip.fuelRangeKm, 520);
  assert.ok(trip.vehicleHeightM > 0);
  assert.ok(trip.vehicleLengthM > 0);
  assert.ok(trip.vehicleWeightKg > 0);
});

test('Recommendations match the selected vehicle and cover the trip essentials', () => {
  const trip = makeTrip({ transport: 'motorcycle', fuelRangeKm: 180 });
  const plan = buildItinerary(trip, slovenia);
  const types = new Set(plan.recommendations.map(item => item.type));
  assert.ok(plan.recommendations.length > plan.days.length);
  assert.ok(['accommodation', 'restaurant', 'activity', 'fuel'].every(type => types.has(type)));
  assert.ok(plan.recommendations.every(item => item.vehicleFit.length === 1 && item.vehicleFit[0] === 'motorcycle'));
  assert.ok(plan.recommendations.every(item => item.verified === false));
});

test('Route geometry and waypoints are produced for map and export layers', () => {
  const trip = makeTrip({ transport: 'car', fuelRangeKm: 300 });
  const plan = buildItinerary(trip, slovenia);
  const geometry = collectRouteGeometry(plan);
  const waypoints = collectPlanWaypoints(plan);
  assert.ok(geometry.length > 2);
  assert.ok(waypoints.length > plan.days.length);
  assert.ok(geometry.every(point => Number.isFinite(point.lat) && Number.isFinite(point.lon)));
  assert.ok(waypoints.some(point => ['rest', 'fuel'].includes(point.role)));
  assert.ok(waypoints.some(point => point.role === 'accommodation'));
});

test('Insufficient-duration trips are explicit and still structurally complete', () => {
  const trip = makeTrip({ days: 3, maxDrive: 4 }); const plan = buildItinerary(trip, slovenia);
  assert.equal(plan.feasible, false);
  assert.equal(plan.days.length, trip.days);
  assert.ok(plan.warnings.some(item => item.includes('minimaal')));
  assert.ok(plan.days.some(day => day.exceedsDailyLimit));
});

test('Budget totals are internally consistent', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia); const budget = buildBudget(trip, slovenia, plan);
  assert.equal(budget.total, budget.rows.reduce((sum, [, value]) => sum + value, 0));
  assert.equal(budget.remaining, trip.budget - budget.total);
  assert.equal(budget.perDay, Math.round(budget.total / trip.days));
});

test('Destination rankings are stable for fixed inputs', () => {
  const trip = makeTrip();
  assert.deepEqual(rankDestinations(trip, destinations).map(item => [item.id, item.score]), rankDestinations(trip, destinations).map(item => [item.id, item.score]));
});

test('Portfolio returns at least six genuinely different proposals when six are viable', () => {
  const trip = makeTrip({ budget: 4000, days: 10, maxChanges: 6 });
  const portfolio = buildProposalPortfolio(trip, destinations, { limit: 8 });
  assert.ok(portfolio.visible.length >= 6);
  assert.equal(new Set(portfolio.visible.map(item => item.id)).size, portfolio.visible.length);
  assert.ok(portfolio.stretched.length <= 2);
  for (let left = 0; left < portfolio.visible.length; left += 1) {
    for (let right = left + 1; right < portfolio.visible.length; right += 1) {
      assert.equal(nearDuplicate(portfolio.visible[left], portfolio.visible[right]), false);
      assert.ok(proposalDifference(portfolio.visible[left], portfolio.visible[right]) > 0);
    }
  }
});

test('Portfolio diversity selection is deterministic for fixed inputs', () => {
  const trip = makeTrip({ budget: 4000 });
  const first = buildProposalPortfolio(trip, destinations, { limit: 8, focus: 'surprising' });
  const second = buildProposalPortfolio(trip, destinations, { limit: 8, focus: 'surprising' });
  assert.deepEqual(first.visible.map(item => item.id), second.visible.map(item => item.id));
});

test('More options excludes every proposal already seen', () => {
  const trip = makeTrip({ budget: 4000 });
  const initial = buildProposalPortfolio(trip, destinations, { limit: 6 });
  const seen = initial.visible.map(item => item.id);
  const more = getMoreProposals(trip, destinations, seen, { limit: 4 });
  assert.ok(more.length > 0);
  assert.equal(more.some(item => seen.includes(item.id)), false);
});

test('Soft constraints remain visible trade-offs instead of silent rejection', () => {
  const trip = makeTrip({ budget: 700, strictBudget: false, days: 10, maxDrive: 5, maxChanges: 6 });
  const portfolio = buildProposalPortfolio(trip, destinations, { limit: 8 });
  assert.ok(portfolio.exact.length > 0);
  assert.ok(portfolio.exact.some(item => item.constraintStatus.softConstraints.some(issue => issue.key === 'budget')));
});

test('Selected destination offers three materially different itinerary variants', () => {
  const trip = makeTrip({ days: 10, budget: 4000, maxChanges: 6 });
  const destination = buildProposalPortfolio(trip, destinations, { limit: 8 }).exact[0];
  const variants = buildItineraryVariants(trip, destination);
  assert.equal(variants.length, 3);
  assert.deepEqual(variants.map(item => item.id), ['relaxed', 'balanced', 'active']);
  assert.equal(new Set(variants.map(item => `${item.metrics.total}:${item.metrics.flexDays}:${item.plan.days.filter(day => ['stay','flex'].includes(day.kind)).reduce((sum, day) => sum + day.distanceKm, 0)}`)).size, 3);
  assert.ok(variants.every(item => item.plan.days.length === trip.days && item.plan.days.at(-1).to === trip.origin));
});

test('Optimizer previews coordinated changes, honours locks and uses full rescoring', () => {
  const trip = makeTrip({ days: 11, budget: 3000, maxChanges: 10 });
  const destination = scoreDestination(trip, slovenia);
  const plan = buildItinerary(trip, destination);
  plan.days.forEach(day => { if (!['outward', 'return'].includes(day.kind)) day.rainAlternative = ''; });
  plan.days.forEach(day => { if (day.kind === 'flex') { day.kind = 'stay'; day.typeLabel = 'Verblijfsdag'; day.activityType = 'natuur'; } });
  const proposal = proposeOptimizations(trip, destination, plan, { mode: 'balanced' });
  assert.ok(proposal.actions.length >= 2);
  assert.ok(proposal.actions.some(action => action.id === 'weather'));
  assert.notDeepEqual(proposal.after.quality.rawDimensions, proposal.before.quality.rawDimensions);
  assert.equal(proposal.meaningful, true);
  const locked = proposeOptimizations(trip, destination, plan, { locks: { route: true, accommodation: true, activities: true, budget: true } });
  assert.equal(locked.actions.length, 0);
  assert.equal(locked.meaningful, false);
});

test('Optimizer cannot manufacture a score increase when no change is selected', () => {
  const trip = makeTrip({ days: 11, budget: 4000, maxChanges: 10 });
  const destination = scoreDestination(trip, slovenia);
  const plan = buildItinerary(trip, destination);
  const budget = buildBudget(trip, destination, plan);
  const before = calculateTripQuality(trip, destination, plan, budget);
  const unchanged = applyOptimizationProposal(trip, destination, plan, []);
  assert.equal(unchanged.quality.rawOverall, before.rawOverall);
  assert.deepEqual(unchanged.plan.days, plan.days);
});

test('Live discovery uses new deterministic search rings instead of a fixed destination cap', () => {
  const trip = makeTrip({ origin: 'Utrecht', days: 14, maxDrive: 6 });
  const first = discoverySeeds(trip, 0);
  const later = discoverySeeds(trip, 12);
  assert.ok(first.length >= 4 && later.length >= 4);
  assert.notDeepEqual(first.map(point => [point.lat, point.lon]), later.map(point => [point.lat, point.lon]));
  assert.match(buildDiscoveryQuery(trip, 12), /place.*city\|town/);
  assert.match(buildDiscoveryQuery(trip, 12), /timeout:8/);
});

test('OpenStreetMap discovery normalizes arbitrary towns into plannable dynamic regions', async () => {
  const trip = makeTrip({ origin: 'Utrecht', days: 12, maxDrive: 6 });
  const payload = { elements: [
    { type: 'node', id: 1001, lat: 50.85, lon: 4.35, tags: { name: 'Brussel', 'addr:country': 'BE', place: 'city' } },
    { type: 'node', id: 1002, lat: 49.61, lon: 6.13, tags: { name: 'Luxemburg', 'addr:country': 'LU', place: 'city' } },
    { type: 'node', id: 1003, lat: 50.93, lon: 11.59, tags: { name: 'Jena', 'addr:country': 'DE', place: 'city' } }
  ] };
  const dynamic = normalizeDiscoveredDestinations(trip, payload);
  assert.ok(dynamic.length >= 2);
  assert.ok(dynamic.every(item => item.dynamic && item.bases.length && Array.isArray(item.routeStops)));
  const discovered = await discoverDestinationBatch(trip, { cursor: 4, storage: null, fetchImpl: async () => ({ ok: true, json: async () => payload }) });
  assert.equal(discovered.live, true);
  assert.ok(discovered.destinations.every(item => item.id.startsWith('dynamic-')));
});

test('Normal proposals satisfy every hard destination constraint and stretch ideas are capped', () => {
  const trip = makeTrip({ days: 10, budget: 3500, maxDrive: 5, maxChanges: 5, allowStretch: true });
  const groups = rankDestinationGroups(trip, destinations);
  assert.ok(groups.exact.length > 0);
  assert.ok(groups.exact.every(item => item.constraintStatus.exact && item.constraintStatus.violations.length === 0));
  assert.ok(groups.stretched.length <= 2);
  assert.ok(groups.stretched.every(item => item.constraintStatus.violations.length === 1 && item.constraintStatus.violations[0].stretchable));
  assert.ok(groups.visible.every(item => item.category !== 'rejected'));
});

test('Rejected destinations provide a concrete smallest adjustment instead of a selectable plan', () => {
  const trip = makeTrip({ days: 4, budget: 1200, maxDrive: 3, maxChanges: 1, allowStretch: true });
  const groups = rankDestinationGroups(trip, destinations);
  assert.ok(groups.rejected.length > 0);
  assert.ok(groups.closestAdjustments.length > 0);
  assert.ok(groups.closestAdjustments.every(item => item.adjustments.length > 0));
  assert.ok(groups.visible.every(item => !groups.rejected.some(rejected => rejected.id === item.id)));
});

test('Trip-quality scores remain between 0 and 100', () => {
  const trip = makeTrip(); const destination = scoreDestination(trip, slovenia); const plan = buildItinerary(trip, destination); const budget = buildBudget(trip, destination, plan); const quality = calculateTripQuality(trip, destination, plan, budget);
  assert.ok(quality.overall >= 0 && quality.overall <= 100);
  Object.values(quality.dimensions).forEach(score => assert.ok(score >= 0 && score <= 100));
});

test('Optimisation preserves essential constraints', () => {
  const trip = makeTrip({ days: 11, maxChanges: 10 }); const plan = buildItinerary(trip, slovenia); const result = optimisePlan(trip, slovenia, plan);
  assert.equal(constraintsPreserved(plan, result.plan, trip), true);
  assert.equal(result.plan.days.length, trip.days);
  assert.equal(result.plan.days.at(-1).to, trip.origin);
});

test('Plan validation treats budget, time and accommodation changes as constraints', () => {
  const trip = makeTrip({ days: 11, maxChanges: 10, budget: 5000 });
  const destination = scoreDestination(trip, slovenia);
  const plan = buildItinerary(trip, destination);
  const budget = buildBudget(trip, destination, plan);
  const status = evaluatePlanConstraints(trip, plan, budget);
  assert.equal(status.exact, true);
  const tooExpensive = evaluatePlanConstraints({ ...trip, budget: 500 }, plan, budget);
  assert.equal(tooExpensive.exact, false);
  assert.ok(tooExpensive.violations.some(item => item.key === 'budget'));
});

test('Live place enrichment replaces generic sleep and restaurant proposals with named OSM places', async () => {
  const trip = makeTrip({ days: 5, maxDrive: 10, maxChanges: 5, liveData: true });
  const destination = scoreDestination(trip, destinations.find(item => item.id === 'blackforest'));
  const plan = buildItinerary(trip, destination);
  const payload = { elements: [
    { type: 'node', id: 11, lat: 48.13, lon: 8.23, tags: { tourism: 'hotel', name: 'Hotel Boszicht', website: 'https://example.test/hotel' } },
    { type: 'node', id: 12, lat: 48.131, lon: 8.231, tags: { amenity: 'restaurant', name: 'Gasthaus Wald', opening_hours: 'Mo-Su 17:00-22:00' } },
    { type: 'node', id: 13, lat: 48.132, lon: 8.232, tags: { tourism: 'viewpoint', name: 'Uitzichtpunt Hoog' } }
  ] };
  const fetchImpl = async () => ({ ok: true, json: async () => payload });
  const enriched = await enrichPlanWithPlaces(trip, destination, plan, { fetchImpl, storage: null });
  assert.equal(enriched.placeData.live, true);
  assert.ok(enriched.recommendations.some(item => item.name === 'Hotel Boszicht' && item.source.includes('Overpass')));
  assert.ok(enriched.recommendations.some(item => item.name === 'Gasthaus Wald'));
  assert.match(buildOverpassQuery(plan), /tourism/);
  assert.equal(normalizeOverpassPlaces(payload).length, 3);
});

test('Unknown origins can be geocoded once without changing the entered place name', async () => {
  const point = await geocodeOrigin('Oldenzaal', {
    storage: null,
    fetchImpl: async () => ({ ok: true, json: async () => [{ lat: '52.313', lon: '6.929' }] })
  });
  assert.deepEqual(point, { lat: 52.313, lon: 6.929, name: 'Oldenzaal', source: 'OpenStreetMap Nominatim' });
});

test('Optimisation supports one-step undo', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia); const snapshot = createUndoSnapshot(plan); const optimized = optimisePlan(trip, slovenia, plan).plan;
  assert.notDeepEqual(optimized, plan);
  assert.deepEqual(restorePlan(snapshot), plan);
});

function assertWellFormedXml(xml) {
  const stripped = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!--.*?-->/gs, '');
  const stack = [];
  for (const match of stripped.matchAll(/<\/?([A-Za-z_:][\w:.-]*)(?:\s[^>]*)?\/?>/g)) {
    const token = match[0]; const name = match[1];
    if (token.startsWith('</')) assert.equal(stack.pop(), name, `Unexpected closing tag ${name}`);
    else if (!token.endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, []);
}

test('GPX is well-formed XML and only contains valid coordinates', () => {
  const trip = makeTrip(); const plan = buildItinerary(trip, slovenia); const xml = createGpx(trip, slovenia, plan);
  assertWellFormedXml(xml);
  assert.match(xml, /<gpx version="1\.1"/);
  assert.match(xml, /<type>accommodation<\/type>/);
  assert.ok([...xml.matchAll(/<trkpt /g)].length > 2);
  for (const [, lat, lon] of xml.matchAll(/(?:wpt|trkpt) lat="([^"]+)" lon="([^"]+)"/g)) {
    assert.ok(Math.abs(Number(lat)) <= 90); assert.ok(Math.abs(Number(lon)) <= 180);
  }
});

test('Routing requests include route style and motorhome restrictions', () => {
  const trip = makeTrip({
    transport: 'motorhome', routeStyle: 'fastest', fuelRangeKm: 480,
    vehicleMaxSpeedKmh: 95, vehicleHeightM: 3.25, vehicleLengthM: 7.8, vehicleWeightKg: 3850
  });
  const day = buildItinerary(trip, slovenia).days.find(item => item.kind === 'outward');
  const request = buildRoutingRequest(trip, day);
  assert.deepEqual(request.origin, { lat: day.fromPoint.lat, lon: day.fromPoint.lon });
  assert.equal(request.vehicle.routeMode, 'truck');
  assert.equal(request.vehicle.routeStyle, 'fastest');
  assert.equal(request.vehicle.heightM, 3.25);
  assert.equal(request.vehicle.lengthM, 7.8);
  assert.equal(request.vehicle.weightKg, 3850);
});

test('A complete live routing response replaces corridor geometry without mutating the original plan', async () => {
  const trip = makeTrip({ transport: 'motorcycle', days: 8 });
  const original = buildItinerary(trip, slovenia);
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    const middle = {
      lat: Number(((request.origin.lat + request.destination.lat) / 2).toFixed(5)),
      lon: Number(((request.origin.lon + request.destination.lon) / 2).toFixed(5))
    };
    return {
      ok: true,
      json: async () => ({ provider: 'tomtom', distanceKm: 280, roadHours: 3.6, geometry: [request.origin, middle, request.destination] })
    };
  };
  const live = await enrichPlanWithLiveRouting(trip, slovenia, original, { apiUrl: 'https://routing.example.test', fetchImpl });
  const originalTravelDays = original.days.filter(day => ['outward', 'return', 'transfer'].includes(day.kind));
  const liveTravelDays = live.days.filter(day => ['outward', 'return', 'transfer'].includes(day.kind));
  assert.equal(originalTravelDays.every(day => day.routeSource === 'offline-corridor'), true);
  assert.equal(live.routing.live, true);
  assert.equal(live.routing.completedSegments, liveTravelDays.length);
  assert.equal(liveTravelDays.every(day => day.routeSource === 'tomtom' && day.geometry.length === 3), true);
  assert.equal(live.routeMetrics.routeSource, 'tomtom');
});

test('TomTom gateway adapter applies motorcycle and dimension parameters and normalizes routes', () => {
  const motorcycleUrl = buildTomTomUrl({
    origin: { lat: 52.09, lon: 5.12 }, destination: { lat: 48.2, lon: 16.37 },
    vehicle: vehicleSpec(makeTrip({ transport: 'motorcycle', routeStyle: 'scenic' }))
  }, 'test-key');
  assert.equal(motorcycleUrl.searchParams.get('travelMode'), 'motorcycle');
  assert.equal(motorcycleUrl.searchParams.get('routeType'), 'thrilling');
  assert.equal(motorcycleUrl.searchParams.get('key'), 'test-key');

  const motorhomeUrl = buildTomTomUrl({
    origin: { lat: 52.09, lon: 5.12 }, destination: { lat: 48.2, lon: 16.37 },
    vehicle: vehicleSpec(makeTrip({ transport: 'motorhome', vehicleHeightM: 3.2, vehicleLengthM: 7.5, vehicleWeightKg: 3700 }))
  }, 'test-key');
  assert.equal(motorhomeUrl.searchParams.get('travelMode'), 'truck');
  assert.equal(motorhomeUrl.searchParams.get('vehicleHeight'), '3.2');
  assert.equal(motorhomeUrl.searchParams.get('vehicleLength'), '7.5');
  assert.equal(motorhomeUrl.searchParams.get('vehicleWeight'), '3700');
  assert.equal(motorhomeUrl.searchParams.get('vehicleCommercial'), 'false');

  const normalized = normalizeTomTomRoute({ routes: [{
    summary: { lengthInMeters: 123400, travelTimeInSeconds: 7200 },
    legs: [
      { points: [{ latitude: 52, longitude: 5 }, { latitude: 51, longitude: 6 }] },
      { points: [{ latitude: 51, longitude: 6 }, { latitude: 50, longitude: 7 }] }
    ]
  }] });
  assert.equal(normalized.distanceKm, 123.4);
  assert.equal(normalized.roadHours, 2);
  assert.deepEqual(normalized.geometry, [{ lat: 52, lon: 5 }, { lat: 51, lon: 6 }, { lat: 50, lon: 7 }]);
});

test('JSON export is parseable and export filenames are safe', () => {
  const payload = { version: '0.8.0', trip: makeTrip() };
  assert.deepEqual(JSON.parse(createJson(payload)), payload);
  assert.equal(safeFilename('Slovenië / Test 2026', 'gpx'), 'slovenie-test-2026.gpx');
});

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

test('Old stored data migrates without crashing and discards stale derived plans', () => {
  const legacy = { trip: makeTrip(), destination: { id: 'slovenia' }, itinerary: [{ location: 'Saasveld' }], savedAt: '2026-01-01T00:00:00Z' };
  const migrated = migrateState(legacy);
  assert.equal(migrated.destinationId, 'slovenia');
  assert.equal(migrated.needsRebuild, true);
  assert.equal('itinerary' in migrated, false);
  const storage = new MemoryStorage(); storage.setItem('reisslim.current.v2', JSON.stringify(legacy));
  assert.doesNotThrow(() => loadDraft(storage));
  saveDraft(migrated, storage); assert.ok(storage.getItem('reisslim.current.v8'));
});

test('Global discovery is not clipped to Europe and supports targeted locations', () => {
  const globalTrip = makeTrip({ travelMode: 'fly-drive', destinationPoint: { lat: -22.56, lon: 17.08, name: 'Windhoek' } });
  const seeds = discoverySeeds(globalTrip, 0, 8);
  assert.equal(seeds.length, 8);
  assert.ok(seeds.every(point => point.lat < 0));
  assert.match(buildDiscoveryQueries(globalTrip, 0)[1].query, /national_park/);
});

test('Loop topology reduces geometric overlap compared with an identical return', () => {
  const outbound = [{ lat: 52, lon: 6 }, { lat: 50, lon: 8 }, { lat: 48, lon: 10 }];
  const alternate = [{ lat: 48, lon: 10 }, { lat: 50.8, lon: 6.8 }, { lat: 52, lon: 6 }];
  assert.equal(geometryOverlap(outbound, outbound), 1);
  assert.ok(routeExplorationMetrics(outbound, alternate).explorationScore > 0);
});

test('Namibia fly-drive builds honest multi-modal segments and uncertainty range', () => {
  const trip = makeTrip({ travelMode: 'fly-drive', routeTopology: 'open-jaw', maxDrive: 12, transport: 'car', days: 14, budget: 9000, originPoint: { lat: 52.09, lon: 5.12 } });
  const namibia = destinations.find(item => item.id === 'namibia-fixture');
  const plan = buildItinerary(trip, namibia);
  const costs = estimateAccessCosts(trip, namibia);
  assert.equal(plan.days.length, 14);
  assert.equal(plan.accessSegments.some(segment => segment.mode === 'flight' && segment.bookable === false), true);
  assert.ok(plan.accessSegments[0].durationHours > 0);
  assert.equal(plan.days[0].schedule.departure, undefined);
  assert.equal(plan.days.some(day => day.kind === 'transfer'), true);
  assert.ok(costs.low < costs.central && costs.high > costs.central);
  assert.equal(buildAccessSegments(trip, namibia).every(segment => segment.scheduleVerified === false || segment.mode === 'rental'), true);
});

test('An explicitly requested destination outside constraints is explained, not silently ranked as a normal proposal', () => {
  const trip = makeTrip({ travelMode: 'fly-drive', destinationQuery: 'Namibië', budget: 5000 });
  const portfolio = buildProposalPortfolio(trip, destinations, { limit: 8 });
  assert.equal(portfolio.requestedMismatch?.id, 'namibia-fixture');
  assert.equal(portfolio.visible.some(item => item.id === 'namibia-fixture'), false);
  assert.ok(portfolio.requestedMismatch.constraintStatus.violations.length > 0);
});

test('Travel readiness never claims unverified entry or advisory data is complete', () => {
  const trip = makeTrip({ travelMode: 'fly-drive', remoteTravel: true });
  const namibia = destinations.find(item => item.id === 'namibia-fixture');
  const readiness = buildTravelReadiness(trip, namibia, buildItinerary(trip, namibia));
  assert.ok(readiness.blockers >= 3);
  assert.equal(readiness.items.find(item => item.id === 'documents').verified, false);
});

test('Provider platform enforces request budgets and reports degraded health', () => {
  const budget = createRequestBudget({ maximum: 2 });
  assert.equal(budget.claim(), true); assert.equal(budget.claim(), true); assert.equal(budget.claim(), false);
  const health = providerHealth([providerEnvelope('a', {}), providerEnvelope('b', null, { status: 'unavailable' })]);
  assert.equal(health.status, 'degraded');
});

test('Local learning is evidence-based, bounded and disabled in private mode', () => {
  let profile = emptyPreferenceProfile();
  profile = recordPreferenceEvent(profile, { kind: 'save', tags: ['natuur'] });
  profile = recordPreferenceEvent(profile, { kind: 'select', tags: ['natuur'] });
  assert.ok(preferenceBonus({ tags: ['natuur'] }, profile).score > 0);
  profile.privateMode = true;
  assert.equal(preferenceBonus({ tags: ['natuur'] }, profile).score, 0);
});

test('Assistant previews deterministic changes before applying them', () => {
  const trip = makeTrip();
  const preview = interpretAssistantMessage('maak de reis rustiger', trip);
  assert.equal(preview.requiresConfirmation, true);
  assert.equal(applyAssistantPatch(trip, { days: 12 }).days, 12);
  assert.equal(interpretAssistantMessage('boek een vlucht voor mij', trip).understood, false);
});

test('Weather and open-license image metadata normalize without false verification', () => {
  assert.equal(weatherCondition(95).id, 'storm');
  assert.ok(weatherSuitability({ weatherCode: 95, windKmh: 70, precipitationChance: 90 }, makeTrip({ transport: 'motorcycle' })).score < 40);
  const image = normalizeCommonsImage({ query: { pages: { 1: { pageid: 1, title: 'File:Test.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/test.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Test.jpg', extmetadata: { Artist: { value: 'Maker' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } });
  assert.equal(image.license, 'CC BY-SA 4.0');
});
