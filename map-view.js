import { collectRoutePoints, collectRouteSegments } from './itinerary-engine.js';
import { collectRecommendationPoints } from './recommendation-engine.js';

let map;
let activeLayers=[];
let layerControl;
let activeBounds=[];

const dayColors=['#176b5c','#3b72a8','#7a5dc7','#c95e42','#c58b2b','#2f7d62','#9a5b8f','#4a92b5','#8a6a36','#a84f66','#557a46','#8059a8'];
const poiColors={accommodation:'#e6a53b',restaurant:'#c95e42',activity:'#7a5dc7',fuel:'#2f7d62',rest:'#4a92b5',service:'#7d6845'};
const poiLabels={accommodation:'Overnachten',restaurant:'Eten',activity:'Activiteit',fuel:'Brandstof',rest:'Ruststop',service:'Service'};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function safeUrl(value){try{const url=new URL(String(value||''));return['http:','https:'].includes(url.protocol)?url.href:''}catch{return''}}
function clearLayers(){activeLayers.forEach(item=>item.remove());activeLayers=[];if(layerControl){layerControl.remove();layerControl=null}}
function addOverlay(name){const group=L.layerGroup().addTo(map);activeLayers.push(group);return[name,group]}
function dayColor(day){return dayColors[(Math.max(1,Number(day)||1)-1)%dayColors.length]}
function proposalLinks(item){const links=[];const mapUrl=safeUrl(item.mapUrl||item.url),website=safeUrl(item.websiteUrl),source=safeUrl(item.sourceUrl);if(mapUrl)links.push(`<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">Kaart & reviews</a>`);if(website&&website!==mapUrl)links.push(`<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Website</a>`);if(source&&source!==mapUrl&&source!==website)links.push(`<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">OSM-bron</a>`);return links.length?`<br>${links.join(' · ')}`:''}

function renderLegend(plan,segments,proposals){
  const host=document.getElementById('mapLegendPoi');
  if(!host)return;
  const days=[...new Set(segments.map(segment=>Number(segment.day)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const types=[...new Set(proposals.map(item=>item.type).filter(Boolean))];
  const dayLegend=days.length?days.map(day=>`<span class="map-legend-item"><i style="--legend-color:${dayColor(day)}"></i>Dag ${day}</span>`).join(''):'<span class="muted">Nog geen dagroutes.</span>';
  const poiLegend=types.length?types.map(type=>`<span class="map-legend-item"><i class="poi-dot" style="--legend-color:${poiColors[type]||'#697d78'}"></i>${escapeHtml(poiLabels[type]||type)}</span>`).join(''):'<span class="muted">Nog geen specifieke POI’s.</span>';

  const list=proposals.length
    ? [...proposals].sort((a,b)=>(a.day||0)-(b.day||0)||(a.type||'').localeCompare(b.type||'')).map(item=>{
        const link=safeUrl(item.mapUrl||item.url||item.websiteUrl);
        return `<article class="map-poi-row"><span class="map-poi-day" style="--day-color:${dayColor(item.day)}">D${item.day||'–'}</span><i class="map-poi-type" style="--poi-color:${poiColors[item.type]||'#697d78'}"></i><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(poiLabels[item.type]||item.type||'POI')}${item.reason?` · ${escapeHtml(item.reason)}`:''}</small></div>${link?`<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(item.name)}">↗</a>`:''}</article>`;
      }).join('')
    : '<div class="map-poi-empty">Nog geen specifieke POI’s geladen. Live gevonden stops verschijnen hier automatisch.</div>';

  host.innerHTML=`<section class="map-legend-card"><div class="map-legend-title"><div><span>ROUTELEGENDA</span><strong>Elke reisdag heeft een eigen kleur</strong></div></div><div class="map-legend-block"><small>DAGR ROUTES</small><div class="map-legend-items">${dayLegend}</div></div><div class="map-legend-block"><small>POI TYPES</small><div class="map-legend-items">${poiLegend}</div></div></section><section class="map-poi-card"><div class="map-poi-title"><div><span>GPX WAYPOINTS</span><strong>Specifieke plaatsen in deze reis</strong></div><b>${proposals.length}</b></div><div class="map-poi-list">${list}</div></section>`;
}

export function renderMap(plan,elementId='map'){
  if(typeof L==='undefined')return{rendered:false,reason:'Leaflet is niet geladen.'};
  const routePoints=collectRoutePoints(plan),segments=collectRouteSegments(plan),proposals=collectRecommendationPoints(plan);
  if(!routePoints.length)return{rendered:false,reason:'Geen geldige coördinaten beschikbaar.'};
  if(!map){
    map=L.map(elementId).setView([50.5,8],5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap-bijdragers'}).addTo(map)
  }
  clearLayers();
  const overlays={};
  const[routeName,routeLayer]=addOverlay('Dagroutes');overlays[routeName]=routeLayer;
  const[overnightName,overnightLayer]=addOverlay('Dagpunten & overnachtingen');overlays[overnightName]=overnightLayer;
  const[breakName,breakLayer]=addOverlay('Pauzes & brandstof');overlays[breakName]=breakLayer;
  const[stayName,stayLayer]=addOverlay('Accommodatie');overlays[stayName]=stayLayer;
  const[foodName,foodLayer]=addOverlay('Restaurants');overlays[foodName]=foodLayer;
  const[activityName,activityLayer]=addOverlay('Activiteiten & service');overlays[activityName]=activityLayer;
  const bounds=[];

  segments.forEach(segment=>{
    const coordinates=segment.points.map(point=>[point.lat,point.lon]);
    const liveRoute=['tomtom','openrouteservice','osrm'].includes(segment.source);
    bounds.push(...coordinates);
    const multimodal=segment.mode&&segment.mode!=='road';
    const color=dayColor(segment.day);
    L.polyline(coordinates,{weight:liveRoute?6:5,dashArray:liveRoute?null:multimodal?'3 9':'8 6',opacity:.92,color})
      .addTo(routeLayer)
      .bindPopup(`<strong>Dag ${segment.day}</strong><br><span style="color:${color}">●</span> ${liveRoute?'Live wegroute':multimodal?`Indicatief ${escapeHtml(segment.mode)}-segment`:'Indicatieve corridor'}`)
  });

  routePoints.forEach((point,index)=>{
    bounds.push([point.lat,point.lon]);
    const color=index===0?'#123f3a':dayColor(point.day||1);
    L.circleMarker([point.lat,point.lon],{radius:index===0?8:7,color,fillColor:'#ffffff',fillOpacity:1,weight:4})
      .addTo(overnightLayer)
      .bindPopup(`<strong>${index===0?'Vertrek':point.role==='return'?'Terugkomst':`Dag ${point.day||''}`}</strong><br>${escapeHtml(point.name)}`)
  });

  proposals.forEach(item=>{
    const group=['fuel','rest'].includes(item.type)?breakLayer:item.type==='accommodation'?stayLayer:item.type==='restaurant'?foodLayer:activityLayer;
    bounds.push([item.lat,item.lon]);
    const color=poiColors[item.type]||'#697d78';
    L.circleMarker([item.lat,item.lon],{radius:7,color:'#ffffff',fillColor:color,fillOpacity:.95,weight:3})
      .addTo(group)
      .bindPopup(`<strong>Dag ${item.day}: ${escapeHtml(item.name)}</strong><br><span style="color:${color}">●</span> ${escapeHtml(poiLabels[item.type]||item.type)}<br>${escapeHtml(item.reason||'')}${proposalLinks(item)}`)
  });

  layerControl=L.control.layers(null,overlays,{collapsed:true,position:'topright'}).addTo(map);
  activeBounds=bounds;
  if(activeBounds.length)map.fitBounds(activeBounds,{padding:[30,30]});
  renderLegend(plan,segments,proposals);
  setTimeout(()=>map.invalidateSize(),100);
  return{rendered:true,routePoints:routePoints.length,segments:segments.length,waypoints:proposals.length,source:plan.routing?.source||'estimated-corridor'}
}
export function invalidateMap(){if(map)setTimeout(()=>{map.invalidateSize();if(activeBounds.length)map.fitBounds(activeBounds,{padding:[30,30]})},100)}
