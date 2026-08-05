# Changelog

## 1.3.0 — 2026-08-05

### Added

- versioned, source-backed touring country packs for South Africa, Namibia and all European countries, including microstates and Kosovo;
- lazy country resolution/import with per-pack manifest counts, generation metadata, provenance, licence and integrity validation;
- development-time catalogue generation, exact pinned Overture extraction/merge and reproducible coverage/data-quality reports;
- named base-associated POIs, restaurants, accommodation candidates and services where source records support them;
- source-backed road context at important corridor endpoints, counted separately from full route-backed corridors and retaining honestly labelled fallback geometry, unknown route condition and separate car/motorcycle timing;
- offline catalogue proposal generation that does not call public discovery providers;
- a compact offline place locator and locally vendored Leaflet 1.9.4 runtime/marker assets;
- deterministic acceptance coverage for South Africa, Namibia, European car/motorcycle tours, vehicle-copy isolation, pack loading and service-worker scope.

### Changed

- version/build to 1.3.0/1300, engine version to 11 and storage schema to 10;
- catalogue planning is now the primary runtime path; live geocoding, route, weather, place and image providers are optional enrichment;
- the same generic constrained graph solver constructs every country itinerary—country packs contain knowledge, not pre-authored route functions;
- the PWA shell precaches only the flat runtime and catalogue loader; requested country packs are cached on demand;
- direct cross-border trips preload only sampled transit-country packs and attach named, source-backed accommodation candidates to catalogue transit nights without treating estimated access geometry as verified;
- budgets sum the road distance of every canonical day, exclude flight/rail/ferry transfers from fuel distance, and expose generic nightly/activity priors as limited-confidence assumptions rather than sourced prices;
- saved schema-9 and older trips are compacted and rebuilt under the current catalogue and vehicle profile; large derived plans are no longer duplicated in local storage.

### Fixed

- useful proposal generation no longer fails whenever public geocoding/discovery providers are slow or unavailable;
- car output cannot retain motorcycle-accommodation language after a vehicle switch;
- motorcycle secure/covered-parking claims require evidence; otherwise uncertainty is stated explicitly;
- named recommendations are associated with their actual canonical base/day and deduplicated across the itinerary;
- consecutive nights at one base retain one provider-identified accommodation choice, while a real property change is counted against the accommodation-change constraint;
- GPX exports only road days as tracks and retains non-road transfers as explicit logistics metadata;
- catalogue corridor geometry is shared by the itinerary, map and GPX instead of being presentation-only metadata.

### Known data limitations

- static catalogue records do not prove current opening, inventory, price, bookability, route safety, road status or parking security;
- GeoNames population/feature records provide broad touring coverage but are not a substitute for live road restrictions or accommodation inventory;
- some small countries and sparsely mapped areas contain fewer recommendations because records are never padded or fabricated;
- optional public enrichment providers still have usage policies and no production SLA.

## 1.2.0 — 2026-08-05

### Added

- multi-scale, boundary-aware discovery that retains significant gateways and samples beyond the first successful local cluster;
- duration-aware trip-scale objectives for meaningful bases, geographic coverage, nights per base and distinct experiences;
- deterministic constrained beam search for coherent base sequences with explicit highlight omissions and additional-day guidance;
- canonical route segments shared by itinerary, selectable map days, POIs, accommodations and GPX;
- route-/base-aware named OpenStreetMap POIs and multiple accommodation candidates with source, confidence, freshness and unverified status;
- explicit quality dimensions for coverage, base/night allocation, coherence, backtracking, corridor repetition, POI uniqueness/evidence, accommodation evidence, touring-road quality, vehicle fit, completeness and uncertainty;
- structural optimizer change sets with exact before/after state, affected days and full canonical-plan recalculation;
- deterministic regression coverage for weak metropolitan loops, multi-base continuity, ping-pong prevention, portfolio diversity, vehicle timing, named evidence and optimizer integrity;
- Android 412 × 915 release procedure for route lines, markers, named recommendations, budget and exports.

### Fixed

- long country trips can no longer pass normal proposal quality as a tiny urban loop merely because daily travel limits are satisfied;
- night allocation no longer alternates illogically between two non-gateway bases or repeats an attraction to fill the requested duration;
- nearby weak settlements no longer automatically outrank stronger provider-backed touring anchors;
- vehicle changes cancel stale enrichment and rebuild derived recommendations instead of retaining incompatible wording;
- late route/place responses preserve the selected proposal and day state;
- generic fallback recommendations no longer invent offset venue coordinates;
- optimizer suggestions that only alter text, perform no structural mutation or provide negligible benefit are suppressed.

### Changed

- version/build to 1.2.0/1200, engine version to 10 and storage schema to 9;
- schema 8 and older saved requests migrate to schema 9 and force a canonical engine-10 rebuild;
- public place enrichment uses bounded queries, cancellation, deduplication and endpoint failover while retaining explicit partial-result states;
- the zero-catalogue production restriction remains: named-country fixtures are test-only and the dormant runtime `destinations.js` catalogue has been removed entirely.

### Known provider limitations

- public Nominatim, Overpass and OSRM endpoints have usage policies and no production SLA;
- mapped POIs/accommodations do not confirm opening hours, road access, secure parking, price, inventory or availability;
- OSRM geometry is car-profile geometry; motorcycle elapsed time and suitability are recalculated, not advertised as motorcycle-optimized;
- robust high-volume worldwide aggregation requires an optional provider gateway or owned instances, never a shared key in the PWA.

## 1.1.2 — 2026-08-04

- add Photon as a secondary typed-place geocoder and constraint-derived settlement bootstrap;
- add Wikipedia GeoSearch as an independent source of named nearby evidence;
- replace stale Overpass instances and avoid full-country settlement scans;
- make blank destination searches resilient without introducing a destination catalogue;
- turn broad country results into named regional bases instead of a country-centroid stay;
- reject cross-border bootstrap anchors before they can be labelled as part of the requested country;
- allocate multi-base nights chronologically so every stay begins at the previous day's overnight location;
- let three-day loops schedule a real local highlight between outward and return days;
- cancel and ignore stale Android discovery requests;
- distinguish provider outages, unresolved places and exhausted proposal pages.

## 1.1.1 — 2026-08-04

- split large country discovery into bounded anchor and enrichment stages;
- preserve a typed, Nominatim-backed destination when Overpass enrichment is unavailable;
- automatically select a suitable fly-drive, fly-ride or fly-camper access mode for unrealistic direct-road requests;
- guarantee that discovery clears its busy/loading state after provider errors;
- expose degraded provider evidence and hard-constraint adjustments instead of an empty generic failure;
- add production regressions for the repeated Android discovery failure.

## 1.1.0 — 2026-08-04

### Added

- zero-catalogue destination resolution by geographic type and boundary;
- provider-evidence anchors, dynamic region clustering and deterministic constrained route graphs;
- generic highlight omission with constraint reason and additional-day guidance;
- selectable per-day map route layers and day-card highlighting;
- multiple named, vehicle-filtered accommodation candidates where provider data permits;
- recorded acceptance fixtures for South Africa, Croatia, Bulgaria, Namibia and an unknown geocoded region.

### Fixed

- proposal cards no longer render from the old catalogue before live discovery;
- failed discovery cannot substitute unrelated destinations;
- cached discovery identity includes destination resolution, vehicle and material constraints;
- changing vehicle triggers a complete replan and every recommendation carries a canonical vehicle-profile identity;
- Wikimedia Commons selection scans all returned candidates for an open licence;
- Namibia fly-drive planning uses multiple bases and can omit Fish River Canyon under tight limits.

### Changed

- version/build to 1.1.0/1100 and engine/storage schema to 8;
- `destinations.js` removed from the production import path and PWA cache;
- hard-coded dashboard destinations replaced with worldwide neutral onboarding.

## 1.0.0 — 2026-08-04

### Added

- staged global discovery with targeted destination geocoding and no Europe boundary;
- direct, fly-drive, fly-ride, fly-camper and train/ferry journey modes;
- normalized access/rental segments that never invent schedules, fares or bookability;
- loop, out-and-back and multi-modal open-jaw topology with geometric overlap metrics;
- Namibia remote fly-drive/fly-camper fixture;
- provider envelopes, request budgets, timeouts, health, cache and deduplication primitives;
- low/central/high multi-modal budgets for transport, rental and baggage;
- Travel Readiness with official advisory, entry and health links and explicit unverified states;
- local evidence-based preference learning, private mode and export/import primitives;
- deterministic conversational change previews;
- WMO weather icons and vehicle-aware weather suitability;
- open-license Wikimedia Commons imagery with visible attribution;
- 18-dimensional trip-quality model and daily segmented GPX export.

### Changed

- version/build to 1.0.0/1000, engine and storage schema to 7;
- trip duration to 60 days and accommodation-change limit to 20;
- return corridors no longer repeat the outbound route unless out-and-back is selected;
- PWA cache includes every v1 flat runtime module and safely replaces old caches;
- documentation now covers providers, privacy, personalization, uncertainty and global architecture.

## 0.9.0 — 2026-08-04

### Toegevoegd

- portfolio van normaal 6–12 werkelijk verschillende reisvoorstellen met deterministische diversiteitsselectie;
- onbeperkt uitbreidbare bestemmingsontdekking via opeenvolgende, gebundelde OpenStreetMap/Overpass-zoekringen;
- veertien offline fallbackregio's, plus dynamische profielen voor willekeurige ontdekte plaatsen;
- opslaan, afwijzen, vergelijken tot vier, focuskeuzes en herhalingsvrije extra voorstellen;
- harde en zachte voorwaarden met zichtbare trade-offs;
- ontspannen, gebalanceerde en actieve itineraryvarianten vóór het detailplan;
- transparante optimizer met echte wijzigingen, minimumdrempel, locks, selectief toepassen en undo;
- regressietests voor portfolio, discovery, varianten, optimizerintegriteit en herscoren.

### Gewijzigd

- kwaliteitsberekeningen houden interne precisie en ronden alleen voor weergave;
- budget, planning, voorwaarden en kwaliteit worden na iedere geaccepteerde optimalisatie volledig opnieuw berekend;
- de gecureerde bestemminglijst is alleen nog fallback en bepaalt niet langer de omvang van ReisSlim.

## 0.8.0 — 2026-08-04

### Toegevoegd

- constraint-first haalbaarheidspoort voor budget, dagen, dagelijkse totale reistijd en accommodatiewissels;
- afzonderlijke exacte resultaten, maximaal twee begrensde stretch-ideeën en concrete minimale aanpassingen wanneer niets exact past;
- deterministische dagtijdschema's met vertrek-, aankomst-, check-in- en activiteitenvensters;
- live geocoding voor onbekende vertrekplaatsen via gecachete, gebruikersgestuurde Nominatim-zoekopdrachten;
- gebundelde Overpass-zoekopdracht voor benoemde accommodaties, restaurants, bezienswaardigheden, brandstof- en rustplaatsen;
- Open-Meteo-verwachting voor reizen binnen het voorspelbare venster;
- optionele persoonlijke OpenRouteService-sleutel voor voertuigafmetingen en OSRM-fallback voor auto/motor;
- budgetbovengrens en opslagmigratie naar schema 5;
- regressietests voor selectiepoorten, stretchlimieten, minimale aanpassingen, live plaatsnormalisatie en geocoding.

### Gewijzigd

- bestemmingsscores worden alleen binnen dezelfde haalbaarheidscategorie gebruikt;
- afgewezen bestemmingen zijn niet selecteerbaar en krijgen geen normaal reisplan;
- optimalisatie en validatie controleren nu ook dagelijkse tijd en accommodatiewissels;
- kaart, dagkaarten en GPX gebruiken benoemde live plaatsen wanneer beschikbaar en behouden offline fallbacks.

## 0.7.0 — 2026-08-04

### Toegevoegd

- afzonderlijke voertuigprofielen voor auto, motor, camper/motorhome en auto met caravan;
- totale reistijd met voertuigafhankelijke pauzes, brandstofstops, weerreserve en aankomsttijd;
- routevoorkeur, actieradius en afmetingen/gewicht voor grote voertuigen;
- routegeometrie, pauze-/brandstofwaypoints en voertuiggerichte voorstel-lagen op de kaart;
- voorstellen voor overnachten, restaurants, activiteiten, rustpunten en voertuigservice;
- GPX met gedeelde routegeometrie, dagpunten, stops en voorsteltypen;
- optionele TomTom-gateway met server-side sleutel, provider-normalisatie en offline fallback;
- opslagmigratie naar schema 4 en automatische omzetting van het oude `camper`-profiel;
- regressietests voor voertuigtijden, routeverzoeken, live verrijking, aanbevelingen en waypointexports.

### Verbeterd

- bestemmingmatch en budgetraming gebruiken nu het geselecteerde voertuigprofiel;
- corridorstops worden op werkelijke voortgang verdeeld, zodat ongelijke benen tegen de totale daglimiet worden getoetst;
- planningskwaliteit en validatie tonen voertuigmatch, routebron en niet-live aannames;
- kaartlagen maken onderscheid tussen heenreis, terugreis, transfers, overnachtingen, rust, eten en activiteiten.

## 0.6.0 — 2026-08-04

### Toegevoegd

- modulaire, provider-onafhankelijke applicatiearchitectuur;
- offline vertrekcatalogus en routecorridors voor zes Europese regio's;
- deterministische reisdagen, verblijf-, transfer- en flexdagen;
- planning-quality indicator met realisme en transparante aftrekredenen;
- veilige reisoptimalisatie met voor/na-overzicht en éénstaps-undo;
- centrale budgetaannames, parkeer-/boodschappen-/restaurantkosten en ramingvertrouwen;
- GPX-planningstrack met dagelijkse punten en veilige bestandsnamen;
- opslagmigratie naar schema 3 en automatische herberekening van oude plannen;
- Node-testpakket, PWA-controle en GitHub Actions-workflow;
- product-, architectuur-, test- en agentdocumentatie.

### Opgelost

- dag 1 start nu altijd bij de ingevoerde vertrekplaats;
- de laatste dag keert altijd terug naar die vertrekplaats;
- Saasveld wordt niet langer als bestemmingactiviteit gebruikt;
- kaart, budget, dagkaarten en GPX gebruiken hetzelfde planningsmodel;
- te korte reizen worden expliciet gemarkeerd zonder een verkeerd aantal dagen te tonen;
- oude opgeslagen v0.3/v0.5-plannen worden niet blind opnieuw weergegeven;
- dubbele en uiteenlopende engine-implementaties zijn verwijderd;
- service-worker cacheversie en buildreferenties zijn gesynchroniseerd;
- gebruikersinvoer wordt ge-escaped voordat die in dynamische HTML verschijnt.

### Verwijderd

- het ongebruikte `app-bundled.js` uit build 300;
- kunstmatige scorebonussen die geen echte wijziging aan het plan uitvoerden.
