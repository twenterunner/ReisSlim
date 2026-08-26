ReisSlim v1.6.5 · Build 1605

AUTO-RECOVERY FOR ZERO-RESULT CACHE

Observed in deployed v1.6.4:
The app could still display "0s · lokale cache · Geen live roadtripregio's"
on the initial search. v1.6.4 correctly invalidated bad cache entries, but it
then stopped instead of immediately performing a new live search.

v1.6.5:
- detects when an initial cached search produced zero usable destinations;
- automatically starts one fresh live OpenStreetMap discovery pass;
- advances to a new geographic seed group;
- bypasses cache for that recovery pass;
- keeps progress UI live while recovery happens;
- manual Retry still bypasses cache and uses new seeds.

Upload all files in this ZIP to repository root.
