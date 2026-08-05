import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudget } from '../budget-engine.js';
import { createGpx } from '../gpx-generator.js';
import { buildProposalPortfolio } from '../proposal-engine.js';
import { normalizeTrip } from '../trip-model.js';
import { syntheticDestinations } from './fixtures/synthetic-destinations.mjs';

function trip(overrides = {}) {
  return normalizeTrip({
    id: 'canonical-export-regression', tripName: 'Canonical export regression',
    origin: 'Saasveld', originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    startDate: '2026-09-03', days: 6, budget: 12000, adults: 2, children: 0,
    transport: 'car', travelMode: 'direct', routeTopology: 'loop', routeStyle: 'balanced',
    maxDrive: 8, maxChanges: 8, comfort: 'mid', preferences: ['natuur'],
    preferenceWeights: { natuur: 3 }, ...overrides
  });
}

const budgetDestination = {
  id: 'budget-destination', name: 'Budget destination', distanceKm: 900, driveHours: 10,
  nightMid: 100, activityDaily: 30, toll: 0,
  bases: [{ name: 'Budget Base', lat: 48, lon: 10 }]
};

test('budget distance sums every canonical road day including split outward and return legs', () => {
  const request = trip();
  const plan = {
    routeMetrics: { originKnown: true, oneWayDistanceKm: 100 },
    days: [
      { kind: 'outward', distanceKm: 100 },
      { kind: 'outward', distanceKm: 100 },
      { kind: 'transfer', distanceKm: 50 },
      { kind: 'stay', distanceKm: 10 },
      { kind: 'return', distanceKm: 100 },
      { kind: 'return', distanceKm: 100 }
    ]
  };
  const budget = buildBudget(request, budgetDestination, plan);
  assert.equal(budget.totalDistanceKm, 460);
  assert.equal(budget.total, budget.rows.reduce((sum, [, amount]) => sum + amount, 0));
  assert.equal(budget.confidence, 'beperkt', 'generic static cost priors must not be presented as source-backed prices');
  assert.equal(budget.assumptions.nightlyRate, 100);
  assert.equal(budget.assumptions.activityRatePerDay, 30);
  assert.equal(budget.assumptions.sourceBackedCostEvidence, false);
  assert.match(budget.assumptions.costModelSource, /generieke kostenprior/);
  assert.match(budget.assumptions.roadDistanceSource, /canonieke dagplan/);
});

test('budget distance excludes non-road multimodal access while retaining local road days', () => {
  const request = trip({ days: 4, travelMode: 'fly-drive' });
  const plan = {
    routeMetrics: { originKnown: true, oneWayDistanceKm: 900 },
    days: [
      { kind: 'outward', distanceKm: 25, transportSegments: [{ mode: 'flight' }, { mode: 'rental' }] },
      { kind: 'stay', distanceKm: 20 },
      { kind: 'transfer', distanceKm: 100 },
      { kind: 'return', distanceKm: 25, transportSegments: [{ mode: 'flight' }] }
    ]
  };
  assert.equal(buildBudget(request, budgetDestination, plan).totalDistanceKm, 120);
});

test('GPX exports only road segments as tracks and preserves non-road transfers as logistics metadata', () => {
  const origin = { name: 'Origin', lat: 52, lon: 6, role: 'origin' };
  const gateway = { name: 'Gateway', lat: 48, lon: 10, role: 'gateway' };
  const base = { name: 'Touring Base', lat: 47, lon: 11, role: 'overnight' };
  const plan = {
    routeMetrics: { origin }, origin,
    routing: { source: 'mixed-fixture', live: false },
    days: [
      { day: 1, date: '2026-09-03', kind: 'outward', from: origin.name, to: gateway.name, fromPoint: origin, toPoint: gateway, geometry: [origin, gateway], routeSource: 'flight-estimate', routeConfidence: 'low', transportSegments: [{ mode: 'flight' }], waypoints: [], recommendations: [] },
      { day: 2, date: '2026-09-04', kind: 'transfer', from: gateway.name, to: base.name, fromPoint: gateway, toPoint: base, geometry: [gateway, base], routeSource: 'catalogue-corridor', routeConfidence: 'reasonable', waypoints: [], recommendations: [] },
      { day: 3, date: '2026-09-05', kind: 'return', from: base.name, to: origin.name, fromPoint: base, toPoint: origin, geometry: [base, origin], routeSource: 'rail-ferry-estimate', routeConfidence: 'low', transportSegments: [{ mode: 'rail-ferry' }], waypoints: [], recommendations: [] }
    ]
  };
  const xml = createGpx(trip({ days: 3 }), { name: 'Mixed trip' }, plan);
  const tracks = [...xml.matchAll(/<trk>[\s\S]*?<\/trk>/g)].map(match => match[0]);
  assert.equal(tracks.length, 1);
  assert.match(tracks[0], /Dag 2/);
  assert.doesNotMatch(tracks[0], /Dag (1|3)/);
  assert.equal([...xml.matchAll(/<reisslim:transfer /g)].length, 2);
  assert.match(xml, /mode="flight"/);
  assert.match(xml, /mode="rail-ferry"/);
  assert.match(xml, /<type>transfer-flight<\/type>/);
  assert.match(xml, /<type>transfer-rail-ferry<\/type>/);
});

test('proposal cards report canonical plan bases and route days instead of raw destination estimates', () => {
  const request = trip({ days: 14 });
  const portfolio = buildProposalPortfolio(request, syntheticDestinations, { limit: 8 });
  assert.ok(portfolio.visible.length > 0);
  assert.ok(portfolio.visible.some(item => item.planStructure.bases.length !== item.bases.length), 'fixture must exercise a raw/canonical base mismatch');
  for (const proposal of portfolio.visible) {
    const canonicalBases = new Set(proposal.planStructure.bases).size;
    assert.equal(proposal.recommendedBases, canonicalBases);
    assert.equal(proposal.routeDays, proposal.planStructure.routeDays);
    assert.match(proposal.tripShape, new RegExp(`^${canonicalBases} uitvalsbasis`));
    assert.match(proposal.tripShape, new RegExp(`· ${proposal.planStructure.routeDays} reisetappes$`));
  }
});
