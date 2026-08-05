import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  buildOvertureBatchPlan, buildOverturePlan, PINNED_OVERTURE_RELEASE,
  validateOverturePlan
} from '../scripts/overture-infrastructure.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const ASSETS = join(ROOT, 'tests/fixtures/overture-assets.json');
const ASSET_URL = `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${PINNED_OVERTURE_RELEASE}/theme=places/type=place/part-00008-fixture-c000.zstd.parquet`;

function requests() {
  return [
    {
      baseId: 'base-a', countryCode: 'ZA', bbox: [28.02, -26.23, 28.08, -26.17],
      basePoint: { lat: -26.20227, lon: 28.04363, name: 'A' }
    },
    {
      baseId: 'base-b', countryCode: 'ZA', bbox: [18.39, -33.96, 18.47, -33.89],
      basePoint: { lat: -33.92584, lon: 18.42322, name: 'B' }
    }
  ];
}

test('single and batch plans include material base coordinates and deterministic union identity', () => {
  const assetList = [{ id: '00008', url: ASSET_URL }];
  const single = buildOverturePlan({
    bbox: [28.02, -26.23, 28.08, -26.17], type: 'place', assets: assetList,
    baseId: 'base-a', countryCode: 'za'
  });
  assert.deepEqual(single.basePoint, { lat: -26.2, lon: 28.05, name: null, source: 'bbox-center' });
  assert.equal(single.mode, 'single');

  const first = buildOvertureBatchPlan({ type: 'place', countryCode: 'ZA', requests: requests(), assets: assetList });
  const second = buildOvertureBatchPlan({ type: 'place', countryCode: 'ZA', requests: requests().reverse(), assets: assetList });
  assert.equal(first.identity, second.identity);
  assert.equal(first.requests.length, 2);
  assert.deepEqual(first.bbox, { west: 18.39, south: -33.96, east: 28.08, north: -26.17 });
  assert.equal(validateOverturePlan(first).identity, first.identity);
  assert.throws(() => buildOvertureBatchPlan({
    type: 'place', countryCode: 'ZA', requests: [requests()[0], requests()[0]], assets: assetList
  }), /baseIds must be unique/);
  assert.throws(() => buildOverturePlan({
    bbox: [28.02, -26.23, 28.08, -26.17], type: 'place', assets: assetList,
    basePoint: { lat: 0, lon: 0 }
  }), /inside its extraction bbox/);
});

test('offline batch CLI derives one shared asset plan for all requested bases', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reisslim-overture-batch-'));
  const requestPath = join(directory, 'requests.json');
  const planPath = join(directory, 'plan.json');
  try {
    await writeFile(requestPath, `${JSON.stringify({ requests: requests() })}\n`, 'utf8');
    await execFileAsync(process.execPath, [
      join(ROOT, 'scripts/overture-catalog.mjs'), 'plan-batch', '--country-code=ZA', '--type=place',
      `--requests-file=${requestPath}`, `--assets-file=${ASSETS}`, `--output=${planPath}`
    ], { cwd: ROOT, timeout: 30_000 });
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    assert.equal(plan.mode, 'batch');
    assert.equal(plan.requests.length, 2);
    assert.equal(plan.assets.length, 1);
    assert.equal(plan.stac.mode, 'recorded-assets');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bulk plan stage creates one country-theme batch plan, not one plan per base', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reisslim-overture-bulk-'));
  try {
    await execFileAsync(process.execPath, [
      join(ROOT, 'scripts/enrich-catalog-overture.mjs'), '--plan', '--countries=ZA', '--types=place',
      '--bases-per-country=2', `--assets-file=${ASSETS}`, `--cache-dir=${directory}`
    ], { cwd: ROOT, timeout: 60_000 });
    const root = join(directory, 'bulk', PINNED_OVERTURE_RELEASE);
    const plan = JSON.parse(await readFile(join(root, 'za', 'place', 'plan.json'), 'utf8'));
    const report = JSON.parse(await readFile(join(root, 'report-plan.json'), 'utf8'));
    assert.equal(plan.requests.length, 2);
    assert.equal(report.plannedWorkers, 1);
    assert.equal(report.completed, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

