# AGENTS.md

- Preserve the dashboard, planner, saved trips, autosave, comparison, itinerary, map, budget, JSON/GPX exports and installable PWA.
- Inspect the repository and current state flow before editing.
- Never work directly on `main`; use a scoped branch and reviewable commits.
- Keep all paths compatible with a GitHub Pages project site and do not add a mandatory server runtime.
- Keep domain engines deterministic, provider-independent and testable without the DOM.
- Use one central budget calculation and one canonical itinerary model for UI, map and exports.
- Migrate or safely rebuild old stored data; never render stale derived plans blindly.
- Escape user-controlled text and never commit secrets, tokens or private API keys.
- Run `npm run check` and relevant browser smoke tests before publishing.
- Update version and build consistently in config, package, HTML, service worker, README and changelog.
- Leave a clean worktree after commits and report actual test results only.
