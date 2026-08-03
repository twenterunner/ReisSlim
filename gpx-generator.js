export function downloadGpx(trip,destination,itinerary){
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const points=itinerary.map(d=>`<trkpt lat="${d.lat}" lon="${d.lon}"><name>${esc(`Dag ${d.day}: ${d.location}`)}</name><time>${d.date}T09:00:00Z</time></trkpt>`).join('');
  const waypoints=[...new Map(itinerary.map(d=>[d.location,d])).values()].map(d=>`<wpt lat="${d.lat}" lon="${d.lon}"><name>${esc(d.location)}</name></wpt>`).join('');
  const xml=`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="ReisSlim" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(destination.name)}</name></metadata>${waypoints}<trk><name>${esc(destination.name)}</name><trkseg>${points}</trkseg></trk></gpx>`;
  downloadBlob(xml,`${destination.id}-${trip.startDate}.gpx`,'application/gpx+xml');
}
export function downloadJson(data,name='reisslim-trip.json'){downloadBlob(JSON.stringify(data,null,2),name,'application/json')}
function downloadBlob(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
