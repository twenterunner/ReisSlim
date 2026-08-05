const stop = (name, lat, lon, progress) => ({ name, lat, lon, progress });
const base = (name, lat, lon) => ({ name, lat, lon });
const activity = (type, title, rainAlternative, tags = []) => ({ type, title, rainAlternative, tags });

function syntheticRegion({
  id, index, lat, lon, distanceKm, driveHours, nightMid = 118, activityDaily = 38,
  toll = 12, tags = ['natuur', 'wandelen', 'kinderen', 'motor', 'budget'],
  family = 8, motorcycle = 8, camper = 8, weather = 7, crowds = 8
}) {
  const label = String(index).padStart(2, '0');
  return {
    id,
    name: `Synthetic touring region ${label}`,
    country: `Fictional territory ${label}`,
    distanceKm,
    driveHours,
    nightMid,
    activityDaily,
    toll,
    tags,
    season: [3, 4, 5, 6, 7, 8, 9, 10],
    family,
    motorcycle,
    camper,
    weather,
    crowds,
    summary: `Neutral deterministic fixture ${label} for route, ranking and portfolio tests.`,
    pros: ['Deterministic coordinates', 'Distinct route identity', 'Test-only evidence'],
    cons: ['Fictional fixture', 'Not suitable for production recommendations'],
    routeStops: [
      stop(`Transit ${label}A`, lat + 1.2, lon - 1.2, .24),
      stop(`Transit ${label}B`, lat + .7, lon - .7, .48),
      stop(`Transit ${label}C`, lat + .3, lon - .3, .74)
    ],
    bases: [
      base(`Base ${label}A`, lat, lon),
      base(`Base ${label}B`, lat + .22, lon + .31),
      base(`Base ${label}C`, lat - .18, lon + .58)
    ],
    activities: [
      activity('natuur', `Explore synthetic landscape ${label}A.`, `Use sheltered fixture activity ${label}A.`, ['natuur', 'wandelen']),
      activity('cultuur', `Visit synthetic cultural anchor ${label}B.`, `Use indoor fixture activity ${label}B.`, ['cultuur', 'kinderen']),
      activity('motor', `Ride synthetic touring corridor ${label}C.`, `Use lower synthetic route ${label}C.`, ['motor', 'natuur'])
    ],
    fixture: true
  };
}

export const syntheticDestinations = [
  syntheticRegion({ id: 'synthetic-primary', index: 1, lat: 48.13, lon: 8.23, distanceKm: 620, driveHours: 6.5, nightMid: 125, activityDaily: 42 }),
  syntheticRegion({ id: 'synthetic-nearby', index: 2, lat: 50.4, lon: 7.1, distanceKm: 350, driveHours: 3.8, nightMid: 108, activityDaily: 32 }),
  syntheticRegion({ id: 'synthetic-river', index: 3, lat: 50.1, lon: 9.4, distanceKm: 410, driveHours: 4.4, tags: ['natuur', 'eten', 'cultuur', 'motor', 'budget'] }),
  syntheticRegion({ id: 'synthetic-coast', index: 4, lat: 53.4, lon: 8.1, distanceKm: 300, driveHours: 3.3, tags: ['kust', 'natuur', 'kinderen', 'cultuur', 'budget'], camper: 9 }),
  syntheticRegion({ id: 'synthetic-highlands', index: 5, lat: 49.2, lon: 11.8, distanceKm: 610, driveHours: 6.6, tags: ['bergen', 'natuur', 'wandelen', 'motor', 'kinderen'], motorcycle: 9 }),
  syntheticRegion({ id: 'synthetic-lakes', index: 6, lat: 51.5, lon: 12.7, distanceKm: 540, driveHours: 5.9, tags: ['zwemmen', 'natuur', 'kinderen', 'wandelen', 'budget'] }),
  syntheticRegion({ id: 'synthetic-heritage', index: 7, lat: 48.7, lon: 5.5, distanceKm: 560, driveHours: 6.1, tags: ['cultuur', 'eten', 'kinderen', 'natuur', 'budget'] }),
  syntheticRegion({ id: 'synthetic-forest', index: 8, lat: 51.2, lon: 14.5, distanceKm: 690, driveHours: 7.2, tags: ['natuur', 'wandelen', 'motor', 'kinderen', 'budget'] }),
  syntheticRegion({ id: 'synthetic-plateau', index: 9, lat: 47.3, lon: 6.2, distanceKm: 710, driveHours: 7.5, tags: ['bergen', 'natuur', 'motor', 'wandelen', 'budget'], motorcycle: 9 }),
  syntheticRegion({ id: 'synthetic-valley', index: 10, lat: 49.4, lon: 3.1, distanceKm: 640, driveHours: 6.8, tags: ['cultuur', 'eten', 'natuur', 'kinderen', 'budget'] }),
  syntheticRegion({ id: 'synthetic-expensive', index: 11, lat: 45.8, lon: 12.3, distanceKm: 1040, driveHours: 10.8, nightMid: 230, activityDaily: 85, toll: 180 }),
  {
    ...syntheticRegion({
      id: 'synthetic-remote-fly-drive', index: 12, lat: -22.56, lon: 17.08,
      distanceKm: 8600, driveHours: 11.5, nightMid: 155, activityDaily: 72, toll: 20,
      tags: ['natuur', 'avontuur', 'wildlife', 'budget'], family: 7, motorcycle: 5, camper: 8,
      weather: 8, crowds: 9
    }),
    name: 'Remote Expanse fly-drive fixture',
    country: 'Fictional remote territory',
    summary: 'Neutral long-haul fixture for multimodal access, remote readiness and requested-destination mismatch tests.',
    routeStops: [
      stop('Remote transit A', -24.49, 15.8, .27),
      stop('Remote transit B', -22.68, 14.53, .53),
      stop('Remote transit C', -20.5, 14.3, .72),
      stop('Remote transit D', -19.33, 15.93, .9)
    ],
    bases: [
      base('Remote Gateway', -22.56, 17.08),
      base('Remote Desert Base', -24.49, 15.8),
      base('Remote Coast Base', -22.68, 14.53),
      base('Remote Nature Base', -19.33, 15.93)
    ],
    accessModes: ['fly-drive', 'fly-camper'],
    remoteReadinessRequired: true
  }
];

export const primarySyntheticDestination = syntheticDestinations.find(item => item.id === 'synthetic-primary');
export const placeSyntheticDestination = primarySyntheticDestination;
export const remoteFlyDriveDestination = syntheticDestinations.find(item => item.id === 'synthetic-remote-fly-drive');
