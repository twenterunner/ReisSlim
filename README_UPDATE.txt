ReisSlim v1.4.2 / Build 1402

Upload every file in this ZIP to the deployed ReisSlim repository root.

Updated:
- overall vertical spacing is tighter using compact-ui.css
- specific NAMED live restaurants/accommodations/activities are preferred
- selection uses stronger evidence (website, opening hours, cuisine, Wikidata, official hotel stars, proximity, vehicle fit)
- each selected place gets a Google Maps 'reviews' search link plus OSM/website metadata
- in-app map popups show clickable map/review, website and OSM links
- specific recommendations remain GPX waypoints; GPX now carries a web/map <link>
- revision/header bumped to v1.4.2 / Build 1402
- Travel Readiness remains hidden

Important ratings note:
OpenStreetMap does not provide reliable consumer review scores. This release therefore does NOT invent or claim a star review rating. It directs the user to Google Maps to check current ratings/reviews. A true automatic 'rating >= X' filter requires a ratings provider/API (Google Places, Foursquare, etc.) or a protected gateway.

Verification performed:
- JS syntax checks on all changed JS files
- release/cache/header consistency
- specific-place query and Google Maps links
- GPX link markup and map links
Live external APIs could not be exercised from the packaging runtime.
