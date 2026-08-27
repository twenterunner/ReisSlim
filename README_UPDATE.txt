ReisSlim v1.7.11 · Build 1711

LIVE DISCOVERY RELIABILITY FIX

Root cause:
The Planner could still end in “Live bron tijdelijk beperkt” when the Nominatim reverse-seed
requests returned nothing and the emergency Overpass request also timed out/failed. In practice
the UI was still too dependent on the same public OSM path that had failed in earlier releases.

Changes:
- Added Photon/OpenStreetMap as a second independent live geocoder.
- Six Photon route seeds are queried quickly; two rate-conscious Nominatim seeds cross-check them.
- Overpass is now only the final emergency fallback.
- If the first seed group yields no extra regions, ReisSlim automatically tries a second seed group.
- The existing eight portfolio proposals remain immediately usable and live failure is presented
  as optional expansion not being available, rather than an application error.
- Discovery cache schema bumped to v12 to avoid stale failed-search cache behaviour.
- Flat package retained.
