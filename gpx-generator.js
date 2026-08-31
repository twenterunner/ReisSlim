import { validCoordinate } from './config.js';
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uniq=rows=>{const out=[],seen=new Set();for(const row of rows){const key=String(row||'').trim();if(!key||seen.has(key))continue;seen.add(key);out.push(key)}return out};
function roadLabel(step){return uniq([step?.ref,step?.name]).join(' · ')||step?.maneuver||'Routepunt'}
function routeDetails(day){
  const details=(day.roadDetails||[]).filter(x=>validCoordinate(x)).slice(0,60);
  const rows=[{...day.fromPoint,name:`Start dag ${day.day}: ${day.from}`}];
  for(const step of details){const label=roadLabel(step),last=rows.at(-1);if(last&&last.name===label)continue;rows.push({...step,name:label})}
  rows.push({...day.toPoint,name:`Einde dag ${day.day}: ${day.to}`});return rows.filter(validCoordinate);
}
export function buildGpx(plan){
  const wpts=[];const seen=new Set();const add=(p,name,type,desc='')=>{if(!validCoordinate(p))return;const key=`${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)}:${name}`;if(seen.has(key))return;seen.add(key);wpts.push({p,name,type,desc})};
  add(plan.origin,`Start: ${plan.origin.name}`,'origin','Vertrekpunt ReisSlim');
  for(const p of plan.offlinePois||[])add(p,p.name,'poi',`POI · ${p.type||p.category||'bezienswaardigheid'}`);
  for(const day of plan.days||[])for(const stop of day.plannedStops||[])add(stop,`Rust dag ${day.day}: ${stop.name}`,'rest',stop.reason||`Geplande ruststop na circa ${stop.approxAfterKm||'?'} km`);
  for(const n of plan.overnights||[]){const p=n.state==='SPECIFIC_LIVE_ACCOMMODATION'?n.property:n.zone;add(p,`Nacht ${n.night}: ${p.name||n.canonicalOvernightName}`,'overnight',n.state==='SPECIFIC_LIVE_ACCOMMODATION'?'Specifieke live accommodatie':'Geplande accommodatiezone')}
  const tracks=(plan.days||[]).map(d=>{const roads=uniq((d.roadDetails||[]).map(roadLabel)).slice(0,12),cities=uniq(d.routeCities||[d.from,d.to]);const desc=[`${Math.round(Number(d.distanceKm)||0)} km · ${Number(d.driveHours||0).toFixed(1)} u`,cities.length?`Via ${cities.join(' → ')}`:'',roads.length?`Wegen ${roads.join(' · ')}`:''].filter(Boolean).join(' | ');return`<trk><name>Dag ${d.day}: ${esc(d.from)} – ${esc(d.to)}</name><desc>${esc(desc)}</desc><trkseg>${(d.geometry||[]).filter(validCoordinate).map(p=>`<trkpt lat="${Number(p.lat).toFixed(6)}" lon="${Number(p.lon).toFixed(6)}"></trkpt>`).join('')}</trkseg></trk>`}).join('');
  const routes=(plan.days||[]).map(d=>`<rte><name>Dag ${d.day} routepunten</name><desc>${esc(`${d.from} → ${d.to}`)}</desc>${routeDetails(d).map(p=>`<rtept lat="${Number(p.lat).toFixed(6)}" lon="${Number(p.lon).toFixed(6)}"><name>${esc(p.name)}</name></rtept>`).join('')}</rte>`).join('');
  const points=wpts.map(x=>`<wpt lat="${Number(x.p.lat).toFixed(6)}" lon="${Number(x.p.lon).toFixed(6)}"><name>${esc(x.name)}</name>${x.desc?`<desc>${esc(x.desc)}</desc>`:''}<type>${esc(x.type)}</type></wpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="ReisSlim" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(plan.destinationName)} roadtrip</name><desc>${esc(`ReisSlim ${plan.days.length}-daagse route met POI, ruststops, overnachtingen en ${plan.routing?.status==='live'?'live wegdetails':'offline routecontext'}. Open in een GPX-app met kaartlaag om wegen en plaatsen als basemap te zien.`)}</desc></metadata>${points}${routes}${tracks}</gpx>`;
}
export function gpxConsistency(plan,gpx){const dayCount=(gpx.match(/<trk>/g)||[]).length,routeCount=(gpx.match(/<rte>/g)||[]).length,nightCount=(gpx.match(/<type>overnight<\/type>/g)||[]).length,restCount=(gpx.match(/<type>rest<\/type>/g)||[]).length,expectedRests=(plan.days||[]).flatMap(d=>d.plannedStops||[]).length;return{valid:dayCount===plan.days.length&&routeCount===plan.days.length&&nightCount===plan.overnights.length&&restCount===expectedRests,dayCount,routeCount,nightCount,restCount,expectedDays:plan.days.length,expectedNights:plan.overnights.length,expectedRests}}
export function downloadGpx(plan){const xml=buildGpx(plan),blob=new Blob([xml],{type:'application/gpx+xml'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`reisslim-${plan.destinationId}.gpx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
