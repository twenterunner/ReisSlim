import { mapConcurrent } from './roadtrip-runtime-engine.js?v=1940';
import { maximumRoadLegKm, selectRoadtripOvernights, selectRoadtripBase, selectBaseDayTrips } from './roadtrip-policy.js?v=1940';

const PHOTON_REVERSE='https://photon.komoot.io/reverse';
const NOMINATIM_REVERSE='https://nominatim.openstreetmap.org/reverse';
const OVERPASS_ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const CACHE_PREFIX='reisslim.regional-adaptive.v1';
const FRESH_MS=30*24*60*60*1000;
const STALE_MS=180*24*60*60*1000;
const finite=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
const rad=x=>Number(x)*Math.PI/180;
const round3=n=>Number(Number(n).toFixed(3));

function geoKm(a,b){if(!finite(a)||!finite(b))return Infinity;const R=6371,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),x=rad(a.lat),y=rad(b.lat),h=Math.sin(d1/2)**2+Math.cos(x)*Math.cos(y)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function seed(origin,km,bearing){const R=6371,a=km/R,b=rad(bearing),lat1=rad(origin.lat),lon1=rad(origin.lon),lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b)),lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));return{lat:lat2*180/Math.PI,lon:((lon2*180/Math.PI+540)%360)-180}}
function lerp(a,b,t){return{lat:Number(a.lat)+(Number(b.lat)-Number(a.lat))*t,lon:Number(a.lon)+(Number(b.lon)-Number(a.lon))*t}}
function initialBearing(a,b){if(!finite(a)||!finite(b))return 0;const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)),x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));return(Math.atan2(y,x)*180/Math.PI+360)%360}
function key(origin,anchor,trip){return`${CACHE_PREFIX}:${round3(origin.lat)},${round3(origin.lon)}:${finite(anchor)?`${round3(anchor.lat)},${round3(anchor.lon)}`:'none'}:${trip?.tripStructure||'moving'}:${trip?.days||0}:${trip?.transport||''}:${trip?.maxDrive||0}:${trip?.maxChanges||0}:${trip?.routeTopology||'loop'}`}
function readCache(storage,k,maxAge=FRESH_MS){try{const row=JSON.parse(storage?.getItem(k)||'null');if(!row?.savedAt||!Array.isArray(row.value))return null;const age=Date.now()-row.savedAt;return age<=maxAge?{value:row.value,age}:null}catch{return null}}
function writeCache(storage,k,value){try{storage?.setItem(k,JSON.stringify({savedAt:Date.now(),value}))}catch{}}
function localityName(p={}){return p.city||p.town||p.village||p.locality||p.municipality||p.county||p.name||null}
function normalizePhoton(payload){const f=payload?.features?.[0],p=f?.properties||{},c=f?.geometry?.coordinates||[],point={lat:Number(c[1]),lon:Number(c[0])},name=localityName(p),country=p.country||null,countryCode=String(p.countrycode||p.country_code||'').toUpperCase();return name&&finite(point)?{name:String(name),...point,country:country||'Live regio',countryCode,osmType:p.osm_type||null,osmId:p.osm_id||null,source:'Photon'}:null}
function normalizeNominatim(row){const a=row?.address||{},point={lat:Number(row?.lat),lon:Number(row?.lon)},name=localityName({...a,name:row?.name}),country=a.country||null,countryCode=String(a.country_code||'').toUpperCase();return name&&finite(point)?{name:String(name),...point,country:country||'Live regio',countryCode,osmType:row?.osm_type||null,osmId:row?.osm_id||row?.place_id||null,source:'Nominatim'}:null}
function normalizeOverpass(el){const t=el?.tags||{},point={lat:Number(el?.lat??el?.center?.lat),lon:Number(el?.lon??el?.center?.lon)},name=t['name:nl']||t.name||t['name:en'],country=t['is_in:country']||t['addr:country']||'Live regio';return name&&finite(point)?{name:String(name),...point,country,countryCode:String(t['addr:country']||t['is_in:country_code']||'').toUpperCase(),osmType:el.type||null,osmId:el.id||null,source:'Overpass'}:null}
async function fetchJson(url,options,fetchImpl,timeoutMs){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetchImpl(url,{...options,signal:c.signal});if(!r?.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(timer)}}
async function photonReverse(point,fetchImpl,timeoutMs){const u=new URL(PHOTON_REVERSE);u.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),limit:'1',lang:'nl'});return normalizePhoton(await fetchJson(u,{headers:{accept:'application/json'}},fetchImpl,timeoutMs))}
async function nominatimReverse(point,fetchImpl,timeoutMs){const u=new URL(NOMINATIM_REVERSE);u.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),format:'jsonv2',zoom:'10',addressdetails:'1'});return normalizeNominatim(await fetchJson(u,{headers:{accept:'application/json'}},fetchImpl,timeoutMs))}

function overpassQuery(points){const clauses=points.map(p=>`nwr(around:32000,${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)})["place"~"^(city|town|village)$"]["name"];`).join('');return`[out:json][timeout:6][maxsize:8388608];(${clauses});out center tags 220;`}
async function firstOverpass(points,fetchImpl,timeoutMs){if(!points.length)return[];const body=new URLSearchParams({data:overpassQuery(points)});const tasks=OVERPASS_ENDPOINTS.map(endpoint=>async()=>{const payload=await fetchJson(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body},fetchImpl,timeoutMs);const rows=(payload?.elements||[]).map(normalizeOverpass).filter(Boolean);if(!rows.length)throw new Error('empty-overpass');return rows});try{return await Promise.any(tasks.map(task=>Promise.resolve().then(task)))}catch{return[]}}
async function overpassBatches(points,fetchImpl,timeoutMs,onProgress){const batches=[];for(let i=0;i<points.length;i+=8)batches.push(points.slice(i,i+8));const results=await mapConcurrent(batches,async(batch,index)=>{const rows=await firstOverpass(batch,fetchImpl,timeoutMs);onProgress?.({type:'regional-provider-batch',provider:'overpass',completed:index+1,total:batches.length});return rows},{concurrency:Math.min(3,Math.max(1,batches.length))});return results.flatMap(r=>r?.error?[]:r||[])}

function targetCandidateCount(trip){const days=Math.max(2,Number(trip?.days||5));return trip?.tripStructure==='base'?Math.max(6,Math.min(14,days+2)):Math.max(6,Math.min(14,Math.ceil(days/2)+3))}
function addUnique(rows,seen,p,minKm=8){if(!finite(p)||seen.some(q=>geoKm(q,p)<minKm))return;seen.push(p);rows.push(p)}

/*
 * Generic, geography-independent search geometry.
 * No countries, cities or special origins are encoded here. Search points are
 * derived only from the user's origin, selected anchor and route constraints.
 */
export function buildAdaptiveRegionalSeeds(trip,origin,anchor,{round=0,maxRequests=48}={}){
 const rows=[],seen=[];if(!finite(origin))return rows;
 const maxLeg=Math.max(120,maximumRoadLegKm(trip));
 const base=trip?.tripStructure==='base';
 const days=Math.max(2,Number(trip?.days||5));
 const scale=[1,1.28,1.62,2.05][Math.min(3,Math.max(0,round))];
 const rotate=round*27.5;
 const push=p=>addUnique(rows,seen,p,7);
 const anchorOk=finite(anchor),centre=anchorOk?anchor:origin;
 if(anchorOk)push(anchor);

 if(anchorOk&&geoKm(origin,anchor)>10){
   const direct=geoKm(origin,anchor),bearing=initialBearing(origin,anchor);
   const usefulStep=Math.max(55,maxLeg*(base?.45:.62));
   const steps=Math.max(2,Math.ceil((direct*1.18)/usefulStep));
   const side=Math.min(maxLeg*.42,Math.max(22,maxLeg*(base?.16:.24))*scale);
   for(let i=1;i<=steps;i++){
     const f=i/(steps+1),p=lerp(origin,anchor,f);push(p);
     push(seed(p,side,bearing+90+rotate));push(seed(p,side,bearing-90-rotate));
     if(round>=1){push(seed(p,side*.72,bearing+45+rotate));push(seed(p,side*.72,bearing-45-rotate))}
   }
 }

 // Build reachable rings around origin and around the chosen region. The radii
 // are expressed as fractions of the actual per-day leg budget, so the same
 // logic works in dense Europe, Southern Africa, North America or anywhere else.
 const originFractions=base?[.35,.62,.86]:[.30,.55,.78,.96];
 const centreFractions=base?[.18,.32,.46]:[.22,.42,.62,.82];
 const bearings=[0,45,90,135,180,225,270,315];
 for(const f of originFractions){const r=maxLeg*f*scale;for(let i=0;i<bearings.length;i++)push(seed(origin,r,bearings[i]+rotate+(f*19)))}
 for(const f of centreFractions){const r=Math.min(maxLeg*.95,maxLeg*f*scale);for(let i=0;i<bearings.length;i++)push(seed(centre,r,bearings[i]+22.5+rotate-(f*17)))}

 // For loop trips, deliberately search off the direct corridor so the solver can
 // form a genuine loop rather than only an out-and-back chain.
 if(anchorOk&&trip?.routeTopology==='loop'){
   const bearing=initialBearing(origin,anchor),mid=lerp(origin,anchor,.55),loopRadius=Math.min(maxLeg*.8,Math.max(45,maxLeg*.38*scale));
   for(const offset of [65,110,155,205,250,295])push(seed(mid,loopRadius,bearing+offset+rotate))
 }
 // Open-ended trips benefit from forward progression beyond the selected anchor.
 if(anchorOk&&trip?.routeTopology==='open-ended'){
   const bearing=initialBearing(origin,anchor);for(const f of [.28,.5,.72])push(seed(anchor,maxLeg*f*scale,bearing+rotate))
 }

 return rows.slice(0,Math.max(12,maxRequests));
}

function dedupe(rows,origin){const out=[];for(const r of rows||[]){if(!r||!finite(r)||geoKm(origin,r)<28)continue;if(out.some(x=>geoKm(x,r)<14))continue;out.push(r)}return out}
function richness(point,all){const neighbours=all.filter(x=>x!==point&&geoKm(x,point)<=110).length;return Math.min(94,42+neighbours*7)}
function profile(p,i,origin,all,trip,stale=false){const poi=richness(p,all),idBase=p.osmId?`${p.osmType||'place'}-${p.osmId}`:`${String(p.name||'region').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Number(p.lat).toFixed(3)}-${Number(p.lon).toFixed(3)}`;return{id:`regional-adaptive-${idBase}`,name:`${p.name} & omgeving`,country:p.country||'Live regio',distanceKm:Math.round(geoKm(origin,p)*1.18),driveHours:null,nightMid:125,activityDaily:45,toll:0,tags:['natuur','cultuur','eten',...(trip?.transport==='motorcycle'?['motor']:[])],season:[1,2,3,4,5,6,7,8,9,10,11,12],family:7,motorcycle:8,camper:7,weather:7,crowds:7,summary:`Echte benoemde overnachtingsregio rond ${p.name}, dynamisch gevonden uit de routegeometrie.`,pros:['Echte benoemde plaats','Wereldwijde dynamische zoekstrategie','Bruikbaar voor route én slimme uitvalsbasis'],cons:stale?['Live bron tijdelijk niet beschikbaar; recente gecachte plaats gebruikt']:['Verblijf en POI’s worden na selectie apart gecontroleerd'],routeStops:[],bases:[{name:p.name,lat:Number(p.lat),lon:Number(p.lon),landValidated:true}],activities:[],poiRichness:poi,dynamic:true,roadtripCandidate:true,discoverySource:stale?'ReisSlim topology cache':`OpenStreetMap ${p.source||'multi-source'}`}}
function profilePoints(profiles){return(profiles||[]).map(item=>{const b=item?.bases?.[0];return finite(b)?{name:b.name||String(item.name||'').replace(/\s*&\s*omgeving$/i,''),lat:Number(b.lat),lon:Number(b.lon),country:item.country||'Live regio',source:'cache',osmType:'cache',osmId:item.id}:null}).filter(Boolean)}
function toPolicyCandidates(rows,trip){return(rows||[]).filter(finite).map((p,index)=>({name:p.name||`Regio ${index+1}`,lat:Number(p.lat),lon:Number(p.lon),catalogId:String(p.osmId||`${p.name||'region'}-${Number(p.lat).toFixed(3)}-${Number(p.lon).toFixed(3)}`),landValidated:true,generatedExploration:false,poiRichness:78,preferenceScore:(trip?.preferences||[]).length?24:0,vehicleScore:8}))}
export function regionalSupplySupportsTrip(trip,origin,anchor,rowsOrProfiles){
 if(Number(trip?.days||0)<=1)return true;
 const raw=(rowsOrProfiles||[]).some(x=>Array.isArray(x?.bases))?profilePoints(rowsOrProfiles):rowsOrProfiles;
 const candidates=toPolicyCandidates(raw,trip);
 if(trip?.tripStructure==='base'){
   const base=selectRoadtripBase({origin:{...origin,name:trip.origin||'Vertrek'},trip,destination:{id:'regional-anchor',bases:finite(anchor)?[{...anchor}]:[]},candidates});
   if(!base)return false;
   return selectBaseDayTrips({base,trip,candidates,count:Math.max(0,Number(trip.days||0)-2)}).length===Math.max(0,Number(trip.days||0)-2)
 }
 const path=selectRoadtripOvernights({origin:{...origin,name:trip.origin||'Vertrek'},trip,destination:{id:'regional-anchor',bases:finite(anchor)?[{...anchor}]:[]},candidates});
 return path.length===Math.max(0,Number(trip.days||0)-1)
}

function uncoveredSeeds(seeds,found,max=14){return seeds.filter(s=>!found.some(x=>geoKm(x,s)<30)).slice(0,max)}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
export function buildRegionalSeeds(trip,origin,anchor){return buildAdaptiveRegionalSeeds(trip,origin,anchor,{round:0,maxRequests:48})}

export async function discoverRegionalOvernightCandidates(trip,origin,anchor,{fetchImpl=globalThis.fetch,timeoutMs=5000,maxRequests=48,concurrency=8,onProgress,storage=globalThis.localStorage,maxRounds=3}={}){
 if(typeof fetchImpl!=='function'||!finite(origin))return[];
 const cacheKey=key(origin,anchor,trip),fresh=readCache(storage,cacheKey,FRESH_MS),stale=readCache(storage,cacheKey,STALE_MS);
 if(fresh?.value?.length&&regionalSupplySupportsTrip(trip,origin,anchor,fresh.value)){onProgress?.({completed:1,total:1,source:'cache',cached:true,topology:true});return fresh.value}

 let found=dedupe([...(fresh?.value?.length?profilePoints(fresh.value):[]),...(stale?.value?.length?profilePoints(stale.value):[])],origin);
 const target=targetCandidateCount(trip),rounds=Math.max(1,Math.min(4,Number(maxRounds)||3));
 for(let round=0;round<rounds&&!regionalSupplySupportsTrip(trip,origin,anchor,found);round++){
   const seeds=buildAdaptiveRegionalSeeds(trip,origin,anchor,{round,maxRequests});
   onProgress?.({type:'regional-round-start',round:round+1,totalRounds:rounds,seeds:seeds.length,candidates:found.length});

   const overpassRows=await overpassBatches(seeds,fetchImpl,Math.min(2600,timeoutMs),onProgress);
   found=dedupe([...found,...overpassRows],origin);
   if(regionalSupplySupportsTrip(trip,origin,anchor,found))break;

   const photonSeeds=uncoveredSeeds(seeds,found,Math.min(16,Math.max(8,target*2)));
   const photon=await mapConcurrent(photonSeeds,async(point,index)=>{const row=await photonReverse(point,fetchImpl,Math.min(1800,timeoutMs));onProgress?.({type:'regional-provider-batch',provider:'photon',completed:index+1,total:photonSeeds.length});return row},{concurrency:Math.min(10,Math.max(4,concurrency||8))});
   found=dedupe([...found,...photon.map(x=>x?.error?null:x).filter(Boolean)],origin);
   onProgress?.({type:'regional-round-complete',round:round+1,totalRounds:rounds,candidates:found.length,viable:regionalSupplySupportsTrip(trip,origin,anchor,found)});
 }

 // Standards-compliant serial fallback. It is intentionally tiny: Nominatim is
 // not the primary discovery engine and is only used to fill the final topology gap.
 if(!regionalSupplySupportsTrip(trip,origin,anchor,found)){
   const seeds=buildAdaptiveRegionalSeeds(trip,origin,anchor,{round:Math.max(0,rounds-1),maxRequests});
   const missing=uncoveredSeeds(seeds,found,3);
   for(let i=0;i<missing.length;i++){
     if(i)await wait(1050);
     const row=await nominatimReverse(missing[i],fetchImpl,Math.min(2200,timeoutMs));
     if(row)found=dedupe([...found,row],origin);
     if(regionalSupplySupportsTrip(trip,origin,anchor,found))break
   }
 }

 const ordered=finite(anchor)?[...found].sort((a,b)=>{
   const direct=geoKm(origin,anchor),da=Math.abs((geoKm(origin,a)+geoKm(a,anchor))-direct),db=Math.abs((geoKm(origin,b)+geoKm(b,anchor))-direct);
   return da-db||geoKm(origin,a)-geoKm(origin,b)
 }):found;
 const profiles=ordered.slice(0,96).map((p,i)=>profile(p,i,origin,found,trip,p.source==='cache'));
 if(profiles.length&&regionalSupplySupportsTrip(trip,origin,anchor,profiles))writeCache(storage,cacheKey,profiles);
 return profiles
}
