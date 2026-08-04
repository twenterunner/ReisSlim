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
- dagelijkse rijlimieten;
- sluitende budgettotalen;
- stabiele rangschikking;
- scoregrenzen;
- optimalisatiecontract en undo;
- GPX-XML en coördinaten;
- migratie van oude opslag;
- lokale statische-server smoke;
- manifest-, build- en service-workerconsistentie.

## Handmatige/browsercontrole

Start `python -m http.server 8080` en controleer in een schone browsercontext:

1. geen consolefouten bij laden;
2. formulierwijziging blijft na verversen bestaan;
3. voorstellen, vergelijking en selectie werken;
4. dag 1 toont `vertrekplaats → eerste stop/bestemming`;
5. laatste dag toont `laatste locatie → vertrekplaats`;
6. optimiser toont voor/na en undo herstelt het plan;
7. kaart, budget, JSON, GPX en opgeslagen reizen werken;
8. offline herladen toont de applicatieshell; Leaflet-kaarttegels kunnen offline ontbreken.

## Releasecheck

Versie en build moeten overeenkomen in `config.js`, `package.json`, `index.html`, `service-worker.js`, README en changelog. De CI-workflow voert `npm run check` uit op pushes en pull requests.
