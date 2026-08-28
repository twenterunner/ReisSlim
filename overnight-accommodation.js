import { mapConcurrent } from './roadtrip-runtime-engine.js?v=1922';

const ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const NOMINATIM='https://nominatim.openstreetmap.org/search';
const valid=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)),rad=x=>x*Math.PI/180;
function km(a,b){if(!valid(a)||!valid(b))return Infinity;const R=6371,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),x=rad(a.lat),y=rad(b.lat),h=Math.sin(d1/2)**2+Math.cos(x)*Math.cos(y)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function typeAllowed(tags,requested,vehicle){const tourism=tags?.tourism,camping=['camp_site','caravan_site'].includes(tourism),lodging=['hotel','guest_house','hostel','motel','apartment','chalet'].includes(tourism);if(requested==='camping')return camping;if(requested==='hotel-bnb')return lodging;if(['motorhome','caravan'].includes(vehicle))return camping;return camping||lodging}
export function motorcycleAccommodationScore(tags={}){let score=0;const motorcycle=String(tags.motorcycle||tags['access:motorcycle']||'').toLowerCase();if(['yes','designated','permissive'].includes(motorcycle))score+=38;if(['no','private'].includes(motorcycle))score-=80;const parking=String(tags.parking||tags['parking:condition']||'').toLowerCase();if(parking&&parking!=='no')score+=18;if(String(tags.garage||tags['parking:garage']||'').toLowerCase()==='yes')score+=28;if(String(tags.covered||tags['parking:covered']||'').toLowerCase()==='yes')score+=18;if(tags.website||tags['contact:website'])score+=6;if(tags.phone||tags['contact:phone'])score+=4;if(['camp_site','caravan_site'].includes(tags.tourism))score+=8;return score}
export function accommodationSuitability(tags,trip,distanceKm=0){const vehicle=trip?.transport,requested=trip?.accommodationType||'any';if(!typeAllowed(tags,requested,vehicle))return-Infinity;let score=145-distanceKm*3.2;if(vehicle==='motorcycle')score+=motorcycleAccommodationScore(tags);if(['motorhome','caravan'].includes(vehicle)){if(tags.motorhome==='yes'||tags.caravans==='yes')score+=30;if(tags.power_supply)score+=8;if(tags.sanitary_dump_station==='yes')score+=12}return score}
function query(point,trip,radiusKm){const r=trip?.accommodationType||'any',tourism=r==='camping'?'^(camp_site|caravan_site)$':r==='hotel-bnb'?'^(hotel|guest_house|hostel|motel|apartment|chalet)$':'^(hotel|guest_house|hostel|motel|apartment|chalet|camp_site|caravan_site)$';return`[out:json][timeout:14][maxsize:8388608];(nwr(around:${Math.round(radiusKm*1000)},${Number(point.lat).toFixed(5)},${Number(point.lon).toFixed(5)})["tourism"~"${tourism}"]["name"];);out center tags 180;`}
async function fetchJson(endpoint,q,fetchImpl,timeoutMs){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const r=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams({data:q}),signal:controller.signal});if(!r.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(timer)}}
function normalize(e){const point={lat:Number(e.lat??e.center?.lat),lon:Number(e.lon??e.center?.lon)},tags=e.tags||{},name=tags.name||tags['name:en']||tags.brand;return valid(point)&&name?{id:`${e.type}-${e.id}`,name,point,tags}:null}
async function overpassSearch(point,trip,radiusKm,fetchImpl,timeoutMs){
 const q=query(point,trip,radiusKm);
 const responses=await Promise.all(ENDPOINTS.map(ep=>fetchJson(ep,q,fetchImpl,timeoutMs)));
 const byId=new Map();
 for(const raw of responses.flatMap(x=>x?.elements||[])){const n=normalize(raw);if(n)byId.set(n.id,n)}
 return[...byId.values()];
}
async function nominatimFallback(day,trip,fetchImpl,timeoutMs){
 const place=day.to||day.overnight||day.location||'';
 const requested=trip?.accommodationType||'any';
 const word=requested==='camping'?'camping':requested==='hotel-bnb'?'hotel':'hotel';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
   const u=new URL(NOMINATIM);u.search=new URLSearchParams({format:'jsonv2',q:`${word} ${place}`,limit:'8',addressdetails:'1'});
   const r=await fetchImpl(u,{headers:{accept:'application/json'},signal:controller.signal});if(!r.ok)return[];
   const rows=await r.json();
   return(rows||[]).map((row,i)=>({id:`nominatim-${row.osm_type||'place'}-${row.osm_id||row.place_id||i}`,name:row.display_name?.split(',')[0]||row.name||place,point:{lat:Number(row.lat),lon:Number(row.lon)},tags:{tourism:requested==='camping'?'camp_site':'hotel',source:'nominatim'}})).filter(x=>valid(x.point));
 }catch{return[]}finally{clearTimeout(timer)}
}
function buildItem(best,trip){const evidence=[],t=best.place.tags||{};if(trip.transport==='motorcycle'){if(['yes','designated','permissive'].includes(String(t.motorcycle||t['access:motorcycle']||'').toLowerCase()))evidence.push('motor-toegang bevestigd');if(String(t.garage||t['parking:garage']||'').toLowerCase()==='yes')evidence.push('garage');if(String(t.covered||t['parking:covered']||'').toLowerCase()==='yes')evidence.push('overdekte parking');if(t.parking||t['parking:condition'])evidence.push('parking vermeld')}return{type:'accommodation',name:best.place.name,point:best.place.point,live:true,source:t.source==='nominatim'?'OpenStreetMap Nominatim':'OpenStreetMap Overpass',vehicleFit:true,vehicleFitScore:Math.round(best.score),vehicleFitEvidence:evidence,distanceFromOvernightKm:Number(best.distanceKm.toFixed(1)),reason:trip.transport==='motorcycle'?`Geselecteerd voor motorreis op verblijfstype, nabijheid en ${evidence.length?evidence.join(', '):'beschikbare voertuig-/parkeerinformatie'}.`:'Geselecteerd op voertuigtype, verblijfstype en nabijheid.',mapUrl:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(best.place.name+' '+best.place.point.lat+','+best.place.point.lon)}`}}
export async function enrichOvernightAccommodations(trip,plan,{fetchImpl=globalThis.fetch,timeoutMs=14000,onProgress}={}){
 if(typeof fetchImpl!=='function'||trip?.liveData===false)return plan;
 const days=(plan?.days||[]).filter(day=>day.kind!=='return'&&day.to!==trip.origin&&valid(day.toPoint));
 let completed=0,total=days.length;
 await mapConcurrent(days,async day=>{
   const placeName=day.to||day.overnight||day.location||'overnachtingsplaats';
   let ranked=[];
   for(const radiusKm of [12,25,45]){
     onProgress?.({type:'accommodation-search-start',completed,total,day:day.day,placeName,radiusKm});
     const found=await overpassSearch(day.toPoint,trip,radiusKm,fetchImpl,timeoutMs);
     ranked=found.map(place=>({place,distanceKm:km(day.toPoint,place.point)})).filter(x=>x.distanceKm<=radiusKm+3).map(x=>({...x,score:accommodationSuitability(x.place.tags,trip,x.distanceKm)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score||a.distanceKm-b.distanceKm);
     if(ranked.length)break;
     onProgress?.({type:'accommodation-radius-empty',completed,total,day:day.day,placeName,radiusKm});
   }
   if(!ranked.length){
     onProgress?.({type:'accommodation-fallback',completed,total,day:day.day,placeName});
     const fallback=await nominatimFallback(day,trip,fetchImpl,timeoutMs);
     ranked=fallback.map(place=>({place,distanceKm:km(day.toPoint,place.point)})).filter(x=>x.distanceKm<=60).map(x=>({...x,score:100-x.distanceKm*2})).sort((a,b)=>b.score-a.score);
   }
   const best=ranked[0];
   if(best){
     day.recommendations=(day.recommendations||[]).filter(x=>x.type!=='accommodation');
     const item=buildItem(best,trip);day.recommendations.push(item);day.sleepProposal=item;
     onProgress?.({type:'accommodation-found',completed,total,day:day.day,placeName,name:item.name,distanceKm:best.distanceKm});
   }
   completed++;
   onProgress?.({type:'accommodation-day-complete',completed,total,day:day.day,placeName,found:Boolean(best),name:best?.place?.name||null});
 },{concurrency:Math.min(4,Math.max(1,days.length))});
 plan.recommendations=(plan.days||[]).flatMap(d=>d.recommendations||[]);
 return plan;
}
