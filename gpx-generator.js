import { collectPlanWaypoints } from './itinerary-engine.js';
import { validCoordinate } from './config.js';
import { enrichPlanWithPlaces } from './place-provider.js';
const OSRM_URLS=['https://router.project-osrm.org','https://routing.openstreetmap.de/routed-car'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const escapeXml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function safeFilename(value,extension){const base=String(value||'reisslim-reis').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'reisslim-reis';return`${base}.${extension}`}
const same=(a,b)=>validCoordinate(a)&&validCoordinate(b)&&Math.abs(a.lat-b.lat)<1e-7&&Math.abs(a.lon-b.lon)<1e-7;
async function fetchSegment(from,to,fetchImpl,timeoutMs=9000){let lastError;for(const base of OSRM_URLS){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const root=base.endsWith('/routed-car')?`${base}/`:`${base.replace(/\/$/,'')}/`;
      const url=new URL(`route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}`,root);
      url.search=new URLSearchParams({overview:'full',geometries:'geojson',steps:'false',generate_hints:'false'});const response=await fetchImpl(url,{signal:controller.signal,headers:{accept:'application/json'}});if(!response.ok)throw new Error(`OSRM ${response.status}`);const payload=await response.json(),coords=payload?.routes?.[0]?.geometry?.coordinates||[];if(coords.length<20)throw new Error('Te weinig routepunten');return coords.map(([lon,lat])=>({lat,lon}))}catch(error){lastError=error}finally{clearTimeout(timer)}}throw lastError||new Error('Geen volledige wegroute beschikbaar')}
async function routeTrack(plan,fetchImpl){const days=(plan?.days||[]).filter(d=>['outward','return','transfer'].includes(d.kind)&&validCoordinate(d.fromPoint)&&validCoordinate(d.toPoint));const segments=[];
  for(let i=0;i<days.length;i++){
    const day=days[i],existing=(day.geometry||[]).filter(validCoordinate);
    if(existing.length>=20&&['osrm','openrouteservice','tomtom'].includes(day.routeSource))segments.push(existing);
    else segments.push(await fetchSegment(day.fromPoint,day.toPoint,fetchImpl,18000));
    if(i<days.length-1)await sleep(1100);
  }
  const all=[];for(const segment of segments)for(const p of segment){if(!all.length||!same(all.at(-1),p))all.push(p)}if(all.length<20)throw new Error('GPX-route bevat onvoldoende wegpunten');return all}
function recFor(point,plan){for(const day of plan?.days||[])for(const item of day.recommendations||[])if(validCoordinate(item.point)&&same(point,item.point)&&String(item.name||'')===String(point.name||''))return item;return null}
export function createGpx(trip,destination,plan,track){const planPoints=collectPlanWaypoints(plan).filter(validCoordinate);const waypoints=planPoints.map(point=>{const rec=recFor(point,plan),link=rec?.mapUrl||rec?.url||rec?.websiteUrl||'',linkXml=/^https?:\/\//.test(String(link))?`<link href="${escapeXml(link)}"><text>Web / reviews</text></link>`:'';return`<wpt lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(`Dag ${point.day||0}: ${point.name}`)}</name><type>${escapeXml(point.role||rec?.type||'waypoint')}</type>${linkXml}</wpt>`}).join('');const trk=`<trk><name>${escapeXml(`${destination.name} volledige roadtrip`)}</name><trkseg>${track.map(p=>`<trkpt lat="${p.lat}" lon="${p.lon}"></trkpt>`).join('')}</trkseg></trk>`;return`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ReisSlim" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(destination.name)}</name><desc>Volledige wegroute met specifieke ReisSlim-waypoints.</desc></metadata>${waypoints}${trk}</gpx>`}
export function downloadBlob(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
export async function downloadGpx(trip,destination,plan,{fetchImpl=globalThis.fetch}={}){let exportPlan=plan;try{exportPlan=await enrichPlanWithPlaces(trip,destination,plan,{fetchImpl,placeTimeoutMs:5500,weatherTimeoutMs:2500})}catch{}const track=await routeTrack(exportPlan,fetchImpl);const content=createGpx(trip,destination,exportPlan,track);downloadBlob(content,safeFilename(`${destination.id}-${trip.startDate}-full-route`,'gpx'),'application/gpx+xml');return{trackPoints:track.length,specificWaypoints:(exportPlan.recommendations||[]).length}}
export function createJson(data){return JSON.stringify(data,null,2)}
export function downloadJson(data,name='reisslim-reis'){downloadBlob(createJson(data),safeFilename(name,'json'),'application/json')}
