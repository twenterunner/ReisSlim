# ReisSlim v1.2 architecture

## System boundary

ReisSlim is a flat-file, GitHub Pages-compatible PWA. `app.js` owns the current UI state; deterministic domain modules own planning decisions; optional providers only supply normalized evidence. There is one canonical itinerary and one canonical budget. No provider may silently replace user constraints or claim verification it cannot prove.

## Data flow

`TripRequest → origin geocoding → destination type/boundary resolution → multi-scale sampling → significant anchors → regional clusters/corridors → candidate concepts → hard-constraint gate → deterministic graph search → night allocation → canonical days/segments → route-aware enrichment → budget/readiness/quality gate → map + JSON + GPX`

Every selected plan must contain exactly the requested number of days, begin at the entered origin and end there unless a confirmed multi-modal open-jaw topology returns from another destination base. The home origin is never an activity or accommodation destination.

## Layers

1. **Request and migration** — `trip-model.js`, `storage.js`, `config.js` normalize schema 9 and rebuild stale derived plans and vehicle-specific recommendations whenever schema 9 or engine 10 is not present.
2. **Constraint and proposal domain** — `constraint-engine.js`, `destination-engine.js`, `proposal-engine.js`, `preference-engine.js` separate feasibility from ranking and apply bounded local learning.
3. **Routing and itinerary** — `vehicle-intelligence.js`, `route-engine.js`, `route-graph-engine.js`, `route-topology.js`, `multimodal-engine.js`, `plan-solver.js`, `itinerary-engine.js` create graph nodes/edges, vehicle timings, omissions, return corridors, duration-scaled base targets and chronologically connected day schedules.
4. **Decision support** — `budget-engine.js`, `travel-readiness.js`, `trip-quality-engine.js`, `trip-optimizer.js`, `assistant-engine.js` produce uncertainty ranges, blockers, explicit route-quality dimensions and previewable structural changes.
5. **Provider platform** — `provider-platform.js` defines envelopes, request budgets, timeouts, health and deduplication. Destination, route, place, weather and image adapters retain source, freshness, confidence and fallback state.
6. **Presentation/export** — `ui-renderer.js`, `map-view.js`, `gpx-generator.js` render escaped data from the canonical plan. `service-worker.js` provides the offline shell.

## Global discovery

`destination-provider.js` treats a typed destination as a provider-resolved geographic object rather than a centre-point string. Country and region bounds drive multi-scale samples; significant gateways, protected areas, natural/cultural anchors and named settlements are retained with source evidence and clustered by distance, connectivity and constraints into regional concepts. Country-code and boundary evidence reject cross-border results. Each provider batch is bounded for reliability, while the discovery cursor has no catalogue or coverage cap.

Production proposal generation has no catalogue import. Only an unexpired cache for the identical normalized request/provider/schema identity may be reused. Without it, failure is explicit and produces no proposals. Recorded country fixtures live only in tests.

`route-graph-engine.js` uses deterministic constrained beam search to select a feasible base/highlight sequence. It rewards meaningful coverage, evidence, coherent progression, distinct experiences and vehicle fit, while penalizing backtracking, repeated corridors, ping-pong movement, weak micro-areas, accommodation churn and uncertainty. Edge elapsed time, changes and duration can remove a famous highlight; the canonical plan retains the omission reason and extra-day guidance.

## Trip scale, night allocation and quality gate

Trip scale is derived from destination type and bounds, duration, daily elapsed-time limit, topology, access mode, vehicle and maximum accommodation changes. A city break may remain at one base; a long country-level touring request receives multi-base coverage objectives when evidence permits. A plan that technically satisfies driving limits but collapses into a 20–50 km metropolitan loop fails the route-quality gate and cannot become a normal proposal.

Night allocation is chronological: every day begins at the previous overnight point, and every transfer has a canonical segment. Non-gateway bases are visited once unless the topology explicitly requires a gateway return. Stay days require distinct named evidence or a declared rest/logistics purpose; repeated filler activities are not generated.

`trip-quality-engine.js` scores coverage, base and night-allocation quality, coherence, backtracking, corridor repetition, POI uniqueness/evidence, accommodation evidence, touring-road quality, vehicle suitability, completeness and uncertainty. This score follows—and cannot override—the hard-constraint gate.

## Route topology and segments

Road plans represent every travel day as a canonical route segment with geometry, source, confidence and waypoints. Loop topology shifts the return corridor and calculates sampled geodesic overlap and an exploration score; out-and-back deliberately reuses the corridor. Live routing operates per segment and falls back independently. Day cards, selected map layers, POIs, accommodations and GPX consume these same segment/day identities.

Multi-modal access uses normalized segments with mode, direction, indicative duration, source, confidence, external search link and explicit `scheduleVerified`, `priceVerified` and `bookable` flags. ReisSlim never creates a flight number or live fare. Open-jaw is enabled only for multi-modal journeys with more than one destination base.

## Provider contract

A normalized provider result includes provider, provider object ID, status, coordinates/bounds, source link, fetch/fresh timestamps, attribution, confidence, cache state and warnings. Adapters use abortable timeouts, bounded concurrency, input validation, exact-request caching, endpoint failover and graceful partial degradation. Late responses are tied to the active discovery/enrichment run so stale vehicle, date or selected-proposal data cannot overwrite the canonical plan. Shared production keys belong behind a gateway; no secret may ship in the PWA.

## Budget, readiness and quality

`budget-engine.js` is the only total calculator. Visible rows sum exactly to the central total and are recalculated after structural plan mutations. Multi-modal travel adds international access, rental and baggage, with low/central/high ranges and low confidence until live prices are supplied.

Travel Readiness is a checklist, not legal or medical advice. Advice, entry and health items remain `verified: false` until an official integration confirms them. The quality model exposes 18 dimensions including completeness, exploration, vehicle suitability, safety, POI quality, booking and documents.

## Persistence and privacy

Only input, selected identities, locally learned evidence and safe user settings are authoritative. Storage schema 9 reads schema 8 and older keys, retains the normalized request and provider-backed destination identity, and forces a full rebuild under engine 10 rather than rendering stale route, vehicle, POI or accommodation data. Preference signals are bounded, require repeated evidence for ranking, are inspectable in export code, and stop updating in private mode. Geolocation requires explicit browser permission.

## Optimizer contract

An optimizer proposal must contain an exact before/after structural change set, affected days, score-component changes and remaining compromises. Supported mutations replace/add/remove/reorder bases, reallocate nights, replace repeated POIs or weak accommodation, change topology, shorten excessive travel and improve coverage/readiness. Applying one mutation reruns the canonical itinerary, segment list, provider enrichment, budget, quality, map and GPX. Text-only, no-op and negligible proposals are suppressed.
