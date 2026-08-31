import { validCoordinate } from './config.js';

const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
const EARTH=6371;
const rad=v=>v*Math.PI/180;
function km(a,b){
  if(!validCoordinate(a)||!validCoordinate(b))return 0;
  const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),la=rad(a.lat),lb=rad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dLon/2)**2;
  return 2*EARTH*Math.asin(Math.min(1,Math.sqrt(h)));
}
function path(day){
  const geometry=(day?.geometry||[]).filter(validCoordinate);
  if(geometry.length>=2)return geometry;
  return [day?.fromPoint,...(day?.waypoints||[]),day?.destinationPoint,day?.toPoint].filter(validCoordinate);
}
function pointAt(day,fraction=.5){
  const points=path(day);if(!points.length)return null;if(points.length===1)return{...points[0]};
  const lengths=[];let total=0;
  for(let i=1;i<points.length;i++){const d=km(points[i-1],points[i]);lengths.push(d);total+=d}
  if(total<=0)return{...points[Math.min(points.length-1,Math.round(fraction*(points.length-1)))]};
  const target=Math.max(0,Math.min(1,fraction))*total;let walked=0;
  for(let i=0;i<lengths.length;i++){
    const next=walked+lengths[i];
    if(target<=next||i===lengths.length-1){
      const t=lengths[i]?Math.max(0,Math.min(1,(target-walked)/lengths[i])):0;
      return{lat:Number((points[i].lat+(points[i+1].lat-points[i].lat)*t).toFixed(6)),lon:Number((points[i].lon+(points[i+1].lon-points[i].lon)*t).toFixed(6))};
    }
    walked=next;
  }
  return{...points.at(-1)};
}
function searchUrl(type,day,point,trip){
  const label={accommodation:trip?.accommodationType==='camping'?'camping':trip?.accommodationType==='hotel-bnb'?'hotel B&B':'accommodation hotel camping',restaurant:'restaurant cafe',fuel:'fuel station',rest:'rest area cafe',activity:'attraction viewpoint nature'}[type]||type;
  const area=day?.location||day?.overnight||day?.to||'';
  return`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${label} near ${area} ${point.lat},${point.lon}`)}`;
}
function fallbackItem(type,day,point,trip,index=0){
  const labels={accommodation:'Verblijf',restaurant:'Eetstop',fuel:'Tankstop',rest:'Ruststop',activity:'Bezienswaardigheid'};
  const url=searchUrl(type,day,point,trip);
  const night=Number(day?.day||0);
  const name=type==='accommodation'?`${labels[type]} voor nacht ${night} rond ${day?.overnight||day?.location||day?.to||'overnachtingsplaats'}`:`${labels[type]} voor dag ${day?.day||''}`;
  return{
    id:`coverage-${day?.day||0}-${type}-${index}`,day:Number(day?.day||0),type,name,point:{...point},lat:Number(point.lat),lon:Number(point.lon),
    live:false,genericFallback:true,lookupComplete:true,plannedRoutePoint:true,verified:false,confidence:'planned-route-point',
    source:'ReisSlim route-dekking',reason:type==='accommodation'?'Elke overnachtingsnacht blijft zichtbaar. Een specifieke accommodatie wordt live gezocht; deze marker blijft als gerichte zoeklocatie wanneer providers niets teruggeven.':'Gepland routepunt. ReisSlim vervangt dit door een specifieke live plaats wanneer een kaartprovider een betrouwbaar resultaat levert.',
    mapUrl:url,url,vehicleFit:trip?.transport?[trip.transport]:[],lastChecked:null
  };
}
function existing(day,type){return(day?.recommendations||[]).filter(item=>item?.type===type&&validCoordinate(item.point))}
function overnightRequired(day,index,total,trip){
  if(index>=total-1)return false;
  if(day?.kind==='return'&&day?.to===trip?.origin)return false;
  return validCoordinate(day?.toPoint||day?.fromPoint);
}
function addIfMissing(day,type,point,trip){
  if(!validCoordinate(point)||existing(day,type).length)return false;
  day.recommendations=day.recommendations||[];
  day.recommendations.push(fallbackItem(type,day,point,trip,day.recommendations.length));
  return true;
}
export function ensureCanonicalRecommendationCoverage(trip,destination,plan){
  if(!plan?.days?.length)return plan;
  const days=plan.days,total=days.length;let added=0,requiredNights=0;
  for(let index=0;index<days.length;index++){
    const day=days[index];day.recommendations=(day.recommendations||[]).filter(item=>item&&validCoordinate(item.point));
    const roadHours=Number(day.roadHours??day.driveHours??0),distance=Number(day.distanceKm||0),travel=['outward','transfer','return','daytrip'].includes(day.kind);
    const needsNight=overnightRequired(day,index,total,trip);
    if(needsNight){
      requiredNights++;
      const point=validCoordinate(day.toPoint)?day.toPoint:validCoordinate(day.fromPoint)?day.fromPoint:null;
      if(addIfMissing(day,'accommodation',point,trip))added++;
    }else{
      day.recommendations=day.recommendations.filter(item=>item.type!=='accommodation');
    }
    // Every calendar day gets at least one useful non-accommodation map target.
    if(day.kind==='daytrip'){
      const target=validCoordinate(day.destinationPoint)?day.destinationPoint:pointAt(day,.5);
      if(addIfMissing(day,'activity',target,trip))added++;
    }
    if(travel){
      if(addIfMissing(day,'restaurant',pointAt(day,.52),trip))added++;
      if(distance>=70||roadHours>=1.4){if(addIfMissing(day,'rest',pointAt(day,.40),trip))added++}
      if(distance>=90){if(addIfMissing(day,'fuel',pointAt(day,.64),trip))added++}
    }else{
      const target=validCoordinate(day.destinationPoint)?day.destinationPoint:validCoordinate(day.toPoint)?day.toPoint:pointAt(day,.5);
      if(addIfMissing(day,'activity',target,trip))added++;
      if(addIfMissing(day,'restaurant',validCoordinate(day.toPoint)?day.toPoint:target,trip))added++;
    }
    day.sleepProposal=existing(day,'accommodation')[0]||null;
  }
  plan.recommendations=days.flatMap(day=>day.recommendations||[]);
  const specific=plan.recommendations.filter(x=>x.live&&x.genericFallback!==true&&validCoordinate(x.point)).length;
  const planned=plan.recommendations.filter(x=>!x.live&&validCoordinate(x.point)).length;
  const representedNights=days.filter((day,index)=>overnightRequired(day,index,total,trip)&&day.sleepProposal&&validCoordinate(day.sleepProposal.point)).length;
  plan.recommendationCoverage={requiredDays:total,daysWithPoi:days.filter(day=>(day.recommendations||[]).some(x=>x.type!=='accommodation'&&validCoordinate(x.point))).length,requiredNights,representedNights,specific,planned,completeDays:days.every(day=>(day.recommendations||[]).some(x=>x.type!=='accommodation'&&validCoordinate(x.point))),completeNights:representedNights>=requiredNights,addedFallbacks:added};
  return plan;
}
export function preserveEnrichmentOnCanonicalBase(basePlan,enrichedPlan,trip,destination){
  const base=clone(basePlan);const enriched=enrichedPlan||{};
  for(let i=0;i<(base.days||[]).length;i++){
    const src=enriched.days?.[i];if(!src)continue;
    base.days[i].recommendations=clone(src.recommendations||[]);
    base.days[i].sleepProposal=src.sleepProposal?clone(src.sleepProposal):null;
  }
  for(const key of ['weather','placeData','poiData','accommodationData','canonicalResolution'])if(enriched[key]!=null)base[key]=clone(enriched[key]);
  return ensureCanonicalRecommendationCoverage(trip,destination,base);
}
