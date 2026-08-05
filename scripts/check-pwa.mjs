import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const worker = read('service-worker.js');
const html = read('index.html');
const config = read('config.js');
const app = read('app.js');
const version = config.match(/VERSION = '([^']+)'/)?.[1];
const build = config.match(/BUILD = '([^']+)'/)?.[1];

const failures = [];
if (!version || !build) failures.push('Version or build cannot be read from config.js.');
if (manifest.start_url !== './' || manifest.scope !== './') failures.push('Manifest paths are not project-site relative.');
if (!manifest.icons?.length) failures.push('Manifest has no icon.');
if (!worker.includes(`reisslim-v${version}-build-${build}`)) failures.push('Service-worker cache version is inconsistent.');
if (!worker.includes(`'./app.js?v=${build}'`)) failures.push(`Application shell is missing app.js build ${build}.`);
if (!html.includes(`type="module" src="app.js?v=${build}"`)) failures.push('index.html does not load the versioned module entrypoint.');
const leafletAssets = ['leaflet.css', 'leaflet.js', 'leaflet-marker-icon.png', 'leaflet-marker-icon-2x.png', 'leaflet-marker-shadow.png', 'LEAFLET_LICENSE.txt'];
for (const asset of leafletAssets) {
  if (!existsSync(new URL(asset, root))) failures.push(`Vendored Leaflet asset is missing: ${asset}.`);
}
if (/unpkg\.com\/leaflet|cdn\.jsdelivr\.net\/.*leaflet/i.test(html)) failures.push('Leaflet must load from flat local assets, not a CDN.');
for (const asset of ['./leaflet.css?v=1.9.4', './leaflet.js?v=1.9.4', './leaflet-marker-icon.png', './leaflet-marker-icon-2x.png', './leaflet-marker-shadow.png']) {
  if (!worker.includes(`'${asset}'`)) failures.push(`The offline shell is missing ${asset}.`);
}
for (const module of ['config.js', 'catalog-index.js', 'catalog-locator.js', 'catalog-locator-runtime.js', 'catalog-runtime.js', 'geocoding-provider.js', 'discovery-bootstrap-provider.js', 'itinerary-engine.js', 'multimodal-engine.js', 'travel-readiness.js', 'preference-engine.js', 'assistant-engine.js', 'weather-engine.js', 'image-provider.js']) {
  if (!worker.includes(`'./${module}?v=${build}'`)) failures.push(`The service-worker shell does not cache ${module} for build ${build}.`);
}
if (/['"]\.\/catalog-[a-z]{2}\.js(?:\?v=\d+)?['"]/i.test(worker)) failures.push('Country packs must be cached on demand, not precached with the application shell.');
const staleRuntimeImports = [...app.matchAll(/from ['"]\.\/(.+?\.js)(?:\?v=(\d+))?['"]/g)]
  .filter(([, , importedBuild]) => importedBuild !== build);
if (staleRuntimeImports.length) failures.push(`app.js has unversioned or stale runtime imports: ${staleRuntimeImports.map(match => match[1]).join(', ')}.`);
if (/build=300|v0\.3\.0|v=500|v=601|v=700|v=800|v=900|v0\.6\.0|v0\.7\.0|v0\.8\.0|v0\.9\.0/.test(worker + html)) failures.push('Stale build references remain in the PWA shell.');
if (failures.length) { failures.forEach(item => console.error(`- ${item}`)); process.exit(1); }
console.log('Manifest-, versie- en service-workercontrole geslaagd.');
