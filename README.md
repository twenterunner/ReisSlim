# ReisSlim v0.1.0

GitHub Pages proof of principle voor een Nederlandse roadtripplanner.

## Functies
- Nederlandse reisintake
- Transparante bestemmingsscore
- Zes voorbeeldregio's
- Dagplanning
- Budgetberekening
- Leaflet/OpenStreetMap-kaart
- GPX- en JSON-export
- Lokale opslag
- PWA/service worker

## Publiceren op GitHub Pages
1. Maak een nieuwe repository.
2. Upload alle bestanden en mappen uit deze map naar de root van de repository.
3. Open **Settings → Pages**.
4. Kies **Deploy from a branch**, branch **main**, folder **/(root)**.
5. Open de gepubliceerde URL.

## Lokaal testen
ES modules werken het betrouwbaarst via een lokale webserver:

```bash
python -m http.server 8000
```

Open daarna `http://localhost:8000`.

## Belangrijke beperkingen
- Bestemmingsgegevens en kosten zijn indicatief.
- De kaartlijn verbindt reispunten en is nog geen echte routeberekening over wegen.
- GPX bevat een eenvoudige track en waypoints.
- Er zijn nog geen live prijzen, beschikbaarheid, verkeer, weer of AI-calls.
- Voeg nooit geheime API-sleutels toe aan browsercode of een openbare GitHub-repository.

## Logische volgende stap
Voeg een kleine serverless backend toe voor echte routeberekening, weerdata en AI-planning, terwijl deze front-end en datamodellen behouden blijven.
