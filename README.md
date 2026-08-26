# ReisSlim v1.5.6 · Build 1506

Live destination discovery was redesigned after v1.5.5 proved that the public
Overpass instances timed out for the broad discovery query.

## Root cause
The old discovery request generated about 40 `nwr(around:...)` clauses per pass
(8 geographic seeds × 5 feature categories). This is an expensive use of public
Overpass and was observed in the deployed app timing out on every pass.

## Fix
Destination discovery is now Nominatim-first:
- deterministic roadtrip-reach seeds are still generated from the user's origin;
- four geographically spread seeds are sampled per pass;
- each seed uses a lightweight OpenStreetMap Nominatim reverse lookup;
- requests are paced at ~1 request/second;
- each successful place is converted immediately into a live proposal;
- discovery stops once six useful live proposals exist;
- "Toon meer" advances to new geographic seeds;
- Overpass remains used for detailed POI/accommodation/restaurant enrichment only
  after a destination is selected.

This separates cheap region discovery from expensive POI enrichment.
