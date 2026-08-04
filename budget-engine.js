import { budgetAssumptions, roundMoney, transportProfiles } from './config.js';
import { calculateRouteMetrics } from './route-engine.js';

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
  const profile = transportProfiles[trip.transport] || transportProfiles.car;
  const localDistanceKm = itinerary?.days?.reduce((sum, day) => sum + (day.kind === 'stay' || day.kind === 'flex' || day.kind === 'transfer' ? Number(day.distanceKm || 0) : 0), 0)
    ?? trip.days * 45;
  const totalDistanceKm = route.oneWayDistanceKm * 2 + localDistanceKm;
  const accommodation = roundMoney(nights * destination.nightMid * rooms * comfort);
  const fuel = roundMoney(totalDistanceKm / 100 * profile.consumption * budgetAssumptions.fuelPricePerLitre);
  const parking = roundMoney(Math.max(0, trip.days - 2) * profile.parkingDaily);
  const groceries = roundMoney(trip.days * equivalents * budgetAssumptions.groceriesPerEquivalentDay * (1 - restaurantShare));
  const restaurants = roundMoney(trip.days * equivalents * budgetAssumptions.restaurantPerEquivalentDay * restaurantShare);
  const activities = roundMoney(trip.days * destination.activityDaily * (equivalents / 3.2));
  const tolls = roundMoney(destination.toll);
  const subtotal = accommodation + fuel + tolls + parking + groceries + restaurants + activities;
  const contingency = roundMoney(Math.max(budgetAssumptions.minimumContingency, subtotal * budgetAssumptions.contingencyRate));
  const rows = [
    ['Accommodatie', accommodation], ['Brandstof', fuel], ['Tol & vignetten', tolls],
    ['Parkeren', parking], ['Boodschappen', groceries], ['Restaurants', restaurants],
    ['Activiteiten', activities], ['Onvoorzien', contingency]
  ];
  const total = rows.reduce((sum, [, amount]) => sum + amount, 0);
  const remaining = roundMoney(trip.budget - total);
  const confidence = route.originKnown && destination.nightMid && destination.activityDaily ? 'redelijk' : 'beperkt';
  return {
    rows, total, subtotal, remaining, nights, rooms, equivalents,
    totalDistanceKm: roundMoney(totalDistanceKm),
    perDay: roundMoney(total / trip.days),
    perTravellerEquivalent: roundMoney(total / Math.max(1, equivalents)),
    confidence,
    assumptions: { ...budgetAssumptions, consumption: profile.consumption }
  };
}
