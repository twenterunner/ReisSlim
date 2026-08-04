'use strict';

const VERSION = '0.5.0';
const BUILD = '500';
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

const FIELD_IDS = ['tripName','origin','startDate','days','budget','adults','children','transport','maxDrive','maxChanges','comfort','notes'];
const state={trip:null,ranked:[],destination:null,itinerary:[],budget:null,validation:[],quality:null,optimized:false,activeView:'dashboardView',compareIds:[]};
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

function loadTrips(){return safeParse(localStorage.getItem(TRIPS_KEY),[]).sort((a,b)=>new Date(b.savedAt||0)-new Date(a.savedAt||0))}
function deleteTrip(id){const updated=loadTrips().filter(item=>item.trip?.id!==id);localStorage.setItem(TRIPS_KEY,JSON.stringify(updated));renderDashboard()}
function loadSavedTrip(id){const saved=loadTrips().find(item=>item.trip?.id===id);if(!saved)return;Object.assign(state,{trip:saved.trip,ranked:[],destination:saved.destination||null,itinerary:saved.itinerary||[],budget:saved.budget||null,validation:saved.validation||[],quality:saved.quality||null,optimized:Boolean(saved.optimized)});writeTripForm(saved.trip);saveDraft(exportState());if(state.destination){state.ranked=rankDestinations(state.trip);renderDestinations();$('resultsSection').classList.remove('hidden');renderPlan();$('planSection').classList.remove('hidden')}showView(state.destination?'itineraryView':'plannerView');renderDashboard()}
function showView(viewId){document.querySelectorAll('.app-view').forEach(view=>view.classList.toggle('active',view.id===viewId));document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.view===viewId));state.activeView=viewId;if(viewId==='mapView'&&map)setTimeout(()=>map.invalidateSize(),100);window.scrollTo({top:0,behavior:'smooth'})}
function tripTitle(trip,destination){return trip?.tripName?.trim()||destination?.name||`Reis vanaf ${trip?.origin||'Nederland'}`}
function renderDashboard(){
  const trips=loadTrips(),trip=state.trip||loadDraft()?.trip;
  $('savedTripCount').textContent=String(trips.length);$('draftDays').textContent=trip?.days?String(trip.days):'—';$('draftBudget').textContent=trip?.budget?`€${Number(trip.budget).toLocaleString('nl-NL')}`:'—';
  $('currentTripSummary').innerHTML=trip?`<h3>${tripTitle(trip,state.destination)}</h3><div class="current-trip-details"><div><span>Vertrek</span><strong>${trip.origin||'—'}</strong></div><div><span>Start</span><strong>${trip.startDate?new Date(trip.startDate+'T12:00:00').toLocaleDateString('nl-NL'):'—'}</strong></div><div><span>Reisduur</span><strong>${trip.days||'—'} dagen</strong></div></div>`:'Nog geen reisconcept.';
  $('savedTripsList').innerHTML=trips.length?trips.map(item=>`<article class="saved-trip"><p class="eyebrow">${item.destination?.country||'Reisconcept'}</p><h3>${tripTitle(item.trip,item.destination)}</h3><p class="muted">${item.trip.days} dagen · €${Number(item.trip.budget).toLocaleString('nl-NL')} · ${item.trip.transport==='motorcycle'?'Motor':item.trip.transport==='camper'?'Camper':'Auto'}</p><div class="saved-trip-actions"><button type="button" data-open-trip="${item.trip.id}">Open</button><button type="button" class="delete-trip" data-delete-trip="${item.trip.id}">Verwijder</button></div></article>`).join(''):'<div class="empty-state">Nog geen opgeslagen reizen. Kies een bestemming en tik op Opslaan.</div>';
  document.querySelectorAll('[data-open-trip]').forEach(b=>b.addEventListener('click',()=>loadSavedTrip(b.dataset.openTrip)));
  document.querySelectorAll('[data-delete-trip]').forEach(b=>b.addEventListener('click',()=>{if(confirm('Deze opgeslagen reis verwijderen?'))deleteTrip(b.dataset.deleteTrip)}));
}
function getFormElements(){return Object.fromEntries(FIELD_IDS.map(id=>[id,$(id)]))}
function readTripForm(existingId=null){
  const f=getFormElements();
  const preferences=[...document.querySelectorAll('[data-pref]:checked')].map(x=>x.value);
  const preferenceWeights=Object.fromEntries(preferences.map(id=>[id,Number(document.querySelector(`[data-priority="${id}"]`)?.value||2)]));
  return {id:existingId||uniqueId(),tripName:f.tripName.value.trim(),origin:f.origin.value.trim(),startDate:f.startDate.value,days:Number(f.days.value),budget:Number(f.budget.value),adults:Number(f.adults.value),children:Number(f.children.value),transport:f.transport.value,maxDrive:Number(f.maxDrive.value),maxChanges:Number(f.maxChanges.value),comfort:f.comfort.value,notes:f.notes.value.trim(),preferences,preferenceWeights,updatedAt:new Date().toISOString()};
}
function writeTripForm(trip={}){
  const f=getFormElements();
  Object.entries(f).forEach(([key,el])=>{if(el&&trip[key]!==undefined&&trip[key]!==null)el.value=String(trip[key])});
  if(Array.isArray(trip.preferences))document.querySelectorAll('[data-pref]').forEach(box=>box.checked=trip.preferences.includes(box.value));
  document.querySelectorAll('[data-priority]').forEach(select=>{select.value=String(trip.preferenceWeights?.[select.dataset.priority]||2);select.disabled=!document.querySelector(`[data-pref][value="${select.dataset.priority}"]`)?.checked});
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
function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,Math.round(value)))}
function metricFor(d,key){
  const tag=(name,yes=90,no=45)=>d.tags.includes(name)?yes:no;
  const metrics={family:d.family*10,motorcycle:d.motorcycle*10,camper:d.camper*10,scenic:clamp((tag('bergen',95,55)+tag('natuur',88,52)+tag('kust',82,48))/3),weather:d.weather*10,crowds:d.crowds*10,swimming:tag('zwemmen',92,42),hiking:tag('wandelen',92,45),food:tag('eten',92,62),culture:tag('cultuur',90,55)};
  return metrics[key]??50;
}
function buildExplanation(trip,d,matches,budgetFit,driveFit,seasonFit){
  const weighted=[...matches].sort((a,b)=>(trip.preferenceWeights?.[b]||2)-(trip.preferenceWeights?.[a]||2));
  const labels=Object.fromEntries(preferenceDefinitions);
  const reasons=[];if(weighted.length)reasons.push(`past sterk bij ${weighted.slice(0,3).map(x=>labels[x].toLowerCase()).join(', ')}`);if(budgetFit>=80)reasons.push('blijft ruim binnen je budget');else if(budgetFit<55)reasons.push('vraagt waarschijnlijk extra budget');if(driveFit>=80)reasons.push('heeft een haalbare aanreis');else reasons.push('heeft een relatief zware aanreis');if(seasonFit<60)reasons.push('is buiten de beste reisperiode');
  return reasons.length?`${d.name} ${reasons.join(', ')}.`:`${d.name} is een redelijke algemene match, maar sluit minder specifiek aan op je gekozen prioriteiten.`;
}
function rankDestinations(trip){
  const month=new Date(`${trip.startDate}T12:00:00`).getMonth()+1;
  return destinations.map(d=>{
    const matches=trip.preferences.filter(p=>d.tags.includes(p));
    const weightedPossible=Math.max(1,trip.preferences.reduce((sum,p)=>sum+(trip.preferenceWeights?.[p]||2),0));
    const weightedMatched=matches.reduce((sum,p)=>sum+(trip.preferenceWeights?.[p]||2),0);
    const preferenceFit=clamp(35+65*(weightedMatched/weightedPossible));
    const estimate=estimateTotal(trip,d),budgetRatio=estimate/trip.budget;
    const budgetFit=clamp(100-Math.max(0,budgetRatio-.82)*120);
    const seasonFit=d.season.includes(month)?92:42;
    const modeFit=trip.transport==='motorcycle'?d.motorcycle*10:trip.transport==='camper'?d.camper*10:d.family*10;
    const dailyLegs=Math.ceil(d.driveHours/trip.maxDrive),driveFit=clamp(100-(dailyLegs-1)*18-Math.max(0,d.driveHours-trip.maxDrive*2)*3);
    const overall=clamp(preferenceFit*.36+budgetFit*.20+seasonFit*.15+modeFit*.17+driveFit*.12,20,98);
    const scores={budget:budgetFit,season:seasonFit,transport:modeFit,driving:driveFit,family:metricFor(d,'family'),motorcycle:metricFor(d,'motorcycle'),camper:metricFor(d,'camper'),scenic:metricFor(d,'scenic'),weather:metricFor(d,'weather'),crowds:metricFor(d,'crowds'),swimming:metricFor(d,'swimming'),hiking:metricFor(d,'hiking'),food:metricFor(d,'food'),culture:metricFor(d,'culture')};
    const confidence=clamp(55+(d.season.includes(month)?15:0)+(budgetRatio<=1.05?12:2)+(matches.length>=2?10:3),45,92);
    return {...d,score:overall,estimate,matches,budgetRatio,scores,confidence,explanation:buildExplanation(trip,d,matches,budgetFit,driveFit,seasonFit),overnightStops:Math.max(0,dailyLegs-1)};
  }).sort((a,b)=>b.score-a.score);
}
function addDays(dateString,n){const d=new Date(`${dateString}T12:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function interpolatePoint(a,b,fraction){return [a[1]+(b[1]-a[1])*fraction,a[2]+(b[2]-a[2])*fraction]}
function buildItinerary(trip,destination){
  const days=[];
  const originStop=destination.stops[0]||[trip.origin,52.1,5.3];
  const destinationStops=destination.stops.slice(2).length?destination.stops.slice(2):destination.stops.slice(1);
  const primary=destinationStops[0]||[destination.name,destination.lat,destination.lon];
  const idealLegs=Math.max(1,Math.ceil(destination.driveHours/trip.maxDrive));
  const maxTravelDays=Math.max(2,trip.days-1);
  const allocatedLegs=Math.max(1,Math.min(idealLegs,Math.floor(maxTravelDays/2)));
  const actualLegHours=destination.driveHours/allocatedLegs;
  const outbound=[];
  for(let leg=1;leg<=allocatedLegs;leg++){
    const fraction=leg/allocatedLegs;
    const [lat,lon]=interpolatePoint(originStop,primary,fraction);
    const isArrival=leg===allocatedLegs;
    outbound.push({
      location:isArrival?primary[0]:`Tussenstop ${leg} richting ${primary[0]}`,
      lat:isArrival?primary[1]:lat,
      lon:isArrival?primary[2]:lon,
      from:leg===1?trip.origin:outbound[leg-2].location,
      to:isArrival?primary[0]:`tussenstop ${leg}`,
      title:'Rijdag',
      description:isArrival?`Rijd van ${leg===1?trip.origin:outbound[leg-2].location} naar ${primary[0]}. Plan onderweg voldoende pauzes en houd de aankomstdag verder rustig.`:`Rijd vanuit ${leg===1?trip.origin:outbound[leg-2].location} richting ${primary[0]} en overnacht onderweg.`,
      driveHours:actualLegHours,
      kind:'travel'
    });
  }
  const returnLegs=[];
  for(let index=0;index<allocatedLegs;index++){
    const isHome=index===allocatedLegs-1;
    const from=index===0?primary[0]:returnLegs[index-1].location;
    const fraction=(allocatedLegs-index-1)/allocatedLegs;
    const [lat,lon]=interpolatePoint(originStop,primary,Math.max(0,fraction));
    returnLegs.push({location:isHome?trip.origin:`Tussenstop ${allocatedLegs-index-1} richting ${trip.origin}`,lat:isHome?originStop[1]:lat,lon:isHome?originStop[2]:lon,from,to:isHome?trip.origin:'tussenstop',title:'Rijdag',description:isHome?`Rijd van ${from} terug naar ${trip.origin}. Plan een ruime pauze en houd na thuiskomst geen verplicht programma meer aan.`:`Begin de terugreis vanuit ${from} en overnacht onderweg richting ${trip.origin}.`,driveHours:actualLegHours,kind:'travel'});
  }
  const stayCount=Math.max(0,trip.days-outbound.length-returnLegs.length);
  const activityTemplates=[
    ['Ontdekdag',`Verken ${primary[0]} en omgeving. Kies één hoofdactiviteit en houd een weerbestendig alternatief achter de hand.`],
    ['Natuur- en uitzichtdag',`Plan een natuuractiviteit rond ${primary[0]}, met voldoende rustmomenten en een kortere optie bij slecht weer.`],
    ['Rustige belevingsdag',`Combineer een rustige ochtend met één lokale bezienswaardigheid, zwemlocatie of dorp in de omgeving van ${primary[0]}.`]
  ];
  const stayDays=Array.from({length:stayCount},(_,i)=>{
    const stop=destinationStops[i%destinationStops.length]||primary;
    const template=activityTemplates[i%activityTemplates.length];
    return {location:stop[0],lat:stop[1],lon:stop[2],title:template[0],description:template[1].replaceAll(primary[0],stop[0]),driveHours:.5,kind:'stay',activityType:i%activityTemplates.length};
  });
  [...outbound,...stayDays,...returnLegs].slice(0,trip.days).forEach((entry,index)=>days.push({...entry,day:index+1,date:addDays(trip.startDate,index)}));
  return days;
}
function calculateTripQuality(trip,destination,itinerary,budget,optimized=false){
  const clampScore=n=>Math.max(35,Math.min(100,Math.round(n)));
  const maxDrive=Math.max(...itinerary.map(d=>d.driveHours));
  const travelDays=itinerary.filter(d=>d.kind==='travel').length;
  const stayDays=itinerary.filter(d=>d.kind==='stay').length;
  const uniqueStayLocations=new Set(itinerary.filter(d=>d.kind==='stay').map(d=>d.location)).size;
  const budgetScore=clampScore(95-Math.max(0,(budget.total/trip.budget-0.9))*110);
  const drivingScore=clampScore(98-Math.max(0,maxDrive-trip.maxDrive)*11-Math.max(0,travelDays-Math.ceil(trip.days*.45))*7);
  const relaxationScore=clampScore(92-Math.max(0,uniqueStayLocations-trip.maxChanges)*12-Math.max(0,travelDays-stayDays)*5+(optimized?5:0));
  const familyBase=trip.children>0?destination.scores.transport:82;
  const familyScore=clampScore(familyBase-(maxDrive>trip.maxDrive?8:0));
  const adventureScore=clampScore((destination.scores.scenic+destination.scores.hiking+destination.scores.swimming)/3+(optimized?3:0));
  const weatherScore=clampScore(destination.scores.weather-(stayDays<2?7:0)+(optimized?8:0));
  const varietyTypes=new Set(itinerary.filter(d=>d.kind==='stay').map(d=>d.activityType)).size;
  const varietyScore=clampScore(62+varietyTypes*11+(optimized?7:0));
  const crowdScore=clampScore(destination.scores.crowds+(optimized?4:0));
  const dimensions={driving:drivingScore,budget:budgetScore,relaxation:relaxationScore,family:familyScore,adventure:adventureScore,weather:weatherScore,variety:varietyScore,crowds:crowdScore};
  const overall=clampScore(Object.values(dimensions).reduce((a,b)=>a+b,0)/Object.keys(dimensions).length);
  const recommendations=[];
  if(maxDrive>trip.maxDrive)recommendations.push({key:'driving',text:`De heen- of terugreis vraagt circa ${maxDrive.toFixed(1)} uur op één dag, boven jouw limiet van ${trip.maxDrive} uur. Voeg reisdag(en) toe of kies een dichterbij gelegen bestemming.`,impact:Math.min(12,Math.ceil((maxDrive-trip.maxDrive)*2))});
  if(relaxationScore<85)recommendations.push({key:'relaxation',text:'Beperk accommodatiewissels en houd minimaal één volledige verblijfsdag zonder lange rit.',impact:6});
  if(weatherScore<82)recommendations.push({key:'weather',text:'Voeg bij elke buitenactiviteit een concreet regenalternatief toe.',impact:5});
  if(varietyScore<85)recommendations.push({key:'variety',text:'Wissel natuur, lokale cultuur, water en een rustige dag beter af.',impact:5});
  if(budgetScore<80)recommendations.push({key:'budget',text:'Verlaag het accommodatieniveau of kies één betaalbaardere uitvalsbasis.',impact:6});
  if(!recommendations.length)recommendations.push({key:'general',text:'Dit plan is al goed gebalanceerd. Controleer vlak voor vertrek alleen live prijzen, weer en openingstijden.',impact:1});
  return {overall,dimensions,recommendations:recommendations.slice(0,4)};
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
function exportState(){return {version:VERSION,build:BUILD,trip:state.trip,destination:state.destination,itinerary:state.itinerary,budget:state.budget,validation:state.validation,quality:state.quality,optimized:state.optimized}}

function init(){
  const required=['compareSection','comparisonTable','clearCompareBtn','tripForm','preferenceGrid','resultsSection','planSection','resultCount','destinationCards','planTitle','summaryGrid','itinerary','budgetBreakdown','validationList','loadDemoBtn','newTripBtn','saveTripBtn','exportJsonBtn','exportGpxBtn','dashboardView','plannerView','itineraryView','mapView','budgetView','savedTripsList','currentTripSummary'];
  const missing=required.filter(id=>!$(id));if(missing.length){console.error('Missing UI elements',missing);return}
  $('preferenceGrid').innerHTML=preferenceDefinitions.map(([id,label],i)=>`<div class="pref priority-item"><label><input type="checkbox" data-pref value="${id}" ${i<5?'checked':''}> <span>${label}</span></label><select data-priority="${id}" aria-label="Prioriteit ${label}" ${i<5?'':'disabled'}><option value="1">Nice to have</option><option value="2" selected>Belangrijk</option><option value="3">Essentieel</option></select></div>`).join('');
  const version=$('versionLabel');if(version)version.textContent=`ReisSlim v${VERSION} · Build ${BUILD} · Stable`;
  const restored=loadDraft();
  if(restored?.trip){Object.assign(state,{trip:restored.trip,destination:restored.destination||null,itinerary:restored.itinerary||[],budget:restored.budget||null,validation:restored.validation||[],quality:restored.quality||null,optimized:Boolean(restored.optimized)});writeTripForm(restored.trip);if(state.destination){state.ranked=rankDestinations(state.trip);renderDestinations();$('resultsSection').classList.remove('hidden');renderPlan();$('planSection').classList.remove('hidden');$('noPlanItinerary').classList.add('hidden');$('mapHint').classList.add('hidden')}setAutosaveStatus('Concept hersteld')}else{if(!$('startDate').value)$('startDate').value=futureDate(30);state.trip=readTripForm();saveDraft({trip:state.trip});setAutosaveStatus('Automatisch opslaan actief')}



  $('preferenceGrid').addEventListener('change',e=>{if(e.target.matches('[data-pref]')){const select=document.querySelector(`[data-priority="${e.target.value}"]`);if(select)select.disabled=!e.target.checked}});
  $('clearCompareBtn').addEventListener('click',()=>{state.compareIds=[];renderComparison();renderDestinations()});
  document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  document.querySelectorAll('[data-go-planner]').forEach(button=>button.addEventListener('click',()=>showView('plannerView')));
  $('brandBtn').addEventListener('click',()=>showView('dashboardView'));
  $('startPlanningBtn').addEventListener('click',()=>showView('plannerView'));
  $('continueTripBtn').addEventListener('click',()=>showView('plannerView'));
  document.querySelectorAll('[data-inspire]').forEach(button=>button.addEventListener('click',()=>{showView('plannerView');const d=destinations.find(x=>x.id===button.dataset.inspire);if(d){$('notes').value=`Ik wil graag richting ${d.name}.`;state.trip=readTripForm(state.trip?.id);saveDraft({trip:state.trip})}}));
  renderDashboard();
  $('tripForm').addEventListener('submit',e=>{
    e.preventDefault();
    try{
      const trip=readTripForm(state.trip?.id),errors=validateFormTrip(trip);if(errors.length){showFormError(errors.join(' '));return}
      showFormError('');state.trip=trip;saveDraft({trip});state.ranked=rankDestinations(trip);renderDestinations();$('resultsSection').classList.remove('hidden');$('planSection').classList.add('hidden');renderDashboard();$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){console.error(err);showFormError(`Er ging iets mis: ${err.message || 'onbekende fout'}`)}
  });
  let timer;
  const scheduleAutosave=()=>{clearTimeout(timer);setAutosaveStatus('Wijzigingen opslaan…');timer=setTimeout(()=>{try{state.trip=readTripForm(state.trip?.id);saveDraft({trip:state.trip});setAutosaveStatus('Automatisch opgeslagen')}catch{setAutosaveStatus('Opslaan mislukt')}},250)};
  $('tripForm').addEventListener('input',scheduleAutosave);$('tripForm').addEventListener('change',scheduleAutosave);
  $('loadDemoBtn').addEventListener('click',()=>{const demo={id:state.trip?.id||uniqueId(),tripName:'Gezinsreis naar de bergen',origin:'Saasveld',days:9,budget:3200,adults:2,children:2,transport:'car',maxDrive:5,maxChanges:3,comfort:'mid',notes:'Natuur, zwembad en niet te veel accommodatiewissels.',preferences:['natuur','bergen','zwemmen','wandelen','kinderen'],preferenceWeights:{natuur:3,bergen:3,zwemmen:2,wandelen:2,kinderen:3},startDate:futureDate(30)};state.trip=demo;writeTripForm(demo);saveDraft({trip:demo});setAutosaveStatus('Voorbeeld opgeslagen')});
  $('newTripBtn').addEventListener('click',()=>{if(!confirm('Nieuwe reis starten? De huidige conceptinvoer wordt gewist.'))return;clearDraft();state.trip=null;state.ranked=[];state.destination=null;state.itinerary=[];state.budget=null;state.validation=[];state.quality=null;state.optimized=false;$('tripForm').reset();document.querySelectorAll('[data-pref]').forEach((box,i)=>box.checked=i<5);document.querySelectorAll('[data-priority]').forEach((select,i)=>{select.value='2';select.disabled=i>=5});const defaults={tripName:'',origin:'Saasveld',startDate:futureDate(30),days:10,budget:3500,adults:2,children:2,transport:'car',maxDrive:5,maxChanges:3,comfort:'mid',notes:'',preferences:preferenceDefinitions.slice(0,5).map(x=>x[0]),preferenceWeights:Object.fromEntries(preferenceDefinitions.slice(0,5).map(x=>[x[0],2]))};writeTripForm(defaults);$('resultsSection').classList.add('hidden');$('planSection').classList.add('hidden');state.trip=readTripForm();saveDraft({trip:state.trip});setAutosaveStatus('Nieuw concept gestart');renderDashboard();showView('plannerView')});
  $('saveTripBtn').addEventListener('click',()=>{if(!state.destination)return;if(!state.trip.tripName){state.trip.tripName=state.destination.name;writeTripForm(state.trip)}saveTrip(exportState());renderDashboard();$('saveTripBtn').textContent='Opgeslagen ✓';setTimeout(()=>$('saveTripBtn').textContent='Opslaan',1500)});
  $('exportJsonBtn').addEventListener('click',()=>{if(state.destination)downloadJson(exportState(),`${state.destination.id}-${state.trip.startDate}.json`)});
  $('exportGpxBtn').addEventListener('click',()=>{if(state.destination)downloadGpx(state.trip,state.destination,state.itinerary)});
  $('improveTripBtn').addEventListener('click',()=>{if(!state.destination)return;state.optimized=true;state.itinerary=state.itinerary.map(day=>day.kind==='stay'?{...day,description:`${day.description} Regenalternatief: kies een museum, wellnesslocatie of overdekte gezinsactiviteit in dezelfde regio.`}:day);state.quality=calculateTripQuality(state.trip,state.destination,state.itinerary,state.budget,true);state.validation=validateTrip(state.trip,state.destination,state.itinerary,state.budget);renderPlan();saveDraft(exportState());$('improveTripBtn').textContent='Verbeteringen toegepast ✓';setTimeout(()=>$('improveTripBtn').textContent='Verbeter mijn reis',1600)});
}
function scorePill(label,value){return `<div class="dimension-score"><span>${label}</span><strong>${value}</strong><i style="--score:${value}%"></i></div>`}
function renderDestinations(){
  $('resultCount').textContent=`${state.ranked.length} opties`;
  $('destinationCards').innerHTML=state.ranked.slice(0,6).map((d,index)=>`<article class="destination-card intelligence-card"><div class="destination-rank">#${index+1}</div><div class="card-body"><div class="score">${d.score}%</div><p class="eyebrow">${d.country}</p><h3>${d.name}</h3><p class="muted">${d.summary}</p><p class="ai-explanation"><strong>Waarom deze?</strong> ${d.explanation}</p><div class="confidence-row"><span>Dataconfidentie</span><strong>${d.confidence}%</strong></div><div class="dimension-grid">${scorePill('Budget',d.scores.budget)}${scorePill('Reiscomfort',d.scores.driving)}${scorePill('Landschap',d.scores.scenic)}${scorePill(state.trip.transport==='motorcycle'?'Motor':'Gezin',d.scores.transport)}</div><div class="chips">${d.matches.map(m=>`<span class="chip">${m}</span>`).join('')}<span class="chip">± €${d.estimate.toLocaleString('nl-NL')}</span>${d.overnightStops?`<span class="chip">${d.overnightStops} tussenstop${d.overnightStops>1?'s':''}</span>`:''}</div><div class="pros-cons"><div><strong>Sterk</strong><ul>${d.pros.map(x=>`<li>${x}</li>`).join('')}</ul></div><div><strong>Let op</strong><ul>${d.cons.map(x=>`<li>${x}</li>`).join('')}</ul></div></div><div class="card-actions"><button data-select="${d.id}" type="button">Kies deze reis</button><label class="compare-toggle"><input type="checkbox" data-compare="${d.id}" ${state.compareIds.includes(d.id)?'checked':''}> Vergelijk</label></div></div></article>`).join('');
  $('destinationCards').querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>selectDestination(button.dataset.select)));
  $('destinationCards').querySelectorAll('[data-compare]').forEach(box=>box.addEventListener('change',()=>toggleCompare(box.dataset.compare,box.checked)));
}
function toggleCompare(id,checked){
  if(checked&&!state.compareIds.includes(id)){if(state.compareIds.length>=3){alert('Je kunt maximaal drie bestemmingen vergelijken.');renderDestinations();return}state.compareIds.push(id)}
  if(!checked)state.compareIds=state.compareIds.filter(x=>x!==id);renderComparison();renderDestinations();
}
function renderComparison(){
  const selected=state.compareIds.map(id=>state.ranked.find(d=>d.id===id)).filter(Boolean),section=$('compareSection');
  section.classList.toggle('hidden',selected.length<2);if(selected.length<2){$('comparisonTable').innerHTML='';return}
  const rows=[['Totale match','score'],['Budget','budget'],['Rijbelasting','driving'],['Seizoen','season'],['Landschap','scenic'],['Weer','weather'],['Rust / drukte','crowds'],['Zwemmen','swimming'],['Wandelen','hiking'],['Eten','food']];
  $('comparisonTable').innerHTML=`<table class="comparison-table"><thead><tr><th>Factor</th>${selected.map(d=>`<th>${d.name}<small>± €${d.estimate.toLocaleString('nl-NL')}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([label,key])=>`<tr><th>${label}</th>${selected.map(d=>`<td><strong>${key==='score'?d.score:d.scores[key]}</strong><span>/100</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  section.scrollIntoView({behavior:'smooth',block:'start'});
}
function selectDestination(id){state.destination=state.ranked.find(d=>d.id===id);if(!state.destination)return;state.itinerary=buildItinerary(state.trip,state.destination);state.budget=buildBudget(state.trip,state.destination);state.validation=validateTrip(state.trip,state.destination,state.itinerary,state.budget);state.optimized=false;state.quality=calculateTripQuality(state.trip,state.destination,state.itinerary,state.budget,false);renderPlan();$('planSection').classList.remove('hidden');$('noPlanItinerary').classList.add('hidden');$('mapHint').classList.add('hidden');saveDraft(exportState());renderDashboard();showView('itineraryView')}
function renderPlan(){
  $('planTitle').textContent=state.destination.name;
  $('summaryGrid').innerHTML=[['Match',`${state.destination.score}%`],['Dagen',state.trip.days],['Afstand heen',`${state.destination.distanceKm} km`],['Budget',`€${state.budget.total.toLocaleString('nl-NL')}`]].map(x=>`<div class="summary-card"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  $('itinerary').innerHTML=state.itinerary.map(d=>`<div class="day-card ${d.kind}"><div class="day-card-inner"><h4>Dag ${d.day} · ${new Date(`${d.date}T12:00:00`).toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'})}</h4><strong>${d.kind==='travel'?`${d.from} → ${d.location}`:`${d.location} — ${d.title}`}</strong><p>${d.description}</p><small>${d.kind==='travel'?'Indicatieve rijtijd':'Lokale rijtijd'}: ${d.driveHours.toFixed(1)} uur</small></div></div>`).join('');
  $('budgetSummary').innerHTML=[['Totaal',`€${state.budget.total.toLocaleString('nl-NL')}`],['Per dag',`€${Math.round(state.budget.total/state.trip.days).toLocaleString('nl-NL')}`],['Per persoon',`€${Math.round(state.budget.total/(state.trip.adults+state.trip.children)).toLocaleString('nl-NL')}`],['Ruimte',`€${(state.trip.budget-state.budget.total).toLocaleString('nl-NL')}`]].map(x=>`<div class="summary-card"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  $('budgetBreakdown').innerHTML=state.budget.rows.map(r=>`<div class="budget-row"><span>${r[0]}</span><strong>€${r[1].toLocaleString('nl-NL')}</strong></div>`).join('')+`<div class="budget-row"><strong>Totaal</strong><strong>€${state.budget.total.toLocaleString('nl-NL')}</strong></div>`;
  $('validationList').innerHTML=state.validation.map(v=>`<div class="validation-row ${v.level}"><span>${v.label}</span><strong>${v.detail}</strong></div>`).join('');
  state.quality=state.quality||calculateTripQuality(state.trip,state.destination,state.itinerary,state.budget,state.optimized);
  const q=state.quality;
  const labels={driving:'Rijden',budget:'Budget',relaxation:'Ontspanning',family:'Familie',adventure:'Avontuur',weather:'Weerbestendigheid',variety:'Variatie',crowds:'Rust / drukte'};
  $('qualityScore').textContent=q.overall;
  $('qualityVerdict').textContent=q.overall>=90?'Uitstekend':q.overall>=80?'Sterk plan':q.overall>=70?'Goed, met verbeterpunten':'Aanpassing aanbevolen';
  $('qualityDimensions').innerHTML=Object.entries(q.dimensions).map(([key,value])=>`<div class="quality-row"><span>${labels[key]}</span><div class="quality-bar"><i style="width:${value}%"></i></div><strong>${value}/100</strong></div>`).join('');
  $('qualityRecommendations').innerHTML=q.recommendations.map((r,i)=>`<li><span>${i+1}</span><p>${r.text}<small>Potentiële verbetering: +${r.impact} punten op dit onderdeel</small></p></li>`).join('');
  $('optimizerSection').classList.remove('hidden');
  renderMap(state.itinerary);
}

document.addEventListener('DOMContentLoaded',init);
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?build=500').catch(console.warn))}
