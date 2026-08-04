const CACHE = 'reisslim-v0.6.0-build-601';
const ASSETS = [
  './', './index.html', './styles.css?v=601', './app.js?v=601', './manifest.webmanifest', './icon.svg',
  './config.js', './destinations.js', './trip-model.js', './route-engine.js', './storage.js',
  './destination-engine.js', './itinerary-engine.js', './itinerary-validator.js', './budget-engine.js',
  './trip-quality-engine.js', './trip-optimizer.js', './map-view.js', './gpx-generator.js', './ui-renderer.js'
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
