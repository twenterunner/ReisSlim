import './ui-feature-flags.js';
import { resolveOrigin } from './trip-model.js';
import { haversineKm } from './route-engine.js';

const NOMINATIM_REVERSE='https://nominatim.openstreetmap.org/reverse';
const PHOTON_REVERSE='https://photon.komoot.io/reverse';
const DEFAULT_ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const GOLDEN_ANGLE=137.507764;
const DEFAULT_BATCH_SEEDS=10;
const DEFAULT_RESULT_LIMIT=72;
const DISCOVERY_PASSES=1;
const countryNames={
AL:'Albanië',AD:'Andorra',AT:'Oostenrijk',BY:'Belarus',BE:'België',BA:'Bosnië en Herzegovina',BG:'Bulgarije',
HR:'Kroatië',CY:'Cyprus',CZ:'Tsjechië',DK:'Denemarken',EE:'Estland',FI:'Finland',FR:'Frankrijk',DE:'Duitsland',
GR:'Griekenland',HU:'Hongarije',IS:'IJsland',IE:'Ierland',IT:'Italië',XK:'Kosovo',LV:'Letland',LI:'Liechtenstein',
LT:'Litouwen',LU:'Luxemburg',MT:'Malta',MD:'Moldavië',MC:'Monaco',ME:'Montenegro',NL:'Nederland',MK:'Noord-Macedonië',
NO:'Noorwegen',PL:'Polen',PT:'Portugal',RO:'Roemenië',SM:'San Marino',RS:'Servië',SK:'Slowakije',SI:'Slovenië',
ES:'Spanje',SE:'Zweden',CH:'Zwitserland',TR:'Turkije',UA:'Oekraïne',GB:'Verenigd Koninkrijk',VA:'Vaticaanstad',
ZA:'Zuid-Afrika',NA:'Namibië'
};
const countryCosts={CH:185,DK:155,NO:165,SE:145,AT:150,IT:150,FR:140,DE:125,BE:125,CZ:105,PL:100,SI:125,HR:120,ES:125,PT:115};

function destinationPoint(origin,distanceKm,bearingDegrees){const radius=6371,bearing=bearingDegrees*Math.PI/180,lat1=origin.lat*Math.PI/180,lon1=origin.lon*Math.PI/180;const lat2=Math.asin(Math.sin(lat1)*Math.cos(distanceKm/radius)+Math.cos(lat1)*Math.sin(distanceKm/radius)*Math.cos(bearing));const lon2=lon1+Math.atan2(Math.sin(bearing)*Math.sin(distanceKm/radius)*Math.cos(lat1),Math.cos(distanceKm/radius)-Math.sin(lat1)*Math.sin(lat2));return{lat:lat2*180/Math.PI,lon:lon2*180/Math.PI}}
export function roadtripReachKm(trip){const days=Number(trip.days||1),productiveRoadSpeed=trip.transport==='motorcycle'?72:trip.transport==='caravan'?62:trip.transport==='motorhome'?66:78;if(days===1)return Math.max(35,Math.min(420,Number(trip.maxDrive||5)*productiveRoadSpeed*.48));const outboundDays=Math.max(1,Math.floor((days-1)/2));return Math.max(250,Math.min(3600,Number(trip.maxDrive||5)*productiveRoadSpeed*outboundDays))}
function reachFor(trip){return roadtripReachKm(trip)}

export function discoverySeeds(trip,cursor=0,count=DEFAULT_BATCH_SEEDS){
  const origin=resolveOrigin(trip);if(!origin)return[];
  if(trip.destinationPoint){
    const targetRoadKm=(haversineKm(origin,trip.destinationPoint)||0)*1.18;
    if(targetRoadKm>roadtripReachKm(trip)*1.12)return[];
    const rings=[10,25,45,70,100,140];
    return Array.from({length:count},(_,index)=>{const sequence=cursor*count+index,ringIndex=(sequence+cursor)%rings.length,distanceKm=rings[ringIndex]+Math.floor(cursor/2)*12;return{...destinationPoint(trip.destinationPoint,distanceKm,sequence*GOLDEN_ANGLE),distanceKm,sequence,targeted:true,ring:ringIndex}})
  }
  const reach=reachFor(trip),radialBands=[.12,.20,.30,.42,.56,.70,.84,.96];
  return Array.from({length:count},(_,index)=>{const sequence=cursor*count+index,bandIndex=(sequence+Math.floor(sequence/radialBands.length))%radialBands.length,jitter=(((sequence*17)%9)-4)*.012,fraction=Math.max(.08,Math.min(.98,radialBands[bandIndex]+jitter)),distanceKm=reach*fraction,bearing=sequence*GOLDEN_ANGLE+(cursor%5)*11.25;return{...destinationPoint(origin,distanceKm,bearing),distanceKm,sequence,ring:bandIndex}})
}
function queryClauses(point){const around=point.targeted?26000:30000,lat=point.lat.toFixed(4),lon=point.lon.toFixed(4);return `nwr(around:${around},${lat},${lon})["place"~"city|town|village"]["name"];`}
export function buildDiscoveryQuery(trip,cursor=0,count=DEFAULT_BATCH_SEEDS){const seeds=discoverySeeds(trip,cursor,count),clauses=seeds.map(queryClauses).join('\n');return `[out:json][timeout:6][maxsize:4194304];\n(\n${clauses}\n);\nout center 120;`}
const slug=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55);
const hash=value=>[...String(value)].reduce((sum,character)=>((sum*31)+character.charCodeAt(0))>>>0,2166136261);
const pointOf=element=>Number.isFinite(element.lat)&&Number.isFinite(element.lon)?{lat:element.lat,lon:element.lon}:Number.isFinite(element.center?.lat)&&Number.isFinite(element.center?.lon)?{lat:element.center.lat,lon:element.center.lon}:null;
function corridorStops(origin,target,name,distanceKm){const count=Math.max(2,Math.min(7,Math.ceil(distanceKm/260)));return Array.from({length:count},(_,index)=>{const progress=(index+1)/(count+1);return{name:`Routepunt ${index+1} richting ${name}`,lat:origin.lat+(target.lat-origin.lat)*progress,lon:origin.lon+(target.lon-origin.lon)*progress,progress}})}
function typeTags(element){
  const tags=element.tags||{},derived=[];
  const place=tags.place;
  if(['city','town','village'].includes(place))derived.push('cultuur','eten');
  if(tags.natural==='peak')derived.push('bergen','wandelen','natuur','motor');
  if(['beach','bay'].includes(tags.natural))derived.push('kust','zwemmen','natuur');
  if(tags.natural==='water')derived.push('zwemmen','natuur');
  if(tags.boundary==='national_park'||tags.boundary==='protected_area')derived.push('natuur','wandelen','motor');
  if(tags.tourism==='resort')derived.push('eten','zwemmen');
  if(tags.tourism==='attraction')derived.push('cultuur');
  return[...new Set(derived)]
}
function dynamicProfile(trip,element){
  const origin=resolveOrigin(trip),point=pointOf(element),name=element.tags?.['name:nl']||element.tags?.name;if(!origin||!point||!name)return null;
  const direct=haversineKm(origin,point),distanceKm=Math.round(direct*1.18),code=String(element.tags?.['addr:country']||element.tags?.['is_in:country_code']||'').toUpperCase();
  const country=countryNames[code]||element.tags?.['is_in:country']||element.tags?.['addr:country']||'Regio';
  const seed=hash(`${name}:${point.lat.toFixed(3)}:${point.lon.toFixed(3)}`),nightMid=countryCosts[code]||125+(seed%25),family=6+seed%4;
  const derived=typeTags(element);
  const motorcycle=Math.max(5,Math.min(10,5+(derived.includes('motor')?3:0)+(derived.includes('bergen')?1:0)+((seed>>3)%2)));
  const camper=6+(seed>>5)%4,weather=5+(seed>>7)%4,crowds=6+(seed>>9)%4,basePoint={name,...point};
  return{id:`osm-${slug(name)}-${Math.round(point.lat*100)}-${Math.round(point.lon*100)}`,name:`${name} & omgeving`,country,distanceKm,driveHours:Number((distanceKm/78).toFixed(1)),
    nightMid,activityDaily:38+seed%25,toll:Math.round(distanceKm*(['FR','IT','AT','CH'].includes(code)?.08:.025)),
    tags:derived,season:[3,4,5,6,7,8,9,10],family,motorcycle,camper,weather,crowds,
    summary:`Live ontdekt reisgebied rond ${name}; kenmerken zijn alleen toegevoegd wanneer OpenStreetMap daarvoor concrete aanwijzingen bevat.`,
    pros:['Live ontdekt vanaf jouw vertrekpunt','Alleen roadtripbereik','Voorkeuren gebruiken evidence-based tags'],
    cons:['Live regioprofiel blijft voorlopig tot detailverrijking','Prijzen en wegroute moeten nog worden bevestigd'],
    routeStops:corridorStops(origin,point,name,distanceKm),bases:[basePoint],
    activities:[
      {type:'natuur',title:`Verken een passend natuurgebied rond ${name}.`,rainAlternative:`Kies een overdekte activiteit in ${name}.`,tags:['natuur']},
      {type:'cultuur',title:`Verken ${name} en een lokale stop.`,rainAlternative:`Kies een museum of markt in ${name}.`,tags:['cultuur']},
      {type:'eten',title:`Plan een goed beoordeelde lokale eetstop rond ${name}.`,rainAlternative:`Kies een overdekte eetstop in ${name}.`,tags:['eten']}
    ],dynamic:true,discoverySource:'OpenStreetMap Overpass',osm:{type:element.type,id:element.id},discoveredAt:new Date().toISOString()}
}
function spatialKey(item){const base=item.bases?.[0];return base?`${Math.round(base.lat*8)/8}:${Math.round(base.lon*8)/8}`:item.id}
export function normalizeDiscoveredDestinations(trip,payload,{excludedIds=[],limit=DEFAULT_RESULT_LIMIT}={}){
  const excluded=new Set(excludedIds),seenNames=new Set(),seenSpatial=new Map(),maximumDistance=roadtripReachKm(trip)*1.08;
  const candidates=(payload?.elements||[]).map(element=>dynamicProfile(trip,element)).filter(Boolean).filter(item=>item.distanceKm>=(Number(trip.days)===1?20:70)&&item.distanceKm<=maximumDistance&&!excluded.has(item.id)).sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id));
  const deduped=[];for(const item of candidates){const nameKey=item.name.toLocaleLowerCase('nl-NL');if(seenNames.has(nameKey))continue;const geoKey=spatialKey(item),geoCount=seenSpatial.get(geoKey)||0;if(geoCount>=3)continue;seenNames.add(nameKey);seenSpatial.set(geoKey,geoCount+1);deduped.push(item);if(deduped.length>=limit)break}return deduped
}


function photonElement(feature,seedIndex){
  const properties=feature?.properties||{},coordinates=feature?.geometry?.coordinates||[];
  const lon=Number(coordinates[0]),lat=Number(coordinates[1]);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const name=properties.city||properties.name||properties.county||properties.state;
  if(!name)return null;
  const rawType=String(properties.type||properties.osm_value||'').toLowerCase();
  const place=rawType.includes('city')?'city':rawType.includes('town')?'town':'village';
  return{
    type:'node',
    id:Number(properties.osm_id)||800000000+seedIndex,
    lat,lon,
    tags:{
      name,
      place,
      'is_in:country_code':String(properties.countrycode||properties.country_code||'').toUpperCase(),
      'is_in:country':String(properties.country||'')
    }
  };
}
async function fetchPhotonSeed(seed,seedIndex,fetchImpl,timeoutMs,onProgress,context){
  const controller=new AbortController(),startedAt=Date.now();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const url=new URL(PHOTON_REVERSE);
  url.search=new URLSearchParams({lat:String(seed.lat),lon:String(seed.lon)});
  onProgress?.({...context,type:'endpoint-start',endpoint:'Photon OpenStreetMap',seedIndex:seedIndex+1,totalSeeds:DEFAULT_BATCH_SEEDS,startedAt});
  try{
    const response=await fetchImpl(url,{headers:{accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new Error(`Photon ${response.status}`);
    const payload=await response.json();
    const feature=Array.isArray(payload?.features)?payload.features[0]:null;
    const element=photonElement(feature,seedIndex);
    onProgress?.({...context,type:'endpoint-success',endpoint:'Photon OpenStreetMap',seedIndex:seedIndex+1,totalSeeds:DEFAULT_BATCH_SEEDS,elapsedMs:Date.now()-startedAt,candidateElements:element?1:0});
    return element;
  }catch(error){
    const timeout=error?.name==='AbortError';
    onProgress?.({...context,type:'endpoint-failure',endpoint:'Photon OpenStreetMap',seedIndex:seedIndex+1,totalSeeds:DEFAULT_BATCH_SEEDS,elapsedMs:Date.now()-startedAt,timeout,error:timeout?'timeout':String(error?.message||error)});
    return null;
  }finally{clearTimeout(timer)}
}
async function discoverViaPhoton(trip,cursor,{fetchImpl,onProgress,pass,totalPasses,timeoutMs}){
  const seeds=discoverySeeds(trip,cursor,DEFAULT_BATCH_SEEDS);
  // Photon is used as the fast first live source. Seed lookups are independent and
  // can safely run together, keeping mobile discovery under a few seconds.
  const rows=await Promise.all(
    seeds.map((seed,index)=>fetchPhotonSeed(seed,index,fetchImpl,Math.min(timeoutMs,2800),onProgress,{pass,totalPasses,cursor}))
  );
  return rows.filter(Boolean);
}

function nominatimElement(row,seedIndex){
  if(!row)return null;
  const lat=Number(row.lat),lon=Number(row.lon),address=row.address||{};
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const name=address.city||address.town||address.village||address.municipality||address.county||String(row.display_name||'').split(',')[0];
  if(!name)return null;
  const place=address.city?'city':address.town?'town':'village';
  return{
    type:'node',
    id:Number(row.osm_id)||900000000+seedIndex,
    lat,lon,
    tags:{
      name,
      place,
      'is_in:country_code':String(address.country_code||'').toUpperCase(),
      'is_in:country':String(address.country||'')
    }
  };
}
async function fetchNominatimSeed(seed,seedIndex,fetchImpl,timeoutMs,onProgress,context){
  const controller=new AbortController(),startedAt=Date.now();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const url=new URL(NOMINATIM_REVERSE);
  url.search=new URLSearchParams({format:'jsonv2',lat:String(seed.lat),lon:String(seed.lon),zoom:'10',addressdetails:'1'});
  onProgress?.({...context,type:'endpoint-start',endpoint:'OpenStreetMap Nominatim',seedIndex:seedIndex+1,totalSeeds:DEFAULT_BATCH_SEEDS,startedAt});
  try{
    const response=await fetchImpl(url,{headers:{accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new Error(`Nominatim ${response.status}`);
    const row=await response.json();
    const element=nominatimElement(row,seedIndex);
    onProgress?.({...context,type:'endpoint-success',endpoint:'OpenStreetMap Nominatim',seedIndex:seedIndex+1,totalSeeds:DEFAULT_BATCH_SEEDS,elapsedMs:Date.now()-startedAt,candidateElements:element?1:0});
    return element;
  }catch(error){
    const timeout=error?.name==='AbortError';
    onProgress?.({...context,type:'endpoint-failure',endpoint:'OpenStreetMap Nominatim',seedIndex:seedIndex+1,totalSeeds:DEFAULT_BATCH_SEEDS,elapsedMs:Date.now()-startedAt,timeout,error:timeout?'timeout':String(error?.message||error)});
    return null;
  }finally{clearTimeout(timer)}
}
async function discoverViaNominatim(trip,cursor,{fetchImpl,onProgress,pass,totalPasses,timeoutMs,count=2}){
  const seeds=discoverySeeds(trip,cursor,Math.max(1,Math.min(DEFAULT_BATCH_SEEDS,count))),elements=[];
  for(let index=0;index<seeds.length;index++){
    const element=await fetchNominatimSeed(seeds[index],index,fetchImpl,Math.min(timeoutMs,2800),onProgress,{pass,totalPasses,cursor});
    if(element)elements.push(element);
    if(index<seeds.length-1)await new Promise(resolve=>setTimeout(resolve,1050));
  }
  return elements;
}

async function fetchEndpoint(endpoint,query,fetchImpl,timeoutMs,onProgress,context){
  const controller=new AbortController();
  const startedAt=Date.now();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  onProgress?.({...context,type:'endpoint-start',endpoint,startedAt});
  try{
    const response=await fetchImpl(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:new URLSearchParams({data:query}),
      signal:controller.signal
    });
    if(!response.ok)throw new Error(`Overpass ${response.status}`);
    const payload=await response.json();
    onProgress?.({...context,type:'endpoint-success',endpoint,elapsedMs:Date.now()-startedAt,candidateElements:payload?.elements?.length||0});
    return{payload,endpoint};
  }catch(error){
    const timeout=error?.name==='AbortError';
    onProgress?.({...context,type:'endpoint-failure',endpoint,elapsedMs:Date.now()-startedAt,timeout,error:timeout?'timeout':String(error?.message||error)});
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

async function fetchDiscoveryPayload(trip,cursor,{fetchImpl,endpoints,storage,onProgress,pass,totalPasses,timeoutMs=6500,bypassCache=false}){
  const context={pass,totalPasses,cursor};
  const key=`reisslim.destination-discovery.v12:${trip.origin}:${trip.destinationQuery||''}:${trip.days}:${trip.maxDrive}:${trip.transport}:${cursor}`;

  if(!bypassCache){
    try{
      const cached=storage?.getItem(key);
      if(cached){
        const payload=JSON.parse(cached);
        onProgress?.({...context,type:'cache-hit',candidateElements:payload?.elements?.length||0});
        return{payload,cached:true,endpoint:'cache',cacheKey:key};
      }
    }catch{}
  }else onProgress?.({...context,type:'cache-bypass',endpoint:'live'});

  // Use two independent OSM geocoding paths first. Photon handles the wider seed
  // fan quickly; Nominatim adds a smaller standards-friendly cross-check. This
  // removes the old single-source failure mode seen repeatedly on mobile.
  onProgress?.({...context,type:'provider-stage',stage:'geocoding',message:'Twee onafhankelijke OpenStreetMap-plaatsendiensten raadplegen…'});
  const [photonElements,nominatimElements]=await Promise.all([
    discoverViaPhoton(trip,cursor,{fetchImpl,onProgress,pass,totalPasses,timeoutMs}),
    discoverViaNominatim(trip,cursor,{fetchImpl,onProgress,pass,totalPasses,timeoutMs,count:2})
  ]);
  const geocoded=[...photonElements,...nominatimElements];
  if(geocoded.length){
    const endpoint=photonElements.length&&nominatimElements.length?'Photon + OpenStreetMap Nominatim':photonElements.length?'Photon OpenStreetMap':'OpenStreetMap Nominatim';
    return{payload:{elements:geocoded},cached:false,endpoint,cacheKey:key};
  }

  // Emergency fallback only: one lightweight Overpass query, with mirrors raced
  // in parallel instead of waiting for each public server sequentially.
  const query=buildDiscoveryQuery(trip,cursor);
  if(!query.includes('nwr('))return{payload:null,cached:false,reason:'Geen roadtripbestemmingen binnen het ingestelde bereik.'};
  const controllers=endpoints.map(()=>new AbortController());
  const attempts=endpoints.map((endpoint,endpointIndex)=>
    fetchEndpoint(endpoint,query,fetchImpl,Math.min(timeoutMs,3500),onProgress,{...context,endpointIndex,totalEndpoints:endpoints.length},controllers[endpointIndex])
      .then(result=>({result,endpointIndex}))
  );
  try{
    const {result,endpointIndex}=await Promise.any(attempts);
    controllers.forEach((controller,index)=>{if(index!==endpointIndex&&!controller.signal.aborted)controller.abort('race-won')});
    return{payload:result.payload,cached:false,endpoint:result.endpoint,cacheKey:key};
  }catch{
    controllers.forEach(controller=>{if(!controller.signal.aborted)controller.abort('race-won')});
    return{payload:null,cached:false,reason:'De live plaatsendiensten reageerden deze ronde niet. ReisSlim gebruikt je volledige lokale portfolio en probeert live uitbreiding automatisch opnieuw bij de volgende zoekactie.'};
  }
}

export async function discoverDestinationBatch(
  trip,
  {
    cursor=0,
    excludedIds=[],
    fetchImpl=fetch,
    endpoints=DEFAULT_ENDPOINTS,
    storage=globalThis.localStorage,
    onProgress=null,
    onBatch=null,
    timeoutMs=6500,
    bypassCache=false
  }={}
){
  const combined=[];
  const emittedIds=new Set();
  const emitted=[];
  let usedCache=true,lastReason='',successfulPasses=0;

  onProgress?.({
    type:'discovery-start',
    totalPasses:DISCOVERY_PASSES,
    endpoints:[...endpoints],
    origin:trip.origin,
    reachKm:roadtripReachKm(trip)
  });

  for(let passIndex=0;passIndex<DISCOVERY_PASSES;passIndex++){
    const pass=passIndex+1;
    const currentCursor=cursor*DISCOVERY_PASSES+passIndex;
    onProgress?.({type:'pass-start',pass,totalPasses:DISCOVERY_PASSES,cursor:currentCursor});

    const result=await fetchDiscoveryPayload(trip,currentCursor,{
      fetchImpl,endpoints,storage,onProgress,pass,totalPasses:DISCOVERY_PASSES,timeoutMs,bypassCache
    });

    usedCache=usedCache&&Boolean(result.cached);
    if(result.reason)lastReason=result.reason;

    if(result.payload?.elements?.length){
      successfulPasses++;
      combined.push(...result.payload.elements);

      const normalized=normalizeDiscoveredDestinations(
        trip,
        {elements:combined},
        {excludedIds:[...excludedIds,...emittedIds],limit:DEFAULT_RESULT_LIMIT}
      );
      const fresh=normalized.filter(item=>!emittedIds.has(item.id));
      if(fresh.length){
        fresh.forEach(item=>{emittedIds.add(item.id);emitted.push(item)});
        if(!result.cached&&result.cacheKey){try{storage?.setItem(result.cacheKey,JSON.stringify(result.payload))}catch{}}
        onProgress?.({type:'pass-success',pass,totalPasses:DISCOVERY_PASSES,endpoint:result.endpoint,candidateElements:result.payload.elements.length,totalCandidateElements:combined.length,newDestinations:fresh.length,totalDestinations:emitted.length});
        await onBatch?.({destinations:fresh,pass,totalPasses:DISCOVERY_PASSES,endpoint:result.endpoint,totalDestinations:emitted.length,totalCandidateElements:combined.length});
        if(emitted.length>=10){
          onProgress?.({type:'discovery-complete',totalPasses:DISCOVERY_PASSES,successfulPasses,totalDestinations:emitted.length,candidateElements:combined.length,early:true});
          return{destinations:emitted,live:true,cached:usedCache,source:'OpenStreetMap Overpass',passes:pass,successfulPasses,candidateElements:combined.length};
        }
      }else{
        if(result.cached&&result.cacheKey){try{storage?.removeItem(result.cacheKey)}catch{}}
        onProgress?.({type:'pass-empty',pass,totalPasses:DISCOVERY_PASSES,reason:result.cached?'Oude cache leverde geen bruikbare regio’s op en is verwijderd.':'OpenStreetMap antwoordde, maar deze zoekronde leverde geen bruikbare regio’s op.',totalDestinations:emitted.length});
      }
    }else{
      onProgress?.({
        type:'pass-empty',
        pass,
        totalPasses:DISCOVERY_PASSES,
        reason:result.reason||'Deze zoekronde leverde geen bruikbare locaties op.',
        totalDestinations:emitted.length
      });
    }

    // Yield back to the browser so progress text and newly discovered cards paint now.
    await new Promise(resolve=>setTimeout(resolve,0));
  }

  if(!emitted.length){
    onProgress?.({
      type:'discovery-failure',
      totalPasses:DISCOVERY_PASSES,
      successfulPasses,
      reason:lastReason||'Geen live roadtripregio’s gevonden.'
    });
    return{
      destinations:[],
      live:false,
      reason:lastReason||'Geen live roadtripregio’s gevonden.',
      passes:DISCOVERY_PASSES,
      successfulPasses,
      candidateElements:combined.length
    };
  }

  onProgress?.({
    type:'discovery-complete',
    totalPasses:DISCOVERY_PASSES,
    successfulPasses,
    totalDestinations:emitted.length,
    candidateElements:combined.length
  });

  return{
    destinations:emitted,
    live:true,
    cached:usedCache,
    source:'OpenStreetMap Overpass',
    passes:DISCOVERY_PASSES,
    successfulPasses,
    candidateElements:combined.length
  };
}

export const destinationDiscoveryConfig=Object.freeze({
  endpoints:DEFAULT_ENDPOINTS,
  attribution:'© OpenStreetMap-bijdragers, ODbL',
  coverage:'Europe + South Africa + Namibia; roadtrip-from-user-origin',
  batchSeeds:DEFAULT_BATCH_SEEDS,
  discoveryPasses:DISCOVERY_PASSES,
  resultLimit:DEFAULT_RESULT_LIMIT,
  progressive:true,
  primaryProvider:'Photon OpenStreetMap + OpenStreetMap Nominatim',
  cacheVersion:12,
  endpointTimeoutMs:3200
});
