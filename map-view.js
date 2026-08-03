let map,layer;
export function renderMap(itinerary){
  if(!map){map=L.map('map').setView([50.5,8],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map)}
  if(layer)layer.remove();layer=L.layerGroup().addTo(map);
  const coords=[];itinerary.forEach(d=>{coords.push([d.lat,d.lon]);L.marker([d.lat,d.lon]).addTo(layer).bindPopup(`<strong>Dag ${d.day}</strong><br>${d.location}`)});
  const line=L.polyline(coords,{weight:4}).addTo(layer);map.fitBounds(line.getBounds().pad(.18));setTimeout(()=>map.invalidateSize(),100);
}
