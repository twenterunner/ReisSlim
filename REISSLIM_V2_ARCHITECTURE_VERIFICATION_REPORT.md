# ReisSlim 2.0.0 — Offline-first canonical planning architecture & verification report

**Build:** 2000  
**Engine:** 200  
**Storage schema:** 8  
**Dataset:** 2026.08.31.1  
**Baseline:** current `twenterunner/ReisSlim` `main` inspected before implementation.

## Acceptance status

The implementation, dataset, production modules, service-worker logic, provider failure handling, map model, GPX generation, storage serialization, EU/SA/Namibia coverage tests and performance tests pass in the available execution environment. **This report does not label the release “production ready” or claim full browser verification**, because Chromium navigation is blocked by the execution environment with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The exact limitation and attempted browser paths are documented below.

## Root cause in the previous architecture

The previous runtime had the dependency direction backwards for the requested reliability target. `app.js` simultaneously imported destination discovery, legacy itinerary construction, itinerary variants, optimizer paths, roadtrip policy selection, routing, POI gap filling and accommodation discovery. As a result, discovery/enrichment layers could participate in whether a structurally useful trip existed. The existing “canonical” engine also generated synthetic transit/local exploration coordinates. A second independent defect was version skew: the baseline configuration reported v1.16.4/build 1954 while `index.html` still loaded build-1923 assets and displayed an older footer build. This created both structural-authority ambiguity and stale-runtime risk.

The new dependency direction is:

`VERSIONED OFFLINE TRAVEL KNOWLEDGE → createCanonicalPlan() → AUTHORITATIVE VALIDATOR → IMMEDIATE UI/MAP/GPX → TRANSACTIONAL LIVE ENRICHMENT → VALIDATOR → STORAGE/RESTORE`

No live destination, POI or accommodation provider is needed to create the trip.

## Single structural planning authority

`canonical-plan-engine.js::createCanonicalPlan()` is the only exported structural planning authority. An automated source architecture test fails if another top-level runtime JS file exports `createCanonicalPlan`, if the new app imports a legacy structural module, or if any of the disabled structural modules cease to be explicit stubs.

| Baseline module/path | Previous role | Release state | Reason |
|---|---|---|---|
| `app.js` | Orchestrated destination discovery, itinerary/variant generation, optimization, routing and live rebuilds. | **REPLACED** | New app calls createCanonicalPlan once, renders it immediately, then enrichment only. |
| `canonical-trip-engine.js` | Created itinerary days and synthetic transit/local exploration points. | **DISABLED STUB** | Competing structural authority and synthetic-place behavior removed. |
| `itinerary-engine.js` | Created travel/stay/transfer days and generated exploration nodes. | **DISABLED STUB** | Competing structural authority removed. |
| `itinerary-variants.js` | Built alternate itinerary structures. | **DISABLED STUB** | Variants may not independently rebuild canonical structure. |
| `plan-solver.js` | Allocated travel/stay days. | **DISABLED STUB** | Day allocation belongs only to canonical-plan-engine.js. |
| `roadtrip-policy.js` | Selected bases/overnights/daytrips and validated roadtrip topology. | **DISABLED STUB** | Structural policy folded into canonical engine/validator. |
| `trip-optimizer.js` | Applied plan optimizations capable of changing structure. | **DISABLED STUB** | Downstream optimization may not mutate structure. |
| `proposal-engine.js` | Built proposal portfolio feeding alternate planning paths. | **DISABLED STUB** | Destination selection is offline-catalog search, not a structural planner. |
| `route-topology.js` | Built alternate return/exploration route structures. | **DISABLED STUB** | Topology is interpreted only by canonical engine; routing only improves geometry. |
| `routing-provider.js / routing-provider-1914.js` | Live route enrichment. | **NOT LOADED** | Replaced by enrichment.js transactional routing; cannot create/delete days. |
| `poi-gap-filler.js` | Added missing POIs to days. | **NOT LOADED** | Offline POIs are canonical; live POIs only append verified candidates. |
| `overnight-accommodation*.js / regional-overnight-provider.js` | Discovered specific stays/overnight candidates. | **NOT LOADED** | Specific properties enrich canonical accommodation zones only. |
| `release-sync-* / runtime-source-repair-* / ui-hotfix-*` | Historical runtime overlays/repairs. | **NOT LOADED** | New index.html loads only app.js?v=2000; static architecture guard rejects their reintroduction into bootstrap. |

## CanonicalPlan contract and hard invariants

The canonical plan owns day count, origin, destination identity, topology, structural day sequence, canonical overnight-zone sequence and day endpoints. Downstream layers receive a clone, produce a candidate, and commit only if `validateCanonicalPlan()` passes. The canonical structural signature is preserved across enrichment.

The authoritative validator checks: exact day count; sequence and duplicate days; origin and closed-trip endpoint; requested destination visitation; endpoint and drawable geometry; day continuity; maximum daily drive time; daytrip return-to-base and actual departure from base; POI coordinates; exact overnight count/state/zone identity; accommodation-change calculation and limit; vehicle suitability; regional fuel-gap/range constraint; budget; offline POI retention; image identity; canonical signature; live-route geometry; **derived map consistency; and derived GPX consistency**.

## Offline travel data architecture

Runtime totals: **29 countries, 203 regions, 409 offline POIs, 203 scenic-road anchors, 351 indexed bases/transit settlements and 351 accommodation zones**.

Files are partitioned as `data-index.json`, `data-metadata.json`, and `data-country-<ISO>.json`. `data-index.json` contains compact country/region summaries, origin places and the spatial base/transit index. Full country POIs are lazy-loaded only when their partition is needed. The service worker precaches all 29 flat country data files, so lazy loading reduces runtime parsing/memory while remaining available offline after installation.

Destination search uses a token + prefix index rather than repeated global scans. Transit lookup uses a 2-degree spatial grid over the compact base index. This keeps destination/POI query cost bounded as the catalogue grows.

### Data provenance and update procedure

The shipped dataset is generated from `tool-seed-catalog.json`, which contains curated stable real-world region/base/POI/scenic-anchor names and coordinates. `tool-generate-dataset.mjs` performs normalization, ID generation, country flat country-file generation, accommodation-zone generation, region/base indexing and dataset version stamping. `tool-validate-dataset.mjs` performs country coverage, uniqueness, coordinate validity, country-bounding-box checks and required-region checks. `tool-import-geonames.mjs` supports reconciliation/import from official GeoNames country dump files. Runtime never regenerates the catalogue online.

Update sequence: (1) obtain/reconcile source geography outside runtime; (2) update the curated seed using genuine named entities; (3) increment dataset version; (4) run `npm run generate:data`; (5) run `npm run validate:data`; (6) run the complete test/benchmark suite; (7) update service-worker build/cache when runtime data changes; (8) package only after the exact files pass.

**Data verification limitation:** every coordinate is validated numerically and against its country bounding box and the required named coverage is tested. The available environment did not permit a live bulk OSM/GeoNames/Wikidata reconciliation of every packaged coordinate. Therefore this report does not claim independent live-source verification of every row.

## EU-27 coverage matrix

| Country | Regions | POIs | Scenic anchors | Accommodation zones | Offline trip | Provider outage | Result |
|---|---:|---:|---:|---:|---|---|---|
| AT | 6 | 12 | 6 | 9 | PASS | PASS | **PASS** |
| BE | 5 | 10 | 5 | 6 | PASS | PASS | **PASS** |
| BG | 5 | 10 | 5 | 7 | PASS | PASS | **PASS** |
| CY | 5 | 10 | 5 | 7 | PASS | PASS | **PASS** |
| CZ | 5 | 10 | 5 | 8 | PASS | PASS | **PASS** |
| DE | 11 | 25 | 11 | 15 | PASS | PASS | **PASS** |
| DK | 5 | 10 | 5 | 6 | PASS | PASS | **PASS** |
| EE | 4 | 8 | 4 | 5 | PASS | PASS | **PASS** |
| ES | 11 | 22 | 11 | 16 | PASS | PASS | **PASS** |
| FI | 5 | 10 | 5 | 6 | PASS | PASS | **PASS** |
| FR | 12 | 24 | 12 | 16 | PASS | PASS | **PASS** |
| GR | 6 | 12 | 6 | 9 | PASS | PASS | **PASS** |
| HR | 6 | 12 | 6 | 10 | PASS | PASS | **PASS** |
| HU | 5 | 10 | 5 | 7 | PASS | PASS | **PASS** |
| IE | 6 | 12 | 6 | 6 | PASS | PASS | **PASS** |
| IT | 11 | 22 | 11 | 18 | PASS | PASS | **PASS** |
| LT | 4 | 8 | 4 | 7 | PASS | PASS | **PASS** |
| LU | 4 | 8 | 4 | 6 | PASS | PASS | **PASS** |
| LV | 4 | 8 | 4 | 6 | PASS | PASS | **PASS** |
| MT | 4 | 8 | 4 | 5 | PASS | PASS | **PASS** |
| NL | 6 | 12 | 6 | 10 | PASS | PASS | **PASS** |
| PL | 6 | 12 | 6 | 8 | PASS | PASS | **PASS** |
| PT | 6 | 12 | 6 | 10 | PASS | PASS | **PASS** |
| RO | 6 | 12 | 6 | 9 | PASS | PASS | **PASS** |
| SE | 6 | 12 | 6 | 9 | PASS | PASS | **PASS** |
| SI | 6 | 12 | 6 | 8 | PASS | PASS | **PASS** |
| SK | 5 | 10 | 5 | 6 | PASS | PASS | **PASS** |

Large-country required-region checks additionally enforce Germany (Harz, Eifel, Sauerland, Black Forest, Moselle, Bavarian Alps, Saxon Switzerland, North Sea, Baltic), France (Alps, Vosges, Jura, Provence, Normandy, Brittany, Pyrenees, Loire, Dordogne, Massif Central), Italy (Dolomites, Italian Lakes, Tuscany, Umbria, Liguria, Abruzzo, Sicily, Sardinia) and Spain (Pyrenees, Picos, Galicia, Basque, Andalusia, Sierra Nevada, Costa Brava). Malta and Cyprus are tested using canonical multimodal/ferry access rather than pretending they are continuously drivable from mainland Europe.

## South Africa coverage and tests

South Africa partition: **20 regions, 40 POIs, 28 accommodation zones**. Regions include: Cape Town, Cape Peninsula, Cape Winelands, Overberg, Garden Route, Cederberg, West Coast, Great Karoo, Little Karoo, Northern Drakensberg, KwaZulu-Natal Coast, KwaZulu-Natal Midlands, Kruger & Lowveld, Panorama Route, Mpumalanga Highlands, Gqeberha & Eastern Cape, Wild Coast, Addo Region, Eastern Free State, Free State Highlands.

Executed origins/destinations include Cape Town→Garden Route/Cederberg/Winelands/Overberg, Johannesburg→Northern Drakensberg, Pretoria→Kruger & Lowveld, Durban→KwaZulu-Natal Midlands and Gqeberha→Addo. Cape Town 5-day and 10-day provider-outage plans are also executed.

## Namibia coverage and tests

Namibia partition: **18 regions, 36 POIs, 18 accommodation zones**. Regions include: Windhoek, Swakopmund, Walvis Bay, Skeleton Coast, Sossusvlei & Sesriem, Namib-Naukluft, Etosha, Damaraland, Spitzkoppe, Brandberg, Waterberg, Lüderitz, Kolmanskop, Fish River Canyon, Keetmanshoop & Quiver Tree, Zambezi Region, Kavango Region, Kaokoland South.

Namibia data carries road character, remoteness and fuel-gap metadata. Tests explicitly cover Windhoek, Sossusvlei/Sesriem, Swakopmund, Etosha, Damaraland, Fish River Canyon and Zambezi, including minimum-fuel-range rejection, maximum-range acceptance and complete live-provider outage.

## Accommodation architecture

Every required night is one of exactly two states: `SPECIFIC_LIVE_ACCOMMODATION` or `PLANNED_ACCOMMODATION_ZONE`. Offline construction always creates `days - 1` represented nights. Live property matching preserves `canonicalZoneId`, coordinates, provider source and night number. If no property is verified, the zone remains visible and now carries a targeted OpenStreetMap accommodation-search link. Live Overpass lookup respects the selected accommodation type (`camping`, `hotel-bnb`, or `any`). Provider failure is never interpreted as “no accommodation exists”.

## Live providers and transactional responsibilities

| Layer | Responsibility | Structural authority? | Failure behavior |
|---|---|---|---|
| Routing | OSRM road geometry/distance/time; loop return requests alternatives where available | No | Keep estimated canonical geometry/time/day |
| POIs | Overpass extra named POIs | No | Keep all offline POIs |
| Accommodation | Overpass named property inside canonical zone | No | Keep planned zone + search link |
| Weather | Open-Meteo annotation | No | Mark unavailable |
| Images | Wikimedia candidate with destination lexical identity check | No | Neutral destination placeholder |

Every stage mutates a clone and is committed only after the authoritative validator accepts it. Conflicting live route endpoints, malformed properties and invalid POIs are discarded.

## Implemented-limit testing

| Input | Implemented range tested |
|---|---|
| `days` | 1–60 step 1: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `budget` | €500–€100,000 step €100: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `adults` | 1–8: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `children` | 0–8: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `maxDrive` | 2–10 h step 0.5: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `maxChanges` | 0–20: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `fuelRangeKm` | 100–1500 km step 10: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `vehicleMaxSpeedKmh` | 60–130 km/h step 5: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `vehicleHeightM` | 1.8–4.5 m step .05: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `vehicleLengthM` | 4–20 m step .1: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |
| `vehicleWeightKg` | 1500–20000 kg step 50: minimum, minimum+step, typical, maximum-step, maximum, below-minimum and above-maximum |

All enum values are executed for transport, trip structure, topology, pace, accommodation type, comfort and route style. All ten preference categories and priority weights 0–3 are tested. Month/year/leap-date transitions, long-distance/low-day coupling, fuel extremes, island geography and unresolved/extreme origins are included.

## Provider failure matrix

- **A: PASS** — all controlled providers healthy.
- **B: PASS** — routing unavailable.
- **C: PASS** — POI unavailable.
- **D: PASS** — accommodation unavailable.
- **E: PASS** — weather unavailable.
- **F: PASS** — images unavailable.
- **G: PASS** — all non-routing unavailable.
- **H: PASS** — ALL live services unavailable.
- **I: PASS** — partial/malformed POI response.
- **J: PASS** — timeouts.
- **K: PASS** — malformed accommodation data.
- **L: PASS** — live route conflicts with canonical endpoints.
- **M: PASS** — only some nights receive live accommodation.
- **N: PASS** — only some live POIs available.
- **P: PASS** — fully enriched restoration.
- **S: PASS** — enriched GPX consistency.

Complete outage H result: 5 days, 4 nights, 5 retained offline POIs, route status `estimated`, all night states `PLANNED_ACCOMMODATION_ZONE`, map PASS, GPX PASS, validator PASS.

## Required regression cases

| Case | Result | Days | Nights | Changes | Max drive | Map | GPX |
|---|---|---:|---:|---:|---:|---|---|
| CASE A Harz base | **PASS** | 5 | 4 | 0 | 4.78 h | PASS | PASS |
| CASE B Harz moving | **PASS** | 5 | 4 | 2 | 4.78 h | PASS | PASS |
| CASE C Dinant | **PASS** | 4 | 3 | 2 | 2.54 h | PASS | PASS |
| CASE D Cape Town 5 | **PASS** | 5 | 4 | 0 | 0.99 h | PASS | PASS |
| CASE E Cape Town 10 | **PASS** | 10 | 9 | 2 | 4.02 h | PASS | PASS |
| CASE F Namibia 5 | **PASS** | 5 | 4 | 0 | 6.12 h | PASS | PASS |
| CASE G Namibia 10 | **PASS** | 10 | 9 | 2 | 5.64 h | PASS | PASS |
| CASE H 1-day | **PASS** | 1 | 0 | 0 | 1.77 h | PASS | PASS |
| CASE I 60-day | **PASS** | 60 | 59 | 0 | 4.78 h | PASS | PASS |
| CASE J multi-transit | **PASS** | 12 | 11 | 10 | 4.67 h | PASS | PASS |

### Exact Harz hard case

Saasveld → Harz, 5 days, motorcycle, slimme uitvalsbasis, 5 h/day, max 5 changes: **PASS in production modules**. Result = 5 days, 4 nights, 0 accommodation changes, longest estimated day 4.78 h. Offline POIs include Torfhaus, Goslar, Brocken, Oderteich, Rappbode Dam. Local days leave and return to the canonical Harz base; all nights remain represented in total-provider-outage mode; map and GPX consistency pass.

- **CASE D Cape Town 5: PASS** — 5 days, 4 nights, 0 changes, max estimated drive 0.99 h, validator/map/GPX PASS.
- **CASE E Cape Town 10: PASS** — 10 days, 9 nights, 2 changes, max estimated drive 4.02 h, validator/map/GPX PASS.
- **CASE F Namibia 5: PASS** — 5 days, 4 nights, 0 changes, max estimated drive 6.12 h, validator/map/GPX PASS.
- **CASE G Namibia 10: PASS** — 10 days, 9 nights, 2 changes, max estimated drive 5.64 h, validator/map/GPX PASS.

## Performance

Synthetic scale rows are clones of genuine catalogue rows solely to exercise the **production indexing/query/planning functions** at future scale; no separate benchmark implementation stands in for runtime code. Times below are local CPU wall-clock milliseconds.

| Workload | p50 | p95 | p99 |
|---|---:|---:|---:|
| Destination search — 100 regions | 0.02 | 0.18 | 0.9 |
| Destination search — 1000 regions | 0.247 | 0.824 | 1.763 |
| Destination search — 5000 regions | 1.433 | 3.358 | 5.186 |
| Spatial POI lookup — 10000 POIs | 0.12 | 1.032 | 2.67 |
| Spatial POI lookup — 50000 POIs | 0.516 | 1.477 | 2.387 |
| Canonical planning — 100 region index | 0.208 | 0.557 | 0.925 |
| Canonical planning — 1000 region index | 0.205 | 0.77 | 2.164 |
| Canonical planning — 5000 region index | 0.295 | 2.47 | 9.015 |

Two performance defects were found and corrected during verification rather than masked by thresholds: destination prefix search originally scanned the full token map, and dense spatial lookup originally sorted every candidate. The final implementation uses indexed prefixes plus a bounded top-N spatial heap with exact haversine calculation only for finalists.
## Storage, restoration, map, GPX and PWA

Serialization/deserialization of offline and fully enriched plans passes. Offline and enriched GPX consistency passes. Offline map consistency passes and map/GPX checks are now inside the authoritative validator. The production service-worker script is executed under a CacheStorage/service-worker VM harness: install precache contains EU/ZA/NA data, activation deletes old ReisSlim caches but not unrelated caches, and `clients.claim()` is exercised. Static checks verify build 2000 cache busts, v2.0.0 manifest/package alignment, all precache files exist, all 29 flat country data files are precached, and no external Leaflet/UI CDN remains in the runtime HTML.

### Browser-level limitation

Chromium/browser pipeline execution is **BLOCKED_BY_ENVIRONMENT** in this environment. Attempts were made with localhost HTTP, an intercepted HTTPS host and `file://`; all navigation was rejected with `net::ERR_BLOCKED_BY_ADMINISTRATOR` before the application could load. Therefore actual DOM event/render behavior, real browser CacheStorage persistence across offline reload, and browser download UX were **not executed**. This is an environment limitation, not a passing browser test, and is the reason this report does not claim complete production/browser acceptance.

External provider availability was also not tested live. Production adapters are tested against controlled success, failure, timeout, malformed, partial and canonical-conflict responses.

## Versioning / cache transition

All new runtime entry references use build 2000. `config.js`, package, manifest, index header/footer, dataset metadata and service-worker cache are aligned to v2.0.0/build 2000/dataset 2026.08.31.1. Service-worker activation deletes prior caches whose names begin with ReisSlim/reisslim and immediately claims clients. No historical release-sync/runtime-repair script is loaded by the new HTML.

## Known limitations

1. Browser navigation is blocked in the available environment, so browser-level PWA acceptance is explicitly unverified.
2. Live third-party API availability/latency is not asserted; controlled production-adapter tests cover behavior under responses/failures.
3. Packaged coordinates are structurally and country-bounds validated, but not every row was independently reconciled live against OSM/GeoNames/Wikidata during this run.
4. The packaged catalogue is designed for expansion and provides meaningful required-country coverage, but it is not a worldwide exhaustive gazetteer. Future countries can be added through data partitions without changing the planning engine.
5. Offline map rendering intentionally uses route/POI/night SVG geography rather than downloadable basemap tiles; meaningful trip targets remain visible without network access.

## Verification command

`npm run check` executes syntax validation → dataset validation → static/PWA integrity → production test suite → performance benchmark. Final source gate before packaging: **126 tests, 126 pass, 0 fail** plus syntax/data/static/performance PASS.

The packaged runtime is still subject to the browser-level limitation above; this report intentionally does not overstate that gate.