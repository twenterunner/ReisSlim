# ReisSlim catalogue data notice

This notice applies to the **data records inside the generated `catalog-*.js` country packs**. It does not place the ReisSlim application source code under the Open Database License.

## GeoNames-derived records

Touring anchors and some named recommendations are derived from the [GeoNames country extracts](https://download.geonames.org/export/dump/) and retain their GeoNames record IDs and links. GeoNames data is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The required attribution is **GeoNames**.

## OpenStreetMap-derived records

Country-pack fields whose source metadata identifies `OpenStreetMap` are extracted at development time through Overpass from OpenStreetMap data. They are made available under the [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Required attribution: **© OpenStreetMap contributors**. See the [OpenStreetMap copyright and licence page](https://www.openstreetmap.org/copyright).

The generated pack metadata records which bases were enriched, retrieval date, enrichment schema, provider object IDs, source URLs and licence. Raw Overpass responses are cached outside this repository and are not browser runtime dependencies.

If you extract or redistribute a substantial OSM-derived portion of these catalogue data records, review and comply with the ODbL attribution and share-alike requirements. This notice is informational and is not legal advice.

## Overture Maps-derived records

Country-pack records whose provenance identifies **Overture Maps Places** or **Overture Maps Transportation** come from a pinned Overture release. Overture datasets can combine records from multiple upstream sources, so the pack preserves each record's supplied source/licence evidence instead of assigning one blanket licence to every Overture-derived field.

Places evidence must retain the applicable Overture and upstream source notices. Transportation evidence can contain OpenStreetMap-derived data made available under ODbL 1.0 and therefore retains **Â© OpenStreetMap contributors** attribution and the relevant ODbL notice. See the official [Overture attribution guidance](https://docs.overturemaps.org/attribution/) and the source metadata stored in each pack.

The release metadata records the pinned Overture release and schema, exact extraction-plan identities, retrieval date and normalization schema. Raw Parquet ranges, JSONL extraction files and provider caches are development inputs and are not browser dependencies.

## No warranty

GeoNames and OpenStreetMap records can be incomplete or outdated. A named attraction, restaurant, accommodation, fuel stop, road or access tag is evidence that a mapped object existed in the source snapshot. It is not proof of current opening, availability, price, parking security, road condition, legal access or safety.
