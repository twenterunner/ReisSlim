ReisSlim 1.14.1 / build 1928 — startup recovery

Overwrite ONLY this file in the repository root:
- release-sync-1928.js

Do not replace app.js, index.html, config.js, roadtrip-policy.js or other 1.14.1 files.

Root cause:
The release synchronizer added in 1.14.1 observed every child-list mutation and
then changed textContent inside the observer callback. Those text changes create
new child-list mutations, so the observer could trigger itself repeatedly and
starve the app startup.

This replacement removes the observer and uses a few bounded, idempotent retries.
