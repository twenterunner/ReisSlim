import { haversineKm, interpolateRoutePoint } from './route-engine.js';
const toRadians=value=>value*Math.PI/180;
function shiftedPoint(point,origin,destination,offsetKm,progress,side=1){const middleLatitude=toRadians((origin.lat+destination.lat)/2),dLat=destination.lat-origin.lat,dLon=(destination.lon-origin.lon)*Math.cos(middleLatitude),length=Math.hypot(dLat,dLon)||1,perpendicularLat=-dLon/length,perpendicularLon=dLat/length/Math.max(.2,Math.cos(middleLatitude)),degrees=offsetKm/111;return{...point,lat:Number((point.lat+side*perpendicularLat*degrees).toFixed(5)),lon:Number((point.lon+side*perpendicularLon*degrees).toFixed(5)),progress,alternate:true}}
export function buildAlternativeReturnNodes(origin,destination,legCount,{offsetKm=null}={}){
 const required=Math.max(0,legCount-1),directKm=haversineKm(origin,destination)||500;
 const effectiveOffset=offsetKm??Math.max(95,Math.min(240,directKm*.22));
 const stops=[];
 // For a real loop we deliberately pull the return corridor farther away at mid-route.
 for(let index=1;index<=required;index++){const progress=index/legCount,direct=interpolateRoutePoint(origin,destination,progress,{}),wave=Math.sin(Math.PI*progress),offset=effectiveOffset*(.82+.18*wave);stops.push(shiftedPoint(direct,origin,destination,offset,progress,1))}
 return[{...destination,progress:1,role:'destination'},...stops.reverse().map((point,index)=>({...point,name:`Lus-terugroute ${index+1}`,role:'overnight'})),{...origin,progress:0,role:'return'}]
}
function sampleGeometry(points,intervalKm=20){const samples=[];for(let index=0;index<points.length-1;index++){const from=points[index],to=points[index+1],distance=haversineKm(from,to)||0,count=Math.max(1,Math.ceil(distance/intervalKm));for(let step=0;step<count;step++)samples.push(interpolateRoutePoint(from,to,step/count))}if(points.length)samples.push(points.at(-1));return samples.filter(Boolean)}
export function geometryOverlap(outbound=[],inbound=[],thresholdKm=15){const first=sampleGeometry(outbound),second=sampleGeometry(inbound);if(!first.length||!second.length)return 1;const matched=second.filter(point=>first.some(other=>(haversineKm(point,other)??Infinity)<=thresholdKm)).length;return Number((matched/second.length).toFixed(2))}
export function routeExplorationMetrics(outbound=[],inbound=[]){const overlap=geometryOverlap(outbound,inbound);return{overlap,explorationScore:Math.round((1-overlap)*100),method:'sampled-geodesic-overlap',thresholdKm:15}}
