ReisSlim v1.5.3 / Build 1503

Root causes addressed:
- app displays fallback before async live discovery completes
- routed-car URL incorrectly dropped /routed-car/ prefix
- route legs were requested in parallel despite public service rate guidance

Fixes:
- live-first visible proposal UX
- 4 discovery passes, 8 seeds/pass, longer timeout
- correct routed-car URL
- sequential 1.1 s throttled routing
- 18 s routing timeout per leg
- sequential longer specific-place lookups
- GPX uses same live road geometry strategy

Upload ALL files in this ZIP.
