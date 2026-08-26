# ReisSlim v1.4.7 — origin-based roadtrip planner

ReisSlim plans roadtrips from the start location entered by the user.

## v1.4.7 reliability fix

v1.4.6 could show **0 feasible options** because the static catalogue had been
made completely empty while the first screen rendered before live OpenStreetMap
discovery completed. The live Overpass request was also too large, so a timeout
could leave the portfolio permanently empty.

v1.4.7 fixes that architecture:

- live discovery remains the primary expansion mechanism;
- Overpass searches are smaller (6 geographic seeds per request) and use four
  staged passes;
- two Overpass endpoints are tried for resilience;
- a broad fallback anchor set covers Europe, South Africa and Namibia, so an
  external API timeout no longer means zero options;
- every fallback destination is recalculated from the user's actual origin and
  hard-filtered by realistic roadtrip reach;
- route distance is now calculated directly from the actual user origin rather
  than scaling an old Saasveld baseline;
- generated intermediate travel zones allow multi-day routes even when a fallback
  anchor has no curated routeStops.

## Coverage

All European countries are represented by at least one fallback roadtrip anchor,
plus multiple anchors in South Africa and Namibia. Live OpenStreetMap discovery
then expands beyond those anchors.

A start in Saasveld only produces locations reachable as a roadtrip from Saasveld.
A start in Cape Town or Windhoek is treated in exactly the same way from those
coordinates. No flight is inserted.

## Release

**ReisSlim v1.4.7 · Build 1407**
