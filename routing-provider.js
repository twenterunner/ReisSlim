import { routingConfig, validCoordinate } from './config.js';
import { buildRecommendations } from './recommendation-engine.js';
import { estimateLegTiming, minimumTravelLegs, transportId, vehicleSpec } from './vehicle-intelligence.js';
import { applyDaySchedules } from './plan-solver.js';

const SETTINGS_KEY='reisslim.integration.v1';
const OSRM_URLS=['https://router.project-osrm.org','https://routing.openstreetmap.de/routed-car'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ORS_URL='https://api.heigit.org/openrouteservice';

const radians=value=>value*Math.PI/180;
function distanceKm(a,b){
  const dLat=radians(b.lat-a.lat),dLon=radians(b.lon-a.lon);
  const v=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLon/2)**2;
  return 6371*2*Math.asin(Math.sqrt(v));
}
function loopControlPoints(from,to){
  const direct=distanceKm(from,to);
  if(!Number.isFinite(direct)||direct<80)return[];
  const midLat=radians((from.lat+to.lat)/2);
  const dLat=to.lat-from.lat,dLon=(to.lon-from.lon)*Math.cos(midLat),len=Math.hypot(dLat,dLon)||1;
  const perpLat=-dLon/len,perpLon=dLat/len/Math.max(.25,Math.cos(midLat));
  // Force a genuinely different return corridor across the whole leg, not only near destination.
  const offsetKm=Math.max(55,Math.min(130,direct*.24)),deg=offsetKm/111;
  return[.34,.68].map((progress,index)=>({
    lat:Number((from.lat+(to.lat-from.lat)*progress+perpLat*deg*(index===0?.88:1)).toFixed(5)),
    lon:Number((from.lon+(to.lon-from.lon)*progress+perpLon*deg*(index===0?.88:1)).toFixed(5)),
    role:'loop-via'
  }));
}

function storageOrNull(){try{return globalThis.localStorage||null}catch{return null}}
export function readRoutingSettings(storage=storageOrNull()){try{const value=JSON.parse(storage?.getItem(SETTINGS_KEY)||'{}');return{orsApiKey:String(value.orsApiKey||'').trim()}}catch{return{orsApiKey:''}}}
export function saveRoutingSettings(settings,storage=storageOrNull()){const safe={orsApiKey:String(settings?.orsApiKey||'').trim()};try{storage?.setItem(SETTINGS_KEY,JSON.stringify(safe))}catch{}return safe}
export function routingEndpoint(){return String(globalThis.REISSLIM_ROUTING_API_URL||routingConfig.apiUrl||'').trim()}
export function routingConfigured(trip=null,settings=readRoutingSettings()){if(trip?.liveData===false)return false;if(trip?.travelMode&&trip.travelMode!=='direct')return false;if(/^https:\/\//.test(routingEndpoint())||settings.orsApiKey)return true;return trip?['car','motorcycle'].includes(transportId(trip.transport)):false}
export function buildRoutingRequest(trip,day){
  const origin={lat:day.fromPoint.lat,lon:day.fromPoint.lon},destination={lat:day.toPoint.lat,lon:day.toPoint.lon};
  const waypoints=trip.routeTopology==='loop'&&day.kind==='return'?loopControlPoints(origin,destination):[];
  return{day:day.day,origin,destination,waypoints,vehicle:vehicleSpec(trip)}
}
function waypointsOnGeometry(geometry,timing,transport){const count=Math.max(0,timing.stopCount||0);if(geometry.length<2||!count)return[];return Array.from({length:count},(_,index)=>{const position=Math.min(geometry.length-1,Math.max(1,Math.round((index+1)*(geometry.length-1)/(count+1))));return{...geometry[position],name:timing.fuelStops>index?`Brandstof- en ruststop ${index+1}`:`Ruststop ${index+1}`,role:timing.fuelStops>index?'fuel':'rest',transport,approximate:false}})}
function applyResult(trip,day,result){const geometry=Array.isArray(result.geometry)?result.geometry.filter(validCoordinate):[];if(geometry.length<10||!Number.isFinite(result.distanceKm)||!Number.isFinite(result.roadHours))return false;const timing=estimateLegTiming(trip,{distanceKm:result.distanceKm,roadHours:result.roadHours,arrival:day.kind!=='return'||day.to!==trip.origin});Object.assign(day,{distanceKm:Math.round(result.distanceKm),roadHours:timing.roadHours,driveHours:timing.elapsedHours,elapsedHours:timing.elapsedHours,breakHours:timing.breakHours,restStops:timing.restStops,fuelStops:timing.fuelStops,stopCount:timing.stopCount,waypoints:waypointsOnGeometry(geometry,timing,trip.transport),geometry,routeSource:result.provider||'live-provider',exceedsDailyLimit:timing.elapsedHours>trip.maxDrive+.05});return true}
async function fetchWithTimeout(url,options,fetchImpl,timeoutMs){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetchImpl(url,{...options,signal:controller.signal});if(!response.ok)throw new Error(`Routeprovider ${response.status}`);return response.json()}finally{clearTimeout(timer)}}
function normalizeOsrmRoute(payload){const route=payload?.routes?.[0],coordinates=route?.geometry?.coordinates||[];if(!route||coordinates.length<10)throw new Error('Geen volledige OSRM route');return{provider:'osrm',distanceKm:route.distance/1000,roadHours:route.duration/3600,geometry:coordinates.map(([lon,lat])=>({lat,lon}))}}
async function fetchOsrmRoute(request,fetchImpl,timeoutMs,urls=OSRM_URLS){const{origin,destination}=request;let lastError;for(const baseUrl of urls){try{const clean=baseUrl.replace(/\/$/,'');
const coordinates=[origin,...(request.waypoints||[]),destination].map(point=>`${point.lon},${point.lat}`).join(';');
const url=new URL(`${clean}/route/v1/driving/${coordinates}`);url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false',alternatives:'false',generate_hints:'false'});return normalizeOsrmRoute(await fetchWithTimeout(url,{headers:{accept:'application/json'}},fetchImpl,timeoutMs))}catch(error){lastError=error}}throw lastError||new Error('Geen routeprovider beschikbaar')}
function normalizeOrsRoute(payload){const feature=payload?.features?.[0],summary=feature?.properties?.summary,coordinates=feature?.geometry?.coordinates||[];if(!summary||coordinates.length<10)throw new Error('Geen volledige ORS route');return{provider:'openrouteservice',distanceKm:summary.distance/1000,roadHours:summary.duration/3600,geometry:coordinates.map(([lon,lat])=>({lat,lon}))}}
async function fetchOrsRoute(trip,request,apiKey,fetchImpl,timeoutMs,baseUrl=ORS_URL){const vehicle=vehicleSpec(trip),heavy=['motorhome','caravan'].includes(vehicle.transport),profile=heavy?'driving-hgv':'driving-car';const body={coordinates:[request.origin,...(request.waypoints||[]),request.destination].map(point=>[point.lon,point.lat]),instructions:false};if(heavy)body.options={vehicle_type:'goods',profile_params:{restrictions:{height:vehicle.heightM,length:vehicle.lengthM,weight:vehicle.weightKg/1000}}};const payload=await fetchWithTimeout(`${baseUrl}/v2/directions/${profile}/geojson`,{method:'POST',headers:{authorization:apiKey,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)},fetchImpl,timeoutMs);return normalizeOrsRoute(payload)}
async function fetchRouteForDay(trip,day,options,fetchImpl,timeoutMs){const request=buildRoutingRequest(trip,day),gateway=options.apiUrl??routingEndpoint();if(gateway)return fetchWithTimeout(gateway,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)},fetchImpl,timeoutMs);const settings=options.settings||readRoutingSettings(options.storage);if(settings.orsApiKey)return fetchOrsRoute(trip,request,settings.orsApiKey,fetchImpl,timeoutMs,options.orsUrl);if(!['car','motorcycle'].includes(transportId(trip.transport)))throw new Error('Voor camper/caravan is ORS-sleutel nodig voor live route');return fetchOsrmRoute(request,fetchImpl,timeoutMs,options.osrmUrls||OSRM_URLS)}
const providerLabel=source=>({openrouteservice:'OpenRouteService wegroute',osrm:'OSRM wegroute'})[source]||'Live wegroute';
export async function enrichPlanWithLiveRouting(trip,destination,plan,options={}){const fetchImpl=options.fetchImpl||globalThis.fetch;if(!routingConfigured(trip,options.settings||readRoutingSettings(options.storage))||typeof fetchImpl!=='function')return plan;const next=typeof globalThis.structuredClone==='function'?globalThis.structuredClone(plan):JSON.parse(JSON.stringify(plan));const routeDays=next.days.filter(day=>['outward','return','transfer'].includes(day.kind)&&validCoordinate(day.fromPoint)&&validCoordinate(day.toPoint));let applied=0;const providers=[];for(let index=0;index<routeDays.length;index++){try{const result=await fetchRouteForDay(trip,routeDays[index],options,fetchImpl,options.timeoutMs||25000);if(applyResult(trip,routeDays[index],result)){applied++;providers.push(result.provider)}}catch(error){console.warn(`Live route dag ${routeDays[index].day} mislukt`,error)}if(index<routeDays.length-1)await sleep(1100)}if(!applied){next.routing={...next.routing,live:false,error:'Live wegroute niet beschikbaar; corridorraming blijft zichtbaar.'};return next}const outbound=next.days.filter(day=>day.kind==='outward');next.routeMetrics.oneWayDistanceKm=outbound.reduce((sum,day)=>sum+day.distanceKm,0);next.routeMetrics.oneWayRoadHours=Number(outbound.reduce((sum,day)=>sum+day.roadHours,0).toFixed(1));next.routeMetrics.oneWayElapsedHours=Number(outbound.reduce((sum,day)=>sum+day.driveHours,0).toFixed(1));next.routeMetrics.oneWayDriveHours=next.routeMetrics.oneWayElapsedHours;next.routeMetrics.breakHours=Number(outbound.reduce((sum,day)=>sum+day.breakHours,0).toFixed(1));next.requiredLegs=minimumTravelLegs(trip,next.routeMetrics.oneWayDistanceKm,next.routeMetrics.oneWayRoadHours);next.routeMetrics.requiredLegs=next.requiredLegs;const singleProvider=new Set(providers).size===1?providers[0]:'mixed';next.routeMetrics.routeSource=applied===routeDays.length?singleProvider:'mixed';applyDaySchedules(trip,next.days);next.recommendations=buildRecommendations(trip,destination,next.days);next.routing={source:applied===routeDays.length?singleProvider:'mixed',label:applied===routeDays.length?providerLabel(singleProvider):'Gedeeltelijk live',live:applied===routeDays.length,completedSegments:applied,totalSegments:routeDays.length,error:applied<routeDays.length?'Niet alle segmenten konden live worden berekend.':null};return next}
