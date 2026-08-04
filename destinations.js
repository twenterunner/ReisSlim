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
  },
  {
    id: 'moselle', name: 'Moezel, Eifel & Trier', country: 'Duitsland',
    distanceKm: 390, driveHours: 4.2, nightMid: 120, activityDaily: 38, toll: 10,
    tags: ['natuur', 'wandelen', 'eten', 'cultuur', 'motor', 'budget'], season: [3,4,5,6,7,8,9,10], family: 8, motorcycle: 9, camper: 9, weather: 7, crowds: 8,
    summary: 'Rivierbochten, vakwerkdorpen en rustige heuvelwegen op korte afstand.',
    pros: ['Korte en ontspannen aanreis', 'Sterk voor motor en camper', 'Goede prijs-kwaliteit'], cons: ['Minder geschikt voor hooggebergte', 'Drukte rond wijnfeesten'],
    routeStops: [stop('Arnhem',51.98,5.91,.22),stop('Keulen',50.94,6.96,.55),stop('Koblenz',50.36,7.59,.78)], bases: [base('Cochem',50.15,7.17),base('Trier',49.75,6.64),base('Monschau',50.55,6.24)],
    activities: [activity('wandelen','Wandel een rustige panorama-etappe boven de Moezel.','Bezoek een wijnmuseum of Romeins monument.',['wandelen','natuur']),activity('cultuur','Combineer Trier met een lange lunch en korte stadswandeling.','Kies twee compacte binnenlocaties in Trier.',['cultuur','eten']),activity('motor','Rijd een lus door Eifel en Moezeldal met uitzichtstops.','Kies een korte dalroute en historisch centrum.',['motor','natuur'])]
  },
  {
    id: 'sauerland', name: 'Sauerland & Rothaargebergte', country: 'Duitsland',
    distanceKm: 250, driveHours: 2.8, nightMid: 112, activityDaily: 35, toll: 5,
    tags: ['natuur','wandelen','kinderen','motor','budget'], season: [2,3,4,5,6,7,8,9,10,11], family: 9, motorcycle: 8, camper: 8, weather: 6, crowds: 8,
    summary: 'Een dichtbij-alternatief met bossen, stuwmeren en compacte dagafstanden.',
    pros: ['Zeer weinig aanreisbelasting', 'Betaalbaar', 'Veel korte activiteiten'], cons: ['Weer kan snel omslaan', 'Minder onderscheidend landschap'],
    routeStops: [stop('Enschede',52.22,6.89,.18),stop('Münster',51.96,7.63,.45),stop('Dortmund',51.51,7.47,.72)], bases: [base('Winterberg',51.19,8.53),base('Willingen',51.30,8.61),base('Möhnesee',51.49,8.06)],
    activities: [activity('natuur','Kies een boswandeling en rustige middag aan een stuwmeer.','Bezoek een grot, museum of zwembad.',['natuur','wandelen']),activity('kinderen','Plan een rodelbaan of speelroute met ruime pauze.','Kies een binnenbad of bezoekerscentrum.',['kinderen']),activity('motor','Rijd een korte, bochtige heuvelroute buiten de spits.','Maak een compacte dorpenroute met koffiestop.',['motor'])]
  },
  {
    id: 'wadden', name: 'Wadden, Ostfriesland & Bremen', country: 'Nederland / Duitsland',
    distanceKm: 230, driveHours: 2.6, nightMid: 125, activityDaily: 35, toll: 5,
    tags: ['kust','natuur','kinderen','cultuur','budget'], season: [3,4,5,6,7,8,9,10], family: 9, motorcycle: 6, camper: 9, weather: 5, crowds: 7,
    summary: 'Kustnatuur en historische havens met minimale rijbelasting en veel camperopties.',
    pros: ['Zeer dichtbij', 'Uitstekend voor camper of caravan', 'Veel gezinsstops'], cons: ['Windgevoelig', 'Geen berglandschap'],
    routeStops: [stop('Groningen',53.22,6.57,.34),stop('Leer',53.23,7.45,.60),stop('Oldenburg',53.14,8.21,.82)], bases: [base('Greetsiel',53.50,7.10),base('Bremerhaven',53.54,8.58),base('Bremen',53.08,8.80)],
    activities: [activity('kust','Plan een wadwandeling met getijdencontrole en havendiner.','Bezoek een maritiem museum of aquarium.',['kust','natuur']),activity('kinderen','Combineer zeehondenopvang met strandtijd.','Kies een wetenschapsmuseum of binnenbad.',['kinderen']),activity('cultuur','Verken Bremen te voet en houd de middag vrij.','Bezoek markthal en museum.',['cultuur','eten'])]
  },
  {
    id: 'danishcoast', name: 'Deense westkust & Zuid-Jutland', country: 'Denemarken',
    distanceKm: 610, driveHours: 6.6, nightMid: 145, activityDaily: 48, toll: 20,
    tags: ['kust','natuur','kinderen','wandelen','camper'], season: [4,5,6,7,8,9], family: 10, motorcycle: 6, camper: 10, weather: 6, crowds: 8,
    summary: 'Brede stranden, duinen en kindvriendelijke stops met makkelijke wegen.',
    pros: ['Zeer gezinsvriendelijk', 'Sterke camperinfrastructuur', 'Rustige routeopbouw'], cons: ['Boodschappen en horeca zijn prijziger', 'Wind en regen blijven aandachtspunten'],
    routeStops: [stop('Osnabrück',52.28,8.05,.28),stop('Bremen',53.08,8.80,.48),stop('Hamburg',53.55,9.99,.68),stop('Flensburg',54.79,9.44,.9)], bases: [base('Ribe',55.33,8.76),base('Hvide Sande',56.00,8.13),base('Billund',55.73,9.12)],
    activities: [activity('kust','Fiets of wandel door de duinen en sluit af aan het strand.','Bezoek een aquarium of Vikingmuseum.',['kust','natuur']),activity('kinderen','Plan één attractie en een rustige herstelmiddag.','Kies een wetenschapscentrum of zwembad.',['kinderen']),activity('natuur','Bezoek een vogelgebied met korte gemarkeerde route.','Kies een natuurcentrum met binnenexpositie.',['natuur','wandelen'])]
  },
  {
    id: 'harz', name: 'Harz & vakwerksteden', country: 'Duitsland',
    distanceKm: 420, driveHours: 4.6, nightMid: 118, activityDaily: 38, toll: 5,
    tags: ['natuur','wandelen','cultuur','kinderen','motor','budget'], season: [3,4,5,6,7,8,9,10], family: 8, motorcycle: 8, camper: 8, weather: 6, crowds: 8,
    summary: 'Bossen, stoomtreinen en vakwerksteden in een betaalbare compacte regio.',
    pros: ['Veel variatie zonder lange lokale ritten', 'Betaalbaar', 'Sterke regenalternatieven'], cons: ['Toppen zijn bescheiden', 'Brocken kan druk en mistig zijn'],
    routeStops: [stop('Osnabrück',52.28,8.05,.3),stop('Hannover',52.38,9.73,.62),stop('Hildesheim',52.15,9.95,.78)], bases: [base('Wernigerode',51.84,10.79),base('Goslar',51.91,10.43),base('Quedlinburg',51.79,11.14)],
    activities: [activity('wandelen','Maak een boswandeling met stoomtrein als terugvaloptie.','Bezoek een mijnmuseum of vakwerkcentrum.',['wandelen','natuur']),activity('cultuur','Combineer twee compacte vakwerksteden.','Kies kasteel en museum.',['cultuur']),activity('motor','Rijd een rustige Harz-lus met drie vaste pauzes.','Kies een korte dalroute en lunchstop.',['motor'])]
  },
  {
    id: 'loire', name: 'Loirekastelen & Atlantische dorpen', country: 'Frankrijk',
    distanceKm: 760, driveHours: 8.0, nightMid: 145, activityDaily: 52, toll: 105,
    tags: ['cultuur','eten','natuur','kinderen','fietsen'], season: [4,5,6,7,8,9,10], family: 8, motorcycle: 7, camper: 8, weather: 7, crowds: 7,
    summary: 'Kastelen, markten en rustige rivierdalen met een cultureel roadtripkarakter.',
    pros: ['Veel inhoud bij wisselvallig weer', 'Goede culinaire mix', 'Makkelijke wegen'], cons: ['Tol en kastelen verhogen kosten', 'Minder geschikt voor bergliefhebbers'],
    routeStops: [stop('Antwerpen',51.22,4.40,.18),stop('Lille',50.63,3.06,.36),stop('Parijs-oost',48.86,2.50,.63),stop('Orléans',47.90,1.91,.85)], bases: [base('Amboise',47.41,.98),base('Saumur',47.26,-.08),base('Tours',47.39,.69)],
    activities: [activity('cultuur','Bezoek één kasteel en houd tijd voor tuin en dorp.','Kies een kasteel met volledige binnenroute.',['cultuur']),activity('eten','Plan markt, producent en lange lunch zonder extra omweg.','Kies markthal en kookworkshop.',['eten']),activity('natuur','Fiets of wandel een vlak traject langs de Loire.','Bezoek een grotwoning of museum.',['natuur','kinderen'])]
  },
  {
    id: 'bohemia', name: 'Bohemen, Praag & rotssteden', country: 'Tsjechië',
    distanceKm: 790, driveHours: 8.3, nightMid: 115, activityDaily: 42, toll: 65,
    tags: ['cultuur','natuur','wandelen','budget','kinderen'], season: [4,5,6,7,8,9,10], family: 8, motorcycle: 8, camper: 7, weather: 7, crowds: 6,
    summary: 'Sterke waarde met historische steden, kastelen en spectaculaire rotslandschappen.',
    pros: ['Goede prijs-kwaliteit', 'Cultuur en natuur goed te combineren', 'Veel binnenopties'], cons: ['Praag kan zeer druk zijn', 'Lokale wegkwaliteit varieert'],
    routeStops: [stop('Hannover',52.38,9.73,.27),stop('Magdeburg',52.12,11.63,.48),stop('Leipzig',51.34,12.37,.66),stop('Dresden',51.05,13.74,.83)], bases: [base('Liberec',50.77,15.06),base('Praag',50.08,14.44),base('Český Krumlov',48.81,14.32)],
    activities: [activity('natuur','Wandel vroeg door een rotsstad met korte routeoptie.','Bezoek kasteel of glasmuseum.',['natuur','wandelen']),activity('cultuur','Verken een historisch centrum buiten de piekuren.','Kies museum, koffiehuis en markthal.',['cultuur','eten']),activity('kinderen','Plan kabelbaan of dierentuin met rustige middag.','Kies techniekmuseum of zwembad.',['kinderen'])]
  },
  {
    id: 'jura', name: 'Franse Jura & meren', country: 'Frankrijk',
    distanceKm: 710, driveHours: 7.5, nightMid: 130, activityDaily: 44, toll: 75,
    tags: ['natuur','bergen','zwemmen','wandelen','motor','budget'], season: [4,5,6,7,8,9], family: 8, motorcycle: 9, camper: 8, weather: 7, crowds: 9,
    summary: 'Rustiger alternatief voor de Alpen met meren, kloven en bochtige plateauwegen.',
    pros: ['Weinig massatoerisme', 'Sterke motor- en natuurmatch', 'Betaalbaarder dan de Alpen'], cons: ['Minder live voorzieningen buiten dorpen', 'Sommige bergwegen zijn smal voor caravan'],
    routeStops: [stop('Maastricht',50.85,5.69,.18),stop('Luxemburg',49.61,6.13,.35),stop('Nancy',48.69,6.18,.55),stop('Besançon',47.24,6.02,.79)], bases: [base('Lons-le-Saunier',46.67,5.55),base('Saint-Claude',46.39,5.86),base('Lac de Chalain',46.67,5.79)],
    activities: [activity('natuur','Wandel naar een waterval en kies een rustige picknickplek.','Bezoek een kaasboerderij of ambachtsmuseum.',['natuur','wandelen']),activity('zwemmen','Plan een meer met korte oeverwandeling.','Kies thermen of een grotmuseum.',['zwemmen']),activity('motor','Rijd een plateaulussen met beperkte dagafstand.','Kies een lagere dalroute met culinaire stop.',['motor','eten'])]
  }
];

export const getDestination = id => destinations.find(destination => destination.id === id) || null;
