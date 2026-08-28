// ReisSlim canonical roadtrip policy.
// This is the single authority for multi-day roadtrip structure and validation.
export const ROADTRIP_POLICY=Object.freeze({
  minRoadMoveKm:50,
  estimatedRoadFactor:1.18,
  motorcycleScenicAverageKmh:55,
  vehicleAverageKmh:Object.freeze({motorcycle:55,car:65,motorhome:55,caravan:50}),
  repeatStayMinDays:6,
  repeatPoiThreshold:85,
  maxRepeatNights:1
});
const finitePoint=p=>Boolean(p)&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
export function geoKm(a,b){
  if(!finitePoint(a)||!finitePoint(b))return Infinity;
  const r=x=>Number(x)*Math.PI/180,R=6371,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),la=r(a.lat),lb=r(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
export const estimatedRoadKm=(a,b)=>geoKm(a,b)*ROADTRIP_POLICY.estimatedRoadFactor;
export function planningSpeedKmh(trip){return ROADTRIP_POLICY.vehicleAverageKmh[trip?.transport]||60}
export function maximumRoadLegKm(trip){
  const hours=Math.max(2,Number(trip?.maxDrive||5));
  return Math.max(120,hours*planningSpeedKmh(trip));
}
export function repeatStayAllowed(point,trip,nightIndex,nightCount){
  const days=Number(trip?.days||0),mid=nightIndex===Math.floor(nightCount/2);
  if(days<ROADTRIP_POLICY.repeatStayMinDays)return false;
  const explicitRest=days>=7&&mid;
  const relaxedRest=trip?.tripPace==='relaxed'&&mid;
  const exceptionalPoi=Number(point?.poiRichness||0)>=ROADTRIP_POLICY.repeatPoiThreshold;
  return Boolean(explicitRest||relaxedRest||exceptionalPoi);
}
export function requiredDistinctOvernights(trip){
  const nights=Math.max(0,Number(trip?.days||0)-1);
  if(nights<=4)return nights;
  return Math.max(3,nights-ROADTRIP_POLICY.maxRepeatNights);
}
function logicalSamePlace(day){
  const a=day?.fromPoint,b=day?.toPoint;
  if(!finitePoint(a)||!finitePoint(b))return false;
  const sameId=String(a.catalogId||day.from||'')===String(b.catalogId||day.to||'');
  return sameId&&geoKm(a,b)<12;
}
export function validateRoadtrip(trip,plan){
  const days=Number(trip?.days||0);
  if(days<=1)return{valid:true,code:'single-day',violations:[],distinct:0,required:0,moves:[]};
  const rows=plan?.days||[],violations=[];
  if(rows.length!==days)violations.push(`day-count:${rows.length}/${days}`);
  const origin=plan?.routeMetrics?.origin||plan?.origin||rows[0]?.fromPoint;
  const overnightRows=trip?.routeTopology==='open-ended'?rows:rows.slice(0,-1);
  const ids=[],moves=[];let repeatedNights=0;
  for(let i=0;i<overnightRows.length;i++){
    const d=overnightRows[i],a=d.fromPoint,b=d.toPoint;
    if(!finitePoint(a)||!finitePoint(b)){violations.push(`missing-coordinate:${i+1}`);continue}
    const same=logicalSamePlace(d);
    const road=Number(d.distanceKm)>0?Number(d.distanceKm):estimatedRoadKm(a,b);
    if(same){
      repeatedNights++;
      if(!d.intentionalStay||!d.stayJustification)violations.push(`unjustified-repeat:${i+1}`);
    }else if(road<ROADTRIP_POLICY.minRoadMoveKm){
      violations.push(`short-move:${i+1}:${Math.round(road)}`);
    }
    moves.push(road);
    ids.push(String(d.toPoint?.catalogId||d.overnight||`${Number(b.lat).toFixed(3)},${Number(b.lon).toFixed(3)}`));
    if(d.toPoint?.generatedExploration===true||d.toPoint?.landValidated===false)violations.push(`synthetic-stop:${i+1}`);
    if(Number(d.elapsedHours??d.driveHours??0)>Number(trip.maxDrive||5)+.05)violations.push(`drive-limit:${i+1}`);
  }
  if(repeatedNights>ROADTRIP_POLICY.maxRepeatNights)violations.push(`too-many-repeat-nights:${repeatedNights}/${ROADTRIP_POLICY.maxRepeatNights}`);
  const distinct=new Set(ids).size,required=requiredDistinctOvernights(trip);
  if(distinct<required)violations.push(`distinct-overnights:${distinct}/${required}`);
  const last=rows.at(-1);
  if(trip?.routeTopology!=='open-ended'){
    if(!finitePoint(origin)||!finitePoint(last?.toPoint)||geoKm(origin,last.toPoint)>12)violations.push('does-not-return-origin');
  }else{
    if(finitePoint(origin)&&finitePoint(last?.toPoint)&&geoKm(origin,last.toPoint)<ROADTRIP_POLICY.minRoadMoveKm)violations.push('open-ended-no-progression');
  }
  return{valid:violations.length===0,code:violations.length?'roadtrip-invalid':'roadtrip-ok',violations,distinct,required,moves,repeatedNights};
}
