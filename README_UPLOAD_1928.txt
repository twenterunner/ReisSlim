ReisSlim v1.14.1 build 1928 — synchronized deployment package

Upload ALL files in this ZIP together to the repository root:
- config.js
- roadtrip-policy.js
- service-worker.js
- release-sync-1928.js
- VERIFICATION_1928_SYNC.json

Why this package is different:
The functional 1928 policy files were already present on GitHub, but the deployed
bootstrap still contained stale 1923 cache/version references. This service worker
normalizes the stale 1923 query epoch at runtime, forces code requests to no-store,
updates the visible version badge to 1.14.1 / 1928, and injects the small release
synchronizer without replacing the current app.js or index.html with older copies.

After GitHub Pages has deployed, close/reopen the site once (or refresh twice) so the
new service worker becomes the active controller.
