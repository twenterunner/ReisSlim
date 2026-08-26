import './ui-feature-flags.js';
import { resolveOrigin } from './trip-model.js';
import { haversineKm } from './route-engine.js';

const DEFAULT_ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const GOLDEN_ANGLE=137.507764;
const DEFAULT_BATCH_SEEDS=8;
const DEFAULT_RESULT_LIMIT=72;
const DISCOVERY_PASSES=4;
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
export function roadtripReachKm(trip){const outboundDays=Math.max(1,Math.floor((Number(trip.days||3)-1)/2));const productiveRoadSpeed=trip.transport==='motorcycle'?72:trip.transport==='caravan'?62:trip.transport==='motorhome'?66:78;return Math.max(250,Math.min(3600,Number(trip.maxDrive||5)*productiveRoadSpeed*outboundDays))}
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
function queryClauses(point){const around=point.targeted?30000:36000,lat=point.lat.toFixed(4),lon=point.lon.toFixed(4);return[`nwr(around:${around},${lat},${lon})["place"~"city|town|village"]["name"];`,`nwr(around:${around},${lat},${lon})["boundary"="national_park"]["name"];`,`nwr(around:${around},${lat},${lon})["boundary"="protected_area"]["name"];`,`nwr(around:${around},${lat},${lon})["natural"~"peak|bay|beach|water"]["name"];`,`nwr(around:${around},${lat},${lon})["tourism"~"attraction|resort"]["name"];`].join('')}
export function buildDiscoveryQuery(trip,cursor=0,count=DEFAULT_BATCH_SEEDS){const seeds=discoverySeeds(trip,cursor,count),clauses=seeds.map(queryClauses).join('\n');return `[out:json][timeout:16][maxsize:33554432];\n(\n${clauses}\n);\nout center 360;`}
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
  const candidates=(payload?.elements||[]).map(element=>dynamicProfile(trip,element)).filter(Boolean).filter(item=>item.distanceKm>=70&&item.distanceKm<=maximumDistance&&!excluded.has(item.id)).sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id));
  const deduped=[];for(const item of candidates){const nameKey=item.name.toLocaleLowerCase('nl-NL');if(seenNames.has(nameKey))continue;const geoKey=spatialKey(item),geoCount=seenSpatial.get(geoKey)||0;if(geoCount>=3)continue;seenNames.add(nameKey);seenSpatial.set(geoKey,geoCount+1);deduped.push(item);if(deduped.length>=limit)break}return deduped
}

const NOMINATIM_REVERSE='https://nominatim.openstreetmap.org/reverse';
const DISCOVERY_CACHE_VERSION='v10';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function cacheRead(storage,key){
  try{const raw=storage?.getItem(key);if(!raw)return null;const parsed=JSON.parse(raw);return Date.now()-parsed.savedAt<30*24*60*60*1000?parsed.value:null}catch{return null}
}
function cacheWrite(storage,key,value){try{storage?.setItem(key,JSON.stringify({savedAt:Date.now(),value}))}catch{}}

function countryCodeFromRow(row){
  return String(row?.address?.country_code||'').toUpperCase();
}
function supportedCountry(code){
  return Boolean(countryNames[code]);
}
function rowName(row){
  const a=row?.address||{};
  return a.city||a.town||a.village||a.municipality||a.county||a.state_district||a.state||String(row?.display_name||'').split(',')[0]||null;
}
function nominatimElement(row,seed,index){
  const name=rowName(row);if(!name)return null;
  const code=countryCodeFromRow(row);
  if(!supportedCountry(code))return null;
  const lat=Number(row.lat),lon=Number(row.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  return{
    type:'node',
    id:Number(row.place_id)||Math.abs(hash(`${name}:${lat}:${lon}:${index}`)),
    lat,lon,
    tags:{
      name,
      place:row.type==='city'?'city':row.type==='town'?'town':'village',
      'addr:country':code,
      'is_in:country_code':code,
      'is_in:country':row.address?.country||countryNames[code]
    },
    _seed:seed
  };
}
async function fetchReverse(seed,fetchImpl,timeoutMs,onProgress,context){
  const url=new URL(NOMINATIM_REVERSE);
  url.search=new URLSearchParams({
    format:'jsonv2',
    lat:String(seed.lat),
    lon:String(seed.lon),
    zoom:'10',
    addressdetails:'1',
    layer:'address'
  });
  const controller=new AbortController(),startedAt=Date.now();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  onProgress?.({...context,type:'endpoint-start',endpoint:'Nominatim',startedAt});
  try{
    const response=await fetchImpl(url,{headers:{accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new Error(`Nominatim ${response.status}`);
    const row=await response.json();
    onProgress?.({...context,type:'endpoint-success',endpoint:'Nominatim',elapsedMs:Date.now()-startedAt,candidateElements:row?1:0});
    return row;
  }catch(error){
    onProgress?.({...context,type:'endpoint-failure',endpoint:'Nominatim',elapsedMs:Date.now()-startedAt,timeout:error?.name==='AbortError',error:String(error?.message||error)});
    return null;
  }finally{clearTimeout(timer)}
}

/*
 Live destination discovery deliberately uses Nominatim reverse lookups rather than
 broad Overpass area queries. The previous query expanded 8 seed points into roughly
 40 nwr(around:...) clauses per pass and public Overpass instances regularly timed
 those requests out. Reverse geocoding asks one cheap question per seed: which
 named roadtrip region/town is here? Overpass remains available elsewhere for
 detailed POI enrichment after a destination has been selected.
*/
export async function discoverDestinationBatch(
  trip,
  {
    cursor=0,
    excludedIds=[],
    fetchImpl=fetch,
    storage=globalThis.localStorage,
    onProgress=null,
    onBatch=null,
    timeoutMs=7000
  }={}
){
  const allSeeds=[];
  for(let passIndex=0;passIndex<DISCOVERY_PASSES;passIndex++){
    allSeeds.push(...discoverySeeds(trip,cursor*DISCOVERY_PASSES+passIndex,DEFAULT_BATCH_SEEDS));
  }
  onProgress?.({type:'discovery-start',totalPasses:DISCOVERY_PASSES,endpoints:['Nominatim'],origin:trip.origin,reachKm:roadtripReachKm(trip)});

  const emitted=[],emittedIds=new Set(),excluded=new Set(excludedIds);
  let candidateElements=0,successfulPasses=0,requestNo=0;

  for(let passIndex=0;passIndex<DISCOVERY_PASSES;passIndex++){
    const pass=passIndex+1,seeds=allSeeds.slice(passIndex*DEFAULT_BATCH_SEEDS,(passIndex+1)*DEFAULT_BATCH_SEEDS);
    onProgress?.({type:'pass-start',pass,totalPasses:DISCOVERY_PASSES,cursor:cursor*DISCOVERY_PASSES+passIndex});
    const passElements=[];

    // Four geographically spread seed samples per pass are enough for a diverse
    // first portfolio. Remaining seeds are sampled on subsequent "more" requests.
    const selected=[seeds[0],seeds[2],seeds[4],seeds[6]].filter(Boolean);
    for(let i=0;i<selected.length;i++){
      const seed=selected[i],key=`reisslim.destination-discovery.${DISCOVERY_CACHE_VERSION}:${seed.lat.toFixed(3)}:${seed.lon.toFixed(3)}`;
      let row=cacheRead(storage,key);
      if(row){
        onProgress?.({type:'cache-hit',pass,totalPasses:DISCOVERY_PASSES,candidateElements:1});
      }else{
        if(requestNo>0)await sleep(1050); // courteous public Nominatim pacing
        row=await fetchReverse(seed,fetchImpl,timeoutMs,onProgress,{pass,totalPasses:DISCOVERY_PASSES,seedIndex:i+1,totalSeeds:selected.length});
        requestNo++;
        if(row)cacheWrite(storage,key,row);
      }
      const element=row?nominatimElement(row,seed,i):null;
      if(element){passElements.push(element);candidateElements++}
    }

    const fresh=normalizeDiscoveredDestinations(trip,{elements:passElements},{
      excludedIds:[...excluded,...emittedIds],limit:DEFAULT_RESULT_LIMIT
    });
    fresh.forEach(item=>{emittedIds.add(item.id);emitted.push(item)});

    if(passElements.length)successfulPasses++;
    onProgress?.({
      type:passElements.length?'pass-success':'pass-empty',
      pass,totalPasses:DISCOVERY_PASSES,
      endpoint:'Nominatim',
      candidateElements:passElements.length,
      totalCandidateElements:candidateElements,
      newDestinations:fresh.length,
      totalDestinations:emitted.length,
      reason:passElements.length?'':`Zoekronde ${pass} leverde geen bereikbare plaats op.`
    });
    if(fresh.length)await onBatch?.({destinations:fresh,pass,totalPasses:DISCOVERY_PASSES,endpoint:'Nominatim',totalDestinations:emitted.length,totalCandidateElements:candidateElements});
    await sleep(0);

    // Once a useful portfolio exists, stop background discovery. "Toon meer"
    // advances the cursor and samples new seed positions.
    if(emitted.length>=6)break;
  }

  if(!emitted.length){
    const reason='Live OpenStreetMap-plaatsontdekking leverde geen bereikbare regio’s op.';
    onProgress?.({type:'discovery-failure',totalPasses:DISCOVERY_PASSES,successfulPasses,reason});
    return{destinations:[],live:false,reason,passes:DISCOVERY_PASSES,successfulPasses,candidateElements};
  }
  onProgress?.({type:'discovery-complete',totalPasses:DISCOVERY_PASSES,successfulPasses,totalDestinations:emitted.length,candidateElements});
  return{destinations:emitted,live:true,cached:false,source:'OpenStreetMap Nominatim',passes:DISCOVERY_PASSES,successfulPasses,candidateElements};
}

export const destinationDiscoveryConfig=Object.freeze({
  endpoints:[NOMINATIM_REVERSE],
  attribution:'© OpenStreetMap-bijdragers, ODbL',
  coverage:'Europe + South Africa + Namibia; roadtrip-from-user-origin',
  batchSeeds:4,
  discoveryPasses:DISCOVERY_PASSES,
  resultLimit:DEFAULT_RESULT_LIMIT,
  progressive:true,
  provider:'OpenStreetMap Nominatim reverse geocoding',
  endpointTimeoutMs:7000
});
