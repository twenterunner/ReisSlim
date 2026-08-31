import { validCoordinate } from './config.js';
import { buildRecommendations } from './recommendation-engine.js';
import { mapConcurrent } from './roadtrip-runtime-engine.js';

const PHOTON='https://photon.komoot.io/reverse';
const NOMINATIM='https://nominatim.openstreetmap.org/reverse';
const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
async function json(url,fetchImpl,timeoutMs){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetchImpl(url,{headers:{accept:'application/json'},signal:c.signal});if(!r?.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(t)}}
function normalizePhoton(payload){const f=payload?.features?.[0],p=f?.properties||{},c=f?.geometry?.coordinates||[],name=p.city||p.town||p.village||p.locality||p.county||p.name;if(!name||!Number.isFinite(Number(c[1]))||!Number.isFinite(Number(c[0])))return null;return{name:String(name),lat:Number(c[1]),lon:Number(c[0]),country:String(p.country||''),countryCode:String(p.countrycode||'').toUpperCase(),source:'Photon'}}
function normalizeNominatim(row){const a=row?.address||{},name=a.city||a.town||a.village||a.municipality||a.county||row?.name;if(!name||!Number.isFinite(Number(row?.lat))||!Number.isFinite(Number(row?.lon)))return null;return{name:String(name),lat:Number(row.lat),lon:Number(row.lon),country:String(a.country||''),countryCode:String(a.country_code||'').toUpperCase(),source:'Nominatim'}}
async function resolveOne(point,fetchImpl,timeoutMs){
  const p=new URL(PHOTON);p.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),limit:'1',lang:'nl'});
  const n=new URL(NOMINATIM);n.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),format:'jsonv2',zoom:'10',addressdetails:'1'});
  const tasks=[json(p,fetchImpl,timeoutMs).then(normalizePhoton),json(n,fetchImpl,timeoutMs).then(normalizeNominatim)];
  try{return await Promise.any(tasks.map(x=>x.then(v=>{if(!v)throw new Error('empty');return v})))}catch{return null}
}
function key(p){return `${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)}`}
function applyResolvedPoint(point,resolved){return{...point,...resolved,name:resolved.name,landValidated:true,canonicalGenerated:false,generatedExploration:false,provisionalRoutePoint:false,canonicalResolved:true}}
export async function resolveCanonicalPlanPlaces(plan,{trip,destination,fetchImpl=globalThis.fetch,timeoutMs=1800,concurrency=6,onProgress}={}){
  if(!plan?.canonicalEngine||typeof fetchImpl!=='function')return plan;const next=clone(plan),targets=[],seen=new Set();
  for(const day of next.days||[]){for(const [field,type] of [['toPoint','overnight'],['destinationPoint','daytrip']]){const p=day[field];if(!validCoordinate(p)||p.canonicalGenerated!==true||p.landValidated===true)continue;const k=key(p);if(seen.has(k))continue;seen.add(k);targets.push({point:p,key:k,type})}}
  const results=await mapConcurrent(targets,async(item,index)=>({item,resolved:await resolveOne(item.point,fetchImpl,timeoutMs)}),{concurrency,onProgress:e=>onProgress?.({type:'canonical-place-resolution',completed:e.completed,total:e.total,index:e.index})});
  const resolvedMap=new Map();for(const row of results){if(row?.resolved)resolvedMap.set(row.item.key,row.resolved)}
  for(let i=0;i<(next.days||[]).length;i++){
    const day=next.days[i],to=day.toPoint,dest=day.destinationPoint;
    if(validCoordinate(to)&&to.canonicalGenerated===true){const r=resolvedMap.get(key(to));if(r){const oldName=day.to;day.toPoint=applyResolvedPoint(to,r);day.to=r.name;day.location=day.kind==='daytrip'?day.location:r.name;day.overnight=day.kind==='return'?trip?.origin||day.overnight:r.name;if(day.primaryPlan)day.primaryPlan=day.primaryPlan.replace(oldName,r.name);const following=next.days[i+1];if(following&&validCoordinate(following.fromPoint)&&key(following.fromPoint)===key(to)){following.fromPoint={...day.toPoint};following.from=r.name}}}
    if(validCoordinate(dest)&&dest.canonicalGenerated===true){const r=resolvedMap.get(key(dest));if(r){day.destinationPoint=applyResolvedPoint(dest,r);day.location=r.name;day.waypoints=(day.waypoints||[]).map(w=>validCoordinate(w)&&key(w)===key(dest)?{...day.destinationPoint,role:w.role||'activity'}:w);day.geometry=(day.geometry||[]).map(p=>validCoordinate(p)&&key(p)===key(dest)?{...day.destinationPoint}:p);day.primaryPlan=`Dagrit vanuit ${day.from} naar ${r.name} en terug naar dezelfde uitvalsbasis.`}}
  }
  if(trip&&destination)next.recommendations=buildRecommendations(trip,destination,next.days||[]);next.canonicalResolution={attempted:targets.length,resolved:resolvedMap.size,pending:Math.max(0,targets.length-resolvedMap.size),complete:resolvedMap.size===targets.length};return next
}
