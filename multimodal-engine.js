import { validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { resolveOrigin } from './trip-model.js';

export const travelModes = Object.freeze({
  direct: { label: 'Roadtrip vanaf huis', accessMode: 'road' },
  'fly-drive': { label: 'Fly-drive', accessMode: 'flight', groundVehicle: 'car' },
  'fly-ride': { label: 'Fly-ride', accessMode: 'flight', groundVehicle: 'motorcycle' },
  'fly-camper': { label: 'Fly-camper', accessMode: 'flight', groundVehicle: 'motorhome' },
  'rail-ferry': { label: 'Trein / ferry + roadtrip', accessMode: 'surface', groundVehicle: 'car' }
});

export const isMultimodal = trip => trip?.travelMode && trip.travelMode !== 'direct';
export const isFlightMode = trip => ['fly-drive', 'fly-ride', 'fly-camper'].includes(trip?.travelMode);

export function effectiveGroundVehicle(trip) {
  return travelModes[trip?.travelMode]?.groundVehicle || trip?.transport || 'car';
}

function planningUrl(type, origin, destination) {
  const query = encodeURIComponent(`${origin || ''} ${destination || ''}`.trim());
  if (type === 'flight') return `https://www.google.com/travel/flights?q=${query}`;
  if (type === 'rail') return `https://www.seat61.com/search.htm?q=${query}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`ferry ${query}`)}`;
}

export function buildAccessSegments(trip, destination) {
  if (!isMultimodal(trip)) return [];
  const point = destination.bases?.[0];
  const origin = resolveOrigin(trip);
  const directKm = validCoordinate(origin) && validCoordinate(point) ? Math.round(haversineKm(origin, point)) : null;
  const flight = isFlightMode(trip);
  const accessType = flight ? 'flight' : 'rail-ferry';
  const durationLow = directKm ? Number((directKm / (flight ? 780 : 95) + (flight ? 3 : 1)).toFixed(1)) : null;
  const common = {
    mode: accessType,
    source: 'ReisSlim planning estimate',
    confidence: directKm ? 'low' : 'unknown',
    bookable: false,
    scheduleVerified: false,
    priceVerified: false,
    warning: 'Indicatieve logistieke bouwsteen; zoek en bevestig de echte verbinding, bagageregels en beschikbaarheid.'
  };
  const link = planningUrl(flight ? 'flight' : 'rail', trip.origin, destination.name);
  return [
    { id: 'access-outbound', direction: 'outbound', from: trip.origin, to: destination.name, distanceKm: directKm, durationHours: durationLow, externalSearchUrl: link, ...common },
    { id: 'rental-pickup', direction: 'local', mode: 'rental', vehicle: effectiveGroundVehicle(trip), from: destination.name, to: destination.name, source: 'ReisSlim checklist', confidence: 'unknown', bookable: false, warning: 'Vergelijk borg, verzekering, kilometerlimiet, grenspassage en one-way voorwaarden.' },
    { id: 'access-return', direction: 'return', from: destination.name, to: trip.origin, distanceKm: directKm, durationHours: durationLow, externalSearchUrl: link, ...common }
  ];
}

export function estimateAccessCosts(trip, destination) {
  if (!isMultimodal(trip)) return null;
  const travellers = Math.max(1, Number(trip.adults || 0) + Number(trip.children || 0));
  const origin = resolveOrigin(trip);
  const distance = validCoordinate(origin) && validCoordinate(destination.bases?.[0]) ? haversineKm(origin, destination.bases[0]) : 2500;
  const flight = isFlightMode(trip);
  const perTraveller = flight ? Math.max(120, Math.min(1250, 90 + distance * .13)) : Math.max(70, Math.min(650, 45 + distance * .08));
  const transport = Math.round(perTraveller * travellers);
  const rentalDaily = { 'fly-drive': 58, 'fly-ride': 78, 'fly-camper': 145, 'rail-ferry': 45 }[trip.travelMode] || 0;
  const rental = Math.round(Math.max(1, trip.days - 2) * rentalDaily);
  const baggage = flight ? Math.round(travellers * (trip.travelMode === 'fly-ride' ? 95 : 45)) : 0;
  const central = transport + rental + baggage;
  return {
    transport, rental, baggage, central,
    low: Math.round(central * .72), high: Math.round(central * 1.48),
    confidence: 'low',
    assumptions: ['Geen live tarief of beschikbaarheid', 'Retourverbinding en standaard bagage indicatief', 'Huurprijs exclusief borg en locatiegebonden toeslagen']
  };
}
