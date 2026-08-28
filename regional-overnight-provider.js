import { mapConcurrent, makeCache } from './roadtrip-runtime-engine.js?v=1923';

const NOMINATIM='https://nominatim.openstreetmap.org/reverse';
const finite=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
const rad=x=>x*Math.PI/180;
function geoKm(a,b){if(!finite(a)||!finite(b))return Infinity;const R=6371,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),x=rad(a.lat),y=rad(b.lat),h=Math.sin(d1/2)**2+Math.cos(x)*Math.cos(y)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function seed(origin,km,bearing){const R=6371,a=km/R,b=rad(bearing),lat1=rad(origin.lat),lon1=rad(origin.lon),lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b)),lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));return{lat:lat2*180/Math.PI,lon:((lon2*180/Math.PI+540)%360)-180}}
function locality(row){const a=row?.address||{};return row?.name||a.city||a.town||a.village||a.municipality||a.county||null}
async function reversePoint(point,fetchImpl,timeoutMs){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const u=new URL(NOMINATIM);u.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),format:'jsonv2',zoom:'10',addressdetails:'1'});
  const r=await fetchImpl(u,{headers:{accept:'application/json'},signal:controller.signal});if(!r.ok)return null;
  const row=await r.json(),name=locality(row),p={lat:Number(row?.lat),lon:Number(row?.lon)};
  if(!name||!finite(p))return null;
  return{name:String(name),lat:p.lat,lon:p.lon,country:row?.address?.country||'Live regio',countryCode:String(row?.address?.country_code||'').toUpperCase(),osmType:row?.osm_type||null,osmId:row?.osm_id||row?.place_id||null};
 }catch{return null}finally{clearTimeout(timer)}
}
export function buildRegionalSeeds(trip,origin,anchor){
 const sameAnchor=finite(anchor)&&geoKm(origin,anchor)<=12,centre=finite(anchor)?anchor:origin;
 const radii=sameAnchor?[55,85,120,160,205]:[40,70,105,145,190];
 const bearings=[0,45,90,135,180,225,270,315],rows=[];
 for(let b=0;b<bearings.length;b++)for(let r=0;r<radii.length;r++)rows.push(seed(centre,radii[r],bearings[b]+(r%2?22.5:0)));
 return rows;
}
export async function discoverRegionalOvernightCandidates(trip,origin,anchor,{fetchImpl=globalThis.fetch,timeoutMs=5500,maxRequests=24,concurrency=6,onProgress}={}){
 if(typeof fetchImpl!=='function'||!finite(origin))return[];
 const seeds=buildRegionalSeeds(trip,origin,anchor).slice(0,maxRequests);
 const cache=makeCache(globalThis.localStorage,'reisslim.regional-seeds.v2');
 const keyBase=`${origin.lat.toFixed(2)},${origin.lon.toFixed(2)}:${finite(anchor)?`${anchor.lat.toFixed(2)},${anchor.lon.toFixed(2)}`:'none'}:${trip.days}`;
 const results=await mapConcurrent(seeds,async(point,index)=>{
   const cached=cache.get(`${keyBase}:${index}`);
   if(cached)return cached;
   const found=await reversePoint(point,fetchImpl,timeoutMs);
   if(found)cache.set(`${keyBase}:${index}`,found);
   return found;
 },{concurrency,onProgress});

 const out=[];
 for(const result of results){
   const found=result?.error?null:result;
   if(!found||!finite(found))continue;
   if(geoKm(origin,found)<35)continue;
   if(out.some(x=>geoKm(x,found)<18))continue;
   out.push(found);
   if(out.length>=14)break;
 }
 return out.map((p,i)=>({id:`regional-seed-${p.osmType||'place'}-${p.osmId||i}`,name:`${p.name} & omgeving`,country:p.country,distanceKm:Math.round(geoKm(origin,p)*1.18),driveHours:null,nightMid:125,activityDaily:45,toll:0,tags:['natuur','cultuur','eten'],season:[1,2,3,4,5,6,7,8,9,10,11,12],family:7,motorcycle:8,camper:7,weather:7,crowds:7,summary:`Live gevonden overnachtingsregio rond ${p.name}.`,pros:['Echte benoemde plaats','Onafhankelijke regionale fallback'],cons:['Verblijf en POI’s worden na selectie live ingevuld'],routeStops:[],bases:[{name:p.name,lat:p.lat,lon:p.lon}],activities:[],poiRichness:30,dynamic:true,roadtripCandidate:true,discoverySource:'OpenStreetMap Nominatim regional seeds'}));
}
