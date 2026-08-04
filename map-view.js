import { collectRoutePoints } from './itinerary-engine.js';

let map;
let layer;

const colors = { origin: '#176b5c', return: '#123f3a', overnight: '#e6a53b', destination: '#7a5dc7' };

export function renderMap(plan, elementId = 'map') {
  if (typeof L === 'undefined') return { rendered: false, reason: 'Leaflet is niet geladen.' };
  const points = collectRoutePoints(plan);
  if (!points.length) return { rendered: false, reason: 'Geen geldige coördinaten beschikbaar.' };
  if (!map) {
    map = L.map(elementId).setView([50.5, 8], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap-bijdragers' }).addTo(map);
  }
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  const coordinates = [];
  points.forEach((point, index) => {
    coordinates.push([point.lat, point.lon]);
    L.circleMarker([point.lat, point.lon], { radius: 7, color: colors[point.role] || colors.overnight, fillOpacity: .9 })
      .addTo(layer).bindPopup(`<strong>${index === 0 ? 'Vertrek' : point.role === 'return' ? 'Terugkomst' : `Dag ${point.day || ''}`}</strong><br>${point.name}`);
  });
  const line = L.polyline(coordinates, { weight: 4, dashArray: '8 6', color: '#176b5c' }).addTo(layer);
  map.fitBounds(line.getBounds().pad(.18));
  setTimeout(() => map.invalidateSize(), 100);
  return { rendered: true, points: points.length };
}

export function invalidateMap() {
  if (map) setTimeout(() => map.invalidateSize(), 100);
}
