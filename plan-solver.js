import { transportId } from './vehicle-intelligence.js';

const departureByVehicle = { car: 8.5, motorcycle: 8.5, motorhome: 8, caravan: 7.75 };

function clock(decimalHour) {
  const normalized = Math.max(0, Math.min(23.98, decimalHour));
  const hours = Math.floor(normalized);
  const minutes = Math.round((normalized - hours) * 60 / 5) * 5;
  const adjustedHours = minutes === 60 ? hours + 1 : hours;
  return `${String(adjustedHours).padStart(2, '0')}:${String(minutes === 60 ? 0 : minutes).padStart(2, '0')}`;
}

export function solveDayAllocation(trip, requiredLegs, preferredLegs = requiredLegs) {
  const availableEachWay = Math.max(1, Math.floor((trip.days - 1) / 2));
  const usedLegs = Math.min(Math.max(1, preferredLegs), availableEachWay);
  return {
    availableEachWay,
    usedLegs,
    stayDays: trip.days - usedLegs * 2,
    routeFeasible: requiredLegs <= availableEachWay
  };
}

export function applyDaySchedules(trip, days) {
  const vehicle = transportId(trip.transport);
  for (const day of days) {
    const travel = ['outward', 'return', 'transfer'].includes(day.kind);
    if (travel) {
      const departure = departureByVehicle[vehicle] || 8.5;
      const arrival = departure + Number(day.elapsedHours || day.driveHours || 0);
      day.schedule = {
        departure: clock(departure),
        arrival: clock(arrival),
        checkIn: day.kind === 'return' && day.to === trip.origin ? null : clock(Math.max(arrival, 15)),
        activityWindow: arrival <= 16 ? `${clock(arrival + 1)}–${clock(Math.min(19, arrival + 2.5))}` : null
      };
    } else {
      day.schedule = {
        departure: null,
        arrival: null,
        checkIn: null,
        activityWindow: day.kind === 'flex' ? 'Vrij in te vullen' : '10:00–16:30'
      };
    }
  }
  return days;
}
