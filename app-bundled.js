'use strict';

const VERSION = '0.2.1';
const BUILD = '201';
const CURRENT_KEY = 'reisslim.current.v2';
const LEGACY_CURRENT_KEY = 'reisslim.current';
const TRIPS_KEY = 'reisslim.trips.v2';

const preferenceDefinitions = [
  ['natuur','Natuur'],['bergen','Bergen'],['zwemmen','Zwemmen'],['wandelen','Wandelen'],
  ['kinderen','Kindvriendelijk'],['motor','Mooie wegen'],['cultuur','Cultuur'],['eten','Eten'],
  ['kust','Kust'],['budget','Budget']
];

const destinations = [
  {id:'slovenia',name:'Slovenië & Julische Alpen',country:'Slovenië',lat:46.369,lon:14.113,distanceKm:1180,driveHours:12.5,nightMid:145,foodDaily:105,activityDaily:55,toll:130,tags:['natuur','bergen','zwemmen','wandelen','kinderen','motor'],season:[4,5,6,7,8,9],family:9,motorcycle:9,camper:8,weather:8,crowds:6,summary:'Compact, groen en veelzijdig met meren, bergen en overzichtelijke afstanden.',pros:['Sterke mix van natuur en activiteiten','Goede prijs-kwaliteit','Veel afwisseling op korte afstand'],cons:['Lange aanreis vanuit Nederland','Bled kan druk zijn in hoogseizoen'],stops:[['Saasveld',52.33,6.81],['Neurenberg',49.45,11.08],['Bled',46.37,14.11],['Bohinj',46.28,13.89],['Kranjska Gora',46.49,13.79]]},
  {id:'blackforest',name:'Zwarte Woud & Elzas',country:'Duitsland / Frankrijk',lat:48.0,lon:8.1,distanceKm:620,driveHours:6.5,nightMid:135,foodDaily:110,activityDaily:45,toll:35,tags:['natuur','zwemmen','wandelen','kinderen','motor','cultuur'],season:[3,4,5,6,7,8,9,10],family:9,motorcycle:8,camper:9,weather:7,crowds:7,summary:'Dichtbij, flexibel en ideaal voor gezinnen of een eerste roadtripconcept.',pros:['Korte aanreis','Veel regenalternatieven','Makkelijk te combineren met Elzas'],cons:['Minder exotisch','Sommige toeristische plaatsen druk'],stops:[['Saasveld',52.33,6.81],['Koblenz',50.36,7.59],['Triberg',48.13,8.23],['Freiburg',47.99,7.85],['Colmar',48.08,7.36]]},
  {id:'austria',name:'Tirol & Salzburgerland',country:'Oostenrijk',lat:47.27,lon:11.39,distanceKm:930,driveHours:9.5,nightMid:165,foodDaily:120,activityDaily:65,toll:120,tags:['bergen','natuur','wandelen','zwemmen','kinderen','motor'],season:[4,5,6,7,8,9],family:9,motorcycle:9,camper:8,weather:8,crowds:6,summary:'Sterke infrastructuur, indrukwekkende bergen en veel gezinsactiviteiten.',pros:['Zeer goede toeristische infrastructuur','Veel kabelbanen en zwembaden','Sterke motorregio'],cons:['Relatief duur','Tol en vignetten verhogen kosten'],stops:[['Saasveld',52.33,6.81],['Würzburg',49.79,9.95],['Innsbruck',47.27,11.39],['Zell am See',47.32,12.8],['Salzburg',47.81,13.04]]},
  {id:'dolomites',name:'Dolomieten & Gardameer',country:'Italië',lat:46.54,lon:11.9,distanceKm:1110,driveHours:11.5,nightMid:175,foodDaily:125,activityDaily:60,toll:165,tags:['bergen','zwemmen','wandelen','eten','motor','kinderen'],season:[5,6,7,8,9],family:8,motorcycle:10,camper:7,weather:8,crowds:5,summary:'Spectaculaire bergwegen gecombineerd met meren en Italiaans eten.',pros:['Uitzonderlijk landschap','Perfect voor motorritten','Sterke combinatie bergen en water'],cons:['Duurder in hoogseizoen','Drukte rond Gardameer'],stops:[['Saasveld',52.33,6.81],['Ulm',48.4,9.99],['Bolzano',46.5,11.35],['Cortina d’Ampezzo',46.54,12.14],['Riva del Garda',45.89,10.84]]},
  {id:'ardenne',name:'Ardennen & Luxemburg',country:'België / Luxemburg',lat:50.23,lon:5.38,distanceKm:350,driveHours:3.8,nightMid:125,foodDaily:105,activityDaily:40,toll:15,tags:['natuur','wandelen','kinderen','motor','budget'],season:[3,4,5,6,7,8,9,10],family:8,motorcycle:8,camper:8,weather:6,crowds:8,summary:'Betaalbaar, dichtbij en sterk voor een kortere of ontspannen roadtrip.',pros:['Zeer korte aanreis','Budgetvriendelijk','Flexibel bij slecht weer'],cons:['Minder stabiel weer','Minder spectaculair dan Alpen'],stops:[['Saasveld',52.33,6.81],['Dinant',50.26,4.91],['La Roche-en-Ardenne',50.18,5.58],['Vianden',49.94,6.2],['Luxemburg-stad',49.61,6.13]]},
  {id:'normandy',name:'Normandië & Bretagne',country:'Frankrijk',lat:48.64,lon:-1.51,distanceKm:820,driveHours:8.5,nightMid:150,foodDaily:120,activityDaily:50,toll:95,tags:['kust','cultuur','eten','kinderen','natuur'],season:[4,5,6,7,8,9],family:8,motorcycle:7,camper:9,weather:6,crowds:7,summary:'Kust, geschiedenis, dorpjes en veel variatie zonder bergachtige routes.',pros:['Sterke mix cultuur en kust','Veel campings en familieaccommodaties','Goede roadtripstructuur'],cons:['Weer wisselvallig','Meer rijafstand tussen sommige hoogtepunten'],stops:[['Saasveld',52.33,6.81],['Amiens',49.89,2.3],['Étretat',49.71,0.21],['Mont-Saint-Michel',48.64,-1.51],['Saint-Malo',48.65,-2.03]]}
];

const FIELD_IDS = ['origin','startDate','days','budget','adults','children','transport','maxDrive','maxChanges','comfort','notes'];
const state={trip:null,ranked:[],destination:null,itinerary:[],budget:null,validation:[]};
const $=id=>document.getElementById(id);
let map, mapLayer;

function uniqueId(){
  if(globalThis.crypto && typeof globalThis.crypto.randomUUID==='function') return globalThis.crypto.randomUUID();
  return `trip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function safeParse(value,fallback){try{return value?JSON.parse(value):fallback}catch{return fallback}}
function saveDraft(data){try{localStorage.setItem(CURRENT_KEY,JSON.stringify({...data,savedAt:new Date().toISOString()}))}catch(err){console.warn('Draft save failed',err)}}
function loadDraft(){
  let current=null;
  try{current=safeParse(localStorage.getItem(CURRENT_KEY),null)}catch{}
  if(current)return current;
  let legacy=null;
  try{legacy=safeParse(localStorage.getItem(LEGACY_CURRENT_KEY),null)}catch{}
  if(legacy){saveDraft(legacy);try{localStorage.removeItem(LEGACY_CURRENT_KEY)}catch{}}
  return legacy;
}
function clearDraft(){try{localStorage.removeItem(CURRENT_KEY);localStorage.removeItem(LEGACY_CURRENT_KEY)}catch{}}
function saveTrip(data){
  let all=[];try{all=safeParse(localStorage.getItem(TRIPS_KEY),[])}catch{}
  const record={...data,savedAt:new Date().toISOString()};
  const tripId=record.trip?.id;
  const updated=[record,...(tripId?all.filter(x=>x.trip?.id!==tripId):all)].slice(0,20);
  try{localStorage.setItem(TRIPS_KEY,JSON.stringify(updated))}catch{}
}
function getFormElements(){return Object.fromEntries(FIELD_IDS.map(id=>[id,$(id)]))}
function readTripForm(existingId=null){
  const f=getFormElements();
  return {id:existingId||uniqueId(),origin:f.origin.value.trim(),startDate:f.startDate.value,days:Number(f.days.value),budget:Number(f.budget.value),adults:Number(f.adults.value),children:Number(f.children.value),transport:f.transport.value,maxDrive:Number(f.maxDrive.value),maxChanges:Number(f.maxChanges.value),comfort:f.comfort.value,notes:f.notes.value.trim(),preferences:[...document.querySelectorAll('[data-pref]:checked')].map(x=>x.value),updatedAt:new Date().toISOString()};
}
function writeTripForm(trip={}){
  const f=getFormElements();
  Object.entries(f).forEach(([key,el])=>{if(el&&trip[key]!==undefined&&trip[key]!==null)el.value=String(trip[key])});
  if(Array.isArray(trip.preferences))document.querySelectorAll('[data-pref]').forEach(box=>box.checked=trip.preferences.includes(box.value));
}
function validateFormTrip(trip){
  const errors=[];
  if(!trip.origin)errors.push('Vul een vertrekplaats in.');
  if(!trip.startDate)errors.push('Kies een startdatum.');
  if(!Number.isFinite(trip.days)||trip.days<3||trip.days>30)errors.push('Kies 3 tot 30 reisdagen.');
  if(!Number.isFinite(trip.budget)||trip.budget<500)errors.push('Het budget moet minimaal €500 zijn.');
  if(!Number.isFinite(trip.adults)||trip.adults<1)errors.push('Er moet minimaal één volwassene reizen.');
  if(!Number.isFinite(trip.maxDrive)||trip.maxDrive<2||trip.maxDrive>10)errors.push('Kies 2 tot 10 uur maximale rijtijd per dag.');
  return errors;
}
function estimateTotal(trip,d){
  const nights=trip.days-1,roomFactor=Math.max(1,Math.ceil((trip.adults+trip.children)/4)),comfortFactor=trip.comfort==='budget'?.78:trip.comfort==='comfort'?1.28:1;
  const accommodation=nights*d.nightMid*roomFactor*comfortFactor;
  const food=trip.days*d.foodDaily*((trip.adults+trip.children*.6)/3.2);
  const activities=trip.days*d.activityDaily*((trip.adults+trip.children*.55)/3.2);
  const consumption=trip.transport==='motorcycle'?4.8:trip.transport==='camper'?10.5:7.2;
  const fuel=(d.distanceKm*2+trip.days*85)/100*consumption*1.95;
  return Math.round(accommodation+food+activities+fuel+d.toll+200);
}
function rankDestinations(trip){
  const month=new Date(`${trip.startDate}T12:00:00`).getMonth()+1;
  return destinations.map(d=>{
    let score=45;const matches=trip.preferences.filter(p=>d.tags.includes(p));score+=matches.length*7;score+=d.season.includes(month)?8:-12;
    const modeScore=trip.transport==='motorcycle'?d.motorcycle:trip.transport==='camper'?d.camper:d.family;score+=(modeScore-5)*2;if(d.driveHours>trip.maxDrive*2.5)score-=7;
    const estimate=estimateTotal(trip,d),budgetRatio=estimate/trip.budget;score+=budgetRatio<=.9?10:budgetRatio<=1.05?4:budgetRatio<=1.2?-8:-18;
    return {...d,score:Math.max(20,Math.min(98,Math.round(score))),estimate,matches,budgetRatio};
  }).sort((a,b)=>b.score-a.score);
}
function addDays(dateString,n){const d=new Date(`${dateString}T12:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function buildItinerary(trip,destination){
  const days=[],stops=destination.stops;
  for(let i=0;i<trip.days;i++){
    let stopIndex=Math.round((i/(trip.days-1))*(stops.length-1));if(i>trip.days/2)stopIndex=Math.max(0,Math.round(((trip.days-1-i)/(trip.days-1))*(stops.length-1)));if(i===trip.days-1)stopIndex=0;
    const stop=stops[stopIndex],travelDay=i===0||i===trip.days-1||i%3===0;
    days.push({day:i+1,date:addDays(trip.startDate,i),location:stop[0],lat:stop[1],lon:stop[2],title:travelDay?'Reis- en ontdekdag':'Verblijfsdag',description:travelDay?`Rijd richting ${stop[0]}, plan een ruime pauze en houd de middag licht.`:`Verken ${stop[0]} en omgeving. Kies één hoofdactiviteit en houd een weerbestendig alternatief achter de hand.`,driveHours:travelDay?Math.min(trip.maxDrive,i===0?destination.driveHours/2.2:2.5):.5});
  }return days;
}
function buildBudget(trip,destination){
  const nights=trip.days-1,people=trip.adults+trip.children*.6,roomFactor=Math.max(1,Math.ceil((trip.adults+trip.children)/4)),comfortFactor=trip.comfort==='budget'?.78:trip.comfort==='comfort'?1.28:1;
  const accommodation=Math.round(nights*destination.nightMid*roomFactor*comfortFactor),food=Math.round(trip.days*destination.foodDaily*(people/3.2)),activities=Math.round(trip.days*destination.activityDaily*(people/3.2));
  const consumption=trip.transport==='motorcycle'?4.8:trip.transport==='camper'?10.5:7.2,fuel=Math.round((destination.distanceKm*2+trip.days*85)/100*consumption*1.95);
  const rows=[['Accommodatie',accommodation],['Eten & drinken',food],['Activiteiten',activities],['Brandstof',fuel],['Tol & vignetten',destination.toll],['Buffer',200]];
  return {rows,total:rows.reduce((a,r)=>a+r[1],0)};
}
function validateTrip(trip,destination,itinerary,budget){
  const maxDrive=Math.max(...itinerary.map(d=>d.driveHours)),locations=new Set(itinerary.map(d=>d.location));
  return [{level:budget.total<=trip.budget?'ok':budget.total<=trip.budget*1.1?'warn':'bad',label:'Budget',detail:`€${budget.total.toLocaleString('nl-NL')} van €${trip.budget.toLocaleString('nl-NL')}`},{level:maxDrive<=trip.maxDrive?'ok':'bad',label:'Max. rijtijd',detail:`${maxDrive.toFixed(1)} uur`},{level:locations.size-1<=trip.maxChanges?'ok':'warn',label:'Accommodatiewissels',detail:`circa ${Math.max(1,locations.size-1)}`},{level:destination.budgetRatio<=1.05?'ok':'warn',label:'Prijszekerheid',detail:'Indicatief, live prijzen nog niet gekoppeld'},{level:'warn',label:'Broncontrole',detail:'Openingstijden, beschikbaarheid en reisadvies nog extern verifiëren'}];
}
function renderMap(itinerary){
  if(typeof L==='undefined')return;
  if(!map){map=L.map('map').setView([50.5,8],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map)}
  if(mapLayer)mapLayer.remove();mapLayer=L.layerGroup().addTo(map);const coords=[];itinerary.forEach(d=>{coords.push([d.lat,d.lon]);L.marker([d.lat,d.lon]).addTo(mapLayer).bindPopup(`<strong>Dag ${d.day}</strong><br>${d.location}`)});const line=L.polyline(coords,{weight:4}).addTo(mapLayer);map.fitBounds(line.getBounds().pad(.18));setTimeout(()=>map.invalidateSize(),100);
}
function downloadBlob(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadJson(data,name='reisslim-trip.json'){downloadBlob(JSON.stringify(data,null,2),name,'application/json')}
function downloadGpx(trip,destination,itinerary){
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const points=itinerary.map(d=>`<trkpt lat="${d.lat}" lon="${d.lon}"><name>${esc(`Dag ${d.day}: ${d.location}`)}</name><time>${d.date}T09:00:00Z</time></trkpt>`).join('');
  const waypoints=[...new Map(itinerary.map(d=>[d.location,d])).values()].map(d=>`<wpt lat="${d.lat}" lon="${d.lon}"><name>${esc(d.location)}</name></wpt>`).join('');
  downloadBlob(`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="ReisSlim" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(destination.name)}</name></metadata>${waypoints}<trk><name>${esc(destination.name)}</name><trkseg>${points}</trkseg></trk></gpx>`,`${destination.id}-${trip.startDate}.gpx`,'application/gpx+xml');
}
function futureDate(offset){const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)}
function setAutosaveStatus(text){const el=$('autosaveStatus');if(el)el.textContent=text}
function showFormError(text){const el=$('formError');if(!el)return;el.textContent=text;el.classList.toggle('hidden',!text)}
function exportState(){return {version:VERSION,build:BUILD,trip:state.trip,destination:state.destination,itinerary:state.itinerary,budget:state.budget,validation:state.validation}}

function init(){
  const required=['tripForm','preferenceGrid','resultsSection','planSection','resultCount','destinationCards','planTitle','summaryGrid','itinerary','budgetBreakdown','validationList','loadDemoBtn','newTripBtn','saveTripBtn','exportJsonBtn','exportGpxBtn'];
  const missing=required.filter(id=>!$(id));if(missing.length){console.error('Missing UI elements',missing);return}
  $('preferenceGrid').innerHTML=preferenceDefinitions.map(([id,label],i)=>`<label class="pref"><input type="checkbox" data-pref value="${id}" ${i<5?'checked':''}> ${label}</label>`).join('');
  const version=$('versionLabel');if(version)version.textContent=`ReisSlim v${VERSION} · Build ${BUILD} · Stable`;
  const restored=loadDraft();
  if(restored?.trip){state.trip=restored.trip;writeTripForm(restored.trip);setAutosaveStatus('Concept hersteld')}else{if(!$('startDate').value)$('startDate').value=futureDate(30);state.trip=readTripForm();saveDraft({trip:state.trip});setAutosaveStatus('Automatisch opslaan actief')}

  $('tripForm').addEventListener('submit',e=>{
    e.preventDefault();
    try{
      const trip=readTripForm(state.trip?.id),errors=validateFormTrip(trip);if(errors.length){showFormError(errors.join(' '));return}
      showFormError('');state.trip=trip;saveDraft({trip});state.ranked=rankDestinations(trip);renderDestinations();$('resultsSection').classList.remove('hidden');$('planSection').classList.add('hidden');$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){console.error(err);showFormError(`Er ging iets mis: ${err.message || 'onbekende fout'}`)}
  });
  let timer;
  const scheduleAutosave=()=>{clearTimeout(timer);setAutosaveStatus('Wijzigingen opslaan…');timer=setTimeout(()=>{try{state.trip=readTripForm(state.trip?.id);saveDraft({trip:state.trip});setAutosaveStatus('Automatisch opgeslagen')}catch{setAutosaveStatus('Opslaan mislukt')}},250)};
  $('tripForm').addEventListener('input',scheduleAutosave);$('tripForm').addEventListener('change',scheduleAutosave);
  $('loadDemoBtn').addEventListener('click',()=>{const demo={id:state.trip?.id||uniqueId(),origin:'Saasveld',days:9,budget:3200,adults:2,children:2,transport:'car',maxDrive:5,maxChanges:3,comfort:'mid',notes:'Natuur, zwembad en niet te veel accommodatiewissels.',preferences:['natuur','bergen','zwemmen','wandelen','kinderen'],startDate:futureDate(30)};state.trip=demo;writeTripForm(demo);saveDraft({trip:demo});setAutosaveStatus('Voorbeeld opgeslagen')});
  $('newTripBtn').addEventListener('click',()=>{if(!confirm('Nieuwe reis starten? De huidige conceptinvoer wordt gewist.'))return;clearDraft();state.trip=null;state.ranked=[];state.destination=null;state.itinerary=[];state.budget=null;state.validation=[];$('tripForm').reset();document.querySelectorAll('[data-pref]').forEach((box,i)=>box.checked=i<5);const defaults={origin:'Saasveld',startDate:futureDate(30),days:10,budget:3500,adults:2,children:2,transport:'car',maxDrive:5,maxChanges:3,comfort:'mid',notes:'',preferences:preferenceDefinitions.slice(0,5).map(x=>x[0])};writeTripForm(defaults);$('resultsSection').classList.add('hidden');$('planSection').classList.add('hidden');state.trip=readTripForm();saveDraft({trip:state.trip});setAutosaveStatus('Nieuw concept gestart');window.scrollTo({top:0,behavior:'smooth'})});
  $('saveTripBtn').addEventListener('click',()=>{if(!state.destination)return;saveTrip(exportState());$('saveTripBtn').textContent='Opgeslagen ✓';setTimeout(()=>$('saveTripBtn').textContent='Opslaan',1500)});
  $('exportJsonBtn').addEventListener('click',()=>{if(state.destination)downloadJson(exportState(),`${state.destination.id}-${state.trip.startDate}.json`)});
  $('exportGpxBtn').addEventListener('click',()=>{if(state.destination)downloadGpx(state.trip,state.destination,state.itinerary)});
}
function renderDestinations(){
  $('resultCount').textContent=`${state.ranked.length} opties`;
  $('destinationCards').innerHTML=state.ranked.slice(0,6).map(d=>`<article class="destination-card"><div class="card-body"><div class="score">${d.score}%</div><h3>${d.name}</h3><p class="muted">${d.summary}</p><div class="chips">${d.matches.map(m=>`<span class="chip">${m}</span>`).join('')}<span class="chip">± €${d.estimate.toLocaleString('nl-NL')}</span></div><div class="pros-cons"><div><strong>Sterk</strong><ul>${d.pros.map(x=>`<li>${x}</li>`).join('')}</ul></div><div><strong>Let op</strong><ul>${d.cons.map(x=>`<li>${x}</li>`).join('')}</ul></div></div><button data-select="${d.id}" type="button">Kies deze reis</button></div></article>`).join('');
  $('destinationCards').querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>selectDestination(button.dataset.select)));
}
function selectDestination(id){state.destination=state.ranked.find(d=>d.id===id);if(!state.destination)return;state.itinerary=buildItinerary(state.trip,state.destination);state.budget=buildBudget(state.trip,state.destination);state.validation=validateTrip(state.trip,state.destination,state.itinerary,state.budget);renderPlan();$('planSection').classList.remove('hidden');saveDraft(exportState());$('planSection').scrollIntoView({behavior:'smooth',block:'start'})}
function renderPlan(){
  $('planTitle').textContent=state.destination.name;
  $('summaryGrid').innerHTML=[['Match',`${state.destination.score}%`],['Dagen',state.trip.days],['Afstand heen',`${state.destination.distanceKm} km`],['Budget',`€${state.budget.total.toLocaleString('nl-NL')}`]].map(x=>`<div class="summary-card"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  $('itinerary').innerHTML=state.itinerary.map(d=>`<div class="day-card"><h4>Dag ${d.day} · ${new Date(`${d.date}T12:00:00`).toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'})}</h4><strong>${d.location} — ${d.title}</strong><p>${d.description}</p><small>Indicatieve rijtijd: ${d.driveHours.toFixed(1)} uur</small></div>`).join('');
  $('budgetBreakdown').innerHTML=state.budget.rows.map(r=>`<div class="budget-row"><span>${r[0]}</span><strong>€${r[1].toLocaleString('nl-NL')}</strong></div>`).join('')+`<div class="budget-row"><strong>Totaal</strong><strong>€${state.budget.total.toLocaleString('nl-NL')}</strong></div>`;
  $('validationList').innerHTML=state.validation.map(v=>`<div class="validation-row ${v.level}"><span>${v.label}</span><strong>${v.detail}</strong></div>`).join('');renderMap(state.itinerary);
}

document.addEventListener('DOMContentLoaded',init);
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?build=201').catch(console.warn))}
