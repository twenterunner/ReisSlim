import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudget } from '../budget-engine.js';
import { buildItinerary, collectRouteSegments, itineraryIntegrityIssues } from '../itinerary-engine.js';
import { enrichPlanWithPlaces } from '../place-provider.js';
import { proposalDifference, selectDiversePortfolio } from '../proposal-engine.js';
import { haversineKm } from '../route-engine.js';
import { normalizeTrip } from '../trip-model.js';
import { applyOptimizationProposal } from '../trip-optimizer.js';
import { calculateTripQuality } from '../trip-quality-engine.js';

const normalize = value => String(value || '').trim().toLocaleLowerCase('en');
const isTravel = day => ['outward', 'transfer', 'return'].includes(day.kind);
const validPoint = point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon));
const clone = value => JSON.parse(JSON.stringify(value));

function makeTrip(overrides = {}) {
  return normalizeTrip({
    id: 'recorded-acceptance-request', tripName: 'Recorded provider acceptance case',
    origin: 'Saasveld', originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    destinationQuery: '', startDate: '2027-05-01', days: 14, budget: 12000,
    adults: 2, children: 0, transport: 'car', travelMode: 'fly-drive', routeTopology: 'loop',
    tripPace: 'balanced', routeStyle: 'balanced', maxDrive: 5, maxChanges: 7, comfort: 'mid',
    strictBudget: true, strictDrive: true, strictChanges: true, allowStretch: false,
    liveData: true, fuelRangeKm: 650, preferences: ['natuur', 'cultuur'],
    preferenceWeights: { natuur: 3, cultuur: 2 }, ...overrides
  });
}

function makeConcept({ id, country, region, anchors, tags = ['natuur', 'cultuur'], remote = false }) {
  const highlights = anchors.flatMap((base, baseIndex) => Array.from({ length: 4 }, (_, highlightIndex) => {
    const providerId = `${id}-${baseIndex + 1}-${highlightIndex + 1}`;
    const name = `${base.name} ${['landscape', 'heritage', 'nature', 'food'][highlightIndex]} anchor`;
    return {
      id: `wd-${providerId}`, providerId: `wikidata:${providerId}`, name, baseName: base.name,
      point: { name, lat: base.lat + .02 * (highlightIndex + 1), lon: base.lon + .02 * (highlightIndex + 1) },
      overnightPoint: { ...base }, sequence: baseIndex * 4 + highlightIndex + 1,
      priority: Math.max(6, Number(base.priority || (9 - baseIndex)) - Math.floor(highlightIndex / 2)),
      minimumTripDays: 3, minimumNights: 1, gateway: baseIndex === 0 && highlightIndex === 0,
      remote: remote && baseIndex > 1, tags: [...new Set([...tags, ...(base.tags || [])])],
      activity: `Explore the named ${name}.`, rainAlternative: `Visit the named ${base.name} interpretation centre.`,
      evidence: `Recorded Wikidata/OpenStreetMap provider evidence ${providerId}`,
      sourceUrl: `https://www.wikidata.org/wiki/Q${100000 + baseIndex * 10 + highlightIndex}`,
      confidence: 'recorded-provider-evidence', fetchedAt: '2026-08-05T00:00:00Z'
    };
  }));
  return {
    id, providerId: `relation:${id}`, name: region, country, dynamic: true, category: 'exact',
    distanceKm: 600, driveHours: 1, roadDistanceFactor: 1.13, nightMid: 105,
    activityDaily: 32, toll: 25, tags, remoteReadinessRequired: remote,
    bases: anchors.map(base => ({ ...base, providerId: `osm:${id}:${normalize(base.name)}` })),
    highlights,
    activities: highlights.map(item => ({ type: item.tags[0] || 'natuur', title: item.activity, rainAlternative: item.rainAlternative, tags: item.tags })),
    routeStops: anchors,
    provider: { name: 'Recorded OSM/Wikidata aggregation', confidence: 'high', fetchedAt: '2026-08-05T00:00:00Z' },
    discoverySource: 'Recorded provider-shaped fixture',
    evidence: { anchors: anchors.length, highlights: highlights.length, neutralFields: [] },
    planStructure: {
      macroRegion: `${normalize(country)}:${id}`, country: normalize(country), gateway: anchors[0].name,
      bases: anchors.map(base => base.name), highlights: highlights.map(item => item.providerId),
      corridors: anchors.slice(1).map((base, index) => `${anchors[index].name}>${base.name}`), topology: 'loop'
    }
  };
}

function portfolioCandidate(destination, index) {
  return {
    ...destination, destinationId: destination.id, proposalId: destination.id,
    score: 92 - index * 2, portfolioScore: 92 - index * 2
  };
}

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function providerElements(plan, vehicle) {
  const anchors = [];
  for (const day of plan.days || []) {
    for (const point of [day.toPoint, day.fromPoint, ...(day.waypoints || [])]) {
      if (validPoint(point) && !anchors.some(existing => haversineKm(existing, point) < 3)) anchors.push(point);
    }
  }
  let id = 1000;
  const elements = [];
  for (const [anchorIndex, anchor] of anchors.entries()) {
    for (let option = 0; option < 10; option += 1) {
      const lat = Number(anchor.lat) + .0015 * (option + 1);
      const lon = Number(anchor.lon) + .0012 * (option + 1);
      elements.push({
        type: 'node', id: id++, lat, lon,
        tags: {
          tourism: 'hotel', name: `Provider Hotel ${anchorIndex + 1}-${option + 1}`,
          website: `https://example.test/hotel/${anchorIndex + 1}/${option + 1}`,
          parking: 'yes', ...(vehicle === 'motorcycle' ? { covered: 'yes' } : {})
        }
      });
      elements.push({
        type: 'node', id: id++, lat: lat + .0002, lon: lon + .0002,
        tags: { amenity: 'restaurant', name: `Provider Restaurant ${anchorIndex + 1}-${option + 1}`, opening_hours: 'unknown' }
      });
      elements.push({
        type: 'node', id: id++, lat: lat + .0004, lon: lon + .0004,
        tags: { tourism: 'viewpoint', name: `Provider Viewpoint ${anchorIndex + 1}-${option + 1}` }
      });
      elements.push({
        type: 'node', id: id++, lat: lat + .0006, lon: lon + .0006,
        tags: { amenity: 'fuel', name: `Provider Fuel ${anchorIndex + 1}-${option + 1}` }
      });
      elements.push({
        type: 'node', id: id++, lat: lat + .0008, lon: lon + .0008,
        tags: { highway: 'rest_area', name: `Provider Rest ${anchorIndex + 1}-${option + 1}` }
      });
    }
  }
  return elements;
}

async function enrichFromRecordedProvider(trip, destination, plan) {
  const elements = providerElements(plan, trip.transport);
  return enrichPlanWithPlaces(trip, destination, plan, {
    storage: null,
    fetchImpl: async url => String(url).includes('open-meteo')
      ? response({ daily: { time: [] } })
      : response({ version: .6, generator: 'recorded-overpass-fixture', elements })
  });
}

function unorderedCorridor(day) {
  const names = [normalize(day.from), normalize(day.to)].filter(Boolean).sort();
  return names.length === 2 && names[0] !== names[1] ? names.join('<>') : '';
}

function directedCorridor(day) {
  const from = normalize(day.from); const to = normalize(day.to);
  return from && to && from !== to ? `${from}>${to}` : '';
}

function maximumCoverageKm(plan) {
  const points = (plan.days || [])
    .filter(day => ['transfer', 'stay', 'flex'].includes(day.kind))
    .flatMap(day => day.geometry || [])
    .filter(validPoint);
  let maximum = 0;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) maximum = Math.max(maximum, haversineKm(points[left], points[right]) || 0);
  }
  return Math.round(maximum);
}

function recommendationIdentity(item) {
  return item.providerId || `${normalize(item.type)}:${normalize(item.name)}`;
}

function namedProviderItem(item) {
  return Boolean(item?.name && item?.providerId && item.genericFallback !== true);
}

function materialProposalCount(portfolio) {
  return portfolio.filter((candidate, index) => index === 0
    || portfolio.slice(0, index).every(existing => proposalDifference(candidate, existing) >= .5)).length;
}

function planMetrics(trip, plan, portfolio, optimization) {
  const nights = plan.days.filter(day => !(day.kind === 'return' && normalize(day.to) === normalize(trip.origin)))
    .map(day => normalize(day.overnight)).filter(Boolean);
  const nightCounts = new Map();
  nights.forEach(base => nightCounts.set(base, (nightCounts.get(base) || 0) + 1));
  const transfers = plan.days.filter(day => day.kind === 'transfer');
  const corridorCounts = new Map();
  transfers.map(unorderedCorridor).filter(Boolean).forEach(key => corridorCounts.set(key, (corridorCounts.get(key) || 0) + 1));
  const directed = transfers.map(directedCorridor).filter(Boolean);
  const seen = new Set(); let backtracking = 0;
  for (const edge of directed) {
    const [from, to] = edge.split('>');
    if (seen.has(`${to}>${from}`)) backtracking += 1;
    seen.add(edge);
  }
  const baseSequence = plan.days.map(day => normalize(day.overnight)).filter(Boolean)
    .filter((base, index, list) => index === 0 || base !== list[index - 1]);
  const pingPong = baseSequence.some((base, index) => index >= 3 && base === baseSequence[index - 2] && baseSequence[index - 1] === baseSequence[index - 3]);
  const pois = plan.recommendations.filter(item => ['activity', 'poi', 'attraction', 'restaurant'].includes(item.type));
  const accommodations = plan.recommendations.filter(item => item.type === 'accommodation');
  const poiCounts = new Map();
  pois.map(recommendationIdentity).filter(Boolean).forEach(key => poiCounts.set(key, (poiCounts.get(key) || 0) + 1));
  const travelDays = plan.days.filter(isTravel);
  const routeSegments = collectRouteSegments(plan);
  const travelDayNumbers = new Set(travelDays.map(day => day.day));
  return {
    materiallyDifferentProposals: materialProposalCount(portfolio),
    distinctOvernightBases: nightCounts.size,
    dominantBaseNightShare: Number((Math.max(0, ...nightCounts.values()) / Math.max(1, nights.length)).toFixed(3)),
    geographicCoverageKm: maximumCoverageKm(plan),
    repeatedNamedPois: [...poiCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    repeatedTouringCorridors: [...corridorCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    backtrackingTransfers: backtracking,
    pingPong,
    namedPoiRatio: Number((pois.filter(namedProviderItem).length / Math.max(1, pois.length)).toFixed(3)),
    namedAccommodationRatio: Number((accommodations.filter(namedProviderItem).length / Math.max(1, accommodations.length)).toFixed(3)),
    travelDaysWithGeometry: travelDays.filter(day => (day.geometry || []).filter(validPoint).length >= 2).length,
    travelDayCount: travelDays.length,
    routeSegmentCount: routeSegments.filter(segment => travelDayNumbers.has(segment.day)).length,
    optimizerStructuralMutations: optimization.changes.filter(change => change.structural && change.affectedDays.length).length,
    optimizerScoreDelta: Number(optimization.scoreDelta.toFixed(3)),
    optimizerImportantDimensionDelta: Number(optimization.importantDimensionDelta.toFixed(3)),
    optimizerMeaningful: optimization.meaningful
  };
}

function degradedOptimizerFixture(plan) {
  const degraded = clone(plan);
  const stays = degraded.days.filter(day => day.kind === 'stay').slice(0, 3);
  for (const day of stays) {
    day.primaryPlan = 'Repeated provider attraction';
    day.activityId = null;
    for (const item of day.recommendations || []) {
      if (item.type !== 'activity') continue;
      item.id = 'repeated-provider-attraction';
      item.providerId = 'osm:repeated-provider-attraction';
      item.name = 'Repeated provider attraction';
    }
  }
  degraded.recommendations = degraded.days.flatMap(day => day.recommendations || []);
  return degraded;
}

function optimizerMeasurement(trip, destination, plan) {
  const degraded = degradedOptimizerFixture(plan);
  const beforeBudget = buildBudget(trip, destination, degraded);
  const beforeQuality = calculateTripQuality(trip, destination, degraded, beforeBudget);
  const result = applyOptimizationProposal(trip, destination, degraded, ['deduplicate-pois', 'rest']);
  const importantDimensionDelta = Math.max(0, ...Object.keys(result.quality.rawDimensions || {}).map(key => Number(result.quality.rawDimensions[key] || 0) - Number(beforeQuality.rawDimensions[key] || 0)));
  const resolvedDefects = Math.max(0, beforeQuality.deductions.length - result.quality.deductions.length)
    + Math.max(0, beforeQuality.gate.reasons.length - result.quality.gate.reasons.length);
  return {
    changes: result.changes || [],
    scoreDelta: Number(result.quality?.rawOverall || beforeQuality.rawOverall) - beforeQuality.rawOverall,
    importantDimensionDelta,
    resolvedDefects,
    meaningful: Number(result.quality?.rawOverall || 0) - beforeQuality.rawOverall >= 2 || importantDimensionDelta >= 7 || resolvedDefects > 0
  };
}

const southAfricaConcepts = [
  makeConcept({ id: 'za-cape-circuit', country: 'South Africa', region: 'Cape regional circuit', anchors: [
    { name: 'Cape gateway', lat: -33.925, lon: 18.424, priority: 9 }, { name: 'Overberg base', lat: -34.42, lon: 19.24, priority: 9 },
    { name: 'Southern cape base', lat: -34.67, lon: 20.1, priority: 8 }, { name: 'Mountain wine base', lat: -33.65, lon: 19.44, priority: 8 }
  ] }),
  makeConcept({ id: 'za-escarpment-circuit', country: 'South Africa', region: 'Escarpment nature circuit', anchors: [
    { name: 'Escarpment gateway', lat: -25.47, lon: 30.97 }, { name: 'Canyon base', lat: -24.88, lon: 30.89 },
    { name: 'Wildlife south base', lat: -25.36, lon: 31.89 }, { name: 'Wildlife north base', lat: -23.95, lon: 31.45 }
  ] }),
  makeConcept({ id: 'za-eastern-coast', country: 'South Africa', region: 'Eastern coast and mountains', anchors: [
    { name: 'Coastal gateway', lat: -29.86, lon: 31.02 }, { name: 'North coast base', lat: -28.75, lon: 32.04 },
    { name: 'Midlands base', lat: -29.48, lon: 30.23 }, { name: 'Mountain base', lat: -28.73, lon: 29.2 }
  ] }),
  makeConcept({ id: 'za-eastern-cape', country: 'South Africa', region: 'Eastern Cape mixed circuit', anchors: [
    { name: 'Bay gateway', lat: -33.96, lon: 25.61 }, { name: 'Karoo base', lat: -32.25, lon: 24.53 },
    { name: 'Forest coast base', lat: -34.03, lon: 23.05 }, { name: 'Lagoon base', lat: -34.04, lon: 23.05 }
  ] })
];

const namibiaConcepts = [
  makeConcept({ id: 'na-central-north', country: 'Namibia', region: 'Central, coast and wildlife loop', remote: true, anchors: [
    { name: 'Central gateway', lat: -22.56, lon: 17.08, priority: 9 }, { name: 'Desert base', lat: -24.49, lon: 15.8, priority: 9 },
    { name: 'Atlantic base', lat: -22.68, lon: 14.53, priority: 9 }, { name: 'Rock landscape base', lat: -21.83, lon: 15.19, priority: 8 },
    { name: 'Wildlife base', lat: -19.2, lon: 15.9, priority: 10 }
  ] }),
  makeConcept({ id: 'na-north-wildlife', country: 'Namibia', region: 'Northern wildlife circuit', remote: true, anchors: [
    { name: 'Northern gateway', lat: -19.56, lon: 18.1 }, { name: 'Eastern wildlife base', lat: -18.83, lon: 17.1 },
    { name: 'Western wildlife base', lat: -19.18, lon: 15.92 }, { name: 'Plateau base', lat: -20.46, lon: 17.25 }
  ] }),
  makeConcept({ id: 'na-coast-desert', country: 'Namibia', region: 'Coast and desert circuit', remote: true, anchors: [
    { name: 'Coast gateway', lat: -22.68, lon: 14.53 }, { name: 'Dune coast base', lat: -23.0, lon: 14.5 },
    { name: 'Desert canyon base', lat: -23.32, lon: 15.09 }, { name: 'Desert gateway base', lat: -24.49, lon: 15.8 }
  ] })
];

const europeConcepts = [
  makeConcept({ id: 'eu-ardennes', country: 'Europe', region: 'Ardennes cross-border circuit', anchors: [
    { name: 'Forest gateway', lat: 50.29, lon: 5.55 }, { name: 'River base', lat: 49.81, lon: 5.07 },
    { name: 'Plateau base', lat: 50.12, lon: 6.09 }, { name: 'Historic base', lat: 50.41, lon: 4.44 }
  ], tags: ['natuur', 'cultuur', 'motor', 'bergen'] }),
  makeConcept({ id: 'eu-harz', country: 'Europe', region: 'Central German mountain circuit', anchors: [
    { name: 'Mountain gateway', lat: 51.91, lon: 10.43 }, { name: 'Highland base', lat: 51.76, lon: 10.66 },
    { name: 'Timber town base', lat: 51.84, lon: 10.79 }, { name: 'Eastern heritage base', lat: 51.79, lon: 11.14 }
  ], tags: ['natuur', 'cultuur', 'motor', 'bergen'] }),
  makeConcept({ id: 'eu-moselle', country: 'Europe', region: 'Moselle and Eifel circuit', anchors: [
    { name: 'Valley gateway', lat: 50.36, lon: 7.6 }, { name: 'Vineyard base', lat: 49.92, lon: 7.06 },
    { name: 'Volcanic base', lat: 50.36, lon: 6.95 }, { name: 'Roman base', lat: 49.76, lon: 6.64 }
  ], tags: ['natuur', 'cultuur', 'motor', 'eten'] }),
  makeConcept({ id: 'eu-normandy', country: 'Europe', region: 'Northern coast circuit', anchors: [
    { name: 'Coast gateway', lat: 50.95, lon: 1.85 }, { name: 'Cliff base', lat: 49.71, lon: .21 },
    { name: 'Harbour base', lat: 49.49, lon: .11 }, { name: 'Historic coast base', lat: 49.28, lon: -.7 }
  ], tags: ['kust', 'cultuur', 'eten'] })
];

const arbitraryConcepts = [
  makeConcept({ id: 'aster-highlands', country: 'Republic of Aster', region: 'Aster highlands', anchors: [
    { name: 'Aster gateway', lat: 42.1, lon: 44.1 }, { name: 'North ridge base', lat: 42.8, lon: 44.9 },
    { name: 'Lake base', lat: 41.9, lon: 45.4 }, { name: 'Heritage valley base', lat: 41.3, lon: 44.7 }
  ] }),
  makeConcept({ id: 'aster-west', country: 'Republic of Aster', region: 'Aster western circuit', anchors: [
    { name: 'West gateway', lat: 41.8, lon: 42.7 }, { name: 'Coastal plain base', lat: 41.2, lon: 42.1 },
    { name: 'Forest base', lat: 42.3, lon: 42.0 }, { name: 'Canyon base', lat: 42.7, lon: 42.8 }
  ] }),
  makeConcept({ id: 'aster-east', country: 'Republic of Aster', region: 'Aster eastern circuit', anchors: [
    { name: 'East gateway', lat: 41.7, lon: 46.4 }, { name: 'Wine base', lat: 41.2, lon: 46.8 },
    { name: 'National park base', lat: 42.1, lon: 47.0 }, { name: 'Silk road base', lat: 42.5, lon: 46.2 }
  ] })
];

const localConcepts = [makeConcept({ id: 'local-saasveld', country: 'Netherlands', region: 'Saasveld local discovery', anchors: [
  { name: 'Saasveld', lat: 52.33, lon: 6.81 },
  { name: 'Nearby nature base', lat: 52.38, lon: 6.94 }
] })].map(concept => ({
  ...concept,
  highlights: concept.highlights.map((highlight, index) => index < 4
    ? { ...highlight, point: { ...highlight.point, lat: highlight.overnightPoint.lat + .03 * (index + 1), lon: highlight.overnightPoint.lon + .025 * (index + 1) } }
    : highlight)
}));

const scenarios = [
  { name: 'South Africa fly-drive by car', trip: makeTrip({ destinationQuery: 'South Africa', travelMode: 'fly-drive', transport: 'car' }), concepts: southAfricaConcepts, minimumProposals: 3, minimumBases: 3, minimumCoverageKm: 100 },
  { name: 'South Africa fly-ride by motorcycle', trip: makeTrip({ destinationQuery: 'South Africa', travelMode: 'fly-ride', transport: 'motorcycle', fuelRangeKm: 260, routeStyle: 'scenic' }), concepts: southAfricaConcepts, minimumProposals: 3, minimumBases: 3, minimumCoverageKm: 100 },
  { name: 'Namibia self-drive', trip: makeTrip({ destinationQuery: 'Namibia', travelMode: 'fly-drive', transport: 'car', remoteTravel: true }), concepts: namibiaConcepts, minimumProposals: 3, minimumBases: 3, minimumCoverageKm: 250 },
  { name: 'European motorcycle road trip from Saasveld', trip: makeTrip({ destinationQuery: 'Europe', travelMode: 'direct', transport: 'motorcycle', fuelRangeKm: 260, routeStyle: 'scenic', days: 12 }), concepts: europeConcepts, minimumProposals: 3, minimumBases: 3, minimumCoverageKm: 80 },
  { name: 'European car road trip from Saasveld', trip: makeTrip({ destinationQuery: 'Europe', travelMode: 'direct', transport: 'car', days: 12 }), concepts: europeConcepts, minimumProposals: 3, minimumBases: 3, minimumCoverageKm: 80 },
  { name: 'three-day local trip without destination', trip: makeTrip({ destinationQuery: '', destinationPoint: null, travelMode: 'direct', transport: 'car', days: 3, maxChanges: 1, budget: 1500 }), concepts: localConcepts, minimumProposals: 1, minimumBases: 1, minimumCoverageKm: 1, local: true },
  { name: 'arbitrary country absent from production fixtures', trip: makeTrip({ destinationQuery: 'Republic of Aster', travelMode: 'fly-drive', transport: 'car', days: 12 }), concepts: arbitraryConcepts, minimumProposals: 3, minimumBases: 3, minimumCoverageKm: 100 }
];

for (const scenario of scenarios) {
  test(`acceptance metrics: ${scenario.name}`, async context => {
    const candidates = scenario.concepts.map(portfolioCandidate);
    const portfolio = selectDiversePortfolio(candidates, { limit: 6 });
    const destination = portfolio[0];
    const rawPlan = buildItinerary(scenario.trip, destination);
    const plan = await enrichFromRecordedProvider(scenario.trip, destination, rawPlan);
    const optimization = optimizerMeasurement(scenario.trip, destination, plan);
    const metrics = planMetrics(scenario.trip, plan, portfolio, optimization);

    context.diagnostic(JSON.stringify({ scenario: scenario.name, metrics }));
    assert.deepEqual(itineraryIntegrityIssues(plan, scenario.trip), []);
    assert.equal(plan.days.length, scenario.trip.days);
    assert.ok(metrics.materiallyDifferentProposals >= scenario.minimumProposals);
    assert.ok(metrics.distinctOvernightBases >= scenario.minimumBases);
    assert.ok(metrics.geographicCoverageKm >= scenario.minimumCoverageKm);
    assert.equal(metrics.repeatedNamedPois, 0);
    assert.equal(metrics.repeatedTouringCorridors, 0);
    assert.equal(metrics.backtrackingTransfers, 0);
    assert.equal(metrics.pingPong, false);
    assert.ok(metrics.namedPoiRatio >= .8);
    assert.ok(metrics.namedAccommodationRatio >= .8);
    assert.equal(metrics.travelDaysWithGeometry, metrics.travelDayCount);
    assert.equal(metrics.routeSegmentCount, metrics.travelDayCount);
    if (scenario.local) {
      assert.ok(metrics.dominantBaseNightShare <= 1);
    } else {
      assert.ok(metrics.dominantBaseNightShare <= .55);
      assert.ok(metrics.optimizerStructuralMutations >= 1);
      assert.equal(metrics.optimizerMeaningful, true);
      assert.ok(metrics.optimizerScoreDelta >= 2 || metrics.optimizerImportantDimensionDelta >= 7);
    }
    const budget = buildBudget(scenario.trip, destination, plan);
    const quality = calculateTripQuality(scenario.trip, destination, plan, budget);
    assert.equal(quality.evidence.weakMicroLoop, false);
  });
}

test('car and motorcycle acceptance cases use materially different elapsed-time models', () => {
  const destination = southAfricaConcepts[0];
  const car = buildItinerary(makeTrip({ destinationQuery: 'South Africa', travelMode: 'fly-drive', transport: 'car' }), destination);
  const motorcycle = buildItinerary(makeTrip({ destinationQuery: 'South Africa', travelMode: 'fly-ride', transport: 'motorcycle', fuelRangeKm: 260, routeStyle: 'scenic' }), destination);
  const carGroundHours = car.days.filter(day => day.kind === 'transfer').reduce((sum, day) => sum + day.elapsedHours, 0);
  const motorcycleGroundHours = motorcycle.days.filter(day => day.kind === 'transfer').reduce((sum, day) => sum + day.elapsedHours, 0);
  assert.ok(motorcycleGroundHours > carGroundHours);
  assert.ok(motorcycle.days.filter(day => day.kind === 'transfer').reduce((sum, day) => sum + day.restStops, 0)
    >= car.days.filter(day => day.kind === 'transfer').reduce((sum, day) => sum + day.restStops, 0));
});
