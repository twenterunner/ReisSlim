import { budgetAssumptions, roundMoney } from './config.js';
import { calculateRouteMetrics } from './route-engine.js';
import { transportId, vehicleProfile } from './vehicle-intelligence.js';
import { estimateAccessCosts, isMultimodal } from './multimodal-engine.js';

const nonRoadModes = new Set(['air', 'flight', 'ferry', 'rail', 'rail-ferry', 'surface', 'train']);

function canonicalRoadDistanceKm(itinerary) {
  if (!Array.isArray(itinerary?.days)) return null;
  return itinerary.days.reduce((sum, day) => {
    const distanceKm = Number(day?.distanceKm);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return sum;
    const modes = [day?.mode, day?.transportMode, ...(day?.transportSegments || []).map(segment => segment?.mode)]
      .map(mode => String(mode || '').trim().toLowerCase())
      .filter(Boolean);
    return modes.some(mode => nonRoadModes.has(mode)) ? sum : sum + distanceKm;
  }, 0);
}

export function travellerEquivalents(trip) {
  return trip.adults + trip.children * budgetAssumptions.childEquivalent;
}

export function buildBudget(trip, destination, itinerary = null) {
  const route = itinerary?.routeMetrics || calculateRouteMetrics(trip, destination);
  const equivalents = travellerEquivalents(trip);
  const nights = Math.max(0, trip.days - 1);
  const rooms = Math.max(1, Math.ceil((trip.adults + trip.children) / budgetAssumptions.peoplePerRoom));
  const comfort = budgetAssumptions.comfortFactor[trip.comfort] || 1;
  const restaurantShare = budgetAssumptions.restaurantShare[trip.comfort] ?? .45;
  const profile = vehicleProfile(trip);
  const transport = transportId(trip.transport);
  const canonicalDistanceKm = canonicalRoadDistanceKm(itinerary);
  const localDistanceKm = canonicalDistanceKm ?? trip.days * 45;
  const totalDistanceKm = canonicalDistanceKm
    ?? (isMultimodal(trip) ? localDistanceKm : route.oneWayDistanceKm * 2 + localDistanceKm);
  const accommodationUnits = ['motorhome', 'caravan'].includes(transport) ? 1 : rooms;
  const strategy = itinerary?.costStrategy || {};
  const accommodation = roundMoney(nights * destination.nightMid * accommodationUnits * comfort * profile.accommodationFactor * (strategy.accommodationFactor || 1));
  const accessCosts = estimateAccessCosts(trip, destination);
  const fuel = roundMoney(totalDistanceKm / 100 * profile.consumption * budgetAssumptions.fuelPricePerLitre);
  const parking = roundMoney(Math.max(0, trip.days - 2) * profile.parkingDaily);
  const groceries = roundMoney(trip.days * equivalents * budgetAssumptions.groceriesPerEquivalentDay * (1 - restaurantShare));
  const restaurants = roundMoney(trip.days * equivalents * budgetAssumptions.restaurantPerEquivalentDay * restaurantShare * (strategy.restaurantFactor || 1));
  const activities = roundMoney(trip.days * destination.activityDaily * (equivalents / 3.2) * (strategy.activityFactor || 1));
  const tolls = roundMoney(destination.toll * profile.tollFactor);
  const subtotal = accommodation + fuel + tolls + parking + groceries + restaurants + activities;
  const contingency = roundMoney(Math.max(budgetAssumptions.minimumContingency, subtotal * budgetAssumptions.contingencyRate));
  const rows = [
    ...(accessCosts ? [['Internationale verbinding', accessCosts.transport], ['Huurvoertuig', accessCosts.rental], ['Bagage & uitrusting', accessCosts.baggage]] : []),
    ['Accommodatie', accommodation], ['Brandstof', fuel], ['Tol & vignetten', tolls],
    ['Parkeren', parking], ['Boodschappen', groceries], ['Restaurants', restaurants],
    ['Activiteiten', activities], ['Onvoorzien', contingency]
  ];
  const total = rows.reduce((sum, [, amount]) => sum + amount, 0);
  const remaining = roundMoney(trip.budget - total);
  const sourceBackedCostEvidence = destination?.costEvidence?.sourceBacked === true;
  const confidence = route.originKnown && destination.nightMid && destination.activityDaily && sourceBackedCostEvidence
    ? 'redelijk'
    : 'beperkt';
  const uncertaintyRate = accessCosts ? 0.24 : confidence === 'redelijk' ? 0.08 : 0.15;
  const conservativeTotal = accessCosts ? roundMoney(total - accessCosts.central + accessCosts.high) : roundMoney(total * (1 + uncertaintyRate));
  const lowTotal = accessCosts ? roundMoney(total - accessCosts.central + accessCosts.low) : roundMoney(total * Math.max(.82, 1 - uncertaintyRate));
  return {
    rows, total, subtotal, remaining, nights, rooms, equivalents,
    lowTotal, conservativeTotal,
    conservativeRemaining: roundMoney(trip.budget - conservativeTotal),
    uncertaintyRate,
    totalDistanceKm: roundMoney(totalDistanceKm),
    perDay: roundMoney(total / trip.days),
    perTravellerEquivalent: roundMoney(total / Math.max(1, equivalents)),
    confidence: accessCosts ? 'beperkt' : confidence,
    accessCosts,
    assumptions: {
      ...budgetAssumptions,
      consumption: profile.consumption,
      vehicle: profile.label,
      accommodationFactor: profile.accommodationFactor,
      tollFactor: profile.tollFactor,
      nightlyRate: Number(destination.nightMid || 0),
      activityRatePerDay: Number(destination.activityDaily || 0),
      costModelSource: destination?.costEvidence?.source || 'ReisSlim generieke kostenprior; geen actuele lokale prijsbron',
      sourceBackedCostEvidence,
      roadDistanceSource: canonicalDistanceKm !== null
        ? 'Som van alle wegkilometers in het canonieke dagplan; niet-wegtransfers uitgesloten'
        : 'Fallback-afstandsraming omdat geen canoniek dagplan beschikbaar was',
      accessAssumptions: accessCosts?.assumptions || []
    }
  };
}
