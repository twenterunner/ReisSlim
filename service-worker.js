const CACHE = 'reisslim-v1.1.1-build-1101';
const ASSETS = [
  './', './index.html', './styles.css?v=1101', './app.js?v=1101', './manifest.webmanifest', './icon.svg',
  './config.js?v=1101', './destination-provider.js?v=1101', './trip-model.js?v=1101', './route-engine.js?v=1101', './route-topology.js?v=1101', './route-graph-engine.js?v=1101', './storage.js?v=1101',
  './destination-engine.js?v=1101', './proposal-engine.js?v=1101', './constraint-engine.js?v=1101', './plan-solver.js?v=1101', './itinerary-engine.js?v=1101', './itinerary-variants.js?v=1101',
  './itinerary-validator.js?v=1101', './budget-engine.js?v=1101', './trip-quality-engine.js?v=1101', './trip-optimizer.js?v=1101', './multimodal-engine.js?v=1101', './provider-platform.js?v=1101',
  './vehicle-intelligence.js?v=1101', './recommendation-engine.js?v=1101', './routing-provider.js?v=1101', './place-provider.js?v=1101', './travel-readiness.js?v=1101', './preference-engine.js?v=1101',
  './assistant-engine.js?v=1101', './weather-engine.js?v=1101', './image-provider.js?v=1101', './map-view.js?v=1101', './gpx-generator.js?v=1101', './ui-renderer.js?v=1101'
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
