const stop = (name, lat, lon, progress) => ({ name, lat, lon, progress });
const base = (name, lat, lon) => ({ name, lat, lon });
const activity = (type, title, rainAlternative, tags = []) => ({ type, title, rainAlternative, tags });

export const destinations = [
  {
    id: 'slovenia', name: 'Slovenië & Julische Alpen', country: 'Slovenië',
    distanceKm: 1180, driveHours: 12.5, nightMid: 145, activityDaily: 55, toll: 130,
    tags: ['natuur', 'bergen', 'zwemmen', 'wandelen', 'kinderen', 'motor'],
    season: [4, 5, 6, 7, 8, 9], family: 9, motorcycle: 9, camper: 8, weather: 8, crowds: 6,
    summary: 'Compact, groen en veelzijdig met meren, bergen en overzichtelijke afstanden.',
    pros: ['Sterke mix van natuur en activiteiten', 'Goede prijs-kwaliteit', 'Veel afwisseling op korte afstand'],
    cons: ['Lange aanreis vanuit Nederland', 'Bled kan druk zijn in het hoogseizoen'],
    routeStops: [stop('Münster', 51.96, 7.63, .13), stop('Kassel', 51.31, 9.49, .28), stop('Würzburg', 49.79, 9.95, .43), stop('München', 48.14, 11.58, .62), stop('Salzburg', 47.81, 13.04, .78), stop('Villach', 46.61, 13.85, .91)],
    bases: [base('Bled', 46.37, 14.11), base('Bohinj', 46.28, 13.89), base('Kranjska Gora', 46.49, 13.79)],
    activities: [activity('natuur', 'Wandel langs het meer en kies een rustig uitzichtpunt.', 'Bezoek een lokaal museum of een overdekt zwembad.', ['natuur', 'wandelen']), activity('zwemmen', 'Plan een ontspannen zwem- en picknickdag.', 'Kies wellness of een gezinsvriendelijke binnenactiviteit.', ['zwemmen', 'kinderen']), activity('bergen', 'Maak een bergdag met een korte en een langere routeoptie.', 'Plan een panoramische autorit met beschutte tussenstops.', ['bergen', 'motor'])]
  },
  {
    id: 'blackforest', name: 'Zwarte Woud & Elzas', country: 'Duitsland / Frankrijk',
    distanceKm: 620, driveHours: 6.5, nightMid: 135, activityDaily: 45, toll: 35,
    tags: ['natuur', 'zwemmen', 'wandelen', 'kinderen', 'motor', 'cultuur'],
    season: [3, 4, 5, 6, 7, 8, 9, 10], family: 9, motorcycle: 8, camper: 9, weather: 7, crowds: 7,
    summary: 'Dichtbij, flexibel en geschikt voor gezinnen of een eerste roadtrip.',
    pros: ['Korte aanreis', 'Veel regenalternatieven', 'Makkelijk te combineren met de Elzas'],
    cons: ['Minder exotisch', 'Sommige toeristische plaatsen kunnen druk zijn'],
    routeStops: [stop('Arnhem', 51.98, 5.91, .12), stop('Keulen', 50.94, 6.96, .32), stop('Koblenz', 50.36, 7.59, .5), stop('Heidelberg', 49.40, 8.67, .73), stop('Freiburg', 47.99, 7.85, .9)],
    bases: [base('Triberg', 48.13, 8.23), base('Freiburg', 47.99, 7.85), base('Colmar', 48.08, 7.36)],
    activities: [activity('natuur', 'Kies een boswandeling met waterval en korte lus.', 'Bezoek een klokkenmuseum of wellnessbad.', ['natuur', 'wandelen']), activity('cultuur', 'Combineer een historisch centrum met een lokale markt.', 'Bezoek een museum en een overdekte markthal.', ['cultuur', 'eten']), activity('zwemmen', 'Plan een meer of gezinsbad met rustige middag.', 'Kies een overdekt subtropisch zwembad.', ['zwemmen', 'kinderen'])]
  },
  {
    id: 'austria', name: 'Tirol & Salzburgerland', country: 'Oostenrijk',
    distanceKm: 930, driveHours: 9.5, nightMid: 165, activityDaily: 65, toll: 120,
    tags: ['bergen', 'natuur', 'wandelen', 'zwemmen', 'kinderen', 'motor'],
    season: [4, 5, 6, 7, 8, 9], family: 9, motorcycle: 9, camper: 8, weather: 8, crowds: 6,
    summary: 'Sterke infrastructuur, indrukwekkende bergen en veel gezinsactiviteiten.',
    pros: ['Goede toeristische infrastructuur', 'Veel kabelbanen en zwembaden', 'Sterke motorregio'],
    cons: ['Relatief duur', 'Tol en vignetten verhogen de kosten'],
    routeStops: [stop('Münster', 51.96, 7.63, .15), stop('Kassel', 51.31, 9.49, .31), stop('Würzburg', 49.79, 9.95, .5), stop('Ulm', 48.40, 9.99, .68), stop('Füssen', 47.57, 10.70, .86)],
    bases: [base('Innsbruck', 47.27, 11.39), base('Zell am See', 47.32, 12.80), base('Salzburg', 47.81, 13.04)],
    activities: [activity('bergen', 'Kies een kabelbaan en een haalbare bergwandeling.', 'Bezoek een mijn, museum of zwemcomplex.', ['bergen', 'wandelen']), activity('zwemmen', 'Plan een meer met een rustige oeverzone.', 'Kies een binnenbad of wellnesslocatie.', ['zwemmen', 'kinderen']), activity('motor', 'Rijd een korte panoramische lus met vaste pauzes.', 'Kies een dalroute en overdekte bezienswaardigheid.', ['motor', 'natuur'])]
  },
  {
    id: 'dolomites', name: 'Dolomieten & Gardameer', country: 'Italië',
    distanceKm: 1110, driveHours: 11.5, nightMid: 175, activityDaily: 60, toll: 165,
    tags: ['bergen', 'zwemmen', 'wandelen', 'eten', 'motor', 'kinderen'],
    season: [5, 6, 7, 8, 9], family: 8, motorcycle: 10, camper: 7, weather: 8, crowds: 5,
    summary: 'Spectaculaire bergwegen gecombineerd met meren en Italiaans eten.',
    pros: ['Uitzonderlijk landschap', 'Uitstekend voor motorrijders', 'Sterke combinatie van bergen en water'],
    cons: ['Duurder in het hoogseizoen', 'Drukte rond het Gardameer'],
    routeStops: [stop('Münster', 51.96, 7.63, .12), stop('Kassel', 51.31, 9.49, .27), stop('Würzburg', 49.79, 9.95, .42), stop('Ulm', 48.40, 9.99, .58), stop('Innsbruck', 47.27, 11.39, .78), stop('Bolzano', 46.50, 11.35, .91)],
    bases: [base('Cortina d’Ampezzo', 46.54, 12.14), base('Bolzano', 46.50, 11.35), base('Riva del Garda', 45.89, 10.84)],
    activities: [activity('bergen', 'Plan een panoramische bergwandeling met vroeg vertrek.', 'Kies een museum of een korte autorit door de vallei.', ['bergen', 'wandelen']), activity('motor', 'Rijd een selectie bergpassen buiten de piekuren.', 'Kies een lagere dalroute met culinaire stop.', ['motor', 'eten']), activity('zwemmen', 'Houd een rustige middag aan het meer.', 'Bezoek een wellnesslocatie of historisch centrum.', ['zwemmen', 'cultuur'])]
  },
  {
    id: 'ardenne', name: 'Ardennen & Luxemburg', country: 'België / Luxemburg',
    distanceKm: 350, driveHours: 3.8, nightMid: 125, activityDaily: 40, toll: 15,
    tags: ['natuur', 'wandelen', 'kinderen', 'motor', 'budget'],
    season: [3, 4, 5, 6, 7, 8, 9, 10], family: 8, motorcycle: 8, camper: 8, weather: 6, crowds: 8,
    summary: 'Betaalbaar, dichtbij en sterk voor een kortere, ontspannen roadtrip.',
    pros: ['Zeer korte aanreis', 'Budgetvriendelijk', 'Flexibel bij slecht weer'],
    cons: ['Minder stabiel weer', 'Minder spectaculair dan de Alpen'],
    routeStops: [stop('Arnhem', 51.98, 5.91, .2), stop('Luik', 50.63, 5.57, .58), stop('Dinant', 50.26, 4.91, .8)],
    bases: [base('La Roche-en-Ardenne', 50.18, 5.58), base('Vianden', 49.94, 6.20), base('Luxemburg-stad', 49.61, 6.13)],
    activities: [activity('natuur', 'Maak een bos- en rivierwandeling met korte terugweg.', 'Bezoek een kasteel of lokaal museum.', ['natuur', 'wandelen']), activity('kinderen', 'Plan een kasteel en een ontspannen picknick.', 'Kies een indoor speel- of zwemlocatie.', ['kinderen', 'cultuur']), activity('motor', 'Rijd een compacte lus over rustige heuvelwegen.', 'Bezoek een brouwerijmuseum of kasteel.', ['motor', 'eten'])]
  },
  {
    id: 'normandy', name: 'Normandië & Bretagne', country: 'Frankrijk',
    distanceKm: 820, driveHours: 8.5, nightMid: 150, activityDaily: 50, toll: 95,
    tags: ['kust', 'cultuur', 'eten', 'kinderen', 'natuur'],
    season: [4, 5, 6, 7, 8, 9], family: 8, motorcycle: 7, camper: 9, weather: 6, crowds: 7,
    summary: 'Kust, geschiedenis, dorpen en veel variatie zonder bergachtige routes.',
    pros: ['Sterke mix van cultuur en kust', 'Veel campings en familieaccommodaties', 'Goede roadtripstructuur'],
    cons: ['Wisselvallig weer', 'Meer rijafstand tussen sommige hoogtepunten'],
    routeStops: [stop('Breda', 51.57, 4.77, .12), stop('Antwerpen', 51.22, 4.40, .25), stop('Gent', 51.05, 3.72, .38), stop('Lille', 50.63, 3.06, .52), stop('Amiens', 49.89, 2.30, .7), stop('Rouen', 49.44, 1.10, .86)],
    bases: [base('Étretat', 49.71, 0.21), base('Mont-Saint-Michel', 48.64, -1.51), base('Saint-Malo', 48.65, -2.03)],
    activities: [activity('kust', 'Verken de kust te voet en plan een beschutte lunchstop.', 'Bezoek een maritiem museum of aquarium.', ['kust', 'wandelen']), activity('cultuur', 'Plan één historische locatie en een rustig centrum.', 'Kies een museum en overdekte markt.', ['cultuur', 'kinderen']), activity('eten', 'Combineer een lokale markt met een korte kustrit.', 'Reserveer een lange lunch en bezoek een ambachtelijke producent.', ['eten', 'motor'])]
  }
];

export const getDestination = id => destinations.find(destination => destination.id === id) || null;
