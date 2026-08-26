ReisSlim v1.4.9 / Build 1409

Exact issue addressed: pressing Maak reisvoorstellen could make the mobile app
unresponsive.

Cause verified in source:
- proposal generation runs synchronously on the main UI thread;
- the enlarged fallback catalogue was fully scored;
- proposal-engine then forced 20–30 cards even though the caller requested 8.

Fix:
- preselect max 24 candidates cheaply by actual origin, road reach and preferences
- fully score only those candidates
- render 6–10 initial cards
- keep Show more for further options
- throttle the DOM mutation observer to one animation frame

Upload ALL files in this ZIP to the deployed repository root.
