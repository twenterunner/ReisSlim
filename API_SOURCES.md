# API and data sources

| Source | Use | Verification / limits | Fallback |
|---|---|---|---|
| [OpenStreetMap Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | User-triggered origin and destination geocoding | Shared client throttle above one second, cached results, no autocomplete; provider ID, geographic type and bounds retained | Typed name remains; no unrelated proposal is generated |
| [Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md) | Secondary typed-place geocoding and constraint-derived settlement bootstrap | Bounded, user-triggered requests; provider IDs, coordinates and OSM source retained | Nominatim or exact cache |
| [OpenStreetMap Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) | Multi-scale anchor discovery plus route-/base-area named POIs and accommodations | Configurable endpoint list, bounded small-area batches, cancellation, timeout, exact-request cache and deduplication; no availability or price claim | Other provider evidence or clearly labelled generic search area |
| [Wikipedia GeoSearch](https://www.mediawiki.org/wiki/API%3AGeosearch) | Named significance evidence around dynamically discovered anchors | Coordinates and page URL retained; treated as limited-confidence evidence, not verified availability | OSM evidence or clearly generic local suggestion |
| [OSRM public demo](https://project-osrm.org/docs/v5.24.0/api/) | Road geometry for car/motorcycle segments | Public demo has no SLA or heavy-vehicle constraints; motorcycle elapsed time and suitability are recalculated by ReisSlim and never called motorcycle-optimized | Independently labelled fallback geometry |
| [OpenRouteService](https://openrouteservice.org/dev/#/api-docs) | Optional heavy-vehicle routing with user-owned key | Key stored locally; user must verify restrictions and provider terms | Other road adapter or fallback geometry |
| ReisSlim/TomTom gateway | Optional protected production routing | Server-side key required; normalized response contract | Other road adapter or offline corridor |
| [Open-Meteo](https://open-meteo.com/en/docs) | Forecast up to supported future horizon | Forecast, not guarantee; two-hour local cache | Seasonal destination score and rain alternatives |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:API) | Proposal imagery | Only CC BY, CC BY-SA, CC0 or public-domain metadata accepted; attribution displayed | Gradient/emoji artwork |
| NederlandWereldwijd | Official advisory and entry starting point | User opens and verifies; ReisSlim does not parse a legal conclusion | Readiness item stays unverified |
| LCR | Health information starting point | Personal medical advice remains outside app scope | Readiness item stays unverified |

## Reliability and provider limits

The public Nominatim policy limits heavy use and requires caching, attribution and at most one request per second. Public endpoints are suitable only for moderate, user-triggered use. Public Overpass and OSRM instances provide no production SLA; responses may be slow, incomplete, rate-limited or unavailable. Named POI/accommodation presence is evidence that a mapped object exists, not proof of opening hours, parking security, road access, price, inventory or bookability.

ReisSlim therefore uses bounded concurrency, cancellation, endpoint failover, partial results, source/freshness metadata and stale-if-error only for the identical normalized request. Provider failure must never substitute unrelated evidence or erase an already saved canonical plan. Generic suggestions keep the real route/base search anchor and are explicitly labelled rather than being rendered as fabricated venue coordinates.

Production scale should put provider-independent adapters behind an optional lightweight gateway or owned instances with shared caching, quotas, monitoring, privacy review and source-term enforcement. The static GitHub Pages PWA remains deployable without that gateway, but no shared commercial API key may be committed to or distributed in the browser.
