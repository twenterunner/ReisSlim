# Changelog

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
