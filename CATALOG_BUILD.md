# Reproducible catalogue build and release gates

The committed `catalog-*.js` files are release artefacts. A successful GeoNames generation alone is an intermediate result, not a releasable catalogue. Release packs must also contain exact, pinned source evidence for the scale-derived important bases and road corridors.

No step below runs in the browser. Do not commit raw provider downloads, DuckDB extensions, temporary plans or range-cache content.

## Pinned inputs

Record these inputs for every build:

- GeoNames snapshot ID, exact archive URL, byte count, SHA-256 and deterministic source date from `scripts/geonames-input-manifest.mjs`;
- Overture release and schema from `PINNED_OVERTURE_RELEASE` and `PINNED_OVERTURE_SCHEMA`;
- every Overture STAC asset URL and deterministic plan identity;
- raw extraction SHA-256 and retrieval timestamp from the fetch manifest;
- normalization schema version;
- the exact important-base selection produced by `selectImportantBases`;
- per-record provider IDs, source URLs, licences and attribution.

A cached extraction is reusable only when the plan identity, country, base, bounding box, dataset type, asset list, Overture release and normalization schema all match. A filename match is not evidence of identity.

## Three-stage build from official sources

### 1. Generate the base packs

```powershell
npm run catalog:generate
```

The command retrieves or reuses official GeoNames country extracts, verifies every cached or downloaded byte stream against the committed snapshot manifest, validates boundaries and emits deterministic base packs. `generatedAt` comes from that manifest, not the wall clock. If `SOURCE_DATE_EPOCH` is supplied it must match the pinned manifest. A changed mutable upstream archive is rejected until a separately reviewed snapshot/version update records its new identity. If checked-in packs already contain later enrichment, the generator refuses to erase it unless the explicitly documented rebuild path is used.

### 2. Acquire and normalize pinned evidence

Create separate place and transportation plans for every scale-derived important base. The bounding box must come from the base-selection plan, not an arbitrary manual search.

```powershell
npm run catalog:overture:plan -- --bbox=W,S,E,N --type=place --base-id=BASE_ID --country-code=ISO --output=place-plan.json
npm run catalog:overture:plan -- --bbox=W,S,E,N --type=segment --base-id=BASE_ID --country-code=ISO --output=segment-plan.json
npm run catalog:overture:fetch -- --plan=place-plan.json --output=place-raw.jsonl --manifest=place-raw.manifest.json
npm run catalog:overture:fetch -- --plan=segment-plan.json --output=segment-raw.jsonl --manifest=segment-raw.manifest.json
npm run catalog:overture:apply -- --plan=place-plan.json --input=place-raw.jsonl --manifest=place-raw.manifest.json --output=place-evidence.json
npm run catalog:overture:apply -- --plan=segment-plan.json --input=segment-raw.jsonl --manifest=segment-raw.manifest.json --output=segment-evidence.json
```

`plan` uses pinned official STAC metadata. `fetch` permits only HTTPS assets on the Overture allowlist and bounded byte ranges through a localhost proxy. `apply` is offline, verifies the plan identity and normalizes evidence without inventing suitability. Preserve the plan, fetch manifest and normalized evidence in the external catalogue cache used by the release process.

For the complete supported-country set, the equivalent reproducible batch workflow is:

```powershell
npm run catalog:overture:bulk:plan
npm run catalog:overture:bulk:fetch
npm run catalog:overture:bulk:apply
npm run catalog:overture:bulk:merge
```

Set `REISSLIM_OVERTURE_CACHE` to a durable external cache. The bulk fetch reuses a raw extraction only after matching the complete plan identity, byte count and SHA-256 manifest. The bulk merge requires both normalized place and transportation evidence for each selected country.

### 3. Merge, validate and publish

The deterministic merge stage associates place evidence only with the named base in its verified plan. Transportation records describe the verified road context around that base. That endpoint context may be attached to an existing catalogue corridor touching the same base, but it is explicitly labelled endpoint-only and is never presented as proof of the complete corridor geometry or condition. The merged pack records both place and segment plan identities, source availability counts, retrieval time, Overture release/schema, licences and attribution.

Run the release gate after all bundles have been merged:

```powershell
npm run check:catalog:release
npm run catalog:quality-report
npm run catalog:coverage-report
```

The second command writes the committed `CATALOG_DATA_QUALITY.md` summary only after running the same strict evidence gates.

The gate fails when:

- any scale-derived important base lacks pinned Overture metadata;
- a named category has fewer retained records than the recorded source supports, up to the category target;
- all important bases have unknown car or motorcycle suitability;
- corridors contain neither full route-backed evidence nor honestly labelled source endpoint context;
- source records, plan identities, retrieval timestamps, pack data version, Overture release or schemas are missing or stale;
- transportation evidence exists for an important base but no full route-backed corridor or honestly labelled endpoint-context corridor touches that base.

Small countries are not padded. If a source count is explicitly zero, the gate does not require an invented recommendation.
The report counts full route-backed corridors and endpoint-context corridors separately. Endpoint context may satisfy the source-connectivity gate, but it never upgrades fallback geometry or unknown route condition into verified full-route evidence.

## Two-stage rebuild from an exact cache

When every required place and segment bundle already exists in a durable external cache, a release rebuild has two logical stages:

1. regenerate the GeoNames base packs;
2. reapply the exact cached normalized bundles, then run `npm run check:catalog:release`.

The second stage must validate each cached plan identity and source version before merging. Never fall back to evidence from another base, bounding box, country or Overture release. Never publish the un-enriched intermediate packs if a cache entry is missing.

## Category targets

For each important base, the release validator requires up to:

- five named POIs;
- three named accommodations;
- two named restaurants or cafés;
- one named service.

These are release minima only when the normalized source-availability count says the category exists. Each retained record must have a real name, provider identity and source URL. Availability, opening status, price, parking security and road condition remain unverified unless separately supported.

## Licence boundary

GeoNames, Overture Places, Overture Transportation and upstream records do not necessarily share one licence. Keep their provenance and notices per record and per pack; do not replace them with a single generic “open data” label. See `CATALOG_DATA_NOTICE.md` for redistribution obligations and `API_SOURCES.md` for source-specific controls.
