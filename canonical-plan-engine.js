import { CANONICAL_ENGINE_ID, enums, inputLimits, validCoordinate, vehicleProfiles } from './config.js';
import { haversineKm } from './travel-data.js';

const clone=v=>globalThis.structuredClone?globalThis.structuredClone(v):JSON.parse(JSON.stringify(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=(v,d=1)=>Number(Number(v).toFixed(d));
const samePoint=(a,b)=>Boolean(a&&b)&&(a.id&&b.id?a.id===b.id:haversineKm(a,b)<.5);
const addDays=(iso,n)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const point=(p,extra={})=>({id:p.id||`${p.name}:${round(p.lat,4)},${round(p.lon,4)}`,name:p.name,lat:Number(p.lat),lon:Number(p.lon),...extra});

function pointToSegmentKm(p,a,b){
  const lat0=Number(p.lat)*Math.PI/180,scaleLon=Math.max(.15,Math.cos(lat0));
  const ax=(Number(a.lon)-Number(p.lon))*111.32*scaleLon,ay=(Number(a.lat)-Number(p.lat))*110.57;
  const bx=(Number(b.lon)-Number(p.lon))*111.32*scaleLon,by=(Number(b.lat)-Number(p.lat))*110.57;
  const vx=bx-ax,vy=by-ay,den=vx*vx+vy*vy;
  const t=den?clamp((-(ax*vx+ay*vy))/den,0,1):0;
  return Math.hypot(ax+t*vx,ay+t*vy);
}
function corridorDistanceKm(p,nodes=[]){
  if(nodes.length<2)return Infinity;let best=Infinity;
  for(let i=0;i<nodes.length-1;i++)best=Math.min(best,pointToSegmentKm(p,nodes[i],nodes[i+1]));
  return best;
}
function densifyGeometry(points=[],stepKm=12){
  const out=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],d=haversineKm(a,b),steps=Math.max(1,Math.ceil(d/stepKm));for(let s=0;s<steps;s++){const t=s/steps;out.push({lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t})}}if(points.length)out.push(points.at(-1));return out;
}
function geometryDistanceKm(p,geometry=[]){let best=Infinity;for(let i=0;i<geometry.length-1;i++)best=Math.min(best,pointToSegmentKm(p,geometry[i],geometry[i+1]));return best}
export function routeGeometryOverlapRatio(outboundGeometry=[],returnGeometry=[],thresholdKm=10){
  if(outboundGeometry.length<2||returnGeometry.length<2)return 1;
  const sampled=densifyGeometry(returnGeometry,10),start=outboundGeometry[0],end=outboundGeometry.at(-1);
  const eligible=sampled.filter(p=>haversineKm(p,start)>18&&haversineKm(p,end)>18);const rows=eligible.length?eligible:sampled;
  if(!rows.length)return 1;return rows.filter(p=>geometryDistanceKm(p,outboundGeometry)<=thresholdKm).length/rows.length;
}
export function allowedLoopOverlap(distanceKm){return distanceKm<80?1:distanceKm<150?.75:distanceKm<300?.66:.62}
export function loopRouteOverlap(plan){
  const out=(plan?.days||[]).filter(d=>d.journeyPhase==='outbound').flatMap((d,i)=>i?(d.geometry||[]).slice(1):(d.geometry||[]));
  const ret=(plan?.days||[]).filter(d=>d.journeyPhase==='return').flatMap((d,i)=>i?(d.geometry||[]).slice(1):(d.geometry||[]));
  return routeGeometryOverlapRatio(out,ret);
}

export function normalizeTripInput(raw={}){
  const out={...raw};
  for(const [key,lim] of Object.entries(inputLimits)){if(!(key in out))continue;const v=Number(out[key]);out[key]=Number.isFinite(v)?v:lim.min}
  out.days=Math.round(out.days??5);out.budget=Number(out.budget??3500);out.adults=Math.round(out.adults??2);out.children=Math.round(out.children??0);out.maxDrive=Number(out.maxDrive||5);out.maxChanges=Math.round(out.maxChanges??5);out.fuelRangeKm=Number(out.fuelRangeKm||vehicleProfiles[out.transport||'car']?.defaultFuelRangeKm||500);
  out.transport=enums.transport.includes(out.transport)?out.transport:'car';out.tripStructure=enums.tripStructure.includes(out.tripStructure)?out.tripStructure:'moving';out.routeTopology=enums.routeTopology.includes(out.routeTopology)?out.routeTopology:'loop';out.tripPace=enums.tripPace.includes(out.tripPace)?out.tripPace:'balanced';out.accommodationType=enums.accommodationType.includes(out.accommodationType)?out.accommodationType:'any';out.comfort=enums.comfort.includes(out.comfort)?out.comfort:'mid';out.routeStyle=enums.routeStyle.includes(out.routeStyle)?out.routeStyle:'balanced';
  out.strictBudget=out.strictBudget!==false;out.strictDrive=out.strictDrive!==false;out.strictChanges=out.strictChanges!==false;out.liveData=out.liveData!==false;out.startDate=out.startDate||new Date().toISOString().slice(0,10);out.preferences=Array.isArray(out.preferences)?out.preferences:[];out.preferenceWeights=out.preferenceWeights||{};return out;
}
export function validateInputBounds(trip){
  const errors=[];for(const [key,lim] of Object.entries(inputLimits)){const v=Number(trip[key]);if(!Number.isFinite(v))errors.push({code:`INPUT_${key.toUpperCase()}_NOT_NUMBER`,field:key,actual:trip[key],min:lim.min,max:lim.max});else{if(v<lim.min)errors.push({code:`INPUT_${key.toUpperCase()}_BELOW_MIN`,field:key,actual:v,min:lim.min,max:lim.max});if(lim.max!=null&&v>lim.max)errors.push({code:`INPUT_${key.toUpperCase()}_ABOVE_MAX`,field:key,actual:v,min:lim.min,max:lim.max})}}
  for(const [key,values] of Object.entries(enums))if(!values.includes(trip[key]))errors.push({code:`INPUT_${key.toUpperCase()}_ENUM`,field:key,actual:trip[key],allowed:values});return errors;
}

function diagnostic(code,constraint,actual,permitted,reason,solutions=[],extra={}){return{code,constraint,actual,permitted,reason,calculation:extra.calculation||null,day:extra.day||null,night:extra.night||null,closestValidAdjustment:solutions[0]||null,possibleSolutions:solutions,...extra}}
function fail(trip,destination,diag){return{ok:false,failure:diag,canonicalEngine:CANONICAL_ENGINE_ID,trip,destinationId:destination?.id||null}}

function timingForDistance(trip,distanceKm,{roadCharacter='paved',remoteness=0}={}){
  const p=vehicleProfiles[trip.transport]||vehicleProfiles.car;let speed=p.roadSpeed;
  if(roadCharacter==='mixed-gravel')speed*=trip.transport==='motorcycle'?.72:.78; if(roadCharacter==='gravel')speed*=trip.transport==='motorcycle'?.62:.68; speed*=1-Math.min(.18,Number(remoteness||0)*.025);
  const roadHours=Math.max(0,distanceKm/Math.max(25,speed)); const breaks=Math.floor(Math.max(0,roadHours-.01)/p.breakEveryHours)*(p.breakMinutes/60); const elapsed=roadHours+breaks;return{roadHours:round(roadHours,2),driveHours:round(elapsed,2),elapsedHours:round(elapsed,2),breakHours:round(breaks,2)};
}
function preferredDailyDriveHours(trip){const paceTarget={relaxed:2.4,balanced:3,active:3.6}[trip.tripPace]||3;return round(clamp(Math.min(paceTarget,trip.maxDrive*.82),1.2,Math.max(1.2,trip.maxDrive)),2)}
function roadDistance(trip,a,b,meta={}){const p=vehicleProfiles[trip.transport]||vehicleProfiles.car;let factor=p.roadFactor;if(meta.roadCharacter==='gravel'||meta.roadCharacter==='mixed-gravel')factor+=.05;return Math.max(1,Math.round(haversineKm(a,b)*factor))}
function legMetrics(trip,a,b,meta={}){const distanceKm=roadDistance(trip,a,b,meta),timing=timingForDistance(trip,distanceKm,meta);return{distanceKm,...timing}}
function interpolate(a,b,t){const lat=a.lat+(b.lat-a.lat)*t,lon=a.lon+(b.lon-a.lon)*t;return{lat,lon,name:`corridor-${round(t,2)}`}}

function candidateTransit(data,from,to,fraction,used=new Set(),variant=0){
  const target=interpolate(from,to,fraction);const radius=Math.max(180,Math.min(520,haversineKm(from,to)*.34));const nearby=data.nearbyBases(target,radius,30).filter(x=>!used.has(x.id)&&x.id!==from.id&&x.id!==to.id);
  if(!nearby.length)return null;const ranked=nearby.map(x=>{const progress=haversineKm(from,x)/Math.max(1,haversineKm(from,to));const lateral=x.distanceKm;const score=Math.abs(progress-fraction)*1200+lateral+(variant?((String(x.id).charCodeAt(0)+variant*17)%43):0);return{x,score}}).sort((a,b)=>a.score-b.score);return ranked[Math.min(variant,Math.max(0,ranked.length-1))]?.x||ranked[0].x;
}
function transitCandidateRows(data,from,to,fraction,variant=0,{avoidNodeIds=new Set(),avoidCorridorNodes=[],distinctReturn=false}={}){
  const target=interpolate(from,to,fraction),radius=Math.max(180,Math.min(520,haversineKm(from,to)*.34)),total=Math.max(1,haversineKm(from,to));
  const rows=data.nearbyBases(target,radius,90).filter(x=>x.id!==from.id&&x.id!==to.id&&!avoidNodeIds.has(x.id)).map(x=>{
    const progress=haversineKm(from,x)/total,lateral=x.distanceKm,corridorKm=avoidCorridorNodes.length?corridorDistanceKm(x,avoidCorridorNodes):Infinity;
    const distinctBonus=distinctReturn?Math.min(120,corridorKm)*2.6:0;
    const score=Math.abs(progress-fraction)*1200+lateral-distinctBonus+(variant?((String(x.id).length*13+variant*29)%37):0);
    return{p:point(x,{role:'transit',regionId:x.regionId,countryCode:x.countryCode,accommodationZoneId:x.accommodationZoneId,roadCharacter:x.roadCharacter,remoteness:x.remoteness}),progress,score,corridorKm};
  }).filter(x=>x.progress>0.03&&x.progress<.98);
  const distinct=distinctReturn?rows.filter(x=>x.corridorKm>=28):rows;
  return (distinct.length?distinct:rows).sort((a,b)=>a.score-b.score).slice(0,24);
}
function buildRoadPath(trip,data,origin,destinationBase,maxLegs,{variant=0,meta={},forceLegs=null,avoidNodeIds=new Set(),avoidCorridorNodes=[],distinctReturn=false,maxDetourRatio=1.55}={}){
  const direct=legMetrics(trip,origin,destinationBase,meta),minLegs=Math.max(1,Math.ceil(direct.driveHours/Math.max(.25,trip.maxDrive*.96)));
  const changeLegCap=trip.strictChanges?(trip.routeTopology==='open-ended'?Math.max(1,trip.maxChanges+1):Math.max(1,Math.floor(trip.maxChanges/2)+1)):maxLegs;const preferred=trip.tripStructure==='moving'?clamp(Math.ceil(direct.driveHours/preferredDailyDriveHours(trip)),minLegs,Math.min(maxLegs,Math.max(minLegs,changeLegCap))):minLegs;
  const counts=forceLegs!=null?[forceLegs]:[...Array.from({length:maxLegs-preferred+1},(_,i)=>preferred+i),...Array.from({length:Math.max(0,preferred-minLegs)},(_,i)=>minLegs+i)];
  for(const count of counts){
    if(count<minLegs||count>maxLegs)continue;
    if(count===1){if(!trip.strictDrive||direct.driveHours<=trip.maxDrive+.05)return{nodes:[origin,destinationBase],legs:[{from:origin,to:destinationBase,...direct}],direct,minLegs:1};continue}
    const layers=[];for(let i=1;i<count;i++)layers.push(transitCandidateRows(data,origin,destinationBase,i/count,variant,{avoidNodeIds,avoidCorridorNodes,distinctReturn}));if(layers.some(x=>!x.length))continue;
    let states=[{p:origin,progress:0,cost:0,nodes:[origin],legs:[]}];
    for(let li=0;li<layers.length;li++){
      const next=[];for(const cand of layers[li]){let best=null;for(const st of states){if(cand.progress<=st.progress+.025||st.nodes.some(n=>n.id===cand.p.id))continue;const m=legMetrics(trip,st.p,cand.p,{roadCharacter:cand.p.roadCharacter||meta.roadCharacter,remoteness:cand.p.remoteness??meta.remoteness});if(trip.strictDrive&&m.driveHours>trip.maxDrive+.05)continue;const cost=st.cost+cand.score+m.driveHours*8;const row={p:cand.p,progress:cand.progress,cost,nodes:[...st.nodes,cand.p],legs:[...st.legs,{from:st.p,to:cand.p,...m}]};if(!best||row.cost<best.cost)best=row}if(best)next.push(best)}states=next.sort((a,b)=>a.cost-b.cost).slice(0,36);if(!states.length)break}
    let bestFinal=null;for(const st of states){const m=legMetrics(trip,st.p,destinationBase,{roadCharacter:destinationBase.roadCharacter||meta.roadCharacter,remoteness:destinationBase.remoteness??meta.remoteness});if(trip.strictDrive&&m.driveHours>trip.maxDrive+.05)continue;const legs=[...st.legs,{from:st.p,to:destinationBase,...m}],distanceKm=legs.reduce((s,l)=>s+l.distanceKm,0);if(distinctReturn&&distanceKm>direct.distanceKm*maxDetourRatio)continue;const imbalance=Math.abs((legs.reduce((s,l)=>s+l.driveHours,0)/legs.length)-preferredDailyDriveHours(trip));const row={nodes:[...st.nodes,destinationBase],legs,cost:st.cost+m.driveHours*8+imbalance*10,distanceKm};if(!bestFinal||row.cost<bestFinal.cost)bestFinal=row}if(bestFinal)return{nodes:bestFinal.nodes,legs:bestFinal.legs,direct,minLegs:count};
  }
  return null;
}
function ferryAccessPath(trip,data,origin,destinationBase,countryInfo,maxLegs){
  const access=countryInfo?.islandAccess;if(!access)return null;const gateway=point({id:`gateway-${countryInfo.code}`,name:access.gatewayName,lat:access.gatewayLat,lon:access.gatewayLon},{role:'ferry-gateway',countryCode:'gateway'});const arrival=point({id:`arrival-${countryInfo.code}`,name:access.arrivalName,lat:access.arrivalLat,lon:access.arrivalLon},{role:'ferry-arrival',countryCode:countryInfo.code});
  const road=buildRoadPath(trip,data,origin,gateway,Math.max(1,maxLegs-1),{meta:{roadCharacter:'paved',remoteness:0}});if(!road)return null;const ferry={from:gateway,to:arrival,distanceKm:Math.round(haversineKm(gateway,arrival)),roadHours:0,driveHours:0,elapsedHours:Number(access.durationHours||8),breakHours:0,mode:access.mode||'ferry'};const arrivalLeg=legMetrics(trip,arrival,destinationBase,{roadCharacter:'paved',remoteness:0});if(trip.strictDrive&&arrivalLeg.driveHours>trip.maxDrive+.05)return null;return{nodes:[...road.nodes,arrival,destinationBase],legs:[...road.legs,ferry,{from:arrival,to:destinationBase,...arrivalLeg}],direct:road.direct,minLegs:road.legs.length+2,multimodal:true};
}
function selectPath(trip,data,origin,destination,countryInfo,maxLegs,variant=0,forceLegs=null){const base=point(destination.bases[0]||destination.anchor,{role:'destination-base',regionId:destination.id,countryCode:destination.countryCode,accommodationZoneId:(destination.bases[0]||{}).accommodationZoneId,roadCharacter:destination.roadCharacter,remoteness:destination.remoteness});if(destination.island&&origin.countryCode!==destination.countryCode){return ferryAccessPath(trip,data,origin,base,countryInfo,maxLegs)}return buildRoadPath(trip,data,origin,base,maxLegs,{variant,forceLegs,meta:{roadCharacter:destination.roadCharacter,remoteness:destination.remoteness}})}

function singleLegAlternativeReturn(trip,data,from,to,outboundNodes,meta={}){
  const direct=legMetrics(trip,from,to,meta),target=interpolate(from,to,.5),radius=Math.max(170,Math.min(380,haversineKm(from,to)*.6));
  const used=new Set(outboundNodes.map(n=>n.id));const candidates=data.nearbyBases(target,radius,120).filter(x=>x.id!==from.id&&x.id!==to.id&&!used.has(x.id)).map(x=>{
    const via=point(x,{role:'return-via',regionId:x.regionId,countryCode:x.countryCode,roadCharacter:x.roadCharacter,remoteness:x.remoteness});
    const a=legMetrics(trip,from,via,{roadCharacter:via.roadCharacter||meta.roadCharacter,remoteness:via.remoteness??meta.remoteness}),b=legMetrics(trip,via,to,meta),distanceKm=a.distanceKm+b.distanceKm,timing=timingForDistance(trip,distanceKm,meta),corridorKm=corridorDistanceKm(via,outboundNodes),detour=distanceKm/Math.max(1,direct.distanceKm);
    const overlap=routeGeometryOverlapRatio(outboundNodes,[from,via,to],10),score=overlap*120-Math.min(130,corridorKm)*1.4+Math.abs(timing.driveHours-preferredDailyDriveHours(trip))*16+(detour-1)*90;
    return{via,distanceKm,timing,corridorKm,detour,overlap,score};
  }).filter(x=>x.corridorKm>=10&&x.overlap<=allowedLoopOverlap(direct.distanceKm)&&x.detour<=1.5&&(!trip.strictDrive||x.timing.driveHours<=trip.maxDrive+.05)).sort((a,b)=>a.score-b.score);
  const best=candidates[0];if(!best)return null;
  return{nodes:[from,to],legs:[{from,to,waypoints:[best.via],distanceKm:best.distanceKm,...best.timing}],direct,minLegs:1,alternative:true};
}
function shapeShortReturnLeg(trip,data,leg,outboundNodes,avoidIds=new Set(),meta={}){
  const targetHours=preferredDailyDriveHours(trip);if(leg.driveHours>=targetHours*.82)return leg;
  const midpoint=interpolate(leg.from,leg.to,.5),radius=Math.max(150,Math.min(330,haversineKm(leg.from,leg.to)*1.8));
  const candidates=data.nearbyBases(midpoint,radius,100).filter(x=>x.id!==leg.from.id&&x.id!==leg.to.id&&!avoidIds.has(x.id)).map(x=>{
    const via=point(x,{role:'return-via',regionId:x.regionId,countryCode:x.countryCode,roadCharacter:x.roadCharacter,remoteness:x.remoteness});const a=legMetrics(trip,leg.from,via,meta),b=legMetrics(trip,via,leg.to,meta),distanceKm=a.distanceKm+b.distanceKm,timing=timingForDistance(trip,distanceKm,meta),corridorKm=corridorDistanceKm(via,outboundNodes),score=Math.abs(timing.driveHours-targetHours)*20-Math.min(100,corridorKm)*.6+(distanceKm-leg.distanceKm)*.02;return{via,distanceKm,timing,score};
  }).filter(x=>(!trip.strictDrive||x.timing.driveHours<=trip.maxDrive+.05)&&x.timing.driveHours>=targetHours*.72).sort((a,b)=>a.score-b.score);
  const best=candidates[0];return best?{...leg,waypoints:[best.via],distanceKm:best.distanceKm,...best.timing}:leg;
}
function twoLegAlternativeReturn(trip,data,from,to,outboundNodes,meta={}){
  const direct=legMetrics(trip,from,to,meta),mid=interpolate(from,to,.5),radius=Math.max(210,Math.min(520,haversineKm(from,to)*.85)),avoidIds=new Set(outboundNodes.slice(1,-1).map(n=>n.id)),target=preferredDailyDriveHours(trip);
  const candidates=data.nearbyBases(mid,radius,140).filter(x=>x.id!==from.id&&x.id!==to.id&&!avoidIds.has(x.id));let best=null,overlapLimit=allowedLoopOverlap(direct.distanceKm);
  for(const x of candidates){const via=point(x,{role:'transit',regionId:x.regionId,countryCode:x.countryCode,accommodationZoneId:x.accommodationZoneId,roadCharacter:x.roadCharacter,remoteness:x.remoteness});let a={from,to:via,...legMetrics(trip,from,via,meta)},b={from:via,to,...legMetrics(trip,via,to,meta)};if(trip.strictDrive&&(a.driveHours>trip.maxDrive+.05||b.driveHours>trip.maxDrive+.05))continue;a=shapeShortReturnLeg(trip,data,a,outboundNodes,new Set([...avoidIds,via.id]),meta);b=shapeShortReturnLeg(trip,data,b,outboundNodes,new Set([...avoidIds,via.id,...(a.waypoints||[]).map(w=>w.id)]),meta);const distanceKm=a.distanceKm+b.distanceKm;if(distanceKm>direct.distanceKm*1.5)continue;const geometry=[from,...(a.waypoints||[]),via,...(b.waypoints||[]),to],overlap=routeGeometryOverlapRatio(outboundNodes,geometry,10);if(overlap>overlapLimit)continue;const balance=Math.abs(a.driveHours-target)+Math.abs(b.driveHours-target),detour=distanceKm/Math.max(1,direct.distanceKm),score=balance*3+overlap*6+(detour-1)*4;if(!best||score<best.score)best={nodes:[from,via,to],legs:[a,b],direct,minLegs:2,alternative:true,overlap,score};}
  return best;
}
function graphAlternativeReturn(trip,data,outbound,destination,origin,meta={}){
  const from=outbound.nodes.at(-1),to=origin,legCount=outbound.legs.length;if(legCount<2)return null;
  const direct=legMetrics(trip,from,to,meta),directHav=Math.max(1,haversineKm(from,to)),target=preferredDailyDriveHours(trip),country=from.countryCode||to.countryCode||destination.countryCode,outboundIds=new Set(outbound.nodes.slice(1,-1).map(n=>n.id));
  const pool=(data.index?.baseIndex||[]).filter(x=>x.id!==from.id&&x.id!==to.id&&(!country||x.countryCode===country)).filter(x=>haversineKm(from,x)+haversineKm(x,to)<=directHav*2.35+120).map(x=>point(x,{role:'transit',regionId:x.regionId,countryCode:x.countryCode,accommodationZoneId:x.accommodationZoneId,roadCharacter:x.roadCharacter,remoteness:x.remoteness}));
  let states=[{p:from,nodes:[from],legs:[],score:0,distanceKm:0}];
  for(let step=1;step<legCount;step++){
    const remaining=legCount-step,next=[];
    for(const st of states){for(const cand of pool){if(st.nodes.some(n=>n.id===cand.id))continue;const edge=legMetrics(trip,st.p,cand,{roadCharacter:cand.roadCharacter||meta.roadCharacter,remoteness:cand.remoteness??meta.remoteness});if(trip.strictDrive&&edge.driveHours>trip.maxDrive+.05)continue;const finalDirect=legMetrics(trip,cand,to,meta);if(Math.ceil(finalDirect.driveHours/Math.max(.25,trip.maxDrive*.96))>remaining)continue;const prevRemain=haversineKm(st.p,to),newRemain=haversineKm(cand,to),backtrack=newRemain>prevRemain*1.2?4:0,shared=outboundIds.has(cand.id)?2.8:0,separation=corridorDistanceKm(cand,outbound.nodes);const score=st.score+Math.abs(edge.driveHours-target)*1.4+backtrack+shared-Math.min(140,separation)/55;next.push({p:cand,nodes:[...st.nodes,cand],legs:[...st.legs,{from:st.p,to:cand,...edge}],score,distanceKm:st.distanceKm+edge.distanceKm})}}
    states=next.sort((a,b)=>a.score-b.score).slice(0,120);if(!states.length)return null;
  }
  const detourLimit=Number(destination.remoteness||0)>=3?2.15:1.75;let best=null;
  for(const st of states){const edge=legMetrics(trip,st.p,to,meta);if(trip.strictDrive&&edge.driveHours>trip.maxDrive+.05)continue;const legs=[...st.legs,{from:st.p,to,...edge}],nodes=[...st.nodes,to],distanceKm=st.distanceKm+edge.distanceKm;if(distanceKm>direct.distanceKm*detourLimit)continue;const overlap=routeGeometryOverlapRatio(outbound.nodes,nodes,10),limit=allowedLoopOverlap(direct.distanceKm);if(overlap>limit)continue;const balance=legs.reduce((s,l)=>s+Math.abs(l.driveHours-target),0),score=st.score+balance+overlap*8+(distanceKm/direct.distanceKm-1)*3;if(!best||score<best.score)best={nodes,legs,direct,minLegs:legCount,alternative:true,overlap,score};}
  return best;
}
function buildAlternativeReturnPath(trip,data,outbound,destination,origin){
  if(trip.routeTopology!=='loop')return null;
  const from=outbound.nodes.at(-1),legCount=outbound.legs.length,avoidNodeIds=new Set(outbound.nodes.slice(1,-1).map(n=>n.id)),meta={roadCharacter:destination.roadCharacter,remoteness:destination.remoteness};
  if(legCount===1)return singleLegAlternativeReturn(trip,data,from,origin,outbound.nodes,meta);
  if(legCount===2){const candidate=twoLegAlternativeReturn(trip,data,from,origin,outbound.nodes,meta);if(candidate)return candidate;}
  for(const variant of [2,4,6,8,10]){
    const candidate=buildRoadPath(trip,data,from,origin,legCount,{variant,meta,forceLegs:legCount,avoidNodeIds,avoidCorridorNodes:outbound.nodes,distinctReturn:true,maxDetourRatio:1.5});
    if(!candidate)continue;
    const outGeom=outbound.nodes,retGeom=candidate.nodes;const overlap=routeGeometryOverlapRatio(outGeom,retGeom,10);
    if(overlap<=allowedLoopOverlap(candidate.direct.distanceKm))return{...candidate,alternative:true,overlap};
  }
  return graphAlternativeReturn(trip,data,outbound,destination,origin,meta);
}

function routeMetrics(trip,geometry,destination){let distanceKm=0;for(let i=0;i<geometry.length-1;i++)distanceKm+=roadDistance(trip,geometry[i],geometry[i+1],{roadCharacter:destination.roadCharacter});return{distanceKm:Math.round(distanceKm),...timingForDistance(trip,distanceKm,{roadCharacter:destination.roadCharacter,remoteness:destination.remoteness})}}
function localLoop(trip,destination,base,index,dayNumber,data,targetHours=preferredDailyDriveHours(trip)){
  const core=[...(destination.pois||[]).map(p=>({...p,_kind:'poi'})),...(destination.scenicAnchors||[]).map(p=>({...p,_kind:'scenic'})),...(destination.bases||[]).map(p=>({...p,_kind:'base'}))].filter(validCoordinate).filter(p=>haversineKm(base,p)>1);
  const nearby=(data?.nearbyBases?.(base,Math.max(90,targetHours*45),28)||[]).filter(p=>p.id!==base.id).map(p=>({...p,_kind:'route-place'}));
  const dedup=new Map();for(const p of [...core,...nearby]){const key=p.id||`${String(p.name).toLowerCase()}:${round(p.lat,3)},${round(p.lon,3)}`;if(!dedup.has(key))dedup.set(key,p)}
  let candidates=[...dedup.values()];if(!candidates.length)return null;
  candidates.sort((a,b)=>{const ac=a.countryCode===destination.countryCode?0:1,bc=b.countryCode===destination.countryCode?0:1;if(ac!==bc)return ac-bc;const ar=a.regionId===destination.id?0:1,br=b.regionId===destination.id?0:1;if(ar!==br)return ar-br;return haversineKm(base,a)-haversineKm(base,b)});
  const rotate=index%candidates.length;candidates=candidates.slice(rotate).concat(candidates.slice(0,rotate));
  const toPoint=c=>point(c,{role:c._kind==='route-place'||c._kind==='base'?'route-place':'poi',poiId:c._kind==='poi'||c._kind==='scenic'?c.id:null,regionId:c.regionId||destination.id,countryCode:c.countryCode||destination.countryCode,accommodationZoneId:c.accommodationZoneId||null});
  let chosen=[];let current=routeMetrics(trip,[base,base],destination);const remaining=[...candidates];
  const preferredFirst=Math.max(0,remaining.findIndex(c=>c._kind==='poi'));if(preferredFirst>=0){const c=remaining.splice(preferredFirst,1)[0],geom=[base,toPoint(c),base],m=routeMetrics(trip,geom,destination);if(!trip.strictDrive||m.driveHours<=trip.maxDrive+.05){chosen=[c];current=m}}
  while(remaining.length){let best=null;for(let ri=0;ri<remaining.length;ri++){const c=remaining[ri];for(let pos=0;pos<=chosen.length;pos++){const proposed=[...chosen.slice(0,pos),c,...chosen.slice(pos)],geom=[base,...proposed.map(toPoint),base],m=routeMetrics(trip,geom,destination);if(trip.strictDrive&&m.driveHours>trip.maxDrive+.05)continue;const before=Math.abs(targetHours-current.driveHours),after=Math.abs(targetHours-m.driveHours),kindPenalty=c._kind==='route-place'?.04:0,countryPenalty=c.countryCode&&c.countryCode!==destination.countryCode?1.2:0,regionPenalty=c.regionId&&c.regionId!==destination.id?.05:0;const score=after+kindPenalty+countryPenalty+regionPenalty;if((chosen.length<2||after<before-.03)&&(!best||score<best.score))best={ri,pos,c,proposed,m,score}}}if(!best)break;chosen=best.proposed;current=best.m;remaining.splice(best.ri,1);if(current.driveHours>=targetHours*.94)break}
  if(!chosen.length){const c=candidates[0],geom=[base,toPoint(c),base],m=routeMetrics(trip,geom,destination);if(trip.strictDrive&&m.driveHours>trip.maxDrive+.05)return null;chosen=[c];current=m}
  const geom=[base,...chosen.map(toPoint),base],offlinePois=chosen.filter(c=>c._kind==='poi'||c._kind==='scenic').map(c=>{const x={...c};delete x._kind;return clone(x)});const timing=routeMetrics(trip,geom,destination);if(trip.strictDrive&&timing.driveHours>trip.maxDrive+.05)return null;return{kind:'daytrip',typeLabel:'Gebalanceerde lokale dagrit',from:base.name,to:base.name,fromPoint:base,toPoint:base,location:chosen.map(x=>x.name).join(' · '),geometry:geom,waypoints:chosen.map(toPoint),offlinePois,distanceKm:timing.distanceKm,roadHours:timing.roadHours,driveHours:timing.driveHours,elapsedHours:timing.elapsedHours,breakHours:timing.breakHours,routeSource:'offline-estimate',canonicalRegionId:destination.id,day:dayNumber,date:addDays(trip.startDate,dayNumber-1),primaryPlan:`Rijd een gebalanceerde toerlus vanuit ${base.name} via ${chosen.map(x=>x.name).join(', ')}. Richtduur ongeveer ${round(targetHours,1)} uur.`};
}
function travelDay(trip,leg,dayNumber,destinationId,kind='transfer'){
  const mode=leg.mode||'road',waypoints=(leg.waypoints||[]).map(x=>point(x,{role:x.role||'route-place',regionId:x.regionId||null,countryCode:x.countryCode||null}));return{kind:kind==='return'?'return':kind==='outward'?'outward':'transfer',typeLabel:kind==='return'?'Terugreis':kind==='outward'?'Heenreis':'Transit',from:leg.from.name,to:leg.to.name,fromPoint:leg.from,toPoint:leg.to,location:[...waypoints.map(x=>x.name),leg.to.name].join(' · '),geometry:[leg.from,...waypoints,leg.to],waypoints,offlinePois:[],distanceKm:leg.distanceKm,roadHours:leg.roadHours,driveHours:leg.driveHours,elapsedHours:leg.elapsedHours,breakHours:leg.breakHours,routeSource:mode==='road'?'offline-estimate':'offline-multimodal-estimate',routePreference:kind==='return'&&trip.routeTopology==='loop'?'alternative-return':trip.routeStyle,transportMode:mode,canonicalRegionId:leg.to.regionId===destinationId?destinationId:null,day:dayNumber,date:addDays(trip.startDate,dayNumber-1),primaryPlan:mode==='road'?`Rijd van ${leg.from.name}${waypoints.length?` via ${waypoints.map(x=>x.name).join(', ')}`:''} naar ${leg.to.name}.`:`Neem de ${mode} van ${leg.from.name} naar ${leg.to.name}.`};
}

function localTransferDay(trip,destination,from,to,dayNumber,label='Lokale verplaatsing'){
  const m=legMetrics(trip,from,to,{roadCharacter:destination.roadCharacter,remoteness:destination.remoteness});
  if(trip.strictDrive&&m.driveHours>trip.maxDrive+.05)return null;
  return{kind:'transfer',typeLabel:label,from:from.name,to:to.name,fromPoint:from,toPoint:to,location:to.name,geometry:[from,to],waypoints:[],offlinePois:[],distanceKm:m.distanceKm,...m,routeSource:'offline-estimate',transportMode:'road',canonicalRegionId:destination.id,day:dayNumber,date:addDays(trip.startDate,dayNumber-1),primaryPlan:`Verplaats de uitvalsbasis binnen ${destination.name} van ${from.name} naar ${to.name}.`};
}
function restDay(trip,destination,base,index,dayNumber){const p=(destination.pois||[])[index%(destination.pois||[]).length]||destination.anchor;const dest=point(p,{role:'poi',poiId:p.id});const distanceKm=Math.max(4,Math.round(roadDistance(trip,base,dest,{roadCharacter:destination.roadCharacter})*2*.35));const timing=timingForDistance(trip,distanceKm,{roadCharacter:destination.roadCharacter});return{kind:'rest',typeLabel:'Rustige lokale dag',from:base.name,to:base.name,fromPoint:base,toPoint:base,location:p.name,geometry:[base,dest,base],waypoints:[dest],offlinePois:[clone(p)],distanceKm,...timing,routeSource:'offline-estimate',canonicalRegionId:destination.id,day:dayNumber,date:addDays(trip.startDate,dayNumber-1),primaryPlan:`Rustige dag rond ${base.name} met ${p.name} als optionele korte uitstap.`}}

function accommodationZoneForPoint(destination,p){
  const exact=(destination.accommodationZones||[]).find(z=>z.id===p.accommodationZoneId)||(destination.accommodationZones||[]).find(z=>haversineKm(z,p)<25);if(exact)return exact;return{id:p.accommodationZoneId||`transit-zone-${p.id}`,name:p.name,lat:p.lat,lon:p.lon,preferredRadiusKm:20,types:['any','camping','hotel-bnb'],fallbackZoneIds:[],regionId:p.regionId||null,countryCode:p.countryCode||null};
}
function buildOvernights(trip,destination,days){const nights=[];for(let i=0;i<Math.max(0,days.length-1);i++){const day=days[i],p=day.toPoint,zone=accommodationZoneForPoint(destination,p),searchQuery=encodeURIComponent(`${zone.name} ${trip.accommodationType==='camping'?'camping':trip.accommodationType==='hotel-bnb'?'hotel B&B':'accommodation'}`);nights.push({night:i+1,afterDay:day.day,canonicalZoneId:zone.id,canonicalOvernightName:zone.name,state:'PLANNED_ACCOMMODATION_ZONE',zone:clone(zone),acceptedAccommodationType:trip.accommodationType,externalSearchUrl:`https://www.openstreetmap.org/search?query=${searchQuery}`,property:null,source:'offline-catalog'})}return nights}
function countChanges(nights){let n=0;for(let i=1;i<nights.length;i++)if(nights[i].canonicalZoneId!==nights[i-1].canonicalZoneId)n++;return n}
function budgetEstimate(trip,days){const km=days.reduce((s,d)=>s+(Number(d.distanceKm)||0),0),people=trip.adults+trip.children*.6;const accomRate={budget:70,mid:115,comfort:175}[trip.comfort]||115;const accomTypeFactor=trip.accommodationType==='camping'?.48:1;const nights=Math.max(0,trip.days-1),accommodation=Math.round(nights*accomRate*accomTypeFactor*Math.max(1,Math.ceil(people/2.5)));const food=Math.round(trip.days*people*({budget:25,mid:42,comfort:62}[trip.comfort]||42));const fuelRate={car:.17,motorcycle:.11,motorhome:.24,caravan:.27}[trip.transport]||.17;const transport=Math.round(km*fuelRate);const activities=Math.round(trip.days*people*15);return{total:accommodation+food+transport+activities,accommodation,food,transport,activities,distanceKm:Math.round(km)}}
function signature(plan){return{engine:plan.canonicalEngine,dayCount:plan.days.length,destinationId:plan.destinationId,originId:plan.origin.id,topology:plan.topology,structure:plan.structure,days:plan.days.map(d=>({day:d.day,kind:d.kind,phase:d.journeyPhase||null,fromId:d.fromPoint.id,toId:d.toPoint.id,waypointIds:(d.waypoints||[]).map(w=>w.id),regionId:d.canonicalRegionId||null})),nights:plan.overnights.map(n=>({night:n.night,canonicalZoneId:n.canonicalZoneId}))}}
export function canonicalSignature(plan){return JSON.stringify(signature(plan))}

export function createCanonicalPlan(rawTrip,destination,data){
  const trip=normalizeTripInput(rawTrip);const inputErrors=validateInputBounds(trip);if(inputErrors.length)return fail(trip,destination,diagnostic(inputErrors[0].code,inputErrors[0].field,inputErrors[0].actual,{min:inputErrors[0].min,max:inputErrors[0].max},'Input valt buiten de geïmplementeerde grens.',[`Pas ${inputErrors[0].field} aan binnen de toegestane grens.`],{inputErrors}));
  const originRaw=data.resolveOrigin(trip.origin);if(!originRaw)return fail(trip,destination,diagnostic('ORIGIN_NOT_IN_OFFLINE_CATALOG','origin',trip.origin,'offline known place or lat,lon','Vertrekpunt kon offline niet betrouwbaar worden herleid.', ['Kies een bekende plaats uit de offline catalogus.','Voer het vertrekpunt in als breedtegraad,lengtegraad.']));
  const origin=point(originRaw,{role:'origin',countryCode:originRaw.countryCode||null});if(!destination||!validCoordinate(destination.anchor))return fail(trip,destination,diagnostic('DESTINATION_NOT_IN_OFFLINE_CATALOG','destination',trip.destinationQuery,'offline destination region','Bestemming ontbreekt in de verpakte reiskennis.',['Kies een offline regio uit de zoekresultaten.']));
  const countryInfo=data.countryInfo(destination.countryCode);const closed=trip.routeTopology!=='open-ended';
  if(trip.days===1){
    const base=point(destination.bases[0]||destination.anchor,{role:'destination-base',regionId:destination.id,countryCode:destination.countryCode,accommodationZoneId:(destination.bases[0]||{}).accommodationZoneId});const m=legMetrics(trip,origin,base,{roadCharacter:destination.roadCharacter,remoteness:destination.remoteness});const total=closed?{distanceKm:m.distanceKm*2,...timingForDistance(trip,m.distanceKm*2,{roadCharacter:destination.roadCharacter,remoteness:destination.remoteness})}:m;if(trip.strictDrive&&total.driveHours>trip.maxDrive+.05)return fail(trip,destination,diagnostic('MAX_DRIVE_DAY_1','maxDrive',total.driveHours,trip.maxDrive,`Kortste offline schatting voor dag 1 is ${round(total.driveHours,1)} uur.`,[`Verhoog max reistijd naar minstens ${Math.ceil(total.driveHours*2)/2} uur.`,`Kies een dichterbij gelegen bestemming.`,`Voeg reisdag(en) toe.`],{calculation:`${total.distanceKm} km geschat / voertuigprofiel + pauzes`}));const day=closed?{kind:'daytrip',typeLabel:'Dagtrip',from:origin.name,to:origin.name,fromPoint:origin,toPoint:origin,location:base.name,geometry:[origin,base,origin],waypoints:[base],offlinePois:(destination.pois||[]).slice(0,2),distanceKm:total.distanceKm,roadHours:total.roadHours,driveHours:total.driveHours,elapsedHours:total.elapsedHours,breakHours:total.breakHours,routeSource:'offline-estimate',canonicalRegionId:destination.id,day:1,date:trip.startDate,primaryPlan:`Dagtrip naar ${destination.name} en terug.`}:travelDay(trip,{from:origin,to:base,...m},1,destination.id,'outward');const plan=finalizePlan(trip,destination,origin,[day]);return{ok:true,plan};
  }
  const maximumOutboundLegs=closed?Math.max(1,Math.floor(trip.days/2)):trip.days;let path=selectPath(trip,data,origin,destination,countryInfo,maximumOutboundLegs,0);if(!path){const direct=legMetrics(trip,origin,point(destination.anchor),{roadCharacter:destination.roadCharacter,remoteness:destination.remoteness});return fail(trip,destination,diagnostic('MAX_DRIVE_TRANSIT_GAP','maxDrive',direct.driveHours,trip.maxDrive,'Geen reeks echte offline transitplaatsen kon alle rijdagen binnen de ingestelde limiet houden.',['Verhoog de dagelijkse reistijd.','Voeg meer reisdag(en) toe.','Kies een dichterbij gelegen bestemming.'],{calculation:`Directe offline schatting ${direct.distanceKm} km / ${round(direct.driveHours,1)} uur`}));}
  let preparedReturnPath=null;const distinctReturnRequired=trip.routeTopology==='loop'&&haversineKm(origin,path.nodes.at(-1))>=80;
  if(closed&&distinctReturnRequired){
    preparedReturnPath=buildAlternativeReturnPath(trip,data,path,destination,origin);
    if(!preparedReturnPath){
      for(let forced=path.legs.length+1;forced<=maximumOutboundLegs;forced++){
        const alternateOutbound=selectPath(trip,data,origin,destination,countryInfo,maximumOutboundLegs,0,forced);if(!alternateOutbound)continue;
        const alternateReturn=buildAlternativeReturnPath(trip,data,alternateOutbound,destination,origin);if(!alternateReturn)continue;
        path=alternateOutbound;preparedReturnPath=alternateReturn;break;
      }
    }
    if(!preparedReturnPath)return fail(trip,destination,diagnostic('ALTERNATIVE_RETURN_NOT_FEASIBLE','routeTopology','loop','materially different return corridor',`Met de huidige daglimiet en beschikbare offline transitplaatsen kon geen voldoende afwijkende terugroute worden opgebouwd.`,['Verhoog de maximale reistijd per dag.','Voeg een reisdag toe.','Kies “heen & terug — dezelfde route” als je dezelfde corridor accepteert.'],{calculation:'Return corridor must avoid outbound transit points, remain within the detour guard, and pass the route-overlap gate.'}));
  }
  const outboundDays=path.legs.length,returnDays=closed?path.legs.length:0,minDays=outboundDays+returnDays;if(trip.days<minDays)return fail(trip,destination,diagnostic('INSUFFICIENT_DAYS_FOR_DISTANCE','days',trip.days,minDays,`De bestemming vereist minstens ${minDays} kalenderdagen met de huidige rijtijdlimiet.`,[`Verhoog reisduur naar minstens ${minDays} dagen.`,`Verhoog max reistijd per dag.`],{calculation:`${outboundDays} etappe(s) heen${closed?` + ${returnDays} terug`:''}`}));
  const days=[];let dayNo=1;for(let i=0;i<path.legs.length;i++){const d=travelDay(trip,path.legs[i],dayNo++,destination.id,i===0?'outward':'transfer');d.journeyPhase='outbound';days.push(d)}
  const localSlots=trip.days-minDays;const primaryBase=point(destination.bases[0]||destination.anchor,{role:'destination-base',regionId:destination.id,countryCode:destination.countryCode,accommodationZoneId:(destination.bases[0]||{}).accommodationZoneId,roadCharacter:destination.roadCharacter,remoteness:destination.remoteness});let currentBase=primaryBase;
  const transitChangeEstimate=Math.max(0,2*Math.max(0,path.legs.filter(l=>!l.mode||l.mode==='road').length-1));
  const altRaw=destination.bases[1]||null;const alternateBase=altRaw?point(altRaw,{role:'destination-base',regionId:destination.id,countryCode:destination.countryCode,accommodationZoneId:altRaw.accommodationZoneId,roadCharacter:destination.roadCharacter,remoteness:destination.remoteness}):null;
  const movingPair=trip.tripStructure==='moving'&&alternateBase&&localSlots>=3&&(!trip.strictChanges||trip.maxChanges>=transitChangeEstimate+2);
  for(let i=0;i<localSlots;i++){
    let d;
    if(movingPair&&i===0){d=localTransferDay(trip,destination,currentBase,alternateBase,dayNo,'Verplaatsingsdag');currentBase=alternateBase}
    else if(movingPair&&i===localSlots-1){d=localTransferDay(trip,destination,currentBase,primaryBase,dayNo,'Terug naar hoofdbasis');currentBase=primaryBase}
    else if(i>0&&i%5===4&&trip.tripStructure!=='moving')d=restDay(trip,destination,currentBase,i,dayNo);else d=localLoop(trip,destination,currentBase,i,dayNo,data,preferredDailyDriveHours(trip));
    if(!d)return fail(trip,destination,diagnostic('LOCAL_DAY_EXCEEDS_DRIVE','maxDrive',null,trip.maxDrive,`Geen lokale dag in ${destination.name} past binnen de ingestelde rijtijd.`,['Verhoog de rijtijdlimiet.','Kies een andere bestemming.'],{day:dayNo}));d.journeyPhase='destination';days.push(d);dayNo++;
  }
  if(closed){
    let returnPath=preparedReturnPath;
    if(!returnPath){const reversed=path.legs.slice().reverse().map(l=>({from:l.to,to:l.from,waypoints:[...(l.waypoints||[])].reverse(),distanceKm:l.distanceKm,roadHours:l.roadHours,driveHours:l.driveHours,elapsedHours:l.elapsedHours,breakHours:l.breakHours,mode:l.mode}));returnPath={nodes:[...path.nodes].reverse(),legs:reversed};}
    for(let i=0;i<returnPath.legs.length;i++){const d=travelDay(trip,returnPath.legs[i],dayNo++,destination.id,i===returnPath.legs.length-1?'return':'transfer');d.journeyPhase='return';if(distinctReturnRequired)d.routePreference='alternative-return';days.push(d)}
  }
  const plan=finalizePlan(trip,destination,origin,days);if(trip.strictChanges&&plan.accommodationChanges>trip.maxChanges)return fail(trip,destination,diagnostic('MAX_ACCOMMODATION_CHANGES','maxChanges',plan.accommodationChanges,trip.maxChanges,`De minimale overnachtingsreeks vraagt ${plan.accommodationChanges} wissels.`,[`Verhoog max accommodatiewissels naar ${plan.accommodationChanges}.`,`Voeg meer nachten aan dezelfde tussenstop toe.`,`Kies een dichterbij gelegen bestemming.`],{calculation:plan.overnights.map(n=>n.canonicalOvernightName).join(' → ')}));if(trip.strictBudget&&plan.budget.total>trip.budget)return fail(trip,destination,diagnostic('BUDGET_LIMIT','budget',plan.budget.total,trip.budget,`Offline budgetraming is €${plan.budget.total}.`,[`Verhoog budget naar ongeveer €${Math.ceil(plan.budget.total/100)*100}.`,`Kies camping/budgetcomfort.`,`Kies een dichterbij gelegen bestemming.`],{calculation:JSON.stringify(plan.budget)}));if(Number(destination.fuelGapKm||0)>trip.fuelRangeKm)return fail(trip,destination,diagnostic('FUEL_RANGE_REGION','fuelRangeKm',trip.fuelRangeKm,destination.fuelGapKm,`${destination.name} bevat offline een bekende service-/brandstofafstand tot ongeveer ${destination.fuelGapKm} km.`,[`Gebruik een voertuig/route met minimaal ${destination.fuelGapKm} km bereik.`,`Plan extra brandstofvoorziening waar wettelijk en veilig toegestaan.`]));return{ok:true,plan};
}
function finalizePlan(trip,destination,origin,days){
  days.forEach((d,i)=>{d.day=i+1;d.date=addDays(trip.startDate,i)});const overnights=buildOvernights(trip,destination,days),accommodationChanges=countChanges(overnights),offlinePois=[...new Map([...(destination.pois||[]),...days.flatMap(d=>d.offlinePois||[])].map(p=>[p.id,p])).values()];const budget=budgetEstimate(trip,days);const driveValues=days.filter(d=>d.transportMode!=='ferry').map(d=>Number(d.driveHours)||0),driveMean=driveValues.length?driveValues.reduce((a,b)=>a+b,0)/driveValues.length:0,driveSpread=driveValues.length?Math.max(...driveValues)-Math.min(...driveValues):0;const plan={canonicalEngine:CANONICAL_ENGINE_ID,canonicalVersion:1,createdAt:new Date().toISOString(),trip:clone(trip),origin,destinationId:destination.id,destinationName:destination.name,destinationCountryCode:destination.countryCode,topology:trip.routeTopology,structure:trip.tripStructure,days,overnights,offlinePois,scenicAnchors:clone(destination.scenicAnchors||[]),accommodationChanges,budget,driveBalance:{preferredDailyHours:preferredDailyDriveHours(trip),meanDailyHours:round(driveMean,2),spreadHours:round(driveSpread,2)},routing:{status:'estimated',source:'offline'},enrichment:{routing:'pending',pois:'offline-only',accommodation:'zones-only',weather:'pending',images:'pending'},validation:null,datasetRegionSnapshot:{id:destination.id,name:destination.name,countryCode:destination.countryCode,fuelGapKm:destination.fuelGapKm,roadCharacter:destination.roadCharacter,vehicleSuitability:destination.vehicleSuitability}};plan.canonicalSignature=canonicalSignature(plan);return plan}
