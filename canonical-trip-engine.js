import { validCoordinate } from './config.js';
import { maximumRoadLegKm, estimatedRoadKm } from './roadtrip-policy.js';
import { calculateRouteMetrics } from './route-engine.js';
import { estimateLegTiming, vehicleProfile } from './vehicle-intelligence.js';
import { buildRecommendations } from './recommendation-engine.js';
import { resolveOrigin } from './trip-model.js';

const ENGINE='canonical-v2';
const EARTH_KM=6371;
const rad=v=>Number(v)*Math.PI/180;
const deg=v=>Number(v)*180/Math.PI;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function canonicalEngineId(){return ENGINE}
export function isCanonicalPlan(plan){return Boolean(plan&&plan.canonicalEngine===ENGINE)}

function geoKm(a,b){
  if(!validCoordinate(a)||!validCoordinate(b))return Infinity;
  const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),la=rad(a.lat),lb=rad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dLon/2)**2;
  return 2*EARTH_KM*Math.asin(Math.min(1,Math.sqrt(h)))
}
function bearing(a,b){
  if(!validCoordinate(a)||!validCoordinate(b))return 0;
  const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));
  const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  return(deg(Math.atan2(y,x))+360)%360
}
function destinationPoint(from,bearingDeg,distanceKm){
  const a=Math.max(0,Number(distanceKm)||0)/EARTH_KM,b=rad(bearingDeg),lat1=rad(from.lat),lon1=rad(from.lon);
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b));
  const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));
  return{lat:Number(deg(lat2).toFixed(6)),lon:Number((((deg(lon2)+540)%360)-180).toFixed(6))}
}
function slerp(a,b,t){
  t=clamp(Number(t)||0,0,1);if(t<=0)return{lat:a.lat,lon:a.lon};if(t>=1)return{lat:b.lat,lon:b.lon};
  const p1=[Math.cos(rad(a.lat))*Math.cos(rad(a.lon)),Math.cos(rad(a.lat))*Math.sin(rad(a.lon)),Math.sin(rad(a.lat))];
  const p2=[Math.cos(rad(b.lat))*Math.cos(rad(b.lon)),Math.cos(rad(b.lat))*Math.sin(rad(b.lon)),Math.sin(rad(b.lat))];
  const dot=clamp(p1[0]*p2[0]+p1[1]*p2[1]+p1[2]*p2[2],-1,1),omega=Math.acos(dot);
  if(omega<1e-9)return{lat:Number((a.lat+(b.lat-a.lat)*t).toFixed(6)),lon:Number((a.lon+(b.lon-a.lon)*t).toFixed(6))};
  const so=Math.sin(omega),w1=Math.sin((1-t)*omega)/so,w2=Math.sin(t*omega)/so;
  const x=p1[0]*w1+p2[0]*w2,y=p1[1]*w1+p2[1]*w2,z=p1[2]*w1+p2[2]*w2;
  return{lat:Number(deg(Math.atan2(z,Math.hypot(x,y))).toFixed(6)),lon:Number(deg(Math.atan2(y,x)).toFixed(6))}
}
function addDays(dateString,amount){const d=new Date(`${dateString}T12:00:00`);d.setDate(d.getDate()+amount);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function pointId(point,fallback='point'){return String(point?.catalogId||point?.id||`${fallback}:${Number(point?.lat).toFixed(4)},${Number(point?.lon).toFixed(4)}`)}
function namedPoint(point,name,extra={}){return{lat:Number(point.lat),lon:Number(point.lon),name:String(name||point.name||'Routepunt'),...extra}}
function generatedPoint(point,name,index,role='destination'){return namedPoint(point,name,{catalogId:`canonical-${role}-${index}-${Number(point.lat).toFixed(4)}-${Number(point.lon).toFixed(4)}`,role,canonicalGenerated:true,generatedExploration:true,landValidated:null,provisionalRoutePoint:true})}
function destinationAnchor(destination){const p=destination?.bases?.find(validCoordinate)||destination?.anchor||destination?.point;return validCoordinate(p)?namedPoint(p,p.name||String(destination?.name||'Bestemming').replace(/\s*&\s*omgeving$/i,''),{catalogId:destination?.id||p.catalogId||'selected-destination',role:'destination',landValidated:true,canonicalGenerated:false}):null}
function failure(trip,destination,code,reason,suggestion,details={}){
  return{canonicalEngine:ENGINE,canonicalVersion:2,days:[],recommendations:[],feasible:false,generationFailure:{code,reason,suggestion,details},warnings:[reason],accommodationChanges:0,routeMetrics:{origin:resolveOrigin(trip)||trip?.originPoint||null},routing:{source:'canonical-v2',live:false},origin:{name:trip?.origin||''},topology:trip?.routeTopology||'loop',destinationId:destination?.id||null}
}
function travelLegCount(trip,destination,origin,anchor){const metrics=calculateRouteMetrics(trip,destination),direct=Number(metrics?.oneWayDistanceKm)||estimatedRoadKm(origin,anchor),maxLeg=maximumRoadLegKm(trip),declared=Number(destination?.constraintStatus?.travelLegs),legs=Math.max(1,Math.round(Number.isFinite(declared)&&declared>0?declared:Number(metrics?.requiredLegs)||Math.ceil(direct/Math.max(1,maxLeg))));return{direct,maxLeg,legs,metrics}}
function minimumChangesForLegs(legs,openEnded=false){return openEnded?Math.max(0,legs-1):Math.max(0,(legs-1)*2)}
export function canonicalRequirements(trip,destination){
  const origin=resolveOrigin(trip)||trip?.originPoint,anchor=destinationAnchor(destination);
  if(!validCoordinate(origin))return{valid:false,code:'origin-unresolved'};
  if(!validCoordinate(anchor))return{valid:false,code:'destination-unresolved'};
  const {direct,maxLeg,legs,metrics}=travelLegCount(trip,destination,origin,anchor),openEnded=trip?.routeTopology==='open-ended'&&trip?.tripStructure!=='base';
  if(Number(trip?.days||0)===1){const totalRoad=openEnded?direct:direct*2;return{valid:true,origin,anchor,direct,maxLeg,legs:1,openEnded,minimumDays:1,minimumChanges:0,totalRoad,metrics}}
  const minimumDays=openEnded?legs:legs*2+1,minimumChanges=minimumChangesForLegs(legs,openEnded);
  return{valid:true,origin,anchor,direct,maxLeg,legs,openEnded,minimumDays,minimumChanges,totalRoad:null,metrics}
}
function timingFromRoad(trip,distanceKm,roadHours,arrival=true){const timing=estimateLegTiming(trip,{distanceKm:Math.max(0,Number(distanceKm)||0),roadHours:Math.max(0,Number(roadHours)||0),arrival});return{roadHours:timing.roadHours,driveHours:timing.elapsedHours,elapsedHours:timing.elapsedHours,breakHours:timing.breakHours,restStops:timing.restStops,fuelStops:timing.fuelStops,stopCount:timing.stopCount,exceedsDailyLimit:timing.elapsedHours>Number(trip.maxDrive||5)+.05}}
function timingForDistance(trip,distanceKm){const profile=vehicleProfile(trip),productive={car:78,motorcycle:72,motorhome:66,caravan:62}[trip?.transport]||78,roadHours=Math.max(0,Number(distanceKm)||0)/productive*Number(profile.roadTimeFactor||1);return timingFromRoad(trip,distanceKm,roadHours,true)}
function makeTravelDay(kind,from,to,trip,day,primaryPlan=null,segment=null){
  const distanceKm=Math.max(0,Math.round(Number(segment?.distanceKm)||estimatedRoadKm(from,to))),timing=segment?.roadHours!=null?timingFromRoad(trip,distanceKm,Number(segment.roadHours),kind!=='return'):timingForDistance(trip,distanceKm);
  return{kind,typeLabel:kind==='return'?'Terugreis':kind==='transfer'?'Tour-etappe':'Heenreis',from:from.name,to:to.name,location:to.name,fromPoint:{...from},toPoint:{...to},overnight:kind==='return'?trip.origin:to.name,distanceKm,...timing,waypoints:[],geometry:[{...from},{...to}],routeSource:'canonical-v2',primaryPlan:primaryPlan||`Rijd van ${from.name} naar ${to.name}.`,rainAlternative:'Kies bij slecht weer de veiligste directe route en pas pauzes aan.',day,date:addDays(trip.startDate,day-1)}
}
function localTarget(base,trip,index,destination){
  const maxLeg=maximumRoadLegKm(trip),oneWayRoad=Math.max(14,Math.min(105,maxLeg*.34)),radiusKm=oneWayRoad/1.18;
  const anchorBearing=(Number(destination?.motorcycle||0)>=8?35:20)+(index*97)%360;
  return generatedPoint(destinationPoint(base,anchorBearing,radiusKm),`Lokale verkenningszone ${index+1}`,index,'local-target')
}
function makeLocalDay(base,trip,day,index,destination,{label='Dagrit vanuit uitvalsbasis'}={}){
  const target=localTarget(base,trip,index,destination),distanceKm=Math.max(10,Math.round(estimatedRoadKm(base,target)*2)),timing=timingForDistance(trip,distanceKm);
  return{kind:'daytrip',typeLabel:label,from:base.name,to:base.name,location:target.name,fromPoint:{...base},toPoint:{...base},destinationPoint:{...target},overnight:base.name,distanceKm,...timing,waypoints:[{...target,role:'activity'}],geometry:[{...base},{...target},{...base}],routeSource:'canonical-v2-local-loop',primaryPlan:`Verken de omgeving van ${base.name} via ${target.name} en keer terug naar dezelfde uitvalsbasis.`,rainAlternative:`Kies een kortere lokale lus of een binnenactiviteit rond ${base.name}.`,day,date:addDays(trip.startDate,day-1)}
}
function transitPoints(origin,anchor,legs){
  const rows=[];for(let i=1;i<legs;i++)rows.push(generatedPoint(slerp(origin,anchor,i/legs),`Transitregio ${i}`,i,'transit'));return rows
}
function countAccommodationChanges(days,trip){
  const nights=(days||[]).slice(0,-1).map(day=>pointId(day.toPoint,day.overnight)).filter(Boolean);let changes=0,prev=null;for(const id of nights){if(prev!==null&&id!==prev)changes++;prev=id}return changes
}
function buildClosedBase(trip,destination,origin,anchor,legs,metrics){
  const segment={distanceKm:Number(metrics?.oneWayDistanceKm||0)/legs,roadHours:Number(metrics?.oneWayRoadHours||0)/legs};
  const intermediates=transitPoints(origin,anchor,legs),outbound=[...intermediates,anchor],days=[];let from=namedPoint(origin,trip.origin,{catalogId:'origin',role:'origin',landValidated:true}),day=1;
  for(let i=0;i<outbound.length;i++){const to=outbound[i];days.push(makeTravelDay(i===0?'outward':'transfer',from,to,trip,day++,null,segment));from=to}
  const localCount=Math.max(1,Number(trip.days)-legs*2);for(let i=0;i<localCount;i++)days.push(makeLocalDay(anchor,trip,day++,i,destination));
  const inbound=[...intermediates].reverse();from=anchor;for(const to of inbound){days.push(makeTravelDay('transfer',from,to,trip,day++,null,segment));from=to}
  const home=namedPoint(origin,trip.origin,{catalogId:'origin',role:'origin',landValidated:true});days.push(makeTravelDay('return',from,home,trip,day++,null,segment));return days
}
function buildClosedMoving(trip,destination,origin,anchor,legs,metrics){
  const segment={distanceKm:Number(metrics?.oneWayDistanceKm||0)/legs,roadHours:Number(metrics?.oneWayRoadHours||0)/legs};
  const intermediates=transitPoints(origin,anchor,legs),outbound=[...intermediates,anchor],days=[];let from=namedPoint(origin,trip.origin,{catalogId:'origin',role:'origin',landValidated:true}),day=1;
  for(let i=0;i<outbound.length;i++){const to=outbound[i];days.push(makeTravelDay(i===0?'outward':'transfer',from,to,trip,day++,null,segment));from=to}
  let localCount=Math.max(1,Number(trip.days)-legs*2),localIndex=0;
  // Use genuine accommodation changes when there is both time and user budget,
  // but never invent extra moves just to hit a target. Each excursion pair consumes
  // two extra changes and returns to the selected destination before the home leg.
  const baseMin=minimumChangesForLegs(legs,false),extraChangeBudget=Math.max(0,Math.floor(Number(trip.maxChanges||0))-baseMin),pairs=Math.min(Math.floor(extraChangeBudget/2),Math.floor(localCount/2),3);
  for(let p=0;p<pairs;p++){
    const target=localTarget(anchor,trip,localIndex++,destination);days.push(makeTravelDay('transfer',anchor,target,trip,day++,`Verplaats voor één nacht naar ${target.name}.`));days.at(-1).overnight=target.name;days.push(makeTravelDay('transfer',target,anchor,trip,day++,`Keer terug naar ${anchor.name} via een andere lokale corridor waar mogelijk.`));localCount-=2
  }
  for(let i=0;i<localCount;i++)days.push(makeLocalDay(anchor,trip,day++,localIndex++,destination,{label:'Lokale roadtripdag'}));
  const inbound=[...intermediates].reverse();from=anchor;for(const to of inbound){days.push(makeTravelDay('transfer',from,to,trip,day++,null,segment));from=to}
  const home=namedPoint(origin,trip.origin,{catalogId:'origin',role:'origin',landValidated:true});days.push(makeTravelDay('return',from,home,trip,day++,null,segment));return days
}
function buildOpenEnded(trip,destination,origin,anchor,legs,metrics){
  const segment={distanceKm:Number(metrics?.oneWayDistanceKm||0)/legs,roadHours:Number(metrics?.oneWayRoadHours||0)/legs};
  const intermediates=transitPoints(origin,anchor,legs),outbound=[...intermediates,anchor],days=[];let from=namedPoint(origin,trip.origin,{catalogId:'origin',role:'origin',landValidated:true}),day=1;
  for(let i=0;i<outbound.length;i++){const to=outbound[i];days.push(makeTravelDay(i===0?'outward':'transfer',from,to,trip,day++,null,segment));from=to}
  const remaining=Math.max(0,Number(trip.days)-days.length);for(let i=0;i<remaining;i++)days.push(makeLocalDay(anchor,trip,day++,i,destination,{label:'Lokale dag vanaf eindbestemming'}));return days
}
function buildSingleDay(trip,destination,origin,anchor,openEnded,maxLeg,direct){
  const home=namedPoint(origin,trip.origin,{catalogId:'origin',role:'origin',landValidated:true});
  if(openEnded){const day=makeTravelDay('outward',home,anchor,trip,1);day.overnight=anchor.name;return[day]}
  const distanceKm=Math.round(direct*2),timing=timingForDistance(trip,distanceKm);
  return[{kind:'daytrip',typeLabel:'Dagtrip',from:home.name,to:home.name,location:anchor.name,fromPoint:{...home},toPoint:{...home},destinationPoint:{...anchor},overnight:home.name,distanceKm,...timing,waypoints:[{...anchor,role:'destination'}],geometry:[{...home},{...anchor},{...home}],routeSource:'canonical-v2-daytrip',primaryPlan:`Dagtrip vanuit ${home.name} naar ${anchor.name} en terug.`,rainAlternative:'Kies een korter programma of keer eerder terug bij slecht weer.',day:1,date:trip.startDate}]
}
function normalizeDays(days,trip){return(days||[]).slice(0,Number(trip.days||0)).map((d,i)=>({...d,day:i+1,date:addDays(trip.startDate,i)}))}

export function buildCanonicalTripPlan(trip,destination){
  const req=canonicalRequirements(trip,destination);if(!req.valid){
    if(req.code==='origin-unresolved')return failure(trip,destination,'origin-unresolved',`Vertrekplaats “${trip?.origin||''}” heeft geen bruikbare coördinaten.`,`Laat ReisSlim het vertrekpunt opnieuw bepalen of kies een plaats uit de lijst.`);
    return failure(trip,destination,'destination-unresolved','De gekozen bestemming heeft geen bruikbare routecoördinaten.','Kies de bestemming opnieuw of laat live ontdekking een nieuwe regio ophalen.')
  }
  const {origin,anchor,direct,maxLeg,legs,openEnded,minimumDays,minimumChanges,metrics}=req,daysRequested=Math.max(1,Number(trip.days||0));
  if(daysRequested===1){
    const totalRoad=openEnded?direct:direct*2;if(totalRoad>maxLeg+.5)return failure(trip,destination,'single-day-too-far',`Deze dagtrip vraagt ongeveer ${Math.round(totalRoad)} km wegafstand; binnen ${Number(trip.maxDrive).toFixed(1)} uur is maximaal ongeveer ${Math.round(maxLeg)} km haalbaar.`,`Verhoog de dagelijkse reistijd of kies een dichterbij gelegen bestemming.`,{requiredRoadKm:Math.round(totalRoad),maximumRoadKm:Math.round(maxLeg)});
  }else if(daysRequested<minimumDays){
    return failure(trip,destination,'duration-too-short',`De bestemming vraagt minimaal ${minimumDays} dagen: ${legs} reisdag${legs===1?'':'en'} heen${openEnded?'':` en ${legs} terug`}${openEnded?'':', plus minimaal één dag op de bestemming'}. Je hebt ${daysRequested} dagen ingesteld.`,`Verleng de reis naar minimaal ${minimumDays} dagen of verhoog de dagelijkse reistijd.`,{minimumDays,daysRequested,travelLegs:legs,directRoadKm:Math.round(direct),maximumRoadLegKm:Math.round(maxLeg)})
  }
  if(trip?.strictChanges!==false&&minimumChanges>Number(trip.maxChanges||0))return failure(trip,destination,'accommodation-changes-limit',`De noodzakelijke transitopbouw vraagt minimaal ${minimumChanges} accommodatiewissels; je maximum is ${trip.maxChanges}.`,`Sta minimaal ${minimumChanges} accommodatiewissels toe, verhoog de dagelijkse reistijd of kies een dichterbij gelegen bestemming.`,{minimumChanges,maxChanges:Number(trip.maxChanges||0),travelLegs:legs});
  let days;if(daysRequested===1)days=buildSingleDay(trip,destination,origin,anchor,openEnded,maxLeg,direct);else if(openEnded)days=buildOpenEnded(trip,destination,origin,anchor,legs,metrics);else if(trip.tripStructure==='base')days=buildClosedBase(trip,destination,origin,anchor,legs,metrics);else days=buildClosedMoving(trip,destination,origin,anchor,legs,metrics);
  days=normalizeDays(days,trip);const accommodationChanges=countAccommodationChanges(days,trip),plan={canonicalEngine:ENGINE,canonicalVersion:2,destinationId:destination?.id||null,days,routeMetrics:{origin:namedPoint(origin,trip.origin,{catalogId:'origin',role:'origin',landValidated:true}),oneWayDistanceKm:Math.round(direct),requiredLegs:legs,maximumRoadLegKm:Math.round(maxLeg),exploration:{overlap:null,explorationScore:100,method:'canonical-v2'}},requiredLegs:legs,usedLegs:legs,minimumDays,feasible:true,proposalCategory:destination?.category||'exact',warnings:[],accommodationChanges,routing:{source:'canonical-v2',label:trip.tripStructure==='base'?'Canonieke uitvalsbasisroute':openEnded?'Canonieke open-einde route':trip.routeTopology==='loop'?'Canonieke lusroadtrip':'Canonieke heen-en-terugroadtrip',live:false},origin:{name:trip.origin,...origin},topology:trip.routeTopology,baseSelection:trip.tripStructure==='base'?{point:{...anchor},label:`${anchor.name} als slimme uitvalsbasis`,why:{travelLegs:legs,minimumChanges}}:null};
  plan.recommendations=buildRecommendations(trip,destination,days);const diagnostic=canonicalPlanDiagnostic(trip,plan,destination);if(!diagnostic.valid){plan.feasible=false;plan.generationFailure=diagnostic;plan.warnings.push(diagnostic.reason)}return plan
}

function geometryValid(day){return Array.isArray(day?.geometry)&&day.geometry.filter(validCoordinate).length>=2}
export function canonicalPlanDiagnostic(trip,plan,destination=null){
  if(plan?.generationFailure)return{valid:false,...plan.generationFailure};
  if(!isCanonicalPlan(plan))return{valid:false,code:'non-canonical-plan',reason:'Het actieve plan is niet door de canonieke route-engine opgebouwd.',suggestion:'Bouw de reis opnieuw op met de huidige engine.'};
  const requested=Math.max(1,Number(trip?.days||0)),rows=plan.days||[];if(rows.length!==requested)return{valid:false,code:'day-count',reason:`Het plan bevat ${rows.length} dagen terwijl ${requested} dagen zijn gevraagd.`,suggestion:'Bouw het plan opnieuw op; geen enkele fase mag kalenderdagen verwijderen.'};
  for(let i=0;i<rows.length;i++){
    const d=rows[i];if(!validCoordinate(d.fromPoint)||!validCoordinate(d.toPoint))return{valid:false,code:`missing-coordinate:${i+1}`,reason:`Dag ${i+1} mist een geldig vertrek- of eindpunt.`,suggestion:'Herbouw deze dag vanuit de canonieke routegeometrie.'};
    if(!geometryValid(d))return{valid:false,code:`missing-geometry:${i+1}`,reason:`Dag ${i+1} heeft minder dan twee geldige kaartpunten en kan daarom niet op de kaart worden weergegeven.`,suggestion:'Herbouw dag ${i+1} met expliciete routegeometrie.'};
    if(i>0&&geoKm(rows[i-1].toPoint,d.fromPoint)>12)return{valid:false,code:`disconnected-day:${i+1}`,reason:`Dag ${i+1} start niet waar dag ${i} eindigt.`,suggestion:'Herbouw de opeenvolgende route-etappes zodat ze op elkaar aansluiten.'};
    if(trip?.strictDrive!==false&&Number(d.elapsedHours||0)>Number(trip.maxDrive||0)+.05)return{valid:false,code:`daily-drive-limit:${i+1}`,reason:`Dag ${i+1} duurt ${Number(d.elapsedHours).toFixed(1)} uur terwijl je maximum ${Number(trip.maxDrive).toFixed(1)} uur is.`,suggestion:'Verhoog de dagelijkse reistijd, voeg reisdagen toe of kies een dichterbij gelegen bestemming.'};
    if(d.kind==='daytrip'&&!validCoordinate(d.destinationPoint))return{valid:false,code:`missing-daytrip-target:${i+1}`,reason:`Dag ${i+1} is een dagrit maar mist een werkelijk route-doelpunt.`,suggestion:'Herbouw de lokale dagrit rond de uitvalsbasis.'}
  }
  const changes=countAccommodationChanges(rows,trip);if(trip?.strictChanges!==false&&changes>Number(trip.maxChanges||0))return{valid:false,code:'too-many-changes',reason:`Het plan vraagt ${changes} accommodatiewissels terwijl je maximum ${trip.maxChanges} is.`,suggestion:`Verhoog het maximum naar minimaal ${changes}, voeg rijtijd toe zodat minder transitnachten nodig zijn of kies een dichterbij gelegen bestemming.`};
  const origin=resolveOrigin(trip)||trip.originPoint,last=rows.at(-1);if(trip?.routeTopology!=='open-ended'||trip?.tripStructure==='base'){
    if(validCoordinate(origin)&&geoKm(last?.toPoint,origin)>12)return{valid:false,code:'does-not-return-origin',reason:`De reis hoort terug te keren naar ${trip.origin}, maar de laatste dag eindigt elders.`,suggestion:'Herbouw de terugreis naar het ingestelde vertrekpunt.'}
  }else{
    const anchor=destinationAnchor(destination)||last?.toPoint;if(validCoordinate(anchor)&&geoKm(last?.toPoint,anchor)>20)return{valid:false,code:'open-ended-not-at-destination',reason:'De open-einde reis eindigt niet bij de gekozen bestemming.',suggestion:'Laat de laatste etappe eindigen bij de gekozen bestemming.'}
  }
  if(trip?.tripStructure==='base'){
    const base=plan.baseSelection?.point;if(!validCoordinate(base))return{valid:false,code:'missing-base',reason:'De slimme-uitvalsbasisreis mist een centrale basis.',suggestion:'Kies of bereken opnieuw een centrale uitvalsbasis.'};
    const local=rows.filter(d=>d.kind==='daytrip');if(requested>2&&local.length<1)return{valid:false,code:'missing-base-daytrip',reason:'De slimme-uitvalsbasisreis bevat geen lokale dagrit op de bestemming.',suggestion:'Reserveer minimaal één dag voor een route vanuit en terug naar de uitvalsbasis.'}
  }
  return{valid:true,code:'canonical-ok',reason:'roadtrip-ok',suggestion:'',changes,pendingResolution:rows.some(d=>d.toPoint?.canonicalGenerated&&d.toPoint?.landValidated!==true)||rows.some(d=>d.destinationPoint?.canonicalGenerated&&d.destinationPoint?.landValidated!==true)}
}

export const __canonicalTest={geoKm,bearing,destinationPoint,slerp,countAccommodationChanges,minimumChangesForLegs};
