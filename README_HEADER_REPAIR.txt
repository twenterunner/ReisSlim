ReisSlim 1.14.2 / build 1929 — header & service-worker activation repair

Upload ALL files in this ZIP together:
- config.js
- service-worker.js
- release-sync-1928.js
- release-sync-1929.js
- VERIFICATION_1929_HEADER_REPAIR.json

Root cause:
The GitHub repository already contains config.js = 1.14.2 / 1929, but the physical
ui-feature-flags.js is still an older release source and the app relies on the active
service worker to rewrite it. If the 1929 service worker has not activated, an older
controller can therefore keep showing an older header.

This repair does two things:
1. release-sync-1928.js now also reports 1.14.2 / 1929, so a client still controlled
   by the 1928 worker is immediately bridged to the correct visible version.
2. service-worker installation is no longer atomic cache.addAll(). One missing or
   transient asset can no longer abort the complete worker update.

The functional 1929 route/accommodation changes are unchanged.
