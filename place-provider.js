import { originCatalog, validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { transportId } from './vehicle-intelligence.js';
import { buildRecommendations } from './recommendation-engine.js';
import { adaptPlanToWeather } from './weather-engine.js';

const NOMINATIM_URL='https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE='https://nominatim.openstreetmap.org/reverse';
const PHOTON_REVERSE='https://photon.komoot.io/reverse';
const OVERPASS_ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const WEATHER_URL='https://api.open-meteo.com/v1/forecast';
const CACHE_PREFIX='reisslim.live.v11.';

const clone=value=>typeof globalThis.structuredClone==='function'?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));
function defaultStorage(){try{return globalThis.localStorage||null}catch{return null}}
function cacheKey(namespace,input){let h=2166136261;for(const c of String(input)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return`${CACHE_PREFIX}${namespace}.${(h>>>0).toString(36)}`}
function readCache(storage,key,maxAgeMs){if(!storage)return null;try{const r=JSON.parse(storage.getItem(key));return r&&Date.now()-r.savedAt<=maxAgeMs?r.value:null}catch{return null}}
function writeCache(storage,key,value){if(!storage)return;try{storage.setItem(key,JSON.stringify({savedAt:Date.now(),value}))}catch{}}

async function fetchJson(url,options={},timeoutMs=4200,fetchImpl=globalThis.fetch){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const upstream=options.signal;
  const abort=()=>controller.abort();
  if(upstream){if(upstream.aborted)controller.abort();else upstream.addEventListener?.('abort',abort,{once:true})}
  try{
    const response=await fetchImpl(url,{...options,signal:controller.signal});
    if(!response?.ok)throw new Error(`Live databron antwoordde met ${response?.status||'geen status'}.`);
    return await response.json();
  }finally{
    clearTimeout(timer);
    upstream?.removeEventListener?.('abort',abort);
  }
}

export async function geocodeOrigin(origin,options={}){
  const query=String(origin||'').trim();
  if(!query)return null;
  const known=originCatalog[query.toLocaleLowerCase('nl-NL')];
  if(known)return{...known,name:query,source:'ReisSlim origin catalog'};
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  if(typeof fetchImpl!=='function')return null;
  const storage=options.storage===undefined?defaultStorage():options.storage;
  const key=cacheKey('geocode',query.toLocaleLowerCase('nl-NL')),cached=readCache(storage,key,90*24*60*60*1000);
  if(cached)return cached;
  const url=new URL(options.nominatimUrl||NOMINATIM_URL);
  url.search=new URLSearchParams({q:query,format:'jsonv2',limit:'1',addressdetails:'1'});
  try{
    const result=await fetchJson(url,{headers:{accept:'application/json'}},2800,fetchImpl),match=result?.[0];
    if(!match)return null;
    const point={lat:Number(match.lat),lon:Number(match.lon),name:String(match.display_name||query),countryCode:String(match.address?.country_code||'').toUpperCase(),country:String(match.address?.country||''),source:'OpenStreetMap Nominatim'};
    if(!validCoordinate(point))return null;
    writeCache(storage,key,point);return point;
  }catch{return null}
}

function accommodationRegex(requested='any'){
  return requested==='camping'?'^(camp_site|caravan_site)$'
    :requested==='hotel-bnb'?'^(hotel|guest_house|hostel|motel|apartment|chalet)$'
    :'^(hotel|guest_house|hostel|motel|apartment|chalet|camp_site|caravan_site)$';
}
function clauseFor(item,radius){
  const lat=Number(item.point.lat).toFixed(5),lon=Number(item.point.lon).toFixed(5),around=`around:${radius},${lat},${lon}`;
  if(item.type==='accommodation')return`nwr(${around})["tourism"~"${accommodationRegex(item.accommodationType)}"];`;
  if(item.type==='restaurant')return`nwr(${around})["amenity"~"^(restaurant|cafe)$"]["name"];`;
  if(item.type==='fuel')return`nwr(${around})["amenity"~"^(fuel|charging_station)$"]["name"];`;
  if(item.type==='rest')return`nwr(${around})["highway"~"^(rest_area|services)$"];`;
  if(item.type==='service')return`nwr(${around})["amenity"~"^(fuel|charging_station)$"]["name"];nwr(${around})["highway"~"^(rest_area|services)$"];`;
  return`nwr(${around})["tourism"~"^(attraction|viewpoint|museum|zoo|theme_park|gallery)$"]["name"];nwr(${around})["historic"]["name"];nwr(${around})["leisure"~"^(nature_reserve|park)$"]["name"];`;
}
export function buildOverpassQueries(plan){
  const items=(plan?.days||[]).flatMap(day=>(day.recommendations||[]).filter(item=>validCoordinate(item.point)).map(item=>({...item,day:day.day})));
  return items.map(item=>`[out:json][timeout:6][maxsize:4194304];(${clauseFor(item,12000)});out center tags 80;`);
}

function placeType(tags={}){
  if(['hotel','guest_house','hostel','motel','apartment','chalet','camp_site','caravan_site'].includes(tags.tourism))return'accommodation';
  if(['restaurant','cafe'].includes(tags.amenity))return'restaurant';
  if(['fuel','charging_station'].includes(tags.amenity))return'fuel';
  if(['rest_area','services'].includes(tags.highway))return'rest';
  if(['attraction','viewpoint','museum','zoo','theme_park','gallery'].includes(tags.tourism)||tags.historic||['nature_reserve','park'].includes(tags.leisure))return'activity';
  return null;
}
function mapsSearchUrl(name,point){return`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${point.lat.toFixed(5)},${point.lon.toFixed(5)}`)}`}
function evidenceScore(tags={}){
  let score=0;
  if(tags.website||tags['contact:website'])score+=16;
  if(tags.opening_hours)score+=10;
  if(tags.phone||tags['contact:phone'])score+=4;
  if(tags.wikidata||tags.wikipedia)score+=6;
  if(tags.cuisine)score+=7;
  if(tags.reservation||tags['reservation:website'])score+=5;
  const stars=Number(tags.stars);if(Number.isFinite(stars)&&stars>0)score+=Math.min(15,stars*3);
  return score;
}
function normalizePlace(element){
  const point={lat:Number(element.lat??element.center?.lat),lon:Number(element.lon??element.center?.lon)},tags=element.tags||{},type=placeType(tags);
  const name=tags.name||tags['name:nl']||tags['name:en']||tags.brand||tags.operator;
  if(!type||!name||!validCoordinate(point))return null;
  return{id:`${element.type}-${element.id}`,type,name,point,tags,openingHours:tags.opening_hours||null,website:tags.website||tags['contact:website']||null,osmUrl:`https://www.openstreetmap.org/${element.type}/${element.id}`,mapUrl:mapsSearchUrl(name,point),evidenceScore:evidenceScore(tags),officialStars:Number(tags.stars)||null};
}
export function normalizeOverpassPlaces(payload){return(payload?.elements||[]).map(normalizePlace).filter(Boolean)}

function accommodationFits(place,vehicle,requested='any'){
  const camping=['camp_site','caravan_site'].includes(place.tags?.tourism);
  if(requested==='camping')return camping;
  if(requested==='hotel-bnb')return !camping;
  if(['motorhome','caravan'].includes(vehicle))return camping;
  return !camping;
}
function routeDistanceKm(point,geometry=[]){
  if(!validCoordinate(point)||!Array.isArray(geometry)||geometry.length<2)return Infinity;
  const lat0=point.lat*Math.PI/180,kx=111.32*Math.cos(lat0),ky=110.57;let best=Infinity;
  for(let i=1;i<geometry.length;i++){
    const a=geometry[i-1],b=geometry[i];if(!validCoordinate(a)||!validCoordinate(b))continue;
    const ax=(a.lon-point.lon)*kx,ay=(a.lat-point.lat)*ky,bx=(b.lon-point.lon)*kx,by=(b.lat-point.lat)*ky,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
    best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
  }
  return best;
}
function corridorLimitKm(item){
  if(['fuel','rest','restaurant','service'].includes(item.type))return 3.5;
  if(item.type==='accommodation')return 8;
  return 9;
}
function suitability(place,item,trip,distanceKm){
  const vehicle=transportId(trip.transport);let score=140-distanceKm*4+(place.evidenceScore||0);
  if(item.type==='service'&&['fuel','rest'].includes(place.type))score+=10;
  else if(place.type!==item.type)score-=150;
  if(place.type==='accommodation')score+=accommodationFits(place,vehicle,item.accommodationType||trip.accommodationType||'any')?42:-180;
  if(place.type==='restaurant'&&item.meal==='lunch')score+=place.tags?.cuisine?8:2;
  return score;
}
async function queryEndpoint(query,endpoint,fetchImpl,timeoutMs){
  const body=new URLSearchParams({data:query}).toString();
  return normalizeOverpassPlaces(await fetchJson(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body},timeoutMs,fetchImpl));
}
async function firstNonEmpty(tasks){
  return await new Promise(resolve=>{
    let pending=tasks.length,done=false;
    if(!pending)return resolve([]);
    tasks.forEach(task=>Promise.resolve(task).then(value=>{
      if(done)return;
      if(Array.isArray(value)&&value.length){done=true;resolve(value);return}
      if(--pending===0){done=true;resolve([])}
    }).catch(()=>{if(done)return;if(--pending===0){done=true;resolve([])}}));
  });
}

async function queryDayBatch(day,items,fetchImpl,options){
  if(!items.length)return[];
  const clauses=items.map(item=>clauseFor(item,item.type==='activity'?14000:9000)).join('');
  const query=`[out:json][timeout:6][maxsize:6291456];(${clauses});out center tags 220;`;
  const endpoints=options.overpassUrls||OVERPASS_ENDPOINTS;
  return firstNonEmpty(endpoints.map(endpoint=>queryEndpoint(query,endpoint,fetchImpl,Math.min(4800,options.placeTimeoutMs||4800))));
}
function applyLivePlace(item,place,distanceKm,day){
  Object.assign(item,{
    name:place.name,point:place.point,confidence:'named-live-place',source:'OpenStreetMap via gebundelde Overpass-zoekactie',verified:false,live:true,genericFallback:false,
    detourKm:Number(distanceKm.toFixed(1)),openingHours:place.openingHours,websiteUrl:place.website,sourceUrl:place.osmUrl,mapUrl:place.mapUrl,url:place.mapUrl,
    officialStars:place.officialStars,rating:null,ratingProvider:null,ratingStatus:'controleer actuele reviews via kaartlink',
    reason:`Specifiek genoemd voorstel voor ${item.meal==='lunch'?'lunch':item.type} bij ${day.location||day.to}. Eén gebundelde live zoekactie per reisdag; geselecteerd op nabijheid en route-afwijking.`,
    lastChecked:new Date().toISOString()
  });
}

async function reverseNominatim(point,fetchImpl,timeoutMs=2600){
  const url=new URL(NOMINATIM_REVERSE);url.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),format:'jsonv2',zoom:'10',addressdetails:'1'});
  try{
    const row=await fetchJson(url,{headers:{accept:'application/json'}},timeoutMs,fetchImpl),address=row?.address||{};
    const name=address.city||address.town||address.village||address.municipality||address.county||address.state_district,country=String(address.country||'').trim(),countryCode=String(address.country_code||'').toUpperCase();
    if(!name||!country||!countryCode)return null;
    return{lat:Number(row.lat)||point.lat,lon:Number(row.lon)||point.lon,name,country,countryCode,landValidated:true};
  }catch{return null}
}
async function reversePhoton(point,fetchImpl,timeoutMs=2600){
  try{
    const url=new URL(PHOTON_REVERSE);url.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),limit:'1'});
    const payload=await fetchJson(url,{headers:{accept:'application/json'}},timeoutMs,fetchImpl),feature=payload?.features?.[0],p=feature?.properties||{},coords=feature?.geometry?.coordinates||[];
    const name=p.city||p.town||p.village||p.locality||p.county||p.name,country=p.country,countryCode=String(p.countrycode||p.country_code||'').toUpperCase();
    if(!name||!country||!Number.isFinite(Number(coords[1]))||!Number.isFinite(Number(coords[0])))return null;
    return{lat:Number(coords[1]),lon:Number(coords[0]),name,country,countryCode,landValidated:true};
  }catch{return null}
}
async function findNearestLandLocality(point,fetchImpl,timeoutMs=2800){
  const direct=await firstNonEmpty([
    reverseNominatim(point,fetchImpl,timeoutMs).then(x=>x?[x]:[]),
    reversePhoton(point,fetchImpl,timeoutMs).then(x=>x?[x]:[])
  ]);
  return direct[0]||null;
}
export async function prepareGeneratedRouteStops(plan,{fetchImpl=globalThis.fetch,timeoutMs=2800,onProgress}={}){
  const generated=(plan?.days||[]).filter(day=>day.toPoint?.generatedExploration);
  if(!generated.length)return plan;
  let next=0;
  const workers=Array.from({length:Math.min(3,generated.length)},async()=>{
    while(next<generated.length){
      const index=next++,day=generated[index],oldName=day.to;
      onProgress?.({index,total:generated.length,day:day.day,message:`Controleer overnachtingsregio voor dag ${day.day}`});
      const resolved=await findNearestLandLocality(day.toPoint,fetchImpl,timeoutMs);
      if(resolved){
        day.to=resolved.name;day.location=resolved.name;day.overnight=resolved.name;day.toPoint={...day.toPoint,...resolved,name:resolved.name,generatedExploration:true,landValidated:true};
        if(day.primaryPlan)day.primaryPlan=day.primaryPlan.replace(oldName,resolved.name);
        const following=(plan.days||[]).find(candidate=>candidate.day===day.day+1);
        if(following&&following.from===oldName){following.from=resolved.name;following.fromPoint={...following.fromPoint,...resolved,name:resolved.name,landValidated:true}}
      }else{
        const previous=(plan.days||[]).find(candidate=>candidate.day===day.day-1)?.toPoint;
        if(validCoordinate(previous)){
          const fallbackName=(plan.days||[]).find(candidate=>candidate.day===day.day-1)?.to||'Vorige regio';
          day.to=fallbackName;day.location=fallbackName;day.overnight=fallbackName;day.toPoint={...previous,name:fallbackName,generatedExploration:true,landValidated:false,landFallback:true};
          const following=(plan.days||[]).find(candidate=>candidate.day===day.day+1);
          if(following&&following.from===oldName){following.from=fallbackName;following.fromPoint={...day.toPoint}}
        }
      }
    }
  });
  await Promise.all(workers);
  return plan;
}

async function resolveSpecificRecommendations(plan,trip,options,fetchImpl,storage){
  await prepareGeneratedRouteStops(plan,{fetchImpl,timeoutMs:Math.min(2800,options.nominatimTimeoutMs||2800)});
  buildRecommendations(trip,{bases:[plan.days?.find(day=>day.toPoint)?.toPoint].filter(Boolean)},plan.days||[]);
  plan.recommendations=(plan.days||[]).flatMap(day=>day.recommendations||[]);
  const days=(plan.days||[]).map(day=>{
    const items=(day.recommendations||[]).filter(item=>validCoordinate(item.point)&&item.type!=='accommodation');
    return{day,items};
  }).filter(entry=>entry.items.length);
  const total=days.reduce((sum,entry)=>sum+entry.items.length,0);let completed=0,foundCount=0;
  options.onProgress?.({type:'places-start',total});
  await Promise.all(days.map(async({day,items})=>{
    options.onProgress?.({type:'place-search',day:day.day,itemType:'batch',itemName:`${items.length} routepunten`,completed,total,found:foundCount});
    const candidates=await queryDayBatch(day,items,fetchImpl,options);
    for(const item of items){
      const ranked=candidates
        .filter(place=>item.type==='service'?['fuel','rest'].includes(place.type):place.type===item.type)
        .map(place=>({place,distanceKm:haversineKm(item.point,place.point),routeDistanceKm:routeDistanceKm(place.point,day.geometry||[])}))
        .filter(x=>Number.isFinite(x.distanceKm)&&Number.isFinite(x.routeDistanceKm)&&x.routeDistanceKm<=corridorLimitKm(item))
        .sort((a,b)=>suitability(b.place,item,trip,b.distanceKm)-suitability(a.place,item,trip,a.distanceKm)||a.routeDistanceKm-b.routeDistanceKm||a.distanceKm-b.distanceKm);
      if(ranked[0]){
        applyLivePlace(item,ranked[0].place,ranked[0].distanceKm,day);item.routeDistanceKm=Number(ranked[0].routeDistanceKm.toFixed(1));foundCount++;
      }else{
        Object.assign(item,{live:false,genericFallback:false,lookupComplete:true,lookupMissing:true,confidence:'live-place-not-found',source:'Gebundelde OpenStreetMap-zoekactie afgerond',lastChecked:new Date().toISOString()});
      }
      completed++;options.onProgress?.({type:ranked[0]?'place-found':'place-missing',day:day.day,itemType:item.type,name:ranked[0]?.place?.name||null,completed,total,found:foundCount});
    }
  }));
  for(const day of plan.days||[]){
    day.recommendations=(day.recommendations||[]).filter(item=>item.type==='accommodation'||Boolean(item.live));
    day.sleepProposal=day.recommendations.find(item=>item.type==='accommodation')||null;
  }
  plan.recommendations=(plan.days||[]).flatMap(day=>day.recommendations||[]);
  options.onProgress?.({type:'places-complete',completed,total,found:foundCount});
  return plan;
}

function dateDifference(dateString,now=new Date()){const date=new Date(`${dateString}T12:00:00`),today=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);return Math.round((date-today)/86400000)}
export async function fetchWeatherForDestination(trip,destination,options={},fetchImpl=globalThis.fetch,storage=defaultStorage()){
  const leadDays=dateDifference(trip.startDate,options.now||new Date());
  if(leadDays<-1||leadDays>15||!validCoordinate(destination.bases?.[0]))return null;
  const point=destination.bases[0],url=new URL(options.weatherUrl||WEATHER_URL);
  url.search=new URLSearchParams({latitude:String(point.lat),longitude:String(point.lon),daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',timezone:'auto',forecast_days:'16'});
  const key=cacheKey('weather',`${point.lat},${point.lon}`),cached=readCache(storage,key,2*60*60*1000);if(cached)return cached;
  try{
    const payload=await fetchJson(url,{headers:{accept:'application/json'}},Math.min(4200,options.weatherTimeoutMs||4200),fetchImpl),daily=payload.daily||{};
    const days=(daily.time||[]).map((date,index)=>({date,weatherCode:daily.weather_code?.[index],minimumC:daily.temperature_2m_min?.[index],maximumC:daily.temperature_2m_max?.[index],precipitationChance:daily.precipitation_probability_max?.[index],windKmh:daily.wind_speed_10m_max?.[index]})).filter(day=>day.date>=trip.startDate).slice(0,trip.days);
    const weather=days.length?{source:'Open-Meteo',live:true,days,lastChecked:new Date().toISOString()}:null;if(weather)writeCache(storage,key,weather);return weather;
  }catch{return null}
}

export async function enrichPlanWithPlaces(trip,destination,plan,options={}){
  if(trip.liveData===false)return plan;
  const fetchImpl=options.fetchImpl||globalThis.fetch;if(typeof fetchImpl!=='function')return plan;
  const storage=options.storage===undefined?defaultStorage():options.storage,next=clone(plan);
  const [_,weather]=await Promise.all([
    resolveSpecificRecommendations(next,trip,options,fetchImpl,storage),
    fetchWeatherForDestination(trip,destination,options,fetchImpl,storage)
  ]);
  if(weather){next.weather=weather;adaptPlanToWeather(next,trip)}
  // Accommodation is intentionally NOT resolved here. overnight-accommodation.js is
  // the single accommodation authority, avoiding the duplicate search that made 1923 slow.
  const overnightDays=(next.days||[]).filter(day=>day.kind!=='return'&&day.to!==trip.origin&&validCoordinate(day.toPoint)).length;
  next.recommendations=(next.days||[]).flatMap(day=>day.recommendations||[]);
  next.placeData={
    live:next.recommendations.some(item=>item.live),
    source:'OpenStreetMap via per-day batched Overpass lookup',
    specificRecommendations:next.recommendations.filter(item=>item.live).length,
    missingSpecificAccommodationDays:overnightDays,
    accommodationDeferred:true,
    reviewRatingsLive:false,
    reviewRatingNote:'Accommodaties worden in één aparte, snellere zoekstap afgehandeld; zonder ratingsprovider claimt ReisSlim geen consumentenrating.',
    weatherLive:Boolean(next.weather?.live),
    error:null
  };
  return next;
}
