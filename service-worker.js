const CACHE='reisslim-v1.14.3-build-1930-roadtrip-policy';
const IMAGE_CACHE='reisslim-runtime-images-v2';
const RELEASE_VERSION='1.14.3';
const RELEASE_BUILD='1930';
const ASSETS=[
'./pending-01.webp','./pending-02.webp','./pending-03.webp','./pending-04.webp','./pending-05.webp','./pending-06.webp','./pending-07.webp','./pending-08.webp','./pending-09.webp','./pending-10.webp',
'./pending-11.webp','./pending-12.webp','./pending-13.webp','./pending-14.webp','./pending-15.webp','./pending-16.webp','./pending-17.webp','./pending-18.webp','./pending-19.webp','./pending-20.webp',
'./pending-21.webp','./pending-22.webp','./pending-23.webp','./pending-24.webp','./pending-25.webp','./pending-26.webp','./pending-27.webp','./pending-28.webp','./pending-29.webp','./pending-30.webp',
'./reisslim-icon-192.png','./reisslim-icon-512.png','./planner-hero-clean.webp','./planner-hero-photo-v2.webp','./home-hero-photo-v2.webp','./home-hero-photo.webp','./planner-hero-photo.webp',
'./slovenie.webp','./dolomieten.webp','./harz.webp','./styles.css','./app.js','./roadtrip-policy.js','./overnight-accommodation.js','./regional-overnight-provider.js','./','./index.html',
'./manifest.webmanifest','./compact-ui.css','./config.js','./destinations.js','./destination-provider.js','./trip-model.js','./route-engine.js','./route-topology.js','./storage.js',
'./destination-engine.js','./proposal-engine.js','./constraint-engine.js','./plan-solver.js','./itinerary-engine.js','./itinerary-variants.js','./itinerary-validator.js','./budget-engine.js',
'./trip-quality-engine.js','./trip-optimizer.js','./vehicle-intelligence.js','./recommendation-engine.js','./routing-provider.js','./place-provider.js','./preference-engine.js','./assistant-engine.js',
'./weather-engine.js','./image-provider.js','./map-view.js','./gpx-generator.js','./ui-renderer.js','./ui-feature-flags.js','./poi-gap-filler.js','./pending-overlay-fix.css',
'./roadtrip-runtime-engine.js','./start-new-trip.js','./planner-submit-guard.js','./route-stop-provider-1929.js','./overnight-accommodation-1929.js','./release-sync-1930.js'
];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map(async asset=>{
      try{
        const response=await fetch(asset,{cache:'no-store'});
        if(response&&response.ok)await cache.put(asset,response.clone());
      }catch(error){console.warn('ReisSlim precache overgeslagen',asset,error)}
    }));
  })());
  self.skipWaiting();
});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('reisslim-')&&key!==CACHE&&key!==IMAGE_CACHE).map(key=>caches.delete(key)));await self.clients.claim()})())});
function syncSourceText(text){return String(text)
.replace(/1\.13\.0-1923-data-engine/g,'1.14.3-1930-roadtrip-policy')
.replace(/1\.14\.1-1928-synchronized/g,'1.14.3-1930-roadtrip-policy')
.replace(/1\.14\.2-1929-(?:complete-stops|header-repair)/g,'1.14.3-1930-roadtrip-policy')
.replace(/\?v=(?:1923|1928|1929)\b/g,'?v=1930')
.replace(/version:'1\.13\.0',build:'1923'/g,"version:'1.14.3',build:'1930'")
.replace(/version:'1\.14\.1',build:'1928'/g,"version:'1.14.3',build:'1930'")
.replace(/version:'1\.14\.2',build:'1929'/g,"version:'1.14.3',build:'1930'")
.replace(/\.\/poi-gap-filler\.js\?v=1930/g,'./route-stop-provider-1929.js?v=1930')
.replace(/\.\/overnight-accommodation\.js\?v=1930/g,'./overnight-accommodation-1929.js?v=1930')}
function injectReleaseScript(html){let text=syncSourceText(html).replace(/<script[^>]*release-sync-1928\.js[^>]*><\/script>/gi,'').replace(/<script[^>]*release-sync-1929\.js[^>]*><\/script>/gi,'').replace(/<script[^>]*release-sync-1930\.js[^>]*><\/script>/gi,'');return text.replace(/<\/body>/i,'<script src="./release-sync-1930.js?v=1930"></script></body>')}
async function networkHtml(request){try{const fresh=await fetch(request,{cache:'no-store'});if(!fresh||!fresh.ok)return fresh;const html=injectReleaseScript(await fresh.text()),headers=new Headers(fresh.headers);headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store, max-age=0');return new Response(html,{status:fresh.status,statusText:fresh.statusText,headers})}catch(error){const cached=await caches.match('./index.html');if(!cached)throw error;return new Response(injectReleaseScript(await cached.text()),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, max-age=0'}})}}
async function freshCode(request){const response=await fetch(request,{cache:'no-store'});if(!response||!response.ok)return response;const url=new URL(request.url);if(!/\.js$/i.test(url.pathname))return response;const text=syncSourceText(await response.text()),headers=new Headers(response.headers);headers.set('content-type','text/javascript; charset=utf-8');headers.set('cache-control','no-store, max-age=0');return new Response(text,{status:response.status,statusText:response.statusText,headers})}
function cacheableImageHost(host){return/(?:wikimedia\.org|wikimedia\.com|prismic\.io|squarespace-cdn\.com|cloudinary\.com|unsplash\.com|pexels\.com|pixabay\.com)$/i.test(host)||/(?:^|\.)upload\.wikimedia\.org$/i.test(host)}
async function trim(cache,max=140){const keys=await cache.keys();if(keys.length<=max)return;await Promise.all(keys.slice(0,keys.length-max).map(key=>cache.delete(key)))}
async function cachedImage(request){const cache=await caches.open(IMAGE_CACHE),hit=await cache.match(request);const refresh=fetch(request).then(async response=>{if(response&&(response.ok||response.type==='opaque')){await cache.put(request,response.clone());await trim(cache)}return response}).catch(()=>null);if(hit){void refresh;return hit}const response=await refresh;return response||new Response('',{status:504,statusText:'Image unavailable'})}
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(event.request.destination==='image'&&cacheableImageHost(url.hostname)){event.respondWith(cachedImage(event.request));return}if(url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(networkHtml(event.request));return}const isCode=['script','style','worker'].includes(event.request.destination)||/\.(?:js|css|json|webmanifest)$/i.test(url.pathname);if(isCode){event.respondWith(freshCode(event.request));return}event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))});
