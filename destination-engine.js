export function rankDestinations(trip, destinations) {
  const month = new Date(trip.startDate + 'T12:00:00').getMonth() + 1;
  return destinations.map(d => {
    let score = 45;
    const matches = trip.preferences.filter(p => d.tags.includes(p));
    score += matches.length * 7;
    score += d.season.includes(month) ? 8 : -12;
    const modeScore = trip.transport === 'motorcycle' ? d.motorcycle : trip.transport === 'camper' ? d.camper : d.family;
    score += (modeScore - 5) * 2;
    if (d.driveHours > trip.maxDrive * 2.5) score -= 7;
    const estimate = estimateTotal(trip,d);
    const budgetRatio = estimate / trip.budget;
    score += budgetRatio <= .9 ? 10 : budgetRatio <= 1.05 ? 4 : budgetRatio <= 1.2 ? -8 : -18;
    score = Math.max(20, Math.min(98, Math.round(score)));
    return {...d,score,estimate,matches,budgetRatio};
  }).sort((a,b)=>b.score-a.score);
}

export function estimateTotal(trip,d) {
  const nights = trip.days - 1;
  const roomFactor = Math.max(1, Math.ceil((trip.adults + trip.children)/4));
  const comfortFactor = trip.comfort === 'budget' ? .78 : trip.comfort === 'comfort' ? 1.28 : 1;
  const accommodation = nights * d.nightMid * roomFactor * comfortFactor;
  const food = trip.days * d.foodDaily * ((trip.adults + trip.children*.6)/3.2);
  const activities = trip.days * d.activityDaily * ((trip.adults + trip.children*.55)/3.2);
  const fuelPrice = 1.95;
  const consumption = trip.transport === 'motorcycle' ? 4.8 : trip.transport === 'camper' ? 10.5 : 7.2;
  const routeKm = d.distanceKm*2 + trip.days*85;
  const fuel = routeKm/100*consumption*fuelPrice;
  return Math.round(accommodation+food+activities+fuel+d.toll+200);
}
