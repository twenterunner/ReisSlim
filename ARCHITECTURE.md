# ReisSlim v1.0 architecture

## System boundary

ReisSlim is a flat-file, GitHub Pages-compatible PWA. `app.js` owns the current UI state; deterministic domain modules own planning decisions; optional providers only supply normalized evidence. There is one canonical itinerary and one canonical budget. No provider may silently replace user constraints or claim verification it cannot prove.

## Data flow

`TripRequest → origin normalization → staged discovery → hard-constraint gate → suitability scoring → MMR diversity → proposal variants → canonical itinerary → provider enrichment → budget/readiness/quality → map + JSON + GPX`

Every selected plan must contain exactly the requested number of days, begin at the entered origin and end there unless a confirmed multi-modal open-jaw topology returns from another destination base. The home origin is never an activity or accommodation destination.

## Layers

1. **Request and migration** — `trip-model.js`, `storage.js`, `config.js` normalize schema 7 and rebuild stale v0.x derived plans.
2. **Constraint and proposal domain** — `constraint-engine.js`, `destination-engine.js`, `proposal-engine.js`, `preference-engine.js` separate feasibility from ranking and apply bounded local learning.
3. **Routing and itinerary** — `vehicle-intelligence.js`, `route-engine.js`, `route-topology.js`, `multimodal-engine.js`, `plan-solver.js`, `itinerary-engine.js` create road and access segments, timings, alternate return corridors and day schedules.
4. **Decision support** — `budget-engine.js`, `travel-readiness.js`, `trip-quality-engine.js`, `trip-optimizer.js`, `assistant-engine.js` produce uncertainty ranges, blockers, quality dimensions and previewable changes.
5. **Provider platform** — `provider-platform.js` defines envelopes, request budgets, timeouts, health and deduplication. Destination, route, place, weather and image adapters retain source, freshness, confidence and fallback state.
6. **Presentation/export** — `ui-renderer.js`, `map-view.js`, `gpx-generator.js` render escaped data from the canonical plan. `service-worker.js` provides the offline shell.

## Global discovery

`destination-provider.js` generates deterministic golden-angle search points. Direct road trips use reach derived from daily travel constraints; multi-modal trips use global rings up to intercontinental scale. A typed destination is geocoded once and turns discovery into local staged searches around that point. Each user action issues one bounded Overpass batch, caches it, deduplicates it and advances the cursor. There is no global candidate cap, although each request has a strict size and timeout.

Curated destinations remain an offline fallback. The Namibia fixture verifies fly-drive/fly-camper, open-jaw, remote readiness and uncertainty behavior; it does not control global coverage.

## Route topology and segments

Road plans represent every day as geometry plus waypoints. Loop topology shifts the return corridor and calculates sampled geodesic overlap and an exploration score; out-and-back deliberately reuses the corridor. Live routing operates per road segment and falls back independently.

Multi-modal access uses normalized segments with mode, direction, indicative duration, source, confidence, external search link and explicit `scheduleVerified`, `priceVerified` and `bookable` flags. ReisSlim never creates a flight number or live fare. Open-jaw is enabled only for multi-modal journeys with more than one destination base.

## Provider contract

A normalized provider result includes provider, status, data, fetch/fresh timestamps, attribution, confidence, cache state and warnings. Adapters use abortable timeouts, input validation, local caching and graceful degradation. Shared production keys belong behind a gateway; no secret may ship in the PWA.

## Budget, readiness and quality

`budget-engine.js` is the only total calculator. Visible rows sum exactly to the central total. Multi-modal travel adds international access, rental and baggage, with low/central/high ranges and low confidence until live prices are supplied.

Travel Readiness is a checklist, not legal or medical advice. Advice, entry and health items remain `verified: false` until an official integration confirms them. The quality model exposes 18 dimensions including completeness, exploration, vehicle suitability, safety, POI quality, booking and documents.

## Persistence and privacy

Only input, selected identities, locally learned evidence and safe user settings are authoritative. Plans are rebuilt when the engine version changes. Preference signals are bounded, require repeated evidence for ranking, are inspectable in export code, and stop updating in private mode. Geolocation requires explicit browser permission.
