# ReisSlim v1.4.8 — responsiveness fix

ReisSlim plans roadtrips from the start location entered by the user.

## Why v1.4.7 could appear to hang

The submit workflow waits for `geocodeOrigin()` before showing the final proposal
portfolio. Even for a built-in origin such as Saasveld, v1.4.7 still called the
public Nominatim service first. A slow mobile connection or provider delay could
therefore leave the UI sitting on “Vertrekplaats controleren…” for many seconds.

The live destination discovery also allowed comparatively long Overpass waits.
Although that part runs in the background, it could make the application feel
unresponsive on a phone.

## v1.4.8

- Known start locations such as Saasveld are resolved immediately from the local
  origin catalogue: no network wait.
- Arbitrary typed origins still use OpenStreetMap Nominatim, but the user-facing
  geocode wait is capped at 3 seconds.
- Live destination discovery is still background enrichment.
- Individual Overpass discovery requests are capped at 4.5 seconds.
- Discovery uses 3 staged passes instead of 4.
- The broad Europe / South Africa / Namibia fallback remains available immediately,
  so live discovery is not required before proposals can be shown.
- Actual-origin distance calculation from v1.4.7 remains in place.

**ReisSlim v1.4.8 · Build 1408**
