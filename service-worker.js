const CACHE = 'reisslim-v0.8.0-build-800';
const ASSETS = [
  './', './index.html', './styles.css?v=800', './app.js?v=800', './manifest.webmanifest', './icon.svg',
  './config.js?v=800', './destinations.js?v=800', './trip-model.js?v=800', './route-engine.js?v=800', './storage.js?v=800',
  './destination-engine.js?v=800', './constraint-engine.js?v=800', './plan-solver.js?v=800', './itinerary-engine.js?v=800',
  './itinerary-validator.js?v=800', './budget-engine.js?v=800', './trip-quality-engine.js?v=800', './trip-optimizer.js?v=800',
  './vehicle-intelligence.js?v=800', './recommendation-engine.js?v=800', './routing-provider.js?v=800', './place-provider.js?v=800',
  './map-view.js?v=800', './gpx-generator.js?v=800', './ui-renderer.js?v=800'
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
