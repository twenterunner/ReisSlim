import {destinations} from './data/destinations.js';
import {preferenceDefinitions,readTripForm} from './js/trip-model.js';
import {rankDestinations} from './js/destination-engine.js';
import {buildItinerary} from './js/itinerary-engine.js';
import {buildBudget} from './js/budget-engine.js';
import {validateTrip} from './js/itinerary-validator.js';
import {downloadGpx,downloadJson} from './js/gpx-generator.js';
import {saveTrip,saveCurrent,loadCurrent,clearCurrent} from './js/storage.js';
import {renderMap} from './js/map-view.js';

const state={trip:null,ranked:[],destination:null,itinerary:[],budget:null,validation:[]};
preferenceGrid.innerHTML=preferenceDefinitions.map(([id,label],i)=>`<label class="pref"><input type="checkbox" data-pref value="${id}" ${i<5?'checked':''}> ${label}</label>`).join('');
const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+30);startDate.value=tomorrow.toISOString().slice(0,10);

tripForm.addEventListener('submit',e=>{e.preventDefault();state.trip=readTripForm();state.ranked=rankDestinations(state.trip,destinations);renderDestinations();resultsSection.classList.remove('hidden');planSection.classList.add('hidden');saveCurrent({trip:state.trip});resultsSection.scrollIntoView({behavior:'smooth'})});
loadDemoBtn.addEventListener('click',()=>{origin.value='Saasveld';days.value=9;budget.value=3200;adults.value=2;children.value=2;transport.value='car';maxDrive.value=5;maxChanges.value=3;notes.value='Natuur, zwembad en niet te veel accommodatiewissels.'});
newTripBtn.addEventListener('click',()=>{clearCurrent();location.reload()});
saveTripBtn.addEventListener('click',()=>{saveTrip(exportState());saveTripBtn.textContent='Opgeslagen ✓';setTimeout(()=>saveTripBtn.textContent='Opslaan',1500)});
exportJsonBtn.addEventListener('click',()=>downloadJson(exportState(),`${state.destination.id}-${state.trip.startDate}.json`));
exportGpxBtn.addEventListener('click',()=>downloadGpx(state.trip,state.destination,state.itinerary));

function renderDestinations(){resultCount.textContent=`${state.ranked.length} opties`;destinationCards.innerHTML=state.ranked.slice(0,6).map(d=>`<article class="destination-card"><div class="card-body"><div class="score">${d.score}%</div><h3>${d.name}</h3><p class="muted">${d.summary}</p><div class="chips">${d.matches.map(m=>`<span class="chip">${m}</span>`).join('')}<span class="chip">± €${d.estimate.toLocaleString('nl-NL')}</span></div><div class="pros-cons"><div><strong>Sterk</strong><ul>${d.pros.map(x=>`<li>${x}</li>`).join('')}</ul></div><div><strong>Let op</strong><ul>${d.cons.map(x=>`<li>${x}</li>`).join('')}</ul></div></div><button data-select="${d.id}">Kies deze reis</button></div></article>`).join('');destinationCards.querySelectorAll('[data-select]').forEach(b=>b.addEventListener('click',()=>selectDestination(b.dataset.select)))}
function selectDestination(id){state.destination=state.ranked.find(d=>d.id===id);state.itinerary=buildItinerary(state.trip,state.destination);state.budget=buildBudget(state.trip,state.destination);state.validation=validateTrip(state.trip,state.destination,state.itinerary,state.budget);renderPlan();planSection.classList.remove('hidden');planSection.scrollIntoView({behavior:'smooth'})}
function renderPlan(){planTitle.textContent=state.destination.name;summaryGrid.innerHTML=[['Match',`${state.destination.score}%`],['Dagen',state.trip.days],['Afstand heen',`${state.destination.distanceKm} km`],['Budget',`€${state.budget.total.toLocaleString('nl-NL')}`]].map(x=>`<div class="summary-card"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');itinerary.innerHTML=state.itinerary.map(d=>`<div class="day-card"><h4>Dag ${d.day} · ${new Date(d.date+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'})}</h4><strong>${d.location} — ${d.title}</strong><p>${d.description}</p><small>Indicatieve rijtijd: ${d.driveHours.toFixed(1)} uur</small></div>`).join('');budgetBreakdown.innerHTML=state.budget.rows.map(r=>`<div class="budget-row"><span>${r[0]}</span><strong>€${r[1].toLocaleString('nl-NL')}</strong></div>`).join('')+`<div class="budget-row"><strong>Totaal</strong><strong>€${state.budget.total.toLocaleString('nl-NL')}</strong></div>`;validationList.innerHTML=state.validation.map(v=>`<div class="validation-row ${v.level}"><span>${v.label}</span><strong>${v.detail}</strong></div>`).join('');renderMap(state.itinerary)}
function exportState(){return {version:'0.1.0',trip:state.trip,destination:state.destination,itinerary:state.itinerary,budget:state.budget,validation:state.validation}}
const restored=loadCurrent();if(restored?.trip){origin.value=restored.trip.origin||origin.value;days.value=restored.trip.days||10;budget.value=restored.trip.budget||3500;adults.value=restored.trip.adults||2;children.value=restored.trip.children||0;transport.value=restored.trip.transport||'car';maxDrive.value=restored.trip.maxDrive||5;maxChanges.value=restored.trip.maxChanges||3;comfort.value=restored.trip.comfort||'mid';notes.value=restored.trip.notes||''}
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
