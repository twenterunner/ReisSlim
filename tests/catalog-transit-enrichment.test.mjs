import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverCatalogueConcepts, enrichPlanWithCatalogue } from '../catalog-runtime.js';
import { buildItinerary } from '../itinerary-engine.js';
import { normalizeTrip } from '../trip-model.js';

function directTrip(destinationQuery, transport = 'car') {
  return normalizeTrip({
    id: `transit-${destinationQuery}-${transport}`,
    tripName: `Transit evidence ${destinationQuery}`,
    origin: 'Saasveld',
    originPoint: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
    destinationQuery,
    startDate: '2027-06-01',
    days: 14,
    budget: 10000,
    adults: 2,
    children: 0,
    transport,
    travelMode: 'direct',
    routeTopology: 'loop',
    tripPace: 'balanced',
    routeStyle: transport === 'motorcycle' ? 'scenic' : 'touring',
    fuelRangeKm: transport === 'motorcycle' ? 260 : 600,
    maxDrive: 5,
    maxChanges: 10,
    comfort: 'mid',
    strictBudget: true,
    strictDrive: true,
    strictChanges: true,
    allowStretch: true,
    liveData: false,
    preferences: ['natuur', 'cultuur'],
    preferenceWeights: { natuur: 2, cultuur: 2 }
  });
}

test('direct European discovery preloads only the sampled cross-border country packs', async () => {
  const result = await discoverCatalogueConcepts(directTrip('Italy'), { limit: 1 });
  assert.equal(result.destinations.length, 1);
  assert.deepEqual(result.transitCountryCodes, ['DE', 'AT']);
  assert.deepEqual(result.destinations[0].transitCountryCodes, ['DE', 'AT']);
  assert.equal(result.transitCountryCodes.includes('FR'), false, 'an unrelated country pack must not be requested');
  assert.equal(result.transitCountryCodes.includes('ES'), false, 'an unrelated country pack must not be requested');
});

test('named cross-border transit nights receive source-backed accommodation evidence', async () => {
  const trip = directTrip('Italy');
  const result = await discoverCatalogueConcepts(trip, { limit: 1 });
  const destination = result.destinations[0];
  const plan = enrichPlanWithCatalogue(trip, destination, buildItinerary(trip, destination));
  const transitDays = plan.days.filter(day => day.overnightRole === 'catalogue-transit');
  assert.ok(transitDays.length >= 2, 'the long direct journey should contain named transit nights');
  for (const day of transitDays) {
    assert.ok(day.accommodationOptions?.some(item => item.providerId && item.sourceUrl && !item.genericFallback),
      `day ${day.day} at ${day.overnight} should have a named source-backed accommodation candidate`);
    assert.equal(day.sleepProposal?.associatedBase, day.overnight);
  }
  assert.ok(plan.placeData.transitCountryCodes.includes('DE'));
  assert.ok(plan.placeData.transitCountryCodes.includes('AT'));
});

test('vehicle changes rebuild transit recommendations without cross-profile contamination', async () => {
  const motorcycleTrip = directTrip('Germany', 'motorcycle');
  const motorcycleResult = await discoverCatalogueConcepts(motorcycleTrip, { limit: 1 });
  const motorcycleDestination = motorcycleResult.destinations[0];
  const motorcyclePlan = enrichPlanWithCatalogue(motorcycleTrip, motorcycleDestination,
    buildItinerary(motorcycleTrip, motorcycleDestination));
  assert.ok(motorcyclePlan.days.some(day => day.overnightRole === 'catalogue-transit'));

  const carTrip = directTrip('Germany', 'car');
  const carResult = await discoverCatalogueConcepts(carTrip, { limit: 1 });
  const carDestination = carResult.destinations[0];
  const carPlan = enrichPlanWithCatalogue(carTrip, carDestination, buildItinerary(carTrip, carDestination));
  const carText = carPlan.days.filter(day => day.overnightRole === 'catalogue-transit')
    .flatMap(day => [day.primaryPlan, day.rainAlternative, ...(day.recommendations || [])
      .flatMap(item => [item.name, item.reason, item.vehicleFitExplanation])])
    .filter(Boolean).join(' | ');
  assert.doesNotMatch(carText, /motor(?:cycle|fiets|hotel|parking)/i);
  assert.ok(carPlan.days.filter(day => day.overnightRole === 'catalogue-transit')
    .every(day => (day.accommodationOptions || []).every(item => item.vehicleProfileId === 'car')));
});
