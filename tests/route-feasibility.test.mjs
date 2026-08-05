import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDestinationProfiles } from '../catalog-runtime.js';
import { evaluatePlanConstraints } from '../constraint-engine.js';
import { scoreDestination } from '../destination-engine.js';
import { assessPlanRouteFeasibility, graphEdge } from '../route-graph-engine.js';
import { normalizeTrip } from '../trip-model.js';
import { COUNTRY_PACK as MALTA_PACK } from '../catalog-mt.js';

function trip(overrides = {}) {
  return normalizeTrip({
    id: 'route-feasibility', tripName: 'Route feasibility', origin: 'Saasveld',
    originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 }, destinationQuery: 'Malta',
    startDate: '2027-06-01', days: 7, budget: 8000, adults: 2, children: 0,
    transport: 'car', travelMode: 'fly-drive', routeTopology: 'loop', tripPace: 'balanced',
    routeStyle: 'balanced', fuelRangeKm: 600, maxDrive: 6, maxChanges: 6, comfort: 'mid',
    strictBudget: true, strictDrive: true, strictChanges: true, allowStretch: true,
    liveData: false, preferences: ['cultuur'], preferenceWeights: { cultuur: 2 }, ...overrides
  });
}

const node = (id, lat, lon, extra = {}) => ({
  id, name: id, baseName: id, overnightPoint: { lat, lon }, ...extra
});

function corridor(overrides = {}) {
  return {
    id: 'mainland-island', from: 'mainland', to: 'island', distanceKm: 80,
    carMovingHours: 1.5, fallbackGeometry: [{ lat: 35.9, lon: 14.4 }, { lat: 36, lon: 14.3 }],
    vehicleCompatibility: {}, ...overrides
  };
}

function dayFromEdge(edge, day = 2) {
  return {
    day, kind: 'transfer', from: 'mainland', to: 'island', overnight: 'island',
    elapsedHours: edge.elapsedHours, routeSource: edge.routeSource, routeEvidenceScope: edge.routeEvidenceScope,
    routeEvidenceClassification: edge.routeEvidenceClassification, connectivityStatus: edge.connectivityStatus,
    requiresFerryEvidence: edge.requiresFerryEvidence, ferryEvidenceExplicit: edge.ferryEvidenceExplicit
  };
}

function constraintPlan(routeFeasibility) {
  return {
    days: [
      { day: 1, kind: 'outward', from: 'Saasveld', to: 'mainland', overnight: 'mainland', elapsedHours: 1 },
      { day: 2, kind: 'transfer', from: 'mainland', to: 'island', overnight: 'island', elapsedHours: 2 },
      { day: 3, kind: 'stay', from: 'island', to: 'island', overnight: 'island', elapsedHours: 0 },
      { day: 4, kind: 'stay', from: 'island', to: 'island', overnight: 'island', elapsedHours: 0 },
      { day: 5, kind: 'stay', from: 'island', to: 'island', overnight: 'island', elapsedHours: 0 },
      { day: 6, kind: 'stay', from: 'island', to: 'island', overnight: 'island', elapsedHours: 0 },
      { day: 7, kind: 'return', from: 'island', to: 'Saasveld', overnight: 'Saasveld', elapsedHours: 1 }
    ],
    accommodationChanges: 1,
    routeFeasibility
  };
}

test('estimated catalogue adjacency is explicitly stretch-only rather than normal exact', () => {
  const from = node('mainland', 35.9, 14.4);
  const to = node('island', 35.95, 14.45);
  const edge = graphEdge(trip(), from, to, { corridors: [corridor({ to: 'island', routeEvidenceScope: 'estimated' })] });
  assert.equal(edge.routeEvidenceClassification, 'estimated');
  assert.equal(edge.connectivityStatus, 'estimated-adjacency');
  assert.equal(edge.routeSelectable, true);

  const plan = { days: [dayFromEdge(edge)] };
  const feasibility = assessPlanRouteFeasibility(trip(), plan);
  assert.equal(feasibility.status, 'estimated');
  assert.equal(feasibility.normalExactEligible, false);
  assert.equal(feasibility.suggestedCategory, 'stretch');

  const status = evaluatePlanConstraints(trip(), constraintPlan(feasibility), { total: 1000 }, { allowStretch: true });
  assert.equal(status.exact, false);
  assert.equal(status.stretch, true);
  assert.equal(status.violations[0].key, 'routeEvidence');
});

test('explicitly disconnected internal road access is incomplete and cannot be selected', () => {
  const edge = graphEdge(trip(), node('mainland', 35.9, 14.4), node('island', 35.95, 14.45, { roadAccess: false }), { corridors: [] });
  assert.equal(edge.connectivityStatus, 'missing-road-connectivity');
  assert.equal(edge.routeSelectable, false);
  const feasibility = assessPlanRouteFeasibility(trip(), { days: [dayFromEdge(edge)] });
  assert.equal(feasibility.status, 'incomplete');
  assert.equal(feasibility.suggestedCategory, 'incomplete');
  const status = evaluatePlanConstraints(trip(), constraintPlan(feasibility), { total: 1000 }, { allowStretch: true });
  assert.equal(status.selectable, false);
  assert.equal(status.violations[0].key, 'routeConnectivity');
});

test('island access requires explicit source-backed ferry or fixed-link route evidence', () => {
  const mainland = node('mainland', 35.9, 14.4);
  const island = node('island', 36, 14.3, { featureCode: 'ISL' });

  const assertedOnly = graphEdge(trip(), mainland, island, { corridors: [corridor({ ferry: true })] });
  assert.equal(assertedOnly.connectivityStatus, 'missing-island-access-evidence');
  assert.equal(assertedOnly.routeSelectable, false);

  const evidenced = graphEdge(trip(), mainland, island, { corridors: [corridor({
    ferry: true,
    sourceIds: ['osm:relation:recorded-ferry'],
    evidence: ['Recorded ferry relation'],
    source: 'Recorded OpenStreetMap extract'
  })] });
  assert.equal(evidenced.connectivityStatus, 'confirmed-ferry');
  assert.equal(evidenced.ferryEvidenceExplicit, true);
  assert.equal(evidenced.routeEvidenceClassification, 'confirmed');
  assert.equal(evidenced.routeSelectable, true);
  const feasibility = assessPlanRouteFeasibility(trip(), { days: [dayFromEdge(evidenced)] });
  assert.equal(feasibility.status, 'confirmed');
  const status = evaluatePlanConstraints(trip(), constraintPlan(feasibility), { total: 1000 }, { allowStretch: true });
  assert.equal(status.exact, true);
});

test('real Malta pack does not promote an inferred Comino Island corridor to connected road evidence', () => {
  const islandAnchor = MALTA_PACK.anchors.find(anchor => anchor.significance?.featureCode === 'ISL');
  assert.ok(islandAnchor, 'recorded pack must contain a real island anchor');
  const raw = MALTA_PACK.corridors.find(item => item.fromAnchorId === islandAnchor.id || item.toAnchorId === islandAnchor.id);
  assert.ok(raw, 'recorded pack must contain an inferred adjacency for the island anchor');
  const otherId = raw.fromAnchorId === islandAnchor.id ? raw.toAnchorId : raw.fromAnchorId;
  const other = MALTA_PACK.anchors.find(anchor => anchor.id === otherId);
  const from = node(other.id, other.lat, other.lon, { featureCode: other.significance?.featureCode });
  const to = node(islandAnchor.id, islandAnchor.lat, islandAnchor.lon, { featureCode: islandAnchor.significance?.featureCode });
  const edge = graphEdge(trip(), from, to, { corridors: [{
    ...raw, from: raw.fromAnchorId, to: raw.toAnchorId, routeEvidenceScope: 'estimated'
  }] });
  assert.equal(edge.connectivityStatus, 'missing-island-access-evidence');
  assert.equal(edge.routeSelectable, false);
});

test('real pack nodes without an adjacency receive only a geodesic stretch edge, never an exact edge', () => {
  const pair = MALTA_PACK.anchors.flatMap((left, leftIndex) => MALTA_PACK.anchors.slice(leftIndex + 1).map(right => [left, right]))
    .find(([left, right]) => !MALTA_PACK.corridors.some(item =>
      (item.fromAnchorId === left.id && item.toAnchorId === right.id)
        || (item.fromAnchorId === right.id && item.toAnchorId === left.id)));
  assert.ok(pair, 'recorded pack must contain at least one disconnected anchor pair');
  const [left, right] = pair;
  const corridors = MALTA_PACK.corridors.map(item => ({ ...item, from: item.fromAnchorId, to: item.toAnchorId }));
  const edge = graphEdge(trip(), node(left.id, left.lat, left.lon), node(right.id, right.lat, right.lon), { corridors });
  assert.equal(edge.routeEvidenceScope, 'estimated');
  assert.equal(edge.routeEvidenceClassification, 'estimated');
  assert.equal(edge.connectivityStatus, 'estimated-geodesic');
  assert.equal(edge.routeSelectable, true);
  const feasibility = assessPlanRouteFeasibility(trip(), { days: [dayFromEdge(edge)] });
  assert.equal(feasibility.suggestedCategory, 'stretch');
  assert.equal(feasibility.normalExactEligible, false);
});

test('concept confidence is evidence-derived and a large inferred cluster is not labelled reasonable', () => {
  const [profile] = buildDestinationProfiles(MALTA_PACK, trip({ days: 10, maxChanges: 8 }), { limit: 1 });
  assert.ok(profile);
  assert.equal(profile.evidenceConfidence.method, 'weighted-anchor-route-recommendation-vehicle-evidence');
  assert.ok(profile.evidence.anchors >= 8, 'fixture must exercise a non-trivial cluster');
  assert.equal(profile.evidenceConfidence.routeBackedConnections, 0);
  assert.notEqual(profile.provider.confidence, 'reasonable');
  assert.equal(profile.provider.confidenceScore, profile.evidenceConfidence.score);
});

test('a scored real-pack island concept cannot surface as a normal exact proposal', () => {
  const request = trip({ days: 10, maxChanges: 8, allowStretch: true });
  const [profile] = buildDestinationProfiles(MALTA_PACK, request, { limit: 1 });
  const scored = scoreDestination(request, profile);
  assert.notEqual(scored.category, 'exact');
  assert.equal(scored.routeFeasibility.status, 'incomplete');
  assert.equal(scored.routeFeasibility.normalExactEligible, false);
  assert.ok(scored.constraintStatus.violations.some(item => item.key === 'routeConnectivity'));
  assert.equal(scored.confidence, 'low');
});
