# ReisSlim 1.0.0 — global intelligent travel assistant

ReisSlim is a mobile-first Dutch Progressive Web App that turns hard constraints into realistic road trips and multi-modal journeys. It supports direct trips by car, motorcycle, camper or caravan, plus fly-drive, fly-ride, fly-camper and train/ferry access. The deterministic planner works without a server; optional public data providers enrich destinations, routes, POIs, weather and open-license images.

## What v1.0 does

- accepts any typed origin or privacy-aware current location;
- discovers destinations in staged global batches instead of a finite region list;
- uses a curated catalog only as an offline fallback and regression fixture;
- creates 6–12 diverse proposals when enough candidates satisfy the hard constraints;
- permits at most two clearly labelled, bounded stretch ideas;
- supports loops with a different return corridor, out-and-back routes and multi-modal open-jaw trips;
- models flight/train/ferry and rental segments without inventing schedules, fares, bookability or availability;
- applies motorcycle pace and rest logic, camper/caravan dimensions and remote-route checks;
- proposes route stops, accommodation categories, restaurants, activities, fuel and service locations, then replaces them with named OpenStreetMap places when available;
- shows Open-Meteo weather with local symbols and vehicle-aware suitability;
- provides low, central and high budget estimates, including international transport, rental and baggage;
- exports daily GPX tracks and waypoints from the same geometry used on the map;
- includes a Travel Readiness dashboard with official source links and explicit unverified states;
- learns bounded preferences locally, supports private mode and never silently applies conversational changes;
- migrates v0.x saved trips to schema 7 and rebuilds stale derived plans.

Namibia is an explicit fixture for testing fly-drive/fly-camper, remote readiness, multi-region planning and budget uncertainty. It is not a static template system: arbitrary destinations are still discovered dynamically.

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

The offline planner never needs an API key. Optional live data uses Nominatim, Overpass, OSRM/OpenRouteService, Open-Meteo and Wikimedia Commons. A personal OpenRouteService key is stored separately in the browser and is never included in saved-trip JSON or source control. See [API_SOURCES.md](API_SOURCES.md).

Trips, dismissed/saved proposals and preference evidence stay in browser `localStorage`. Private mode disables new learning. Current-location coordinates are only used after explicit browser permission. See [PERSONALIZATION.md](PERSONALIZATION.md).

ReisSlim is planning and decision support. It does not claim live inventory, confirmed prices, a booked connection, legal entry eligibility, medical clearance or route safety. Official advice, documents, opening times, vehicle restrictions, weather and booking conditions must be confirmed at the linked source.

## GitHub Pages

Publish the repository root through **Settings → Pages → Deploy from a branch**. All paths are project-site relative, and the v1.0 service worker caches the complete flat runtime shell.

## Architecture

The domain is provider-independent and uses one canonical itinerary, budget and export model. Derived state is rebuilt after migrations. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CHANGELOG.md](CHANGELOG.md).
