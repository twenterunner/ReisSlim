import { collectPlanWaypoints, collectRouteSegments } from './itinerary-engine.js';
import { validCoordinate } from './config.js';
import { enrichPlanWithPlaces } from './place-provider.js';

const OSRM_URL='https://router.project-osrm.org';

export const escapeXml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function safeFilename(value,extension){const base=String(value||'reisslim-reis').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'reisslim-reis';return`${base}.${extension}`;}
const sameCoordinate=(a,b)=>validCoordinate(a)&&validCoordinate(b)&&Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lon-b.lon)<1e-7;

async function fetchOsrmGeometry(from,to,{fetchImpl=globalThis.fetch,timeoutMs=8000,osrmUrl=OSRM_URL}={}){
  if(typeof fetchImpl!=='function'||!validCoordinate(from)||!validCoordinate(to))return null;
  const url=new URL(`/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}`,osrmUrl);
  url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false',alternatives:'false'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{signal:controller.signal,headers:{accept:'application/json'}});
    if(!response.ok)return null;
    const payload=await response.json(),route=payload?.routes?.[0];
    const coords=route?.geometry?.coordinates||[];
    return coords.length>=2?coords.map(([lon,lat])=>({lat,lon})):null;
  }catch{return null;}finally{clearTimeout(timer);}
}

function densify(from,to,stepKm=4){
  if(!validCoordinate(from)||!validCoordinate(to))return[];
  const latKm=(to.lat-from.lat)*111,lonKm=(to.lon-from.lon)*111*Math.cos(((from.lat+to.lat)/2)*Math.PI/180);
  const distance=Math.max(1,Math.hypot(latKm,lonKm)),count=Math.max(2,Math.ceil(distance/stepKm));
  return Array.from({length:count+1},(_,i)=>({lat:from.lat+(to.lat-from.lat)*i/count,lon:from.lon+(to.lon-from.lon)*i/count}));
}

async function fullRouteSegments(plan,options={}){
  const routeDays=(plan?.days||[]).filter(day=>['outward','return','transfer'].includes(day.kind)&&validCoordinate(day.fromPoint)&&validCoordinate(day.toPoint));
  const results=new Array(routeDays.length);let next=0;
  const runners=Array.from({length:Math.min(3,routeDays.length)},async()=>{
    while(true){
      const i=next++;if(i>=routeDays.length)return;
      const day=routeDays[i];
      let geometry=Array.isArray(day.geometry)?day.geometry.filter(validCoordinate):[];
      // If current plan has genuine provider geometry, preserve it.
      if(geometry.length<20||!['osrm','openrouteservice','tomtom'].includes(day.routeSource)){
        const live=await fetchOsrmGeometry(day.fromPoint,day.toPoint,options);
        geometry=live?.length?live:densify(day.fromPoint,day.toPoint);
      }
      results[i]={day:day.day,kind:day.kind,source:geometry.length>=20?'road-geometry':'corridor',points:geometry};
    }
  });
  await Promise.all(runners);
  return results.filter(Boolean);
}

function recommendationFor(point,plan){
  for(const day of plan?.days||[])for(const item of day.recommendations||[])if(validCoordinate(item.point)&&sameCoordinate(point,item.point)&&String(item.name||'')===String(point.name||''))return item;
  return null;
}

export function createGpx(trip,destination,plan,{routeSegments=null}={}){
  const segments=routeSegments||collectRouteSegments(plan);
  const planPoints=collectPlanWaypoints(plan).filter(validCoordinate);
  const waypoints=planPoints.map(point=>{
    const rec=recommendationFor(point,plan),link=rec?.mapUrl||rec?.url||rec?.websiteUrl||'';
    const detail=rec?`${point.date||''} · ${rec.type} · specifiek genoemd ReisSlim-voorstel · ${rec.source||''}`:`${point.date||''} · ${point.role||'routepunt'}`;
    const linkXml=/^https?:\/\//.test(String(link))?`<link href="${escapeXml(link)}"><text>Web / kaart / reviews</text></link>`:'';
    return `<wpt lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(`Dag ${point.day||0}: ${point.name}`)}</name><desc>${escapeXml(detail)}</desc><type>${escapeXml(point.role||rec?.type||'waypoint')}</type>${linkXml}</wpt>`;
  }).join('');

  // One continuous track is deliberately exported for maximum GPX viewer compatibility.
  const all=[];
  for(const segment of segments){
    for(const point of segment.points.filter(validCoordinate)){
      const last=all.at(-1);
      if(!last||!sameCoordinate(last,point))all.push(point);
    }
  }
  const continuous=`<trk><name>${escapeXml(`${destination.name} · volledige roadtrip`)}</name><desc>Volledige routegeometrie van ReisSlim. Bij live beschikbaarheid gebaseerd op OSRM/routeprovider; anders gedensificeerde corridor.</desc><trkseg>${all.map(p=>`<trkpt lat="${p.lat}" lon="${p.lon}"></trkpt>`).join('')}</trkseg></trk>`;

  const daily=segments.map(segment=>`<rte><name>${escapeXml(`Dag ${segment.day} · ${segment.kind}`)}</name>${segment.points.filter(validCoordinate).map((p,i)=>`<rtept lat="${p.lat}" lon="${p.lon}"><name>${escapeXml(`Routepunt ${i+1}`)}</name></rtept>`).join('')}</rte>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ReisSlim ${escapeXml(trip.startDate)}" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(destination.name)}</name><desc>Volledige roadtriproute plus specifieke stop-, lunch- en accommodatie-waypoints.</desc></metadata>${waypoints}${continuous}${daily}</gpx>`;
}

export function createJson(data){return JSON.stringify(data,null,2);}
export function downloadBlob(content,name,type){const anchor=document.createElement('a');anchor.href=URL.createObjectURL(new Blob([content],{type}));anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(anchor.href),1000);}

export async function downloadGpx(trip,destination,plan,options={}){
  // GPX export is self-sufficient: resolve specific named places again and obtain
  // full road geometry even if background enrichment had not finished yet.
  let exportPlan=plan;
  try{ exportPlan=await enrichPlanWithPlaces(trip,destination,plan,{...options,placeTimeoutMs:5500,weatherTimeoutMs:2500}); }catch{}
  const segments=await fullRouteSegments(exportPlan,options);
  const content=createGpx(trip,destination,exportPlan,{routeSegments:segments});
  downloadBlob(content,safeFilename(`${destination.id}-${trip.startDate}`,'gpx'),'application/gpx+xml');
  return{segments:segments.length,trackPoints:segments.reduce((sum,s)=>sum+s.points.length,0),specificWaypoints:(exportPlan.recommendations||[]).length};
}
export function downloadJson(data,name='reisslim-reis'){downloadBlob(createJson(data),safeFilename(name,'json'),'application/json');}
