import { validCoordinate } from './config.js?v=1947';
import { transportId } from './vehicle-intelligence.js?v=1947';

const rules={
  car:{accommodation:'Specifiek verblijf wordt live gezocht',stop:'Specifieke ruststop wordt live gezocht',restaurant:'Specifieke eetstop wordt live gezocht',activity:'Specifieke activiteit wordt live gezocht',service:'Specifieke voertuigservice wordt live gezocht'},
  motorcycle:{accommodation:'Specifiek motorvriendelijk verblijf wordt live gezocht',stop:'Specifieke motorstop wordt live gezocht',restaurant:'Specifieke lunch/eetstop wordt live gezocht',activity:'Specifieke stop langs een mooie motorroute wordt live gezocht',service:'Specifiek tankstation wordt live gezocht'},
  motorhome:{accommodation:'Specifieke camperplaats/camping wordt live gezocht',stop:'Specifieke camperstop wordt live gezocht',restaurant:'Specifieke eetstop met ruime parking wordt live gezocht',activity:'Specifieke campergeschikte activiteit wordt live gezocht',service:'Specifieke camperservice wordt live gezocht'},
  caravan:{accommodation:'Specifieke caravancamping wordt live gezocht',stop:'Specifieke doorrijdbare rustplaats wordt live gezocht',restaurant:'Specifieke eetstop met trailerparking wordt live gezocht',activity:'Specifieke bereikbare activiteit wordt live gezocht',service:'Specifiek servicepunt wordt live gezocht'}
};

const EARTH_KM=6371;
function haversine(a,b){
  if(!validCoordinate(a)||!validCoordinate(b))return 0;
  const rad=v=>v*Math.PI/180,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 2*EARTH_KM*Math.asin(Math.min(1,Math.sqrt(h)));
}
function pathFor(day){const geometry=(day.geometry||[]).filter(validCoordinate);if(geometry.length>=2)return geometry;return[day.fromPoint,...(day.waypoints||[]),day.toPoint].filter(validCoordinate)}
function pointAtFraction(day,fraction){
  const points=pathFor(day);if(!points.length)return day.toPoint||day.fromPoint||null;if(points.length===1)return{...points[0]};
  const lengths=[];let total=0;for(let i=1;i<points.length;i++){const length=haversine(points[i-1],points[i]);lengths.push(length);total+=length}
  if(total<=0)return{...points[Math.min(points.length-1,Math.round(fraction*(points.length-1)))]};
  const target=Math.max(0,Math.min(1,fraction))*total;let walked=0;
  for(let i=0;i<lengths.length;i++){const next=walked+lengths[i];if(target<=next||i===lengths.length-1){const ratio=lengths[i]?(target-walked)/lengths[i]:0;return{lat:Number((points[i].lat+(points[i+1].lat-points[i].lat)*ratio).toFixed(6)),lon:Number((points[i].lon+(points[i+1].lon-points[i].lon)*ratio).toFixed(6))}}walked=next}
  return{...points.at(-1)}
}
function offsetPoint(point,seed=0){if(!validCoordinate(point))return null;const offset=((seed%3)-1)*.0015;return{lat:Number((point.lat+offset).toFixed(6)),lon:Number((point.lon-offset).toFixed(6))}}
function proposal({day,type,name,reason,point,transport,seed=0,meal=null,routeFraction=null,accommodationType=null}){return{id:`day-${day}-${type}-${seed}`,day,type,name,reason,point:offsetPoint(point,seed),routeFraction,accommodationType,vehicleFit:[transport],confidence:'pending-live-place',verified:false,source:'ReisSlim zoekt live naam',detourKm:null,openingHours:null,url:null,lastChecked:null,genericFallback:true,live:false,meal}}
function spread(count,min=.18,max=.82,shift=0){if(count<=0)return[];if(count===1)return[Math.max(min,Math.min(max,.5+shift))];return Array.from({length:count},(_,i)=>Math.max(min,Math.min(max,min+(max-min)*(i/(count-1))+shift)))}
function operationalTargets(day,trip,transport,rule){
  const isTravel=['outward','return','transfer','daytrip'].includes(day.kind);if(!isTravel)return[];
  const roadHours=Number(day.roadHours||day.driveHours||0),distance=Number(day.distanceKm||0);if(distance<35&&roadHours<.75)return[];
  const restCount=Math.max(1,Math.min(3,Math.ceil(Math.max(roadHours,1.6)/2.15)-1+(roadHours>=3.2?1:0))),foodCount=roadHours>=6.5?2:1,effectiveRange=Math.max(120,Number(trip.fuelRangeKm||350)*.72),fuelCount=Math.max(distance>=100?1:0,Math.min(3,Math.ceil(distance/effectiveRange)-1)),out=[];
  spread(restCount,.20,.80,-.035).forEach((fraction,index)=>out.push(proposal({day:day.day,type:'rest',name:rule.stop,reason:`Ruststop langs dag ${day.day}, verdeeld over de rijroute zodat pauzes niet op één deel van de reis clusteren.`,point:pointAtFraction(day,fraction),transport,seed:100+index,routeFraction:fraction})));
  spread(foodCount,.32,.68,.015).forEach((fraction,index)=>out.push(proposal({day:day.day,type:'restaurant',name:rule.restaurant,reason:index===0?'Eetstop rond het middelste deel van deze reisdag, dicht bij de route.':'Tweede eet-/koffiestop op het latere deel van een lange reisdag.',point:pointAtFraction(day,fraction),transport,seed:200+index,meal:index===0?'lunch':'break',routeFraction:fraction})));
  spread(fuelCount,.28,.76,.055).forEach((fraction,index)=>out.push(proposal({day:day.day,type:'fuel',name:rule.service,reason:`Tankstop ${index+1}/${fuelCount} langs deze reisdag, gespreid op basis van afstand en ingestelde actieradius.`,point:pointAtFraction(day,fraction),transport,seed:300+index,routeFraction:fraction})));
  return out
}

export function buildRecommendations(trip,destination,days){
  const transport=transportId(trip.transport),rule=rules[transport]||rules.car,all=[];
  for(const day of days){
    const recommendations=[],isTravel=['outward','return','transfer','daytrip'].includes(day.kind),isHomecoming=(day.kind==='return'||day.kind==='daytrip')&&day.to===trip.origin,anchor=day.toPoint||day.fromPoint||destination.bases?.[0];
    recommendations.push(...operationalTargets(day,trip,transport,rule));
    if(day.kind==='daytrip'&&validCoordinate(day.destinationPoint)){
      recommendations.push(proposal({day:day.day,type:'activity',name:rule.activity,reason:'Specifieke natuur-, cultuur- of uitzichtstop rond het echte doel van deze lokale dagrit.',point:day.destinationPoint,transport,seed:8}));
    }
    if(!isHomecoming){
      const accommodationType=trip.accommodationType||'any',accommodationName=accommodationType==='camping'?'Specifieke camping wordt live gezocht':accommodationType==='hotel-bnb'?'Specifiek hotel/B&B wordt live gezocht':rule.accommodation;
      recommendations.push(proposal({day:day.day,type:'accommodation',name:accommodationName,accommodationType,reason:accommodationType==='camping'?'Zoek uitsluitend een specifieke camping zo dicht mogelijk bij de geplande overnachtingsbasis.':accommodationType==='hotel-bnb'?'Zoek uitsluitend een specifiek hotel of B&B zo dicht mogelijk bij de geplande overnachtingsbasis.':'Specifiek verblijf zo dicht mogelijk bij de geplande overnachtingsbasis, met voertuiggeschikte toegang.',point:anchor,transport,seed:4}));
    }
    if(!isTravel&&!isHomecoming)recommendations.push(proposal({day:day.day,type:'restaurant',name:rule.restaurant,reason:'Concreet restaurant bij de uitvalsbasis voor een verblijfsdag.',point:anchor,transport,seed:5,meal:'dinner'}));
    if(!isTravel)recommendations.push(proposal({day:day.day,type:'activity',name:rule.activity,reason:'Specifieke locatie die aansluit bij de geselecteerde voorkeuren.',point:anchor,transport,seed:6}));
    if(['motorhome','caravan'].includes(transport)&&!isHomecoming)recommendations.push(proposal({day:day.day,type:'service',name:rule.service,reason:'Concreet servicepunt met geschikte voertuigtoegang.',point:anchor,transport,seed:7}));
    day.recommendations=recommendations.filter(item=>validCoordinate(item.point));day.sleepProposal=day.recommendations.find(item=>item.type==='accommodation')||null;all.push(...day.recommendations)
  }
  return all
}

export function collectRecommendationPoints(plan){
  /*
   * Coverage contract: every overnight night must remain visible on the map/GPX.
   * Named live POIs are shown as before. For accommodation only, a verified live
   * lookup failure is also exposed as a planned bed marker at the actual overnight
   * coordinate with its external search link. Other unresolved POIs stay hidden so
   * we never pretend a generic restaurant/activity placeholder is a real place.
   */
  return(plan?.recommendations||[])
    .filter(item=>validCoordinate(item.point)&&(item.live&&item.genericFallback!==true||item.type==='accommodation'&&item.lookupComplete===true))
    .map(item=>({...item.point,...item,role:item.type,planned:!item.live}))
}
