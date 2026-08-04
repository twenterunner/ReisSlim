import { collectRoutePoints, collectRouteSegments } from './itinerary-engine.js';
import { collectRecommendationPoints } from './recommendation-engine.js';

let map;
let activeLayers = [];
let layerControl;
let activeBounds = [];

const colors = {
  origin: '#176b5c', return: '#123f3a', overnight: '#e6a53b', destination: '#7a5dc7',
  outward: '#176b5c', returnRoute: '#3b72a8', transfer: '#7a5dc7',
  accommodation: '#e6a53b', restaurant: '#c95e42', activity: '#7a5dc7',
  fuel: '#2f7d62', rest: '#4a92b5', service: '#7d6845'
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);

function clearLayers() {
  activeLayers.forEach(item => item.remove());
  activeLayers = [];
  if (layerControl) {
    layerControl.remove();
    layerControl = null;
  }
}

function addOverlay(name) {
  const group = L.layerGroup().addTo(map);
  activeLayers.push(group);
  return [name, group];
}

export function renderMap(plan, elementId = 'map') {
  if (typeof L === 'undefined') return { rendered: false, reason: 'Leaflet is niet geladen.' };
  const routePoints = collectRoutePoints(plan);
  const segments = collectRouteSegments(plan);
  const proposals = collectRecommendationPoints(plan);
  if (!routePoints.length) return { rendered: false, reason: 'Geen geldige coördinaten beschikbaar.' };
  if (!map) {
    map = L.map(elementId).setView([50.5, 8], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap-bijdragers'
    }).addTo(map);
  }
  clearLayers();

  const overlays = {};
  const [routeName, routeLayer] = addOverlay('Dagroute');
  overlays[routeName] = routeLayer;
  const [overnightName, overnightLayer] = addOverlay('Dagpunten & overnachtingen');
  overlays[overnightName] = overnightLayer;
  const [breakName, breakLayer] = addOverlay('Pauzes & brandstof');
  overlays[breakName] = breakLayer;
  const [stayName, stayLayer] = addOverlay('Accommodatie');
  overlays[stayName] = stayLayer;
  const [foodName, foodLayer] = addOverlay('Restaurants');
  overlays[foodName] = foodLayer;
  const [activityName, activityLayer] = addOverlay('Activiteiten & service');
  overlays[activityName] = activityLayer;

  const bounds = [];
  segments.forEach(segment => {
    const coordinates = segment.points.map(point => [point.lat, point.lon]);
    const liveRoute = ['tomtom', 'openrouteservice', 'osrm'].includes(segment.source);
    bounds.push(...coordinates);
    L.polyline(coordinates, {
      weight: liveRoute ? 5 : 4,
      dashArray: liveRoute ? null : '8 6',
      opacity: .9,
      color: segment.kind === 'return' ? colors.returnRoute : colors[segment.kind] || colors.outward
    }).addTo(routeLayer).bindPopup(`<strong>Dag ${segment.day}</strong><br>${liveRoute ? 'Live wegroute' : 'Indicatieve corridor'}`);
  });

  routePoints.forEach((point, index) => {
    bounds.push([point.lat, point.lon]);
    L.circleMarker([point.lat, point.lon], {
      radius: index === 0 ? 8 : 7,
      color: colors[point.role] || colors.overnight,
      fillOpacity: .95,
      weight: 3
    }).addTo(overnightLayer).bindPopup(`<strong>${index === 0 ? 'Vertrek' : point.role === 'return' ? 'Terugkomst' : `Dag ${point.day || ''}`}</strong><br>${escapeHtml(point.name)}`);
  });

  proposals.forEach(item => {
    const group = ['fuel', 'rest'].includes(item.type)
      ? breakLayer
      : item.type === 'accommodation' ? stayLayer
        : item.type === 'restaurant' ? foodLayer : activityLayer;
    bounds.push([item.lat, item.lon]);
    L.circleMarker([item.lat, item.lon], {
      radius: 6,
      color: colors[item.type] || colors.activity,
      fillColor: colors[item.type] || colors.activity,
      fillOpacity: .75,
      weight: 2
    }).addTo(group).bindPopup(`<strong>Dag ${item.day}: ${escapeHtml(item.name)}</strong><br>${escapeHtml(item.reason)}<br><small>${escapeHtml(item.source)} · ${item.live ? 'live locatie, beschikbaarheid controleren' : 'offline categorievoorstel'}</small>`);
  });

  layerControl = L.control.layers(null, overlays, { collapsed: true, position: 'topright' }).addTo(map);
  activeBounds = bounds;
  if (activeBounds.length) map.fitBounds(activeBounds, { padding: [30, 30] });
  setTimeout(() => map.invalidateSize(), 100);
  return {
    rendered: true,
    routePoints: routePoints.length,
    segments: segments.length,
    waypoints: proposals.length,
    source: plan.routing?.source || 'offline-corridor'
  };
}

export function invalidateMap() {
  if (map) setTimeout(() => {
    map.invalidateSize();
    if (activeBounds.length) map.fitBounds(activeBounds, { padding: [30, 30] });
  }, 100);
}
