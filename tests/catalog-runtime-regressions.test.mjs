import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDestinationProfiles, enrichPlanWithCatalogue } from '../catalog-runtime.js';
import { countAccommodationChanges } from '../itinerary-engine.js';
import { buildItineraryVariants } from '../itinerary-variants.js';
import { annotateAccommodationContinuity, buildRecommendations } from '../recommendation-engine.js';
import { graphEdge } from '../route-graph-engine.js';
import { normalizeTrip } from '../trip-model.js';

function trip(overrides = {}) {
  return normalizeTrip({
    id: 'catalogue-runtime-regression', tripName: 'Catalogue runtime regression',
    origin: 'Saasveld', originPoint: { lat: 52.33, lon: 6.81 },
    destinationQuery: 'Germany', startDate: '2027-06-01', days: 14,
    budget: 12000, adults: 2, children: 0, transport: 'car', travelMode: 'fly-drive',
    routeTopology: 'loop', tripPace: 'balanced', routeStyle: 'balanced', maxDrive: 6,
    maxChanges: 8, comfort: 'mid', liveData: false, fuelRangeKm: 600,
    preferences: ['natuur'], preferenceWeights: { natuur: 3 }, ...overrides
  });
}

test('long-trip itinerary variants retain a duration-derived multi-base structure', () => {
  const bases = Array.from({ length: 6 }, (_, index) => ({ name: `Base ${index + 1}`, lat: 50 + index * .35, lon: 8 + index * .3 }));
  const destination = {
    id: 'catalogue-scale', name: 'Catalogue scale', country: 'Test', catalogue: true, dynamic: true,
    bases, activityDaily: 40, nightMid: 100, tags: ['natuur'],
    highlights: bases.map((base, index) => ({
      id: `highlight-${index + 1}`, providerId: `source-${index + 1}`, name: base.name,
      baseName: base.name, point: base, overnightPoint: base, sequence: index,
      priority: 8, minimumTripDays: 3, minimumNights: 1, activity: `Explore ${base.name}`,
      gateway: index === 0, tags: ['natuur']
    }))
  };
  const variants = buildItineraryVariants(trip(), destination);
  assert.ok(variants.find(item => item.id === 'relaxed').destination.bases.length >= 3);
  assert.ok(variants.find(item => item.id === 'balanced').destination.bases.length >= 4);
  assert.ok(variants.find(item => item.id === 'active').destination.bases.length >= 5);
});

test('catalogue motorcycle elapsed evidence is not reused as moving time', () => {
  const motorcycleTrip = trip({ transport: 'motorcycle', travelMode: 'fly-ride', fuelRangeKm: 260 });
  const from = { id: 'a', overnightPoint: { lat: 50, lon: 8 } };
  const to = { id: 'b', overnightPoint: { lat: 51, lon: 9 } };
  const edge = graphEdge(motorcycleTrip, from, to, {
    catalogue: true,
    corridors: [{ from: 'a', to: 'b', distanceKm: 180, carMovingHours: 2, motorcycleElapsedHours: 2.6 }]
  });
  assert.equal(edge.roadHours, 2.1, 'moving time should derive once from moving-time evidence');
  assert.ok(edge.elapsedHours >= 2.6 && edge.elapsedHours < 3.5, 'elapsed evidence should be preserved without adding all breaks twice');
});

test('catalogue enrichment preserves live place provenance and one canonical accommodation choice', () => {
  const carTrip = trip();
  const liveAccommodation = {
    id: 'live-hotel', providerId: 'osm:hotel:1', provider: 'OpenStreetMap', name: 'Live Hotel',
    type: 'accommodation', associatedBase: 'Base One', vehicleFit: ['car'], vehicleProfileId: 'car',
    live: true, genericFallback: false, point: { lat: 50, lon: 8 }
  };
  const catalogueAccommodation = {
    id: 'catalogue-hotel', providerId: 'gn:hotel:2', provider: 'GeoNames', name: 'Catalogue Hotel',
    type: 'accommodation', associatedBase: 'Base One', vehicleFit: ['car'], live: false,
    genericFallback: false, point: { lat: 50.01, lon: 8.01 }, sourceUrl: 'https://example.test/catalogue-hotel'
  };
  const plan = {
    days: [{ day: 1, kind: 'stay', overnight: 'Base One', location: 'Base One', to: 'Base One',
      toPoint: { lat: 50, lon: 8 }, recommendations: [liveAccommodation] }],
    placeData: { live: true, source: 'OpenStreetMap via Overpass', providers: ['OpenStreetMap Overpass'] }
  };
  const enriched = enrichPlanWithCatalogue(carTrip, {
    catalogue: true, catalogVersion: 'test', catalogueRecommendations: [catalogueAccommodation]
  }, plan);
  assert.equal(enriched.placeData.live, true);
  assert.equal(enriched.placeData.source, 'OpenStreetMap via Overpass');
  assert.equal(enriched.days[0].sleepProposal.name, 'Live Hotel');
  assert.equal(enriched.accommodationOptions[0].recommendations[0].name, 'Live Hotel');
});

test('consecutive nights at one base pin one canonical accommodation set and selected property', () => {
  const carTrip = trip();
  const hotel = (letter, day) => ({
    id: `live-hotel-${letter.toLowerCase()}-${day}`,
    providerId: `osm:hotel:${letter.toLowerCase()}`,
    provider: 'OpenStreetMap',
    name: `Live Hotel ${letter}`,
    type: 'accommodation',
    associatedBase: 'Base One',
    vehicleFit: ['car'],
    vehicleProfileId: 'car',
    live: true,
    genericFallback: false,
    point: { lat: 50 + day / 1000, lon: 8 }
  });
  const plan = {
    accommodationChanges: 0,
    days: ['A', 'B', 'C'].map((letter, index) => ({
      day: index + 1,
      date: `2027-06-0${index + 1}`,
      kind: index ? 'stay' : 'outward',
      overnight: 'Base One',
      location: 'Base One',
      to: 'Base One',
      toPoint: { lat: 50, lon: 8 },
      recommendations: [hotel(letter, index + 1)]
    }))
  };
  const enriched = enrichPlanWithCatalogue(carTrip, {
    catalogue: true,
    catalogVersion: 'test',
    catalogueRecommendations: []
  }, plan);

  const selectedIdentities = enriched.days.map(day => day.sleepProposal.accommodationIdentity);
  assert.equal(new Set(selectedIdentities).size, 1,
    'sleepProposal must not rotate hotels inside a stay');
  assert.deepEqual(enriched.days.map(day => day.accommodationOptions.map(item => item.providerId)), [
    ['osm:hotel:a', 'osm:hotel:b', 'osm:hotel:c'],
    ['osm:hotel:a', 'osm:hotel:b', 'osm:hotel:c'],
    ['osm:hotel:a', 'osm:hotel:b', 'osm:hotel:c']
  ]);
  assert.equal(enriched.accommodationChanges, 0);
  assert.equal(enriched.accommodationPropertyChanges, 0);
  assert.equal(enriched.accommodationStays.length, 1);
  assert.equal(enriched.accommodationStays[0].nights, 3);
  assert.equal(enriched.accommodationOptions[0].selectedAccommodationIdentity, selectedIdentities[0]);
});

test('an actual hotel identity change is exposed as a counted property change', () => {
  const nights = [
    { day: 1, date: '2027-06-01', overnight: 'Base One', sleepProposal: { name: 'Hotel A', provider: 'OSM', providerId: 'hotel-a' } },
    { day: 2, date: '2027-06-02', overnight: 'Base One', sleepProposal: { name: 'Hotel B', provider: 'OSM', providerId: 'hotel-b' } },
    { day: 3, date: '2027-06-03', overnight: 'Base Two', sleepProposal: { name: 'Hotel C', provider: 'OSM', providerId: 'hotel-c' } },
    { day: 4, date: '2027-06-04', overnight: 'Saasveld', sleepProposal: null }
  ];
  const audit = annotateAccommodationContinuity(nights, 'Saasveld');
  assert.equal(audit.totalChanges, 2);
  assert.equal(audit.propertyChanges, 1);
  assert.equal(nights[1].accommodationChangeType, 'property');
  assert.equal(nights[2].accommodationChangeType, 'base');
  assert.equal(countAccommodationChanges(nights, 'Saasveld'), 2,
    'constraint accounting must use accommodation identity, not only the town name');
});

test('base recommendation construction pins the same option set before catalogue enrichment', () => {
  const days = [1, 2, 3].map(day => ({
    day,
    date: `2027-06-0${day}`,
    kind: day === 1 ? 'outward' : 'stay',
    overnight: 'Base One',
    location: 'Base One',
    to: 'Base One',
    from: day === 1 ? 'Saasveld' : 'Base One',
    fromPoint: { lat: 50, lon: 8 },
    toPoint: { lat: 50, lon: 8 },
    primaryPlan: `Distinct activity ${day}`,
    waypoints: []
  }));
  const accommodations = ['A', 'B', 'C'].map(letter => ({
    id: `catalogue-${letter}`,
    providerId: `hotel-${letter}`,
    provider: 'Catalogue source',
    name: `Hotel ${letter}`,
    type: 'accommodation',
    associatedBase: 'Base One',
    vehicleFit: ['car'],
    point: { lat: 50, lon: 8 },
    sourceUrl: `https://example.test/hotel-${letter}`
  }));
  buildRecommendations(trip(), {
    bases: [{ name: 'Base One', lat: 50, lon: 8 }],
    highlights: [],
    catalogueRecommendations: accommodations
  }, days);
  assert.equal(new Set(days.map(day => day.sleepProposal.providerId)).size, 1);
  assert.deepEqual(days.map(day => day.accommodationOptions.map(item => item.providerId)), [
    ['hotel-A', 'hotel-B', 'hotel-C'],
    ['hotel-A', 'hotel-B', 'hotel-C'],
    ['hotel-A', 'hotel-B', 'hotel-C']
  ]);
});

test('stale motorcycle fallback copy is not relabelled and shown to car users', () => {
  const stalePlan = {
    days: [{ day: 1, kind: 'stay', overnight: 'Base One', location: 'Base One', to: 'Base One',
      toPoint: { lat: 50, lon: 8 }, recommendations: [{
        id: 'stale-motor', name: 'Verblijf passend bij motorreizigers', type: 'accommodation',
        reason: 'Motorparking controleren', vehicleFit: ['motorcycle'], vehicleProfileId: 'motorcycle',
        genericFallback: true, providerId: null
      }] }]
  };
  const enriched = enrichPlanWithCatalogue(trip(), { catalogue: true, catalogueRecommendations: [] }, stalePlan);
  assert.doesNotMatch(JSON.stringify(enriched), /motorreiziger|motorparking/i);
});

test('natural highlights without stay evidence remain activities, not overnight bases', () => {
  const anchors = [{
    id: 'natural-seed', name: 'Source-backed Nature Reserve', lat: 50, lon: 8,
    role: 'protected-area', significance: { score: 100 }, themes: ['nature'],
    vehicleFit: { car: 'supported', motorcycle: 'supported' },
    sources: [{ provider: 'Fixture provider', id: 'nature-1', url: 'https://example.test/nature-1' }],
    recommendations: { pois: [], accommodations: [], restaurants: [], services: [] }
  }, ...Array.from({ length: 8 }, (_, index) => ({
    id: `town-${index + 1}`, name: `Named touring town ${index + 1}`,
    lat: 49.8 + index * .08, lon: 7.8 + index * .1,
    role: index === 0 ? 'gateway-capital' : 'overnight-base',
    significance: { score: 62 - index }, themes: ['culture'],
    vehicleFit: { car: 'supported', motorcycle: 'supported' },
    sources: [{ provider: 'Fixture provider', id: `town-${index + 1}`, url: `https://example.test/town-${index + 1}` }],
    recommendations: { pois: [], accommodations: [], restaurants: [], services: [] }
  }))];
  const pack = {
    country: { code: 'TS', name: 'Testland' }, generatedAt: '2026-08-05',
    sources: [{ provider: 'Fixture provider', id: 'pack', url: 'https://example.test/pack', license: 'test' }],
    anchors,
    corridors: anchors.slice(2).map((anchor, index) => ({
      id: `corridor-${index + 1}`,
      fromAnchorId: anchors[index + 1].id,
      toAnchorId: anchor.id,
      distanceKm: 60,
      geometryType: 'fallback-straight-line',
      geometry: [[anchors[index + 1].lat, anchors[index + 1].lon], [anchor.lat, anchor.lon]],
      estimateMethod: 'geodesic estimate; not a road route'
    }))
  };
  const profiles = buildDestinationProfiles(pack, trip({ days: 10, maxChanges: 6 }), { limit: 3 });
  const natureConcept = profiles.find(profile => profile.id.includes('natural-seed'));
  assert.ok(natureConcept, 'the significant natural anchor should still create a regional concept');
  assert.notEqual(natureConcept.accessGateway.id, 'natural-seed');
  assert.equal(natureConcept.bases.some(base => base.id === 'natural-seed'), false,
    'a reserve with no source-backed stay evidence must not become an overnight base');
  assert.ok(natureConcept.highlights.some(highlight => highlight.id === 'natural-seed'),
    'the reserve must remain available as a named activity/highlight');
});
