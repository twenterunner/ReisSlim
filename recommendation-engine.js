import { validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { recommendationVehicleCompatible, transportId } from './vehicle-intelligence.js';

const rules = {
  car: {
    accommodation: 'Hotel of appartement met parking',
    stop: 'Comfortabele parkeer- en ruststop',
    restaurant: 'Restaurant met eenvoudige parkeermogelijkheid',
    activity: 'Activiteit met bereikbare openbare parking',
    service: 'Parkeerplek, tankstation of laadmogelijkheid'
  },
  motorcycle: {
    accommodation: 'Verblijf passend bij motorreizigers',
    stop: 'Motorstop met koffie, brandstof en beschutting',
    restaurant: 'Restaurant met praktische motorparking; beveiliging niet geverifieerd',
    activity: 'Korte activiteit passend in de motorrit',
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
    live: !highlight.catalogue,
    catalogue: Boolean(highlight.catalogue),
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

const normalized = value => String(value || '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ');

export function accommodationIdentity(item, baseName = '') {
  const base = normalized(baseName || item?.associatedBase || 'unknown-base');
  const provider = normalized(item?.provider || item?.source || 'local');
  const providerId = normalized(item?.providerId);
  if (providerId) return `${base}|provider:${provider}:${providerId}`;
  const stableId = normalized(item?.accommodationSourceId || item?.id);
  if (stableId && !/^day-\d+-/.test(stableId)) return `${base}|id:${stableId}`;
  const name = normalized(item?.name || 'unassigned');
  return `${base}|name:${name}`;
}

export function annotateAccommodationContinuity(days = [], origin = '') {
  const originKey = normalized(origin);
  const stays = [];
  let previous = null;
  let totalChanges = 0;
  let propertyChanges = 0;

  for (const day of days) {
    const baseKey = normalized(day?.overnight);
    if (!baseKey || baseKey === originKey) {
      day.accommodationIdentity = null;
      day.accommodationChanged = false;
      day.accommodationChangeType = null;
      continue;
    }
    const selected = day.sleepProposal || day.accommodationOptions?.[0]
      || (day.recommendations || []).find(item => item.type === 'accommodation') || null;
    const identity = selected ? accommodationIdentity(selected, day.overnight) : `${baseKey}|unassigned`;
    const changed = Boolean(previous && previous.identity !== identity);
    const changeType = changed ? (previous.baseKey === baseKey ? 'property' : 'base') : null;
    if (changed) totalChanges += 1;
    if (changeType === 'property') propertyChanges += 1;
    day.accommodationIdentity = identity;
    day.accommodationChanged = changed;
    day.accommodationChangeType = changeType;

    const currentStay = stays.at(-1);
    if (currentStay && currentStay.identity === identity && currentStay.endDay === Number(day.day) - 1) {
      currentStay.endDay = Number(day.day);
      currentStay.endDate = day.date || currentStay.endDate;
      currentStay.nights += 1;
    } else {
      stays.push({
        id: `stay-${stays.length + 1}-${identity}`,
        identity,
        base: day.overnight,
        propertyName: selected?.name || null,
        provider: selected?.provider || selected?.source || null,
        providerId: selected?.providerId || null,
        startDay: Number(day.day),
        endDay: Number(day.day),
        startDate: day.date || null,
        endDate: day.date || null,
        nights: 1,
        verified: Boolean(selected?.verified),
        genericFallback: Boolean(selected?.genericFallback)
      });
    }
    previous = { identity, baseKey };
  }
  return { totalChanges, propertyChanges, stays };
}

function catalogueType(item) {
  const type = normalized(item?.type || item?.category);
  if (['poi', 'sight', 'attraction', 'highlight', 'activity'].includes(type)) return 'activity';
  if (['hotel', 'camping', 'campsite', 'guesthouse', 'accommodation'].includes(type)) return 'accommodation';
  if (['cafe', 'café', 'food', 'restaurant'].includes(type)) return 'restaurant';
  if (['fuel', 'petrol', 'charging'].includes(type)) return 'fuel';
  if (['rest', 'rest-area', 'rest_area'].includes(type)) return 'rest';
  if (['service', 'vehicle-service', 'vehicle_service'].includes(type)) return 'service';
  return type;
}

function cataloguePoint(item) {
  return recommendationPoint(item?.point || item);
}

function vehicleCompatible(item, transport) {
  return recommendationVehicleCompatible(item, transport);
}

function catalogueReason(item, type, transport) {
  const vehicleNote = item?.vehicleNotes?.[transport] || item?.vehicleFitExplanation?.[transport];
  if (vehicleNote) return vehicleNote;
  if (transport === 'motorcycle' && type === 'accommodation') return item?.parkingEvidence
    ? 'Genoemde catalogusoptie; controleer de vermelde motorparking en actuele toegang rechtstreeks bij de accommodatie.'
    : 'Genoemde catalogusoptie; veiligheid of overdekking van motorparking is niet geverifieerd.';
  if (transport === 'motorcycle' && ['fuel', 'rest', 'service'].includes(type)) {
    return 'Genoemde catalogusstop; controleer opening, brandstofbeschikbaarheid en veilige bereikbaarheid voor vertrek.';
  }
  if (transport === 'car' && type === 'accommodation') return item?.parkingEvidence
    ? 'Genoemde catalogusoptie met parkeerevidence; controleer actuele toegang, hoogte en beschikbaarheid rechtstreeks.'
    : 'Genoemde catalogusoptie; parkeertoegang en beschikbaarheid zijn niet geverifieerd.';
  return item?.reason || item?.evidence || 'Genoemde plaats uit de versievaste ReisSlim touringcatalogus; controleer actuele omstandigheden bij de bron.';
}

function namedCatalogueProposal(day, item, transport, anchor, { routeAware = false } = {}) {
  const point = cataloguePoint(item);
  const type = catalogueType(item);
  if (!item?.name || !point || !type) return null;
  return {
    id: `catalog-${item.id || item.providerId}-${day.day}`,
    providerId: item.providerId || item.id || null,
    day: day.day,
    associatedDay: day.day,
    associatedBase: day.overnight,
    sourceAssociatedBase: item.associatedBase || null,
    type,
    name: item.name,
    reason: catalogueReason(item, type, transport),
    point,
    vehicleFit: [transport],
    vehicleProfileId: transport,
    confidence: item.confidence || 'catalogue-evidence',
    verified: false,
    live: false,
    source: item.source || 'ReisSlim touringcatalogus',
    sourceUrl: item.sourceUrl || item.url || null,
    url: item.sourceUrl || item.url || null,
    lastChecked: item.lastChecked || null,
    freshness: item.lastChecked || null,
    openingHours: item.openingHours || null,
    straightLineDistanceKm: validCoordinate(anchor) ? haversineKm(anchor, point) : null,
    routeDistanceKm: routeAware && validCoordinate(anchor) ? haversineKm(anchor, point) : null,
    routeAware: routeAware && ['fuel', 'rest', 'service'].includes(type),
    parkingEvidence: item.parkingEvidence || null,
    accessEvidence: item.accessEvidence || null,
    vehicleFitEvidence: item.vehicleFitEvidence || null,
    vehicleCategoryEvidence: item.vehicleCategoryEvidence || null,
    sourceVehicleFit: item.vehicleFit || null,
    genericFallback: false,
    coordinateRole: 'catalogue-location',
    availabilityWarning: type === 'accommodation'
      ? 'Genoemde accommodatiekandidaat — beschikbaarheid en prijs niet geverifieerd.'
      : type === 'restaurant'
        ? 'Genoemde horecakandidaat — opening en beschikbaarheid niet geverifieerd.'
        : 'Genoemde catalogusplaats — opening en toegang niet geverifieerd.'
  };
}

function baseMatches(item, day) {
  const associated = normalized(item?.associatedBase || item?.baseName || item?.anchorName);
  if (!associated) return true;
  return [day.overnight, day.location, day.to, day.from].some(value => normalized(value) === associated);
}

function catalogueCandidates(destination, day, type, transport, anchor) {
  return (destination.catalogueRecommendations || [])
    .filter(item => catalogueType(item) === type && vehicleCompatible(item, transport) && cataloguePoint(item))
    .map(item => ({ item, distance: validCoordinate(anchor) ? haversineKm(anchor, cataloguePoint(item)) : 0 }))
    .filter(({ item, distance }) => type === 'accommodation'
      ? normalized(item?.associatedBase || item?.baseName || item?.anchorName) === normalized(day.overnight)
      : baseMatches(item, day) || Number(distance || 0) <= (['fuel', 'rest', 'service'].includes(type) ? 90 : 45))
    .sort((left, right) => Number(!baseMatches(left.item, day)) - Number(!baseMatches(right.item, day))
      || Number(left.distance || 0) - Number(right.distance || 0)
      || String(left.item.name).localeCompare(String(right.item.name), 'nl'))
    .map(({ item }) => item);
}

export function buildRecommendations(trip, destination, days) {
  const transport = transportId(trip.transport);
  const rule = rules[transport];
  const all = [];
  const usedCatalogueIds = new Set();
  const accommodationOptionsByBase = new Map();

  const takeCatalogue = (day, type, anchor, maximum = 1, options = {}) => {
    const chosen = [];
    for (const item of catalogueCandidates(destination, day, type, transport, anchor)) {
      const identity = `${type}:${item.id || item.providerId || normalized(item.name)}`;
      if (usedCatalogueIds.has(identity)) continue;
      const proposalItem = namedCatalogueProposal(day, item, transport, anchor, options);
      if (!proposalItem) continue;
      usedCatalogueIds.add(identity);
      chosen.push(proposalItem);
      if (chosen.length >= maximum) break;
    }
    return chosen;
  };

  for (const [dayIndex, day] of days.entries()) {
    const recommendations = [];
    const isTravel = ['outward', 'return', 'transfer'].includes(day.kind);
    const isHomecoming = day.kind === 'return' && day.to === trip.origin;
    const anchor = day.toPoint || day.fromPoint || destination.bases[0];
    const highlight = day.activityId
      ? (destination.highlights || []).find(item => item.id === day.activityId || item.providerId === day.activityId)
      : null;

    for (const [index, waypoint] of (day.waypoints || []).entries()) {
      const namedStop = takeCatalogue(day, waypoint.role === 'fuel' ? 'fuel' : 'rest', waypoint, 1, { routeAware: true });
      recommendations.push(...(namedStop.length ? namedStop : [proposal({
        day: day.day,
        type: waypoint.role === 'fuel' ? 'fuel' : 'rest',
        name: rule.stop,
        reason: waypoint.role === 'fuel'
          ? `Gepland rond de actieradius van ${trip.fuelRangeKm} km en gecombineerd met een rustpauze.`
          : 'Gepland vanuit de voertuigspecifieke pauzefrequentie.',
        point: waypoint,
        transport,
        seed: index
      })]));
    }

    if (!isHomecoming) {
      const baseKey = normalized(day.overnight);
      const arrivedAtNewBase = dayIndex === 0 || normalized(days[dayIndex - 1]?.overnight) !== baseKey;
      const namedAccommodations = arrivedAtNewBase ? takeCatalogue(day, 'accommodation', anchor, 3) : [];
      if (namedAccommodations.length) {
        recommendations.push(...namedAccommodations);
        accommodationOptionsByBase.set(baseKey, namedAccommodations);
      } else if (!accommodationOptionsByBase.has(baseKey)) {
        const fallbackAccommodation = proposal({
          day: day.day,
          type: 'accommodation',
          name: `${rule.accommodation} in of nabij ${day.overnight}`,
          reason: isTravel
            ? 'Beperk de omweg, controleer aankomsttijd en bevestig voertuigvoorzieningen vóór boeken.'
            : 'Gebruik deze locatie als vaste uitvalsbasis om onnodige wissels te vermijden.',
          point: anchor,
          transport,
          seed: 4
        });
        recommendations.push(fallbackAccommodation);
        accommodationOptionsByBase.set(baseKey, [fallbackAccommodation]);
      }
      if (day.kind !== 'unplanned') {
        const namedRestaurant = takeCatalogue(day, 'restaurant', anchor, 1);
        recommendations.push(...(namedRestaurant.length ? namedRestaurant : [proposal({
          day: day.day,
          type: 'restaurant',
          name: `Diner in ${day.location}: ${rule.restaurant.toLowerCase()}`,
          reason: isTravel
            ? 'Kies een locatie die open is bij de verwachte aankomst en geen extra zware omweg veroorzaakt.'
            : 'Past in de verblijfsdag; controleer openingstijd, prijsniveau en reserveringsbehoefte.',
          point: anchor,
          transport,
          seed: 5
        })]));
      }
    }

    if (!isTravel && day.kind !== 'unplanned') {
      const namedActivity = namedHighlightProposal(day, highlight, transport) || takeCatalogue(day, 'activity', anchor, 1)[0];
      recommendations.push(namedActivity || proposal({
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
      const namedService = takeCatalogue(day, 'service', anchor, 1);
      recommendations.push(...(namedService.length ? namedService : [proposal({
        day: day.day,
        type: 'service',
        name: rule.service,
        reason: 'Controleer doorrijhoogte, voertuiglengte en actuele toegankelijkheid.',
        point: anchor,
        transport,
        seed: 7
      })]));
    }

    day.recommendations = recommendations;
    for (const item of recommendations) item.associatedBase ||= day.overnight;
    day.accommodationOptions = accommodationOptionsByBase.get(normalized(day.overnight)) || [];
    day.sleepProposal = day.accommodationOptions[0] || null;
    all.push(...recommendations);
  }
  annotateAccommodationContinuity(days, trip.origin);
  return all;
}

export function recommendationsMatchVehicle(plan, vehicle) {
  const canonical = transportId(vehicle);
  return (plan?.recommendations || []).every(item => item.vehicleProfileId === canonical && item.vehicleFit?.includes(canonical));
}

export function collectRecommendationPoints(plan) {
  const days = plan?.days || [];
  const dayByNumber = new Map(days.map(day => [Number(day.day), day]));
  const canonical = [...(plan?.recommendations || []), ...days.flatMap(day => day.recommendations || [])];
  const points = [];
  const seen = new Set();

  for (const item of canonical) {
    if (!validCoordinate(item?.point)) continue;
    const identity = item.providerId
      ? `${item.provider || item.source || 'provider'}:${item.providerId}:${item.day || item.associatedDay || ''}`
      : item.id || `${item.day}:${item.type}:${Number(item.point.lat).toFixed(5)}:${Number(item.point.lon).toFixed(5)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const day = dayByNumber.get(Number(item.day || item.associatedDay));
    const routePoints = [...(day?.waypoints || []), ...(day?.geometry || [])].filter(validCoordinate);
    const distanceToRouteKm = routePoints.length
      ? Math.min(...routePoints.map(routePoint => haversineKm(item.point, routePoint) ?? Infinity))
      : null;
    const namedRouteService = ['fuel', 'rest', 'service'].includes(item.type)
      && Boolean(item.providerId) && Number.isFinite(distanceToRouteKm) && distanceToRouteKm <= 90;
    points.push({
      ...item.point,
      ...item,
      role: item.type,
      routeAware: Boolean(item.routeAware || namedRouteService),
      routeDistanceKm: Number.isFinite(distanceToRouteKm) ? Number(distanceToRouteKm.toFixed(1)) : item.routeDistanceKm ?? null
    });
  }

  for (const day of days) {
    for (const [index, waypoint] of (day.waypoints || []).entries()) {
      if (!validCoordinate(waypoint)) continue;
      const type = waypoint.role === 'fuel' ? 'fuel' : 'rest';
      points.push({
        ...waypoint,
        id: `day-${day.day}-canonical-waypoint-${index + 1}`,
        day: day.day,
        associatedDay: day.day,
        associatedBase: day.overnight,
        date: day.date,
        type,
        role: type,
        name: waypoint.name || (type === 'fuel' ? `Brandstof- en ruststop ${index + 1}` : `Ruststop ${index + 1}`),
        reason: type === 'fuel'
          ? 'Canoniek geplande brandstof- en rustpositie op deze dagroute; kies ter plaatse een veilige, geopende voorziening.'
          : 'Canoniek geplande rustpositie op basis van het voertuigprofiel; kies ter plaatse een veilige, geopende voorziening.',
        source: 'Canonieke ReisSlim-dagroute',
        confidence: waypoint.approximate ? 'estimated' : 'planned',
        verified: false,
        genericFallback: false,
        plannedWaypoint: true,
        routeAware: true,
        coordinateRole: 'canonical-route-waypoint'
      });
    }
  }
  return points;
}
