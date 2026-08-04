import { countAccommodationChanges } from './itinerary-engine.js';
import { buildRecommendations } from './recommendation-engine.js';

const clone = value => JSON.parse(JSON.stringify(value));

export const createUndoSnapshot = plan => clone(plan);
export const restorePlan = snapshot => clone(snapshot);

export function optimisePlan(trip, destination, plan) {
  const next = clone(plan);
  const changes = [];
  const stayDays = next.days.filter(day => ['stay', 'flex', 'transfer'].includes(day.kind));

  for (const day of stayDays) {
    if (!day.rainAlternative) {
      day.rainAlternative = 'Kies een museum, wellnesslocatie of andere overdekte activiteit in dezelfde regio.';
      changes.push(`Regenalternatief toegevoegd op dag ${day.day}.`);
    }
  }

  if (!next.days.some(day => day.kind === 'flex') && stayDays.length >= 3) {
    const eligibleDays = stayDays.filter(day => day.kind === 'stay');
    const day = eligibleDays[Math.floor(eligibleDays.length / 2)];
    if (day) {
    day.kind = 'flex';
    day.typeLabel = 'Flexibele rustdag';
    day.activityType = 'rust';
    day.distanceKm = Math.min(15, day.distanceKm || 15);
    day.driveHours = Math.min(.3, day.driveHours || .3);
    day.roadHours = day.driveHours;
    day.elapsedHours = day.driveHours;
    day.breakHours = 0;
    day.waypoints = [];
    day.primaryPlan = 'Houd deze dag bewust vrij: rust, boodschappen en maximaal één korte lokale activiteit.';
    day.rainAlternative = 'Gebruik de dag als volledige hersteldag of kies een rustige binnenactiviteit dichtbij.';
    changes.push(`Dag ${day.day} is een flexibele rustdag geworden.`);
    }
  }

  const transfers = next.days.filter(day => day.kind === 'transfer');
  if (transfers.length && next.accommodationChanges > trip.maxChanges) {
    for (const day of transfers) {
      const previous = next.days[day.day - 2];
      if (!previous?.toPoint) continue;
      Object.assign(day, {
        kind: 'stay', typeLabel: 'Verblijfsdag', from: previous.location, to: previous.location,
        location: previous.location, overnight: previous.location,
        fromPoint: clone(previous.toPoint), toPoint: clone(previous.toPoint),
        distanceKm: 20, driveHours: .4, roadHours: .4, elapsedHours: .4, breakHours: 0,
        restStops: 0, fuelStops: 0, stopCount: 0,
        waypoints: [], geometry: [clone(previous.toPoint)], routeSource: 'local-estimate',
        primaryPlan: `Blijf in ${previous.location} en maak alleen een korte lokale uitstap.`,
        rainAlternative: 'Kies een overdekte activiteit dicht bij de bestaande accommodatie.'
      });
      changes.push(`De accommodatiewissel op dag ${day.day} is verwijderd.`);
    }
  }

  const activities = destination.activities || [];
  next.days.filter(day => day.kind === 'stay').forEach((day, index) => {
    const activity = activities[index % Math.max(1, activities.length)];
    if (activity && day.activityType !== activity.type) {
      day.activityType = activity.type;
      day.primaryPlan = activity.title;
      day.rainAlternative = activity.rainAlternative;
    }
  });
  if (activities.length > 1) changes.push('De activiteiten zijn opnieuw verdeeld voor meer variatie.');

  next.accommodationChanges = countAccommodationChanges(next.days, trip.origin);
  next.recommendations = buildRecommendations(trip, destination, next.days);
  next.optimized = true;
  next.optimizationChanges = [...new Set(changes)];
  return { plan: next, changes: next.optimizationChanges };
}

export function constraintsPreserved(before, after, trip) {
  return before.days.length === after.days.length
    && before.days[0].from === after.days[0].from
    && after.days.at(-1).to === trip.origin
    && after.days.every(day => day.driveHours >= 0);
}
