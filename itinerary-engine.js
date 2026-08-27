import { validCoordinate } from './config.js';
import { buildBreakWaypoints, buildTravelNodes, haversineKm, segmentMetrics } from './route-engine.js';
import { buildRecommendations } from './recommendation-engine.js';
import { estimateLegTiming, transportId, travelGuidance } from './vehicle-intelligence.js';
import { applyDaySchedules, solveDayAllocation } from './plan-solver.js';
import { buildAlternativeReturnNodes, routeExplorationMetrics } from './route-topology.js';

export function addDays(dateString,amount){const date=new Date(`${dateString}T12:00:00`);date.setDate(date.getDate()+amount);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function labelFor(kind){return({outward:'Heenreis',return:'Terugreis',transfer:'Bestemmingstransfer',stay:'Verblijfsdag',flex:'Flexibele rustdag'})[kind]}
function chooseActivities(trip,destination){return[...(destination.activities||[])].sort((a,b)=>{const score=item=>(item.tags||[]).reduce((sum,tag)=>sum+(trip.preferences.includes(tag)?(trip.preferenceWeights[tag]||2):0),0);return score(b)-score(a)||(a.title||'').localeCompare(b.title||'','nl')})}
function makeTravelDay(kind,from,to,route,trip){const base=segmentMetrics(from,to,route.oneWayDistanceKm,route.oneWayRoadHours),timing=estimateLegTiming(trip,{...base,arrival:to.role!=='return'}),waypoints=buildBreakWaypoints(from,to,timing,trip.transport);return{kind,typeLabel:labelFor(kind),from:from.name,to:to.name,location:to.name,fromPoint:{...from},toPoint:{...to},overnight:to.name,distanceKm:base.distanceKm,roadHours:timing.roadHours,driveHours:timing.elapsedHours,elapsedHours:timing.elapsedHours,breakHours:timing.breakHours,restStops:timing.restStops,fuelStops:timing.fuelStops,stopCount:timing.stopCount,waypoints,geometry:[{...from},...waypoints,{...to}],routeSource:'estimated-corridor',primaryPlan:`Rijd van ${from.name} naar ${to.name}. ${travelGuidance(trip,timing)}`,rainAlternative:'Pas pauzes en vertrektijd aan bij slecht weer.',exceedsDailyLimit:timing.elapsedHours>trip.maxDrive+.05}}
function localTransfer(from,to,trip){const direct=haversineKm(from,to)||0,distanceKm=Math.max(5,Math.round(direct*1.25)),speeds={car:52,motorcycle:50,motorhome:46,caravan:43},roadHours=Number((distanceKm/speeds[transportId(trip.transport)]).toFixed(1)),timing=estimateLegTiming(trip,{distanceKm,roadHours,arrival:true}),waypoints=buildBreakWaypoints(from,to,timing,trip.transport);return{distanceKm,roadHours:timing.roadHours,driveHours:timing.elapsedHours,elapsedHours:timing.elapsedHours,breakHours:timing.breakHours,restStops:timing.restStops,fuelStops:timing.fuelStops,stopCount:timing.stopCount,waypoints,geometry:[{...from},...waypoints,{...to}],routeSource:'estimated-corridor'}}
function buildStayDays(trip,destination,count,startBase=0){const days=[],activities=chooseActivities(trip,destination),bases=destination.bases||[],allowSecond=count>=4&&bases.length>1&&trip.maxChanges>1;let baseIndex=Math.min(startBase,Math.max(0,bases.length-1));for(let index=0;index<count;index++){const shouldTransfer=allowSecond&&baseIndex===0&&index===Math.ceil(count/2);if(shouldTransfer){const from=bases[0],to=bases[1],metrics=localTransfer(from,to,trip);days.push({kind:'transfer',typeLabel:labelFor('transfer'),from:from.name,to:to.name,location:to.name,fromPoint:{...from,role:'destination'},toPoint:{...to,role:'destination'},overnight:to.name,...metrics,primaryPlan:`Verplaats de uitvalsbasis van ${from.name} naar ${to.name}.`,rainAlternative:'Rijd rechtstreeks naar de nieuwe accommodatie.'});baseIndex=1;continue}const base=bases[baseIndex]||bases[0],flexible=count>=4&&index===Math.floor(count/2)&&!shouldTransfer,activity=activities[index%Math.max(1,activities.length)]||{type:'rust',title:'Verken de omgeving',rainAlternative:'Rustige binnenactiviteit'};days.push({kind:flexible?'flex':'stay',typeLabel:labelFor(flexible?'flex':'stay'),from:base.name,to:base.name,location:base.name,fromPoint:{...base,role:'destination'},toPoint:{...base,role:'destination'},overnight:base.name,distanceKm:flexible?15:35,driveHours:flexible?.3:.7,roadHours:flexible?.3:.7,elapsedHours:flexible?.3:.7,breakHours:0,waypoints:[],geometry:[{...base}],routeSource:'local-estimate',activityType:flexible?'rust':activity.type,primaryPlan:flexible?'Houd deze dag bewust vrij voor herstel en één korte lokale activiteit.':activity.title,rainAlternative:flexible?'Gebruik als volledige hersteldag.':activity.rainAlternative})}return days}

function destinationBearing(from,to){
  if(!validCoordinate(from)||!validCoordinate(to))return 0;
  const rad=value=>value*Math.PI/180;
  const y=Math.sin(rad(to.lon-from.lon))*Math.cos(rad(to.lat));
  const x=Math.cos(rad(from.lat))*Math.sin(rad(to.lat))-Math.sin(rad(from.lat))*Math.cos(rad(to.lat))*Math.cos(rad(to.lon-from.lon));
  return(Number(Math.atan2(y,x)*180/Math.PI)+360)%360;
}
function destinationPoint(from,bearingDeg,distanceKm){
  const R=6371,a=distanceKm/R,b=bearingDeg*Math.PI/180,lat1=from.lat*Math.PI/180,lon1=from.lon*Math.PI/180;
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b));
  const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));
  return{lat:Number((lat2*180/Math.PI).toFixed(6)),lon:Number((((lon2*180/Math.PI+540)%360)-180).toFixed(6))};
}
function makeExplorationNode(base,index,bearing,distanceKm,destination){
  const point=destinationPoint(base,bearing,distanceKm);
  return{...point,name:`Roadtripstop ${index+1}`,role:'destination',generatedExploration:true,landValidated:false,explorationIndex:index,explorationAnchor:destination.name||base.name||'bestemming'};
}
function makeLocalStay(base,index,count,activities){
  const flexible=count>=4&&index===Math.floor(count/2);
  const activity=activities[index%Math.max(1,activities.length)]||{type:'rust',title:'Verken de omgeving',rainAlternative:'Rustige binnenactiviteit'};
  return{kind:flexible?'flex':'stay',typeLabel:labelFor(flexible?'flex':'stay'),from:base.name,to:base.name,location:base.name,fromPoint:{...base},toPoint:{...base},overnight:base.name,distanceKm:flexible?15:35,driveHours:flexible?.3:.7,roadHours:flexible?.3:.7,elapsedHours:flexible?.3:.7,breakHours:0,waypoints:[],geometry:[{...base}],routeSource:'local-estimate',activityType:flexible?'rust':activity.type,primaryPlan:flexible?'Houd deze dag bewust vrij voor herstel en één korte lokale activiteit.':activity.title,rainAlternative:flexible?'Gebruik als volledige hersteldag.':activity.rainAlternative};
}
function buildOpenEndedExplorationDays(trip,destination,outbound,metrics,totalDays){
  const days=[];
  for(let i=0;i<outbound.length-1;i++)days.push(makeTravelDay('outward',outbound[i],outbound[i+1],metrics,trip));
  if(days.length>=totalDays)return days.slice(0,totalDays);

  const activities=chooseActivities(trip,destination);
  const primary={...(outbound.at(-1)||destination.bases?.[0]),role:'destination'};
  if(!validCoordinate(primary))return[...days,...buildStayDays(trip,destination,totalDays-days.length)];

  const remaining=totalDays-days.length;
  const usedChanges=countAccommodationChanges(days,trip.origin);
  const extraChangeBudget=Math.max(0,Number(trip.maxChanges||0)-usedChanges);
  const desiredDistinct=Math.max(3,Math.ceil(Number(trip.days||remaining)*.62));
  const baseCount=Math.max(1,Math.min(remaining,extraChangeBudget+1,desiredDistinct));
  const bases=[primary];
  const origin=outbound[0]||metrics.origin||primary;
  const forwardBearing=destinationBearing(origin,primary);
  const roadSpeed={car:56,motorcycle:52,motorhome:47,caravan:43}[transportId(trip.transport)]||50;
  const maxStep=Math.max(85,Math.min(260,Number(trip.maxDrive||5)*roadSpeed*.68));

  for(let index=0;index<baseCount-1;index++){
    const previous=bases.at(-1),swing=((index%4)-1.5)*18+Math.floor(index/4)*10,bearing=(forwardBearing+swing+360)%360;
    const distance=maxStep*(.72+(index%3)*.12);
    bases.push(makeExplorationNode(previous,index,bearing,distance,destination));
  }

  let baseIndex=0;
  for(let slot=0;slot<remaining;slot++){
    const slotsLeft=remaining-slot,transfersLeft=(bases.length-1)-baseIndex;
    const mustTransfer=transfersLeft>0&&transfersLeft>=slotsLeft-1;
    const scheduledTransfer=transfersLeft>0&&slot>0&&Math.round(slot*(bases.length-1)/Math.max(1,remaining-1))>baseIndex;
    if((mustTransfer||scheduledTransfer)&&baseIndex<bases.length-1){
      const from=bases[baseIndex],to=bases[++baseIndex],local=localTransfer(from,to,trip);
      days.push({kind:'transfer',typeLabel:labelFor('transfer'),from:from.name,to:to.name,location:to.name,fromPoint:{...from},toPoint:{...to},overnight:to.name,...local,primaryPlan:`Ga verder naar een nieuwe regio: ${to.name}. Deze etappe bouwt de open-einde roadtrip verder uit.`,rainAlternative:'Rijd rechtstreeks naar de volgende overnachtingsregio.'});
    }else{
      days.push(makeLocalStay(bases[baseIndex],slot,remaining,activities));
    }
  }
  return days.slice(0,totalDays);
}


function buildSingleDayTrip(trip,destination,first){
  const origin=first.metrics?.origin||first.outbound?.[0],target=destination.bases?.[0]||first.outbound?.at(-1);
  if(!validCoordinate(origin)||!validCoordinate(target))return null;
  const one=segmentMetrics(origin,target,first.metrics.oneWayDistanceKm,first.metrics.oneWayRoadHours);
  const combined={distanceKm:Math.round(Number(one.distanceKm||0)*2),roadHours:Number((Number(one.roadHours||0)*2).toFixed(2))};
  const timing=estimateLegTiming(trip,{...combined,arrival:false});
  const activity=chooseActivities(trip,destination)[0];
  const day={kind:'daytrip',typeLabel:'Dagtrip',from:origin.name||trip.origin,to:trip.origin,location:target.name||destination.name,fromPoint:{...origin},toPoint:{...origin},destinationPoint:{...target},overnight:trip.origin,distanceKm:combined.distanceKm,roadHours:timing.roadHours,driveHours:timing.elapsedHours,elapsedHours:timing.elapsedHours,breakHours:timing.breakHours,restStops:timing.restStops,fuelStops:timing.fuelStops,stopCount:timing.stopCount,waypoints:[{...target,name:target.name||destination.name,role:'destination'}],geometry:[{...origin},{...target},{...origin}],routeSource:'estimated-daytrip',activityType:activity?.type||'dagtrip',primaryPlan:trip.routeTopology==='loop'?`Daglus vanuit ${trip.origin} via ${target.name||destination.name} en via een andere corridor terug.`:`Dagtrip vanuit ${trip.origin} naar ${target.name||destination.name} en dezelfde dag terug. ${activity?.title?`Hoogtepunt: ${activity.title}.`:''}`,rainAlternative:activity?.rainAlternative||'Kies een korter programma en keer eerder terug bij slecht weer.',exceedsDailyLimit:timing.elapsedHours>trip.maxDrive+.05,day:1,date:trip.startDate};
  return day;
}

export function buildItinerary(trip,destination){
 const first=buildTravelNodes(trip,destination,1),requiredLegs=first.metrics.requiredLegs,openEnded=trip.routeTopology==='open-ended';
 if(Number(trip.days)===1){
   const day=buildSingleDayTrip(trip,destination,first);
   if(day){
     const days=[day];applyDaySchedules(trip,days);const recommendations=buildRecommendations(trip,destination,days);
     const metrics={...first.metrics,origin:{...day.fromPoint},exploration:{overlap:trip.routeTopology==='loop'?null:1,explorationScore:trip.routeTopology==='loop'?100:0,method:trip.routeTopology==='loop'?'single-day-loop':'single-day-roundtrip'}};
     const warnings=day.exceedsDailyLimit?[`Deze dagtrip duurt circa ${day.elapsedHours.toFixed(1)} uur inclusief geplande pauzes en overschrijdt je daglimiet.`]:[];
     return{days,routeMetrics:metrics,requiredLegs:1,usedLegs:1,minimumDays:1,feasible:!day.exceedsDailyLimit,proposalCategory:destination.category||'exact',warnings,accommodationChanges:0,recommendations,routing:{source:'estimated-daytrip',label:trip.routeTopology==='loop'?'Daglus · andere terugcorridor':'Dagtrip · heen en terug op dezelfde dag',live:false},origin:{name:trip.origin,...(first.metrics.origin||{})},topology:trip.routeTopology==='loop'?'day-loop':'daytrip'};
   }
 }
 const preferred=destination.constraintStatus?.travelLegs||requiredLegs;
 const allocation=openEnded?{usedLegs:Math.min(requiredLegs,Math.max(1,trip.days-1)),stayDays:Math.max(0,trip.days-Math.min(requiredLegs,Math.max(1,trip.days-1)))}:solveDayAllocation(trip,requiredLegs,preferred);
 const usedLegs=allocation.usedLegs,{metrics,outbound}=buildTravelNodes(trip,destination,usedLegs);let inbound=[];
 if(!openEnded){inbound=buildTravelNodes(trip,destination,usedLegs).inbound;if(trip.routeTopology==='loop'&&usedLegs>1)inbound=buildAlternativeReturnNodes(outbound[0],outbound.at(-1),usedLegs)}
 let days=[];
 if(openEnded)days=buildOpenEndedExplorationDays(trip,destination,outbound,metrics,trip.days);
 else{
   for(let i=0;i<outbound.length-1;i++)days.push(makeTravelDay('outward',outbound[i],outbound[i+1],metrics,trip));
   days.push(...buildStayDays(trip,destination,allocation.stayDays||1));
   for(let i=0;i<inbound.length-1;i++)days.push(makeTravelDay('return',inbound[i],inbound[i+1],metrics,trip));
 }
 days.splice(trip.days);days.forEach((day,index)=>{day.day=index+1;day.date=addDays(trip.startDate,index)});
 applyDaySchedules(trip,days);const recommendations=buildRecommendations(trip,destination,days);
 const exploration=openEnded?{overlap:0,explorationScore:100,method:'progressive-open-ended'}:routeExplorationMetrics(outbound,inbound);metrics.exploration=exploration;
 const minimumDays=openEnded?requiredLegs:requiredLegs*2+1,excessiveDays=days.filter(day=>day.exceedsDailyLimit),warnings=[];
 if(trip.routeTopology==='loop'&&exploration.overlap>.5)warnings.push(`De lus heeft nog ${Math.round(exploration.overlap*100)}% route-overlap; ReisSlim heeft een alternatieve terugcorridor gekozen maar lokale wegstructuur kan verdere overlap veroorzaken.`);
 if(openEnded){const unique=[...new Set(days.map(day=>day.overnight).filter(Boolean))];if(trip.days>=7&&unique.length<3)warnings.push('Deze open-einde reis bevat te weinig verschillende overnachtingsregio’s.')}
 if(excessiveDays.length)warnings.push(`${excessiveDays.length} rijdag${excessiveDays.length===1?'':'en'} overschrijdt de ingestelde daglimiet.`);
 const accommodationChanges=countAccommodationChanges(days,trip.origin);if(accommodationChanges>trip.maxChanges)warnings.push(`De route vraagt circa ${accommodationChanges} accommodatiewissels; jouw voorkeur is maximaal ${trip.maxChanges}.`);
 return{days,routeMetrics:metrics,requiredLegs,usedLegs,minimumDays,feasible:minimumDays<=trip.days&&excessiveDays.length===0&&accommodationChanges<=trip.maxChanges,proposalCategory:destination.category||'exact',warnings,accommodationChanges,recommendations,routing:{source:'estimated-corridor',label:trip.routeTopology==='loop'?'Lus met alternatieve terugcorridor':trip.routeTopology==='out-and-back'?'Heen/terug over dezelfde corridor':'Open einde · progressieve roadtrip',live:false},origin:{name:trip.origin,...(metrics.origin||{})},topology:trip.routeTopology}
}
export function countAccommodationChanges(days,origin){const overnights=days.map(day=>day.overnight).filter(name=>name&&name!==origin);return overnights.reduce((count,name,index)=>count+(index>0&&name!==overnights[index-1]?1:0),0)}
export function collectRoutePoints(plan,{daily=false}={}){const points=[],origin=plan.routeMetrics?.origin;if(validCoordinate(origin))points.push({...origin,name:plan.origin?.name||origin.name,role:'origin'});for(const day of plan.days||[]){if(!validCoordinate(day.toPoint))continue;const point={...day.toPoint,name:day.to,role:day.kind==='return'&&day.day===plan.days.length?'return':day.toPoint.role,day:day.day,date:day.date};if(daily||!points.length||points.at(-1).lat!==point.lat||points.at(-1).lon!==point.lon)points.push(point)}return points}
export function collectRouteSegments(plan){return(plan?.days||[]).filter(day=>Array.isArray(day.geometry)&&day.geometry.filter(validCoordinate).length>1).map(day=>({day:day.day,kind:day.kind,mode:'road',source:day.routeSource||plan.routing?.source||'estimated-corridor',points:day.geometry.filter(validCoordinate).map(point=>({...point}))}))}
export function collectRouteGeometry(plan){const points=[];for(const segment of collectRouteSegments(plan))for(const point of segment.points)if(!points.length||points.at(-1).lat!==point.lat||points.at(-1).lon!==point.lon)points.push(point);return points}
export function collectPlanWaypoints(plan){const points=collectRoutePoints(plan,{daily:true});for(const day of plan?.days||[]){for(const waypoint of day.waypoints||[])if(validCoordinate(waypoint))points.push({...waypoint,day:day.day,date:day.date});for(const item of day.recommendations||[])if(validCoordinate(item.point))points.push({...item.point,name:item.name,role:item.type,day:day.day,date:day.date})}return points}
