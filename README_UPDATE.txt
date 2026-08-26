ReisSlim v1.6.8 · Build 1608

Fixes:
- Header/footer revision mismatch: v1.6.7 omitted ui-feature-flags.js and
  service-worker.js. Build 1608 includes them and versions all runtime files.
- Destination discovery no longer depends on Overpass as primary. Reachable
  geographic seeds are reverse-geocoded through OpenStreetMap Nominatim first.
- Overpass is now only an emergency fallback and its mirrors are raced in parallel.
- Discovery uses one progressive batch rather than repeated Overpass rounds.
- Dashboard text spacing repaired (e.g. 'Vertrek Saasveld', 'Start 2026-08-07').
- Old duplicate service-worker activation handler removed.

Upload ALL files from this ZIP to the repository root.
