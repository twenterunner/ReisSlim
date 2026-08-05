import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDistanceKm, selectTouringAnchors, significanceScore } from '../scripts/catalog-ranking.mjs';

function place(id, name, featureCode, population, admin1, lat, lon, overrides = {}) {
  return {
    id, name, asciiName: name, alternateNames: '', featureClass: 'P', featureCode,
    population, admin1, lat, lon, nearbyRecommendationCount: 0, ...overrides
  };
}

function highlight(id, name, featureCode, admin1, lat, lon, overrides = {}) {
  return {
    id, name, asciiName: name, alternateNames: '', featureClass: 'T', featureCode,
    population: 0, admin1, lat, lon, nearbyRecommendationCount: 0, ...overrides
  };
}

test('evidence weighting distinguishes an administrative touring base from a populous metro section', () => {
  const regionalBase = place('base', 'Evidence Town', 'PPLA3', 70_000, 'west', -33.6, 22.2, {
    alternateNames: 'Evidence Town,Evidencestad,Base locale', nearbyRecommendationCount: 10
  });
  const metroSection = place('section', 'Metro Section', 'PPLX', 800_000, 'metro', -26.2, 28.05, {
    alternateNames: 'Metro Section', nearbyRecommendationCount: 40
  });
  const canyon = highlight('canyon', 'Evidence Canyon', 'CNYN', 'north', -24.5, 30.8, {
    alternateNames: 'Evidence Canyon,Local canyon', nearbyRecommendationCount: 6
  });

  assert.ok(significanceScore(regionalBase) > significanceScore(metroSection));
  assert.ok(significanceScore(canyon) > significanceScore(metroSection));
  assert.notEqual(significanceScore(regionalBase), 100, 'ordinary evidence must not collapse into a saturated score');
});

test('spatial deduplication prevents one metropolitan area from consuming country slots', () => {
  const records = [
    place('capital', 'Capital City', 'PPLC', 2_000_000, 'central', -26.20, 28.04),
    place('suburb-a', 'Capital North', 'PPL', 700_000, 'central', -26.10, 28.03),
    place('suburb-b', 'Capital East', 'PPL', 500_000, 'central', -26.22, 28.17),
    place('section', 'Capital Section', 'PPLX', 900_000, 'central', -26.19, 28.07),
    place('west', 'Western Base', 'PPLA3', 75_000, 'west', -33.60, 22.20),
    place('coast', 'Coastal Base', 'PPLA3', 70_000, 'west', -34.04, 23.05),
    place('east', 'Eastern Base', 'PPLA2', 120_000, 'east', -29.60, 30.40),
    place('north', 'Northern Base', 'PPLA2', 110_000, 'north', -23.90, 29.47),
    highlight('park', 'National Park', 'PRK', 'north', -24.25, 31.55),
    highlight('pass', 'Mountain Pass', 'PASS', 'west', -33.40, 21.10),
    highlight('falls', 'Great Falls', 'FLLS', 'east', -28.50, 30.10),
    highlight('coastline', 'Wild Cape', 'CAPE', 'coast', -32.00, 29.00)
  ];
  const selected = selectTouringAnchors(records, 9);
  const selectedNames = new Set(selected.map(record => record.name));
  const capital = selected.find(record => record.id === 'capital');
  const nearbySettlements = selected.filter(record => record.featureClass === 'P'
    && recordDistanceKm(record, capital) < 24);

  assert.ok(capital);
  assert.equal(nearbySettlements.length, 1);
  assert.equal(selectedNames.has('Capital Section'), false);
  assert.ok(selectedNames.has('Western Base'));
  assert.ok(selectedNames.has('Coastal Base'));
  assert.ok(selectedNames.has('National Park'));
});

test('country selection cycles administrative areas and geographic cells', () => {
  const records = [];
  for (const [areaIndex, area] of ['north', 'south', 'east', 'west'].entries()) {
    for (let index = 0; index < 4; index += 1) {
      records.push(place(`${area}-${index}`, `${area} base ${index}`, index === 0 ? 'PPLA2' : 'PPL',
        150_000 - index * 10_000, area, 40 + areaIndex * 2 + index * 0.25, 10 + areaIndex * 3 + index * 0.25));
      records.push(highlight(`${area}-h-${index}`, `${area} highlight ${index}`, index % 2 ? 'PASS' : 'CSTL',
        area, 40 + areaIndex * 2 + index * 0.3, 11 + areaIndex * 3 + index * 0.3));
    }
  }
  const selected = selectTouringAnchors(records, 12);
  const representedAreas = new Set(selected.map(record => record.admin1));
  const latitudeSpan = Math.max(...selected.map(record => record.lat)) - Math.min(...selected.map(record => record.lat));
  const longitudeSpan = Math.max(...selected.map(record => record.lon)) - Math.min(...selected.map(record => record.lon));

  assert.equal(selected.length, 12);
  assert.deepEqual([...representedAreas].sort(), ['east', 'north', 'south', 'west']);
  assert.ok(latitudeSpan > 5);
  assert.ok(longitudeSpan > 8);
});

