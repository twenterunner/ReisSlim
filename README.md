# ReisSlim 1.2.0 — route intelligence and structural optimization

ReisSlim is a mobile-first Dutch Progressive Web App that turns hard constraints into realistic road trips and multi-modal journeys. It supports direct trips by car, motorcycle, camper or caravan, plus fly-drive, fly-ride, fly-camper and train/ferry access. The deterministic planner works without a server; optional public data providers enrich destinations, routes, POIs, weather and open-license images.

## What v1.2 does

- accepts any typed origin or privacy-aware current location;
- resolves any typed city, region, country, island or bounded destination using provider identity, type and bounds;
- samples typed destination boundaries at multiple scales, discovers significant provider-backed gateways and anchors, and clusters them into feasible trip regions;
- keeps blank worldwide discovery usable through independent Photon settlement evidence and Wikipedia GeoSearch when Overpass is unavailable;
- cancels stale discovery runs so a slow Android response cannot overwrite a newer request;
- never uses a finite destination catalogue or unrelated fallback in the production proposal flow;
- creates a materially diverse portfolio when enough evidence satisfies the hard constraints, and explains when fewer concepts are supportable;
- permits at most two clearly labelled, bounded stretch ideas;
- supports loops with a different return corridor, out-and-back routes and multi-modal open-jaw trips;
- models flight/train/ferry and rental segments without inventing schedules, fares, bookability or availability;
- applies distinct motorcycle pace, rest, fuel and road-evidence logic alongside car, camper and caravan requirements;
- derives a duration- and boundary-aware trip scale, then uses deterministic constrained graph search to select bases, allocate nights and connect every day chronologically;
- rejects long country trips that collapse into a weak urban micro-loop, repeat a corridor, ping-pong between bases or fill nights with duplicate activities;
- discovers route- and base-aware named OpenStreetMap POIs and accommodations where evidence exists, with generic categories clearly labelled as unverified fallback search areas;
- shows Open-Meteo weather with local symbols and vehicle-aware suitability;
- provides low, central and high budget estimates, including international transport, rental and baggage;
- exports daily GPX tracks and waypoints from the same geometry used on the map;
- includes a Travel Readiness dashboard with official source links and explicit unverified states;
- learns bounded preferences locally, supports private mode and never silently applies conversational changes;
- builds a constrained highlight/overnight graph, explains omissions and renders selectable route layers plus associated POIs and accommodation per travel day;
- scores geographic coverage, base quality, route coherence, backtracking, corridor repetition, POI uniqueness/evidence, accommodation evidence, vehicle fit, completeness and uncertainty separately from the hard-constraint gate;
- applies only structural optimizer mutations and rebuilds the itinerary, route segments, budget, recommendations, map and GPX from the same canonical plan;
- migrates older saved trips to schema 9 / engine 10 and rebuilds stale derived data with the current vehicle profile.

Namibia, South Africa and European self-drive cases exist only as recorded provider-shaped acceptance fixtures. They are not imported by production modules and do not control worldwide coverage.

The v1.1 failure was architectural: the first successful local provider cluster could be treated as a complete country concept, night allocation could extend that weak cluster to the requested duration, and optimizer score changes did not always imply a different canonical route. Version 1.2 separates evidence discovery from trip-scale validation, quality-gates the solved route, and suppresses any optimization without a measurable structural mutation.

## Run locally

No build step or npm install is required. ES modules need a static web server:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`. On Android, GitHub Pages or a Codespaces forwarded port provides the same static app. Direct `file://` opening is not supported.

## Test

Node.js 20+ is sufficient:

```bash
npm run check
```

This runs syntax, unit, integration, migration, GPX, static-server and PWA checks. See [TESTING.md](TESTING.md).

## Providers, privacy and trust

Dynamic proposal generation uses Nominatim and Overpass without a bundled API key. OSRM/OpenRouteService, Open-Meteo and Wikimedia Commons enrich the selected plan. If discovery fails and no exact-request cache exists, ReisSlim shows no unrelated trips. A personal OpenRouteService key is stored separately in the browser and is never included in saved-trip JSON or source control. See [API_SOURCES.md](API_SOURCES.md).

Trips, dismissed/saved proposals and preference evidence stay in browser `localStorage`. Private mode disables new learning. Current-location coordinates are only used after explicit browser permission. See [PERSONALIZATION.md](PERSONALIZATION.md).

ReisSlim is planning and decision support. It does not claim live inventory, confirmed prices, a booked connection, legal entry eligibility, medical clearance or route safety. Official advice, documents, opening times, vehicle restrictions, weather and booking conditions must be confirmed at the linked source.

## GitHub Pages

Publish the repository root through **Settings → Pages → Deploy from a branch**. All paths are project-site relative, and the v1.2 service worker caches only the flat dynamic runtime shell; the former `destinations.js` catalogue has been removed.

## Architecture

The domain is provider-independent and uses one canonical itinerary, budget and export model. Derived state is rebuilt after migrations. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CHANGELOG.md](CHANGELOG.md).
