ReisSlim v1.6.2 · Build 1602

Loop-route root-cause correction.

Build 1600 still allowed the road router to reuse too much of the outbound
corridor. Build 1602 no longer assumes that displaced via points are sufficient.

For every live return leg in a LOOP trip, ReisSlim now:
1. uses the already-resolved real outbound road geometry as the reference;
2. requests several genuinely separated return-route candidates (both sides);
3. measures actual road-geometry overlap against the outbound route;
4. selects the candidate with the lowest measured overlap;
5. aims for <=30% overlap excluding the unavoidable start/end zones;
6. exposes the measured live overlap in the routing status.

The map and GPX use the selected day.geometry, so the chosen low-overlap route
is also what is exported.

Upload ALL files in this ZIP to the repository root and replace existing files.
