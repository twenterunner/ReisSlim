# ReisSlim v1.5.5 · Build 1505

## Progressive live discovery

The live-search panel now reports progress instead of showing one static message.

It shows:
- origin and calculated roadtrip reach;
- current search round (1–4);
- which OpenStreetMap Overpass server is being queried;
- provider timeout/failover to the second server;
- number of raw locations received;
- number of usable live roadtrip regions already found;
- elapsed time;
- final success or failure.

Crucially, live destination results are added to the proposal portfolio after
each successful search round. ReisSlim no longer waits for all four rounds before
showing useful live results.

Each Overpass endpoint has its own 15-second timeout controller, so a timeout on
server 1 no longer prevents server 2 from actually being tried.

If all four rounds fail, the progress panel states that explicitly and exposes a
"Probeer live opnieuw" button. Only then are fallback cards allowed to become
visible again.

**Release: ReisSlim v1.5.5 · Build 1505**
