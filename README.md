# ReisSlim v1.5.1 — specific places + complete GPX route

This release addresses two hard requirements.

## 1. Specific stops and accommodation

Generic placeholders such as “lunch stop”, “accommodation” or “rest stop” are
not treated as recommendations anymore.

For every planned recommendation point ReisSlim now performs a **targeted live
OpenStreetMap Overpass lookup** for the exact category:
- named hotel / guest house / campsite / caravan site for overnight stays;
- named restaurant/cafe for meal stops;
- named fuel station or road service area for fuel/rest;
- named attraction/viewpoint/museum/historic/nature location for activities.

Search is progressively widened from 6 km to 14 km to 30 km and retries two
Overpass providers. Candidate selection uses distance, vehicle suitability and
available evidence such as website, opening hours, cuisine and official stars.

If the provider cannot return a named place, ReisSlim no longer invents a
generic place and pretends it is specific. Current consumer ratings still require
checking the supplied Google Maps review link because OpenStreetMap does not
provide reliable review-star data.

## 2. GPX contains the whole roadtrip

The old GPX simply exported whatever geometry happened to be in the plan at the
moment of export. If background live routing had not completed, that could be
only the start and destination points.

v1.5.1 makes GPX export self-sufficient:
- it requests full OSRM road geometry for every outward/return/transfer segment;
- if a provider request fails, it exports a densely sampled corridor rather than
  only two points;
- it creates one continuous GPX `<trk>` covering the complete trip;
- it additionally writes each day as a GPX `<rte>`;
- all resolved named restaurants, accommodation and other stops are GPX
  waypoints with web/map links.

**ReisSlim v1.5.1 · Build 1501**
