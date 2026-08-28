export const VERSION = '1.7.46';
export const BUILD = '1746';
export const ENGINE_VERSION = 39;
export const STORAGE_SCHEMA_VERSION = 7;

export const preferenceDefinitions = [
  ['natuur', 'Natuur'], ['bergen', 'Bergen'], ['zwemmen', 'Zwemmen'],
  ['wandelen', 'Wandelen'], ['kinderen', 'Kindvriendelijk'],
  ['motor', 'Mooie wegen'], ['cultuur', 'Cultuur'], ['eten', 'Eten'],
  ['kust', 'Kust'], ['budget', 'Budget']
];

export const transportProfiles = {
  car: { label: 'Auto', routeMode: 'car', consumption: 7.2, roadTimeFactor: 1, breakEveryHours: 2.25, breakMinutes: 15, fuelStopMinutes: 12, defaultFuelRangeKm: 650, arrivalBufferMinutes: 10, parkingDaily: 12, tollFactor: 1, accommodationFactor: 1, supportsDimensions: false, accommodationLabel: 'hotel of appartement met passende parking' },
  motorcycle: { label: 'Motor', routeMode: 'motorcycle', consumption: 4.8, roadTimeFactor: 1.05, breakEveryHours: 1.5, breakMinutes: 20, fuelStopMinutes: 12, defaultFuelRangeKm: 260, arrivalBufferMinutes: 15, parkingDaily: 6, tollFactor: .65, accommodationFactor: .92, supportsDimensions: false, weatherReserveMinutesPerHour: 5, accommodationLabel: 'motorvriendelijk verblijf met veilige, liefst overdekte parking' },
  motorhome: { label: 'Camper / motorhome', routeMode: 'truck', consumption: 11.5, roadTimeFactor: 1.12, breakEveryHours: 2, breakMinutes: 20, fuelStopMinutes: 18, defaultFuelRangeKm: 520, arrivalBufferMinutes: 35, parkingDaily: 18, tollFactor: 1.3, accommodationFactor: .34, supportsDimensions: true, defaultHeightM: 3.1, defaultLengthM: 7.2, defaultWeightKg: 3500, defaultMaxSpeedKmh: 100, accommodationLabel: 'camperplaats of camping met stroom, water en servicevoorzieningen' },
  caravan: { label: 'Auto met caravan', routeMode: 'truck', consumption: 12.5, roadTimeFactor: 1.18, breakEveryHours: 1.75, breakMinutes: 20, fuelStopMinutes: 20, defaultFuelRangeKm: 460, arrivalBufferMinutes: 45, parkingDaily: 16, tollFactor: 1.4, accommodationFactor: .3, supportsDimensions: true, defaultHeightM: 2.7, defaultLengthM: 11.5, defaultWeightKg: 3200, defaultMaxSpeedKmh: 90, accommodationLabel: 'caravancamping met ruime standplaats en eenvoudige manoeuvreertoegang' }
};

export const routeStyles = {
  balanced: { label: 'Gebalanceerd', description: 'Een praktische route met ruimte voor prettige stops.' },
  fastest: { label: 'Snelste', description: 'Minimaliseer reistijd en omwegen.' },
  scenic: { label: 'Toeristisch', description: 'Geef mooie wegen en uitzichtpunten extra gewicht.' }
};

export const routingConfig = { apiUrl: '', requestTimeoutMs: 7000, providerLabel: 'TomTom via ReisSlim gateway' };
export const budgetAssumptions = { fuelPricePerLitre: 1.95, childEquivalent: 0.6, peoplePerRoom: 4, groceriesPerEquivalentDay: 14, restaurantPerEquivalentDay: 27, restaurantShare: { budget: 0.25, mid: 0.45, comfort: 0.65 }, comfortFactor: { budget: 0.78, mid: 1, comfort: 1.28 }, contingencyRate: 0.08, minimumContingency: 100 };
export const originCatalog = {
  saasveld: { name: 'Saasveld', lat: 52.33, lon: 6.81 }, amsterdam: { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 }, rotterdam: { name: 'Rotterdam', lat: 51.9244, lon: 4.4777 }, utrecht: { name: 'Utrecht', lat: 52.0907, lon: 5.1214 }, eindhoven: { name: 'Eindhoven', lat: 51.4416, lon: 5.4697 }, groningen: { name: 'Groningen', lat: 53.2194, lon: 6.5665 }, maastricht: { name: 'Maastricht', lat: 50.8514, lon: 5.6910 }, zwolle: { name: 'Zwolle', lat: 52.5168, lon: 6.0830 }, enschede: { name: 'Enschede', lat: 52.2215, lon: 6.8937 }, hengelo: { name: 'Hengelo', lat: 52.2574, lon: 6.7928 }, almelo: { name: 'Almelo', lat: 52.3566, lon: 6.6625 }, arnhem: { name: 'Arnhem', lat: 51.9851, lon: 5.8987 }, nijmegen: { name: 'Nijmegen', lat: 51.8426, lon: 5.8546 }
};
export const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export const roundScore = value => Math.round(clamp(value) / 5) * 5;
export const roundMoney = value => Math.round(Number(value) || 0);
export const validCoordinate = point => Boolean(point) && Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
