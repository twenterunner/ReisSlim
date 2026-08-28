import {readRoutingSettings,saveRoutingSettings,routingConfigured} from './routing-provider.js?v=1922';
export {readRoutingSettings,saveRoutingSettings,routingConfigured};

const URLS=['https://router.project-osrm.org','https://routing.openstreetmap.de/routed-car'];
const valid=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
const rad=v=>v*Math.PI/180;
const km=(a,b)=>{const x=rad(+b.lat-+a.lat),y=rad(+b.lon-+a.lon),q=Math.sin(x/2)**2+Math.cos(rad(+a.lat))*Math.cos(rad(+b.lat))*Math.sin(y/2)**2;return 6371*2*Math.asin(Math.sqrt(q))};
const clone=x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));

async function json(url,fetchImpl,timeoutMs){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);
 try{const response=await fetchImpl(url,{signal:c.signal,headers:{accept:'application/json'}});if(!response.ok)throw new Error(`OSRM ${response.status}`);return await response.json()}finally{clearTimeout(t)}
}
function routeUrl(base,pts){
 const coords=pts.map(p=>`${+p.lon},${+p.lat}`).join(';');
 const u=new URL(`${base}/route/v1/driving/${coords}`);
 u.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false',alternatives:'false',generate_hints:'false'});
 return u;
}
function normalizeRoad(payload){
 const route=payload?.routes?.[0],g=route?.geometry?.coordinates||[];
 if(!route||g.length<2)throw new Error('OSRM gaf geen volledige wegroute');
 return{provider:'osrm',distanceKm:route.distance/1000,roadHours:route.duration/3600,geometry:g.map(([lon,lat])=>({lat:+lat,lon:+lon}))};
}
async function road(points,fetchImpl,timeoutMs){
 const pts=points.filter(valid);if(pts.length<2)throw new Error('Te weinig routepunten');
 // Query both public mirrors concurrently. First valid road geometry wins.
 const tasks=URLS.map(base=>json(routeUrl(base,pts),fetchImpl,Math.max(4500,timeoutMs||9000)).then(normalizeRoad));
 try{return await Promise.any(tasks)}
 catch(firstError){
   // One controlled retry with a longer window prevents first/last-day gaps from
   // transient OSRM mirror failures.
   const retry=URLS.map(base=>json(routeUrl(base,pts),fetchImpl,Math.max(7500,(timeoutMs||9000)+2500)).then(normalizeRoad));
   try{return await Promise.any(retry)}catch{throw firstError}
 }
}
function controls(from,to,side=1,f=.32,count=3){
 const direct=km(from,to);if(!Number.isFinite(direct)||direct<25)return[];
 const mid=rad((+from.lat + +to.lat)/2),dLat=+to.lat-+from.lat,dLon=(+to.lon-+from.lon)*Math.cos(mid),len=Math.hypot(dLat,dLon)||1;
 const pLat=-dLon/len,pLon=dLat/len/Math.max(.25,Math.cos(mid)),off=Math.max(18,Math.min(95,direct*f));
 return Array.from({length:count},(_,i)=>{const t=(i+1)/(count+1),d=off*(.72+.28*Math.sin(Math.PI*t))/111;return{lat:+(+from.lat+(+to.lat-+from.lat)*t+side*pLat*d).toFixed(5),lon:+(+from.lon+(+to.lon-+from.lon)*t+side*pLon*d).toFixed(5)}})
}
function sample(g,spacing=10){if(g.length<2)return g;const o=[g[0]];let walked=0,next=spacing;for(let i=1;i<g.length;i++){const a=g[i-1],b=g[i],s=km(a,b);while(walked+s>=next){const t=(next-walked)/s;o.push({lat:+a.lat+(+b.lat-+a.lat)*t,lon:+a.lon+(+b.lon-+a.lon)*t});next+=spacing}walked+=s}o.push(g.at(-1));return o}
function overlap(a,b){const A=sample(a),B=sample(b),core=B.filter((_,i)=>i>1&&i<B.length-2),pool=core.length?core:B;if(A.length<2||pool.length<2)return 1;return pool.filter(p=>A.some(q=>km(p,q)<=8)).length/Math.max(1,pool.length)}
async function loopReturn(day,outbound,fetchImpl,timeoutMs){
 let best=null;
 for(const [side,f] of [[1,.28],[-1,.28],[1,.40],[-1,.40]]){
   try{const r=await road([day.fromPoint,...controls(day.fromPoint,day.toPoint,side,f),day.toPoint],fetchImpl,timeoutMs);
     const ov=outbound.length>=2?overlap(outbound,r.geometry):null,det=r.distanceKm/Math.max(1,km(day.fromPoint,day.toPoint)),score=(Number.isFinite(ov)?ov*100:35)+Math.max(0,det-1.7)*30;
     if(!best||score<best.score)best={...r,loopOverlap:Number.isFinite(ov)?+ov.toFixed(3):null,score};
     if(Number.isFinite(ov)&&ov<=.35&&det<=1.8)break;
   }catch{}
 }
 if(best){delete best.score;return best}
 return road([day.fromPoint,day.toPoint],fetchImpl,timeoutMs);
}
async function dayTrip(day,fetchImpl,timeoutMs){
 if(!valid(day.destinationPoint))return road([day.fromPoint,day.toPoint],fetchImpl,timeoutMs);
 if(km(day.fromPoint,day.toPoint)<1)return road([day.fromPoint,day.destinationPoint,...controls(day.destinationPoint,day.toPoint,1,.34,2),day.toPoint],fetchImpl,timeoutMs);
 return road([day.fromPoint,day.destinationPoint,day.toPoint],fetchImpl,timeoutMs);
}
function apply(day,r,trip){
 day.geometry=r.geometry;day.routeSource=r.provider;day.distanceKm=Math.round(r.distanceKm);day.roadHours=+r.roadHours.toFixed(2);
 day.driveHours=+(r.roadHours+Math.max(0,+day.breakHours||0)).toFixed(2);day.elapsedHours=day.driveHours;
 if(Number.isFinite(r.loopOverlap))day.routeOverlap=r.loopOverlap;
 if(Number.isFinite(+trip.maxDrive))day.exceedsDailyLimit=day.driveHours>+trip.maxDrive+.05;
}
export async function enrichPlanWithLiveRouting(trip,destination,plan,options={}){
 const fetchImpl=options.fetchImpl||globalThis.fetch;if(!routingConfigured(trip)||typeof fetchImpl!=='function')return plan;
 const next=clone(plan),days=(next.days||[]).filter(d=>['outward','transfer','return','daytrip'].includes(d.kind)&&valid(d.fromPoint)&&valid(d.toPoint));
 let completed=0,applied=0;options.onProgress?.({type:'routing-start',completed,total:days.length});
 // Sequential by design: return-loop routing depends on completed outward geometry.
 const routeOne=async(day,timeoutMs)=>{
   let result;
   if(day.kind==='return'&&trip.routeTopology==='loop'){
     const outbound=(next.days||[]).filter(d=>d.kind==='outward'&&d.routeSource==='osrm'&&Array.isArray(d.geometry)).flatMap(d=>d.geometry).filter(valid);
     result=await loopReturn(day,outbound,fetchImpl,timeoutMs);
   }else if(day.kind==='daytrip')result=await dayTrip(day,fetchImpl,timeoutMs);
   else result=await road([day.fromPoint,day.toPoint],fetchImpl,timeoutMs);
   apply(day,result,trip);
 };
 for(const day of days){
   options.onProgress?.({type:'routing-day-start',day:day.day,completed,total:days.length});
   try{await routeOne(day,options.timeoutMs||9000);applied++}
   catch(e){console.warn(`Live wegroute dag ${day.day} eerste poging mislukt`,e)}
   finally{completed++;options.onProgress?.({type:'routing-day-complete',day:day.day,completed,total:days.length,applied})}
 }
 // Explicitly retry every travel day still lacking real road geometry. This is
 // especially important for day 1 and the final return leg.
 for(const day of days.filter(d=>d.routeSource!=='osrm')){
   try{await routeOne(day,12000);applied++}
   catch(e){console.warn(`Live wegroute dag ${day.day} definitief niet beschikbaar`,e)}
 }
 const ret=(next.days||[]).filter(d=>d.kind==='return'&&Number.isFinite(d.routeOverlap));
 const loopOverlap=ret.length?+(ret.reduce((s,d)=>s+d.routeOverlap,0)/ret.length).toFixed(3):null;
 next.routing={...(next.routing||{}),source:applied===days.length&&days.length?'osrm':applied?'mixed':'estimated-corridor',label:applied===days.length&&days.length?'Live OSRM-wegroute':applied?'Gedeeltelijk live':'Voorlopige route',live:Boolean(days.length&&applied===days.length),completedSegments:applied,totalSegments:days.length,loopOverlap,error:applied<days.length?'Niet alle segmenten konden live over wegen worden berekend.':null};
 if(next.routeMetrics){next.routeMetrics.routeSource=next.routing.source;if(Number.isFinite(loopOverlap))next.routeMetrics.liveLoopOverlap=loopOverlap}
 options.onProgress?.({type:'routing-complete',completed,total:days.length,applied});return next;
}
