# ReisSlim v1.4.6 — roadtrip planner

ReisSlim is a mobile-first roadtrip planning assistant. It plans from the **start location entered by the user** and plans road travel only.

## Current scope

- Roadtrips only.
- Start from any user-entered location that OpenStreetMap Nominatim can geocode, or from the browser's current-location coordinates.
- Live destination discovery from OpenStreetMap around that actual start point.
- Coverage is not restricted to a short fixed destination catalogue.
- Intended geographic coverage: **all of Europe, South Africa and Namibia**, subject to realistic road reach from the selected origin.
- Route types:
  - **Loop** — return using a substantially different corridor.
  - **Out and back** — return over the same route.
  - **Open ended** — finish at the destination instead of returning to the start.
- Car, motorcycle, motorhome and caravan planning.
- User preferences materially influence destination ranking.
- Named live restaurants, accommodation, activities, fuel and rest locations are used when available from OpenStreetMap.
- Selected named places are added to the map and GPX waypoints.
- Open-Meteo is used for weather enrichment.
- OSRM/OpenRouteService can provide live road routing where configured/available.

## Origin-based discovery

The old fixed destination catalogue and obsolete long-distance aviation test fixture have been removed.

A trip starting in Saasveld discovers roadtrip candidates outward from Saasveld. A trip starting in Cape Town discovers roadtrip candidates outward from Cape Town. A trip starting in Windhoek discovers candidates outward from Windhoek. ReisSlim does **not** insert a flight between Europe and southern Africa.

The practical search radius depends on trip duration, maximum driving time per day, vehicle and route topology.

## Data sources

ReisSlim can use:

- OpenStreetMap Nominatim — geocoding typed start/destination locations.
- OpenStreetMap Overpass — destination and named-place discovery.
- OSRM / OpenRouteService — road routing where available.
- Open-Meteo — weather.
- Google Maps links — convenient external review lookup for named places. ReisSlim does not invent consumer star ratings when no ratings API is connected.

## Important limitations

Cross-water roadtrips can require ferry-aware routing. ReisSlim must not assume a flight to bridge disconnected regions. Prices, availability, opening hours and review scores should be checked at the linked source.

## Release

**ReisSlim v1.4.6 · Build 1406**

This release specifically fixes deployment clarity: the ZIP now contains the actual `README.md` used by GitHub, not just a separate `README_UPDATE.txt`.
