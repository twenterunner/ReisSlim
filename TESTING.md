# Testen

## Alles uitvoeren

```bash
npm run check
```

## Onderdelen

```bash
npm run check:syntax
npm test
npm run check:pwa
```

De deterministische suite controleert onder meer:

- manifestdekking van Zuid-Afrika, Namibië, alle Europese landen, microstaten, Kosovo en relevante transcontinentale landen;
- betekenisvolle aantallen ankers zonder het kunstmatig opvullen van microstaten;
- stabiele IDs, geldige coördinaten, landgrenzen, bronlinks, licenties, laatste controledatum en eerlijke onbekende velden;
- dynamische country-pack imports en afwezigheid van country packs in de application-shell precache;
- planning zonder netwerkverzoeken en zonder een ongerelateerd fallbackland;
- drie tot zes materieel verschillende regionale concepten wanneer de brondekking dit toelaat;
- chronologische continuïteit, meerdere betekenisvolle bases, geografische dekking en geen A→B→A→B-pingpong;
- geen dubbele benoemde POIs of herhaalde vulactiviteiten;
- afzonderlijke auto- en motorroute/tijdkeuzes, rust- en brandstoflogica en volledige voertuigtekstisolatie;
- motorparkingclaims alleen met bronbewijs, anders een expliciete niet-geverifieerdmelding;
- benoemde accommodaties, horeca, activiteiten en services gekoppeld aan de juiste canonical day/base;
- exacte overeenstemming tussen itinerary-segmenten, kaartlagen en GPX-tracks;
- centrale budgetrijen die exact optellen tot het getoonde totaal;
- canonieke wegkilometers en zichtbaar gelabelde, beperkt-vertrouwde overnachtings-/activiteitenprioren in de budgetaannames;
- structurele optimizermutaties en onderdrukking van tekstuele of verwaarloosbare wijzigingen;
- veilige migratie naar schema 10 / engine 11;
- PWA-versie, project-sitepaden en on-demand pack caching.

## Lokale browsercontrole

Start een statische server:

```bash
python -m http.server 8080
```

Controleer in een schone browsercontext:

1. Build 1300 laadt zonder consolefouten.
2. Schakel **Optionele live verrijking** uit en maak reizen voor Zuid-Afrika, Namibië en Duitsland; elk levert bruikbare voorstellen zonder providerverzoek.
3. Controleer meerdere geografisch/structureel verschillende voorstellen en selecteer een plan met meerdere logisch verbonden bases.
4. Controleer dat iedere dag start bij de overnachtingsplaats van de vorige dag en dat de laatste dag correct terugkeert.
5. Wissel auto → motor → auto. Reistijden, stops en voorstellen moeten opnieuw worden opgebouwd; na terugschakelen mag nergens motortaal overblijven.
6. Controleer genoemde POIs en accommodatiekandidaten met bronlink en niet-geverifieerdwaarschuwing.
7. Klik verschillende dagkaarten en controleer route, markers, POIs en accommodatie op de kaart.
8. Exporteer JSON en GPX en vergelijk de dagsegmenten met itinerary en kaart.
9. Pas een optimizerwijziging toe; itinerary, kaart, budget, aanbevelingen en GPX moeten samen veranderen.
10. Herlaad offline een eerder geladen land. De shell en dat country pack moeten bruikbaar blijven; een nooit geladen pack hoeft offline niet beschikbaar te zijn.

## Android 412 × 915 releasecheck

1. Open `https://twenterunner.github.io/ReisSlim/?build=1300` in Chrome op Android.
2. Zie je nog een oude build, kies **Site-instellingen → Opslag → Gegevens wissen**, open de URL opnieuw en controleer `ReisSlim v1.3.0 · Build 1300` onderaan.
3. Zet live verrijking uit en maak een 14-daagse Zuid-Afrika autorondreis. Verwacht meerdere concepten, een regionale multi-base tour, geen kleine stedelijke lus en geen pingpong.
4. Maak een 14-daagse Namibiëreis. Controleer een realistische multi-base route, rijlimieten en expliciete onzekerheid over afgelegen wegen/services.
5. Maak een 10–14-daagse Duitsland- of Frankrijkreis vanaf Saasveld, eerst met auto en daarna met motor. Controleer structurele/tijdverschillen en rust-/brandstofinformatie.
6. Schakel motor terug naar auto en zoek op de pagina naar motortaal; er mag geen voertuigvervuiling overblijven.
7. Open **Reisplan** en controleer unieke dagdoelen plus genoemde, bronvermelde POIs/accommodaties.
8. Open **Kaart**, selecteer meerdere dagen en controleer lijnen/markers zonder horizontale overflow.
9. Download GPX en controleer dat het aantal dagtracks overeenkomt met de kaart en het reisplan.
10. Controleer **Budget**, JSON, opgeslagen reis en een structurele **Verbetering**.
11. Schakel netwerk uit en herlaad het laatst geladen land: shell en pack blijven beschikbaar; live kaarttegels/weer mogen duidelijk ontbreken.

## Releasecheck

Versie en build moeten overeenkomen in `config.js`, `package.json`, `index.html`, `service-worker.js`, README en changelog. De CI-workflow voert `npm run check` uit op pushes en pull requests.
