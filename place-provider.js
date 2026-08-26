import { originCatalog, validCoordinate } from './config.js';
import { haversineKm } from './route-engine.js';
import { transportId } from './vehicle-intelligence.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_PREFIX = 'reisslim.live.v6.';

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
  const qMap={accommodation:['hotel','guest house','camping'],restaurant:['restaurant','cafe'],fuel:['fuel'],rest:['rest area'],service:['fuel'],activity:['museum','attraction','viewpoint']};
  const queries=qMap[item.type]||qMap.activity,delta=.22,viewbox=[item.point.lon-delta,item.point.lat+delta,item.point.lon+delta,item.point.lat-delta].join(',');
  for(const q of queries){
    try{
      const url=new URL(NOMINATIM_URL);url.search=new URLSearchParams({q,format:'jsonv2',limit:'8',bounded:'1',viewbox,addressdetails:'1',extratags:'1'});
      const rows=await fetchJson(url,{headers:{accept:'application/json'}},timeoutMs,fetchImpl);
      const places=(rows||[]).map(row=>{const point={lat:Number(row.lat),lon:Number(row.lon)},name=String(row.name||row.display_name||'').split(',')[0].trim();if(!name||!validCoordinate(point))return null;return{id:`nominatim-${row.place_id}`,type:item.type==='service'?'fuel':item.type,name,point,tags:row.extratags||{},openingHours:row.extratags?.opening_hours||null,website:row.extratags?.website||null,osmUrl:`https://www.openstreetmap.org/${row.osm_type==='node'?'node':row.osm_type==='way'?'way':'relation'}/${row.osm_id}`,mapUrl:mapsSearchUrl(name,point),evidenceScore:1};}).filter(Boolean);
      if(places.length)return places;
    }catch{}
  }
  return[];
}

async function fetchSpecificCandidates(item,options,fetchImpl,storage){
  const rounded=`${item.type}:${item.point.lat.toFixed(3)}:${item.point.lon.toFixed(3)}`;
  const key=cacheKey('specific',rounded);
  const cached=readCache(storage,key,4*24*60*60*1000);
  if(cached?.length)return cached;
  for(const radius of [6000,14000,30000]){
    const query=`[out:json][timeout:7][maxsize:4194304];(${clauseFor(item,radius)});out center tags 100;`;
    for(const endpoint of options.overpassUrls||OVERPASS_ENDPOINTS){
      try{
        const found=await queryEndpoint(query,endpoint,fetchImpl,options.placeTimeoutMs||6500);
        if(found.length){ writeCache(storage,key,found); return found; }
      }catch{}
    }
  }
  const fallback=await fetchNominatimCategory(item,fetchImpl);
  if(fallback.length){writeCache(storage,key,fallback);return fallback;}
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
    source:'OpenStreetMap via Overpass',verified:false,live:true,genericFallback:false,
    detourKm:Number(distanceKm.toFixed(1)),openingHours:place.openingHours,
    websiteUrl:place.website,sourceUrl:place.osmUrl,mapUrl:place.mapUrl,url:place.mapUrl,
    officialStars:place.officialStars,
    rating:null,ratingProvider:null,ratingStatus:'controleer actuele reviews via kaartlink',
    reason:`Specifiek genoemd voorstel voor ${item.meal==='lunch'?'lunch':item.type==='accommodation'?'overnachting':item.type} bij ${day.location||day.to}. Geselecteerd op nabijheid, voertuiggeschiktheid en beschikbare broninformatie.`,
    lastChecked:new Date().toISOString()
  });
}

async function resolveSpecificRecommendations(plan,trip,options,fetchImpl,storage){
  const jobs=[];
  for(const day of plan.days||[]){
    for(const item of day.recommendations||[]){
      if(validCoordinate(item.point))jobs.push({day,item});
    }
  }
  await mapLimit(jobs,4,async({day,item})=>{
    const candidates=await fetchSpecificCandidates(item,options,fetchImpl,storage);
    const ranked=candidates
      .map(place=>({place,distanceKm:haversineKm(item.point,place.point)}))
      .filter(x=>Number.isFinite(x.distanceKm))
      .sort((a,b)=>suitability(b.place,item,trip,b.distanceKm)-suitability(a.place,item,trip,a.distanceKm)||a.distanceKm-b.distanceKm);
    if(ranked[0])applyLivePlace(item,ranked[0].place,ranked[0].distanceKm,day);
  });
  for(const day of plan.days||[]){
    // HARD RULE: do not present generic pseudo-recommendations as a selected place.
    day.recommendations=(day.recommendations||[]).filter(item=>item.live&&item.name&&validCoordinate(item.point));
    day.sleepProposal=day.recommendations.find(item=>item.type==='accommodation')||null;
  }
  plan.recommendations=(plan.days||[]).flatMap(day=>day.recommendations||[]);
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
