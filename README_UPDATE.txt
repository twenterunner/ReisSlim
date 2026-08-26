ReisSlim v1.4.4 / Build 1404

Main fixes
1. "Waarom deze?" now explicitly explains the preferences that matched:
   e.g. culture -> cities/heritage/cultural sights; mountains -> mountainous terrain;
   nice roads -> scenic/curvy-road potential; food -> horeca/local food options.
   The weighted preference match is still shown, but now with actual reasons.

2. The four proposal metrics are made more decision-useful in the UI:
   Voorkeursmatch, Roadtripfit, Seizoenfit and Voertuig/routefit, each with a
   qualitative interpretation such as "zeer sterk" / "sterk" / "redelijk".

3. Route topology now has exactly three roadtrip choices:
   - Lus — andere route terug
   - Heen & terug — dezelfde route
   - Open einde — eindig op bestemming
   Flight/multimodal modes remain disabled.

4. Loop duplication reduced:
   - return corridor offset is dynamic (75–190 km depending on trip scale)
   - loop overlap uses a tighter 15 km overlap threshold
   - out-and-back deliberately reuses the same corridor
   - open-ended does not return to the start

5. Specific stops/accommodation:
   - generic placeholders are no longer shown as recommendations
   - travel days include a lunch recommendation around the mid-route point
   - accommodation is searched at the overnight point
   - live place search uses named OSM results only
   - search radius increased and queries are chunked across route anchors
   - two Overpass endpoints are tried for resilience
   - only live named places are exported as recommendation points

Upload all files in this ZIP to the deployed repository root.
