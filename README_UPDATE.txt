ReisSlim v1.7.5 · Build 1705

ROOT CAUSES / IMPROVEMENTS
- Fixed header/footer revision mismatch: config, UI release badge, footer, manifest and SW cache are all 1.7.5/1705.
- Replaced composited render screenshots with CLEAN local photographic hero backgrounds (no embedded UI/text).
- Removed decorative nonfunctional hero tiles/chips.
- POI categories are now toggleable independently; e.g. show only fuel stops.
- Tapping a POI still focuses and labels it; focusing a filtered POI re-enables its category.
- ReisSlim Assistant now understands max drive hours, duration, budget, route topology, route style, pace, hotel changes and preference boosts.
- Assistant apply now rebuilds the trip and creates an optimizer proposal instead of silently discarding most commands.
- Trip Optimizer now evaluates every feasible combination of available improvements (max 63) and selects the highest-quality combination rather than blindly applying cosmetic actions.
- Stronger local-route, recovery, consolidation and value actions produce meaningful measurable changes.

IMPORTANT: upload all files from this ZIP, including the assets folder and assistant-engine.js/trip-optimizer.js.
