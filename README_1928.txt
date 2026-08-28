ReisSlim 1.14.1 / build 1928 targeted route+POI hotfix

Replace these three files in the repository root:
- routing-provider-1914.js
- poi-gap-filler.js
- gpx-generator.js

What changes:
1. routing-provider-1914.js becomes a compatibility shim to the canonical routing-provider.js.
   This removes the stale duplicate routing engine and restores full live road geometry,
   route styling/loop logic and route-derived rest/fuel waypoints.
2. poi-gap-filler.js fixes the unresolved-placeholder bug: a placeholder POI without
   coordinates can no longer suppress a real route-based Overpass/Photon lookup.
3. gpx-generator.js includes day trips in the GPX track, handles closed base day trips
   by routing via the actual destination, and runs the POI gap filler before export.

No storage schema changes.
