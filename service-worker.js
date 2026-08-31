importScripts('./runtime-source-repair-1950.js','./runtime-source-repair-1951.js');

const CACHE='reisslim-v1.16.1-build-1951-canonical-engine-v2';
const IMAGE_CACHE='reisslim-runtime-images-v5-grounded-delivery';
const RELEASE_VERSION='1.16.1';
const RELEASE_BUILD='1951';
const ASSETS=[
'./pending-01.webp','./pending-02.webp','./pending-03.webp','./pending-04.webp','./pending-05.webp','./pending-06.webp','./pending-07.webp','./pending-08.webp','./pending-09.webp','./pending-10.webp',
'./pending-11.webp','./pending-12.webp','./pending-13.webp','./pending-14.webp','./pending-15.webp','./pending-16.webp','./pending-17.webp','./pending-18.webp','./pending-19.webp','./pending-20.webp',
'./pending-21.webp','./pending-22.webp','./pending-23.webp','./pending-24.webp','./pending-25.webp','./pending-26.webp','./pending-27.webp','./pending-28.webp','./pending-29.webp','./pending-30.webp',
'./reisslim-icon-192.png','./reisslim-icon-512.png','./planner-hero-clean.webp','./planner-hero-photo-v2.webp','./home-hero-photo-v2.webp','./home-hero-photo.webp','./planner-hero-photo.webp',
'./slovenie.webp','./dolomieten.webp','./harz.webp','./styles.css','./app.js','./roadtrip-policy.js','./overnight-accommodation.js','./regional-overnight-provider.js','./','./index.html',
'./manifest.webmanifest','./compact-ui.css','./config.js','./destinations.js','./destination-provider.js','./trip-model.js','./route-engine.js','./route-topology.js','./storage.js',
'./destination-engine.js','./proposal-engine.js','./constraint-engine.js','./plan-solver.js','./itinerary-engine.js','./itinerary-variants.js','./itinerary-validator.js','./budget-engine.js',
'./trip-quality-engine.js','./trip-optimizer.js','./vehicle-intelligence.js','./recommendation-engine.js','./routing-provider.js','./place-provider.js','./preference-engine.js','./assistant-engine.js','./multimodal-engine.js','./travel-readiness.js',
'./weather-engine.js','./image-provider.js','./map-view.js','./gpx-generator.js','./ui-renderer.js','./ui-feature-flags.js','./poi-gap-filler.js','./pending-overlay-fix.css',
'./roadtrip-runtime-engine.js','./start-new-trip.js','./planner-submit-guard.js','./route-stop-provider-1929.js','./overnight-accommodation-1929.js','./canonical-trip-engine.js','./canonical-place-resolver.js','./runtime-source-repair-1950.js','./runtime-source-repair-1951.js','./release-sync-1951.js'
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

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('reisslim-')&&key!==CACHE&&key!==IMAGE_CACHE).map(key=>cacheDeleteSafe(key)));
    await self.clients.claim();
    // A new service worker cannot repair the already-running old app module.
    // Reload every open ReisSlim window exactly once so 1951 takes control of
    // app.js immediately instead of requiring a second manual refresh/restart.
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.allSettled(clients.map(async client=>{
      try{
        const url=new URL(client.url);
        if(url.origin!==self.location.origin||url.searchParams.get('runtime')==='1951')return;
        url.searchParams.set('runtime','1951');
        await client.navigate(url.href);
      }catch{}
    }));
  })());
});

async function cacheDeleteSafe(key){try{return await caches.delete(key)}catch{return false}}

function syncSourceText(text,pathname=''){
  let out=String(text)
  .replace(/1\.13\.0-1923-data-engine/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.14\.1-1928-synchronized/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.14\.2-1929-(?:complete-stops|header-repair)/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.14\.3-1930-roadtrip-policy/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.14\.4-1931-roadtrip-resilience/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.14\.5-1932-topology-supply/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.14\.6-1933-(?:cape-global-images|global-images)/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.0-1940-global-adaptive/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.1-1941-selected-trip-contract/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.2-1942-bounded-solver/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.3-1943-runtime-contract/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.4-1944-roadtrip-boundary/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.5-1945-input-limit-contract/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.6-1946-location-grounded-images/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.7-1947-night-complete-accommodations/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.8-1948-grounded-image-delivery/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/1\.15\.9-1949-multileg-base-transit/g,'1.16.1-1951-canonical-engine-v2')
  .replace(/\?v=(?:1923|1928|1929|1930|1931|1932|1933|1940|1941|1942|1943|1944|1945|1946|1947|1948|1949|1950)\b/g,'?v=1951')
  .replace(/version:'1\.13\.0',build:'1923'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.14\.1',build:'1928'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.14\.2',build:'1929'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.14\.3',build:'1930'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.14\.4',build:'1931'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.14\.5',build:'1932'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.0',build:'1940'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.1',build:'1941'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.2',build:'1942'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.3',build:'1943'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.4',build:'1944'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.5',build:'1945'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.6',build:'1946'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.7',build:'1947'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.8',build:'1948'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.15\.9',build:'1949'/g,"version:'1.16.1',build:'1951'")
  .replace(/version:'1\.16\.0',build:'1950'/g,"version:'1.16.1',build:'1951'")
  .replace(/\.\/poi-gap-filler\.js\?v=1943/g,'./route-stop-provider-1929.js?v=1951')
  .replace(/\.\/overnight-accommodation\.js\?v=1943/g,'./overnight-accommodation-1929.js?v=1951')
  .replace(/\.\/routing-provider-1914\.js\?v=1951/g,'./routing-provider.js?v=1951');
  if(/(?:^|\/)destination-engine\.js$/i.test(pathname)){
    out=out.replace(/const minimumDays=Number\(trip\.days\)===1\?1:trip\.routeTopology==='open-ended'\?Math\.max\(2,route\.requiredLegs\+1\):constraintStatus\.minimumDays;/,"const minimumDays=constraintStatus.minimumDays;");
  }
  if(/(?:^|\/)app\.js$/i.test(pathname)){
    if(self.ReisSlimRuntimeRepair1951?.repairAppContract)out=self.ReisSlimRuntimeRepair1951.repairAppContract(out);
    // 1948 image contract: app-level hydration must not treat old semantic-only
    // image metadata as ready. Only location-grounded metadata is considered ready.
    const oldHasProposalImage="function hasProposalImage(item){return /^https:\\/\\//i.test(String(item?.image?.url||''))&&item?.image?.validatedPhoto===true&&item?.image?.relevance==='destination-specific'}";
    const groundedHasProposalImage="function hasProposalImage(item){return /^https:\\/\\//i.test(String(item?.image?.url||''))&&item?.image?.validatedPhoto===true&&item?.image?.relevance==='destination-specific'&&item?.image?.locationVerified===true&&Boolean(item?.image?.destinationKey)}";
    out=out.replace(oldHasProposalImage,groundedHasProposalImage);
  }
  return out;
}

function injectReleaseScript(html){
  let text=syncSourceText(html)
    .replace(/<script[^>]*release-sync-(?:1928|1929|1930|1931|1932|1933|1940|1941|1942|1943|1944|1945|1946|1947|1948|1949|1950|1951)\.js[^>]*><\/script>/gi,'');
  if(!/commons\.wikimedia\.org[^>]*rel=["']preconnect/i.test(text))text=text.replace(/<\/head>/i,'<link rel="preconnect" href="https://en.wikipedia.org" crossorigin><link rel="preconnect" href="https://commons.wikimedia.org" crossorigin><link rel="preconnect" href="https://upload.wikimedia.org" crossorigin></head>');
  return text.replace(/<\/body>/i,'<script src="./release-sync-1951.js?v=1951"></script></body>')
}

async function networkHtml(request){
  try{
    const fresh=await fetch(request,{cache:'no-store'});
    if(!fresh||!fresh.ok)return fresh;
    const html=injectReleaseScript(await fresh.text()),headers=new Headers(fresh.headers);
    headers.set('content-type','text/html; charset=utf-8');headers.set('cache-control','no-store, max-age=0');
    return new Response(html,{status:fresh.status,statusText:fresh.statusText,headers})
  }catch(error){
    const cached=await caches.match('./index.html');if(!cached)throw error;
    return new Response(injectReleaseScript(await cached.text()),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, max-age=0'}})
  }
}

async function freshCode(request){
  const response=await fetch(request,{cache:'no-store'});if(!response||!response.ok)return response;
  const url=new URL(request.url);if(!/\.js$/i.test(url.pathname))return response;
  const text=syncSourceText(await response.text(),url.pathname),headers=new Headers(response.headers);
  headers.set('content-type','text/javascript; charset=utf-8');headers.set('cache-control','no-store, max-age=0');
  return new Response(text,{status:response.status,statusText:response.statusText,headers})
}

function cacheableImageHost(host){return/(?:wikimedia\.org|wikimedia\.com|prismic\.io|squarespace-cdn\.com|cloudinary\.com|unsplash\.com|pexels\.com|pixabay\.com)$/i.test(host)||/(?:^|\.)upload\.wikimedia\.org$/i.test(host)}
async function trim(cache,max=140){const keys=await cache.keys();if(keys.length<=max)return;await Promise.all(keys.slice(0,keys.length-max).map(key=>cache.delete(key)))}
async function cachedImage(request){
  const cache=await caches.open(IMAGE_CACHE),hit=await cache.match(request);if(hit)return hit;
  let response=null;try{response=await fetch(request,{cache:'force-cache'})}catch{}
  if(response&&(response.ok||response.type==='opaque')){await cache.put(request,response.clone());void trim(cache)}
  return response||new Response('',{status:504,statusText:'Image unavailable'})
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(event.request.destination==='image'&&cacheableImageHost(url.hostname)){event.respondWith(cachedImage(event.request));return}
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(networkHtml(event.request));return}
  const isCode=['script','style','worker'].includes(event.request.destination)||/\.(?:js|css|json|webmanifest)$/i.test(url.pathname);
  if(isCode){event.respondWith(freshCode(event.request));return}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))
});
