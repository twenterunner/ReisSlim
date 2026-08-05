import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CATALOG_VERSION,
  CATALOGUE_MANIFEST,
  getLoadedCountryPack,
  SUPPORTED_COUNTRY_CODES,
  getLoadedCountryCodes,
  loadCountryPack,
  resetCatalogueCache,
  resolveCatalogCountry
} from '../catalog-index.js';

const REQUIRED_CODES = [
  'ZA', 'NA',
  'AD', 'AL', 'AM', 'AT', 'AZ', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ',
  'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GE', 'GR', 'HR', 'HU', 'IE',
  'IS', 'IT', 'KZ', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT',
  'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'TR',
  'UA', 'VA', 'XK'
];

const MICROSTATES = new Set(['AD', 'LI', 'MC', 'SM', 'VA']);
const LARGE_ACCEPTANCE_PACKS = new Set(['ZA', 'NA']);
const EXPECTED_BOUNDARY_ENVELOPES = {
  ZA: { south: -36, west: 15, north: -21, east: 34 },
  NA: { south: -30, west: 11, north: -16, east: 26 },
  DE: { south: 47, west: 5, north: 56, east: 16 },
  FR: { south: 41, west: -6, north: 52, east: 10 },
  GB: { south: 49, west: -9, north: 62, east: 3 },
  CZ: { south: 48, west: 11, north: 52, east: 20 },
  AZ: { south: 37, west: 44, north: 43, east: 52 }
};
const GENERIC_NAME = /^(?:local |nearby )?(?:hotel|accommodation|motorcycle accommodation|restaurant|caf(?:e|é)|scenic attraction|attraction|point of interest|fuel stop|rest stop|service point)(?: near (?:the )?(?:route|base))?$/i;
const RECOMMENDATION_FEATURE_CODES = {
  accommodations: new Set(['HTL', 'INN', 'GHSE', 'RHSE', 'CMP', 'CMPL', 'CMPLA', 'HUT', 'RSRT']),
  restaurants: new Set(['REST', 'CAFE']),
  services: new Set(['HLT', 'PKLT', 'FY', 'FYT', 'TOLL'])
};

function entryAnchorCount(entry) {
  return Number(entry?.recordCounts?.anchors ?? entry?.counts?.anchors ?? entry?.coverage?.anchors
    ?? entry?.coverage?.anchorCount ?? entry?.anchorCount ?? 0);
}

function allRecommendations(anchor) {
  return Object.values(anchor?.recommendations || {}).flat().filter(Boolean);
}

function validCoordinates(item) {
  return Number.isFinite(Number(item?.lat))
    && Number.isFinite(Number(item?.lon))
    && Number(item.lat) >= -90 && Number(item.lat) <= 90
    && Number(item.lon) >= -180 && Number(item.lon) <= 180;
}

test('catalogue manifest covers South Africa, Namibia, Europe, microstates, Kosovo and transcontinental countries', () => {
  assert.match(String(CATALOG_VERSION), /^\d+\.\d+/);
  assert.equal(new Set(SUPPORTED_COUNTRY_CODES).size, SUPPORTED_COUNTRY_CODES.length, 'country codes must be unique');
  for (const code of REQUIRED_CODES) {
    assert.ok(SUPPORTED_COUNTRY_CODES.includes(code), `missing supported country ${code}`);
    const entry = CATALOGUE_MANIFEST[code];
    assert.ok(entry, `missing manifest entry ${code}`);
    assert.match(entry.generatedAt, /^\d{4}-\d{2}-\d{2}/, `${code} lacks generation date`);
    assert.equal(entry.catalogVersion, CATALOG_VERSION, `${code} has inconsistent catalogue version`);
    assert.ok(entry.source?.provider && entry.source?.url && entry.source?.license, `${code} lacks source and licence metadata`);
  }
});

test('country resolution accepts names and ISO codes without substituting an unrelated country', () => {
  assert.equal(resolveCatalogCountry('South Africa')?.code, 'ZA');
  assert.equal(resolveCatalogCountry('namibia')?.code, 'NA');
  assert.equal(resolveCatalogCountry('DE')?.code, 'DE');
  assert.equal(resolveCatalogCountry('Kosovo')?.code, 'XK');
  assert.equal(resolveCatalogCountry('Atlantis'), null);
  assert.equal(resolveCatalogCountry(''), null);
});

test('manifest reports meaningful anchor coverage while microstates are not padded', () => {
  for (const code of LARGE_ACCEPTANCE_PACKS) {
    const count = entryAnchorCount(CATALOGUE_MANIFEST[code]);
    assert.ok(count >= 100, `${code} should expose at least 100 evidence-backed anchors, received ${count}`);
    assert.ok(count <= 250, `${code} anchor count ${count} suggests unbounded or padded catalogue output`);
  }

  for (const code of MICROSTATES) {
    const count = entryAnchorCount(CATALOGUE_MANIFEST[code]);
    assert.ok(count > 0, `${code} should contain its supported meaningful anchors`);
    assert.ok(count < 100, `${code} must not be padded to the normal-country target`);
  }
});

test('South Africa pack preserves significant touring bases and rejects metropolitan slot padding', async () => {
  const pack = await loadCountryPack('ZA');
  const normalizedNames = new Set(pack.anchors.map(anchor => anchor.name.toLocaleLowerCase('en')));
  const regions = new Set(pack.anchors.map(anchor => anchor.adminRegion).filter(Boolean));
  const latitudes = pack.anchors.map(anchor => anchor.lat);
  const longitudes = pack.anchors.map(anchor => anchor.lon);

  assert.ok(normalizedNames.has('knysna'), 'evidence-backed Knysna must survive country ranking');
  assert.ok(normalizedNames.has('oudtshoorn'), 'evidence-backed Oudtshoorn must survive country ranking');
  assert.equal(pack.anchors.some(anchor => anchor.significance?.featureCode === 'PPLX'), false,
    'sections of populated places must not consume touring-anchor slots');
  assert.ok(regions.size >= 8, `South Africa catalogue should span provinces; received ${regions.size}`);
  assert.ok(Math.max(...latitudes) - Math.min(...latitudes) > 10, 'South Africa anchors lack north-south coverage');
  assert.ok(Math.max(...longitudes) - Math.min(...longitudes) > 10, 'South Africa anchors lack east-west coverage');
});

test('country boundaries reject source outliers and remain within the intended geographic scope', () => {
  for (const [code, envelope] of Object.entries(EXPECTED_BOUNDARY_ENVELOPES)) {
    const bounds = CATALOGUE_MANIFEST[code]?.bounds;
    assert.ok(bounds, `${code} has no boundary evidence`);
    assert.ok(bounds.south >= envelope.south && bounds.west >= envelope.west
      && bounds.north <= envelope.north && bounds.east <= envelope.east,
    `${code} bounds contain an out-of-country source outlier: ${JSON.stringify(bounds)}`);
  }
});

test('representative country packs have stable IDs, coordinates, provenance and honest unknowns', async () => {
  for (const code of ['ZA', 'NA', 'DE', 'FR', 'GB', 'CZ', 'AZ', 'VA']) {
    const pack = await loadCountryPack(code);
    assert.equal(pack.country.code, code);
    assert.ok(pack.anchors.length > 0, `${code} has no anchors`);
    const manifestCounts = CATALOGUE_MANIFEST[code].recordCounts || CATALOGUE_MANIFEST[code].counts;
    const packRecommendations = pack.anchors.flatMap(allRecommendations);
    assert.equal(manifestCounts.anchors, pack.anchors.length, `${code} manifest anchor count is stale`);
    assert.equal(manifestCounts.corridors, pack.corridors.length, `${code} manifest corridor count is stale`);
    assert.equal(manifestCounts.namedRecommendations, packRecommendations.length, `${code} manifest recommendation count is stale`);
    assert.equal(new Set(pack.anchors.map(anchor => anchor.id)).size, pack.anchors.length, `${code} contains duplicate anchor IDs`);

    for (const anchor of pack.anchors) {
      assert.equal(anchor.countryCode, code);
      assert.ok(anchor.name && !GENERIC_NAME.test(anchor.name), `${code}/${anchor.id} has a generic name`);
      assert.ok(validCoordinates(anchor), `${code}/${anchor.id} has invalid coordinates`);
      const envelope = EXPECTED_BOUNDARY_ENVELOPES[code];
      if (envelope) assert.ok(anchor.lat >= envelope.south && anchor.lat <= envelope.north
        && anchor.lon >= envelope.west && anchor.lon <= envelope.east,
      `${code}/${anchor.id} lies outside the intended country scope`);
      assert.ok(Array.isArray(anchor.sources) && anchor.sources.length > 0, `${code}/${anchor.id} lacks provenance`);
      assert.ok(anchor.sources.every(source => (source.provider || source.name)
        && (source.providerId || source.id) && (source.sourceUrl || source.url)), `${code}/${anchor.id} has incomplete provenance`);
      assert.match(anchor.lastChecked, /^\d{4}-\d{2}-\d{2}/, `${code}/${anchor.id} lacks a last-checked date`);
      assert.ok(anchor.vehicleFit && Object.hasOwn(anchor.vehicleFit, 'car') && Object.hasOwn(anchor.vehicleFit, 'motorcycle'));
      assert.notEqual(anchor.roadSurface, '', 'unknown road surface must be null, not fabricated text');
      assert.notEqual(anchor.seasons, '', 'unknown seasons must be null or an evidence array');
    }
  }
});

test('named catalogue recommendations are associated with their base and carry source evidence', async () => {
  for (const code of ['ZA', 'NA', 'DE']) {
    const pack = await loadCountryPack(code);
    const baseIds = new Set(pack.anchors.map(anchor => anchor.id));
    const recommendations = pack.anchors.flatMap(allRecommendations);
    assert.ok(recommendations.length > 0, `${code} contains no named recommendations`);
    assert.equal(new Set(recommendations.map(item => item.id)).size, recommendations.length, `${code} recommendation IDs are not unique`);
    assert.equal(new Set(recommendations.map(item => `${item.provider}:${item.providerId}`)).size, recommendations.length,
      `${code} assigns the same provider place to more than one base`);

    for (const item of recommendations) {
      assert.ok(item.name && !GENERIC_NAME.test(item.name), `${code}/${item.id} has fabricated generic wording`);
      assert.ok(baseIds.has(item.baseId), `${code}/${item.id} references unknown base ${item.baseId}`);
      assert.ok(item.provider && item.providerId && item.sourceUrl, `${code}/${item.id} lacks provenance`);
      assert.ok(validCoordinates(item), `${code}/${item.id} has invalid coordinates`);
      assert.equal(item.status.includes('verified') && !item.status.includes('not verified'), false, `${code}/${item.id} overclaims verification`);
    }

    for (const anchor of pack.anchors) {
      for (const [group, allowedCodes] of Object.entries(RECOMMENDATION_FEATURE_CODES)) {
        for (const item of anchor.recommendations?.[group] || []) {
          if (item.provider === 'GeoNames') {
            assert.ok(allowedCodes.has(item.evidence?.featureCode),
              `${code}/${item.id} is misclassified as ${group}: GeoNames ${item.evidence?.featureCode}`);
          } else {
            const expectedCategory = { pois: 'poi', accommodations: 'accommodation', restaurants: 'restaurant', services: 'service' }[group];
            assert.equal(item.category, expectedCategory, `${code}/${item.id} has inconsistent ${item.provider} category evidence`);
            assert.ok(item.type && Array.isArray(item.sources) && item.sources.length,
              `${code}/${item.id} lacks non-GeoNames classification provenance`);
          }
        }
      }
    }
  }
});

test('country packs are dynamically loaded and are not part of the PWA application-shell precache', async () => {
  const indexSource = await readFile(new URL('../catalog-index.js', import.meta.url), 'utf8');
  const serviceWorkerSource = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(indexSource, /import\s*\(/, 'catalog-index must use dynamic imports');
  assert.doesNotMatch(indexSource, /^\s*import\s+.*catalog-[a-z]{2}\.js/m, 'country packs must not be eagerly imported');
  assert.doesNotMatch(serviceWorkerSource, /['"]\.\/catalog-[a-z]{2}\.js['"]/i, 'country packs must not be precached with the shell');

  resetCatalogueCache();
  assert.deepEqual(getLoadedCountryCodes(), []);
  const za = await loadCountryPack('ZA');
  assert.deepEqual(getLoadedCountryCodes(), ['ZA']);
  assert.equal(getLoadedCountryPack('ZA'), za);
  assert.equal(getLoadedCountryPack('DE'), null);
  const de = await loadCountryPack('DE');
  assert.deepEqual(new Set(getLoadedCountryCodes()), new Set(['ZA', 'DE']));
  assert.equal(za.country.code, 'ZA');
  assert.equal(de.country.code, 'DE');
  assert.equal(await loadCountryPack('Atlantis'), null);
  resetCatalogueCache();
  assert.equal(getLoadedCountryPack('ZA'), null);
});
