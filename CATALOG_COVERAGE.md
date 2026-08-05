# ReisSlim catalogue coverage

Generated deterministically from GeoNames snapshot `geonames-2026-08-05` (2026-08-05) with catalogue version `2026.08-geonames-1`. Every input archive is pinned by byte count and SHA-256 in `scripts/geonames-input-manifest.mjs`.

The checked-in country packs are deterministic offline snapshots generated from the official [GeoNames country extracts](https://download.geonames.org/export/dump/), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). GeoNames supplies the data as-is without a guarantee of accuracy, timeliness or completeness. Individual records link to their GeoNames source.

The packs contain real named GeoNames features only. Counts below are evidence-dependent: small countries are not padded. Missing accommodation, restaurant, parking, road-surface, opening-hours, price and availability evidence remains unknown. Corridors connect nearby real anchors using a geodesic distance estimate and straight fallback geometry; they are not verified road routes. Live routing must replace that geometry when available. Transcontinental packs are explicitly limited to the European touring envelope used during generation.

Totals: **6433 anchors**, **12168 derived adjacency edges**, **34885 POI associations**, **13166 accommodation associations**, **3935 restaurant associations**, and **3677 service associations** across **53 countries**. Each source recommendation is assigned to one nearest qualifying base inside its country pack.

| ISO | Country | Scope | Anchors | Corridors | POIs | Accommodation | Restaurants | Services |
|---|---|---|---:|---:|---:|---:|---:|---:|
| ZA | South Africa | whole-country | 200 | 374 | 1152 | 348 | 100 | 100 |
| NA | Namibia | whole-country | 200 | 372 | 665 | 188 | 60 | 60 |
| AD | Andorra | whole-country | 45 | 84 | 191 | 86 | 5 | 5 |
| AL | Albania | whole-country | 120 | 230 | 675 | 155 | 70 | 64 |
| AM | Armenia | transcontinental-country | 120 | 224 | 702 | 114 | 67 | 42 |
| AT | Austria | whole-country | 120 | 231 | 734 | 399 | 89 | 73 |
| AZ | Azerbaijan | transcontinental-country | 120 | 225 | 670 | 128 | 58 | 25 |
| BA | Bosnia and Herzegovina | whole-country | 120 | 233 | 724 | 225 | 70 | 68 |
| BE | Belgium | whole-country | 120 | 234 | 365 | 243 | 77 | 75 |
| BG | Bulgaria | whole-country | 120 | 216 | 627 | 194 | 78 | 69 |
| BY | Belarus | whole-country | 120 | 223 | 739 | 150 | 89 | 83 |
| CH | Switzerland | whole-country | 120 | 226 | 729 | 391 | 86 | 64 |
| CY | Cyprus | whole-country | 120 | 237 | 684 | 251 | 87 | 77 |
| CZ | Czechia | whole-country | 120 | 228 | 740 | 183 | 73 | 69 |
| DE | Germany | whole-country | 160 | 310 | 1000 | 551 | 117 | 116 |
| DK | Denmark | whole-country | 120 | 231 | 692 | 226 | 74 | 71 |
| EE | Estonia | whole-country | 120 | 228 | 496 | 133 | 70 | 70 |
| ES | Spain | whole-country | 160 | 301 | 997 | 560 | 121 | 110 |
| FI | Finland | whole-country | 120 | 230 | 785 | 345 | 102 | 120 |
| FR | France | whole-country | 160 | 300 | 993 | 562 | 112 | 103 |
| GB | United Kingdom | whole-country | 160 | 292 | 993 | 480 | 116 | 107 |
| GE | Georgia | transcontinental-country | 120 | 229 | 664 | 155 | 70 | 46 |
| GR | Greece | whole-country | 120 | 220 | 797 | 399 | 102 | 111 |
| HR | Croatia | whole-country | 120 | 232 | 663 | 253 | 73 | 87 |
| HU | Hungary | whole-country | 120 | 223 | 735 | 163 | 73 | 70 |
| IE | Ireland | whole-country | 120 | 227 | 708 | 320 | 70 | 71 |
| IS | Iceland | whole-country | 120 | 226 | 776 | 218 | 96 | 92 |
| IT | Italy | whole-country | 160 | 295 | 1000 | 562 | 130 | 102 |
| KZ | Kazakhstan | transcontinental-country | 160 | 299 | 741 | 377 | 30 | 21 |
| LI | Liechtenstein | whole-country | 35 | 64 | 109 | 27 | 5 | 3 |
| LT | Lithuania | whole-country | 120 | 233 | 609 | 127 | 70 | 70 |
| LU | Luxembourg | whole-country | 56 | 111 | 82 | 82 | 30 | 30 |
| LV | Latvia | whole-country | 120 | 227 | 708 | 135 | 68 | 65 |
| MC | Monaco | whole-country | 16 | 21 | 7 | 19 | 3 | 2 |
| MD | Moldova | whole-country | 120 | 243 | 175 | 76 | 69 | 68 |
| ME | Montenegro | whole-country | 120 | 236 | 608 | 260 | 85 | 71 |
| MK | North Macedonia | whole-country | 120 | 223 | 736 | 158 | 70 | 69 |
| MT | Malta | whole-country | 60 | 115 | 211 | 99 | 16 | 16 |
| NL | Netherlands | whole-country | 120 | 229 | 682 | 297 | 81 | 78 |
| NO | Norway | whole-country | 160 | 300 | 998 | 465 | 97 | 102 |
| PL | Poland | whole-country | 160 | 298 | 870 | 304 | 102 | 101 |
| PT | Portugal | whole-country | 120 | 223 | 782 | 434 | 106 | 102 |
| RO | Romania | whole-country | 160 | 298 | 919 | 266 | 81 | 67 |
| RS | Serbia | whole-country | 120 | 234 | 644 | 151 | 71 | 70 |
| RU | Russia | transcontinental-country | 160 | 317 | 986 | 451 | 100 | 100 |
| SE | Sweden | whole-country | 160 | 298 | 1000 | 356 | 108 | 102 |
| SI | Slovenia | whole-country | 120 | 217 | 456 | 179 | 72 | 70 |
| SK | Slovakia | whole-country | 120 | 227 | 596 | 167 | 72 | 68 |
| SM | San Marino | whole-country | 13 | 16 | 11 | 18 | 5 | 5 |
| TR | Türkiye | transcontinental-country | 160 | 297 | 997 | 422 | 101 | 102 |
| UA | Ukraine | whole-country | 160 | 311 | 699 | 213 | 98 | 86 |
| VA | Vatican City | whole-country | 8 | 11 | 15 | 0 | 0 | 0 |
| XK | Kosovo | whole-country | 120 | 239 | 548 | 101 | 60 | 59 |

## Rebuild and validate

```powershell
node --use-system-ca scripts/generate-catalog.mjs
node scripts/generate-catalog.mjs --validate-only
```

Set `REISSLIM_CATALOG_CACHE` to choose the external download cache. Raw inputs are not committed. `--refresh` redownloads the official URLs but still rejects bytes that do not match the pinned manifest; changing a snapshot requires an explicit versioned manifest update.
