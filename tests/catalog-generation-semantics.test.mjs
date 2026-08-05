import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { indexModule } from '../scripts/generate-catalog.mjs';

test('a regenerated catalogue index preserves failed-import eviction and retry semantics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reisslim-generated-index-'));
  try {
    const manifest = {
      TS: {
        code: 'TS', name: 'Testland', aliases: ['Testland'],
        bounds: { south: -1, west: -1, north: 1, east: 1 },
        module: './catalog-ts.js'
      }
    };
    await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
    await writeFile(join(directory, 'catalog-locator.js'),
      "export const CATALOG_LOCATOR = { schemaVersion: 1, catalogVersion: 'fixture', records: [] };\n", 'utf8');
    await writeFile(join(directory, 'catalog-locator-runtime.js'), `
export function createCatalogLocatorRuntime(locator) {
  return {
    resolveLocation: () => null,
    resolveLocationFromPoint: () => null,
    resolveCountryFromPoint: () => null,
    stats: { schemaVersion: locator.schemaVersion, catalogVersion: locator.catalogVersion, records: 0 }
  };
}
`, 'utf8');
    const generatedPath = join(directory, 'catalog-index.js');
    await writeFile(generatedPath, indexModule(manifest), 'utf8');
    const generated = await import(`${pathToFileURL(generatedPath).href}?fixture=${Date.now()}`);

    const cache = new Map();
    const loaded = new Set();
    let attempts = 0;
    const loader = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('recorded generated-loader failure');
      return { COUNTRY_PACK: { country: { code: 'TS' } } };
    };
    await assert.rejects(generated.loadCountryModuleRetryably('TS', loader, cache, loaded), /generated-loader failure/);
    assert.equal(cache.has('TS'), false, 'failed imports must not remain cached in regenerated indexes');
    assert.equal(loaded.has('TS'), false);
    const pack = await generated.loadCountryModuleRetryably('TS', loader, cache, loaded);
    assert.equal(pack.country.code, 'TS');
    assert.equal(attempts, 2);
    assert.equal(loaded.has('TS'), true);
    assert.equal(generated.getLoadedCountryPack('TS'), pack);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
