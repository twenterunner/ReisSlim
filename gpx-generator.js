import { validCoordinate } from './config.js';
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function buildGpx(plan){
  const wpts=[];const seen=new Set();const add=(p,name,type)=>{if(!validCoordinate(p))return;const key=`${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)}:${name}`;if(seen.has(key))return;seen.add(key);wpts.push({p,name,type})};
  add(plan.origin,`Start: ${plan.origin.name}`,'origin');for(const p of plan.offlinePois||[])add(p,p.name,'poi');for(const n of plan.overnights||[]){const p=n.state==='SPECIFIC_LIVE_ACCOMMODATION'?n.property:n.zone;add(p,`Nacht ${n.night}: ${p.name||n.canonicalOvernightName}`,'overnight')}
  const tracks=(plan.days||[]).map(d=>`<trk><name>Dag ${d.day}: ${esc(d.from)} – ${esc(d.to)}</name><trkseg>${(d.geometry||[]).filter(validCoordinate).map(p=>`<trkpt lat="${Number(p.lat).toFixed(6)}" lon="${Number(p.lon).toFixed(6)}"></trkpt>`).join('')}</trkseg></trk>`).join('');
  const points=wpts.map(x=>`<wpt lat="${Number(x.p.lat).toFixed(6)}" lon="${Number(x.p.lon).toFixed(6)}"><name>${esc(x.name)}</name><type>${esc(x.type)}</type></wpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="ReisSlim" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(plan.destinationName)} roadtrip</name></metadata>${points}${tracks}</gpx>`;
}
export function gpxConsistency(plan,gpx){const dayCount=(gpx.match(/<trk>/g)||[]).length,nightCount=(gpx.match(/<type>overnight<\/type>/g)||[]).length;return{valid:dayCount===plan.days.length&&nightCount===plan.overnights.length,dayCount,nightCount,expectedDays:plan.days.length,expectedNights:plan.overnights.length}}
export function downloadGpx(plan){const xml=buildGpx(plan),blob=new Blob([xml],{type:'application/gpx+xml'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`reisslim-${plan.destinationId}.gpx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
