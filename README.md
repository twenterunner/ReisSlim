# ReisSlim 0.9.0 — dynamische reisintelligentie

ReisSlim is een mobiele Progressive Web App voor Nederlandse reizigers die zelf een Europese roadtrip willen plannen. De planner controleert eerst budget, dagen, dagelijkse totale reistijd, accommodatiewissels en voertuigprofiel. Alleen daarna worden haalbare reizen op voorkeuren gerangschikt. De volledige basis blijft lokaal bruikbaar; route, plaatsen en weer kunnen optioneel live worden verrijkt.

## Mogelijkheden

- dashboard, automatisch concept en maximaal twintig opgeslagen reizen;
- normaal 6 tot 12 wezenlijk verschillende reisconcepten, geselecteerd op geschiktheid én diversiteit;
- onbeperkt uitbreidbare bestemmingsontdekking via opeenvolgende, handmatig gestarte OpenStreetMap/Overpass-zoekringen;
- veertien gecureerde regio's als betrouwbare offline fallback, niet als grens van het zoekgebied;
- harde voorwaarden vóór voorkeursscores, met een afzonderlijke exacte-resultatengroep;
- maximaal twee begrensde stretch-ideeën die ieder precies één kleine afwijking tonen;
- concrete minimale aanpassingen wanneer geen exacte reis past;
- gewogen voorkeuren en vergelijking van maximaal vier zichtbare bestemmingen;
- opslaan, afwijzen, focussen en meer opties ophalen zonder eerder getoonde voorstellen te herhalen;
- drie vergelijkbare reisstijlen per bestemming: ontspannen, gebalanceerd en actief;
- heen- en terugreis vanaf de werkelijk ingevoerde vertrekplaats;
- aparte profielen voor auto, motor, camper/motorhome en auto met caravan;
- totale reisbelasting per dag: rijdende tijd plus voertuigafhankelijke rust-, brandstof-, weer- en aankomsttijd;
- routevoorkeur, actieradius en voor grote voertuigen maximumsnelheid, hoogte, lengte en gewicht;
- indicatieve corridorroute met dagsegmenten, pauze-/brandstofwaypoints en afzonderlijke kaartlagen;
- voertuiggerichte voorstellen voor overnachten, eten, activiteiten, rustpunten en voertuigservice;
- optionele namen, coördinaten, openingstijden en bronlinks uit OpenStreetMap/Overpass;
- optionele Open-Meteo-verwachting voor de bestemming en reisdata;
- dagtijdschema's met vertrek, aankomst, check-in en activiteitenvenster;
- dagkaarten met route, afstand, rijdende tijd, totale tijd, waypoints, overnachting, hoofdplan en regenalternatief;
- centrale begroting voor accommodatie, brandstof, tol, parkeren, boodschappen, restaurants, activiteiten en onvoorzien;
- transparante planning-quality indicator met negen dimensies, aftrekredenen en aanbevelingen;
- transparante optimalisatie met echte planwijzigingen, minimumverbeteringsdrempel, selectie per wijziging, locks en undo;
- kaart en GPX op basis van dezelfde routegeometrie, dagpunten en voorstellen;
- optionele live TomTom-routegeometrie via een sleutelbeschermende gateway, met automatische offline fallback;
- lokale opslag, offline applicatieshell en GitHub Pages-compatibele relatieve paden.

## Lokaal draaien

Er is geen buildstap of betaalde API nodig voor de offline planner. Gebruik een statische server, omdat ES-modules niet betrouwbaar via `file://` werken.

```bash
python -m http.server 8080
```

Open daarna `http://localhost:8080`.

## Optionele live data

Auto en motor kunnen bij ingeschakelde live data een OSRM-weggeometrie proberen; motorreistijd en pauzes blijven door ReisSlim voertuigafhankelijk berekend. Voor camper/caravan kan de gebruiker optioneel een eigen OpenRouteService-sleutel lokaal invoeren, zodat lengte-, hoogte- en gewichtskenmerken worden meegestuurd. De sleutel staat nooit in reisexport of repository. De bestaande TomTom-gateway blijft de aanbevolen productieoptie voor sleutelbescherming. Zonder live antwoord gebruikt de app de geteste offline corridorraming.

OpenStreetMap/Overpass levert plaatsnamen maar geen boekbaarheid, actuele prijs of gegarandeerde opening. ReisSlim start direct met de offline fallback en kan daarna per gebruikersactie een compacte nieuwe zoekring ophalen. De cursor kan onbeperkt doorgaan: er bestaat geen vaste lijst of maximumaantal regio's. Resultaten worden lokaal gecachet en bekende, getoonde of afgewezen bestemmingen worden uitgesloten. Nominatim wordt alleen na formulierverzending gebruikt voor een onbekende vertrekplaats en wordt lokaal gecachet; er is geen autocomplete.

De publieke Overpass-instantie is geschikt voor gematigd, handmatig gebruik. Gebruik voor een commerciële productiebelasting een eigen instantie of sleutelbeschermende gateway met caching en limieten.

## Kwaliteitscontroles

Node.js 20 of nieuwer is voldoende; er zijn geen npm-afhankelijkheden.

```bash
npm run check
```

Dit voert JavaScript-syntaxcontrole, alle unit-/integratie-/migratie-/GPX-tests, een lokale server-smoketest en PWA-manifest/service-workercontroles uit. Zie [TESTING.md](TESTING.md).

## GitHub Pages

Publiceer de root van `main` via **Settings → Pages → Deploy from a branch**. Alle applicatie- en service-workerpaden zijn relatief, zodat de app op een projectsite zoals `/ReisSlim/` blijft werken. Verhoog bij elke release versie en build in `config.js`, `index.html`, `service-worker.js`, `package.json`, README en changelog.

## Privacy en vertrouwen

Concepten, integratie-instellingen en opgeslagen reizen staan uitsluitend in `localStorage` van de browser. Leaflet haalt kaarttegels rechtstreeks bij OpenStreetMap op wanneer de kaart zichtbaar is. Met live data ingeschakeld kunnen vertreknaam, routecoördinaten en voertuigkenmerken naar Nominatim, OSRM/OpenRouteService of de ingestelde gateway gaan; route-/bestemmingscoördinaten gaan naar Overpass en Open-Meteo. Live data kan per reis worden uitgeschakeld.

Alle prijzen, seizoensscores en plaatsvoorstellen zijn indicatief. Offline afstanden en reistijden zijn ramingen; de interface noemt de gebruikte bron. De GPX is een planningstrack, geen gegarandeerde turn-by-turn navigatie. Reizigers blijven zelf verantwoordelijk voor officiële reisadviezen, verkeersregels, voertuigbeperkingen, beschikbaarheid, prijzen, weer, openingstijden en veiligheid.

## Bekende beperkingen

- De offline vertrekcatalogus bevat een beperkte set Nederlandse plaatsen. Een onbekende plaats behoudt de juiste tekst, maar gebruikt Saasveld alleen als expliciet gemarkeerd afstandsanker en krijgt geen vals vertrekpunt in GPX.
- Offline routes verbinden gecureerde corridor- en dagpunten; alleen de optionele provider volgt het wegennet.
- Live accommodatie-, restaurant-, activiteit- en serviceplaatsen zijn bronvermeldingen, geen boekbare of beschikbaarheidsgecontroleerde aanbiedingen.
- Dynamisch ontdekte plaatsen krijgen voorlopig indicatieve regioprofielen; prijs-, tol-, brandstof- en beschikbaarheidsdata hebben nog geen live bron.
- De SVG-appicon werkt op moderne browsers; rastericonen van 192 en 512 pixels zijn een aanbevolen volgende stap.

## Vervolg naar v1.0

De route- en bestemmingsprovidergrenzen zijn nu aanwezig. De volgende fase kan dezelfde gateway uitbreiden met Wikidata/Wikipedia-context, live boekingslinks, weer, verkeersrisico, tol en prijsranges zonder de deterministische fallback of centrale budgetlogica te herschrijven. Zie [ARCHITECTURE.md](ARCHITECTURE.md).
