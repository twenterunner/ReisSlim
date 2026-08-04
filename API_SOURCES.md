# API and data sources

| Source | Use | Verification / limits | Fallback |
|---|---|---|---|
| OpenStreetMap Nominatim | User-triggered origin and destination geocoding | Shared client throttle above one second, cached results, no autocomplete; destination type and bounds retained | Typed name remains; no unrelated proposal is generated |
| OpenStreetMap Overpass | Global staged anchor discovery and route-area POIs | Configurable endpoint list, bounded batch, abort timeout, exact-request cache; no availability or price claim | Exact cached evidence only; otherwise explicit no-results state |
| OSRM public demo | Car-profile road geometry for car/motorcycle | No heavy-vehicle constraints; motorcycle timing is recalculated by ReisSlim | Offline corridor |
| OpenRouteService | Optional heavy-vehicle routing with user-owned key | Key stored locally; user must verify restrictions | Offline corridor |
| ReisSlim/TomTom gateway | Optional protected production routing | Server-side key required; normalized response contract | Other road adapter or offline corridor |
| Open-Meteo | Forecast up to supported future horizon | Forecast, not guarantee; two-hour local cache | Seasonal destination score and rain alternatives |
| Wikimedia Commons | Proposal imagery | Only CC BY, CC BY-SA, CC0 or public-domain metadata accepted; attribution displayed | Gradient/emoji artwork |
| NederlandWereldwijd | Official advisory and entry starting point | User opens and verifies; ReisSlim does not parse a legal conclusion | Readiness item stays unverified |
| LCR | Health information starting point | Personal medical advice remains outside app scope | Readiness item stays unverified |

The public Nominatim policy limits heavy use and requires caching, attribution and at most one request per second. Public endpoints are suitable only for moderate, user-triggered use. Production scale should use a gateway or owned instances with shared caching, quotas, monitoring, privacy review and source terms. Public Overpass is not treated as a sole reliability strategy. Provider failure must never substitute unrelated evidence or erase an already saved canonical plan.
