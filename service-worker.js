const CACHE = 'reisslim-v1.1.2-build-1102';
const ASSETS = [
  './', './index.html', './styles.css?v=1102', './app.js?v=1102', './manifest.webmanifest', './icon.svg',
  './config.js?v=1102', './destination-provider.js?v=1102', './geocoding-provider.js?v=1102', './discovery-bootstrap-provider.js?v=1102', './trip-model.js?v=1102', './route-engine.js?v=1102', './route-topology.js?v=1102', './route-graph-engine.js?v=1102', './storage.js?v=1102',
  './destination-engine.js?v=1102', './proposal-engine.js?v=1102', './constraint-engine.js?v=1102', './plan-solver.js?v=1102', './itinerary-engine.js?v=1102', './itinerary-variants.js?v=1102',
  './itinerary-validator.js?v=1102', './budget-engine.js?v=1102', './trip-quality-engine.js?v=1102', './trip-optimizer.js?v=1102', './multimodal-engine.js?v=1102', './provider-platform.js?v=1102',
  './vehicle-intelligence.js?v=1102', './recommendation-engine.js?v=1102', './routing-provider.js?v=1102', './place-provider.js?v=1102', './travel-readiness.js?v=1102', './preference-engine.js?v=1102',
  './assistant-engine.js?v=1102', './weather-engine.js?v=1102', './image-provider.js?v=1102', './map-view.js?v=1102', './gpx-generator.js?v=1102', './ui-renderer.js?v=1102'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
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
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
