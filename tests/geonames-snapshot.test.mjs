import test from 'node:test';
import assert from 'node:assert/strict';

import { loadCountryPack } from '../catalog-index.js';
import { COUNTRY_SPECS } from '../scripts/catalog-countries.mjs';
import { GEONAMES_SNAPSHOT, geonamesInput } from '../scripts/geonames-input-manifest.mjs';

test('GeoNames catalogue inputs are pinned by exact immutable identities', () => {
  assert.match(GEONAMES_SNAPSHOT.id, /^geonames-\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    new Date(GEONAMES_SNAPSHOT.sourceDateEpoch * 1000).toISOString().slice(0, 10),
    GEONAMES_SNAPSHOT.snapshotDate
  );
  assert.equal(Object.keys(GEONAMES_SNAPSHOT.files).length, COUNTRY_SPECS.length + 2);
  for (const spec of COUNTRY_SPECS) {
    const input = geonamesInput(`${spec.code}.zip`);
    assert.ok(Number.isInteger(input.bytes) && input.bytes > 0, `${spec.code} lacks an exact byte count`);
    assert.match(input.sha256, /^[a-f0-9]{64}$/, `${spec.code} lacks an exact SHA-256`);
  }
  for (const auxiliary of ['countryInfo.txt', 'shapes_simplified_low.json.zip']) {
    assert.match(geonamesInput(auxiliary).sha256, /^[a-f0-9]{64}$/);
  }
  assert.throws(() => geonamesInput('unversioned-current.zip'), /absent from pinned snapshot/);
});

test('runtime packs retain the exact GeoNames snapshot identity', async () => {
  for (const code of ['ZA', 'NA', 'DE', 'FR', 'IT', 'HR', 'BG', 'VA']) {
    const pack = await loadCountryPack(code);
    const expected = geonamesInput(`${code}.zip`);
    assert.equal(pack.generatedAt, GEONAMES_SNAPSHOT.snapshotDate);
    assert.equal(pack.sourceSnapshot?.id, GEONAMES_SNAPSHOT.id);
    assert.deepEqual(
      { bytes: pack.sourceSnapshot?.countryExtract?.bytes, sha256: pack.sourceSnapshot?.countryExtract?.sha256 },
      expected
    );
    assert.equal(pack.sources?.[0]?.inputSha256, expected.sha256);
  }
});
