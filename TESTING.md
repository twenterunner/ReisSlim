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

De tests gebruiken alleen Node.js en bestrijken onder meer:

- duur- en schaalafhankelijke doelen voor aantal bases, nachten per base en geografische dekking;
- afwijzing van een 14-daagse landenreis die in een kleine stedelijke lus blijft;
- chronologische continuïteit: iedere dag start bij de vorige overnachtingsplaats;
- geen A→B→A→B-pingpong, onnodige gatewayterugkeer, dubbele corridors, POI's of vulactiviteiten;
- minimaal drie materieel verschillende regionale concepten wanneer providerfixtures daarvoor voldoende bewijs bevatten;
- betekenisvolle anchors die zwakke nabijgelegen plaatsen kunnen overtreffen;
- afzonderlijke auto- en motorreistijd, rust-, brandstof-, weg- en parkeerevidentie;
- route-/basegebonden benoemde POI's en accommodaties;
- structurele optimizermutaties en onderdrukking van tekstuele/no-op wijzigingen;
- identieke dagsegmenten in itinerary, kaart en GPX;
- provider-vormige acceptatiegevallen voor Zuid-Afrika, Namibië, Europese auto-/motorreizen en een onbekend land;

- wereldwijde en doelgerichte discovery buiten Europa;
- Namibia fly-drive, multi-modale segmenten en prijsbanden;
- route-overlap en verkennende terugcorridors;
- Travel Readiness zonder ongeverifieerde claims;
- provider request budgets en degraded health;
- lokaal leren, privémodus en assistant previews;
- weerclassificatie en open-license beeldmetadata;

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
- migratie van schema 8 en oudere opslag naar schema 9 met verplichte engine-10-herbouw;
- lokale statische-server smoke;
- manifest-, build- en service-workerconsistentie.

De intelligentiemetingen in de deterministische acceptatietests omvatten: aantal materieel verschillende voorstellen, unieke overnachtingsbases, aandeel nachten op de meest gebruikte base, geografische dekking, herhaalde POI's/corridors, backtracking en pingpong, verhouding benoemde versus generieke POI's/accommodaties, routegeometrie per reisdag en daadwerkelijke optimizerplanmutaties.

## Handmatige/browsercontrole

Start `python -m http.server 8080` en controleer in een schone browsercontext:

1. geen consolefouten bij laden;
2. formulierwijziging blijft na verversen bestaan;
3. er verschijnen meerdere geografisch en structureel verschillende voorstellen wanneer providerbewijs dit ondersteunt; exacte voorstellen staan bovenaan en stretch-ideeën zijn maximaal twee;
4. forceer onmogelijke invoer en controleer dat geen afgewezen bestemming selecteerbaar is en minimale aanpassingen verschijnen;
5. wissel tussen auto, motor, camper/motorhome en caravan en controleer de dynamische voertuigvelden;
6. dag 1 toont `vertrekplaats → eerste stop/bestemming`; de laatste dag keert terug;
7. vertrek-, aankomst-, rij-, pauze- en totale tijden zijn onderling consistent;
8. live plaatsen tonen naam, bronlink en verificatiewaarschuwing; offline fallback blijft bruikbaar;
9. iedere reisdag heeft een selecteerbare kaartlaag; klik op een dagkaart en controleer dat route, POI's en accommodatie van die dag oplichten;
10. na een bestemmingskeuze verschijnen drie verschillende reisstijlen voordat het detailplan wordt gemaakt;
11. optimiser toont concrete wijzigingen en dimensies voor/na; alleen een betekenisvolle verbetering is toepasbaar en undo herstelt het plan;
12. budget, voorzichtige bovengrens, JSON, GPX, migratie en opgeslagen reizen werken;
13. `Toon meer reisopties` herhaalt niets, bewaart favorieten en haalt met live data nieuwe regio's op;
14. offline herladen toont de applicatieshell; Leaflet-kaarttegels kunnen offline ontbreken;
15. met een testgateway of persoonlijke ORS-sleutel: laadstatus, live lijn, fallback en providerfout zijn duidelijk.

## Android 412 × 915 releasecheck

1. Open `https://twenterunner.github.io/ReisSlim/?build=1200` in Chrome op Android en vernieuw eenmaal na het verschijnen van Build 1200.
2. Wis bij een blijvende oude versie via **Site-instellingen → Opslag → Gegevens wissen**, open de URL opnieuw en controleer `ReisSlim v1.2.0 · Build 1200` onderaan.
3. Maak een 14-daagse landenreis met auto. Controleer dat een gekozen concept meerdere betekenisvolle overnachtingsbases gebruikt en geen stedelijke micro-lus of A→B→A→B-patroon bevat.
4. Herhaal met motor en controleer gewijzigde totale reistijden, rust-/brandstoflogica, wegfit en motorparkingtaal; schakel terug naar auto en controleer dat alle motortaal verdwijnt.
5. Open **Reisplan** en controleer afzonderlijke dagdoelen zonder dubbele benoemde attracties of vultekst.
6. Open **Kaart**, selecteer meerdere dagen en controleer routegeometrie, nachtmarkers, benoemde POI's en accommodaties zonder horizontale overflow.
7. Download GPX en controleer dat het aantal dagtracks overeenkomt met de reisdagen op de kaart.
8. Open **Budget** en controleer dat de zichtbare centrale rijen optellen tot het centrale totaal.
9. Open **Bekijk verbeteringen**, pas alleen een structureel voorstel toe en controleer dat dagen, kaart, budget en GPX samen veranderen.
10. Schakel netwerk tijdelijk uit: de PWA-shell moet laden; nieuwe discovery mag alleen identieke geldige cache gebruiken en mag nooit een verborgen catalogus tonen.

## Releasecheck

Versie en build moeten overeenkomen in `config.js`, `package.json`, `index.html`, `service-worker.js`, README en changelog. De CI-workflow voert `npm run check` uit op pushes en pull requests.
