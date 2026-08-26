ReisSlim v1.4.1 / Build 1401

ROOT CAUSE VERIFIED IN THE CURRENT GITHUB REPOSITORY
----------------------------------------------------
The v1.4.0 functional files ARE on GitHub:
- config.js says VERSION 1.4.0 / BUILD 1400
- destination-provider.js has 16 seeds, 3 passes and a 72-result limit
- ui-feature-flags.js exists
- service-worker.js says v1.4.0-build-1400

However index.html is still the old deployment shell:
- styles.css?v=1000
- app.js?v=1000
- footer text still says v1.0.0 / Build 1000
- Travel Readiness markup is still present

That means the app can continue requesting old cache-keyed code. The previous
service worker was also cache-first for JS/CSS, so stale modules could survive.

v1.4.1 FIX
----------
1. Revision bumped to v1.4.1 / Build 1401.
2. Service worker now uses NETWORK-FIRST + cache:'reload' for JS, CSS, JSON,
   modules and workers.
3. Old ReisSlim caches are deleted on activation.
4. The header revision remains generated dynamically by ui-feature-flags.js.
5. Expanded destination discovery from v1.4.0 remains included.
6. Travel Readiness remains hidden by ui-feature-flags.js.

Upload ALL five files in this ZIP to the repository root:
- config.js
- destination-provider.js
- proposal-engine.js
- ui-feature-flags.js
- service-worker.js

After GitHub Pages publishes, open the site once in a normal browser tab.
The new service worker must install/activate; the next app load should show
v1.4.1 · 1401 in the header.

NOTE
----
index.html itself is still old in the repository. v1.4.1 is deliberately made
robust against that by bypassing stale JS/CSS cache keys. A later cleanup
release should also update index.html's ?v= query strings and static footer.
