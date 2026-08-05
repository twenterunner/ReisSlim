import { loadCountryPack, SUPPORTED_COUNTRY_CODES } from '../catalog-index.js';
import { OSM_ENRICHMENT_SCHEMA_VERSION, selectImportantBases } from './osm-enrichment.mjs';

const requireAll = process.argv.includes('--require-all');
const failures = [];
const summary = [];

for (const code of SUPPORTED_COUNTRY_CODES) {
  const pack = await loadCountryPack(code);
  const expected = selectImportantBases(pack);
  const enrichedIds = new Set(pack.anchors.filter(anchor => anchor.osmEnrichment).map(anchor => anchor.id));
  const missing = expected.filter(anchor => !enrichedIds.has(anchor.id)).map(anchor => anchor.id);
  const metadata = pack.enrichments?.openStreetMap;
  const source = pack.sources?.find(item => item.provider === 'OpenStreetMap');
  if (metadata && metadata.schemaVersion !== OSM_ENRICHMENT_SCHEMA_VERSION) failures.push(`${code}: OSM schema mismatch`);
  if (metadata && (!source || source.license !== 'ODbL 1.0' || !source.attribution?.includes('OpenStreetMap contributors'))) {
    failures.push(`${code}: enriched pack lacks ODbL source/attribution metadata`);
  }
  if (requireAll && (!metadata || missing.length)) failures.push(`${code}: ${missing.length || expected.length} important bases lack OSM enrichment`);
  for (const anchor of pack.anchors.filter(item => item.osmEnrichment)) {
    const recommendations = Object.values(anchor.recommendations || {}).flat().filter(item => item.provider === 'OpenStreetMap');
    for (const item of recommendations) {
      if (!item.name || !item.providerId?.includes('/') || !item.sourceUrl?.startsWith('https://www.openstreetmap.org/')) {
        failures.push(`${code}/${anchor.id}: malformed normalized OSM recommendation`);
      }
    }
  }
  summary.push({ code, expected: expected.length, enriched: enrichedIds.size, missing: missing.length });
}

if (failures.length) throw new Error(`OSM enrichment validation failed:\n${failures.slice(0, 50).join('\n')}`);
const totals = summary.reduce((result, item) => ({
  expected: result.expected + item.expected,
  enriched: result.enriched + item.enriched,
  missing: result.missing + item.missing
}), { expected: 0, enriched: 0, missing: 0 });
console.log(`Validated OSM enrichment metadata: ${totals.enriched}/${totals.expected} important bases enriched; ${totals.missing} pending${requireAll ? ' (release-required)' : ''}.`);
