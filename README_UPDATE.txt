ReisSlim v1.4.0 / Build 1400

This supersedes the previous ZIP.

IMPORTANT: upload ALL files in this ZIP to the repository root.

Why the previous update could still look unchanged:
- The previous ZIP did not bump config.js VERSION/BUILD.
- The service worker cache was still v1.0.0-build-1000 and did not cache the new UI feature file.
- Therefore an installed/PWA copy could continue serving old modules.
- This release bumps the cache and adds the new module to the precache list.

Functional update:
- 16 geographic discovery seeds per pass (was 8).
- 3 discovery passes per live discovery action.
- Up to 72 normalized live candidates per action (was 16).
- Wider OSM feature types: villages, parks/protected areas, peaks, bays, beaches, water, attractions and resorts.
- Multi-ring geographic coverage and spatial deduplication.
- Proposal portfolio engine can expose 20-30 diverse candidates internally instead of a tiny shortlist.
- Stronger diversity by country, distance band and theme.
- Travel Readiness hidden for now.
- Revision v1.4.0 · 1400 is shown in the top header.
- Service worker cache bumped to force deployment refresh.

Verification performed:
- JavaScript syntax checks for every JS file in this ZIP.
- Static checks that config VERSION/BUILD, service worker cache and header revision all equal 1.4.0 / 1400.
- Full browser/live-API acceptance cannot be executed from this offline packaging environment.
