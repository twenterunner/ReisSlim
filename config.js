export const VERSION = '0.6.0';
export const BUILD = '601';
export const ENGINE_VERSION = 3;
export const STORAGE_SCHEMA_VERSION = 3;

export const preferenceDefinitions = [
  ['natuur', 'Natuur'], ['bergen', 'Bergen'], ['zwemmen', 'Zwemmen'],
  ['wandelen', 'Wandelen'], ['kinderen', 'Kindvriendelijk'],
  ['motor', 'Mooie wegen'], ['cultuur', 'Cultuur'], ['eten', 'Eten'],
  ['kust', 'Kust'], ['budget', 'Budget']
];

export const transportProfiles = {
  car: { label: 'Auto', consumption: 7.2, timeFactor: 1, parkingDaily: 12 },
  motorcycle: { label: 'Motor', consumption: 4.8, timeFactor: 1.08, parkingDaily: 6 },
  camper: { label: 'Camper', consumption: 10.5, timeFactor: 1.12, parkingDaily: 18 }
};

export const budgetAssumptions = {
  fuelPricePerLitre: 1.95,
  childEquivalent: 0.6,
  peoplePerRoom: 4,
  groceriesPerEquivalentDay: 14,
  restaurantPerEquivalentDay: 27,
  restaurantShare: { budget: 0.25, mid: 0.45, comfort: 0.65 },
  comfortFactor: { budget: 0.78, mid: 1, comfort: 1.28 },
  contingencyRate: 0.08,
  minimumContingency: 100
};

export const originCatalog = {
  saasveld: { name: 'Saasveld', lat: 52.33, lon: 6.81 },
  amsterdam: { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  rotterdam: { name: 'Rotterdam', lat: 51.9244, lon: 4.4777 },
  utrecht: { name: 'Utrecht', lat: 52.0907, lon: 5.1214 },
  eindhoven: { name: 'Eindhoven', lat: 51.4416, lon: 5.4697 },
  groningen: { name: 'Groningen', lat: 53.2194, lon: 6.5665 },
  maastricht: { name: 'Maastricht', lat: 50.8514, lon: 5.6910 },
  zwolle: { name: 'Zwolle', lat: 52.5168, lon: 6.0830 },
  enschede: { name: 'Enschede', lat: 52.2215, lon: 6.8937 },
  hengelo: { name: 'Hengelo', lat: 52.2574, lon: 6.7928 },
  almelo: { name: 'Almelo', lat: 52.3566, lon: 6.6625 },
  arnhem: { name: 'Arnhem', lat: 51.9851, lon: 5.8987 },
  nijmegen: { name: 'Nijmegen', lat: 51.8426, lon: 5.8546 }
};

export const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export const roundScore = value => Math.round(clamp(value) / 5) * 5;
export const roundMoney = value => Math.round(Number(value) || 0);
export const validCoordinate = point => Boolean(point)
  && Number.isFinite(point.lat) && Number.isFinite(point.lon)
  && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
