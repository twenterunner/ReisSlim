import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrip } from '../trip-model.js';
import { addDays } from '../itinerary-engine.js';
import { calculateTripQuality, qualityDimensionLabels } from '../trip-quality-engine.js';
import { applyOptimizationProposal, constraintsPreserved, optimisePlan, proposeOptimizations } from '../trip-optimizer.js';

const origin = { name: 'Start', lat: 52.2, lon: 6.8 };
const baseA = { name: 'Basis A', lat: 50.1, lon: 5.1 };
const baseB = { name: 'Basis B', lat: 49.4, lon: 5.8 };

const makeTrip = overrides => normalizeTrip({
  id: 'quality-trip', tripName: 'Quality fixture', origin: origin.name, originPoint: origin,
  startDate: '2026-09-03', days: 14, budget: 8000, adults: 2, children: 0,
  transport: 'car', travelMode: 'direct', routeTopology: 'loop', tripPace: 'balanced',
  maxDrive: 6, maxChanges: 5, comfort: 'mid', strictBudget: true, strictDrive: true,
  strictChanges: true, allowStretch: false, liveData: false, fuelRangeKm: 650,
  preferences: ['natuur'], preferenceWeights: { natuur: 3 }, ...overrides
});

const destination = {
  id: 'fixture-region', name: 'Fixture Region', country: 'Fixtureland', dynamic: true,
  distanceKm: 250, nightMid: 90, activityDaily: 25, toll: 0, category: 'exact',
  bases: [baseA, baseB], tags: ['natuur'], remoteReadinessRequired: false,
  activities: Array.from({ length: 8 }, (_, index) => ({ type: 'natuur', title: `Ervaring ${index + 1}`, rainAlternative: `Binnenoptie ${index + 1}`, tags: ['natuur'] })),
  highlights: Array.from({ length: 8 }, (_, index) => ({ id: `h-${index + 1}`, name: `Highlight ${index + 1}`, point: { lat: 50 + index * .04, lon: 5 + index * .04 }, evidence: `Provider evidence ${index + 1}` }))
};

function recommendation(day, type, name, vehicle = 'car') {
  return {
    id: `d${day}-${type}-${name}`,
    day, type, name, vehicleProfileId: vehicle, vehicleFit: [vehicle],
    live: true, verified: false, source: 'Recorded provider fixture', point: baseA
  };
}

function day({ day, kind, from, to, pointFrom, pointTo, primaryPlan = 'Dezelfde korte dorpswandeling', overnight = to, geometry = null, vehicle = 'car' }) {
  const local = from === to;
  const recommendations = kind === 'return' ? [] : [
    recommendation(day, 'accommodation', `Hotel ${overnight}`, vehicle),
    recommendation(day, 'restaurant', `Restaurant ${overnight}`, vehicle),
    ...(!['outward', 'return', 'transfer'].includes(kind) ? [recommendation(day, 'activity', primaryPlan, vehicle)] : [])
  ];
  return {
    day, date: addDays('2026-09-03', day - 1), kind,
    typeLabel: kind, from, to, location: to, overnight,
    fromPoint: pointFrom, toPoint: pointTo,
    distanceKm: local ? 18 : 180, roadHours: local ? .4 : 2.5,
    driveHours: local ? .4 : 2.8, elapsedHours: local ? .4 : 2.8,
    breakHours: local ? 0 : .3, restStops: 0, fuelStops: 0, stopCount: 0,
    waypoints: [], geometry: geometry || [pointFrom, pointTo], routeSource: 'recorded-road-fixture',
    activityType: local ? 'natuur' : null, primaryPlan,
    rainAlternative: 'Named indoor alternative', recommendations,
    sleepProposal: recommendations.find(item => item.type === 'accommodation') || null,
    exceedsDailyLimit: false
  };
}

function weakMicroLoopPlan() {
  const days = [day({ day: 1, kind: 'outward', from: origin.name, to: baseA.name, pointFrom: origin, pointTo: baseA })];
  const repeatedPoi = { name: 'Repeated Viewpoint', lat: 50.12, lon: 5.12 };
  for (let index = 2; index < 14; index += 1) {
    days.push(day({
      day: index, kind: 'stay', from: baseA.name, to: baseA.name, pointFrom: baseA, pointTo: baseA,
      geometry: [baseA, repeatedPoi, baseA], overnight: baseA.name
    }));
  }
  days.push(day({ day: 14, kind: 'return', from: baseA.name, to: origin.name, pointFrom: baseA, pointTo: origin, overnight: origin.name }));
  return {
    days,
    recommendations: days.flatMap(item => item.recommendations),
    accommodationChanges: 0,
    feasible: true,
    constraintStatus: { category: 'exact', exact: true, stretch: false, violations: [], softConstraints: [] },
    routeGraph: { graph: destination.highlights, evidence: ['8 provider anchors'] },
    routeMetrics: { origin, originKnown: true, oneWayDistanceKm: 250, exploration: { explorationScore: 12, overlap: .9 } },
    routing: { live: false, source: 'recorded-road-fixture', label: 'Recorded route fixture' }
  };
}

function twoBaseMetropolitanPlan() {
  const closeB = { name: 'Basis B', lat: 50.18, lon: 5.22 };
  const days = [day({ day: 1, kind: 'outward', from: origin.name, to: baseA.name, pointFrom: origin, pointTo: baseA })];
  for (let index = 2; index <= 6; index += 1) days.push(day({ day: index, kind: 'stay', from: baseA.name, to: baseA.name, pointFrom: baseA, pointTo: baseA, primaryPlan: `Provideractiviteit A ${index}` }));
  days.push(day({ day: 7, kind: 'transfer', from: baseA.name, to: closeB.name, pointFrom: baseA, pointTo: closeB }));
  for (let index = 8; index <= 13; index += 1) days.push(day({ day: index, kind: 'stay', from: closeB.name, to: closeB.name, pointFrom: closeB, pointTo: closeB, primaryPlan: `Provideractiviteit B ${index}`, overnight: closeB.name }));
  days.push(day({ day: 14, kind: 'return', from: closeB.name, to: origin.name, pointFrom: closeB, pointTo: origin, overnight: origin.name }));
  return {
    days, recommendations: days.flatMap(item => item.recommendations), accommodationChanges: 1, feasible: true,
    constraintStatus: { category: 'exact', exact: true, stretch: false, violations: [], softConstraints: [] },
    routeGraph: { graph: destination.highlights, evidence: ['provider evidence'] },
    routeMetrics: { origin, originKnown: true, oneWayDistanceKm: 250, exploration: { explorationScore: 70, overlap: .2 } },
    routing: { live: false, source: 'recorded-road-fixture', label: 'Recorded route fixture' }
  };
}

function roundTripBlockPlan({ stale = false } = {}) {
  const startDate = stale ? '2026-08-07' : '2026-09-03';
  const vehicle = stale ? 'motorcycle' : 'car';
  const days = [
    day({ day: 1, kind: 'outward', from: origin.name, to: baseA.name, pointFrom: origin, pointTo: baseA, vehicle }),
    day({ day: 2, kind: 'stay', from: baseA.name, to: baseA.name, pointFrom: baseA, pointTo: baseA, primaryPlan: 'Rivierpad A', vehicle }),
    day({ day: 3, kind: 'transfer', from: baseA.name, to: baseB.name, pointFrom: baseA, pointTo: baseB, vehicle }),
    day({ day: 4, kind: 'stay', from: baseB.name, to: baseB.name, pointFrom: baseB, pointTo: baseB, primaryPlan: 'Korte stop B', overnight: baseB.name, vehicle }),
    day({ day: 5, kind: 'transfer', from: baseB.name, to: baseA.name, pointFrom: baseB, pointTo: baseA, vehicle }),
    day({ day: 6, kind: 'stay', from: baseA.name, to: baseA.name, pointFrom: baseA, pointTo: baseA, primaryPlan: 'Bosdag A', vehicle }),
    day({ day: 7, kind: 'return', from: baseA.name, to: origin.name, pointFrom: baseA, pointTo: origin, overnight: origin.name, vehicle })
  ];
  if (stale) days.forEach((item, index) => { item.date = addDays(startDate, index); });
  return {
    days, recommendations: days.flatMap(item => item.recommendations), accommodationChanges: 2,
    feasible: true, constraintStatus: { category: 'exact', exact: true, stretch: false, violations: [], softConstraints: [] },
    routeMetrics: { origin, originKnown: true, oneWayDistanceKm: 250, exploration: { explorationScore: 50, overlap: .5 } },
    routing: { live: false, source: 'recorded-road-fixture', label: 'Recorded route fixture' }
  };
}

test('Quality exposes every explicit structural and evidence dimension', () => {
  const trip = makeTrip();
  const plan = weakMicroLoopPlan();
  const quality = calculateTripQuality(trip, destination, plan, { total: 3000, conservativeTotal: 3400 });
  assert.deepEqual(Object.keys(quality.dimensions), Object.keys(qualityDimensionLabels));
  Object.values(quality.dimensions).forEach(score => assert.ok(score >= 0 && score <= 100));
  assert.equal(typeof quality.evidence.corridorRepetitionRatio, 'number');
  assert.equal(typeof quality.evidence.evidenceRatio, 'number');
});

test('A weak fourteen-day micro-loop cannot pass trip quality', () => {
  const quality = calculateTripQuality(makeTrip(), destination, weakMicroLoopPlan(), { total: 3000, conservativeTotal: 3400 });
  assert.equal(quality.evidence.weakMicroLoop, true);
  assert.equal(quality.passes, false);
  assert.ok(quality.overall <= 54);
  assert.ok(quality.gate.reasons.some(reason => /herhaalt/i.test(reason)));
  assert.equal(quality.evidence.uniqueBases, 1);
  assert.ok(quality.evidence.uniqueExperiences < quality.evidence.targetExperiences);
});

test('A fourteen-day country request rejects a two-base metropolitan micro-tour despite distinct named activities', () => {
  const scopedDestination = { ...destination, destinationScope: { geographicType: 'country', boundarySpanKm: 1800, providerId: 'relation/fixture' } };
  const quality = calculateTripQuality(makeTrip(), scopedDestination, twoBaseMetropolitanPlan(), { total: 3000, conservativeTotal: 3400 });
  assert.equal(quality.evidence.weakGeographicCoverage, true);
  assert.ok(quality.evidence.achievedRouteSpanKm < quality.evidence.targetRouteSpanKm * .75);
  assert.equal(quality.passes, false);
  assert.ok(quality.gate.reasons.some(reason => /microlus|bestrijkt/i.test(reason)));
});

test('Structural optimizer reports exact affected days and before/after state', () => {
  const trip = makeTrip({ days: 7, maxChanges: 4 });
  const source = roundTripBlockPlan();
  const result = applyOptimizationProposal(trip, destination, source, ['consolidate']);
  assert.equal(result.changes.length, 1);
  const change = result.changes[0];
  assert.equal(change.actionId, 'consolidate');
  assert.equal(change.structural, true);
  assert.deepEqual(change.affectedDays, [3, 4, 5]);
  assert.equal(change.before.length, change.after.length);
  assert.notDeepEqual(change.before, change.after);
  assert.equal(result.plan.days.length, trip.days);
  assert.equal(result.plan.days.at(-1).to, trip.origin);
});

test('Optimizer rebuilds dates and vehicle recommendations from the current request', () => {
  const trip = makeTrip({ days: 7, startDate: '2026-09-03', transport: 'car', maxChanges: 4 });
  const result = applyOptimizationProposal(trip, destination, roundTripBlockPlan({ stale: true }), ['consolidate']);
  assert.ok(result.plan.days.every((item, index) => item.date === addDays(trip.startDate, index)));
  assert.ok(result.plan.recommendations.every(item => item.vehicleProfileId === 'car' && item.vehicleFit.includes('car')));
  assert.equal(constraintsPreserved(roundTripBlockPlan({ stale: true }), result.plan, trip), true);
});

test('A no-op optimizer still canonicalizes stale dates and vehicle data', () => {
  const trip = makeTrip({ days: 7, startDate: '2026-09-03', transport: 'car', maxChanges: 4 });
  const result = optimisePlan(trip, destination, roundTripBlockPlan({ stale: true }), {
    locks: { route: true, accommodation: true, activities: true, budget: true }
  });
  assert.deepEqual(result.changes, []);
  assert.ok(result.plan.days.every((item, index) => item.date === addDays(trip.startDate, index)));
  assert.ok(result.plan.recommendations.every(item => item.vehicleProfileId === 'car' && item.vehicleFit.includes('car')));
});

test('Optimizer suppresses textual and negligible pseudo-improvements', () => {
  const trip = makeTrip({ days: 7, maxChanges: 4 });
  const plan = roundTripBlockPlan();
  const locked = proposeOptimizations(trip, destination, plan, { locks: { route: true, accommodation: true, activities: true, budget: true } });
  assert.deepEqual(locked.actions, []);
  assert.deepEqual(locked.changeSet, []);
  assert.equal(locked.meaningful, false);
  assert.match(locked.threshold, /structurele/i);
});
