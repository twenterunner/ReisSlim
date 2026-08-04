# Testen

## Alles uitvoeren

```bash
npm run check
```

## Onderdelen

```bash
npm run check:syntax
npm test
npm run check:pwa
```

De tests gebruiken alleen Node.js en bestrijken:

- vertrek en terugkeer op de ingevoerde plaats;
- vertrekplaats niet als verblijfsdag;
- exact aantal dagen en te korte reizen;
- dagelijkse totale reislimieten en ongelijke corridorsegmenten;
- extra motorreistijd, rustfrequentie en migratie van het oude camperprofiel;
- voertuigmatch en dekking van accommodatie-, restaurant-, activiteit- en stopvoorstellen;
- routegeometrie en gedeelde kaart-/GPX-waypoints;
- providerverzoeken, voertuigafmetingen, TomTom-normalisatie en live/offline verrijking;
- sluitende budgettotalen;
- stabiele rangschikking;
- minimaal zes voorstellen bij voldoende kandidaten, unieke ID's, geen near-duplicates en deterministische diversiteitsselectie;
- vervolgaanvragen die reeds getoonde of afgewezen bestemmingen uitsluiten;
- onbeperkt voortschrijdende deterministische zoekringen en normalisatie van willekeurige Overpass-plaatsen;
- exacte-versus-stretch groepering, maximaal twee stretch-ideeën en uitsluiting van afgewezen bestemmingen;
- concrete minimale aanpassingen als geen exacte bestemming past;
- planbrede harde voorwaarden voor budget, tijd en accommodatiewissels;
- Overpass-normalisatie, benoemde plaatsverrijking en gecachete vertrekgeocoding;
- scoregrenzen;
- drie materieel verschillende reisstijlen per bestemming;
- optimalisatie met meerdere gecoördineerde wijzigingen, locks, volledig herscoren, minimumdrempel en undo;
- geen kunstmatige scoreverhoging zonder geselecteerde planwijziging;
- GPX-XML en coördinaten;
- migratie van oude opslag;
- lokale statische-server smoke;
- manifest-, build- en service-workerconsistentie.

## Handmatige/browsercontrole

Start `python -m http.server 8080` en controleer in een schone browsercontext:

1. geen consolefouten bij laden;
2. formulierwijziging blijft na verversen bestaan;
3. er verschijnen normaal 6–12 verschillende voorstellen; exacte voorstellen staan bovenaan en stretch-ideeën zijn maximaal twee;
4. forceer onmogelijke invoer en controleer dat geen afgewezen bestemming selecteerbaar is en minimale aanpassingen verschijnen;
5. wissel tussen auto, motor, camper/motorhome en caravan en controleer de dynamische voertuigvelden;
6. dag 1 toont `vertrekplaats → eerste stop/bestemming`; de laatste dag keert terug;
7. vertrek-, aankomst-, rij-, pauze- en totale tijden zijn onderling consistent;
8. live plaatsen tonen naam, bronlink en verificatiewaarschuwing; offline fallback blijft bruikbaar;
9. kaartlagen tonen route, dagpunten, rust/brandstof, overnachten, eten en activiteiten;
10. na een bestemmingskeuze verschijnen drie verschillende reisstijlen voordat het detailplan wordt gemaakt;
11. optimiser toont concrete wijzigingen en dimensies voor/na; alleen een betekenisvolle verbetering is toepasbaar en undo herstelt het plan;
12. budget, voorzichtige bovengrens, JSON, GPX, migratie en opgeslagen reizen werken;
13. `Toon meer reisopties` herhaalt niets, bewaart favorieten en haalt met live data nieuwe regio's op;
14. offline herladen toont de applicatieshell; Leaflet-kaarttegels kunnen offline ontbreken;
15. met een testgateway of persoonlijke ORS-sleutel: laadstatus, live lijn, fallback en providerfout zijn duidelijk.

## Releasecheck

Versie en build moeten overeenkomen in `config.js`, `package.json`, `index.html`, `service-worker.js`, README en changelog. De CI-workflow voert `npm run check` uit op pushes en pull requests.
