# Architectuur

## Doel

ReisSlim 0.9 is een GitHub Pages-compatibele PWA met een deterministische, constraint-first kern en optionele live providers. Zonder provider is de browser de enige runtime. Gedeelde providersleutels komen nooit in de PWA of repository; een persoonlijke OpenRouteService-sleutel kan uitsluitend lokaal worden bewaard.

## Lagen

1. **Configuratie en data** — `config.js` bevat versie, voertuigprofielen, routering en expliciete aannames; `destinations.js` bevat uitsluitend de gecureerde offline fallback.
2. **Domein** — `constraint-engine.js` scheidt harde voorwaarden van transparante zachte trade-offs; `proposal-engine.js` selecteert met een deterministische MMR-achtige diversiteitsstap; `itinerary-variants.js` bouwt reisstijlen; `plan-solver.js` verdeelt reisdagen en tijdvensters.
3. **Provider en infrastructuur** — `destination-provider.js` ontdekt zonder vaste regiolimiet nieuwe bereikbare plaatsen via opeenvolgende Overpass-zoekringen. `routing-provider.js` kiest gateway, lokale OpenRouteService-integratie of beperkte OSRM-fallback. `place-provider.js` verzorgt vertrekgeocoding, route-POI's, Open-Meteo en lokale caches. De vlak geplaatste `route-worker.js` beschermt en normaliseert TomTom.
4. **Presentatie** — `ui-renderer.js` rendert ge-escapete HTML; `app.js` orkestreert state en events. `index.html` en `styles.css` definiëren de mobiele shell.
5. **PWA** — `manifest.webmanifest` en `service-worker.js` leveren installatiegegevens, versieverwijdering en offline shellgedrag.

## Stateflow

`TripRequest → vehicle normalization → offline + dynamische kandidaten → feasibility gate → suitability ranking → diversity selection → portfolio → itinerary variants → detailed itinerary + budget → validation → UI/export`

`offline itinerary → optional routing gateway → enriched geometry/timing → recommendations + budget + validation + quality → UI/export`

`app.js` bezit één actuele state. Alleen de invoer, bestemmingidentiteit en een eventueel opgeslagen dynamisch bestemmingsprofiel zijn duurzaam gezaghebbend. Afgeleide plannen worden na migratie of herladen met de huidige engine opnieuw berekend. Een optimalisatie bewaart één tijdelijke undo-snapshot.

## Kandidaten en diversiteit

De veertien profielen in `destinations.js` garanderen bruikbaarheid zonder netwerk. Ze zijn geen productlimiet. `destination-provider.js` berekent per cursor een nieuwe geografische zoekring op basis van vertrekpunt, reisduur, maximale dagbelasting en voertuig. Een gebundelde Overpass-query levert steden en dorpen; de normalisator maakt daarvan een planningsprofiel met stabiele ID, corridor, basis, kostenband en bronbewijs. De volgende cursor verplaatst de zoekpunten deterministisch met een golden-angle-verdeling. Daardoor kan `Toon meer reisopties` steeds verder zoeken zonder vaste bovengrens, terwijl caches, timeouts en een resultaatlimiet per aanvraag de publieke dienst ontzien.

Eerst worden alleen haalbare kandidaten op gebruikersfit gescoord. Daarna kiest `proposal-engine.js` iteratief de kandidaat met de beste combinatie van fit en afstand tot het al gekozen portfolio. Verschil omvat regio, afstand, budgetband, reisintensiteit, bases, route, activiteiten en voertuigfit. Bij te weinig geldige opties wordt de oorzaak getoond; de engine vult niet op met duplicaten of verborgen overtredingen.

## Planningscontract

- Elk gegenereerd plan heeft exact `trip.days` dagen.
- Dag 1 heeft `from === trip.origin`; de laatste dag heeft `to === trip.origin`.
- De vertrekplaats is nooit een verblijf- of activiteitdag.
- `roadHours` is tijd in beweging; `elapsedHours`/`driveHours` is de totale reisbelasting inclusief geplande voertuigpauzes en aankomstbuffer.
- Rijdagen volgen gecureerde corridorstops en ieder werkelijk segment wordt afzonderlijk tegen `trip.maxDrive` getoetst.
- Een normale bestemming is pas selecteerbaar wanneer budget, dagen, reistijd en minimale wissels vooraf passen.
- Een stretch-idee heeft maximaal één begrensde afwijking en vereist bevestiging; afgewezen bestemmingen worden niet als reisvoorstel getoond.
- Kaart en GPX lezen dezelfde `days[].geometry`, dagpunten, waypoints en voorstellen.
- Ieder voorstel heeft een expliciete `vehicleFit`, bron, verificatiestatus en coördinaat; offline voorstellen claimen geen echte beschikbaarheid.

## Providergrens

De client verstuurt per routesegment alleen oorsprong, bestemming, eventuele waypoints en `vehicleSpec`. De gateway geeft provider-onafhankelijk terug:

`{ provider, distanceKm, roadHours, geometry[] }`

Bij een fout, timeout of onvolledig antwoord blijft het oorspronkelijke offline segment intact. Een gedeeltelijk resultaat heet expliciet `mixed`; alleen een compleet resultaat heet `live`.

Een commerciële v1.0 kan aanvullende adapters achter dezelfde gateway toevoegen:

- `GeocodingProvider.resolve(origin)`;
- `PlacesProvider.searchAlongRoute(geometry, categories, vehicleProfile)`;
- `WeatherProvider.summary(region, dates)`;
- `PricingProvider.range(region, party, dates)`.
- `DestinationContextProvider.enrich(osmId, countries, season)` voor Wikidata/Wikipedia en landspecifieke kennis.

De UI en scoringslogica roepen geen provider rechtstreeks aan. De gateway is verantwoordelijk voor sleutelbescherming, oorsprongrestricties, caching, quota, observability en privacycontrole. Het offline pad blijft fallback en test-orakel.

De browserclient gebruikt nu één compacte, handmatig gestarte Overpass-batch per ontdekkingsronde. Voor commercieel volume verhuist dit contract ongewijzigd naar een eigen/proxy-instantie met gedeelde cache, quota en monitoring.

## Budgetcontract

`budget-engine.js` is het enige gezag voor totalen. Voertuigprofielen leveren verbruik, tol-, parkeer- en accommodatiefactoren; bestemmingdata levert prijsankers. Iedere rij wordt afgerond en `total` is exact de som van de zichtbare rijen. Live prijsdata moet later als gedateerde broninput worden toegevoegd, niet als tweede berekeningsengine.
