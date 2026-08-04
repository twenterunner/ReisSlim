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
