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
function routeLengthKm(points=[]){
  let total=0;
  for(let i=1;i<points.length;i++)total+=distanceKm(points[i-1],points[i]);
  return total;
}
function sampleGeometry(points=[],spacingKm=12){
  if(!points.length)return[];
  const sampled=[points[0]];
  let carry=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],segment=distanceKm(a,b);
    if(!Number.isFinite(segment)||segment<=0)continue;
    const steps=Math.max(1,Math.floor((carry+segment)/spacingKm));
    for(let step=1;step<=steps;step++){
      const target=step*spacingKm-carry;
      if(target<=0||target>=segment)continue;
      const t=target/segment;
      sampled.push({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t});
    }
    carry=(carry+segment)%spacingKm;
  }
  sampled.push(points.at(-1));
  return sampled;
}
function geometryOverlap(reference=[],candidate=[],thresholdKm=10){
  const ref=sampleGeometry(reference,12),test=sampleGeometry(candidate,12);
  if(!ref.length||!test.length)return 1;
  // Ignore unavoidable shared areas immediately around start/end.
  const trimmed=test.filter((_,i)=>i>1&&i<test.length-2);
  const pool=trimmed.length?trimmed:test;
  const matched=pool.filter(point=>ref.some(other=>distanceKm(point,other)<=thresholdKm)).length;
  return matched/Math.max(1,pool.length);
}
function loopControlPoints(from,to,{side=1,offsetFactor=.30,viaCount=3,shortLoop=false}={}){
  const direct=distanceKm(from,to);
  const minimumDirect=shortLoop?8:35;
  if(!Number.isFinite(direct)||direct<minimumDirect)return[];
  const midLat=radians((from.lat+to.lat)/2);
  const dLat=to.lat-from.lat,dLon=(to.lon-from.lon)*Math.cos(midLat),len=Math.hypot(dLat,dLon)||1;
  const perpLat=-dLon/len,perpLon=dLat/len/Math.max(.25,Math.cos(midLat));
  // Short day loops need much smaller but still meaningful lateral offsets.
  // The old hard 60 km threshold caused exactly the observed Harz failure:
  // no controls => origin -> target -> origin => identical road back.
  const maxOffsetKm=shortLoop
    ?Math.max(7,Math.min(36,direct*offsetFactor))
    :Math.max(24,Math.min(120,direct*offsetFactor));
  return Array.from({length:viaCount},(_,index)=>{
    const progress=(index+1)/(viaCount+1);
    const envelope=.72+.28*Math.sin(Math.PI*progress);
    const deg=maxOffsetKm*envelope/111;
    return{
      lat:Number((from.lat+(to.lat-from.lat)*progress+side*perpLat*deg).toFixed(5)),
      lon:Number((from.lon+(to.lon-from.lon)*progress+side*perpLon*deg).toFixed(5)),
      role:'loop-via'
    };
  });
}


function storageOrNull(){try{return globalThis.localStorage||null}catch{return null}}
export function readRoutingSettings(storage=storageOrNull()){try{const value=JSON.parse(storage?.getItem(SETTINGS_KEY)||'{}');return{orsApiKey:String(value.orsApiKey||'').trim()}}catch{return{orsApiKey:''}}}
export function saveRoutingSettings(settings,storage=storageOrNull()){const safe={orsApiKey:String(settings?.orsApiKey||'').trim()};try{storage?.setItem(SETTINGS_KEY,JSON.stringify(safe))}catch{}return safe}
export function routingEndpoint(){return String(globalThis.REISSLIM_ROUTING_API_URL||routingConfig.apiUrl||'').trim()}
export function routingConfigured(trip=null,settings=readRoutingSettings()){if(trip?.liveData===false)return false;if(trip?.travelMode&&trip.travelMode!=='direct')return false;if(/^https:\/\//.test(routingEndpoint())||settings.orsApiKey)return true;return trip?['car','motorcycle'].includes(transportId(trip.transport)):false}
export function buildRoutingRequest(trip,day){
  const origin={lat:day.fromPoint.lat,lon:day.fromPoint.lon},destination={lat:day.toPoint.lat,lon:day.toPoint.lon};
  let daytripVia=[];
  if(day.kind==='daytrip'&&validCoordinate(day.destinationPoint)){
    const target={lat:day.destinationPoint.lat,lon:day.destinationPoint.lon};
    if(trip.routeTopology==='loop'){
      // A one-day loop must START AND FINISH at the real trip origin.
      // Travel outward to the selected highlight, then force the return onto
      // a separated corridor. This avoids the old local/open route around the
      // destination and avoids simply retracing the outbound road.
      const returnControls=loopControlPoints(target,origin,{side:1,offsetFactor:.46,viaCount:3,shortLoop:true});
      daytripVia=[target,...returnControls];
    }else{
      daytripVia=[target];
    }
  }
  return{day:day.day,origin,destination,waypoints:daytripVia,vehicle:vehicleSpec(trip)}
}
function waypointsOnGeometry(geometry,timing,transport){const count=Math.max(0,timing.stopCount||0);if(geometry.length<2||!count)return[];return Array.from({length:count},(_,index)=>{const position=Math.min(geometry.length-1,Math.max(1,Math.round((index+1)*(geometry.length-1)/(count+1))));return{...geometry[position],name:timing.fuelStops>index?`Brandstof- en ruststop ${index+1}`:`Ruststop ${index+1}`,role:timing.fuelStops>index?'fuel':'rest',transport,approximate:false}})}
function applyResult(trip,day,result){const geometry=Array.isArray(result.geometry)?result.geometry.filter(validCoordinate):[];if(geometry.length<10||!Number.isFinite(result.distanceKm)||!Number.isFinite(result.roadHours))return false;
if(day.kind==='daytrip'&&trip.routeTopology==='loop'){
  const start=geometry[0],end=geometry.at(-1);
  if(!validCoordinate(start)||!validCoordinate(end)||distanceKm(start,end)>.8)return false;
  if(!Number.isFinite(result.loopOverlap)||result.loopOverlap>.58)return false;
}const timing=estimateLegTiming(trip,{distanceKm:result.distanceKm,roadHours:result.roadHours,arrival:day.kind!=='return'||day.to!==trip.origin});Object.assign(day,{distanceKm:Math.round(result.distanceKm),roadHours:timing.roadHours,driveHours:timing.elapsedHours,elapsedHours:timing.elapsedHours,breakHours:timing.breakHours,restStops:timing.restStops,fuelStops:timing.fuelStops,stopCount:timing.stopCount,waypoints:waypointsOnGeometry(geometry,timing,trip.transport),geometry,routeSource:result.provider||'live-provider',routeOverlap:Number.isFinite(result.loopOverlap)?result.loopOverlap:null,exceedsDailyLimit:timing.elapsedHours>trip.maxDrive+.05});return true}
async function fetchWithTimeout(url,options,fetchImpl,timeoutMs){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetchImpl(url,{...options,signal:controller.signal});if(!response.ok)throw new Error(`Routeprovider ${response.status}`);return response.json()}finally{clearTimeout(timer)}}
function normalizeOsrmRoute(payload){const route=payload?.routes?.[0],coordinates=route?.geometry?.coordinates||[];if(!route||coordinates.length<10)throw new Error('Geen volledige OSRM route');return{provider:'osrm',distanceKm:route.distance/1000,roadHours:route.duration/3600,geometry:coordinates.map(([lon,lat])=>({lat,lon}))}}
async function fetchOsrmRoute(request,fetchImpl,timeoutMs,urls=OSRM_URLS){const{origin,destination}=request;let lastError;for(const baseUrl of urls){try{const clean=baseUrl.replace(/\/$/,'');
const coordinates=[origin,...(request.waypoints||[]),destination].map(point=>`${point.lon},${point.lat}`).join(';');
const url=new URL(`${clean}/route/v1/driving/${coordinates}`);url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false',alternatives:'false',generate_hints:'false'});const endpointTimeout=Math.max(2200,Math.floor(timeoutMs/Math.max(1,urls.length)));return normalizeOsrmRoute(await fetchWithTimeout(url,{headers:{accept:'application/json'}},fetchImpl,endpointTimeout))}catch(error){lastError=error}}throw lastError||new Error('Geen routeprovider beschikbaar')}
function normalizeOrsRoute(payload){const feature=payload?.features?.[0],summary=feature?.properties?.summary,coordinates=feature?.geometry?.coordinates||[];if(!summary||coordinates.length<10)throw new Error('Geen volledige ORS route');return{provider:'openrouteservice',distanceKm:summary.distance/1000,roadHours:summary.duration/3600,geometry:coordinates.map(([lon,lat])=>({lat,lon}))}}
async function fetchOrsRoute(trip,request,apiKey,fetchImpl,timeoutMs,baseUrl=ORS_URL){const vehicle=vehicleSpec(trip),heavy=['motorhome','caravan'].includes(vehicle.transport),profile=heavy?'driving-hgv':'driving-car';const body={coordinates:[request.origin,...(request.waypoints||[]),request.destination].map(point=>[point.lon,point.lat]),instructions:false};if(heavy)body.options={vehicle_type:'goods',profile_params:{restrictions:{height:vehicle.heightM,length:vehicle.lengthM,weight:vehicle.weightKg/1000}}};const payload=await fetchWithTimeout(`${baseUrl}/v2/directions/${profile}/geojson`,{method:'POST',headers:{authorization:apiKey,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)},fetchImpl,timeoutMs);return normalizeOrsRoute(payload)}
async function fetchLoopReturnRoute(trip,day,options,fetchImpl,timeoutMs){
  const base=buildRoutingRequest(trip,day);
  const outboundGeometry=(options.outboundGeometry||[]).filter(validCoordinate);
  // If no actual outbound road geometry exists yet, fall back to a strong
  // separated corridor rather than pretending overlap can be measured.
  if(outboundGeometry.length<10){
    const request={...base,waypoints:loopControlPoints(base.origin,base.destination,{side:1,offsetFactor:.34,viaCount:3})};
    const result=await fetchRouteForRequest(trip,request,options,fetchImpl,timeoutMs);
    result.loopOverlap=null;
    return result;
  }

  const directKm=distanceKm(base.origin,base.destination);
  const configs=[
    {side:1, offsetFactor:.30, viaCount:3},
    {side:-1,offsetFactor:.30, viaCount:3},
    {side:1, offsetFactor:.42, viaCount:3},
    {side:-1,offsetFactor:.42, viaCount:3}
  ];
  let best=null;

  for(let i=0;i<configs.length;i++){
    const config=configs[i];
    const request={...base,waypoints:loopControlPoints(base.origin,base.destination,config)};
    try{
      const result=await fetchRouteForRequest(trip,request,options,fetchImpl,timeoutMs);
      const overlap=geometryOverlap(outboundGeometry,result.geometry,10);
      const detourRatio=result.distanceKm/Math.max(1,directKm);
      // Heavy penalty for overlap; a modest detour is desirable for a loop.
      const score=overlap*100+Math.max(0,detourRatio-1.55)*35;
      const candidate={...result,loopOverlap:Number(overlap.toFixed(3)),loopSide:config.side,loopOffsetFactor:config.offsetFactor,_loopScore:score};
      if(!best||candidate._loopScore<best._loopScore)best=candidate;
      // <=30% overlap (excluding unavoidable end zones) is acceptable.
      if(overlap<=.30&&detourRatio<=1.75)break;
    }catch(error){
      console.warn('Alternatieve lusroute mislukt',config,error);
    }
    if(i<configs.length-1)await sleep(1100);
  }
  if(!best)throw new Error('Geen voldoende alternatieve terugroute beschikbaar');
  delete best._loopScore;
  return best;
}

async function fetchSingleDayLoopRoute(trip,day,options,fetchImpl,timeoutMs){
  const origin={lat:day.fromPoint.lat,lon:day.fromPoint.lon};
  const target={lat:day.destinationPoint.lat,lon:day.destinationPoint.lon};

  // First establish the true outbound road route.
  const outward=await fetchRouteForRequest(
    trip,
    {day:day.day,origin,destination:target,waypoints:[],vehicle:vehicleSpec(trip)},
    options,fetchImpl,timeoutMs
  );

  const direct=Math.max(1,distanceKm(origin,target));
  const configs=[
    {side:1, offsetFactor:.36, viaCount:2},
    {side:-1,offsetFactor:.36, viaCount:2},
    {side:1, offsetFactor:.52, viaCount:3},
    {side:-1,offsetFactor:.52, viaCount:3},
    {side:1, offsetFactor:.68, viaCount:3},
    {side:-1,offsetFactor:.68, viaCount:3}
  ];

  let best=null;
  for(let index=0;index<configs.length;index++){
    const config=configs[index];
    const controls=loopControlPoints(target,origin,{...config,shortLoop:true});
    if(!controls.length)continue;
    try{
      const back=await fetchRouteForRequest(
        trip,
        {day:day.day,origin:target,destination:origin,waypoints:controls,vehicle:vehicleSpec(trip)},
        options,fetchImpl,timeoutMs
      );

      // Compare ONLY the actual outbound road with the return road.
      const overlap=geometryOverlap(outward.geometry,back.geometry,3.5);
      const returnRatio=back.distanceKm/Math.max(1,outward.distanceKm);
      const detourPenalty=Math.max(0,returnRatio-1.80)*30;
      const score=overlap*100+detourPenalty;
      const candidate={back,overlap,score,config};

      if(!best||candidate.score<best.score)best=candidate;
      // A proper loop should visibly use another corridor for most of the return.
      if(overlap<=.36&&returnRatio<=1.8)break;
    }catch(error){
      if(index===configs.length-1&&options.debug)console.warn('Alternatieve daglus mislukt',error);
    }
  }

  if(!best)throw new Error('Geen alternatieve terugcorridor voor daglus gevonden');

  const back=best.back;
  const geometry=[
    ...outward.geometry,
    ...back.geometry.slice(1)
  ];

  // Hard acceptance criteria: it must really close and it must not mostly retrace.
  if(distanceKm(geometry[0],geometry.at(-1))>.8)throw new Error('Daglus sluit niet op vertrekpunt');
  if(best.overlap>.58)throw new Error(`Daglus heeft te veel route-overlap (${Math.round(best.overlap*100)}%)`);

  return{
    provider:outward.provider===back.provider?outward.provider:'mixed',
    distanceKm:outward.distanceKm+back.distanceKm,
    roadHours:outward.roadHours+back.roadHours,
    geometry,
    loopOverlap:Number(best.overlap.toFixed(3)),
    loopSide:best.config.side,
    loopOffsetFactor:best.config.offsetFactor,
    loopOutwardDistanceKm:outward.distanceKm,
    loopReturnDistanceKm:back.distanceKm
  };
}


function styledViaPoints(origin,destination,{side=1,factor=.12,count=2}={}){
  const direct=distanceKm(origin,destination);
  if(!Number.isFinite(direct)||direct<22)return[];
  const midLat=radians((origin.lat+destination.lat)/2);
  const dLat=destination.lat-origin.lat,dLon=(destination.lon-origin.lon)*Math.cos(midLat),len=Math.hypot(dLat,dLon)||1;
  const perpLat=-dLon/len,perpLon=dLat/len/Math.max(.25,Math.cos(midLat));
  const offsetKm=Math.max(5,Math.min(28,direct*factor));
  return Array.from({length:count},(_,i)=>{
    const p=(i+1)/(count+1),envelope=.78+.22*Math.sin(Math.PI*p),deg=offsetKm*envelope/111;
    return{
      lat:Number((origin.lat+(destination.lat-origin.lat)*p+side*perpLat*deg).toFixed(5)),
      lon:Number((origin.lon+(destination.lon-origin.lon)*p+side*perpLon*deg).toFixed(5)),
      role:'route-style-via'
    };
  });
}

async function fetchStyledRoute(trip,request,options,fetchImpl,timeoutMs){
  const style=request.vehicle?.routeStyle||'balanced';
  const direct=await fetchRouteForRequest(trip,{...request,_skipStyle:true},options,fetchImpl,timeoutMs);
  if(style==='fastest'||request._skipStyle)return direct;

  const factor=style==='scenic'?.16:.08;
  const maxRatio=style==='scenic'?1.38:1.15;
  const overlapTarget=style==='scenic'?.72:.88;
  const candidates=[direct];

  for(const side of [1,-1]){
    const waypoints=styledViaPoints(request.origin,request.destination,{side,factor,count:style==='scenic'?3:2});
    if(!waypoints.length)continue;
    try{
      const alt=await fetchRouteForRequest(trip,{...request,waypoints:[...(request.waypoints||[]),...waypoints],_skipStyle:true},options,fetchImpl,Math.max(3200,Math.floor(timeoutMs*.8)));
      const ratio=alt.distanceKm/Math.max(1,direct.distanceKm);
      const overlap=geometryOverlap(direct.geometry,alt.geometry,5);
      if(ratio<=maxRatio&&overlap<=overlapTarget)candidates.push({...alt,_styleOverlap:overlap,_styleRatio:ratio});
    }catch{}
  }

  if(candidates.length===1)return direct;
  if(style==='scenic'){
    candidates.sort((a,b)=>(a._styleOverlap??1)-(b._styleOverlap??1)||(a._styleRatio??1)-(b._styleRatio??1));
  }else{
    candidates.sort((a,b)=>(a.distanceKm+Math.max(0,(a._styleRatio??1)-1)*direct.distanceKm*.8)-(b.distanceKm+Math.max(0,(b._styleRatio??1)-1)*direct.distanceKm*.8));
  }
  const winner=candidates[0];
  delete winner._styleOverlap;delete winner._styleRatio;
  return winner;
}

async function fetchRouteForRequest(trip,request,options,fetchImpl,timeoutMs){
  const gateway=options.apiUrl??routingEndpoint();
  if(gateway)return fetchWithTimeout(gateway,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)},fetchImpl,timeoutMs);
  const settings=options.settings||readRoutingSettings(options.storage);
  if(settings.orsApiKey)return fetchOrsRoute(trip,request,settings.orsApiKey,fetchImpl,timeoutMs,options.orsUrl);
  if(!['car','motorcycle'].includes(transportId(trip.transport)))throw new Error('Voor camper/caravan is ORS-sleutel nodig voor live route');
  return fetchOsrmRoute(request,fetchImpl,timeoutMs,options.osrmUrls||OSRM_URLS);
}
async function fetchRouteForDay(trip,day,options,fetchImpl,timeoutMs){
  if(Number(trip.days)===1&&trip.routeTopology==='loop'&&day.kind==='daytrip'&&validCoordinate(day.destinationPoint)){
    return fetchSingleDayLoopRoute(trip,day,options,fetchImpl,timeoutMs);
  }
  if(trip.routeTopology==='loop'&&day.kind==='return'){
    return fetchLoopReturnRoute(trip,day,options,fetchImpl,timeoutMs);
  }
  return fetchStyledRoute(trip,buildRoutingRequest(trip,day),options,fetchImpl,timeoutMs);
}
const providerLabel=source=>({openrouteservice:'OpenRouteService wegroute',osrm:'OSRM wegroute'})[source]||'Live wegroute';
export async function enrichPlanWithLiveRouting(trip,destination,plan,options={}){
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  if(!routingConfigured(trip,options.settings||readRoutingSettings(options.storage))||typeof fetchImpl!=='function')return plan;
  const next=typeof globalThis.structuredClone==='function'?globalThis.structuredClone(plan):JSON.parse(JSON.stringify(plan));
  const routeDays=next.days.filter(day=>['outward','return','transfer','daytrip'].includes(day.kind)&&validCoordinate(day.fromPoint)&&validCoordinate(day.toPoint));
  let applied=0; const providers=[]; const total=routeDays.length; let completed=0;
  options.onProgress?.({type:'routing-start',completed,total});
  const batchSize=3;
  for(let baseIndex=0;baseIndex<routeDays.length;baseIndex+=batchSize){
    const batch=routeDays.slice(baseIndex,baseIndex+batchSize);
    await Promise.all(batch.map(async day=>{
      options.onProgress?.({type:'routing-day-start',day:day.day,completed,total});
      try{
        const outboundGeometry=next.days.filter(item=>item.kind==='outward'&&Array.isArray(item.geometry)&&['osrm','openrouteservice','tomtom'].includes(item.routeSource)).flatMap(item=>item.geometry).filter(validCoordinate);
        const result=await fetchRouteForDay(trip,day,{...options,outboundGeometry},fetchImpl,options.timeoutMs||7000);
        if(applyResult(trip,day,result)){applied++;providers.push(result.provider)}
      }catch(error){console.warn(`Live route dag ${day.day} mislukt`,error)}
      finally{completed++;options.onProgress?.({type:'routing-day-complete',day:day.day,completed,total,applied})}
    }));
    if(baseIndex+batchSize<routeDays.length)await sleep(250);
  }
  if(!applied){next.routing={...next.routing,live:false,error:'Live wegroute niet beschikbaar; voorlopige route-inschatting blijft zichtbaar.'};options.onProgress?.({type:'routing-complete',completed,total,applied});return next}
  const outbound=next.days.filter(day=>day.kind==='outward');
  next.routeMetrics.oneWayDistanceKm=outbound.reduce((sum,day)=>sum+day.distanceKm,0);
  next.routeMetrics.oneWayRoadHours=Number(outbound.reduce((sum,day)=>sum+day.roadHours,0).toFixed(1));
  next.routeMetrics.oneWayElapsedHours=Number(outbound.reduce((sum,day)=>sum+day.driveHours,0).toFixed(1));
  next.routeMetrics.oneWayDriveHours=next.routeMetrics.oneWayElapsedHours;
  next.routeMetrics.breakHours=Number(outbound.reduce((sum,day)=>sum+day.breakHours,0).toFixed(1));
  next.requiredLegs=minimumTravelLegs(trip,next.routeMetrics.oneWayDistanceKm,next.routeMetrics.oneWayRoadHours); next.routeMetrics.requiredLegs=next.requiredLegs;
  const returnDays=next.days.filter(day=>day.kind==='return'&&Number.isFinite(day.routeOverlap));
  const loopOverlap=returnDays.length?Number((returnDays.reduce((sum,day)=>sum+day.routeOverlap,0)/returnDays.length).toFixed(2)):null;
  const singleProvider=new Set(providers).size===1?providers[0]:'mixed';
  next.routeMetrics.routeSource=applied===routeDays.length?singleProvider:'mixed'; if(Number.isFinite(loopOverlap))next.routeMetrics.liveLoopOverlap=loopOverlap;
  applyDaySchedules(trip,next.days); next.recommendations=buildRecommendations(trip,destination,next.days);
  next.routing={source:applied===routeDays.length?singleProvider:'mixed',label:Number(trip.days)===1&&trip.routeTopology==='loop'?'Live daglus · start = finish':trip.routeTopology==='loop'&&Number.isFinite(loopOverlap)?`Live lus · ${Math.round(loopOverlap*100)}% overlap`:applied===routeDays.length?providerLabel(singleProvider):'Gedeeltelijk live',live:applied===routeDays.length,completedSegments:applied,totalSegments:routeDays.length,loopOverlap,error:applied<routeDays.length?'Niet alle segmenten konden live worden berekend.':null};
  options.onProgress?.({type:'routing-complete',completed,total,applied}); return next;
}
