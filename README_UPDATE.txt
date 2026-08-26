ReisSlim v1.4.3 / Build 1403

Fixes requested:
1. Preferences now materially change proposals.
   Root cause: live-discovered destinations were given generic tags
   ['natuur','cultuur','eten'] and every motorcycle destination was given 'motor'.
   That made many checkbox combinations score almost identically.
   v1.4.3 only assigns tags supported by the discovered OSM feature type.

2. Preference scoring is now dominant enough to reorder results.
   Weighted preference coverage contributes 56% of the destination score.
   'Essentieel' misses are explicitly penalized.
   Portfolio diversity can no longer overpower preference fit.

3. Roadtrip-only mode.
   - travelMode is forced to 'direct'
   - flight/fly-drive/fly-ride/fly-camper is ignored even in saved drafts
   - travel-mode field is hidden from the planner
   - open-jaw multimodal option is removed
   - destinations beyond realistic out-and-back road reach are HARD rejected
   - targeted searches outside road reach do not trigger remote discovery

4. Example fixed:
   A normal motorcycle trip from Saasveld can no longer surface Namibia as
   a selectable proposal because it exceeds the roadtrip reach calculation.

5. Revision is v1.4.3 / Build 1403 and is visible in the header.

Upload all files in this ZIP to the deployed repository root.

Verification:
- all changed JS files pass node --check
- static tests verify direct-only normalization, road-reach rejection,
  removal of blanket live tags, preference-dominant score, and revision/cache.
