import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrip } from '../trip-model.js';
import { rankDestinationGroups, scoreDestination } from '../destination-engine.js';
import { buildProposalPortfolio, nearDuplicate, proposalDifference, selectDiversePortfolio } from '../proposal-engine.js';

const origin = { name: 'Origin', lat: 50, lon: 5 };
const point = (name, lat, lon) => ({ name, lat, lon });
const activity = (title, index = 0) => ({ type: index % 2 ? 'cultuur' : 'natuur', title, rainAlternative: `Indoor ${title}`, tags: [index % 2 ? 'cultuur' : 'natuur'] });

const trip = overrides => normalizeTrip({
  id: 'proposal-quality', origin: origin.name, originPoint: origin, startDate: '2026-09-03',
  days: 14, budget: 9000, adults: 2, children: 0, transport: 'car', travelMode: 'direct',
  routeTopology: 'loop', tripPace: 'balanced', maxDrive: 5, maxChanges: 6, comfort: 'mid',
  strictBudget: true, strictDrive: true, strictChanges: true, allowStretch: false, liveData: false,
  fuelRangeKm: 650, preferences: ['natuur', 'cultuur'], preferenceWeights: { natuur: 3, cultuur: 2 },
  ...overrides
});

function destinationBase(overrides = {}) {
  return {
    id: 'dynamic-fixture', name: 'Dynamic Fixture Region', country: 'Fixtureland', dynamic: true,
    distanceKm: 120, driveHours: 2, nightMid: 90, activityDaily: 25, toll: 0,
    tags: ['natuur', 'cultuur'], season: [], family: 7, motorcycle: 7, camper: 7, weather: 6, crowds: 7,
    summary: 'Recorded generic provider fixture.', routeStops: [], roadDistanceFactor: 1.1,
    provider: { name: 'Recorded provider', confidence: 'redelijk', fetchedAt: '2026-08-05T00:00:00Z' },
    discoverySource: 'Recorded provider fixture', evidence: { anchors: 4, highlights: 3, neutralFields: [] },
    ...overrides
  };
}

const weak = destinationBase({
  id: 'weak-micro-loop', name: 'Large discovered area with one weak anchor',
  bases: [point('Only Base', 49.8, 5.2)],
  activities: [activity('Repeat the same short village walk')],
  highlights: [{
    id: 'only-anchor', name: 'Only Anchor', baseName: 'Only Base', point: point('Only Anchor', 49.82, 5.22),
    overnightPoint: point('Only Base', 49.8, 5.2), sequence: 1, priority: 8, minimumTripDays: 3,
    minimumNights: 1, gateway: true, evidence: 'Single recorded provider anchor',
    activity: 'Repeat the same short village walk', rainAlternative: 'Single indoor fallback', tags: ['natuur']
  }]
});

const strong = destinationBase({
  id: 'strong-regional-loop', name: 'Three-anchor regional loop',
  bases: [point('Gateway', 49.8, 5.2), point('Mountain Base', 49.2, 6.1), point('Heritage Base', 48.7, 5.5)],
  activities: Array.from({ length: 8 }, (_, index) => activity(`Unique experience ${index + 1}`, index)),
  highlights: [
    { id: 'gateway', name: 'Gateway Quarter', baseName: 'Gateway', point: point('Gateway Quarter', 49.81, 5.21), overnightPoint: point('Gateway', 49.8, 5.2), sequence: 1, priority: 9, minimumTripDays: 3, minimumNights: 2, gateway: true, evidence: 'Recorded gateway evidence', activity: 'Gateway food quarter', rainAlternative: 'Gateway museum', tags: ['cultuur'] },
    { id: 'mountain', name: 'Mountain Reserve', baseName: 'Mountain Base', point: point('Mountain Reserve', 49.1, 6.2), overnightPoint: point('Mountain Base', 49.2, 6.1), sequence: 2, priority: 9, minimumTripDays: 5, minimumNights: 2, evidence: 'Recorded protected-area evidence', activity: 'Mountain reserve trail', rainAlternative: 'Reserve visitor centre', tags: ['natuur'] },
    { id: 'heritage', name: 'Heritage District', baseName: 'Heritage Base', point: point('Heritage District', 48.72, 5.52), overnightPoint: point('Heritage Base', 48.7, 5.5), sequence: 3, priority: 8, minimumTripDays: 7, minimumNights: 2, evidence: 'Recorded heritage evidence', activity: 'Heritage district route', rainAlternative: 'Heritage museum', tags: ['cultuur'] },
    { id: 'gateway-museum', name: 'Gateway Museum', baseName: 'Gateway', point: point('Gateway Museum', 49.83, 5.23), overnightPoint: point('Gateway', 49.8, 5.2), sequence: 4, priority: 7, minimumTripDays: 3, minimumNights: 1, evidence: 'Recorded museum evidence', activity: 'Gateway museum route', rainAlternative: 'Gateway covered market', tags: ['cultuur'] },
    { id: 'mountain-lake', name: 'Mountain Lake', baseName: 'Mountain Base', point: point('Mountain Lake', 49.14, 6.24), overnightPoint: point('Mountain Base', 49.2, 6.1), sequence: 5, priority: 8, minimumTripDays: 5, minimumNights: 1, evidence: 'Recorded lake evidence', activity: 'Mountain lake circuit', rainAlternative: 'Mountain visitor centre', tags: ['natuur'] },
    { id: 'heritage-fort', name: 'Heritage Fort', baseName: 'Heritage Base', point: point('Heritage Fort', 48.76, 5.58), overnightPoint: point('Heritage Base', 48.7, 5.5), sequence: 6, priority: 7, minimumTripDays: 6, minimumNights: 1, evidence: 'Recorded fort evidence', activity: 'Heritage fort visit', rainAlternative: 'Fort interpretation centre', tags: ['cultuur'] },
    { id: 'mountain-view', name: 'Mountain Viewpoint', baseName: 'Mountain Base', point: point('Mountain Viewpoint', 49.07, 6.17), overnightPoint: point('Mountain Base', 49.2, 6.1), sequence: 7, priority: 7, minimumTripDays: 6, minimumNights: 1, evidence: 'Recorded viewpoint evidence', activity: 'Mountain viewpoint drive', rainAlternative: 'Regional nature museum', tags: ['natuur'] },
    { id: 'gateway-river', name: 'Gateway River Park', baseName: 'Gateway', point: point('Gateway River Park', 49.86, 5.27), overnightPoint: point('Gateway', 49.8, 5.2), sequence: 8, priority: 7, minimumTripDays: 4, minimumNights: 1, evidence: 'Recorded park evidence', activity: 'Gateway river park circuit', rainAlternative: 'Gateway gallery', tags: ['natuur'] }
  ]
});

test('Successful dynamic discovery is rejected when its canonical long trip is a weak micro-loop', () => {
  const scored = scoreDestination(trip(), weak);
  assert.equal(scored.destinationConstraintStatus.exact, true);
  assert.equal(scored.planQuality.evidence.weakMicroLoop, true);
  assert.equal(scored.planQualityStatus.selectable, false);
  assert.equal(scored.category, 'rejected');
  assert.equal(scored.rejectionType, 'plan-quality');
  assert.ok(scored.constraintStatus.violations.some(item => item.key === 'planQuality'));
});

test('Ranking continues past a weak discovered plan to a stronger candidate', () => {
  const ranking = rankDestinationGroups(trip(), [weak, strong]);
  assert.ok(ranking.rejected.some(item => item.id === weak.id));
  assert.ok(ranking.exact.some(item => item.id === strong.id));
  const portfolio = buildProposalPortfolio(trip(), [weak, strong], { limit: 4 });
  assert.equal(portfolio.visible.some(item => item.id === weak.id), false);
  assert.equal(portfolio.visible.some(item => item.id === strong.id), true);
});

function candidate(id, score, structure) {
  return {
    id, proposalId: id, destinationId: id, name: `Title ${id}`, country: 'Fixtureland',
    score, portfolioScore: score, estimate: 1000 + score, tags: [id], bases: [], highlights: [],
    planStructure: structure
  };
}

const sharedStructure = {
  macroRegion: 'fixtureland:12:1', country: 'fixtureland', gateway: 'gateway-a',
  bases: ['gateway-a', 'base-b'], highlights: ['viewpoint-1', 'park-2'],
  corridors: ['gateway-a>base-b', 'base-b>gateway-a'], topology: 'loop'
};

test('Different titles and scores cannot disguise the same route structure', () => {
  const left = candidate('high-score-title', 95, sharedStructure);
  const right = candidate('different-title', 60, { ...sharedStructure });
  assert.equal(nearDuplicate(left, right), true);
  assert.equal(proposalDifference(left, right), 0);
});

test('Same-country concepts remain distinct when gateway, bases, highlights and corridors differ', () => {
  const west = candidate('western-loop', 88, sharedStructure);
  const east = candidate('eastern-loop', 84, {
    macroRegion: 'fixtureland:12:3', country: 'fixtureland', gateway: 'gateway-x',
    bases: ['gateway-x', 'base-y', 'base-z'], highlights: ['coast-1', 'reserve-4'],
    corridors: ['gateway-x>base-y', 'base-y>base-z', 'base-z>gateway-x'], topology: 'loop'
  });
  assert.equal(nearDuplicate(west, east), false);
  assert.ok(proposalDifference(west, east) >= .7);
});

test('Portfolio keeps the strongest structural representative and continues with materially different routes', () => {
  const original = candidate('original', 94, sharedStructure);
  const renamedClone = candidate('renamed-clone', 90, { ...sharedStructure });
  const distinct = candidate('distinct', 82, {
    macroRegion: 'fixtureland:11:4', country: 'fixtureland', gateway: 'gateway-z',
    bases: ['gateway-z', 'base-q'], highlights: ['forest-8', 'museum-3'],
    corridors: ['gateway-z>base-q'], topology: 'open-jaw'
  });
  const portfolio = selectDiversePortfolio([renamedClone, distinct, original], { limit: 3 });
  assert.deepEqual(portfolio.map(item => item.id), ['original', 'distinct']);
});
