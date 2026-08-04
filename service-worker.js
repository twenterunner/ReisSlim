const CACHE = 'reisslim-v0.7.0-build-700';
const ASSETS = [
  './', './index.html', './styles.css?v=700', './app.js?v=700', './manifest.webmanifest', './icon.svg',
  './config.js?v=700', './destinations.js?v=700', './trip-model.js?v=700', './route-engine.js?v=700', './storage.js?v=700',
  './destination-engine.js?v=700', './itinerary-engine.js?v=700', './itinerary-validator.js?v=700', './budget-engine.js?v=700',
  './trip-quality-engine.js?v=700', './trip-optimizer.js?v=700', './vehicle-intelligence.js?v=700', './recommendation-engine.js?v=700',
  './routing-provider.js?v=700', './map-view.js?v=700', './gpx-generator.js?v=700', './ui-renderer.js?v=700'
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
