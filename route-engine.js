import { originCatalog, validCoordinate } from './config.js';
import { resolveOrigin } from './trip-model.js';
import { estimateLegTiming, minimumTravelLegs, vehicleProfile } from './vehicle-intelligence.js';

const anchorOrigin=originCatalog.saasveld;
const radians=degrees=>degrees*Math.PI/180;
export function haversineKm(a,b){if(!validCoordinate(a)||!validCoordinate(b))return null;const dLat=radians(b.lat-a.lat),dLon=radians(b.lon-a.lon),value=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLon/2)**2;return 6371*2*Math.asin(Math.sqrt(value))}
export function calculateRouteMetrics(trip,destination){
 const origin=resolveOrigin(trip),destinationPoint=destination.bases[0],profile=vehicleProfile(trip);
 const direct=(origin&&validCoordinate(destinationPoint)?haversineKm(origin,destinationPoint):null);
 const oneWayDistanceKm=Math.max(1,Math.round((direct??destination.distanceKm??500)*1.18));
 const productiveSpeed=trip.transport==='motorcycle'?72:trip.transport==='caravan'?62:trip.transport==='motorhome'?66:78;
 const oneWayRoadHours=Number((oneWayDistanceKm/productiveSpeed*profile.roadTimeFactor).toFixed(1));
 const timing=estimateLegTiming(trip,{distanceKm:oneWayDistanceKm,roadHours:oneWayRoadHours});
 const requiredLegs=minimumCorridorLegs(trip,destination,oneWayDistanceKm,oneWayRoadHours);
 return{origin:origin?{...origin,name:trip.origin,role:'origin',progress:0}:null,originKnown:Boolean(origin),destination:{...destinationPoint,role:'destination',progress:1},oneWayDistanceKm,oneWayRoadHours,oneWayElapsedHours:timing.elapsedHours,oneWayDriveHours:timing.elapsedHours,breakHours:timing.breakHours,requiredLegs,routeSource:'offline-corridor',warning:origin?null:`Voor ${trip.origin} ontbreken coördinaten; controleer de vertrekplaats.`}
}
function minimumCorridorLegs(trip,destination,distanceKm,roadHours){const rough=Math.max(1,minimumTravelLegs(trip,distanceKm,roadHours));return Math.min(8,rough)}
export function selectRouteStops(destination,legCount){const required=Math.max(0,legCount-1),available=[...(destination.routeStops||[])],selected=[];for(let index=1;index<=required&&available.length;index++){const target=index/legCount;available.sort((a,b)=>Math.abs(a.progress-target)-Math.abs(b.progress-target));selected.push(available.shift())}return selected.sort((a,b)=>a.progress-b.progress)}
export function interpolateRoutePoint(from,to,ratio,attributes={}){if(!validCoordinate(from)||!validCoordinate(to))return null;return{lat:Number((from.lat+(to.lat-from.lat)*ratio).toFixed(5)),lon:Number((from.lon+(to.lon-from.lon)*ratio).toFixed(5)),...attributes}}
function generatedStops(origin,destination,legCount){return Array.from({length:Math.max(0,legCount-1)},(_,i)=>{const progress=(i+1)/legCount;return interpolateRoutePoint(origin,destination,progress,{name:`Overnachtingszone ${i+1}`,progress,role:'overnight',approximate:true})}).filter(Boolean)}
export function buildTravelNodes(trip,destination,legCount){const metrics=calculateRouteMetrics(trip,destination),fallbackOrigin={...anchorOrigin,name:trip.origin,role:'origin',progress:0,approximate:true},origin=metrics.origin||fallbackOrigin;let stops=selectRouteStops(destination,legCount).map(point=>({...point,role:'overnight'}));if(stops.length<Math.max(0,legCount-1))stops=generatedStops(origin,metrics.destination,legCount);return{metrics,outbound:[origin,...stops,{...metrics.destination,progress:1}],inbound:[{...metrics.destination,progress:1},...stops.slice().reverse(),{...origin,role:'return'}]}}
export function segmentMetrics(from,to,totalDistanceKm,totalRoadHours){const fromProgress=Number.isFinite(from.progress)?from.progress:0,toProgress=Number.isFinite(to.progress)?to.progress:1,share=Math.max(.02,Math.abs(toProgress-fromProgress));return{distanceKm:Math.max(1,Math.round(totalDistanceKm*share)),roadHours:Number((totalRoadHours*share).toFixed(1))}}
export function buildBreakWaypoints(from,to,timing,transport){const count=Math.max(0,timing?.stopCount||0);return Array.from({length:count},(_,index)=>{const ratio=(index+1)/(count+1);return interpolateRoutePoint(from,to,ratio,{name:timing.fuelStops>index?`Brandstof- en ruststop ${index+1}`:`Ruststop ${index+1}`,role:timing.fuelStops>index?'fuel':'rest',transport,approximate:true})}).filter(Boolean)}
