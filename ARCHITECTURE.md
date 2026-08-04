# Architectuur

## Doel

ReisSlim 0.6 is een statische, GitHub Pages-compatibele PWA. De browser is de enige runtime; er zijn geen secrets, betaalde API's of servercomponenten. Domeinfuncties zijn deterministisch en zonder DOM testbaar.

## Lagen

1. **Configuratie en data** — `config.js` bevat versie, profielen en expliciete aannames; `destinations.js` bevat gecureerde bestemming-, corridor-, basis- en activiteitdata.
2. **Domein** — `trip-model.js`, `route-engine.js`, `destination-engine.js`, `itinerary-engine.js`, `budget-engine.js`, `trip-quality-engine.js`, `trip-optimizer.js` en `itinerary-validator.js` zijn pure of grotendeels pure modules.
3. **Infrastructuur** — `storage.js` verzorgt schema/migraties; `gpx-generator.js` en `map-view.js` vertalen hetzelfde planmodel naar exports en kaartpunten.
4. **Presentatie** — `ui-renderer.js` rendert ge-escapete HTML; `app.js` orkestreert state en events. `index.html` en `styles.css` definiëren de mobiele shell.
5. **PWA** — `manifest.webmanifest` en `service-worker.js` leveren installatiegegevens, versieverwijdering en offline shellgedrag.

## Stateflow

`TripRequest → ranking → destination → itinerary → budget → validation + quality → UI/export`

`app.js` bezit één actuele state. Alleen de invoer en bestemmingidentiteit zijn duurzaam gezaghebbend. Afgeleide plannen worden na migratie of herladen met de huidige engine opnieuw berekend, zodat een oude tekst of budgetformule niet blijft circuleren. Een optimalisatie bewaart één tijdelijke undo-snapshot.

## Planningscontract

- Elk gegenereerd plan heeft exact `trip.days` dagen.
- Dag 1 heeft `from === trip.origin`; de laatste dag heeft `to === trip.origin`.
- De vertrekplaats is nooit een verblijf- of activiteitdag.
- Rijdagen delen de indicatieve totale tijd over het benodigde aantal benen.
- Is de reis te kort, dan blijft de structuur compleet maar worden te lange benen zichtbaar gemarkeerd en is `plan.feasible === false`.
- Kaart en GPX lezen uitsluitend `plan.days[].toPoint` en dezelfde oorsprong.

## Providergrens voor v1.0

Een commerciële v1.0 kan adapters achter `route-engine.js` toevoegen:

- `GeocodingProvider.resolve(origin)`;
- `RoutingProvider.route(points, profile)`;
- `WeatherProvider.summary(region, dates)`;
- `PricingProvider.range(region, party, dates)`.

De UI en scoringslogica mogen geen provider aanroepen. Een kleine serverless gateway is dan nodig voor sleutelbescherming, caching, limieten en privacycontrole. Het huidige offline pad blijft als fallback en voor tests bestaan.
