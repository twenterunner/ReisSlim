import { validCoordinate } from './config.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAY_COLORS=['#0f6b61','#3b72a8','#7a5dc7','#c95e42','#c58b2b','#2f7d62','#9a5b8f','#4a92b5'];
const TILE_SIZE=256,MAX_LAT=85.05112878;

export function buildMapModel(plan){
  const routes=(plan.days||[]).map(d=>({day:d.day,kind:d.kind,geometry:(d.geometry||[]).filter(validCoordinate),source:d.routeSource||'offline-estimate'}));
  const pois=(plan.offlinePois||[]).filter(validCoordinate);
  const rests=(plan.days||[]).flatMap(day=>(day.plannedStops||[]).filter(validCoordinate).map(stop=>({...stop,day:day.day})));
  const nights=(plan.overnights||[]).map(n=>({night:n.night,state:n.state,point:n.state==='SPECIFIC_LIVE_ACCOMMODATION'?n.property:n.zone})).filter(x=>validCoordinate(x.point));
  return{routes,pois,rests,nights,origin:plan.origin,destinationId:plan.destinationId};
}
export function mapConsistency(plan,model=buildMapModel(plan)){return{valid:model.routes.length===plan.days.length&&model.routes.every(r=>r.geometry.length>=1)&&model.nights.length===plan.overnights.length&&model.pois.length>0,routeDays:model.routes.length,nights:model.nights.length,pois:model.pois.length,rests:model.rests.length}}

function mercator(point,z){
  const lat=Math.max(-MAX_LAT,Math.min(MAX_LAT,Number(point.lat))),lon=Number(point.lon),scale=TILE_SIZE*(2**z);
  const x=(lon+180)/360*scale,rad=lat*Math.PI/180,y=(1-Math.log(Math.tan(rad)+1/Math.cos(rad))/Math.PI)/2*scale;
  return{x,y};
}
function zoomFor(points,W,H,pad){
  if(points.length<=1)return 9;
  for(let z=14;z>=2;z--){const px=points.map(p=>mercator(p,z)),xs=px.map(p=>p.x),ys=px.map(p=>p.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);if(w<=W-pad*2&&h<=H-pad*2)return z}
  return 2;
}
function mapFrame(points,{W=900,H=520,pad=64}={}){
  const valid=points.filter(validCoordinate);if(!valid.length)return null;const z=zoomFor(valid,W,H,pad),px=valid.map(p=>mercator(p,z)),xs=px.map(p=>p.x),ys=px.map(p=>p.y);
  let minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),width=Math.max(260,maxX-minX+pad*2),height=Math.max(220,maxY-minY+pad*2),aspect=W/H;
  if(width/height<aspect)width=height*aspect;else height=width/aspect;
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;return{z,x:cx-width/2,y:cy-height/2,width,height,xy:p=>mercator(p,z)};
}
function tileLayer(frame,enabled){
  if(!enabled)return `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" class="offline-map-bg"/><g class="offline-map-grid">${Array.from({length:7},(_,i)=>{const x=frame.x+frame.width*i/6;return`<line x1="${x}" y1="${frame.y}" x2="${x}" y2="${frame.y+frame.height}"/>`}).join('')}${Array.from({length:5},(_,i)=>{const y=frame.y+frame.height*i/4;return`<line x1="${frame.x}" y1="${y}" x2="${frame.x+frame.width}" y2="${y}"/>`}).join('')}</g>`;
  const n=2**frame.z,minTileX=Math.floor(frame.x/TILE_SIZE),maxTileX=Math.floor((frame.x+frame.width)/TILE_SIZE),minTileY=Math.max(0,Math.floor(frame.y/TILE_SIZE)),maxTileY=Math.min(n-1,Math.floor((frame.y+frame.height)/TILE_SIZE));const images=[];
  for(let tx=minTileX;tx<=maxTileX;tx++)for(let ty=minTileY;ty<=maxTileY;ty++){const wrapped=((tx%n)+n)%n;images.push(`<image class="osm-tile" href="https://tile.openstreetmap.org/${frame.z}/${wrapped}/${ty}.png" x="${tx*TILE_SIZE}" y="${ty*TILE_SIZE}" width="256" height="256" preserveAspectRatio="none"/>`)}
  return images.join('');
}
function mapHtml(frame,content,{label,liveBasemap=true}={}){
  return `<div class="context-map-shell"><svg viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}" role="img" aria-label="${esc(label||'ReisSlim routekaart')}">${tileLayer(frame,liveBasemap)}${content}</svg><div class="map-attribution">${liveBasemap?'Kaart © OpenStreetMap-bijdragers · ':'Offline routecontext · '}ReisSlim route-overlay</div></div>`;
}
function markerLabel(x,y,text,klass='map-place-label'){return `<text x="${x+11}" y="${y-10}" class="${klass}">${esc(text)}</text>`}

export function renderMap(container,plan,{liveBasemap=plan?.trip?.liveData!==false}={}){
  const model=buildMapModel(plan),all=[plan.origin,...model.routes.flatMap(r=>r.geometry),...model.pois,...model.rests,...model.nights.map(n=>n.point)].filter(validCoordinate),frame=mapFrame(all);if(!frame){container.textContent='Geen kaartgeometrie';return}
  const routeSvg=model.routes.map(route=>{const color=DAY_COLORS[(Math.max(1,Number(route.day))-1)%DAY_COLORS.length],points=route.geometry.map(p=>{const q=frame.xy(p);return`${q.x},${q.y}`}).join(' '),mid=frame.xy(route.geometry[Math.floor(route.geometry.length/2)]);return`<polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".82"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".96"/><g class="day-map-label"><circle cx="${mid.x}" cy="${mid.y}" r="13" fill="${color}"/><text x="${mid.x}" y="${mid.y+4}" text-anchor="middle">D${route.day}</text></g>`}).join('');
  const pois=model.pois.map(p=>{const q=frame.xy(p);return`<g class="poi-map-marker"><circle cx="${q.x}" cy="${q.y}" r="7"/><circle cx="${q.x}" cy="${q.y}" r="2.5" class="poi-core"/><title>POI: ${esc(p.name)}</title></g>`}).join('');
  const rests=model.rests.map(p=>{const q=frame.xy(p);return`<g class="rest-map-marker"><circle cx="${q.x}" cy="${q.y}" r="8"/><text x="${q.x}" y="${q.y+3}" text-anchor="middle">☕</text><title>Ruststop dag ${p.day}: ${esc(p.name)}</title></g>`}).join('');
  const nights=model.nights.map(n=>{const q=frame.xy(n.point);return`<g class="night-map-marker"><rect x="${q.x-8}" y="${q.y-8}" width="16" height="16" rx="4"/><text x="${q.x}" y="${q.y+3}" text-anchor="middle">${n.night}</text><title>Nacht ${n.night}: ${esc(n.point.name||'')}</title></g>`}).join('');
  const endpoints=[];for(const day of plan.days||[]){if(validCoordinate(day.fromPoint))endpoints.push(day.fromPoint);if(validCoordinate(day.toPoint))endpoints.push(day.toPoint)}const seen=new Set(),labels=endpoints.filter(p=>{const k=`${p.id||p.name}`;if(seen.has(k))return false;seen.add(k);return true}).map(p=>{const q=frame.xy(p);return`<g class="city-map-marker"><circle cx="${q.x}" cy="${q.y}" r="4"/>${markerLabel(q.x,q.y,p.name)}</g>`}).join('');
  const oq=frame.xy(plan.origin),origin=`<g class="origin-map-marker"><circle cx="${oq.x}" cy="${oq.y}" r="9"/>${markerLabel(oq.x,oq.y,`Start · ${plan.origin.name}`,'origin-label')}</g>`;
  container.innerHTML=mapHtml(frame,`${routeSvg}${labels}${pois}${rests}${nights}${origin}`,{label:`Routekaart ${plan.destinationName}`,liveBasemap});
}

export function renderDestinationComparisonMap(container,origin,candidates=[],{liveBasemap=true}={}){
  const rows=(candidates||[]).filter(x=>validCoordinate(x.anchor)),points=[origin,...rows.map(x=>x.anchor)].filter(validCoordinate),frame=mapFrame(points,{W:900,H:520,pad:78});if(!frame){container.textContent='Geen kaartgeometrie voor voorstellen';return}
  const oq=frame.xy(origin),spokes=rows.map(row=>{const q=frame.xy(row.anchor);return`<line x1="${oq.x}" y1="${oq.y}" x2="${q.x}" y2="${q.y}" class="discovery-spoke"/>`}).join('');
  const pins=rows.map(row=>{const q=frame.xy(row.anchor);return`<g class="discovery-pin"><circle cx="${q.x}" cy="${q.y}" r="15"/><text x="${q.x}" y="${q.y+4}" text-anchor="middle" class="pin-number">${row.rank}</text>${markerLabel(q.x,q.y,`${row.name} · ${row.score}/100`,'pin-label')}<title>#${row.rank} ${esc(row.name)} · ${row.country} · ${row.score}/100</title></g>`}).join('');
  const originPin=`<g class="origin-pin"><circle cx="${oq.x}" cy="${oq.y}" r="10"/>${markerLabel(oq.x,oq.y,`Start · ${origin.name}`,'origin-label')}</g>`;
  container.innerHTML=mapHtml(frame,`${spokes}${pins}${originPin}`,{label:`Vergelijkingskaart vanaf ${origin.name}`,liveBasemap});
}
