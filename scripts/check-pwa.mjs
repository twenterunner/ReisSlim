import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const worker = read('service-worker.js');
const html = read('index.html');
const config = read('config.js');
const version = config.match(/VERSION = '([^']+)'/)?.[1];
const build = config.match(/BUILD = '([^']+)'/)?.[1];

const failures = [];
if (!version || !build) failures.push('Version or build cannot be read from config.js.');
if (manifest.start_url !== './' || manifest.scope !== './') failures.push('Manifest paths are not project-site relative.');
if (!manifest.icons?.length) failures.push('Manifest has no icon.');
if (!worker.includes(`reisslim-v${version}-build-${build}`)) failures.push('Service-worker cache version is inconsistent.');
if (!worker.includes(`'./app.js?v=${build}'`)) failures.push(`Application shell is missing app.js build ${build}.`);
if (!html.includes(`type="module" src="app.js?v=${build}"`)) failures.push('index.html does not load the versioned module entrypoint.');
if (!html.includes(`"./config.js":"./config.js?v=${build}"`)) failures.push('The import map does not version nested modules.');
if (!worker.includes(`'./config.js?v=${build}'`)) failures.push('The service-worker shell does not cache versioned nested modules.');
if (/['"]\.\/(?:config|destinations|destination-provider|trip-model|route-engine|storage|destination-engine|proposal-engine|constraint-engine|plan-solver|itinerary-engine|itinerary-variants|itinerary-validator|budget-engine|trip-quality-engine|trip-optimizer|vehicle-intelligence|recommendation-engine|routing-provider|place-provider|map-view|gpx-generator|ui-renderer)\.js['"]/.test(worker)) failures.push('The service worker still contains unversioned application modules.');
if (/build=300|v0\.3\.0|v=500|v=601|v=700|v=800|v0\.6\.0|v0\.7\.0|v0\.8\.0/.test(worker + html)) failures.push('Stale build references remain in the PWA shell.');
if (failures.length) { failures.forEach(item => console.error(`- ${item}`)); process.exit(1); }
console.log('Manifest-, versie- en service-workercontrole geslaagd.');
