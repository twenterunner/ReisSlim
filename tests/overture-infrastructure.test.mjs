import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  BoundedRangeCache, buildOverturePlan, createOvertureRangeProxy,
  parseOvertureBBox, PINNED_OVERTURE_RELEASE,
  validateOvertureAsset, validateOverturePlan
} from '../scripts/overture-infrastructure.mjs';
import { normalizeOvertureExtraction } from '../scripts/overture-normalization.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..');
const ASSET_URL = `https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/${PINNED_OVERTURE_RELEASE}/theme=places/type=place/part-00008-fixture-c000.zstd.parquet`;

function fixturePlan(overrides = {}) {
  return buildOverturePlan({
    bbox: [28.02, -26.23, 28.08, -26.17],
    type: 'place',
    assets: [{ id: '00008', url: ASSET_URL, rowCount: 100 }],
    baseId: 'gn-johannesburg',
    countryCode: 'ZA',
    ...overrides
  });
}

test('Overture plans are deterministic and reject untrusted or unpinned assets', () => {
  const secondUrl = ASSET_URL.replace('part-00008-', 'part-00009-');
  const first = buildOverturePlan({
    bbox: '28.02,-26.23,28.08,-26.17', type: 'place',
    assets: [{ id: 'b', url: secondUrl }, { id: 'a', url: ASSET_URL }]
  });
  const second = buildOverturePlan({
    bbox: [28.02, -26.23, 28.08, -26.17], type: 'place',
    assets: [{ id: 'a', url: ASSET_URL }, { id: 'b', url: secondUrl }]
  });
  assert.equal(first.identity, second.identity);
  assert.deepEqual(first.assets.map(asset => asset.id), ['a', 'b']);
  assert.deepEqual(parseOvertureBBox('28.02,-26.23,28.08,-26.17'), { west: 28.02, south: -26.23, east: 28.08, north: -26.17 });
  assert.throws(() => validateOvertureAsset({ id: 'evil', url: 'https://evil.test/release/2026-06-17.0/theme=places/type=place/x.parquet' }, { type: 'place' }), /Untrusted/);
  assert.throws(() => validateOvertureAsset({ id: 'old', url: ASSET_URL.replace('2026-06-17.0', '2026-05-20.0') }, { type: 'place' }), /does not match pinned/);
  assert.throws(() => validateOverturePlan({ ...first, bbox: { ...first.bbox, east: 29 } }), /identity/);
});

test('bounded range cache evicts oldest entries without exceeding its byte limit', () => {
  const cache = new BoundedRangeCache(5);
  cache.set('first', { body: Buffer.from('123') });
  cache.set('second', { body: Buffer.from('456') });
  assert.equal(cache.get('first'), null);
  assert.equal(cache.get('second').body.toString(), '456');
  assert.ok(cache.bytes <= 5);
});

test('localhost proxy permits only allowlisted HEAD and bounded single ranges and caches repeats', async () => {
  const body = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
  const calls = [];
  const upstream = async (_asset, { method, range }) => {
    calls.push({ method, range });
    if (method === 'HEAD') return { status: 200, headers: { 'content-length': String(body.length), 'accept-ranges': 'bytes' }, body: Buffer.alloc(0) };
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range);
    const sliced = body.subarray(Number(start), Number(end) + 1);
    return { status: 206, headers: { 'content-length': String(sliced.length), 'content-range': `bytes ${start}-${end}/${body.length}`, 'accept-ranges': 'bytes' }, body: sliced };
  };
  const proxy = await createOvertureRangeProxy({ plan: fixturePlan(), upstream, maxRangeBytes: 8, maxCacheBytes: 16, maxConcurrency: 2 });
  try {
    const url = proxy.assetUrls['00008'];
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(body.length));
    const full = await fetch(url);
    assert.equal(full.status, 416, 'full GET must never reach the upstream asset');
    const first = await fetch(url, { headers: { range: 'bytes=2-5' } });
    assert.equal(first.status, 206);
    assert.equal(await first.text(), '2345');
    const repeated = await fetch(url, { headers: { range: 'bytes=2-5' } });
    assert.equal(await repeated.text(), '2345');
    const oversized = await fetch(url, { headers: { range: 'bytes=0-12' } });
    assert.equal(oversized.status, 413);
    assert.deepEqual(calls, [{ method: 'HEAD', range: null }, { method: 'GET', range: 'bytes=2-5' }]);
    assert.equal(proxy.metrics.cacheHits, 1);
    assert.equal(proxy.metrics.upstreamBytes, 4);
    assert.equal(proxy.metrics.rejectedRequests, 2);
  } finally {
    await proxy.close();
  }
});

test('Overture apply normalization keeps provenance, rejects irrelevant retail, and never fabricates vehicle fit', async () => {
  const raw = (await readFile(join(ROOT, 'tests/fixtures/overture-places-raw.jsonl'), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const result = normalizeOvertureExtraction(raw, fixturePlan());
  assert.equal(result.records.length, 4);
  assert.deepEqual(result.counts, { pois: 1, accommodations: 1, restaurants: 1, services: 1 });
  assert.equal(result.records.some(record => record.name === 'Irrelevant Shop'), false);
  const hotel = result.records.find(record => record.providerId === 'gers-hotel');
  assert.equal(hotel.vehicleFit.car, 'unknown');
  assert.equal(hotel.vehicleFit.motorcycle, 'unknown');
  assert.deepEqual(hotel.licenceEvidence, ['CDLA-Permissive-2.0']);
  assert.match(hotel.status, /availability and price not verified/);
});

test('offline CLI plan and apply remain separate and deterministic', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reisslim-overture-test-'));
  const planPath = join(directory, 'plan.json');
  const outputPath = join(directory, 'evidence.json');
  try {
    const cli = join(ROOT, 'scripts/overture-catalog.mjs');
    await execFileAsync(process.execPath, [cli, 'plan', '--bbox=28.02,-26.23,28.08,-26.17', '--type=place', `--assets-file=${join(ROOT, 'tests/fixtures/overture-assets.json')}`, `--output=${planPath}`, '--base-id=gn-johannesburg', '--country-code=ZA'], { cwd: ROOT });
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    assert.equal(plan.assets.length, 1);
    assert.equal(plan.baseId, 'gn-johannesburg');
    await execFileAsync(process.execPath, [cli, 'apply', `--plan=${planPath}`, `--input=${join(ROOT, 'tests/fixtures/overture-places-raw.jsonl')}`, `--output=${outputPath}`], { cwd: ROOT });
    const evidence = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(evidence.planIdentity, plan.identity);
    assert.equal(evidence.records.length, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
