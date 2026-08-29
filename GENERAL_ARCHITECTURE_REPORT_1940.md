# ReisSlim 1.15.0 / build 1940 — general architecture correction

## Why 1933 was the wrong direction
Build 1933 still contained location-specific recovery logic:
- an `OFFLINE_EUROPE_REGIONS` table;
- an `OFFLINE_SOUTHERN_AFRICA_REGIONS` table;
- special origin detection for Europe and Southern Africa;
- explicit Cape Town aliases added to the origin catalog;
- pre-existing Sauerland/Eifel proposal anchors in destination discovery.

Those mechanisms could make one reported case pass while leaving the same class of failure elsewhere. They violate the requirement that fixes be general rather than destination-specific patches.

## Build 1940 architecture
### 1. Global adaptive overnight-region supply
`regional-overnight-provider.js` contains no country, city or origin-specific fallback table.
Search geometry is derived only from:
- origin coordinates;
- selected destination/region anchor coordinates;
- trip duration;
- transport type;
- max daily driving time;
- max accommodation changes;
- moving/base structure;
- loop / out-and-back / open-ended topology.

The provider builds reachable corridor/ring/loop search seeds, queries OpenStreetMap towns through batched Overpass requests, fills gaps with Photon reverse geocoding, and uses a small serial Nominatim fallback only for unresolved topology gaps. It expands the geometry over multiple rounds instead of adding a new region list when a new country fails.

### 2. Topology-first cache
Candidate count is not accepted as proof of a valid trip. A cache entry is reused only when the same roadtrip solver proves it can satisfy the requested topology and constraints. Invalid/stale candidate sets may seed a recovery search but are never treated as success merely because they contain N places.

### 3. General destination discovery
The old hard-coded Sauerland/Eifel motorcycle anchors are removed. Short motorcycle trips use the same global multi-ring discovery engine as every other trip.

Cape Town is no longer added as a special-case origin alias. Unknown origins use the normal geocoded `originPoint` path, exactly like any other world location.

### 4. Tiered image pipeline
The visible card path no longer waits for a Wikimedia Commons media search.
Image order is now:
1. persistent metadata cache;
2. one lightweight English Wikipedia page-image lookup (480 px thumbnail);
3. Commons image/license enrichment in a throttled background queue.

Ten visible destinations can hydrate concurrently. The service worker remains cache-first for the actual image bytes. Local card placeholders remain immediate while a destination-specific image is unresolved.

## Verification performed
- 1,200 route-supply cases across ten globally separated coordinates, 3/4/5/7/10-day trips, all four vehicle types, moving and base structures, multiple daily-drive limits, and all route topologies where valid: **1,200 passed / 0 failed**.
- Static architecture checks confirm the regional provider contains no Europe/Southern-Africa/Cape-Town/Saasveld/Knysna/Zwolle fallback branches and destination discovery contains no Sauerland/Eifel fixed anchors.
- Five arbitrary non-catalog origins (Cape Town, Tokyo, Buenos Aires, Vancouver, Nairobi) were exercised through the generic destination-discovery path using `originPoint`: **5/5 passed**.
- Image benchmark for 10 cards with mocked metadata latency:
  - 20 ms source latency: 27.8 ms total, 10 requests, 10/10 loaded;
  - 100 ms source latency: 101.4 ms total, 10 requests, 10/10 loaded;
  - 400 ms source latency: 402.3 ms total, 10 requests, 10/10 loaded.
- Syntax checks passed for config, destination provider, regional provider, image provider, release sync and service worker.

## Important verification boundary
These tests verify the corrected engines and integration contracts in a representative deterministic environment. They do not constitute an Android/Chrome/GitHub-Pages end-to-end execution of build 1940. The live app should not be called fixed until build 1940 is deployed and the actual phone workflows pass.
