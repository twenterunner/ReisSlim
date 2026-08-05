# ReisSlim v1.3 architecture

## System boundary

ReisSlim is a flat-file, GitHub Pages-compatible PWA. `app.js` owns transient UI state; deterministic domain modules own planning decisions; catalogue modules supply versioned evidence; optional providers can only enrich that evidence. There is one canonical itinerary and one canonical budget. No source may silently relax hard constraints or claim verification it cannot prove.

## Data flow

`TripRequest → country resolution → lazy country-pack load → evidence anchors and corridors → regional concepts → hard-constraint gate → constrained graph search → night allocation → canonical days and segments → named recommendations → optional live enrichment → budget/readiness/quality → map + optimizer + JSON + GPX`

Every selected plan contains the requested number of days, starts each day at the previous overnight location and returns to the entered origin unless an explicit supported topology says otherwise. The home origin is never rendered as a destination activity or accommodation.

## Layers

1. **Request and migration** — `trip-model.js`, `storage.js` and `config.js` normalize compact schema-10 snapshots and rebuild stale derived plans under engine 11.
2. **Catalogue knowledge** — the compact `catalog-locator.js` resolves source-derived country/city/region names without loading every pack; `catalog-index.js` then dynamically imports only the required flat `catalog-xx.js` pack. The pack schema retains anchors, recommendations, corridors, provenance, licence, generation date and honest unknown values.
3. **Catalogue adapter** — `catalog-runtime.js` turns a selected pack into generic destination profiles and attaches named pack evidence to canonical days. It contains no country-specific itinerary functions.
4. **Constraint and proposal domain** — `constraint-engine.js`, `destination-engine.js`, `proposal-engine.js` and `preference-engine.js` separate feasibility from ranking and diversity.
5. **Routing and itinerary** — `vehicle-intelligence.js`, `route-engine.js`, `route-graph-engine.js`, `route-topology.js`, `plan-solver.js` and `itinerary-engine.js` solve base sequences, vehicle timings, omissions and chronologically connected days.
6. **Decision support** — `budget-engine.js`, `travel-readiness.js`, `trip-quality-engine.js`, `trip-optimizer.js` and `assistant-engine.js` calculate uncertainty ranges, blockers, quality dimensions and structural plan mutations.
7. **Optional providers** — normalized geocoding, route, place, weather and image adapters add freshness and geometry without becoming a prerequisite for proposal generation.
8. **Presentation/export** — `ui-renderer.js`, `map-view.js` and `gpx-generator.js` render the same escaped canonical plan. `service-worker.js` provides the offline shell and on-demand country-pack cache.

## Country-pack contract

Each manifest record declares an ISO code, display name, aliases, data/schema version, generation date, sources and record counts. Each anchor has a stable ReisSlim ID, country code, real name, coordinates, role, significance, vehicle-fit evidence, provenance and last-checked date. Missing season, surface, access, parking or suitability evidence remains `null` or explicitly unknown.

Named recommendations belong to a specific base and retain provider identity, coordinates, source URL, confidence and unverified status. Corridor records connect anchors and may retain distance, vehicle-specific timing, surface/road evidence, service spacing and fallback geometry. The generic runtime can use incomplete evidence but lowers confidence; it never fabricates the missing field.

## Loading and offline behavior

`catalog-index.js` uses dynamic imports. The loader, compact locator and catalogue runtime are part of the PWA shell; the full country packs are not. A destination pack is fetched when that country is requested. For a direct cross-border journey, the runtime samples the same estimated access corridor used to create transit days and loads only the additional packs needed for those named transit nights. Those packs can provide source-backed accommodation and service candidates without being copied into the canonical saved plan. The service worker stores requested packs for same-origin offline reuse; the full European catalogue is never downloaded at startup. Leaflet 1.9.4 and its default marker assets are also vendored as flat, precached files, with the upstream BSD-2-Clause licence retained in `LEAFLET_LICENSE.txt`.

An unsupported destination is reported explicitly; no unrelated country is substituted. A previously loaded or saved pack/plan can be rebuilt offline. Public provider failure does not block catalogue planning.

## Generic solver and trip scale

The selected pack becomes a graph of gateways, bases, highlights, services and corridors. Deterministic constrained search rewards significance, preference fit, coherent progress, multi-night stays with distinct evidence, scenic/touring value, named evidence and vehicle suitability. It penalizes weak suburban bases, excessive driving, backtracking, repeated corridors, ping-pong, filler days, accommodation churn, uncertain access and missing service coverage.

Trip scale is derived from duration, daily elapsed-time limit, topology, access mode, vehicle and maximum accommodation changes. A short city break can use one base; a long country tour should use several meaningful bases when the pack supports them. Hard constraints gate the plan before quality ranking and cannot be compensated by a high score.

## Vehicle separation

Vehicle identity is normalized once. Car planning rewards practical access, parking and coherent elapsed time and cannot display motorcycle wording. Motorcycle planning recalculates elapsed time, rests, fuel range, road/touring evidence, remoteness, daylight arrival and parking uncertainty. A secure/covered-parking statement requires explicit evidence; otherwise the UI states that motorcycle parking security is not verified.

Changing vehicle rebuilds concepts, route, timing, rests, recommendations, budget, readiness, map, JSON and GPX. Run IDs prevent late live responses from restoring stale vehicle or proposal state.

## Canonical plan and optimizer

Every travel day owns one canonical segment with geometry, source, confidence and waypoints. Day cards, map layers, overnight/POI/accommodation markers and GPX consume those same identities. `budget-engine.js` remains the only total calculator.

Optimizer proposals must make structural canonical-plan changes—such as replacing/reordering a base, reallocating nights, removing repetition, shortening a segment or improving service readiness—and then recalculate all derived outputs. Text-only, no-op and negligible proposals are suppressed.

## Generation boundary

Development-time scripts retrieve/cache permitted open-source data, normalize boundaries and records, deduplicate, validate, rank anchors, create adjacency evidence and emit the flat packs plus a coverage report. The generated packs are committed; source downloads are not required at runtime. Bulk regeneration must follow the official source licences and usage policies in [API_SOURCES.md](API_SOURCES.md).
