# ReisSlim v1.1 architecture

## System boundary

ReisSlim is a flat-file, GitHub Pages-compatible PWA. `app.js` owns the current UI state; deterministic domain modules own planning decisions; optional providers only supply normalized evidence. There is one canonical itinerary and one canonical budget. No provider may silently replace user constraints or claim verification it cannot prove.

## Data flow

`TripRequest → origin geocoding → destination type/boundary resolution → provider anchors → geographic clustering → route graph → hard-constraint gate → evidence scoring/diversity → overnight/night solver → canonical days → provider enrichment → budget/readiness/quality → map + JSON + GPX`

Every selected plan must contain exactly the requested number of days, begin at the entered origin and end there unless a confirmed multi-modal open-jaw topology returns from another destination base. The home origin is never an activity or accommodation destination.

## Layers

1. **Request and migration** — `trip-model.js`, `storage.js`, `config.js` normalize schema 8 and rebuild stale derived plans and vehicle-specific recommendations.
2. **Constraint and proposal domain** — `constraint-engine.js`, `destination-engine.js`, `proposal-engine.js`, `preference-engine.js` separate feasibility from ranking and apply bounded local learning.
3. **Routing and itinerary** — `vehicle-intelligence.js`, `route-engine.js`, `route-graph-engine.js`, `route-topology.js`, `multimodal-engine.js`, `plan-solver.js`, `itinerary-engine.js` create graph nodes/edges, vehicle timings, omissions, return corridors and day schedules.
4. **Decision support** — `budget-engine.js`, `travel-readiness.js`, `trip-quality-engine.js`, `trip-optimizer.js`, `assistant-engine.js` produce uncertainty ranges, blockers, quality dimensions and previewable changes.
5. **Provider platform** — `provider-platform.js` defines envelopes, request budgets, timeouts, health and deduplication. Destination, route, place, weather and image adapters retain source, freshness, confidence and fallback state.
6. **Presentation/export** — `ui-renderer.js`, `map-view.js`, `gpx-generator.js` render escaped data from the canonical plan. `service-worker.js` provides the offline shell.

## Global discovery

`destination-provider.js` treats a typed destination as a provider-resolved geographic object rather than a centre-point string. Country and region bounds drive staged searches; evidence anchors are clustered by distance and constraints into regional concepts. Each provider batch is bounded for reliability, while the discovery cursor has no catalogue or coverage cap.

Production proposal generation has no catalogue import. Only an unexpired cache for the identical normalized request/provider/schema identity may be reused. Without it, failure is explicit and produces no proposals. Recorded country fixtures live only in tests.

`route-graph-engine.js` selects a feasible highlight subset deterministically. Edge elapsed time, accommodation churn and duration can remove a famous highlight; the canonical plan retains the omission reason and extra-day guidance.

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
