import { validCoordinate } from './config.js';
import { transportId, vehicleProfile } from './vehicle-intelligence.js';

export function validatePlan(trip, destination, plan, budget) {
  const maxElapsed = Math.max(0, ...plan.days.map(day => Number(day.elapsedHours ?? day.driveHours ?? 0)));
  const originAsStay = plan.days.some(day => ['stay', 'flex', 'transfer'].includes(day.kind) && day.location === trip.origin);
  const invalidCoordinates = plan.days.filter(day => day.toPoint && !validCoordinate(day.toPoint)).length;
  const vehicle = transportId(trip.transport);
  const incompatible = (plan.recommendations || []).filter(item => !item.vehicleFit?.includes(vehicle)).length;
  const dimensionsReady = !vehicleProfile(trip).supportsDimensions
    || [trip.vehicleHeightM, trip.vehicleLengthM, trip.vehicleWeightKg].every(value => Number.isFinite(value) && value > 0);
  const constraintStatus = plan.constraintStatus;
  return [
    { level: budget.total <= trip.budget ? 'ok' : constraintStatus?.stretch ? 'warn' : 'bad', label: 'Budget', detail: `€${budget.total.toLocaleString('nl-NL')} van €${trip.budget.toLocaleString('nl-NL')} (voorzichtig: €${budget.conservativeTotal.toLocaleString('nl-NL')})` },
    { level: maxElapsed <= trip.maxDrive + .05 ? 'ok' : constraintStatus?.stretch ? 'warn' : 'bad', label: 'Max. totale reistijd', detail: `${maxElapsed.toFixed(1)} uur; limiet ${trip.maxDrive.toFixed(1)} uur inclusief pauzes` },
    { level: plan.days.length === trip.days ? 'ok' : 'bad', label: 'Aantal dagen', detail: `${plan.days.length} van ${trip.days}` },
    { level: constraintStatus?.exact ? 'ok' : constraintStatus?.stretch ? 'warn' : 'bad', label: 'Harde voorwaarden', detail: constraintStatus?.summary || (plan.feasible ? 'Plan is haalbaar' : 'Plan moet worden aangepast') },
    { level: plan.accommodationChanges <= trip.maxChanges ? 'ok' : constraintStatus?.stretch ? 'warn' : 'bad', label: 'Accommodatiewissels', detail: `${plan.accommodationChanges} gepland; maximum ${trip.maxChanges}` },
    { level: originAsStay ? 'bad' : 'ok', label: 'Vertrekplaats', detail: originAsStay ? 'Vertrekplaats wordt onterecht als verblijf gebruikt' : 'Alleen vertrek- en terugkeerpunt' },
    { level: invalidCoordinates ? 'bad' : 'ok', label: 'Kaartdata', detail: invalidCoordinates ? `${invalidCoordinates} ongeldige routepunten` : 'Alle opgenomen routepunten zijn geldig' },
    { level: incompatible ? 'bad' : 'ok', label: 'Voertuigmatch', detail: incompatible ? `${incompatible} voorstellen passen niet bij het voertuig` : `Alle voorstellen zijn gericht op ${vehicleProfile(trip).label.toLowerCase()}` },
    { level: dimensionsReady ? 'ok' : 'bad', label: 'Voertuiggegevens', detail: dimensionsReady ? 'Benodigde voertuiginformatie is ingevuld' : 'Hoogte, lengte of gewicht ontbreekt' },
    { level: plan.routing?.live ? 'ok' : 'warn', label: 'Routebron', detail: plan.routing?.live ? `${plan.routing.label}; controleer actuele beperkingen` : 'Offline corridorraming; controleer de echte wegroute en voertuigbeperkingen.' },
    { level: 'warn', label: 'Broncontrole', detail: 'Prijzen, weer, openingstijden, voorzieningen en beschikbaarheid blijven indicatief en niet-live.' }
  ];
}
