# API and data sources

| Source | Use | Verification / limits | Fallback |
|---|---|---|---|
| OpenStreetMap Nominatim | User-triggered origin and destination geocoding | Cached 90 days; no autocomplete; place coordinate only | Typed name remains; no false coordinate in export |
| OpenStreetMap Overpass | Global staged destination discovery and route-area POIs | Bounded batch, abort timeout, local cache; no availability or price claim | Curated regions and vehicle-category proposals |
| OSRM public demo | Car-profile road geometry for car/motorcycle | No heavy-vehicle constraints; motorcycle timing is recalculated by ReisSlim | Offline corridor |
| OpenRouteService | Optional heavy-vehicle routing with user-owned key | Key stored locally; user must verify restrictions | Offline corridor |
| ReisSlim/TomTom gateway | Optional protected production routing | Server-side key required; normalized response contract | Other road adapter or offline corridor |
| Open-Meteo | Forecast up to supported future horizon | Forecast, not guarantee; two-hour local cache | Seasonal destination score and rain alternatives |
| Wikimedia Commons | Proposal imagery | Only CC BY, CC BY-SA, CC0 or public-domain metadata accepted; attribution displayed | Gradient/emoji artwork |
| NederlandWereldwijd | Official advisory and entry starting point | User opens and verifies; ReisSlim does not parse a legal conclusion | Readiness item stays unverified |
| LCR | Health information starting point | Personal medical advice remains outside app scope | Readiness item stays unverified |

Public endpoints are suitable for moderate, user-triggered use. Production scale should use a gateway or owned instances with shared caching, quotas, monitoring, privacy review and source terms. Provider failure must never erase the deterministic plan.
