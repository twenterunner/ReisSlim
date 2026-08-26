# ReisSlim v1.5.4 · Build 1504

This is a **full shell repair package** after the ReisSlim repository was accidentally contaminated with AI Running Coach core files.

Upload every extracted file from this ZIP to the root of `twenterunner/ReisSlim`, choosing **Replace** for existing files.

The package explicitly replaces:
- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `icon.svg`
- `service-worker.js`

and includes all ReisSlim files changed in the recent live-routing / destination / preference releases.

The HTML uses build-1504 cache-busting and the service worker uses a new 1504 cache, so Running Coach shell assets should no longer be reused after GitHub Pages publishes the commit.
