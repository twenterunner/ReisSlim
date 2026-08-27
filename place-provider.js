import { originCatalog, validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { transportId } from './vehicle-intelligence.js';
import { buildRecommendations } from './recommendation-engine.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_PREFIX = 'reisslim.live.v10.';

const clone = value => typeof globalThis.structuredClone === 'function'
  ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));

function defaultStorage(){ try { return globalThis.localStorage || null; } catch { return null; } }
function cacheKey(namespace,input){ let h=2166136261; for(const c of String(input)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return `${CACHE_PREFIX}${namespace}.${(h>>>0).toString(36)}`; }
function readCache(storage,key,maxAgeMs){ if(!storage)return null; try{ const r=JSON.parse(storage.getItem(key)); return r&&Date.now()-r.savedAt<=maxAgeMs?r.value:null; }catch{return null;} }
function writeCache(storage,key,value){ if(!storage)return; try{ storage.setItem(key,JSON.stringify({savedAt:Date.now(),value})); }catch{} }

async function fetchJson(url,options,timeoutMs,fetchImpl){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{...options,signal:controller.signal});
    if(!response.ok)throw new Error(`Live databron antwoordde met ${response.status}.`);
    return await response.json();
  }finally{ clearTimeout(timer); }
}

export async function geocodeOrigin(origin,options={}){
  const query=String(origin||'').trim();
  if(!query)return null;
  const known=originCatalog[query.toLocaleLowerCase('nl-NL')];
  if(known)return{...known,name:query,source:'ReisSlim origin catalog'};
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  if(typeof fetchImpl!=='function')return null;
  const storage=options.storage===undefined?defaultStorage():options.storage;
  const key=cacheKey('geocode',query.toLocaleLowerCase('nl-NL'));
  const cached=readCache(storage,key,90*24*60*60*1000);
  if(cached)return cached;
  const url=new URL(options.nominatimUrl||NOMINATIM_URL);
  url.search=new URLSearchParams({q:query,format:'jsonv2',limit:'1',addressdetails:'1'});
  try{
    const result=await fetchJson(url,{headers:{accept:'application/json'}},3000,fetchImpl);
    const match=result?.[0]; if(!match)return null;
    const point={lat:Number(match.lat),lon:Number(match.lon),name:String(match.display_name||query),countryCode:String(match.address?.country_code||'').toUpperCase(),country:String(match.address?.country||''),source:'OpenStreetMap Nominatim'};
    if(!validCoordinate(point))return null;
    writeCache(storage,key,point); return point;
  }catch{return null;}
}

function clauseFor(item,radius){
  const lat=Number(item.point.lat).toFixed(5),lon=Number(item.point.lon).toFixed(5);
  const around=`around:${radius},${lat},${lon}`;
  if(item.type==='accommodation')return `nwr(${around})["tourism"~"^(hotel|guest_house|hostel|motel|camp_site|caravan_site)$"]["name"];`;
  if(item.type==='restaurant')return `nwr(${around})["amenity"~"^(restaurant|cafe)$"]["name"];`;
  if(item.type==='fuel')return `nwr(${around})["amenity"~"^(fuel|charging_station)$"]["name"];`;
  if(item.type==='rest')return `nwr(${around})["highway"~"^(rest_area|services)$"]["name"];`;
  if(item.type==='service')return `nwr(${around})["amenity"~"^(fuel|charging_station)$"]["name"];nwr(${around})["highway"~"^(rest_area|services)$"]["name"];`;
  return `nwr(${around})["tourism"~"^(attraction|viewpoint|museum|zoo|theme_park|gallery)$"]["name"];nwr(${around})["historic"]["name"];nwr(${around})["leisure"~"^(nature_reserve|park)$"]["name"];`;
}

export function buildOverpassQueries(plan){
  const items=(plan?.days||[]).flatMap(day=>(day.recommendations||[]).filter(item=>validCoordinate(item.point)).map(item=>({...item,day:day.day})));
  return items.map(item=>`[out:json][timeout:8][maxsize:4194304];(${clauseFor(item,12000)});out center tags 80;`);
}

function placeType(tags={}){
  if(['hotel','guest_house','hostel','motel','camp_site','caravan_site'].includes(tags.tourism))return'accommodation';
  if(['restaurant','cafe'].includes(tags.amenity))return'restaurant';
  if(['fuel','charging_station'].includes(tags.amenity))return'fuel';
  if(['rest_area','services'].includes(tags.highway))return'rest';
  if(['attraction','viewpoint','museum','zoo','theme_park','gallery'].includes(tags.tourism)||tags.historic||['nature_reserve','park'].includes(tags.leisure))return'activity';
  return null;
}
function mapsSearchUrl(name,point){ return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${point.lat.toFixed(5)},${point.lon.toFixed(5)}`)}`; }
function evidenceScore(tags={}){
  let score=0;
  if(tags.website||tags['contact:website'])score+=16;
  if(tags.opening_hours)score+=10;
  if(tags.phone||tags['contact:phone'])score+=4;
  if(tags.wikidata||tags.wikipedia)score+=6;
  if(tags.cuisine)score+=7;
  if(tags.reservation||tags['reservation:website'])score+=5;
  const stars=Number(tags.stars); if(Number.isFinite(stars)&&stars>0)score+=Math.min(15,stars*3);
  return score;
}
function normalizePlace(element){
  const point={lat:Number(element.lat??element.center?.lat),lon:Number(element.lon??element.center?.lon)};
  const tags=element.tags||{},type=placeType(tags);
  const name=tags.name||tags['name:nl']||tags['name:en']||tags.brand;
  if(!type||!name||!validCoordinate(point))return null;
  return{id:`${element.type}-${element.id}`,type,name,point,tags,openingHours:tags.opening_hours||null,website:tags.website||tags['contact:website']||null,osmUrl:`https://www.openstreetmap.org/${element.type}/${element.id}`,mapUrl:mapsSearchUrl(name,point),evidenceScore:evidenceScore(tags),officialStars:Number(tags.stars)||null};
}
export function normalizeOverpassPlaces(payload){ return (payload?.elements||[]).map(normalizePlace).filter(Boolean); }

function accommodationFits(place,vehicle){
  const camping=['camp_site','caravan_site'].includes(place.tags?.tourism);
  if(['motorhome','caravan'].includes(vehicle))return camping;
  return !camping;
}

function routeDistanceKm(point,geometry=[]){
  if(!validCoordinate(point)||!Array.isArray(geometry)||geometry.length<2)return Infinity;
  const lat0=point.lat*Math.PI/180,kx=111.32*Math.cos(lat0),ky=110.57;
  let best=Infinity;
  for(let i=1;i<geometry.length;i++){
    const a=geometry[i-1],b=geometry[i];if(!validCoordinate(a)||!validCoordinate(b))continue;
    const ax=(a.lon-point.lon)*kx,ay=(a.lat-point.lat)*ky,bx=(b.lon-point.lon)*kx,by=(b.lat-point.lat)*ky;
    const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
    const x=ax+t*dx,y=ay+t*dy;best=Math.min(best,Math.hypot(x,y));
  }
  return best;
}
function corridorLimitKm(item){
  if(['fuel','rest','restaurant','service'].includes(item.type))return 2.5;
  if(item.type==='accommodation')return 5;
  return 7;
}

function suitability(place,item,trip,distanceKm){
  const vehicle=transportId(trip.transport);
  let score=140-distanceKm*4+(place.evidenceScore||0);
  if(item.type==='service'&&['fuel','rest'].includes(place.type))score+=10;
  else if(place.type!==item.type)score-=150;
  if(place.type==='accommodation')score+=accommodationFits(place,vehicle)?28:-55;
  if(place.type==='restaurant'){
    if(item.meal==='lunch')score+=place.tags?.cuisine?8:2;
    if(place.tags?.amenity==='cafe')score-=4;
  }
  return score;
}

async function queryEndpoint(query,endpoint,fetchImpl,timeoutMs){
  const body=new URLSearchParams({data:query}).toString();
  return normalizeOverpassPlaces(await fetchJson(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body},timeoutMs,fetchImpl));
}


async function fetchNominatimCategory(item,fetchImpl,timeoutMs=3500){
  const qMap={accommodation:['hotel','guest house','camping'],restaurant:['restaurant','cafe'],fuel:['fuel'],rest:['rest area','service area','cafe'],service:['fuel'],activity:['museum','attraction','viewpoint']};
  const queries=qMap[item.type]||qMap.activity,delta=.55,viewbox=[item.point.lon-delta,item.point.lat+delta,item.point.lon+delta,item.point.lat-delta].join(',');
  for(const q of queries){
    try{
      const url=new URL(NOMINATIM_URL);url.search=new URLSearchParams({q,format:'jsonv2',limit:'8',bounded:'1',viewbox,addressdetails:'1',extratags:'1'});
      const rows=await fetchJson(url,{headers:{accept:'application/json'}},timeoutMs,fetchImpl);
      const places=(rows||[]).map(row=>{const point={lat:Number(row.lat),lon:Number(row.lon)},name=String(row.name||row.display_name||'').split(',')[0].trim();if(!name||!validCoordinate(point))return null;return{id:`nominatim-${row.place_id}`,type:item.type==='service'?'fuel':item.type,name,point,tags:row.extratags||{},openingHours:row.extratags?.opening_hours||null,website:row.extratags?.website||null,osmUrl:`https://www.openstreetmap.org/${row.osm_type==='node'?'node':row.osm_type==='way'?'way':'relation'}/${row.osm_id}`,mapUrl:mapsSearchUrl(name,point),evidenceScore:1};}).filter(Boolean);
      if(places.length)return places;
    }catch{}
  }
  // Last-resort named-place lookup: in sparse regions (Namibia/SA in particular)
  // category search can return nothing although a usable named POI exists nearby.
  try{
    const reverse=new URL('https://nominatim.openstreetmap.org/reverse');
    reverse.search=new URLSearchParams({lat:String(item.point.lat),lon:String(item.point.lon),format:'jsonv2',zoom:'18',addressdetails:'1',extratags:'1'});
    const row=await fetchJson(reverse,{headers:{accept:'application/json'}},timeoutMs,fetchImpl);
    const name=String(row?.name||row?.display_name||'').split(',')[0].trim();
    const point={lat:Number(row?.lat),lon:Number(row?.lon)};
    if(name&&validCoordinate(point)){
      return[{id:`nominatim-reverse-${row.place_id||`${point.lat}-${point.lon}`}`,type:item.type==='service'?'fuel':item.type,name,point,tags:row.extratags||{},openingHours:row.extratags?.opening_hours||null,website:row.extratags?.website||null,osmUrl:row.osm_id?`https://www.openstreetmap.org/${row.osm_type==='node'?'node':row.osm_type==='way'?'way':'relation'}/${row.osm_id}`:null,mapUrl:mapsSearchUrl(name,point),evidenceScore:0}];
    }
  }catch{}
  return[];
}

async function fetchSpecificCandidates(item,options,fetchImpl,storage){
  const rounded=`${item.type}:${item.point.lat.toFixed(3)}:${item.point.lon.toFixed(3)}`;
  const key=cacheKey('specific',rounded);
  const cached=readCache(storage,key,4*24*60*60*1000);
  if(cached?.length)return cached;
  // Fast path: bounded Nominatim category lookup usually returns a named place
  // much faster than a broad Overpass radius query.
  const quick=await fetchNominatimCategory(item,fetchImpl,options.nominatimTimeoutMs||4500);
  if(quick.length){writeCache(storage,key,quick);return quick;}
  // Detail fallback: only use Overpass when Nominatim did not produce a suitable name.
  for(const radius of [8000,18000]){
    const query=`[out:json][timeout:6][maxsize:4194304];(${clauseFor(item,radius)});out center tags 60;`;
    for(const endpoint of options.overpassUrls||OVERPASS_ENDPOINTS){
      try{
        const found=await queryEndpoint(query,endpoint,fetchImpl,options.placeTimeoutMs||6500);
        if(found.length){ writeCache(storage,key,found); return found; }
      }catch{}
    }
  }
  return [];
}

async function mapLimit(items,limit,worker){
  const results=new Array(items.length); let next=0;
  const runners=Array.from({length:Math.min(limit,items.length)},async()=>{
    while(true){ const index=next++; if(index>=items.length)return; results[index]=await worker(items[index],index); }
  });
  await Promise.all(runners); return results;
}

function applyLivePlace(item,place,distanceKm,day){
  Object.assign(item,{
    name:place.name,point:place.point,confidence:'named-live-place',
    source:place.id?.startsWith('nominatim-')?'OpenStreetMap Nominatim':'OpenStreetMap via Overpass',verified:false,live:true,genericFallback:false,
    detourKm:Number(distanceKm.toFixed(1)),openingHours:place.openingHours,
    websiteUrl:place.website,sourceUrl:place.osmUrl,mapUrl:place.mapUrl,url:place.mapUrl,
    officialStars:place.officialStars,
    rating:null,ratingProvider:null,ratingStatus:'controleer actuele reviews via kaartlink',
    reason:`Specifiek genoemd voorstel voor ${item.meal==='lunch'?'lunch':item.type==='accommodation'?'overnachting':item.type} bij ${day.location||day.to}. Geselecteerd op nabijheid, voertuiggeschiktheid en beschikbare broninformatie.`,
    lastChecked:new Date().toISOString()
  });
}



async function reverseGeocodePoint(point,fetchImpl,timeoutMs=3200){
  if(!validCoordinate(point))return null;
  const url=new URL('https://nominatim.openstreetmap.org/reverse');
  url.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),format:'jsonv2',zoom:'10',addressdetails:'1'});
  try{
    const row=await fetchJson(url,{headers:{accept:'application/json'}},timeoutMs,fetchImpl),address=row?.address||{};
    const name=address.city||address.town||address.village||address.municipality||address.county||address.state_district;
    const country=String(address.country||'').trim(),countryCode=String(address.country_code||'').toUpperCase();
    // Require an actual land address. Ocean/reverse results without a country/locality are rejected.
    if(!name||!country||!countryCode)return null;
    return{lat:Number(row.lat)||point.lat,lon:Number(row.lon)||point.lon,name,country,countryCode,landValidated:true};
  }catch{return null}
}
function searchPointAround(point,bearingDeg,distanceKm){
  const R=6371,a=distanceKm/R,b=bearingDeg*Math.PI/180,lat1=point.lat*Math.PI/180,lon1=point.lon*Math.PI/180;
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b));
  const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));
  return{lat:Number((lat2*180/Math.PI).toFixed(6)),lon:Number((((lon2*180/Math.PI+540)%360)-180).toFixed(6))};
}
async function findNearestLandLocality(point,fetchImpl,timeoutMs=3200){
  const direct=await reverseGeocodePoint(point,fetchImpl,timeoutMs);
  if(direct)return direct;
  // Ocean guard: search a compact ring around the synthetic point. The first real locality
  // is preferred over retaining a coordinate that cannot be identified as land.
  const radii=[35,70,120,180];
  const bearings=[0,45,90,135,180,225,270,315];
  for(const radius of radii){
    for(const bearing of bearings){
      const candidate=searchPointAround(point,bearing,radius);
      const resolved=await reverseGeocodePoint(candidate,fetchImpl,Math.min(timeoutMs,2400));
      if(resolved)return resolved;
    }
  }
  return null;
}
export async function prepareGeneratedRouteStops(plan,{fetchImpl=fetch,timeoutMs=3200,onProgress}={}){
  const generated=(plan?.days||[]).filter(day=>day.toPoint?.generatedExploration);
  if(!generated.length)return plan;
  for(let index=0;index<generated.length;index++){
    const day=generated[index],oldName=day.to;
    onProgress?.({index,total:generated.length,day:day.day,message:`Controleer overnachtingsregio voor dag ${day.day}`});
    const resolved=await findNearestLandLocality(day.toPoint,fetchImpl,timeoutMs);
    if(resolved){
      day.to=resolved.name;day.location=resolved.name;day.overnight=resolved.name;
      day.toPoint={...day.toPoint,...resolved,name:resolved.name,generatedExploration:true,landValidated:true};
      if(day.primaryPlan)day.primaryPlan=day.primaryPlan.replace(oldName,resolved.name);
      const next=(plan.days||[]).find(candidate=>candidate.day===day.day+1);
      if(next&&next.from===oldName){
        next.from=resolved.name;
        next.fromPoint={...next.fromPoint,...resolved,name:resolved.name,landValidated:true};
      }
    }else{
      // Never keep an unverified synthetic point in the sea. If live validation fails,
      // collapse this leg onto the previous known land point. It can still be regenerated
      // on the next live run, but the map/route remains geographically safe.
      const previous=(plan.days||[]).find(candidate=>candidate.day===day.day-1)?.toPoint;
      if(validCoordinate(previous)){
        const fallbackName=(plan.days||[]).find(candidate=>candidate.day===day.day-1)?.to||'Vorige regio';
        day.to=fallbackName;day.location=fallbackName;day.overnight=fallbackName;
        day.toPoint={...previous,name:fallbackName,generatedExploration:true,landValidated:false,landFallback:true};
        const next=(plan.days||[]).find(candidate=>candidate.day===day.day+1);
        if(next&&next.from===oldName){next.from=fallbackName;next.fromPoint={...day.toPoint}}
      }
    }
  }
  return plan;
}
async function resolveGeneratedExplorationStops(plan,fetchImpl,options={}){
  return prepareGeneratedRouteStops(plan,{fetchImpl,timeoutMs:options.nominatimTimeoutMs||3200});
}

async function resolveSpecificRecommendations(plan,trip,options,fetchImpl,storage){
  await resolveGeneratedExplorationStops(plan,fetchImpl,options);
  // Rebuild recommendations after live routing so rest/food/fuel anchors follow the
  // actual road geometry rather than the earlier straight-line corridor.
  buildRecommendations(trip,{bases:[plan.days?.find(day=>day.toPoint)?.toPoint].filter(Boolean)},plan.days||[]);
  plan.recommendations=(plan.days||[]).flatMap(day=>day.recommendations||[]);

  const jobs=[];
  for(const day of plan.days||[]){
    const recommendations=(day.recommendations||[]).filter(item=>validCoordinate(item.point));
    const picked=[];
    const seen=new Set();
    const add=item=>{
      if(!item)return;
      const key=`${item.type}:${item.point.lat.toFixed(4)}:${item.point.lon.toFixed(4)}`;
      if(seen.has(key))return;
      seen.add(key);picked.push(item);
    };

    // Resolve every operational route point. This is the core fix: the previous code
    // resolved only ONE restaurant and ONE fuel/rest item per day, then deleted the rest.
    recommendations.filter(item=>['rest','fuel','restaurant'].includes(item.type)).forEach(add);
    add(recommendations.find(item=>item.type==='accommodation'));
    add(recommendations.find(item=>item.type==='activity'));
    add(recommendations.find(item=>item.type==='service'));
    jobs.push(...picked.map(item=>({day,item})));
  }
  const total=jobs.length;let completed=0,foundCount=0;
  options.onProgress?.({type:'places-start',total});
  await mapLimit(jobs,3,async({day,item})=>{
    options.onProgress?.({type:'place-search',day:day.day,itemType:item.type,itemName:item.name,completed,total,found:foundCount});
    const candidates=await fetchSpecificCandidates(item,options,fetchImpl,storage);
    const ranked=candidates
      .map(place=>({place,distanceKm:haversineKm(item.point,place.point),routeDistanceKm:routeDistanceKm(place.point,day.geometry||[])}))
      .filter(x=>Number.isFinite(x.distanceKm)&&Number.isFinite(x.routeDistanceKm)&&x.routeDistanceKm<=corridorLimitKm(item))
      .sort((a,b)=>suitability(b.place,item,trip,b.distanceKm)-suitability(a.place,item,trip,a.distanceKm)||a.routeDistanceKm-b.routeDistanceKm||a.distanceKm-b.distanceKm);
    if(ranked[0]){
      applyLivePlace(item,ranked[0].place,ranked[0].distanceKm,day);item.routeDistanceKm=Number(ranked[0].routeDistanceKm.toFixed(1));item.reason=`${item.reason} Afstand tot de echte dagroute: ± ${item.routeDistanceKm} km.`;foundCount++;
    }else{
      // A finished lookup must never remain visually stuck in a pending state.
      Object.assign(item,{live:false,genericFallback:false,lookupComplete:true,lookupMissing:true,
        confidence:'live-place-not-found',source:'OpenStreetMap zoekactie afgerond',
        name:`Geen specifieke ${item.type==='fuel'?'brandstofstop':item.type==='rest'?'ruststop':item.type==='restaurant'?'eetstop':item.type==='accommodation'?'overnachting':'POI'} gevonden`,
        lastChecked:new Date().toISOString()});
    }
    completed++;
    options.onProgress?.({type:ranked[0]?'place-found':'place-missing',day:day.day,itemType:item.type,name:ranked[0]?.place?.name||null,completed,total,found:foundCount});
  });
  for(const day of plan.days||[]){
    day.recommendations=(day.recommendations||[]).filter(item=>{
      if(!item.name||!validCoordinate(item.point))return false;
      if(item.live)return true;
      // Completed misses are not map/GPX waypoints. Their search is complete and the
      // progress UI reports the miss; no fake pending POI remains on screen.
      return false;
    });
    day.sleepProposal=day.recommendations.find(item=>item.type==='accommodation')||null;
  }
  plan.recommendations=(plan.days||[]).flatMap(day=>day.recommendations||[]);
  options.onProgress?.({type:'places-complete',completed,total,found:foundCount});
  return plan;
}

function dateDifference(dateString,now=new Date()){ const date=new Date(`${dateString}T12:00:00`),today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12); return Math.round((date-today)/86400000); }
async function fetchWeather(trip,destination,options,fetchImpl,storage){
  const leadDays=dateDifference(trip.startDate,options.now||new Date());
  if(leadDays<-1||leadDays>15||!validCoordinate(destination.bases?.[0]))return null;
  const point=destination.bases[0],url=new URL(options.weatherUrl||WEATHER_URL);
  url.search=new URLSearchParams({latitude:String(point.lat),longitude:String(point.lon),daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',timezone:'auto',forecast_days:'16'});
  const key=cacheKey('weather',`${point.lat},${point.lon}`),cached=readCache(storage,key,2*60*60*1000); if(cached)return cached;
  try{
    const payload=await fetchJson(url,{headers:{accept:'application/json'}},options.weatherTimeoutMs||5000,fetchImpl),daily=payload.daily||{};
    const days=(daily.time||[]).map((date,index)=>({date,weatherCode:daily.weather_code?.[index],minimumC:daily.temperature_2m_min?.[index],maximumC:daily.temperature_2m_max?.[index],precipitationChance:daily.precipitation_probability_max?.[index],windKmh:daily.wind_speed_10m_max?.[index]})).filter(day=>day.date>=trip.startDate).slice(0,trip.days);
    const weather=days.length?{source:'Open-Meteo',live:true,days,lastChecked:new Date().toISOString()}:null; if(weather)writeCache(storage,key,weather); return weather;
  }catch{return null;}
}

export async function enrichPlanWithPlaces(trip,destination,plan,options={}){
  if(trip.liveData===false)return plan;
  const fetchImpl=options.fetchImpl||globalThis.fetch; if(typeof fetchImpl!=='function')return plan;
  const storage=options.storage===undefined?defaultStorage():options.storage,next=clone(plan);
  const [_,weather]=await Promise.all([
    resolveSpecificRecommendations(next,trip,options,fetchImpl,storage),
    fetchWeather(trip,destination,options,fetchImpl,storage)
  ]);
  if(weather)next.weather=weather;
  const missing=(next.days||[]).reduce((sum,day)=>sum+((day.kind!=='return'||day.to!==trip.origin)&&!day.recommendations?.some(item=>item.type==='accommodation')?1:0),0);
  next.placeData={
    live:next.recommendations.length>0,
    source:'OpenStreetMap via targeted Overpass lookup',
    specificRecommendations:next.recommendations.length,
    missingSpecificAccommodationDays:missing,
    reviewRatingsLive:false,
    reviewRatingNote:'ReisSlim koppelt naar actuele reviews maar claimt zonder ratingsprovider geen consumentenrating.',
    weatherLive:Boolean(next.weather?.live),
    error:missing?`${missing} overnachtingsdag(en) zonder betrouwbaar specifiek OSM-resultaat; geen generieke accommodatie is verzonnen.`:null
  };
  return next;
}
