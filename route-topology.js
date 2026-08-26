import { haversineKm, interpolateRoutePoint } from './route-engine.js';
const toRadians=value=>value*Math.PI/180;
function shiftedPoint(point,origin,destination,offsetKm,progress,side=1){const middleLatitude=toRadians((origin.lat+destination.lat)/2),dLat=destination.lat-origin.lat,dLon=(destination.lon-origin.lon)*Math.cos(middleLatitude),length=Math.hypot(dLat,dLon)||1,perpendicularLat=-dLon/length,perpendicularLon=dLat/length/Math.max(.2,Math.cos(middleLatitude)),degrees=offsetKm/111;return{...point,lat:Number((point.lat+side*perpendicularLat*degrees).toFixed(5)),lon:Number((point.lon+side*perpendicularLon*degrees).toFixed(5)),progress,alternate:true}}
export function buildAlternativeReturnNodes(origin,destination,legCount,{offsetKm=null,side=1}={}){
 const required=Math.max(0,legCount-1),directKm=haversineKm(origin,destination)||500;
 // A loop must be visibly different, not a slightly displaced out-and-back. The
 // previous 22% / 95-240 km corridor could still collapse onto the outbound
 // motorway network after live routing. Use a stronger lateral corridor.
 const effectiveOffset=offsetKm??Math.max(120,Math.min(330,directKm*.34));
 const stops=[];
 for(let index=1;index<=required;index++){
   const progress=index/legCount,direct=interpolateRoutePoint(origin,destination,progress,{});
   const envelope=Math.sin(Math.PI*progress);
   const offset=effectiveOffset*(.78+.22*envelope);
   stops.push(shiftedPoint(direct,origin,destination,offset,progress,side));
 }
 return[{...destination,progress:1,role:'destination'},...stops.reverse().map((point,index)=>({...point,name:`Lus-terugroute ${index+1}`,role:'overnight'})),{...origin,progress:0,role:'return'}]
}
function sampleGeometry(points,intervalKm=20){const samples=[];for(let index=0;index<points.length-1;index++){const from=points[index],to=points[index+1],distance=haversineKm(from,to)||0,count=Math.max(1,Math.ceil(distance/intervalKm));for(let step=0;step<count;step++)samples.push(interpolateRoutePoint(from,to,step/count))}if(points.length)samples.push(points.at(-1));return samples.filter(Boolean)}
export function geometryOverlap(outbound=[],inbound=[],thresholdKm=15){const first=sampleGeometry(outbound),second=sampleGeometry(inbound);if(!first.length||!second.length)return 1;const matched=second.filter(point=>first.some(other=>(haversineKm(point,other)??Infinity)<=thresholdKm)).length;return Number((matched/second.length).toFixed(2))}
export function routeExplorationMetrics(outbound=[],inbound=[]){const overlap=geometryOverlap(outbound,inbound);return{overlap,explorationScore:Math.round((1-overlap)*100),method:'sampled-geodesic-overlap',thresholdKm:15}}
