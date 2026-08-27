import { collectRoutePoints, collectRouteSegments } from './itinerary-engine.js';
import { collectRecommendationPoints } from './recommendation-engine.js';

let map;
let activeLayers=[];
let layerControl;
let activeBounds=[];
let poiMarkers=[];
let poiCategoryLayers=new Map();
let activePoiTypes=new Set();

const dayColors=['#176b5c','#3b72a8','#7a5dc7','#c95e42','#c58b2b','#2f7d62','#9a5b8f','#4a92b5','#8a6a36','#a84f66','#557a46','#8059a8'];
const poiColors={accommodation:'#e6a53b',restaurant:'#c95e42',activity:'#7a5dc7',fuel:'#2f7d62',rest:'#4a92b5',service:'#7d6845'};
const poiIcons={accommodation:'🛏',restaurant:'🍽',activity:'★',fuel:'⛽',rest:'☕',service:'🔧'};
const poiLabels={accommodation:'Overnachten',restaurant:'Eten',activity:'Bezienswaardigheid',fuel:'Brandstof',rest:'Ruststop',service:'Service'};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function safeUrl(value){try{const url=new URL(String(value||''));return['http:','https:'].includes(url.protocol)?url.href:''}catch{return''}}
function clearLayers(){activeLayers.forEach(item=>item.remove());activeLayers=[];poiMarkers=[];poiCategoryLayers=new Map();activePoiTypes=new Set();if(layerControl){layerControl.remove();layerControl=null}}
function addOverlay(name){const group=L.layerGroup().addTo(map);activeLayers.push(group);return[name,group]}
function dayColor(day){return dayColors[(Math.max(1,Number(day)||1)-1)%dayColors.length]}
function proposalLinks(item){const links=[];const mapUrl=safeUrl(item.mapUrl||item.url),website=safeUrl(item.websiteUrl),source=safeUrl(item.sourceUrl);if(mapUrl)links.push(`<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">Kaart & reviews</a>`);if(website&&website!==mapUrl)links.push(`<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Website</a>`);if(source&&source!==mapUrl&&source!==website)links.push(`<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">OSM-bron</a>`);return links.length?`<br>${links.join(' · ')}`:''}

function poiIcon(item,index,focused=false){
  const color=poiColors[item.type]||'#697d78',day=dayColor(item.day);
  return L.divIcon({
    className:'reisslim-poi-icon-wrap',
    html:`<div class="reisslim-poi-pin ${focused?'focused':''} ${item.live?'live-poi':'planned-poi'}" style="--poi:${color};--day:${day}"><span>${poiIcons[item.type]||'•'}</span><b>${index+1}</b></div>`,
    iconSize:[38,42],iconAnchor:[19,40],popupAnchor:[0,-38]
  });
}
function focusPoi(index){
  const entry=poiMarkers[index];
  if(!entry||!map)return;
  if(!activePoiTypes.has(entry.item.type))setPoiTypeVisible(entry.item.type,true);
  poiMarkers.forEach((current,currentIndex)=>current.marker.setIcon(poiIcon(current.item,currentIndex,currentIndex===index)));
  const latlng=entry.marker.getLatLng();
  map.flyTo(latlng,Math.max(12,map.getZoom()),{duration:.45});
  entry.marker.openPopup();
  const row=document.querySelector(`[data-map-poi-index="${index}"]`);
  document.querySelectorAll('.map-poi-row.is-active').forEach(el=>el.classList.remove('is-active'));
  row?.classList.add('is-active');
  row?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function installLegendInteraction(host){
  if(host.dataset.poiInteraction==='1')return;
  host.dataset.poiInteraction='1';
  host.addEventListener('click',event=>{
    const row=event.target.closest('[data-map-poi-index]');
    if(!row)return;
    if(event.target.closest('a'))return;
    focusPoi(Number(row.dataset.mapPoiIndex));
  });
}


function setPoiTypeVisible(type,visible){
  const layer=poiCategoryLayers.get(type);
  if(!layer||!map)return;
  if(visible){if(!map.hasLayer(layer))layer.addTo(map);activePoiTypes.add(type)}
  else{if(map.hasLayer(layer))map.removeLayer(layer);activePoiTypes.delete(type)}
  document.querySelectorAll(`[data-poi-filter="${type}"]`).forEach(button=>{
    button.setAttribute('aria-pressed',String(visible));
    button.classList.toggle('is-off',!visible);
  });
  document.querySelectorAll(`[data-poi-type-row="${type}"]`).forEach(row=>row.classList.toggle('poi-filtered-out',!visible));
}
function installPoiFilters(host){
  host.querySelectorAll('[data-poi-filter]').forEach(button=>button.addEventListener('click',()=>{
    const type=button.dataset.poiFilter;
    setPoiTypeVisible(type,!activePoiTypes.has(type));
  }));
}

function renderLegend(plan,segments,proposals){
  const host=document.getElementById('mapLegendPoi');
  if(!host)return;
  const days=[...new Set(segments.map(segment=>Number(segment.day)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const types=[...new Set(proposals.map(item=>item.type).filter(Boolean))];
  const dayLegend=days.length?days.map(day=>`<span class="map-legend-item"><i style="--legend-color:${dayColor(day)}"></i>Dag ${day}</span>`).join(''):'';
  const poiLegend=types.length?types.map(type=>`<button type="button" class="map-legend-item poi-filter-button" data-poi-filter="${type}" aria-pressed="true"><i class="poi-dot" style="--legend-color:${poiColors[type]||'#697d78'}"></i>${poiIcons[type]||'•'} ${escapeHtml(poiLabels[type]||type)}</button>`).join(''):'';

  const list=proposals.length
    ? proposals.map((item,index)=>{
        const link=safeUrl(item.mapUrl||item.url||item.websiteUrl);
        return `<article class="map-poi-row ${item.live?'live-poi-row':'planned-poi-row'}" data-poi-type-row="${item.type}" data-map-poi-index="${index}" tabindex="0" role="button" aria-label="Toon ${escapeHtml(item.name)} op kaart"><span class="map-poi-number" style="--poi-color:${poiColors[item.type]||'#697d78'}">${index+1}</span><span class="map-poi-day" style="--day-color:${dayColor(item.day)}">D${item.day||'–'}</span><div><strong>${escapeHtml(item.name)}</strong><small>${poiIcons[item.type]||'•'} ${escapeHtml(poiLabels[item.type]||item.type||'POI')} · ${item.live?'specifiek':'gepland routepunt'}</small></div>${link?`<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Open externe kaart">↗</a>`:'<span></span>'}</article>`;
      }).join('')
    : '<div class="map-poi-empty">Nog geen specifieke POI’s geladen.</div>';

  host.innerHTML=`<section class="map-legend-card"><div class="map-legend-title"><div><span>KAARTLEGENDA</span><strong>Dagroutes & POI’s</strong></div></div><div class="map-legend-items">${dayLegend}${poiLegend}</div></section><section class="map-poi-card"><div class="map-poi-title"><div><span>GPX WAYPOINTS</span><strong>Tik een POI om hem op de kaart te markeren</strong></div><b>${proposals.length}</b></div><div class="map-poi-list">${list}</div></section>`;
  installLegendInteraction(host);installPoiFilters(host);
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
  const[overnightName,overnightLayer]=addOverlay('Dagpunten');overlays[overnightName]=overnightLayer;
  
  const bounds=[];

  segments.forEach(segment=>{
    const coordinates=segment.points.map(point=>[point.lat,point.lon]);
    bounds.push(...coordinates);
    const liveRoute=['tomtom','openrouteservice','osrm'].includes(segment.source);
    const multimodal=segment.mode&&segment.mode!=='road';
    const color=dayColor(segment.day);
    L.polyline(coordinates,{weight:liveRoute?6:5,dashArray:liveRoute?null:multimodal?'3 9':'8 6',opacity:.92,color})
      .addTo(routeLayer)
      .bindPopup(`<strong>Dag ${segment.day}</strong><br><span style="color:${color}">●</span> ${liveRoute?'Live wegroute':'Route'}`)
  });

  routePoints.forEach((point,index)=>{
    bounds.push([point.lat,point.lon]);
    const color=index===0?'#123f3a':dayColor(point.day||1);
    L.circleMarker([point.lat,point.lon],{radius:index===0?8:6,color,fillColor:'#ffffff',fillOpacity:1,weight:4})
      .addTo(overnightLayer)
      .bindPopup(`<strong>${index===0?'Vertrek':point.role==='return'?'Terugkomst':`Dag ${point.day||''}`}</strong><br>${escapeHtml(point.name)}`)
  });

  proposals.forEach((item,index)=>{
    bounds.push([item.lat,item.lon]);
    let group=poiCategoryLayers.get(item.type);
    if(!group){
      group=L.layerGroup().addTo(map);
      poiCategoryLayers.set(item.type,group);
      activePoiTypes.add(item.type);
      activeLayers.push(group);
      overlays[`${poiIcons[item.type]||'•'} ${poiLabels[item.type]||item.type}`]=group;
    }
    const marker=L.marker([item.lat,item.lon],{icon:poiIcon(item,index,false),riseOnHover:true,riseOffset:900})
      .addTo(group)
      .bindPopup(`<strong>${index+1}. ${escapeHtml(item.name)}</strong><br><span style="color:${poiColors[item.type]||'#697d78'}">●</span> ${escapeHtml(poiLabels[item.type]||item.type)} · Dag ${item.day}<br>${escapeHtml(item.reason||'')}${proposalLinks(item)}`);
    marker.on('click',()=>focusPoi(index));
    poiMarkers.push({marker,item});
  });

  layerControl=L.control.layers(null,overlays,{collapsed:true,position:'topright'}).addTo(map);
  activeBounds=bounds;
  if(activeBounds.length)map.fitBounds(activeBounds,{padding:[30,30]});
  renderLegend(plan,segments,proposals);
  setTimeout(()=>map.invalidateSize(),100);
  return{rendered:true,routePoints:routePoints.length,segments:segments.length,waypoints:proposals.length,source:plan.routing?.source||'estimated-corridor'}
}
export function invalidateMap(){if(map)setTimeout(()=>{map.invalidateSize();if(activeBounds.length)map.fitBounds(activeBounds,{padding:[30,30]})},100)}
