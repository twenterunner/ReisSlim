# ReisSlim 1.3.0 — catalogue-first touring planner

ReisSlim is a mobile-first Dutch Progressive Web App that turns hard constraints into realistic road trips. Version 1.3 uses a versioned, source-backed touring catalogue for South Africa, Namibia and every European country, including microstates and Kosovo. A useful itinerary no longer depends on public discovery APIs being available.

## What v1.3 does

- resolves country names, aliases and ISO codes against a flat catalogue manifest;
- loads the requested `catalog-xx.js` pack plus only the packs sampled for named direct-trip transit nights, and caches them on demand;
- keeps country packs out of the application-shell precache;
- builds three to six deterministic regional touring concepts when the evidence and constraints permit;
- uses a generic constrained graph solver—country packs provide evidence, never pre-authored itineraries;
- selects meaningful gateways and overnight bases, allocates nights chronologically and prevents filler days, repeated POIs and A→B→A→B routes;
- produces structurally different car and motorcycle plans, including separate elapsed-time, rest, fuel, road and parking treatment;
- prefers named, sourced POIs, restaurants, accommodations and services from the selected pack;
- labels static candidates honestly: prices, availability, opening hours, road conditions and parking security remain unverified unless live evidence confirms them;
- lets optional OSRM/OpenRouteService, Open-Meteo and Wikimedia Commons data enrich—not enable—the plan;
- uses one canonical plan for day cards, map routes, recommendations, budget, optimizer, JSON and GPX;
- sums canonical road-day mileage in the budget and displays the unsourced generic nightly/activity priors, uncertainty range and limited confidence instead of presenting static candidates as current prices;
- keeps the Leaflet map runtime in flat, locally cached files so the map UI starts without a CDN;
- migrates older saved trips to compact storage-schema 10 / engine 11 snapshots and rebuilds derived vehicle-specific state without retaining stale plans.

The catalogue is generated at development time from legally reusable source records. It is not a hand-written collection of model guesses. Its manifest records the country, generation date, source versions and record counts; unknown attributes stay unknown. South Africa, Namibia and European acceptance cases exercise the same runtime solver and do not have country-specific itinerary functions. GeoNames base-pack generation plus exact, pinned Overture Places/Transportation extraction, normalization and merge form the release build; cached OpenStreetMap enrichment remains optional. Release reports separate full route-backed corridors from endpoint-only road context, which retains fallback geometry and unknown route condition. Direct cross-border trips use named locator anchors and source-backed recommendations from lazily loaded transit packs, while continuing to label the route and detour as estimated until a live routing provider confirms them. The reproducible workflow and strict evidence gates are documented in [CATALOG_BUILD.md](CATALOG_BUILD.md) and [API_SOURCES.md](API_SOURCES.md).

## Run locally

No build step is required. ES modules need a static web server:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`. Direct `file://` opening is not supported. Android can use GitHub Pages or a forwarded Codespaces port.

## Test

Node.js 20+ is sufficient:

```bash
npm run check
```

This runs syntax, catalogue integrity, unit/integration, migration, canonical map/GPX, static-server and PWA checks. See [TESTING.md](TESTING.md).

## Sources, privacy and trust

The bundled catalogue is generated from source-backed open data described in [API_SOURCES.md](API_SOURCES.md). Catalogue-record licensing and attribution are documented separately in [CATALOG_DATA_NOTICE.md](CATALOG_DATA_NOTICE.md); that data notice does not change the licence of the application code. Live geocoding, routes, places, weather and imagery are optional enrichments. A personal OpenRouteService key is stored separately in the browser and is never included in source control or saved-trip JSON.

Trips, saved/dismissed proposals and preference evidence stay in browser `localStorage`. Private mode disables new learning. Current-location coordinates are used only after explicit browser permission. See [PERSONALIZATION.md](PERSONALIZATION.md).

ReisSlim is planning support. It does not claim live inventory, confirmed prices, current opening, a booked connection, legal entry eligibility, medical clearance or route safety. Confirm official advice, vehicle restrictions, weather, road status, parking and booking conditions at the linked sources.

## GitHub Pages

Publish the repository root through **Settings → Pages → Deploy from a branch**. All browser runtime files remain flat and project-site relative. The v1.3 service worker precaches only the application shell; loaded country packs are runtime-cached for later offline use.

## Architecture

The deterministic domain uses one canonical itinerary, budget and export model. Catalogue knowledge, optional provider evidence and UI state stay separated, and derived state is rebuilt after migrations or vehicle changes. See [ARCHITECTURE.md](ARCHITECTURE.md), [CATALOG_COVERAGE.md](CATALOG_COVERAGE.md), [CATALOG_DATA_QUALITY.md](CATALOG_DATA_QUALITY.md) and [CHANGELOG.md](CHANGELOG.md).
