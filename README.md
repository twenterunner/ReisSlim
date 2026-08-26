# ReisSlim v1.5.0 — preference-driven proposal ranking

This release fixes the case where changing **Natuur / Bergen / Cultuur / Eten /
Mooie wegen / ...** appeared to produce the same destination proposals.

## Root cause

The preference engine did read the checked boxes, but the ranking logic mainly
measured whether a destination contained a selected tag at all.

For a narrow request such as only **Cultuur**, many fallback destinations have a
culture tag. They therefore all scored a 100% selected-preference coverage and
distance/feasibility kept the same places near the top. Diversity logic could
then further dilute the impact of the selected preference.

The UI also did not automatically rebuild an already visible portfolio when a
preference checkbox or priority dropdown changed.

## v1.5.0

- Preference matching is now the primary preselection criterion.
- If enough reachable destinations match at least one selected preference,
  zero-match destinations are removed before expensive scoring.
- A new **focus purity** factor distinguishes specialist destinations from
  generic destinations carrying many unrelated tags.
- Preference weighting has more influence than portfolio diversity.
- Diversity is retained only as a small tie-break/spread factor.
- When proposals are already on screen, changing a checkbox or its
  Nice-to-have / Important / Essential priority automatically submits and
  reranks the portfolio after a short debounce.
- "Waarom deze?" includes selected preference match plus focus purity.

**ReisSlim v1.5.0 · Build 1500**
