import { mapConcurrent } from './roadtrip-runtime-engine.js?v=1923';

const PHOTON_REVERSE='https://photon.komoot.io/reverse';
const NOMINATIM_REVERSE='https://nominatim.openstreetmap.org/reverse';
const OVERPASS_ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const CACHE_PREFIX='reisslim.regional-resilient.v3';
const FRESH_MS=30*24*60*60*1000;
const STALE_MS=180*24*60*60*1000;
const finite=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
const rad=x=>Number(x)*Math.PI/180;
function geoKm(a,b){if(!finite(a)||!finite(b))return Infinity;const R=6371,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),x=rad(a.lat),y=rad(b.lat),h=Math.sin(d1/2)**2+Math.cos(x)*Math.cos(y)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function seed(origin,km,bearing){const R=6371,a=km/R,b=rad(bearing),lat1=rad(origin.lat),lon1=rad(origin.lon),lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b)),lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));return{lat:lat2*180/Math.PI,lon:((lon2*180/Math.PI+540)%360)-180}}
function lerp(a,b,t){return{lat:Number(a.lat)+(Number(b.lat)-Number(a.lat))*t,lon:Number(a.lon)+(Number(b.lon)-Number(a.lon))*t}}
function key(origin,anchor,trip){return`${CACHE_PREFIX}:${Number(origin.lat).toFixed(2)},${Number(origin.lon).toFixed(2)}:${finite(anchor)?`${Number(anchor.lat).toFixed(2)},${Number(anchor.lon).toFixed(2)}`:'none'}:${trip?.tripStructure||'moving'}:${trip?.days||0}:${trip?.transport||''}`}
function readCache(storage,k,maxAge=FRESH_MS){try{const row=JSON.parse(storage?.getItem(k)||'null');if(!row?.savedAt||!Array.isArray(row.value))return null;const age=Date.now()-row.savedAt;return age<=maxAge?{value:row.value,age}:null}catch{return null}}
function writeCache(storage,k,value){try{storage?.setItem(k,JSON.stringify({savedAt:Date.now(),value}))}catch{}}
function localityName(p={}){return p.city||p.town||p.village||p.locality||p.municipality||p.county||p.name||null}
function normalizePhoton(payload){const f=payload?.features?.[0],p=f?.properties||{},c=f?.geometry?.coordinates||[],point={lat:Number(c[1]),lon:Number(c[0])},name=localityName(p),country=p.country||null,countryCode=String(p.countrycode||p.country_code||'').toUpperCase();return name&&country&&finite(point)?{name:String(name),...point,country,countryCode,osmType:p.osm_type||null,osmId:p.osm_id||null,source:'Photon'}:null}
function normalizeNominatim(row){const a=row?.address||{},point={lat:Number(row?.lat),lon:Number(row?.lon)},name=localityName({...a,name:row?.name}),country=a.country||null,countryCode=String(a.country_code||'').toUpperCase();return name&&country&&finite(point)?{name:String(name),...point,country,countryCode,osmType:row?.osm_type||null,osmId:row?.osm_id||row?.place_id||null,source:'Nominatim'}:null}
function normalizeOverpass(el){const t=el?.tags||{},point={lat:Number(el?.lat??el?.center?.lat),lon:Number(el?.lon??el?.center?.lon)},name=t['name:nl']||t.name||t['name:en'],country=t['is_in:country']||t['addr:country']||'Live regio';return name&&finite(point)?{name:String(name),...point,country,countryCode:String(t['addr:country']||t['is_in:country_code']||'').toUpperCase(),osmType:el.type||null,osmId:el.id||null,source:'Overpass'}:null}
async function fetchJson(url,options,fetchImpl,timeoutMs){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetchImpl(url,{...options,signal:c.signal});if(!r?.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(timer)}}
async function photonReverse(point,fetchImpl,timeoutMs){const u=new URL(PHOTON_REVERSE);u.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),limit:'1',lang:'nl'});return normalizePhoton(await fetchJson(u,{headers:{accept:'application/json'}},fetchImpl,timeoutMs))}
async function nominatimReverse(point,fetchImpl,timeoutMs){const u=new URL(NOMINATIM_REVERSE);u.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),format:'jsonv2',zoom:'10',addressdetails:'1'});return normalizeNominatim(await fetchJson(u,{headers:{accept:'application/json'}},fetchImpl,timeoutMs))}
function overpassQuery(points){const clauses=points.map(p=>`nwr(around:26000,${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)})["place"~"^(city|town|village)$"]["name"];`).join('');return`[out:json][timeout:7][maxsize:8388608];(${clauses});out center tags 240;`}
async function overpassBatch(points,fetchImpl,timeoutMs){if(!points.length)return[];const body=new URLSearchParams({data:overpassQuery(points)});return await new Promise(resolve=>{let left=OVERPASS_ENDPOINTS.length,done=false;for(const endpoint of OVERPASS_ENDPOINTS){fetchJson(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body},fetchImpl,timeoutMs).then(payload=>{if(done)return;const rows=(payload?.elements||[]).map(normalizeOverpass).filter(Boolean);if(rows.length){done=true;resolve(rows);return}if(--left===0){done=true;resolve([])}}).catch(()=>{if(--left===0&&!done){done=true;resolve([])}})}})}
function strategicSeeds(trip,origin,anchor,maxRequests){const rows=[],seen=[];const push=p=>{if(!finite(p)||seen.some(q=>geoKm(q,p)<9))return;seen.push(p);rows.push(p)};
 const centre=finite(anchor)?anchor:origin,base=trip?.tripStructure==='base';
 if(finite(anchor))push(anchor);
 if(finite(anchor)&&geoKm(origin,anchor)>20){
   for(const f of [.2,.38,.56,.74,.9]){
     const p=lerp(origin,anchor,f);push(p);push(seed(p,base?28:42,70));push(seed(p,base?28:42,250));
   }
 }
 const radii=base?[25,45,70,92,118,138]:[38,68,98,132,168,205];
 const bearings=[0,45,90,135,180,225,270,315];
 for(let b=0;b<bearings.length;b++)for(let r=0;r<radii.length;r++)push(seed(centre,radii[r],bearings[b]+(r%2?22.5:0)));
 return rows.slice(0,Math.max(8,maxRequests||24));
}
function dedupe(rows,origin){const out=[];for(const r of rows||[]){if(!r||!finite(r)||geoKm(origin,r)<32)continue;if(out.some(x=>geoKm(x,r)<14))continue;out.push(r)}return out}
function richness(point,all){const neighbours=all.filter(x=>x!==point&&geoKm(x,point)<=110).length;return Math.min(90,38+neighbours*8)}
function profile(p,i,origin,all,trip,stale=false){const poi=richness(p,all),idBase=p.osmId?`${p.osmType||'place'}-${p.osmId}`:`${p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Number(p.lat).toFixed(3)}-${Number(p.lon).toFixed(3)}`;return{id:`regional-resilient-${idBase}`,name:`${p.name} & omgeving`,country:p.country||'Live regio',distanceKm:Math.round(geoKm(origin,p)*1.18),driveHours:null,nightMid:125,activityDaily:45,toll:0,tags:['natuur','cultuur','eten',...(trip?.transport==='motorcycle'?['motor']:[])],season:[1,2,3,4,5,6,7,8,9,10,11,12],family:7,motorcycle:8,camper:7,weather:7,crowds:7,summary:`Echte benoemde overnachtingsregio rond ${p.name}, gevonden via meerdere onafhankelijke kaartbronnen.`,pros:['Echte benoemde plaats','Meerdere kaartbronnen en lokale cache','Bruikbaar voor route én slimme uitvalsbasis'],cons:stale?['Live bron tijdelijk niet beschikbaar; recente gecachte plaats gebruikt']:['Verblijf en POI’s worden na selectie apart gecontroleerd'],routeStops:[],bases:[{name:p.name,lat:Number(p.lat),lon:Number(p.lon),landValidated:true}],activities:[],poiRichness:poi,dynamic:true,roadtripCandidate:true,discoverySource:stale?'ReisSlim resilient cache':`OpenStreetMap ${p.source||'multi-source'}`}}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
export function buildRegionalSeeds(trip,origin,anchor){return strategicSeeds(trip,origin,anchor,40)}
export async function discoverRegionalOvernightCandidates(trip,origin,anchor,{fetchImpl=globalThis.fetch,timeoutMs=5000,maxRequests=24,concurrency=6,onProgress,storage=globalThis.localStorage}={}){
 if(typeof fetchImpl!=='function'||!finite(origin))return[];
 const cacheKey=key(origin,anchor,trip),required=trip?.tripStructure==='base'?8:Math.max(5,Number(trip?.days||5)+1),fresh=readCache(storage,cacheKey,FRESH_MS);
 if(fresh?.value?.length>=required){onProgress?.({completed:1,total:1,source:'cache',cached:true});return fresh.value}
 const stale=readCache(storage,cacheKey,STALE_MS);
 const seeds=strategicSeeds(trip,origin,anchor,maxRequests);
 let completed=0;
 const photon=await mapConcurrent(seeds,async(point,index)=>{const found=await photonReverse(point,fetchImpl,Math.min(3600,timeoutMs));completed++;onProgress?.({completed,total:seeds.length,source:'photon',index});return found},{concurrency:Math.min(6,Math.max(2,concurrency||6))});
 let found=dedupe(photon.map(x=>x?.error?null:x).filter(Boolean),origin);
 if(found.length<required){
   const overpass=await overpassBatch(seeds,fetchImpl,Math.min(4500,timeoutMs));
   found=dedupe([...found,...overpass],origin);
 }
 if(found.length<required){
   const missing=seeds.filter(s=>!found.some(x=>geoKm(x,s)<35)).slice(0,Math.min(4,required-found.length+1));
   for(let i=0;i<missing.length;i++){
     if(i)await wait(1050); // public Nominatim fallback is deliberately rate-limited
     const row=await nominatimReverse(missing[i],fetchImpl,Math.min(3200,timeoutMs));
     if(row)found=dedupe([...found,row],origin);
   }
 }
 if(!found.length&&stale?.value?.length)return stale.value.map(x=>({...x,discoverySource:'ReisSlim resilient cache',cacheStale:true}));
 const profiles=found.slice(0,24).map((p,i)=>profile(p,i,origin,found,trip,false));
 if(profiles.length)writeCache(storage,cacheKey,profiles);
 return profiles;
}
