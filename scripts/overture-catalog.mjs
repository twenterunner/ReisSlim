#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { CATALOGUE_MANIFEST, CATALOG_VERSION, loadCountryPack } from '../catalog-index.js';
import { boundingBoxForBase, selectImportantBases } from './osm-enrichment.mjs';
import {
  buildOvertureBatchPlan, buildOverturePlan, createOvertureRangeProxy,
  OVERTURE_STAC_HOST, parseOvertureBBox, PINNED_OVERTURE_RELEASE,
  validateOverturePlan
} from './overture-infrastructure.mjs';
import {
  mergePackOvertureEvidence, normalizeOvertureBatchExtraction, normalizeOvertureExtraction
} from './overture-normalization.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const WORKER = join(import.meta.dirname, 'overture-extract.py');
const DEFAULT_CACHE = process.env.REISSLIM_OVERTURE_CACHE || join(tmpdir(), 'reisslim-overture-cache');
const DEFAULT_EXTENSION_DIR = process.env.REISSLIM_DUCKDB_EXTENSION_DIR || join(tmpdir(), 'reisslim-duckdb-extensions');

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const equals = argument.indexOf('=');
    if (equals >= 0) {
      result.set(argument.slice(2, equals), argument.slice(equals + 1));
    } else if (values[index + 1] && !values[index + 1].startsWith('--')) {
      result.set(argument.slice(2), values[++index]);
    } else {
      result.set(argument.slice(2), true);
    }
  }
  return result;
}

function requireOption(options, name) {
  const value = options.get(name);
  if (!value || value === true) throw new Error(`--${name} is required`);
  return String(value);
}

function pythonExecutable(options) {
  return String(options.get('python') || process.env.REISSLIM_CATALOG_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'));
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  await writeFile(temporary, value);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, path);
      return;
    } catch (error) {
      const retryable = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error?.code);
      if (!retryable) throw error;
      if (attempt >= 9) {
        // Some Windows file scanners hold generated JS modules long enough that ReplaceFile-style
        // rename cannot win the race. The complete temporary file remains the source of truth;
        // retry an overwrite-copy, verify its bytes, then remove only that exact temporary file.
        for (let copyAttempt = 0; ; copyAttempt += 1) {
          try {
            await copyFile(temporary, path);
            const written = await readFile(path);
            if (sha256(written) !== sha256(Buffer.from(value))) throw new Error(`Atomic-write fallback verification failed for ${path}`);
            await rm(temporary, { force: true });
            return;
          } catch (copyError) {
            const copyRetryable = process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(copyError?.code);
            if (!copyRetryable || copyAttempt >= 19) throw copyError;
            await new Promise(resolveDelay => setTimeout(resolveDelay, 100 * (copyAttempt + 1)));
          }
        }
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 75 * (attempt + 1)));
    }
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function secureGet(url, { maximumBytes = 2 * 1024 * 1024, timeoutMs = 30_000, retries = 2 } = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const execute = attempt => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== OVERTURE_STAC_HOST) {
        rejectRequest(new Error(`Untrusted STAC URL: ${url}`));
        return;
      }
      const request = https.get({
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        family: 4,
        timeout: timeoutMs,
        rejectUnauthorized: true,
        headers: { 'user-agent': 'ReisSlim-Overture-catalogue/1.0', 'accept-encoding': 'identity' }
      }, response => {
        if (response.statusCode !== 200) {
          response.resume();
          if ([429, 500, 502, 503, 504].includes(response.statusCode) && attempt < retries) {
            setTimeout(() => execute(attempt + 1), 150 * 2 ** attempt);
          } else rejectRequest(new Error(`STAC request returned HTTP ${response.statusCode}`));
          return;
        }
        const chunks = [];
        let bytes = 0;
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maximumBytes) response.destroy(new Error(`STAC response exceeded ${maximumBytes} bytes`));
          else chunks.push(chunk);
        });
        response.on('end', () => resolveRequest(Buffer.concat(chunks)));
        response.on('error', error => {
          if (attempt < retries) setTimeout(() => execute(attempt + 1), 150 * 2 ** attempt);
          else rejectRequest(error);
        });
      });
      request.on('timeout', () => request.destroy(new Error('STAC request timeout')));
      request.on('error', error => {
        if (attempt < retries) setTimeout(() => execute(attempt + 1), 150 * 2 ** attempt);
        else rejectRequest(error);
      });
    };
    execute(0);
  });
}

function runWorker(executable, arguments_, { timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(executable, [WORKER, ...arguments_], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    const interrupt = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    child.on('error', error => {
      clearTimeout(timeout);
      process.removeListener('SIGINT', interrupt);
      rejectWorker(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      process.removeListener('SIGINT', interrupt);
      const output = Buffer.concat(stdout).toString('utf8');
      const errors = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) rejectWorker(new Error(`Overture DuckDB worker failed (${signal || code}): ${errors || output}`));
      else resolveWorker({ stdout: output, stderr: errors });
    });
  });
}

function basePointFromOptions(options) {
  const hasLat = options.has('base-lat');
  const hasLon = options.has('base-lon');
  if (hasLat !== hasLon) throw new Error('--base-lat and --base-lon must be supplied together');
  if (!hasLat) return null;
  return {
    lat: Number(options.get('base-lat')),
    lon: Number(options.get('base-lon')),
    name: options.get('base-name') ? String(options.get('base-name')) : null,
    source: 'explicit-cli'
  };
}

async function pinnedStacPath(options, release) {
  const cache = resolve(String(options.get('cache-dir') || DEFAULT_CACHE));
  await mkdir(cache, { recursive: true });
  const stacPath = options.get('stac-file')
    ? resolve(String(options.get('stac-file')))
    : join(cache, `collections-${release}.parquet`);
  if (!options.get('stac-file')) {
    try { await stat(stacPath); } catch {
      const stacUrl = `https://${OVERTURE_STAC_HOST}/${release}/collections.parquet`;
      await atomicWrite(stacPath, await secureGet(stacUrl));
    }
  }
  const stacBuffer = await readFile(stacPath);
  return {
    stacPath,
    evidence: { mode: 'pinned-stac', release, sha256: sha256(stacBuffer), bytes: stacBuffer.length }
  };
}

async function resolveAssetSet(options, { type, bboxText = null, requests = null, release }) {
  if (options.get('assets-file')) {
    const assetPath = resolve(String(options.get('assets-file')));
    return {
      assets: JSON.parse(await readFile(assetPath, 'utf8')),
      evidence: { mode: 'recorded-assets', path: assetPath }
    };
  }
  const { stacPath, evidence } = await pinnedStacPath(options, release);
  const cache = resolve(String(options.get('cache-dir') || DEFAULT_CACHE));
  const assetOutput = join(cache, `assets-${type}-${Date.now()}-${process.pid}.json`);
  let requestPath = null;
  try {
    const workerArguments = requests
      ? ['resolve-assets-batch', '--stac', stacPath, '--requests', requestPath = join(cache, `requests-${type}-${Date.now()}-${process.pid}.json`), '--type', type, '--output', assetOutput]
      : ['resolve-assets', '--stac', stacPath, '--bbox', bboxText, '--type', type, '--output', assetOutput];
    if (requestPath) await atomicWrite(requestPath, `${JSON.stringify({ requests })}\n`);
    await runWorker(pythonExecutable(options), workerArguments);
    return { assets: JSON.parse(await readFile(assetOutput, 'utf8')), evidence };
  } finally {
    await rm(assetOutput, { force: true });
    if (requestPath) await rm(requestPath, { force: true });
  }
}

function normalizedCountryCode(options) {
  const value = requireOption(options, 'country-code').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) throw new Error('--country-code must be a two-letter ISO code');
  return value;
}

async function batchRequestsForCountry(options) {
  if (options.get('requests-file')) {
    const payload = JSON.parse(await readFile(resolve(String(options.get('requests-file'))), 'utf8'));
    const requests = Array.isArray(payload) ? payload : payload.requests;
    if (!Array.isArray(requests) || !requests.length) throw new Error('--requests-file must contain a non-empty array or { requests }');
    return requests;
  }
  const countryCode = normalizedCountryCode(options);
  const pack = structuredClone(await loadCountryPack(countryCode));
  const maximum = options.has('bases-per-country') ? Number(options.get('bases-per-country')) : null;
  const radiusKm = Number(options.get('radius-km') || 12);
  return selectImportantBases(pack, maximum).map(base => {
    const bounds = boundingBoxForBase(base, radiusKm);
    return {
      baseId: base.id,
      countryCode,
      basePoint: { lat: base.lat, lon: base.lon, name: base.name, source: 'catalog-anchor' },
      bbox: { west: bounds.west, south: bounds.south, east: bounds.east, north: bounds.north }
    };
  });
}

async function planCommand(options) {
  const bboxText = requireOption(options, 'bbox');
  const bbox = parseOvertureBBox(bboxText);
  const type = requireOption(options, 'type');
  if (!['place', 'segment'].includes(type)) throw new Error('--type must be place or segment');
  const output = resolve(requireOption(options, 'output'));
  const release = String(options.get('release') || PINNED_OVERTURE_RELEASE);
  const { assets, evidence: stacEvidence } = await resolveAssetSet(options, { type, bboxText, release });
  const plan = buildOverturePlan({
    bbox, type, assets, release,
    baseId: options.get('base-id') ? String(options.get('base-id')) : null,
    countryCode: options.get('country-code') ? String(options.get('country-code')).toUpperCase() : null,
    basePoint: basePointFromOptions(options)
  });
  await atomicWrite(output, `${JSON.stringify({ ...plan, stac: stacEvidence }, null, 2)}\n`);
  console.log(JSON.stringify({ command: 'plan', output, identity: plan.identity, assets: plan.assets.length, type, bbox }));
}

async function planBatchCommand(options) {
  const type = requireOption(options, 'type');
  if (!['place', 'segment'].includes(type)) throw new Error('--type must be place or segment');
  const output = resolve(requireOption(options, 'output'));
  const release = String(options.get('release') || PINNED_OVERTURE_RELEASE);
  const countryCode = normalizedCountryCode(options);
  const requests = await batchRequestsForCountry(options);
  const { assets, evidence: stacEvidence } = await resolveAssetSet(options, { type, requests, release });
  const plan = buildOvertureBatchPlan({ type, requests, assets, release, countryCode });
  await atomicWrite(output, `${JSON.stringify({ ...plan, stac: stacEvidence }, null, 2)}\n`);
  console.log(JSON.stringify({
    command: 'plan-batch', output, identity: plan.identity, assets: plan.assets.length,
    bases: plan.requests.length, type, countryCode
  }));
}

async function fetchCommand(options) {
  const planPath = resolve(requireOption(options, 'plan'));
  const output = resolve(requireOption(options, 'output'));
  const manifestPath = resolve(String(options.get('manifest') || `${output}.manifest.json`));
  const plan = validateOverturePlan(JSON.parse(await readFile(planPath, 'utf8')));
  const proxy = await createOvertureRangeProxy({
    plan,
    maxRangeBytes: Number(options.get('max-range-bytes') || 8 * 1024 * 1024),
    maxCacheBytes: Number(options.get('max-cache-bytes') || 16 * 1024 * 1024),
    maxConcurrency: Number(options.get('concurrency') || 4)
  });
  const started = Date.now();
  let batchRequestPath = null;
  try {
    const workerCommand = plan.mode === 'batch' ? 'extract-batch' : 'extract';
    const arguments_ = [workerCommand];
    if (plan.mode === 'batch') {
      const cache = resolve(String(options.get('cache-dir') || DEFAULT_CACHE));
      await mkdir(cache, { recursive: true });
      batchRequestPath = join(cache, `extract-requests-${plan.identity}-${process.pid}.json`);
      await atomicWrite(batchRequestPath, `${JSON.stringify({ requests: plan.requests })}\n`);
      arguments_.push('--requests', batchRequestPath);
    } else {
      arguments_.push('--bbox', `${plan.bbox.west},${plan.bbox.south},${plan.bbox.east},${plan.bbox.north}`);
    }
    const requestedRowLimit = Number(options.get('row-limit') || plan.extractionPolicy?.rowLimit);
    if (!Number.isInteger(requestedRowLimit) || requestedRowLimit !== plan.extractionPolicy?.rowLimit) {
      throw new Error(`--row-limit must match the plan extraction policy (${plan.extractionPolicy?.rowLimit})`);
    }
    arguments_.push('--type', plan.type, '--output', output,
      '--extension-dir', resolve(String(options.get('extension-dir') || DEFAULT_EXTENSION_DIR)),
      '--row-limit', String(requestedRowLimit));
    for (const asset of plan.assets) arguments_.push('--url', proxy.assetUrls[asset.id]);
    const worker = await runWorker(pythonExecutable(options), arguments_, { timeoutMs: Number(options.get('timeout-ms') || 30 * 60_000) });
    const raw = await readFile(output);
    const workerSummary = worker.stderr.trim().split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return { message: line }; } });
    const manifest = {
      schemaVersion: 1,
      planIdentity: plan.identity,
      fetchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      output: basename(output),
      outputBytes: raw.length,
      outputSha256: sha256(raw),
      mode: plan.mode,
      bases: plan.mode === 'batch' ? plan.requests.length : 1,
      worker: workerSummary,
      proxy: { ...proxy.metrics, cacheBytes: undefined }
    };
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ command: 'fetch', output, manifest: manifestPath, bytes: raw.length, upstreamBytes: proxy.metrics.upstreamBytes }));
  } finally {
    if (batchRequestPath) await rm(batchRequestPath, { force: true });
    await proxy.close();
  }
}

async function readJsonLines(path) {
  const records = [];
  // Split only on the JSONL delimiter. Node's readline also treats U+2028 as
  // a line boundary, but that character is valid inside a JSON string (for
  // example in a provider address) and must not split a record.
  let remainder = '';
  for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    remainder += chunk;
    let boundary;
    while ((boundary = remainder.indexOf('\n')) >= 0) {
      let line = remainder.slice(0, boundary);
      remainder = remainder.slice(boundary + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.trim()) records.push(JSON.parse(line));
    }
  }
  if (remainder.trim()) records.push(JSON.parse(remainder));
  return records;
}

async function validateFetchManifest(path, input, plan) {
  if (!path) return null;
  const manifest = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (manifest.planIdentity !== plan.identity) throw new Error('Fetch manifest plan identity does not match the extraction plan');
  const details = await stat(input);
  if (Number(manifest.outputBytes) !== details.size) throw new Error('Fetch manifest byte count does not match the raw extraction');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(input)) hash.update(chunk);
  if (manifest.outputSha256 !== hash.digest('hex')) throw new Error('Fetch manifest SHA-256 does not match the raw extraction');
  if (!Number.isFinite(Date.parse(manifest.fetchedAt || ''))) throw new Error('Fetch manifest requires a valid fetchedAt timestamp');
  return manifest;
}

function stampAndCompactEvidence(evidence, manifest) {
  if (manifest) {
    evidence.retrievedAt = manifest.fetchedAt;
    for (const bundle of evidence.bundles || []) bundle.retrievedAt = manifest.fetchedAt;
  }
  if (evidence.mode === 'batch') {
    // The exact raw JSONL and its SHA-256 manifest are the audit artefacts.
    // Do not duplicate them (or the flattened records) in normalized caches.
    delete evidence.rawRecords;
    delete evidence.records;
    for (const bundle of evidence.bundles || []) {
      delete bundle.rawRecords;
      if (evidence.type === 'place') delete bundle.records;
    }
  }
  return evidence;
}

async function applyCommand(options) {
  const plan = validateOverturePlan(JSON.parse(await readFile(resolve(requireOption(options, 'plan')), 'utf8')));
  const input = resolve(requireOption(options, 'input'));
  const output = resolve(requireOption(options, 'output'));
  const manifest = await validateFetchManifest(options.get('manifest'), input, plan);
  const records = await readJsonLines(input);
  const normalized = stampAndCompactEvidence(plan.mode === 'batch'
    ? normalizeOvertureBatchExtraction(records, plan)
    : normalizeOvertureExtraction(records, plan), manifest);
  const appliedRecords = normalized.mode === 'batch'
    ? (normalized.bundles || []).reduce((total, bundle) => total + Number(bundle.counts?.segments || 0)
      + ['pois', 'accommodations', 'restaurants', 'services'].reduce((sum, group) => sum + Number(bundle.sourceAvailable?.[group] || 0), 0), 0)
    : normalized.records.length;
  await atomicWrite(output, `${JSON.stringify(normalized, null, 2)}\n`);
  console.log(JSON.stringify({ command: 'apply', output, inputRecords: records.length, appliedRecords, counts: normalized.counts }));
}

async function readOptionalEvidence(options, name, expectedType) {
  const value = options.get(name);
  if (!value || value === true) return null;
  const path = resolve(String(value));
  const evidence = JSON.parse(await readFile(path, 'utf8'));
  if (evidence.type !== expectedType) throw new Error(`--${name} must contain normalized Overture ${expectedType} evidence`);
  return { path, evidence };
}

function evidenceBundles(evidence) {
  if (!evidence) return [];
  return evidence.mode === 'batch' ? evidence.bundles || [] : [evidence];
}

function countryPackModule(pack) {
  return `// Generated by scripts/overture-catalog.mjs from normalized, pinned source evidence.\nexport const COUNTRY_PACK = Object.freeze(${JSON.stringify(pack)});\n`;
}

async function updateCatalogIndex({ countryCode, merged, output }) {
  const sourcePath = join(ROOT, 'catalog-index.js');
  const source = await readFile(sourcePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const versionLine = lines.findIndex((line) => line.startsWith('export const CATALOG_VERSION'));
  const manifestLine = lines.findIndex((line) => line.startsWith('export const CATALOGUE_MANIFEST'));
  if (!lines[0]?.startsWith('// Generated') || versionLine < 0 || manifestLine < 0) {
    throw new Error('catalog-index.js does not have the expected generated header');
  }
  const manifest = structuredClone(CATALOGUE_MANIFEST);
  if (!manifest[countryCode]) throw new Error(`Country ${countryCode} is absent from the catalogue manifest`);
  manifest[countryCode] = {
    ...manifest[countryCode],
    dataVersion: merged.dataVersion,
    counts: merged.stats,
    recordCounts: merged.stats,
    anchorCount: merged.stats.anchors,
    enrichments: merged.enrichments || {}
  };
  lines[0] = '// Generated by scripts/generate-catalog.mjs and updated by scripts/overture-catalog.mjs.';
  lines[versionLine] = `export const CATALOG_VERSION = ${JSON.stringify(CATALOG_VERSION)};`;
  lines[manifestLine] = `export const CATALOGUE_MANIFEST = Object.freeze(${JSON.stringify(manifest)});`;
  const rebuilt = lines.join('\n');
  await atomicWrite(output, rebuilt);
}

async function mergeCommand(options) {
  const countryCode = requireOption(options, 'country-code').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('--country-code must be a two-letter ISO code');
  const placesInput = await readOptionalEvidence(options, 'places', 'place');
  const segmentsInput = await readOptionalEvidence(options, 'segments', 'segment');
  if (!placesInput && !segmentsInput) throw new Error('At least one of --places or --segments is required');
  for (const input of [placesInput, segmentsInput].filter(Boolean)) {
    if (input.evidence.countryCode && input.evidence.countryCode !== countryCode) {
      throw new Error(`${input.path} belongs to ${input.evidence.countryCode}, not ${countryCode}`);
    }
  }
  const pack = await loadCountryPack(countryCode);
  const placeBundles = evidenceBundles(placesInput?.evidence);
  const segmentBundles = evidenceBundles(segmentsInput?.evidence);
  const merged = mergePackOvertureEvidence(pack, { placeBundles, segmentBundles });
  const packOutput = resolve(String(options.get('pack-output') || join(ROOT, `catalog-${countryCode.toLowerCase()}.js`)));
  const indexOutput = resolve(String(options.get('index-output') || join(ROOT, 'catalog-index.js')));
  await atomicWrite(packOutput, countryPackModule(merged));
  await updateCatalogIndex({ countryCode, merged, output: indexOutput });
  console.log(JSON.stringify({
    command: 'merge', countryCode, packOutput, indexOutput,
    placeBundles: placeBundles.length, segmentBundles: segmentBundles.length,
    dataVersion: merged.dataVersion, counts: merged.stats
  }));
}

function usage() {
  return `Usage:
  node --use-system-ca scripts/overture-catalog.mjs plan --bbox=W,S,E,N --type=place|segment --output=plan.json [--base-id=ID --country-code=ISO --base-lat=N --base-lon=E]
  node --use-system-ca scripts/overture-catalog.mjs plan-batch --country-code=ISO --type=place|segment --output=plan.json [--bases-per-country=N --radius-km=N]
  node --use-system-ca scripts/overture-catalog.mjs fetch --plan=plan.json --output=raw.jsonl [--python=PATH]
  node scripts/overture-catalog.mjs apply --plan=plan.json --input=raw.jsonl --output=evidence.json
  node scripts/overture-catalog.mjs merge --country-code=ISO [--places=places-evidence.json] [--segments=segments-evidence.json]

Plan resolves only pinned STAC metadata. Plan-batch creates one asset allowlist for all scale-derived bases in one country/theme. Fetch writes raw evidence through one localhost-only proxy and one DuckDB worker per plan. Apply normalizes evidence. Merge rewrites only the selected flat country pack and its catalogue-index counts/metadata.`;
}

const [command, ...values] = process.argv.slice(2);
if (!command || ['help', '--help', '-h'].includes(command)) {
  console.log(usage());
} else {
  const options = parseArguments(values);
  if (command === 'plan') await planCommand(options);
  else if (command === 'plan-batch') await planBatchCommand(options);
  else if (command === 'fetch') await fetchCommand(options);
  else if (command === 'apply') await applyCommand(options);
  else if (command === 'merge') await mergeCommand(options);
  else throw new Error(`Unknown command: ${command}\n${usage()}`);
}
