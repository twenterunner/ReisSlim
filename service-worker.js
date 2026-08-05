const CACHE = 'reisslim-v1.2.0-build-1200';
const ASSETS = [
  './', './index.html', './styles.css?v=1200', './app.js?v=1200', './manifest.webmanifest', './icon.svg',
  './config.js?v=1200', './destination-provider.js?v=1200', './geocoding-provider.js?v=1200', './discovery-bootstrap-provider.js?v=1200', './trip-model.js?v=1200', './route-engine.js?v=1200', './route-topology.js?v=1200', './route-graph-engine.js?v=1200', './storage.js?v=1200',
  './destination-engine.js?v=1200', './proposal-engine.js?v=1200', './constraint-engine.js?v=1200', './plan-solver.js?v=1200', './itinerary-engine.js?v=1200', './itinerary-variants.js?v=1200',
  './itinerary-validator.js?v=1200', './budget-engine.js?v=1200', './trip-quality-engine.js?v=1200', './trip-optimizer.js?v=1200', './multimodal-engine.js?v=1200', './provider-platform.js?v=1200',
  './vehicle-intelligence.js?v=1200', './recommendation-engine.js?v=1200', './routing-provider.js?v=1200', './place-provider.js?v=1200', './travel-readiness.js?v=1200', './preference-engine.js?v=1200',
  './assistant-engine.js?v=1200', './weather-engine.js?v=1200', './image-provider.js?v=1200', './map-view.js?v=1200', './gpx-generator.js?v=1200', './ui-renderer.js?v=1200'
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
