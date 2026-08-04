export const STRETCH_LIMITS = Object.freeze({
  budgetRatio: 0.10,
  maxDriveHours: 0.5,
  accommodationChanges: 1,
  visibleProposals: 2
});

export function minimumAccommodationChanges(travelLegs) {
  return Math.max(0, (Math.max(1, Number(travelLegs) || 1) - 1) * 2);
}

function violation(key, label, actual, limit, detail, adjustment, stretchable = false, severity = 1) {
  return { key, label, actual, limit, detail, adjustment, stretchable, severity };
}

function budgetViolation(trip, total) {
  const excess = Math.max(0, total - trip.budget);
  if (!excess) return null;
  const stretchable = excess <= Math.max(50, trip.budget * STRETCH_LIMITS.budgetRatio);
  return violation(
    'budget', 'Budget', total, trip.budget,
    `De raming is €${Math.round(excess).toLocaleString('nl-NL')} hoger dan je budget.`,
    `Verhoog het budget tot minimaal €${Math.ceil(total / 50) * 50} of kies een voordeliger bestemming.`,
    stretchable,
    excess / Math.max(1, trip.budget)
  );
}

export function evaluateDestinationConstraints(trip, { route, relaxedRoute = null, budget }) {
  const normalMinimumDays = route.requiredLegs * 2 + 1;
  const relaxedMinimumDays = relaxedRoute ? relaxedRoute.requiredLegs * 2 + 1 : normalMinimumDays;
  const canStretchDriving = normalMinimumDays > trip.days && relaxedMinimumDays <= trip.days;
  const travelLegs = canStretchDriving ? relaxedRoute.requiredLegs : route.requiredLegs;
  const minimumDays = travelLegs * 2 + 1;
  const minimumChanges = minimumAccommodationChanges(travelLegs);
  const violations = [];

  if (normalMinimumDays > trip.days) {
    violations.push(canStretchDriving
      ? violation(
        'maxDrive', 'Maximale reistijd', trip.maxDrive + STRETCH_LIMITS.maxDriveHours, trip.maxDrive,
        `Deze optie vraagt op de langste reisdagen maximaal ${STRETCH_LIMITS.maxDriveHours.toLocaleString('nl-NL')} uur extra.`,
        `Verhoog de daglimiet naar ${Number(trip.maxDrive + STRETCH_LIMITS.maxDriveHours).toFixed(1)} uur of voeg reisdagen toe.`,
        true,
        STRETCH_LIMITS.maxDriveHours / Math.max(1, trip.maxDrive)
      )
      : violation(
        'days', 'Reisduur', normalMinimumDays, trip.days,
        `Minimaal ${normalMinimumDays} dagen zijn nodig binnen je dagelijkse reistijdlimiet.`,
        `Verleng de reis naar minimaal ${normalMinimumDays} dagen of kies een dichterbij gelegen bestemming.`,
        false,
        (normalMinimumDays - trip.days) / Math.max(1, trip.days)
      ));
  }

  const budgetIssue = budgetViolation(trip, budget.total);
  if (budgetIssue) violations.push(budgetIssue);

  if (minimumChanges > trip.maxChanges) {
    const excess = minimumChanges - trip.maxChanges;
    violations.push(violation(
      'maxChanges', 'Accommodatiewissels', minimumChanges, trip.maxChanges,
      `De noodzakelijke heen- en terugreis vragen minimaal ${minimumChanges} accommodatiewissels.`,
      `Sta minimaal ${minimumChanges} wissels toe of kies een dichterbij gelegen bestemming.`,
      excess <= STRETCH_LIMITS.accommodationChanges,
      excess / Math.max(1, trip.maxChanges)
    ));
  }

  const exact = violations.length === 0;
  const stretch = !exact && trip.allowStretch !== false && violations.length === 1 && violations[0].stretchable;
  const category = exact ? 'exact' : stretch ? 'stretch' : 'rejected';
  return {
    category,
    exact,
    stretch,
    selectable: exact || stretch,
    violations,
    travelLegs,
    normalTravelLegs: route.requiredLegs,
    minimumDays,
    normalMinimumDays,
    minimumChanges,
    stretchPenalty: violations.reduce((sum, item) => sum + item.severity, 0),
    summary: exact
      ? 'Past binnen budget, reisduur, dagelijkse reistijd en accommodatiewissels.'
      : violations.map(item => item.detail).join(' ')
  };
}

export function evaluatePlanConstraints(trip, plan, budget, { allowStretch = false } = {}) {
  const violations = [];
  const maxElapsed = Math.max(0, ...(plan?.days || []).map(day => Number(day.elapsedHours ?? day.driveHours ?? 0)));
  const first = plan?.days?.[0];
  const last = plan?.days?.at(-1);

  if ((plan?.days?.length || 0) !== trip.days) {
    violations.push(violation('days', 'Aantal dagen', plan?.days?.length || 0, trip.days, `Het plan bevat ${plan?.days?.length || 0} in plaats van ${trip.days} dagen.`, 'Bouw het plan opnieuw op met het ingestelde aantal dagen.'));
  }
  if (first?.from !== trip.origin || last?.to !== trip.origin) {
    violations.push(violation('roundTrip', 'Vertrek en terugkeer', `${first?.from || '?'} / ${last?.to || '?'}`, trip.origin, 'De rondreis start of eindigt niet op de ingestelde vertrekplaats.', 'Bouw de route opnieuw op vanaf de vertrekplaats.'));
  }
  if (maxElapsed > trip.maxDrive + 0.05) {
    const excess = maxElapsed - trip.maxDrive;
    violations.push(violation(
      'maxDrive', 'Maximale reistijd', maxElapsed, trip.maxDrive,
      `De langste reisdag duurt ${maxElapsed.toFixed(1)} uur; je limiet is ${trip.maxDrive.toFixed(1)} uur.`,
      `Verhoog de limiet naar ${Math.ceil(maxElapsed * 2) / 2} uur, voeg reisdagen toe of kies een dichterbij gelegen bestemming.`,
      excess <= STRETCH_LIMITS.maxDriveHours + 0.05,
      excess / Math.max(1, trip.maxDrive)
    ));
  }
  const budgetIssue = budgetViolation(trip, budget?.total || 0);
  if (budgetIssue) violations.push(budgetIssue);
  if ((plan?.accommodationChanges || 0) > trip.maxChanges) {
    const excess = plan.accommodationChanges - trip.maxChanges;
    violations.push(violation(
      'maxChanges', 'Accommodatiewissels', plan.accommodationChanges, trip.maxChanges,
      `Het plan heeft ${plan.accommodationChanges} wissels; je maximum is ${trip.maxChanges}.`,
      `Sta ${plan.accommodationChanges} wissels toe of gebruik minder overnachtingsplaatsen.`,
      excess <= STRETCH_LIMITS.accommodationChanges,
      excess / Math.max(1, trip.maxChanges)
    ));
  }

  const exact = violations.length === 0;
  const stretch = !exact && allowStretch && violations.length === 1 && violations[0].stretchable;
  return {
    category: exact ? 'exact' : stretch ? 'stretch' : 'rejected',
    exact,
    stretch,
    feasible: exact,
    selectable: exact || stretch,
    violations,
    maxElapsed,
    summary: exact ? 'Alle harde reisvoorwaarden worden gerespecteerd.' : violations.map(item => item.detail).join(' ')
  };
}

export function closestAdjustments(rejected, maximum = 3) {
  return [...rejected]
    .sort((a, b) => a.constraintStatus.violations.length - b.constraintStatus.violations.length
      || a.constraintStatus.stretchPenalty - b.constraintStatus.stretchPenalty
      || b.score - a.score)
    .slice(0, maximum)
    .map(item => ({
      destinationId: item.id,
      destination: item.name,
      adjustments: item.constraintStatus.violations.map(issue => issue.adjustment)
    }));
}
