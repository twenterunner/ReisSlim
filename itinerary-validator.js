import { validCoordinate } from './config.js';

export function validatePlan(trip, destination, plan, budget) {
  const maxDrive = Math.max(0, ...plan.days.map(day => Number(day.driveHours || 0)));
  const originAsStay = plan.days.some(day => ['stay', 'flex', 'transfer'].includes(day.kind) && day.location === trip.origin);
  const invalidCoordinates = plan.days.filter(day => day.toPoint && !validCoordinate(day.toPoint)).length;
  return [
    { level: budget.total <= trip.budget ? 'ok' : budget.total <= trip.budget * 1.1 ? 'warn' : 'bad', label: 'Budget', detail: `€${budget.total.toLocaleString('nl-NL')} van €${trip.budget.toLocaleString('nl-NL')}` },
    { level: maxDrive <= trip.maxDrive + .05 ? 'ok' : 'bad', label: 'Max. rijtijd', detail: `${maxDrive.toFixed(1)} uur; limiet ${trip.maxDrive.toFixed(1)} uur` },
    { level: plan.days.length === trip.days ? 'ok' : 'bad', label: 'Aantal dagen', detail: `${plan.days.length} van ${trip.days}` },
    { level: plan.feasible ? 'ok' : 'bad', label: 'Realisme', detail: plan.feasible ? 'Reisduur en daglimiet zijn verenigbaar' : `Minimaal ${plan.minimumDays} dagen aanbevolen` },
    { level: plan.accommodationChanges <= trip.maxChanges ? 'ok' : 'warn', label: 'Accommodatiewissels', detail: `${plan.accommodationChanges} gepland; voorkeur maximaal ${trip.maxChanges}` },
    { level: originAsStay ? 'bad' : 'ok', label: 'Vertrekplaats', detail: originAsStay ? 'Vertrekplaats wordt onterecht als verblijf gebruikt' : 'Alleen vertrek- en terugkeerpunt' },
    { level: invalidCoordinates ? 'bad' : 'ok', label: 'Kaartdata', detail: invalidCoordinates ? `${invalidCoordinates} ongeldige routepunten` : 'Alle opgenomen routepunten zijn geldig' },
    { level: 'warn', label: 'Broncontrole', detail: 'Rijtijden, prijzen, weer, beschikbaarheid en officiële reisadviezen blijven indicatief en niet-live.' }
  ];
}
