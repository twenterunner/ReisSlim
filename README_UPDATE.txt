ReisSlim expanded destination update

Files in this ZIP:
- destination-provider.js
- proposal-engine.js
- ui-feature-flags.js

Upload all three files to the ROOT of the ReisSlim repository, replacing the two
existing files with the same names and adding ui-feature-flags.js.

What changed
1. Live discovery now uses 16 geographic seeds per pass instead of 8.
2. One discovery action runs 3 bounded Overpass passes.
3. Up to 72 live destinations can be returned per discovery action.
4. Search coverage now includes city/town/village, national parks,
   protected areas, named peaks/bays/beaches/water, attractions and resorts.
5. Discovery uses more distance bands and bearings to avoid large geographic gaps.
6. Spatial de-duplication prevents the enlarged pool from becoming repetitive.
7. The proposal engine now builds a 20-30 option diverse portfolio internally.
8. Stronger country/distance/theme diversity prevents one region from dominating.
9. The engine retains up to 8 useful near-misses internally for later UI use.
10. 'Show more' still returns a bounded number of new options per tap.
11. Travel Readiness is hidden from the UI for now. Its underlying logic is not
    deleted, making it safe to re-enable later.

Important
- This is deliberately a minimal-file update. It avoids changing the route,
  itinerary, budget, vehicle, optimization, storage or export engines.
- Public Overpass instances are rate-limited. The new discovery logic uses
  several bounded requests rather than one enormous request.
