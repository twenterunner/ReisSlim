# ReisSlim 0.6.0 — commerciële basis

ReisSlim is een mobiele, lokale Progressive Web App voor Nederlandse reizigers die zelf een Europese roadtrip willen plannen. De app ondersteunt bestemmingskeuze, een deterministische dagplanning, transparante budgetraming, planningskwaliteit, kaartweergave en JSON/GPX-export.

## Mogelijkheden

- dashboard, automatisch concept en maximaal twintig opgeslagen reizen;
- gewogen voorkeuren en vergelijking van maximaal drie bestemmingen;
- heen- en terugreis vanaf de werkelijk ingevoerde vertrekplaats;
- indicatieve reisstops, maximale dagelijkse rijtijd en duidelijke waarschuwing bij een te korte reis;
- dagkaarten met type, route, afstand, rijtijd, overnachting, hoofdplan en regenalternatief;
- centrale begroting voor accommodatie, brandstof, tol, parkeren, boodschappen, restaurants, activiteiten en onvoorzien;
- transparante planning-quality indicator met negen dimensies, aftrekredenen en aanbevelingen;
- veilige verbetering van rust, variatie, regenalternatieven en onnodige wissels, met éénstaps-undo;
- kaart en GPX op basis van dezelfde routepunten;
- lokale opslag, offline applicatieshell en GitHub Pages-compatibele relatieve paden.

## Lokaal draaien

Er is geen buildstap of betaalde API nodig. Gebruik een statische server, omdat ES-modules niet betrouwbaar via `file://` werken.

```bash
python -m http.server 8080
```

Open daarna `http://localhost:8080`.

## Kwaliteitscontroles

Node.js 20 of nieuwer is voldoende; er zijn geen npm-afhankelijkheden.

```bash
npm run check
```

Dit voert JavaScript-syntaxcontrole, alle unit-/integratie-/migratie-/GPX-tests, een lokale server-smoketest en PWA-manifest/service-workercontroles uit. Zie [TESTING.md](TESTING.md).

## GitHub Pages

Publiceer de root van `main` via **Settings → Pages → Deploy from a branch**. Alle applicatie- en service-workerpaden zijn relatief, zodat de app op een projectsite zoals `/ReisSlim/` blijft werken. Verhoog bij elke release versie en build in `config.js`, `index.html`, `service-worker.js`, `package.json`, README en changelog.

## Privacy en vertrouwen

ReisSlim verstuurt geen formulier- of reisgegevens. Concepten en opgeslagen reizen staan uitsluitend in `localStorage` van de browser. Leaflet haalt kaarttegels rechtstreeks bij OpenStreetMap op wanneer de kaart zichtbaar is; route-invoer wordt daarbij niet verzonden door ReisSlim.

Alle prijzen, afstanden, rijtijden, seizoensscores en activiteiten zijn offline, indicatief en niet-live. De GPX is een planningstrack, geen gegarandeerde turn-by-turn navigatie. Reizigers blijven zelf verantwoordelijk voor officiële reisadviezen, verkeersregels, beschikbaarheid, prijzen, weer, openingstijden en veiligheid.

## Bekende beperkingen

- De offline vertrekcatalogus bevat een beperkte set Nederlandse plaatsen. Een onbekende plaats behoudt de juiste tekst, maar gebruikt Saasveld alleen als expliciet gemarkeerd afstandsanker en krijgt geen vals vertrekpunt in GPX.
- Routes verbinden gecureerde corridor- en dagpunten; ze volgen nog geen volledig wegennet.
- Bestemming- en prijsdata hebben geen live bron of beschikbaarheidscontrole.
- De SVG-appicon werkt op moderne browsers; rastericonen van 192 en 512 pixels zijn een aanbevolen volgende stap.

## Commercieel migratiepad

De domeinlogica is provider-onafhankelijk. Een volgende fase kan gratis/self-hosted of commerciële adapters toevoegen voor geocoding, routering, weer en prijsranges achter één gateway, zonder scorings-, budget- of UI-logica te herschrijven. Zie [ARCHITECTURE.md](ARCHITECTURE.md).
