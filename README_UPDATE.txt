ReisSlim v1.4.8 / Build 1408

Root cause of the apparent hang:
The planner awaited Nominatim geocoding on every submit, even for known origins
like Saasveld. That network request was in the critical user-facing path.

Fix:
- known origins resolve instantly without network
- unknown typed locations: geocoding hard timeout 3 s
- Overpass background request timeout 4.5 s
- discovery passes reduced from 4 to 3
- fallback proposals stay available immediately

Upload ALL files in this ZIP to the deployed repository root.
