#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { SUPPORTED_COUNTRY_CODES } from '../catalog-index.js';
import { PINNED_OVERTURE_RELEASE } from './overture-infrastructure.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const CONTROLLER = join(import.meta.dirname, 'overture-catalog.mjs');
const DEFAULT_CACHE = process.env.REISSLIM_OVERTURE_CACHE || join(tmpdir(), 'reisslim-overture-cache');

function argumentsMap(values) {
  const result = new Map();
  for (const argument of values) {
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [name, ...rest] = argument.slice(2).split('=');
    result.set(name, rest.length ? rest.join('=') : true);
  }
  return result;
}

function csv(value, fallback) {
  return String(value || fallback).split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
}

function safeNumber(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new RangeError(`Expected a number between ${minimum} and ${maximum}`);
  return number;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function hasExactFetchCache(task) {
  if (!await exists(task.plan) || !await exists(task.raw) || !await exists(task.manifest)) return false;
  try {
    const [plan, manifest, details] = await Promise.all([
      readFile(task.plan, 'utf8').then(JSON.parse),
      readFile(task.manifest, 'utf8').then(JSON.parse),
      stat(task.raw)
    ]);
    if (manifest.planIdentity !== plan.identity || Number(manifest.outputBytes) !== details.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(task.raw)) hash.update(chunk);
    return manifest.outputSha256 === hash.digest('hex');
  } catch {
    return false;
  }
}

function runController(arguments_, { timeoutMs }) {
  return new Promise((resolveRun, rejectRun) => {
    const nodeArguments = ['--use-system-ca', CONTROLLER, ...arguments_];
    const child = spawn(process.execPath, nodeArguments, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    const interrupt = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    child.once('error', error => {
      clearTimeout(timer);
      process.removeListener('SIGINT', interrupt);
      rejectRun(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      process.removeListener('SIGINT', interrupt);
      const output = Buffer.concat(stdout).toString('utf8').trim();
      const errors = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) rejectRun(new Error(`Overture controller failed (${signal || code}): ${errors || output}`));
      else resolveRun({ stdout: output, stderr: errors });
    });
  });
}

const options = argumentsMap(process.argv.slice(2));
const stages = ['plan', 'fetch', 'apply', 'merge'].filter(stage => options.has(stage));
if (stages.length !== 1) throw new Error('Choose exactly one stage: --plan, --fetch, --apply, or --merge');
const stage = stages[0];
const countries = csv(options.get('countries'), SUPPORTED_COUNTRY_CODES.join(','));
const types = csv(options.get('types'), 'place,segment').map(type => type.toLowerCase());
if (countries.some(code => !SUPPORTED_COUNTRY_CODES.includes(code))) throw new Error('One or more --countries values are not supported catalogue ISO codes');
if (types.some(type => !['place', 'segment'].includes(type))) throw new Error('--types accepts only place and/or segment');
const cacheRoot = resolve(String(options.get('cache-dir') || DEFAULT_CACHE));
const releaseRoot = join(cacheRoot, 'bulk', PINNED_OVERTURE_RELEASE);
const continueOnError = options.has('allow-partial');
const timeoutMs = safeNumber(options.get('timeout-ms'), 45 * 60_000, 1_000, 4 * 60 * 60_000);
const extractionTasks = countries.flatMap(countryCode => types.map(type => {
  const directory = join(releaseRoot, countryCode.toLowerCase(), type);
  return {
    countryCode,
    type,
    directory,
    plan: join(directory, 'plan.json'),
    raw: join(directory, 'raw.jsonl'),
    manifest: join(directory, 'raw.manifest.json'),
    evidence: join(directory, 'evidence.json')
  };
}));
const tasks = stage === 'merge'
  ? countries.map(countryCode => ({
      countryCode,
      type: 'country',
      directory: join(releaseRoot, countryCode.toLowerCase()),
      placesEvidence: join(releaseRoot, countryCode.toLowerCase(), 'place', 'evidence.json'),
      segmentsEvidence: join(releaseRoot, countryCode.toLowerCase(), 'segment', 'evidence.json')
    }))
  : extractionTasks;

const results = [];
for (const task of tasks) {
  await mkdir(task.directory, { recursive: true });
  try {
    let commandArguments;
    if (stage === 'merge') {
      if (!await exists(task.placesEvidence)) throw new Error(`Missing place evidence: ${task.placesEvidence}`);
      if (!await exists(task.segmentsEvidence)) throw new Error(`Missing segment evidence: ${task.segmentsEvidence}`);
      commandArguments = [
        'merge',
        `--country-code=${task.countryCode}`,
        `--places=${task.placesEvidence}`,
        `--segments=${task.segmentsEvidence}`
      ];
    } else if (stage === 'plan') {
      commandArguments = ['plan-batch', `--country-code=${task.countryCode}`, `--type=${task.type}`, `--output=${task.plan}`, `--cache-dir=${cacheRoot}`];
      if (options.has('bases-per-country')) commandArguments.push(`--bases-per-country=${options.get('bases-per-country')}`);
      if (options.has('radius-km')) commandArguments.push(`--radius-km=${options.get('radius-km')}`);
      if (options.has('stac-file')) commandArguments.push(`--stac-file=${resolve(String(options.get('stac-file')))}`);
      if (options.has('assets-file')) commandArguments.push(`--assets-file=${resolve(String(options.get('assets-file')))}`);
      if (options.has('python')) commandArguments.push(`--python=${options.get('python')}`);
    } else if (stage === 'fetch') {
      if (!await exists(task.plan)) throw new Error(`Missing plan: ${task.plan}`);
      if (await hasExactFetchCache(task)) {
        results.push({ ...task, status: 'complete', output: 'exact fetch cache reused' });
        console.log(`${task.countryCode}/${task.type}: exact fetch cache reused`);
        continue;
      }
      commandArguments = ['fetch', `--plan=${task.plan}`, `--output=${task.raw}`, `--manifest=${task.manifest}`, `--cache-dir=${cacheRoot}`];
      if (options.has('python')) commandArguments.push(`--python=${options.get('python')}`);
      if (options.has('extension-dir')) commandArguments.push(`--extension-dir=${resolve(String(options.get('extension-dir')))}`);
      if (options.has('row-limit')) commandArguments.push(`--row-limit=${options.get('row-limit')}`);
    } else {
      if (!await exists(task.plan)) throw new Error(`Missing plan: ${task.plan}`);
      if (!await exists(task.raw)) throw new Error(`Missing raw extraction: ${task.raw}`);
      if (!await exists(task.manifest)) throw new Error(`Missing fetch manifest: ${task.manifest}`);
      commandArguments = ['apply', `--plan=${task.plan}`, `--input=${task.raw}`, `--manifest=${task.manifest}`, `--output=${task.evidence}`];
    }
    const run = await runController(commandArguments, { timeoutMs });
    results.push({ ...task, status: 'complete', output: run.stdout.split(/\r?\n/).filter(Boolean).at(-1) || null });
    console.log(`${task.countryCode}/${task.type}: ${stage} complete`);
  } catch (error) {
    results.push({ ...task, status: 'error', error: error.message });
    console.error(`${task.countryCode}/${task.type}: ${error.message}`);
    if (!continueOnError) break;
  }
}

const report = {
  schemaVersion: 1,
  release: PINNED_OVERTURE_RELEASE,
  stage,
  generatedAt: new Date().toISOString(),
  cacheRoot,
  plannedWorkers: tasks.length,
  completed: results.filter(result => result.status === 'complete').length,
  failed: results.filter(result => result.status === 'error').length,
  tasks: results.map(result => ({
    countryCode: result.countryCode,
    type: result.type,
    status: result.status,
    plan: result.plan,
    raw: result.raw,
    evidence: result.evidence,
    placesEvidence: result.placesEvidence,
    segmentsEvidence: result.segmentsEvidence,
    error: result.error || null
  }))
};
await mkdir(releaseRoot, { recursive: true });
await writeFile(join(releaseRoot, `report-${stage}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.failed && !continueOnError) process.exitCode = 1;
