# ReisSlim v1.5.3 — live-first routing and destination discovery

This release changes ReisSlim from "fallback first, live later" to a live-first
user experience.

## Why v1.5.2 kept showing fallback/offline

The core app still renders the fallback destination portfolio immediately and
starts OpenStreetMap destination discovery in the background. That is why a
fallback such as Ribe could be selected before live discovery finished.

There were also two routing reliability problems:
1. the `routing.openstreetmap.de/routed-car` base path was constructed with an
   absolute `/route/...` URL, which dropped the required `/routed-car/` prefix;
2. multiple route legs were requested in parallel. The public routing service
   asks clients to stay around one request per second, so parallel requests can
   be throttled or fail.

## v1.5.3

- fallback destination cards are temporarily hidden while live discovery is
  still the only missing source;
- the UI explicitly says that live discovery can take 10–45 seconds;
- live destination discovery gets 4 passes, 8 seeds/pass and a 14-second request
  ceiling;
- routed-car URL construction is fixed;
- route legs are requested sequentially with 1.1 seconds between requests;
- routing timeout is increased to 18 seconds per leg;
- GPX uses the same sequential, correctly formed live route requests;
- specific place lookup is sequential and gets longer timeouts rather than
  hammering public APIs in parallel.

The fallback catalogue remains as an emergency resilience layer, but it is no
longer the preferred visible result while live discovery is still working.

**ReisSlim v1.5.3 · Build 1503**
