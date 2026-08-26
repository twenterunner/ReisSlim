ReisSlim v1.4.7 / Build 1407

Root cause fixed: v1.4.6 emptied destinations.js completely and depended on a
large asynchronous Overpass request. If that request timed out, the app had
nothing to rank and correctly displayed 0 options.

v1.4.7 restores a broad origin-filtered fallback catalogue while keeping live
discovery, makes Overpass calls smaller and resilient, and fixes route distance
calculation so every candidate is computed from the actual user-specified origin.

Upload ALL files in this ZIP to the deployed repository root.
