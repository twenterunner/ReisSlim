#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadCountryPack, SUPPORTED_COUNTRY_CODES } from '../catalog-index.js';
import { auditCatalogueEvidence } from '../catalog-runtime.js';
import { selectImportantBases } from './osm-enrichment.mjs';
import {
  OVERTURE_EXTRACTION_SCHEMA_VERSION,
  PINNED_OVERTURE_RELEASE,
  PINNED_OVERTURE_SCHEMA
} from './overture-infrastructure.mjs';

export const RELEASE_CATEGORY_TARGETS = Object.freeze({
  pois: 5,
  accommodations: 3,
  restaurants: 2,
  services: 1
});

const CATEGORY_ALIASES = Object.freeze({
  pois: ['pois', 'poi'],
  accommodations: ['accommodations', 'accommodation'],
  restaurants: ['restaurants', 'restaurant'],
  services: ['services', 'service'],
  segments: ['segments', 'segment']
});

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function overturePackMetadata(pack) {
  return pack?.enrichments?.overtureMaps || null;
}

function overtureAnchorMetadata(anchor) {
  return anchor?.overtureEnrichment || anchor?.enrichments?.overtureMaps || null;
}

function categoryCount(metadata, category) {
  for (const container of [metadata?.sourceAvailable, metadata?.sourceCounts, metadata?.availableCounts, metadata?.counts]) {
    for (const key of CATEGORY_ALIASES[category]) {
      const result = integer(container?.[key]);
      if (result !== null) return result;
    }
  }
  return null;
}

function recommendationGroup(anchor, category) {
  for (const key of CATEGORY_ALIASES[category]) {
    if (Array.isArray(anchor?.recommendations?.[key])) return anchor.recommendations[key];
  }
  return [];
}

function namedSourceRecord(record) {
  if (!String(record?.name || '').trim() || record?.genericFallback === true) return false;
  if (/^(local|nearby|generic|recommended)\s+(hotel|restaurant|attraction|service)/i.test(record.name)) return false;
  const source = record.source || record.provider;
  const providerId = record.providerId || record.id;
  const sourceUrl = record.sourceUrl || record.url || record.sources?.find(item => item?.url)?.url;
  return Boolean(source && providerId && sourceUrl);
}

function knownVehicleFit(value) {
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return true;
  if (typeof value === 'string') return Boolean(value && normalize(value) !== 'unknown');
  if (!value || typeof value !== 'object') return false;
  const suitability = normalize(value.suitability || value.status);
  const evidence = Array.isArray(value.evidence) ? value.evidence.filter(Boolean) : [];
  return Boolean(suitability && suitability !== 'unknown' && evidence.length);
}

function endpointScope(value) {
  return /endpoint(?:-only|-context)?|corridor-endpoint-context/.test(normalize(value));
}

function sourceRecords(corridor) {
  const direct = typeof corridor?.source === 'object' ? [corridor.source] : [];
  return [...direct, ...(Array.isArray(corridor?.sources) ? corridor.sources : [])];
}

function endpointScopedSource(source) {
  return endpointScope(source?.evidenceScope || source?.routeEvidenceScope || source?.scope);
}

function routeBackedCorridor(corridor) {
  if (endpointScope(corridor?.routeEvidenceScope || corridor?.evidenceScope)) return false;
  const eligibleSources = sourceRecords(corridor).filter(source => !endpointScopedSource(source));
  const provider = [
    typeof corridor?.source === 'string' ? corridor.source : null,
    corridor?.provider,
    ...eligibleSources.map(item => item?.provider)
  ].map(normalize)
    .find(value => value && !/reisslim|derived geodesic|fallback|synthetic/.test(value));
  if (!provider) return false;
  const hasEndpointEvidence = Boolean(corridor?.overtureEndpointEvidence)
    || sourceRecords(corridor).some(endpointScopedSource);
  const explicitFullRoute = /full.?route|route.?backed/.test(normalize(corridor?.routeEvidenceScope || corridor?.evidenceScope))
    || Boolean(corridor?.routeEvidence)
    || Boolean(corridor?.geometrySource && !/fallback|straight.?line|derived geodesic|estimated/i.test(String(corridor.geometrySource)));
  if (hasEndpointEvidence && !explicitFullRoute) return false;
  const ids = [
    corridor.providerId,
    ...eligibleSources.map(source => source?.id),
    ...(!hasEndpointEvidence ? (corridor.sourceIds || []) : [])
  ].filter(Boolean);
  const evidence = [
    ...(Array.isArray(corridor.evidence)
      ? corridor.evidence.filter(item => !/endpoint|full corridor .*not verified/i.test(String(item)))
      : []),
    corridor.roadClass,
    corridor.surface,
    corridor.roadSurface,
    /fallback|straight.?line|derived geodesic|estimated/i.test(String(corridor.geometrySource || '')) ? null : corridor.geometrySource,
    corridor.overtureEvidence,
    corridor.routeEvidence
  ].filter(Boolean);
  return Boolean(ids.length && evidence.length);
}

function endpointContextCorridor(corridor) {
  const endpointSources = sourceRecords(corridor).filter(endpointScopedSource);
  const endpointEvidence = corridor?.overtureEndpointEvidence;
  const explicitlyScoped = endpointScope(corridor?.routeEvidenceScope || corridor?.evidenceScope);
  if (!endpointEvidence && !endpointSources.length && !explicitlyScoped) return false;
  const providerSources = endpointSources.length ? endpointSources : (endpointEvidence ? sourceRecords(corridor) : []);
  const provider = providerSources.map(source => normalize(source?.provider))
    .find(value => value && !/reisslim|derived geodesic|fallback|synthetic/.test(value));
  const ids = [
    ...(Array.isArray(endpointEvidence?.sourceIds) ? endpointEvidence.sourceIds : []),
    ...endpointSources.map(source => source?.id)
  ].filter(Boolean);
  return Boolean(provider && ids.length);
}

function honestlyLabelledEndpointContext(corridor) {
  const geometryLabel = normalize([
    corridor?.geometryType,
    corridor?.geometrySource,
    corridor?.estimateMethod
  ].filter(Boolean).join(' '));
  const conditionLabel = normalize([
    corridor?.routeCondition,
    corridor?.roadCondition,
    corridor?.condition,
    corridor?.uncertainty,
    ...(Array.isArray(corridor?.evidence) ? corridor.evidence : [])
  ].filter(Boolean).join(' '));
  const fallbackGeometry = /fallback|straight.?line|derived geodesic|estimated|indicative|not a road route/.test(geometryLabel);
  const unknownCondition = /unknown|unverified|not verified|not confirmed|niet geverifieerd/.test(conditionLabel);
  return fallbackGeometry && unknownCondition;
}

function validIdentity(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function planIdentities(metadata) {
  return [
    metadata?.placePlanIdentity,
    metadata?.segmentPlanIdentity,
    ...(Array.isArray(metadata?.planIdentities) ? metadata.planIdentities : [])
  ].filter(Boolean);
}

function addFailure(failures, code, message, context = {}) {
  failures.push({ code, message, ...context });
}

export function validateCatalogReleasePack(pack, {
  categoryTargets = RELEASE_CATEGORY_TARGETS,
  requireOverture = true
} = {}) {
  const failures = [];
  const countryCode = String(pack?.country?.code || 'unknown').toUpperCase();
  const requiredBases = selectImportantBases(pack);
  const metadata = overturePackMetadata(pack);
  const overtureSources = pack?.sources?.filter(item => normalize(item?.provider).startsWith('overture maps')) || [];
  const indexedPlanIdentities = new Set(planIdentities(metadata));

  if (requireOverture) {
    if (!metadata) addFailure(failures, 'missing-overture-pack-metadata', `${countryCode}: release pack has no Overture metadata`);
    if (metadata && metadata.schemaVersion !== OVERTURE_EXTRACTION_SCHEMA_VERSION) {
      addFailure(failures, 'stale-overture-schema', `${countryCode}: Overture extraction schema does not match the pinned schema`);
    }
    if (metadata && metadata.release !== PINNED_OVERTURE_RELEASE) {
      addFailure(failures, 'stale-overture-release', `${countryCode}: Overture release ${metadata.release || 'missing'} is not ${PINNED_OVERTURE_RELEASE}`);
    }
    if (metadata && metadata.overtureSchemaVersion !== PINNED_OVERTURE_SCHEMA) {
      addFailure(failures, 'stale-overture-source-schema', `${countryCode}: Overture source schema ${metadata.overtureSchemaVersion || 'missing'} is not ${PINNED_OVERTURE_SCHEMA}`);
    }
    const validSources = overtureSources.filter(source => source.release === PINNED_OVERTURE_RELEASE
      && (source.schemaVersion || source.overtureSchemaVersion || source.schema) === PINNED_OVERTURE_SCHEMA
      && source.license && source.attribution);
    const hasPlacesNotice = validSources.some(source => /permissive|cdla/i.test(source.license));
    const hasTransportationNotice = validSources.some(source => /odbl/i.test(source.license));
    if (!hasPlacesNotice || !hasTransportationNotice) {
      addFailure(failures, 'missing-overture-source-notice', `${countryCode}: pinned Overture source/licence metadata is incomplete`);
    }
    if (!String(pack?.dataVersion || '').includes(`overture-${PINNED_OVERTURE_RELEASE}`)) {
      addFailure(failures, 'stale-pack-data-version', `${countryCode}: dataVersion does not identify the pinned Overture release`);
    }
    if (metadata) {
      if (indexedPlanIdentities.size < 2 || [...indexedPlanIdentities].some(identity => !validIdentity(identity))) {
        addFailure(failures, 'invalid-pack-plan-index', `${countryCode}: pack metadata lacks valid exact extraction-plan identities`);
      }
      const retrievedAt = Date.parse(metadata.retrievedAt || '');
      if (!Number.isFinite(retrievedAt) || retrievedAt < Date.parse(`${PINNED_OVERTURE_RELEASE.slice(0, 10)}T00:00:00Z`)) {
        addFailure(failures, 'stale-pack-retrieval', `${countryCode}: pack retrieval timestamp predates or omits the pinned release`);
      }
    }
  }

  let knownCarBases = 0;
  let knownMotorcycleBases = 0;
  let enrichedBases = 0;
  const requiredIds = new Set(requiredBases.map(anchor => anchor.id));

  for (const anchor of requiredBases) {
    const anchorMetadata = overtureAnchorMetadata(anchor);
    if (!anchorMetadata) {
      addFailure(failures, 'missing-important-base-enrichment', `${countryCode}/${anchor.id}: scale-derived important base lacks Overture enrichment`, { anchorId: anchor.id });
      continue;
    }
    enrichedBases += 1;
    if (anchorMetadata.schemaVersion !== OVERTURE_EXTRACTION_SCHEMA_VERSION
        || anchorMetadata.release !== PINNED_OVERTURE_RELEASE) {
      addFailure(failures, 'stale-important-base-enrichment', `${countryCode}/${anchor.id}: enrichment source/schema version is stale`, { anchorId: anchor.id });
    }
    const identities = planIdentities(anchorMetadata);
    if (identities.length < 2 || identities.some(identity => !validIdentity(identity))) {
      addFailure(failures, 'invalid-cache-plan-identity', `${countryCode}/${anchor.id}: exact place and segment plan identities are required`, { anchorId: anchor.id });
    } else if (identities.some(identity => !indexedPlanIdentities.has(identity))) {
      addFailure(failures, 'unindexed-cache-plan-identity', `${countryCode}/${anchor.id}: base plan identity is absent from pack metadata`, { anchorId: anchor.id });
    }
    const retrievedAt = Date.parse(anchorMetadata.retrievedAt || '');
    if (!Number.isFinite(retrievedAt) || retrievedAt < Date.parse(`${PINNED_OVERTURE_RELEASE.slice(0, 10)}T00:00:00Z`)) {
      addFailure(failures, 'stale-cache-retrieval', `${countryCode}/${anchor.id}: retrieval timestamp predates or omits the pinned release`, { anchorId: anchor.id });
    }

    for (const [category, target] of Object.entries(categoryTargets)) {
      const supported = categoryCount(anchorMetadata, category);
      if (supported === null) {
        addFailure(failures, 'missing-source-coverage-count', `${countryCode}/${anchor.id}: ${category} source-availability count is missing`, { anchorId: anchor.id, category });
        continue;
      }
      const required = Math.min(supported, target);
      const named = recommendationGroup(anchor, category).filter(namedSourceRecord).length;
      if (named < required) {
        addFailure(failures, 'insufficient-named-category-coverage', `${countryCode}/${anchor.id}: ${named}/${required} named ${category} records retained while source supports ${supported}`, {
          anchorId: anchor.id, category, named, required, supported
        });
      }
    }
    if (knownVehicleFit(anchor.vehicleFit?.car)) knownCarBases += 1;
    if (knownVehicleFit(anchor.vehicleFit?.motorcycle)) knownMotorcycleBases += 1;
  }

  if (requiredBases.length && knownCarBases === 0) {
    addFailure(failures, 'universal-unknown-car-suitability', `${countryCode}: all important bases have unknown car suitability`);
  }
  if (requiredBases.length && knownMotorcycleBases === 0) {
    addFailure(failures, 'universal-unknown-motorcycle-suitability', `${countryCode}: all important bases have unknown motorcycle suitability`);
  }
  const actualEnrichedBaseCount = (pack?.anchors || []).filter(anchor => overtureAnchorMetadata(anchor)).length;
  if (metadata && integer(metadata.enrichedBaseCount) !== actualEnrichedBaseCount) {
    addFailure(failures, 'enriched-base-count-mismatch', `${countryCode}: pack metadata counts ${metadata.enrichedBaseCount} enriched bases but ${actualEnrichedBaseCount} are present`);
  }

  const routeCorridors = (pack?.corridors || []).filter(routeBackedCorridor);
  const endpointCandidates = (pack?.corridors || []).filter(corridor => !routeBackedCorridor(corridor) && endpointContextCorridor(corridor));
  const endpointCorridors = endpointCandidates.filter(honestlyLabelledEndpointContext);
  for (const corridor of endpointCandidates.filter(corridor => !honestlyLabelledEndpointContext(corridor))) {
    addFailure(failures, 'dishonest-endpoint-context-label', `${countryCode}/${corridor.id || 'unknown'}: endpoint-only evidence must retain fallback geometry and explicitly unknown/unverified route-condition labels`, {
      corridorId: corridor.id || null
    });
  }
  if (!routeCorridors.length && !endpointCorridors.length) {
    addFailure(failures, 'synthetic-only-corridor-evidence', `${countryCode}: neither full route-backed evidence nor honestly labelled endpoint context is present`);
  }
  const connectedRequiredIds = new Set([...routeCorridors, ...endpointCorridors].flatMap(corridor => [
    corridor.fromAnchorId || corridor.from,
    corridor.toAnchorId || corridor.to
  ]).filter(id => requiredIds.has(id)));
  const sourceSegmentSupport = requiredBases.filter(anchor => (categoryCount(overtureAnchorMetadata(anchor), 'segments') || 0) > 0);
  for (const anchor of sourceSegmentSupport) {
    if (!connectedRequiredIds.has(anchor.id)) {
      addFailure(failures, 'unapplied-source-corridor-evidence', `${countryCode}/${anchor.id}: source reports segments but neither a full route-backed corridor nor labelled endpoint context touches the base`, { anchorId: anchor.id });
    }
  }

  const evidenceAudit = auditCatalogueEvidence(pack);
  if (evidenceAudit.failures.includes('universal-unknown-vehicle-suitability')
      && !failures.some(item => item.code.startsWith('universal-unknown-'))) {
    addFailure(failures, 'universal-unknown-vehicle-suitability', `${countryCode}: catalogue evidence audit found no explicit vehicle suitability`);
  }

  return {
    valid: failures.length === 0,
    failures,
    summary: {
      countryCode,
      requiredBases: requiredBases.length,
      enrichedBases,
      knownCarBases,
      knownMotorcycleBases,
      routeBackedCorridors: routeCorridors.length,
      endpointContextCorridors: endpointCorridors.length,
      sourceBackedCorridors: routeCorridors.length
    }
  };
}

function parseCountries(argument) {
  const value = argument?.split('=')[1];
  if (!value) return SUPPORTED_COUNTRY_CODES;
  const codes = value.split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
  const unknown = codes.filter(code => !SUPPORTED_COUNTRY_CODES.includes(code));
  if (unknown.length) throw new Error(`Unsupported country code(s): ${unknown.join(', ')}`);
  return codes;
}

export function catalogueDataQualityMarkdown(results) {
  const rows = results.map(result => {
    const summary = result.summary;
    return `| ${summary.countryCode} | ${summary.requiredBases} | ${summary.enrichedBases} | ${summary.knownCarBases} | ${summary.knownMotorcycleBases} | ${summary.routeBackedCorridors} | ${summary.endpointContextCorridors} | ${result.valid ? 'Pass' : `Fail (${result.failures.length})`} |`;
  });
  const totals = results.reduce((total, result) => ({
    required: total.required + result.summary.requiredBases,
    enriched: total.enriched + result.summary.enrichedBases,
    car: total.car + result.summary.knownCarBases,
    motorcycle: total.motorcycle + result.summary.knownMotorcycleBases,
    routeCorridors: total.routeCorridors + result.summary.routeBackedCorridors,
    endpointCorridors: total.endpointCorridors + result.summary.endpointContextCorridors,
    failures: total.failures + result.failures.length
  }), { required: 0, enriched: 0, car: 0, motorcycle: 0, routeCorridors: 0, endpointCorridors: 0, failures: 0 });
  const failureDetails = results.flatMap(result => result.failures.map(failure =>
    `- **${result.summary.countryCode} / ${failure.code}:** ${failure.message}`));
  return [
    '# ReisSlim catalogue data-quality report',
    '',
    `Pinned Overture release: \`${PINNED_OVERTURE_RELEASE}\` (schema \`${PINNED_OVERTURE_SCHEMA}\`, extraction schema ${OVERTURE_EXTRACTION_SCHEMA_VERSION}).`,
    '',
    `Result: **${totals.failures ? 'FAIL' : 'PASS'}** — ${totals.enriched}/${totals.required} scale-derived important bases enriched across ${results.length} country packs.`,
    '',
    '| ISO | Important bases | Enriched | Car evidence | Motorcycle evidence | Full route-backed corridors | Endpoint-context corridors | Gate |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    `| **Total** | **${totals.required}** | **${totals.enriched}** | **${totals.car}** | **${totals.motorcycle}** | **${totals.routeCorridors}** | **${totals.endpointCorridors}** | **${totals.failures ? `Fail (${totals.failures})` : 'Pass'}** |`,
    '',
    'Endpoint-context corridors prove only that source transportation evidence exists near a connected base; they do not count as full route-backed evidence. Unknown or absent values remain unknown; this gate checks source provenance and coverage, not live availability, price, opening status, road condition or safety.',
    ...(failureDetails.length ? ['', '## Failures', '', ...failureDetails] : []),
    ''
  ].join('\n');
}

async function runCli() {
  const countries = parseCountries(process.argv.find(argument => argument.startsWith('--countries=')));
  const json = process.argv.includes('--json');
  const results = [];
  for (const code of countries) results.push(validateCatalogReleasePack(await loadCountryPack(code)));
  const failures = results.flatMap(result => result.failures);
  const reportArgument = process.argv.find(argument => argument.startsWith('--report='));
  if (reportArgument) {
    const output = resolve(reportArgument.slice('--report='.length));
    await writeFile(output, catalogueDataQualityMarkdown(results), 'utf8');
  }
  if (json) console.log(JSON.stringify({ valid: failures.length === 0, results }, null, 2));
  else {
    const summary = results.reduce((total, result) => ({
      countries: total.countries + 1,
      requiredBases: total.requiredBases + result.summary.requiredBases,
      enrichedBases: total.enrichedBases + result.summary.enrichedBases,
      routeBackedCorridors: total.routeBackedCorridors + result.summary.routeBackedCorridors,
      endpointContextCorridors: total.endpointContextCorridors + result.summary.endpointContextCorridors
    }), { countries: 0, requiredBases: 0, enrichedBases: 0, routeBackedCorridors: 0, endpointContextCorridors: 0 });
    console.log(`Catalogue release gates: ${summary.enrichedBases}/${summary.requiredBases} important bases enriched across ${summary.countries} countries; ${summary.routeBackedCorridors} full route-backed corridors and ${summary.endpointContextCorridors} endpoint-context corridors.`);
  }
  if (failures.length) throw new Error(`Catalogue release gate failed:\n${failures.slice(0, 80).map(item => `[${item.code}] ${item.message}`).join('\n')}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === resolve(fileURLToPath(import.meta.url))) await runCli();
