import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItinerary, collectRouteSegments, itineraryIntegrityIssues } from '../itinerary-engine.js';
import { graphEdge, planHighlightRoute } from '../route-graph-engine.js';
import { normalizeTrip } from '../trip-model.js';

const makeTrip = overrides => normalizeTrip({
  origin: 'Home', originPoint: { name: 'Home', lat: 50, lon: 4 }, startDate: '2027-05-01',
  days: 14, budget: 9000, adults: 2, children: 0, travelMode: 'fly-drive', routeTopology: 'loop',
  transport: 'car', maxDrive: 5, maxChanges: 6, comfort: 'mid', strictBudget: true, strictDrive: true,
  strictChanges: true, allowStretch: false, liveData: true, preferences: ['natuur'], preferenceWeights: { natuur: 3 },
  ...overrides
});

const highlight = (id, name, baseName, lat, lon, sequence, overrides = {}) => ({
  id, name, baseName, point: { lat: lat + .04, lon: lon + .03 }, overnightPoint: { lat, lon },
  sequence, priority: 7, minimumTripDays: 3, minimumNights: 1, tags: ['natuur'],
  activity: `Ontdek ${name}.`, rainAlternative: `Binnenalternatief bij ${baseName}.`, evidence: `fixture/${id}`,
  ...overrides
});

const dynamicDestination = overrides => ({
  id: 'dynamic-fixture', name: 'Provider region', country: 'Provider boundary', dynamic: true,
  distanceKm: 650, driveHours: 1, roadDistanceFactor: 1.12, nightMid: 110, activityDaily: 40, toll: 0,
  tags: ['natuur'], bases: [
    { name: 'Gateway', lat: 0, lon: 0 }, { name: 'Ridge Base', lat: .8, lon: .5 },
    { name: 'Lake Base', lat: 1.5, lon: 1.0 }, { name: 'Forest Base', lat: .7, lon: 1.7 }
  ],
  activities: [],
  highlights: [
    highlight('gateway', 'Gateway orientation', 'Gateway', 0, 0, 0, { gateway: true, priority: 9 }),
    highlight('ridge-view', 'Ridge View', 'Ridge Base', .8, .5, 1, { priority: 8, tags: ['natuur', 'motor'] }),
    highlight('ridge-walk', 'Ridge Walk', 'Ridge Base', .8, .5, 2, { priority: 7, tags: ['natuur', 'bergen'] }),
    highlight('lake', 'Lake Reserve', 'Lake Base', 1.5, 1.0, 3, { priority: 9 }),
    highlight('forest', 'Forest Trail', 'Forest Base', .7, 1.7, 4, { priority: 8 })
  ],
  ...overrides
});

test('beam route allocates scale-aware base blocks in chronological order', () => {
  const trip = makeTrip();
  const plan = buildItinerary(trip, dynamicDestination());
  assert.equal(plan.days.length, trip.days);
  assert.equal(plan.routeGraph.search.strategy, 'deterministic-beam');
  assert.ok(plan.routeGraph.baseVisits.length >= 3);
  assert.deepEqual(itineraryIntegrityIssues(plan, trip), []);
  for (let index = 1; index < plan.days.length; index += 1) assert.equal(plan.days[index].from, plan.days[index - 1].overnight);

  const compressed = plan.days.map(day => day.overnight).filter(name => name !== trip.origin)
    .filter((name, index, list) => index === 0 || name !== list[index - 1]);
  const nonGateway = compressed.filter(name => name !== compressed[0]);
  assert.equal(new Set(nonGateway).size, nonGateway.length, 'a non-gateway base may not be re-entered later');
});

test('stay days use unique highlights and unique explanatory text', () => {
  const plan = buildItinerary(makeTrip(), dynamicDestination());
  const activityDays = plan.days.filter(day => ['stay', 'flex'].includes(day.kind));
  const ids = activityDays.map(day => day.activityId).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(activityDays.map(day => day.primaryPlan)).size, activityDays.length);
});

test('every canonical travel day has one matching map segment', () => {
  const plan = buildItinerary(makeTrip(), dynamicDestination());
  const travelDays = plan.days.filter(day => ['outward', 'transfer', 'return'].includes(day.kind));
  const segments = collectRouteSegments(plan);
  assert.deepEqual(plan.routeSegments, segments);
  for (const day of travelDays) {
    const matching = segments.filter(segment => segment.day === day.day);
    assert.equal(matching.length, 1);
    assert.ok(matching[0].points.length >= 2);
    assert.equal(matching[0].from, day.from);
    assert.equal(matching[0].to, day.to);
  }
});

test('motorcycle edges are slower and motorcycle evidence affects deterministic selection', () => {
  const destination = dynamicDestination({
    bases: [{ name: 'Gateway', lat: 0, lon: 0 }, { name: 'Scenic Base', lat: .7, lon: .7 }, { name: 'Culture Base', lat: -.7, lon: .7 }],
    highlights: [
      highlight('gateway', 'Gateway orientation', 'Gateway', 0, 0, 0, { gateway: true, priority: 9, tags: [] }),
      highlight('scenic', 'Scenic Pass', 'Scenic Base', .7, .7, 1, { priority: 6, tags: ['motor', 'bergen'], roadEvidence: { scenic: true, surface: 'asphalt', routeRelation: true, motorcycleAccess: 'yes' } }),
      highlight('culture', 'City Museum', 'Culture Base', -.7, .7, 2, { priority: 8, tags: ['cultuur'] })
    ]
  });
  const carTrip = makeTrip({ days: 6, transport: 'car', preferences: [], preferenceWeights: {} });
  const motorcycleTrip = makeTrip({ days: 6, travelMode: 'fly-ride', transport: 'motorcycle', preferences: [], preferenceWeights: {} });
  const [from, to] = destination.highlights;
  assert.ok(graphEdge(motorcycleTrip, from, to, destination).elapsedHours > graphEdge(carTrip, from, to, destination).elapsedHours);
  assert.ok(graphEdge(motorcycleTrip, destination.highlights[0], destination.highlights[1], destination).scenicValue > 0);
  assert.equal(planHighlightRoute(carTrip, destination).baseVisits[1].baseName, 'Culture Base');
  assert.equal(planHighlightRoute(motorcycleTrip, destination).baseVisits[1].baseName, 'Scenic Base');
});

test('a direct European tour budgets multi-day access inside the same canonical graph', () => {
  const request = makeTrip({
    origin: 'Saasveld', originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    travelMode: 'direct', transport: 'motorcycle', maxChanges: 7
  });
  const destination = dynamicDestination({
    distanceKm: 760,
    bases: [
      { name: 'Gateway', lat: 48.14, lon: 11.58 },
      { name: 'Alpine Base', lat: 47.75, lon: 12.3 },
      { name: 'Lake Base', lat: 47.35, lon: 11.2 },
      { name: 'Pass Base', lat: 46.95, lon: 10.7 }
    ],
    highlights: [
      highlight('gateway', 'Gateway orientation', 'Gateway', 48.14, 11.58, 0, { gateway: true, priority: 9 }),
      highlight('alpine-road', 'Scenic mountain road', 'Alpine Base', 47.75, 12.3, 1, { priority: 9, tags: ['motor', 'bergen'] }),
      highlight('alpine-view', 'Mountain viewpoint', 'Alpine Base', 47.75, 12.3, 2, { priority: 8, tags: ['motor', 'natuur'] }),
      highlight('lake-road', 'Lakeside road', 'Lake Base', 47.35, 11.2, 3, { priority: 8, tags: ['motor', 'natuur'] }),
      highlight('pass-road', 'High pass road', 'Pass Base', 46.95, 10.7, 4, { priority: 8, tags: ['motor', 'bergen'] })
    ]
  });
  const plan = buildItinerary(request, destination);
  const outward = plan.days.filter(day => day.kind === 'outward');
  const returns = plan.days.filter(day => day.kind === 'return');
  assert.ok(outward.length > 1, 'access to the touring region should be split across feasible days');
  assert.ok(returns.length > 1, 'return access should be split across feasible days');
  assert.equal(plan.days.length, request.days);
  assert.ok(plan.days.every(day => day.elapsedHours <= request.maxDrive + .05));
  assert.deepEqual(itineraryIntegrityIssues(plan, request), []);
  for (const day of plan.days.filter(day => ['outward', 'transfer', 'return'].includes(day.kind))) {
    assert.equal(plan.routeSegments.filter(segment => segment.day === day.day).length, 1);
  }
});
