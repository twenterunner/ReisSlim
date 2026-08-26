# ReisSlim v1.5.2 — preferences, specific places and full GPX

v1.5.2 fixes three regressions/failures seen in v1.5.1.

## Preferences
v1.5.1 accidentally replaced the UI feature file that contained automatic
re-ranking. This release restores it, and also includes the v1.5.0
match-first/focus-purity ranking files so selecting Culture versus Mountains
changes the ranked proposal set.

## Specific stops/accommodation
Named place lookup now tries targeted OpenStreetMap Overpass first and bounded
OpenStreetMap Nominatim category search as a fallback. Only named results are
shown; generic placeholders are suppressed.

## Full GPX road route
GPX export is strict. It obtains full road geometry for each travel leg from two
OSRM providers and writes one continuous GPX track. It does not silently fall
back to a straight start-to-destination line. Export status reports route-point
and specific-waypoint counts, or a visible error when full road geometry cannot
be obtained.

**ReisSlim v1.5.2 · Build 1502**
