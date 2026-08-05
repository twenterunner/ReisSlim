import { validCoordinate } from './config.js';
import { transportId } from './vehicle-intelligence.js';

const rules = {
  car: {
    accommodation: 'Hotel of appartement met parking',
    stop: 'Comfortabele parkeer- en ruststop',
    restaurant: 'Restaurant met eenvoudige parkeermogelijkheid',
    activity: 'Activiteit met bereikbare openbare parking',
    service: 'Parkeerplek, tankstation of laadmogelijkheid'
  },
  motorcycle: {
    accommodation: 'Motorvriendelijk verblijf met veilige parking',
    stop: 'Motorstop met koffie, brandstof en beschutting',
    restaurant: 'Restaurant met zicht op of veilige plek voor de motor',
    activity: 'Korte activiteit langs een mooie motorroute',
    service: 'Tankstation binnen de ingestelde actieradius'
  },
  motorhome: {
    accommodation: 'Camperplaats of camping met servicevoorzieningen',
    stop: 'Ruime camperstop met brandstof en sanitaire pauzemogelijkheid',
    restaurant: 'Restaurant buiten de kern met grote parkeerplaats',
    activity: 'Activiteit met campergeschikte parking',
    service: 'Camperservice voor water, afval en sanitair'
  },
  caravan: {
    accommodation: 'Caravancamping met ruime, doorrijdbare standplaats',
    stop: 'Doorrijdbare rustplaats voor auto met caravan',
    restaurant: 'Restaurant langs de route met trailerparking',
    activity: 'Activiteit bereikbaar zonder krappe toegangsweg',
    service: 'Brandstof- en controlepunt met ruimte voor de combinatie'
  }
};

function recommendationPoint(point) {
  if (!validCoordinate(point)) return null;
  return { lat: Number(point.lat), lon: Number(point.lon) };
}

function proposal({ day, type, name, reason, point, transport, seed = 0 }) {
  return {
    id: `day-${day}-${type}-${seed}`,
    day,
    type,
    name,
    reason,
    point: recommendationPoint(point),
    vehicleFit: [transport],
    vehicleProfileId: transport,
    confidence: 'categorievoorstel',
    verified: false,
    source: 'ReisSlim offline voertuigregels',
    detourKm: null,
    openingHours: null,
    url: null,
    lastChecked: null,
    providerId: null,
    associatedBase: null,
    genericFallback: true,
    coordinateRole: 'search-anchor'
  };
}

function namedHighlightProposal(day, highlight, transport) {
  const point = recommendationPoint(highlight?.point || highlight);
  if (!highlight?.name || !point) return null;
  return {
    id: `day-${day.day}-activity-${highlight.id || highlight.providerId}`,
    providerId: highlight.providerId || highlight.id || null,
    day: day.day,
    associatedDay: day.day,
    associatedBase: day.overnight,
    type: 'activity',
    name: highlight.name,
    reason: `${day.primaryPlan} Opening, toegang en actuele omstandigheden zijn niet bevestigd.`,
    point,
    vehicleFit: [transport],
    vehicleProfileId: transport,
    confidence: highlight.confidence || 'provider-evidence',
    verified: false,
    live: true,
    source: highlight.evidence || highlight.provider || 'Providerbewijs uit dynamische ontdekking',
    detourKm: null,
    openingHours: null,
    url: highlight.sourceUrl || null,
    sourceUrl: highlight.sourceUrl || null,
    lastChecked: highlight.fetchedAt || null,
    freshness: highlight.fetchedAt || null,
    genericFallback: false,
    coordinateRole: 'provider-location'
  };
}

export function buildRecommendations(trip, destination, days) {
  const transport = transportId(trip.transport);
  const rule = rules[transport];
  const all = [];

  for (const day of days) {
    const recommendations = [];
    const isTravel = ['outward', 'return', 'transfer'].includes(day.kind);
    const isHomecoming = day.kind === 'return' && day.to === trip.origin;
    const anchor = day.toPoint || day.fromPoint || destination.bases[0];
    const highlight = day.activityId
      ? (destination.highlights || []).find(item => item.id === day.activityId || item.providerId === day.activityId)
      : null;

    for (const [index, waypoint] of (day.waypoints || []).entries()) {
      recommendations.push(proposal({
        day: day.day,
        type: waypoint.role === 'fuel' ? 'fuel' : 'rest',
        name: rule.stop,
        reason: waypoint.role === 'fuel'
          ? `Gepland rond de actieradius van ${trip.fuelRangeKm} km en gecombineerd met een rustpauze.`
          : 'Gepland vanuit de voertuigspecifieke pauzefrequentie.',
        point: waypoint,
        transport,
        seed: index
      }));
    }

    if (!isHomecoming) {
      recommendations.push(proposal({
        day: day.day,
        type: 'accommodation',
        name: `${rule.accommodation} in of nabij ${day.overnight}`,
        reason: isTravel
          ? 'Beperk de omweg, controleer aankomsttijd en bevestig voertuigvoorzieningen vóór boeken.'
          : 'Gebruik deze locatie als vaste uitvalsbasis om onnodige wissels te vermijden.',
        point: anchor,
        transport,
        seed: 4
      }));
      recommendations.push(proposal({
        day: day.day,
        type: 'restaurant',
        name: `Diner in ${day.location}: ${rule.restaurant.toLowerCase()}`,
        reason: isTravel
          ? 'Kies een locatie die open is bij de verwachte aankomst en geen extra zware omweg veroorzaakt.'
          : 'Past in de verblijfsdag; controleer openingstijd, prijsniveau en reserveringsbehoefte.',
        point: anchor,
        transport,
        seed: 5
      }));
    }

    if (!isTravel) {
      recommendations.push(namedHighlightProposal(day, highlight, transport) || proposal({
        day: day.day,
        type: 'activity',
        name: day.primaryPlan,
        reason: `${rule.activity}; houd rekening met weer, openingstijd en resterende energie.`,
        point: anchor,
        transport,
        seed: 6
      }));
    }

    if (['motorhome', 'caravan'].includes(transport) && !isHomecoming) {
      recommendations.push(proposal({
        day: day.day,
        type: 'service',
        name: rule.service,
        reason: 'Controleer doorrijhoogte, voertuiglengte en actuele toegankelijkheid.',
        point: anchor,
        transport,
        seed: 7
      }));
    }

    day.recommendations = recommendations;
    for (const item of recommendations) item.associatedBase ||= day.overnight;
    day.sleepProposal = recommendations.find(item => item.type === 'accommodation') || null;
    all.push(...recommendations);
  }
  return all;
}

export function recommendationsMatchVehicle(plan, vehicle) {
  const canonical = transportId(vehicle);
  return (plan?.recommendations || []).every(item => item.vehicleProfileId === canonical && item.vehicleFit?.includes(canonical));
}

export function collectRecommendationPoints(plan) {
  return (plan?.recommendations || [])
    .filter(item => validCoordinate(item.point))
    .map(item => ({ ...item.point, ...item, role: item.type }));
}
