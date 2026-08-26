# ReisSlim v1.4.9 — proposal-button responsiveness fix

This release targets the exact freeze reported when pressing **Maak reisvoorstellen**.

## Root cause

The current submit path performs proposal ranking synchronously on the browser's
main UI thread. After v1.4.7 added a broad Europe / South Africa / Namibia
fallback catalogue, every proposal request could score the full catalogue and
then render 20–30 large destination cards in one DOM update.

That is unnecessary for the first screen and is particularly expensive on a
mobile browser.

v1.4.9 changes the workload before the UI is rendered:

- a cheap geographic + preference pre-filter reduces the expensive scoring set
  to at most 24 plausible candidates;
- candidates outside realistic roadtrip reach are removed before full scoring
  whenever reachable alternatives exist;
- the initial portfolio is limited to 6–10 cards instead of forcibly rendering
  20–30 cards;
- "show more" remains available for additional alternatives;
- the DOM post-processing observer is animation-frame throttled and temporarily
  disconnected while it performs its own mutations, preventing avoidable
  repeated layout work;
- live OpenStreetMap discovery stays background enrichment and does not need to
  finish before the first proposals are usable.

## Release

**ReisSlim v1.4.9 · Build 1409**
