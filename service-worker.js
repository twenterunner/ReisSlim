// AI Running Coach v15.6.79 · build 50679
'use strict';

const BUILD = 50679;
const CACHE = 'arc-v15679-build-50679';
const CACHE_PREFIX = 'arc-v';
const APP_SHELL = './index.html';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=50679',
  './app.js?v=50679',
  './manifest.webmanifest?v=50679',
  './icon-192.png?v=50679',
  './icon-512.png?v=50679',
  './apple-touch-icon.png?v=50679',
  './favicon-32x32.png?v=50679',
  './favicon-16x16.png?v=50679',
  './favicon.ico?v=50679',
  './dynablast-transparent.webp',
  './evoride-transparent.webp',
  './gel-cumulus-transparent.webp',
  './gel-kayano-transparent.webp',
  './gel-nimbus-transparent.webp',
  './gel-pulse-transparent.webp',
  './glideride-transparent.webp',
  './gt-1000-transparent.webp',
  './gt-2000-transparent.webp',
  './magic-speed-transparent.webp',
  './megablast-transparent.webp',
  './metaspeed-edge-transparent.webp',
  './metaspeed-ray-transparent.webp',
  './metaspeed-sky-transparent.webp',
  './noosa-tri-transparent.webp',
  './novablast-4-transparent.webp',
  './novablast-transparent.webp',
  './sonicblast-transparent.webp',
  './superblast-transparent.webp',
];

async function resilientPrecache() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(ASSETS.map(async asset => {
    const request = new Request(asset, { cache: 'reload' });
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(
    resilientPrecache().finally(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(fallback || request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(fallback || request)) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const fresh = new URL(request.url);
    fresh.searchParams.set('build', String(BUILD));
    event.respondWith(networkFirst(new Request(fresh.toString(), request), APP_SHELL));
    return;
  }

  if (/\.(?:js|css|webmanifest)$/i.test(url.pathname)) {
    const fresh = new URL(request.url);
    fresh.searchParams.set('v', String(BUILD));
    event.respondWith(networkFirst(new Request(fresh.toString(), request), request));
    return;
  }

  event.respondWith(networkFirst(request));
});
