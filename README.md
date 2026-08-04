# ReisSlim v0.2.0 — Stability Sprint

Dutch road-trip planning proof of principle, designed for GitHub Pages.

## Changes in v0.2.0 (Build 200)

- Fixed loss/reset of entered form values.
- Added automatic draft saving for every field and preference.
- Restores unfinished input after refresh or browser restart.
- Uses explicit DOM references instead of browser-created global variables.
- Added validation feedback before destination generation.
- Added local-storage migration from the v0.1 draft key.
- Updated service-worker cache and release version.
- Existing destination ranking, itinerary, budget, map, JSON and GPX functions remain available.

## Deploy on GitHub Pages

Upload every file in this folder to the repository root. In **Settings → Pages**, select **Deploy from a branch**, `main`, and `/(root)`.

After replacing an older version, refresh the page twice or close and reopen the installed PWA so the updated service worker becomes active.
