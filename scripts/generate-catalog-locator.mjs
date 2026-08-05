#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CATALOG_VERSION, SUPPORTED_COUNTRY_CODES, loadCountryPack } from '../catalog-index.js';
import { buildCatalogLocator, catalogLocatorModule } from './catalog-locator-generator.mjs';

const output = resolve(process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length) || 'catalog-locator.js');
const packs = [];
for (const code of SUPPORTED_COUNTRY_CODES) packs.push(await loadCountryPack(code));
const locator = buildCatalogLocator(packs, CATALOG_VERSION);
await writeFile(output, catalogLocatorModule(locator), 'utf8');
console.log(JSON.stringify({ output, countries: packs.length, records: locator.records.length, catalogVersion: locator.catalogVersion }));
