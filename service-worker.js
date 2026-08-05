const CACHE = 'reisslim-v1.3.0-build-1300';
const ASSETS = [
  './', './index.html', './styles.css?v=1300', './leaflet.css?v=1.9.4', './leaflet.js?v=1.9.4',
  './leaflet-marker-icon.png', './leaflet-marker-icon-2x.png', './leaflet-marker-shadow.png',
  './app.js?v=1300', './manifest.webmanifest', './icon.svg',
  './config.js?v=1300', './catalog-index.js?v=1300', './catalog-locator.js?v=1300', './catalog-locator-runtime.js?v=1300', './catalog-runtime.js?v=1300', './destination-provider.js?v=1300', './geocoding-provider.js?v=1300', './discovery-bootstrap-provider.js?v=1300', './trip-model.js?v=1300', './route-engine.js?v=1300', './route-topology.js?v=1300', './route-graph-engine.js?v=1300', './storage.js?v=1300',
  './destination-engine.js?v=1300', './proposal-engine.js?v=1300', './constraint-engine.js?v=1300', './plan-solver.js?v=1300', './itinerary-engine.js?v=1300', './itinerary-variants.js?v=1300',
  './itinerary-validator.js?v=1300', './budget-engine.js?v=1300', './trip-quality-engine.js?v=1300', './trip-optimizer.js?v=1300', './multimodal-engine.js?v=1300', './provider-platform.js?v=1300',
  './vehicle-intelligence.js?v=1300', './recommendation-engine.js?v=1300', './routing-provider.js?v=1300', './place-provider.js?v=1300', './travel-readiness.js?v=1300', './preference-engine.js?v=1300',
  './assistant-engine.js?v=1300', './weather-engine.js?v=1300', './image-provider.js?v=1300', './map-view.js?v=1300', './gpx-generator.js?v=1300', './ui-renderer.js?v=1300'
];
const PRECACHE_ASSETS = [...new Set(ASSETS.flatMap(asset => {
  const [path, query] = asset.split('?');
  return query && /\.(?:js|css)$/.test(path) ? [asset, path] : [asset];
}))];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('reisslim-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => response.ok ? response : Promise.reject(new Error('navigation failed'))).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(async response => {
      if (!response.ok) return await caches.match(event.request) || response;
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(async response => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  })));
});
