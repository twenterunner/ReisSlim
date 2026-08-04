# Changelog

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
