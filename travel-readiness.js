import { isFlightMode, isMultimodal } from './multimodal-engine.js';
import { vehicleProfile } from './vehicle-intelligence.js';

const official = Object.freeze({
  advisory: 'https://www.nederlandwereldwijd.nl/reisadvies',
  entry: 'https://www.nederlandwereldwijd.nl/reizen',
  health: 'https://www.lcr.nl/landen',
  euPassenger: 'https://europa.eu/youreurope/citizens/travel/passenger-rights/index_nl.htm'
});

function item(id, label, status, detail, action = null, url = null, critical = false) {
  return { id, label, status, detail, action, url, critical, verified: false };
}

export function buildTravelReadiness(trip, destination, plan) {
  const profile = vehicleProfile(trip);
  const departure = new Date(`${trip.startDate}T12:00:00`);
  const daysUntil = Math.ceil((departure - new Date()) / 86400000);
  const results = [
    item('documents', 'Reisdocumenten & toegang', 'action', `Controleer paspoort/ID, geldigheid, visa en inreisvoorwaarden voor ${destination.country}. ReisSlim trekt geen visumconclusie zonder officiële broncontrole.`, 'Open de officiële landeninformatie en leg de uitkomst vast.', official.entry, true),
    item('advisory', 'Reisadvies', 'action', `Actueel reisadvies voor ${destination.country} is nog niet door ReisSlim geverifieerd.`, 'Controleer kort voor boeken en opnieuw voor vertrek.', official.advisory, true),
    item('health', 'Gezondheid & vaccinaties', 'action', 'Medische eisen en adviezen zijn persoons- en routeafhankelijk en nog niet geverifieerd.', 'Controleer LCR/GGD en bespreek persoonlijke risico’s met een deskundige.', official.health, false),
    item('insurance', 'Verzekering & pechhulp', 'action', `${profile.label}: controleer landen-, activiteit-, huur- en repatriëringsdekking.`, 'Bewaar polisnummer en alarmcentrale offline.', null, false),
    item('route', 'Routevalidatie', plan?.routing?.live ? 'review' : 'action', plan?.routing?.live ? 'Weggeometrie is live opgehaald; tijdelijke sluitingen en voertuigbeperkingen blijven te controleren.' : 'De route bevat indicatieve corridors en mag niet als turn-by-turn navigatie worden gebruikt.', 'Valideer de volledige route in een voertuiggeschikte navigatiebron.', null, true)
  ];
  if (isMultimodal(trip)) results.push(item('tickets', isFlightMode(trip) ? 'Vluchten & huurvoertuig' : 'Trein/ferry & aansluiting', 'action', 'Dienstregeling, prijs, bagage en boekbaarheid zijn niet live bevestigd.', 'Vergelijk echte verbindingen en controleer aansluiting, borg, grenspassage en annuleringsvoorwaarden.', official.euPassenger, true));
  if (profile.supportsDimensions) results.push(item('dimensions', 'Voertuigafmetingen', trip.vehicleHeightM && trip.vehicleLengthM && trip.vehicleWeightKg ? 'review' : 'blocked', `Profiel: ${trip.vehicleHeightM || '?'} m hoog, ${trip.vehicleLengthM || '?'} m lang, ${trip.vehicleWeightKg || '?'} kg.`, 'Bevestig waarden op kenteken/handleiding en gebruik zware-voertuigroutering.', null, true));
  if (trip.remoteTravel || destination.remoteReadinessRequired) results.push(item('remote', 'Afgelegen routegereedheid', 'action', 'Brandstofmarges, water, communicatie, permitten, wegconditie en evacuatiemogelijkheid moeten nog worden bevestigd.', 'Maak een remote-routecheck met minstens twee onafhankelijke actuele bronnen.', official.advisory, true));
  const blockers = results.filter(entry => entry.critical && ['blocked', 'action'].includes(entry.status));
  return {
    score: Math.max(0, 100 - blockers.length * 16 - results.filter(entry => entry.status === 'action' && !entry.critical).length * 6),
    status: blockers.length ? 'action-required' : 'review',
    blockers: blockers.length,
    daysUntilDeparture: Number.isFinite(daysUntil) ? daysUntil : null,
    items: results,
    disclaimer: 'Readiness is een controlelijst, geen juridisch, medisch of veiligheidsadvies. Niet geverifieerd betekent: controleer bij de officiële bron.'
  };
}

export { official as officialTravelSources };
