const icons = Object.freeze({ clear: '☀', partly: '◐', cloud: '☁', fog: '≋', rain: '☂', snow: '❄', storm: 'ϟ' });

export function weatherCondition(code) {
  if (code === 0) return { id: 'clear', label: 'Helder', icon: icons.clear };
  if ([1, 2].includes(code)) return { id: 'partly', label: 'Half bewolkt', icon: icons.partly };
  if (code === 3) return { id: 'cloud', label: 'Bewolkt', icon: icons.cloud };
  if ([45, 48].includes(code)) return { id: 'fog', label: 'Mist', icon: icons.fog };
  if (code >= 71 && code <= 77) return { id: 'snow', label: 'Sneeuw', icon: icons.snow };
  if (code >= 95) return { id: 'storm', label: 'Onweer', icon: icons.storm };
  if (code >= 51) return { id: 'rain', label: 'Neerslag', icon: icons.rain };
  return { id: 'cloud', label: 'Onbekend', icon: icons.cloud };
}

export function weatherSuitability(day, trip) {
  const condition = weatherCondition(Number(day.weatherCode));
  let score = 100 - Math.max(0, Number(day.precipitationChance || 0) - 25) * .7 - Math.max(0, Number(day.windKmh || 0) - 25) * 1.2;
  if (trip.transport === 'motorcycle') score -= Math.max(0, Number(day.windKmh || 0) - 18) * 1.5;
  if (['snow', 'storm'].includes(condition.id)) score -= 35;
  return { ...condition, score: Math.max(0, Math.round(score)), suitable: score >= 60 };
}

export function weatherWindowScore(weather, trip) {
  const days = weather?.days || [];
  if (!days.length) return null;
  const scores = days.map(day => weatherSuitability(day, trip).score);
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const worst = Math.min(...scores);
  // The proposal weather score reflects the whole holiday, while still making
  // one genuinely bad day matter. This avoids one sunny day masking a storm.
  const score = Math.round(average * .78 + worst * .22);
  return { score: Math.max(0, Math.min(100, score)), average: Math.round(average), worst };
}

export function adaptPlanToWeather(plan, trip) {
  if (!plan?.weather?.days?.length || !Array.isArray(plan.days)) return plan;
  const byDate = new Map(plan.weather.days.map(day => [day.date, day]));
  for (const day of plan.days) {
    const forecast = byDate.get(day.date);
    if (!forecast) continue;
    const suitability = weatherSuitability(forecast, trip);
    day.weather = { ...forecast, ...suitability };
    day.weatherAdjusted = false;
    day.weatherAdvice = `${suitability.icon} ${suitability.label} · ${Math.round(forecast.minimumC)}–${Math.round(forecast.maximumC)}°C · geschiktheid ${suitability.score}/100`;

    if (suitability.score < 60 && day.rainAlternative && !day.weatherOriginalPrimaryPlan) {
      day.weatherOriginalPrimaryPlan = day.primaryPlan;
      day.primaryPlan = `Weer aangepast: ${day.rainAlternative}`;
      day.rainAlternative = `Als het weer verbetert: ${day.weatherOriginalPrimaryPlan}`;
      day.weatherAdjusted = true;
    } else if (suitability.score < 75 && !String(day.primaryPlan || '').startsWith('Weeradvies:')) {
      day.primaryPlan = `Weeradvies: houd het programma flexibel. ${day.primaryPlan}`;
    }
  }
  return plan;
}
