const CACHE = 'reisslim-v1.0.0-build-1000';
const ASSETS = [
  './', './index.html', './styles.css?v=1000', './app.js?v=1000', './manifest.webmanifest', './icon.svg',
  './config.js', './destinations.js', './destination-provider.js', './trip-model.js', './route-engine.js', './route-topology.js', './storage.js',
  './destination-engine.js', './proposal-engine.js', './constraint-engine.js', './plan-solver.js', './itinerary-engine.js', './itinerary-variants.js',
  './itinerary-validator.js', './budget-engine.js', './trip-quality-engine.js', './trip-optimizer.js', './multimodal-engine.js', './provider-platform.js',
  './vehicle-intelligence.js', './recommendation-engine.js', './routing-provider.js', './place-provider.js', './travel-readiness.js', './preference-engine.js',
  './assistant-engine.js', './weather-engine.js', './image-provider.js', './map-view.js', './gpx-generator.js', './ui-renderer.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('reisslim-') && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => response.ok ? response : Promise.reject(new Error('navigation failed'))).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
