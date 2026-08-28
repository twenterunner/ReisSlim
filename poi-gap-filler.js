const ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const valid=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
const esc=s=>String(s||'').replace(/[^\p{L}\p{N} .,'’&-]/gu,'').trim();
function center(day){
 const g=(day.geometry||[]).filter(valid);
 return g.length?g[Math.floor(g.length/2)]:(valid(day.toPoint)?day.toPoint:day.fromPoint);
}
function query(point,need){
 const blocks=[];
 if(need.has('restaurant'))blocks.push(`nwr(around:8000,${point.lat},${point.lon})["amenity"~"restaurant|cafe"]["name"];`);
 if(need.has('fuel'))blocks.push(`nwr(around:12000,${point.lat},${point.lon})["amenity"="fuel"]["name"];`);
 if(need.has('activity'))blocks.push(`nwr(around:12000,${point.lat},${point.lon})["tourism"~"attraction|museum|viewpoint"]["name"];`);
 return `[out:json][timeout:6][maxsize:4194304];(${blocks.join('')});out center tags 60;`;
}
async function fetchOne(endpoint,q,fetchImpl,timeoutMs){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);
 try{const res=await fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams({data:q}),signal:c.signal});if(!res.ok)return[];const data=await res.json();return data?.elements||[]}catch{return[]}finally{clearTimeout(t)}
}
function itemFrom(e,day){
 const tags=e.tags||{},p={lat:Number(e.lat??e.center?.lat),lon:Number(e.lon??e.center?.lon)},name=esc(tags.name||tags['name:en']);
 if(!valid(p)||!name)return null;
 let type='activity',reason='Specifieke stop langs de route';
 if(['restaurant','cafe'].includes(tags.amenity)){type='restaurant';reason='Specifieke eetstop langs de dagroute'}
 else if(tags.amenity==='fuel'){type='fuel';reason='Specifiek tankpunt langs de dagroute'}
 return{type,name,lat:p.lat,lon:p.lon,point:p,day:day.day,live:true,source:'OpenStreetMap',reason,mapUrl:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name+' '+p.lat+','+p.lon)}`};
}
export async function fillMissingDayPois(plan,{fetchImpl=globalThis.fetch,timeoutMs=4500}={}){
 if(typeof fetchImpl!=='function')return plan;
 await Promise.allSettled((plan.days||[]).map(async day=>{
   const p=center(day);if(!valid(p))return;
   const existing=day.recommendations||[];
   const need=new Set();
   if(!existing.some(x=>x.type==='restaurant'))need.add('restaurant');
   if(!existing.some(x=>x.type==='fuel')&&['outward','transfer','return','daytrip'].includes(day.kind))need.add('fuel');
   if(!existing.some(x=>x.type==='activity')&&!['return'].includes(day.kind))need.add('activity');
   if(!need.size)return;
   const q=query(p,need);
   const results=(await Promise.all(ENDPOINTS.map(ep=>fetchOne(ep,q,fetchImpl,timeoutMs)))).flat();
   const seen=new Set(existing.map(x=>`${x.type}:${String(x.name).toLowerCase()}`));
   for(const raw of results){
     const item=itemFrom(raw,day);if(!item||!need.has(item.type)||seen.has(`${item.type}:${item.name.toLowerCase()}`))continue;
     existing.push(item);seen.add(`${item.type}:${item.name.toLowerCase()}`);need.delete(item.type);
     if(!need.size)break;
   }
   day.recommendations=existing;
 }));
 plan.recommendations=(plan.days||[]).flatMap(d=>d.recommendations||[]);
 return plan;
}
