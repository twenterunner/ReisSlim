const COMMONS_ENDPOINT='https://commons.wikimedia.org/w/api.php';
const WIKI_ENDPOINTS=['https://en.wikipedia.org/w/api.php'];
const CACHE_PREFIX='reisslim.image.v11-grounded-resilient.';
const NEGATIVE_PREFIX='reisslim.image-miss.v7-grounded-resilient.';
const META_TTL=180*24*60*60*1000,NEGATIVE_TTL=60*60*1000;
const VISIBLE_TIMEOUT_MS=1600,BACKGROUND_TIMEOUT_MS=4200;
const inFlight=new Map(),backgroundInFlight=new Map();
const backgroundQueue=[];let backgroundActive=0;const BACKGROUND_CONCURRENCY=4;

const stripHtml=v=>String(v||'').replace(/<[^>]+>/g,'').trim();
const usableLicense=m=>/CC BY|public domain|CC0/i.test(m?.LicenseShortName?.value||'');
const badVisual=/\b(map|kaart|flag|vlag|coat of arms|wapen|logo|diagram|schematic|schema|locator|symbol|icon|pictogram|brochure|leaflet|flyer|poster|paper|document|scan|manuscript|certificate|ticket|menu|book|page|pagina|text|sign|signage|plaque|stamp|postcard|drawing|illustration|painting|engraving|etching|seal|chart|graph|screenshot|satellite|aerial map)\b/i;
const natureVisual=/\b(landscape|landschap|mountain|mountains|berg|bergen|forest|woods|woodland|bos|valley|dal|river|rivier|lake|meer|waterfall|waterval|canyon|gorge|national park|nature reserve|natuur|nature|moor|heath|heide|cliff|klif|trail|hiking|coast|kust|beach|strand|dune|duin|water|fjord|meuse|maas)\b/i;
const architectureVisual=/\b(city|town|stad|village|dorp|street|straat|old town|altstadt|historic|historical|church|kerk|cathedral|castle|kasteel|schloss|fort|fortress|citadel|bridge|brug|architecture|building|gebouw|square|plein|harbour|haven|waterfront|museum|abbey|monastery)\b/i;
const poiVisual=/\b(road|straße|strasse|weg|route|pass|view|panorama|viewpoint|lookout|monument|landmark|attraction|park|garden|markt|market|station|railway|tower|molen|mill)\b/i;

function slug(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)}
function baseName(destination){return String(destination?.name||'').replace(/\s*&\s*omgeving$/i,'').trim()}
function anchorPoint(destination){const p=destination?.bases?.[0]||destination?.anchor||destination?.destinationPoint||null;return p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))?{lat:Number(p.lat),lon:Number(p.lon)}:null}
function primaryTokens(d={}){return baseName(d).toLocaleLowerCase('nl-NL').split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>2)}
function radians(v){return Number(v)*Math.PI/180}
export function distanceKm(a,b){if(!a||!b||!Number.isFinite(Number(a.lat))||!Number.isFinite(Number(a.lon))||!Number.isFinite(Number(b.lat))||!Number.isFinite(Number(b.lon)))return Infinity;const dLat=radians(b.lat-a.lat),dLon=radians(b.lon-a.lon),h=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)))}
function verificationRadiusKm(destination){const explicit=Number(destination?.imageVerificationRadiusKm);if(Number.isFinite(explicit)&&explicit>0)return Math.max(8,Math.min(80,explicit));return 55}
export function destinationIdentity(destination){const a=anchorPoint(destination),coords=a?`${a.lat.toFixed(4)},${a.lon.toFixed(4)}`:'no-coordinate';return`${slug(destination?.id||baseName(destination))}|${slug(baseName(destination))}|${slug(destination?.country||'')}|${coords}`}
function cacheKey(d){return`${CACHE_PREFIX}${destinationIdentity(d)}`}
function visualCategory(text){const value=String(text||'');if(natureVisual.test(value))return'nature';if(architectureVisual.test(value))return'city-architecture';if(poiVisual.test(value))return'poi';return'place'}
function categoryRank(category){return category==='nature'?4:category==='city-architecture'?3:category==='poi'?2:1}
function descriptiveText(page){const m=page?.imageinfo?.[0]?.extmetadata||{};return[page?.title,page?.pageimage,stripHtml(m.ImageDescription?.value),stripHtml(m.ObjectName?.value),stripHtml(m.Categories?.value),page?.terms?.description?.join(' ')].filter(Boolean).join(' ').toLocaleLowerCase('nl-NL')}
function pageCoordinate(page){const c=page?.coordinates?.[0];return c&&Number.isFinite(Number(c.lat))&&Number.isFinite(Number(c.lon))?{lat:Number(c.lat),lon:Number(c.lon)}:null}
function fileLooksPhotographic(page){const info=page?.imageinfo?.[0]||{},mime=String(info.mime||'').toLowerCase(),w=Number(info.thumbwidth||info.width||0),h=Number(info.thumbheight||info.height||0),ratio=w&&h?w/h:1.5,text=descriptiveText(page);if(mime&&!/^image\/(jpeg|png|webp)$/i.test(mime))return false;if(badVisual.test(text)||w&&w<320||h&&h<190||ratio<.52||ratio>3)return false;return true}
function pageImageLooksPhotographic(page){const text=[page?.pageimage,page?.title,page?.terms?.description?.join(' ')].filter(Boolean).join(' ');return Boolean(page?.thumbnail?.source)&&!badVisual.test(text)}
function locationEvidence(page,destination){const anchor=anchorPoint(destination),p=pageCoordinate(page);if(!anchor||!p)return null;const radius=verificationRadiusKm(destination),distance=distanceKm(anchor,p);if(distance>radius)return null;return{anchor,point:p,distanceKm:Number(distance.toFixed(2)),radiusKm:radius}}
function destinationNameMatch(page,destination){const text=[page?.title,page?.terms?.description?.join(' ')].filter(Boolean).join(' ').toLocaleLowerCase('nl-NL'),tokens=primaryTokens(destination);return tokens.length?tokens.some(t=>text.includes(t)):false}
function makeVerifiedImage(destination,data,evidence){return{...data,destinationKey:destinationIdentity(destination),locationVerified:true,verification:{method:evidence.method,distanceKm:evidence.distanceKm,radiusKm:evidence.radiusKm,anchor:evidence.anchor,point:evidence.point},routeSpecific:true,validatedPhoto:true,relevance:'destination-specific',checkedAt:new Date().toISOString()}}
export function isVerifiedImageForDestination(image,destination){if(!image||!destination||!/^https:\/\//i.test(String(image.url||'')))return false;if(image.validatedPhoto!==true||image.relevance!=='destination-specific'||image.locationVerified!==true)return false;return String(image.destinationKey||'')===destinationIdentity(destination)}
function betterImage(next,current){if(!next)return current||null;if(!current)return next;const a=categoryRank(next.visualCategory),b=categoryRank(current.visualCategory);if(a!==b)return a>b?next:current;const da=Number(next.verification?.distanceKm??Infinity),db=Number(current.verification?.distanceKm??Infinity);return da<db?next:current}

export function normalizeWikipediaImage(payload,destination,endpoint){
  const pages=Object.values(payload?.query?.pages||{}).filter(Boolean),anchor=anchorPoint(destination);if(!pages.length||!anchor)return null;
  const candidates=[];
  for(const page of pages){
    if(page?.missing!==undefined||!pageImageLooksPhotographic(page))continue;
    const ev=locationEvidence(page,destination);if(!ev)continue;
    if(ev.distanceKm>18&&!destinationNameMatch(page,destination))continue;
    const title=String(page.title||''),visualText=[page.pageimage,title,page.terms?.description?.join(' ')].filter(Boolean).join(' '),category=visualCategory(visualText),host=new URL(endpoint).hostname,lang=host.split('.')[0];
    const match=destinationNameMatch(page,destination)?1:0,exact=slug(title)===slug(baseName(destination))?1:0;
    const score=categoryRank(category)*1000+exact*100+match*60+Math.max(0,60-ev.distanceKm)+(page.index?Math.max(0,18-Number(page.index)):20);
    candidates.push({score,image:makeVerifiedImage(destination,{url:page.thumbnail.source,sourceUrl:`https://${lang}.wikipedia.org/?curid=${page.pageid}`,title,creator:'Zie bronpagina',license:'Wikimedia-bron; licentie op bronpagina',attribution:`${title} · Wikipedia/Wikimedia`,provider:'Wikipedia location page image',visualCategory:category,provisionalAttribution:true},{...ev,method:'wikipedia-location-page-coordinate'})})
  }
  candidates.sort((a,b)=>b.score-a.score);return candidates[0]?.image||null
}

export function normalizeCommonsImage(payload,destination=null){
  const anchor=anchorPoint(destination);if(!anchor)return null;
  const pages=Object.values(payload?.query?.pages||{}).filter(p=>p?.imageinfo?.[0]),candidates=[];
  for(const page of pages){
    const info=page.imageinfo[0],m=info.extmetadata||{},ev=locationEvidence(page,destination);if(!ev||!info.thumburl||!fileLooksPhotographic(page)||!usableLicense(m))continue;
    const text=descriptiveText(page),category=visualCategory(text),score=categoryRank(category)*1000+Math.max(0,70-ev.distanceKm)-(badVisual.test(text)?500:0);
    candidates.push({score,image:makeVerifiedImage(destination,{url:info.thumburl,sourceUrl:info.descriptionurl||`https://commons.wikimedia.org/?curid=${page.pageid}`,title:page.title?.replace(/^File:/,'')||'Bestemmingsbeeld',creator:stripHtml(m.Artist?.value)||'Onbekende maker',license:m.LicenseShortName?.value||'Open licentie',attribution:`${stripHtml(m.Artist?.value)||'Onbekende maker'} · ${m.LicenseShortName?.value||'open licentie'} · Wikimedia Commons`,provider:'Wikimedia Commons geotagged image',visualCategory:category},{...ev,method:'commons-geosearch-coordinate'})})
  }
  candidates.sort((a,b)=>b.score-a.score);return candidates[0]?.image||null
}

function read(storage,k,ttl){try{const r=JSON.parse(storage?.getItem(k)||'null');return r?.savedAt&&Date.now()-r.savedAt<=ttl?r.value:null}catch{return null}}
function write(storage,k,v){try{storage?.setItem(k,JSON.stringify({savedAt:Date.now(),value:v}))}catch{}}
function announceImage(destination,image,cached=false){if(!isVerifiedImageForDestination(image,destination))return;try{globalThis.dispatchEvent?.(new CustomEvent('reisslim:image-ready',{detail:{id:destination?.id||null,name:destination?.name||'',image:{...image,cached:Boolean(cached)}}}))}catch{}}
async function fetchJson(url,fetchImpl,timeoutMs){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetchImpl(url,{signal:c.signal,headers:{accept:'application/json'},cache:'force-cache'});if(!r?.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(t)}}

async function queryWikipediaExact(destination,endpoint,{fetchImpl,timeoutMs}){
  if(!anchorPoint(destination))return null;
  const url=new URL(endpoint);url.search=new URLSearchParams({action:'query',titles:baseName(destination),redirects:'1',prop:'pageimages|pageterms|coordinates',piprop:'thumbnail|name',pithumbsize:'420',wbptterms:'description',colimit:'max',format:'json',origin:'*'});
  return normalizeWikipediaImage(await fetchJson(url,fetchImpl,timeoutMs),destination,endpoint)
}
async function queryWikipediaSearch(destination,endpoint,{fetchImpl,timeoutMs}){
  if(!anchorPoint(destination))return null;
  const base=baseName(destination),country=destination?.country||'',url=new URL(endpoint);
  url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:`${base} ${country}`.trim(),gsrnamespace:'0',gsrlimit:'8',prop:'pageimages|pageterms|coordinates',piprop:'thumbnail|name',pithumbsize:'420',wbptterms:'description',colimit:'max',format:'json',origin:'*'});
  return normalizeWikipediaImage(await fetchJson(url,fetchImpl,timeoutMs),destination,endpoint)
}
function destinationPoint(origin,distanceKmValue,bearingDegrees){const R=6371,b=bearingDegrees*Math.PI/180,lat1=Number(origin.lat)*Math.PI/180,lon1=Number(origin.lon)*Math.PI/180,a=distanceKmValue/R,lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b)),lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));return{lat:lat2*180/Math.PI,lon:lon2*180/Math.PI}}
async function queryCommonsAt(destination,point,{fetchImpl,timeoutMs}){
  const url=new URL(COMMONS_ENDPOINT);
  url.search=new URLSearchParams({action:'query',generator:'geosearch',ggsprimary:'all',ggsnamespace:'6',ggsradius:'10000',ggslimit:'40',ggscoord:`${point.lat}|${point.lon}`,prop:'imageinfo|coordinates',iiprop:'url|extmetadata|mime|size',iiurlwidth:'420',colimit:'max',format:'json',origin:'*'});
  return normalizeCommonsImage(await fetchJson(url,fetchImpl,timeoutMs),destination)
}
async function queryCommonsNearby(destination,{fetchImpl,timeoutMs}){const anchor=anchorPoint(destination);return anchor?queryCommonsAt(destination,anchor,{fetchImpl,timeoutMs}):null}

async function firstVerifiedWithUpgrade(destination,tasks){
  let winner=null,settled=0,resolved=false;return await new Promise(resolve=>{
    if(!tasks.length)return resolve(null);
    const finish=()=>{settled++;if(settled===tasks.length&&!resolved){resolved=true;resolve(winner)}};
    tasks.forEach(task=>Promise.resolve(task).then(image=>{
      if(image){const previous=winner,chosen=betterImage(image,winner);if(chosen!==previous){winner=chosen;announceImage(destination,winner,false)}if(!resolved){resolved=true;resolve(winner)}}
      finish();
    }).catch(finish));
  })
}
async function visibleLookup(destination,{fetchImpl,timeoutMs}){
  const budget=Math.min(2200,Math.max(700,Number(timeoutMs)||VISIBLE_TIMEOUT_MS));
  const tasks=[queryCommonsNearby(destination,{fetchImpl,timeoutMs:budget}),...WIKI_ENDPOINTS.map(endpoint=>queryWikipediaExact(destination,endpoint,{fetchImpl,timeoutMs:budget}))];
  return firstVerifiedWithUpgrade(destination,tasks)
}

function runBackgroundQueue(){while(backgroundActive<BACKGROUND_CONCURRENCY&&backgroundQueue.length){const job=backgroundQueue.shift();backgroundActive++;Promise.resolve().then(job.run).then(job.resolve,job.resolve).finally(()=>{backgroundActive--;runBackgroundQueue()})}}
async function expandedCommonsSearch(destination,fetchImpl){
  const anchor=anchorPoint(destination);if(!anchor)return null;
  const radius=verificationRadiusKm(destination),seeds=[anchor];
  for(const ring of [18,34,50]){if(ring>radius+10)continue;for(const bearing of [0,60,120,180,240,300])seeds.push(destinationPoint(anchor,Math.min(ring,radius*.85),bearing))}
  let best=null,next=0;
  const workers=Array.from({length:Math.min(4,seeds.length)},async()=>{while(next<seeds.length){const seed=seeds[next++],image=await queryCommonsAt(destination,seed,{fetchImpl,timeoutMs:BACKGROUND_TIMEOUT_MS});if(image)best=betterImage(image,best)}});
  await Promise.all(workers);return best
}
async function backgroundLookup(destination,{fetchImpl,storage}){
  const k=cacheKey(destination);if(backgroundInFlight.has(k))return backgroundInFlight.get(k);let resolveOuter;const task=new Promise(resolve=>{resolveOuter=resolve});backgroundInFlight.set(k,task);
  backgroundQueue.push({resolve:resolveOuter,run:async()=>{try{
    const searchTasks=[expandedCommonsSearch(destination,fetchImpl),...WIKI_ENDPOINTS.map(endpoint=>queryWikipediaSearch(destination,endpoint,{fetchImpl,timeoutMs:BACKGROUND_TIMEOUT_MS}))];
    const rows=await Promise.allSettled(searchTasks);let chosen=isVerifiedImageForDestination(destination.image,destination)?destination.image:null;
    for(const row of rows)if(row.status==='fulfilled'&&row.value)chosen=betterImage(row.value,chosen);
    if(chosen){destination.image=chosen;write(storage,k,chosen);announceImage(destination,chosen,false);return chosen}
    write(storage,NEGATIVE_PREFIX+k,true);return null
  }finally{backgroundInFlight.delete(k)}}});runBackgroundQueue();return task
}

async function fetchDestinationImageUncached(destination,{fetchImpl,storage,timeoutMs,backgroundRetry}){
  const k=cacheKey(destination),cached=read(storage,k,META_TTL);
  if(isVerifiedImageForDestination(cached,destination)){destination.image=cached;announceImage(destination,cached,true);return{...cached,cached:true}}
  if(destination?.image&&!isVerifiedImageForDestination(destination.image,destination))delete destination.image;
  const negative=read(storage,NEGATIVE_PREFIX+k,NEGATIVE_TTL);
  const image=await visibleLookup(destination,{fetchImpl,timeoutMs:Math.max(VISIBLE_TIMEOUT_MS,Number(timeoutMs)||0)});
  if(image){destination.image=image;write(storage,k,image);announceImage(destination,image,false);if(backgroundRetry!==false&&image.visualCategory!=='nature')void backgroundLookup(destination,{fetchImpl,storage});return image}
  // A previous miss suppresses only expanded background work, never the fast visible lookup.
  if(backgroundRetry!==false&&!negative)void backgroundLookup(destination,{fetchImpl,storage});return null
}
export async function fetchDestinationImage(destination,{fetchImpl=globalThis.fetch,storage=globalThis.localStorage,timeoutMs=VISIBLE_TIMEOUT_MS,backgroundRetry=true}={}){if(typeof fetchImpl!=='function'||!destination||!anchorPoint(destination))return null;const k=cacheKey(destination);if(inFlight.has(k))return inFlight.get(k);const task=fetchDestinationImageUncached(destination,{fetchImpl,storage,timeoutMs,backgroundRetry}).finally(()=>inFlight.delete(k));inFlight.set(k,task);return task}
export async function enrichDestinationImages(destinations,options={}){const maximum=Number.isFinite(Number(options.maximum))?Math.max(0,Math.floor(Number(options.maximum))):Infinity,selected=(destinations||[]).filter(Boolean).slice(0,maximum);let cursor=0;const workers=Array.from({length:Math.min(10,selected.length)},async()=>{while(cursor<selected.length){const d=selected[cursor++];if(isVerifiedImageForDestination(d.image,d)){announceImage(d,d.image,true);continue}if(d.image)delete d.image;const image=await fetchDestinationImage(d,options);if(image)d.image=image}});await Promise.all(workers);return destinations}
export const imageProviderAttribution='Bestemmingsbeelden worden alleen getoond wanneer ze aan de echte reisregio zijn gekoppeld. De zichtbare zoeklaag raadpleegt tegelijk een geotagged Wikimedia Commons-zoekactie en de exacte Wikipedia-locatiepagina; natuur krijgt voorrang. Bij een trage bron blijft de zoekactie langer actief en volgt een bredere geografische achtergrondzoekactie, zonder ooit een willekeurige reisfoto te tonen.';
