# ReisSlim v0.2.1 Stable (Build 201)

Hotfix release for GitHub Pages/mobile deployment.

## Fixes
- Replaced fragile multi-module startup with one self-contained `app.js`.
- Added visible error reporting when proposal generation fails.
- Added UUID fallback for browsers without `crypto.randomUUID()`.
- Updated service-worker cache strategy and cache version.
- Preserved autosave, destination ranking, itinerary, budget, map, JSON and GPX exports.

## Deployment
Upload every file in this package to the root of the GitHub repository and replace existing files. Wait for GitHub Pages to redeploy, then close all open ReisSlim tabs and reopen the site. If installed as a PWA, close it fully and open it again.
