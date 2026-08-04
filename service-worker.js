const CACHE = 'reisslim-v0.9.0-build-900';
const ASSETS = [
  './', './index.html', './styles.css?v=900', './app.js?v=900', './manifest.webmanifest', './icon.svg',
  './config.js?v=900', './destinations.js?v=900', './destination-provider.js?v=900', './trip-model.js?v=900', './route-engine.js?v=900', './storage.js?v=900',
  './destination-engine.js?v=900', './proposal-engine.js?v=900', './constraint-engine.js?v=900', './plan-solver.js?v=900', './itinerary-engine.js?v=900', './itinerary-variants.js?v=900',
  './itinerary-validator.js?v=900', './budget-engine.js?v=900', './trip-quality-engine.js?v=900', './trip-optimizer.js?v=900',
  './vehicle-intelligence.js?v=900', './recommendation-engine.js?v=900', './routing-provider.js?v=900', './place-provider.js?v=900',
  './map-view.js?v=900', './gpx-generator.js?v=900', './ui-renderer.js?v=900'
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
