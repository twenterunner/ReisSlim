import { mapConcurrent } from './roadtrip-runtime-engine.js?v=1926';

const ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const PHOTON='https://photon.komoot.io/api/';
const NOMINATIM='https://nominatim.openstreetmap.org/search';
const valid=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)),rad=x=>x*Math.PI/180;

function km(a,b){if(!valid(a)||!valid(b))return Infinity;const R=6371,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),x=rad(a.lat),y=rad(b.lat),h=Math.sin(d1/2)**2+Math.cos(x)*Math.cos(y)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function requestedType(trip){return trip?.accommodationType||'any'}
function typeRegex(requested){return requested==='camping'?'^(camp_site|caravan_site)$':requested==='hotel-bnb'?'^(hotel|guest_house|hostel|motel|apartment|chalet)$':'^(hotel|guest_house|hostel|motel|apartment|chalet|camp_site|caravan_site)$'}
function typeAllowed(tags,requested,vehicle){
  const tourism=String(tags?.tourism||'').toLowerCase(),camping=['camp_site','caravan_site'].includes(tourism),lodging=['hotel','guest_house','hostel','motel','apartment','chalet','bed_and_breakfast'].includes(tourism);
  if(requested==='camping')return camping;
  if(requested==='hotel-bnb')return lodging;
  if(['motorhome','caravan'].includes(vehicle))return camping;
  return camping||lodging;
}
export function motorcycleAccommodationScore(tags={}){
  let score=0;const motorcycle=String(tags.motorcycle||tags['access:motorcycle']||'').toLowerCase();
  if(['yes','designated','permissive'].includes(motorcycle))score+=38;if(['no','private'].includes(motorcycle))score-=80;
  const parking=String(tags.parking||tags['parking:condition']||'').toLowerCase();if(parking&&parking!=='no')score+=18;
  if(String(tags.garage||tags['parking:garage']||'').toLowerCase()==='yes')score+=28;
  if(String(tags.covered||tags['parking:covered']||'').toLowerCase()==='yes')score+=18;
  if(tags.website||tags['contact:website'])score+=6;if(tags.phone||tags['contact:phone'])score+=4;
  if(['camp_site','caravan_site'].includes(tags.tourism))score+=8;return score;
}
export function accommodationSuitability(tags,trip,distanceKm=0){
  const vehicle=trip?.transport,requested=requestedType(trip);if(!typeAllowed(tags,requested,vehicle))return-Infinity;
  let score=160-distanceKm*3.2;if(vehicle==='motorcycle')score+=motorcycleAccommodationScore(tags);
  if(['motorhome','caravan'].includes(vehicle)){if(tags.motorhome==='yes'||tags.caravans==='yes')score+=30;if(tags.power_supply)score+=8;if(tags.sanitary_dump_station==='yes')score+=12}
  return score;
}
async function fetchJson(url,options,fetchImpl,timeoutMs){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetchImpl(url,{...options,signal:controller.signal});if(!r?.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(timer)}
}
function normalizeOverpass(e){
  const point={lat:Number(e.lat??e.center?.lat),lon:Number(e.lon??e.center?.lon)},tags=e.tags||{},name=tags.name||tags['name:nl']||tags['name:en']||tags.brand||tags.operator;
  return valid(point)&&name?{id:`${e.type}-${e.id}`,name,point,tags,source:'overpass'}:null;
}
function overpassQuery(days,trip,radiusKm){
  const regex=typeRegex(requestedType(trip)),clauses=days.map(day=>`nwr(around:${Math.round(radiusKm*1000)},${Number(day.toPoint.lat).toFixed(5)},${Number(day.toPoint.lon).toFixed(5)})["tourism"~"${regex}"];`).join('');
  return`[out:json][timeout:7][maxsize:8388608];(${clauses});out center tags 320;`;
}
async function queryOverpass(endpoint,q,fetchImpl,timeoutMs){
  const data=await fetchJson(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams({data:q})},fetchImpl,timeoutMs);
  return(data?.elements||[]).map(normalizeOverpass).filter(Boolean);
}
async function firstNonEmpty(tasks){
  return await new Promise(resolve=>{
    let pending=tasks.length,done=false;if(!pending)return resolve([]);
    tasks.forEach(task=>Promise.resolve(task).then(value=>{
      if(done)return;if(Array.isArray(value)&&value.length){done=true;resolve(value);return}
      if(--pending===0){done=true;resolve([])}
    }).catch(()=>{if(done)return;if(--pending===0){done=true;resolve([])}}));
  });
}
async function batchOverpass(days,trip,radiusKm,fetchImpl,timeoutMs){
  if(!days.length)return[];
  const q=overpassQuery(days,trip,radiusKm);
  return firstNonEmpty(ENDPOINTS.map(endpoint=>queryOverpass(endpoint,q,fetchImpl,timeoutMs)));
}
function photonKind(properties={}){
  const raw=String(properties.osm_value||properties.type||properties.kind||'').toLowerCase();
  if(['hotel','guest_house','hostel','motel','apartment','chalet','camp_site','caravan_site'].includes(raw))return raw;
  const text=`${properties.name||''} ${properties.osm_key||''} ${raw}`.toLowerCase();
  if(/\b(camping|camp site|caravan)\b/.test(text))return'camp_site';
  if(/\b(hotel|b&b|bed.?and.?breakfast|guest.?house|pension|hostel|lodge|resort|vakantie|holiday)\b/.test(text))return'guest_house';
  return'';
}
async function photonFallback(day,trip,fetchImpl,timeoutMs){
  const requested=requestedType(trip),terms=requested==='camping'?['camping']:requested==='hotel-bnb'?['hotel','guest house']:['hotel','camping'];
  const results=await Promise.all(terms.map(async term=>{
    const url=new URL(PHOTON);url.search=new URLSearchParams({q:`${term} ${day.to||day.overnight||day.location||''}`,lat:String(day.toPoint.lat),lon:String(day.toPoint.lon),limit:'12',lang:'nl'});
    const payload=await fetchJson(url,{headers:{accept:'application/json'}},fetchImpl,timeoutMs);
    return(payload?.features||[]).map((f,i)=>{
      const p=f.properties||{},coords=f.geometry?.coordinates||[],tourism=photonKind(p),name=p.name||p.street||p.city;
      const point={lat:Number(coords[1]),lon:Number(coords[0])};
      return tourism&&name&&valid(point)?{id:`photon-${p.osm_type||'x'}-${p.osm_id||i}`,name,point,tags:{tourism,source:'photon'},source:'photon'}:null;
    }).filter(Boolean);
  }));
  return results.flat();
}
async function nominatimFallback(day,trip,fetchImpl,timeoutMs){
  const requested=requestedType(trip),place=day.to||day.overnight||day.location||'',terms=requested==='camping'?['camping']:requested==='hotel-bnb'?['hotel','bed and breakfast']:['hotel','camping'];
  for(const term of terms){
    const delta=.45,viewbox=[day.toPoint.lon-delta,day.toPoint.lat+delta,day.toPoint.lon+delta,day.toPoint.lat-delta].join(',');
    const url=new URL(NOMINATIM);url.search=new URLSearchParams({format:'jsonv2',q:`${term} ${place}`,limit:'12',bounded:'1',viewbox,addressdetails:'1',extratags:'1'});
    const rows=await fetchJson(url,{headers:{accept:'application/json'}},fetchImpl,timeoutMs);
    const out=(rows||[]).map((row,i)=>{
      const extra=row.extratags||{},raw=String(extra.tourism||row.type||'').toLowerCase(),display=String(row.display_name||''),text=`${row.name||''} ${display}`.toLowerCase();
      let tourism=['hotel','guest_house','hostel','motel','apartment','chalet','camp_site','caravan_site'].includes(raw)?raw:'';
      if(!tourism&&/\b(camping|camp site|caravan)\b/.test(text))tourism='camp_site';
      if(!tourism&&/\b(hotel|b&b|bed.?and.?breakfast|guest.?house|pension|hostel|lodge|resort|vakantie|holiday)\b/.test(text))tourism='guest_house';
      const point={lat:Number(row.lat),lon:Number(row.lon)},name=String(row.name||display).split(',')[0].trim();
      return tourism&&name&&valid(point)?{id:`nominatim-${row.osm_type||'place'}-${row.osm_id||row.place_id||i}`,name,point,tags:{...extra,tourism,source:'nominatim'},source:'nominatim'}:null;
    }).filter(Boolean);
    if(out.length)return out;
  }
  return[];
}
function rankForDay(day,candidates,trip,maxKm){
  return candidates.map(place=>({place,distanceKm:km(day.toPoint,place.point)}))
    .filter(x=>x.distanceKm<=maxKm)
    .map(x=>({...x,score:accommodationSuitability(x.place.tags,trip,x.distanceKm)}))
    .filter(x=>Number.isFinite(x.score))
    .sort((a,b)=>b.score-a.score||a.distanceKm-b.distanceKm);
}
function buildItem(best,trip){
  const evidence=[],t=best.place.tags||{};
  if(trip.transport==='motorcycle'){
    if(['yes','designated','permissive'].includes(String(t.motorcycle||t['access:motorcycle']||'').toLowerCase()))evidence.push('motor-toegang bevestigd');
    if(String(t.garage||t['parking:garage']||'').toLowerCase()==='yes')evidence.push('garage');
    if(String(t.covered||t['parking:covered']||'').toLowerCase()==='yes')evidence.push('overdekte parking');
    if(t.parking||t['parking:condition'])evidence.push('parking vermeld');
  }
  const source=best.place.source==='photon'?'OpenStreetMap Photon':best.place.source==='nominatim'?'OpenStreetMap Nominatim':'OpenStreetMap Overpass';
  return{type:'accommodation',name:best.place.name,point:best.place.point,live:true,genericFallback:false,source,vehicleFit:[trip.transport],vehicleFitScore:Math.round(best.score),vehicleFitEvidence:evidence,distanceFromOvernightKm:Number(best.distanceKm.toFixed(1)),reason:trip.transport==='motorcycle'?`Geselecteerd voor motorreis op verblijfstype, nabijheid en ${evidence.length?evidence.join(', '):'beschikbare voertuig-/parkeerinformatie'}.`:'Geselecteerd op verblijfstype en nabijheid.',mapUrl:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(best.place.name+' '+best.place.point.lat+','+best.place.point.lon)}`};
}
function externalFallback(day,trip){
  const place=day.to||day.overnight||day.location||'de overnachtingsplaats',requested=requestedType(trip),term=requested==='camping'?'camping':requested==='hotel-bnb'?'hotel B&B':'accommodation hotel camping';
  const query=`${term} near ${place} ${day.toPoint.lat},${day.toPoint.lon}`,mapUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return{type:'accommodation',name:`Bekijk verblijven rond ${place}`,point:{...day.toPoint},live:false,genericFallback:true,lookupComplete:true,source:'Externe live zoeklink',vehicleFit:null,vehicleFitScore:null,vehicleFitEvidence:[],distanceFromOvernightKm:0,reason:'De gestructureerde OpenStreetMap-bronnen leverden hier geen betrouwbaar genoemd verblijf. ReisSlim toont daarom een bruikbare live kaartzoekopdracht in plaats van ten onrechte te zeggen dat er geen accommodatie bestaat.',mapUrl,url:mapUrl};
}
export async function enrichOvernightAccommodations(trip,plan,{fetchImpl=globalThis.fetch,timeoutMs=5200,onProgress}={}){
  if(typeof fetchImpl!=='function'||trip?.liveData===false)return plan;
  const days=(plan?.days||[]).filter(day=>day.kind!=='return'&&day.to!==trip.origin&&valid(day.toPoint));
  if(!days.length)return plan;
  const total=days.length;let completed=0;
  days.forEach(day=>onProgress?.({type:'accommodation-search-start',completed,total,day:day.day,placeName:day.to||day.overnight||day.location,radiusKm:25}));
  let candidates=await batchOverpass(days,trip,25,fetchImpl,Math.min(5200,timeoutMs));
  const unresolved=[];
  for(const day of days){
    const ranked=rankForDay(day,candidates,trip,30);
    if(ranked[0]){
      day.recommendations=(day.recommendations||[]).filter(x=>x.type!=='accommodation');const item=buildItem(ranked[0],trip);day.recommendations.push(item);day.sleepProposal=item;
      completed++;onProgress?.({type:'accommodation-day-complete',completed,total,day:day.day,placeName:day.to,found:true,name:item.name});
    }else unresolved.push(day);
  }
  if(unresolved.length){
    unresolved.forEach(day=>onProgress?.({type:'accommodation-radius-empty',completed,total,day:day.day,placeName:day.to,radiusKm:25}));
    const wider=await batchOverpass(unresolved,trip,60,fetchImpl,Math.min(5200,timeoutMs));
    candidates=[...candidates,...wider];
  }
  await mapConcurrent(unresolved,async day=>{
    let ranked=rankForDay(day,candidates,trip,65);
    if(!ranked.length){
      onProgress?.({type:'accommodation-fallback',completed,total,day:day.day,placeName:day.to});
      const photon=await photonFallback(day,trip,fetchImpl,3600);
      ranked=rankForDay(day,photon,trip,70);
    }
    if(!ranked.length){
      const nominatim=await nominatimFallback(day,trip,fetchImpl,3200);
      ranked=rankForDay(day,nominatim,trip,70);
    }
    day.recommendations=(day.recommendations||[]).filter(x=>x.type!=='accommodation');
    const item=ranked[0]?buildItem(ranked[0],trip):externalFallback(day,trip);
    day.recommendations.push(item);day.sleepProposal=item;completed++;
    onProgress?.({type:'accommodation-day-complete',completed,total,day:day.day,placeName:day.to,found:!item.genericFallback,name:item.name});
  },{concurrency:Math.min(4,Math.max(1,unresolved.length))});
  plan.recommendations=(plan.days||[]).flatMap(d=>d.recommendations||[]);
  plan.accommodationData={live:days.some(day=>day.sleepProposal?.live),specific:days.filter(day=>day.sleepProposal&&!day.sleepProposal.genericFallback).length,fallbackLinks:days.filter(day=>day.sleepProposal?.genericFallback).length,source:'batched Overpass + Photon + Nominatim',lastChecked:new Date().toISOString()};
  return plan;
}
