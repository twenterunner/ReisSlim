import {destinations} from './destinations.js';
import {preferenceDefinitions,readTripForm,writeTripForm,validateFormTrip,getFormElements} from './trip-model.js';
import {rankDestinations} from './destination-engine.js';
import {buildItinerary} from './itinerary-engine.js';
import {buildBudget} from './budget-engine.js';
import {validateTrip} from './itinerary-validator.js';
import {downloadGpx,downloadJson} from './gpx-generator.js';
import {saveTrip,saveDraft,loadDraft,clearDraft} from './storage.js';
import {renderMap} from './map-view.js';

const VERSION = '0.2.0';
const BUILD = '200';
const state={trip:null,ranked:[],destination:null,itinerary:[],budget:null,validation:[]};
const $ = id => document.getElementById(id);
const els = {
  tripForm:$('tripForm'), preferenceGrid:$('preferenceGrid'), resultsSection:$('resultsSection'),
  planSection:$('planSection'), resultCount:$('resultCount'), destinationCards:$('destinationCards'),
  planTitle:$('planTitle'), summaryGrid:$('summaryGrid'), itinerary:$('itinerary'),
  budgetBreakdown:$('budgetBreakdown'), validationList:$('validationList'),
  loadDemoBtn:$('loadDemoBtn'), newTripBtn:$('newTripBtn'), saveTripBtn:$('saveTripBtn'),
  exportJsonBtn:$('exportJsonBtn'), exportGpxBtn:$('exportGpxBtn'), autosaveStatus:$('autosaveStatus'),
  formError:$('formError'), versionLabel:$('versionLabel')
};

els.preferenceGrid.innerHTML=preferenceDefinitions.map(([id,label],i)=>`<label class="pref"><input type="checkbox" data-pref value="${id}" ${i<5?'checked':''}> ${label}</label>`).join('');
if (els.versionLabel) els.versionLabel.textContent=`ReisSlim v${VERSION} · Build ${BUILD} · Stable`;

restoreDraftOrDefaults();
wireEvents();

function wireEvents(){
  els.tripForm.addEventListener('submit',handleSubmit);
  els.loadDemoBtn.addEventListener('click',loadDemo);
  els.newTripBtn.addEventListener('click',startNewTrip);
  els.saveTripBtn.addEventListener('click',saveSelectedTrip);
  els.exportJsonBtn.addEventListener('click',()=>downloadJson(exportState(),`${state.destination.id}-${state.trip.startDate}.json`));
  els.exportGpxBtn.addEventListener('click',()=>downloadGpx(state.trip,state.destination,state.itinerary));

  let timer;
  const scheduleAutosave=()=>{
    clearTimeout(timer);
    setAutosaveStatus('Wijzigingen opslaan…');
    timer=setTimeout(()=>{
      state.trip=readTripForm(state.trip?.id);
      saveDraft({trip:state.trip});
      setAutosaveStatus('Automatisch opgeslagen');
    },250);
  };
  els.tripForm.addEventListener('input',scheduleAutosave);
  els.tripForm.addEventListener('change',scheduleAutosave);
}

function handleSubmit(e){
  e.preventDefault();
  const trip=readTripForm(state.trip?.id);
  const errors=validateFormTrip(trip);
  if(errors.length){
    showFormError(errors.join(' '));
    return;
  }
  showFormError('');
  state.trip=trip;
  saveDraft({trip:state.trip});
  state.ranked=rankDestinations(state.trip,destinations);
  renderDestinations();
  els.resultsSection.classList.remove('hidden');
  els.planSection.classList.add('hidden');
  els.resultsSection.scrollIntoView({behavior:'smooth',block:'start'});
}

function loadDemo(){
  const demo={
    id:state.trip?.id || crypto.randomUUID(),origin:'Saasveld',days:9,budget:3200,adults:2,children:2,
    transport:'car',maxDrive:5,maxChanges:3,comfort:'mid',notes:'Natuur, zwembad en niet te veel accommodatiewissels.',
    preferences:['natuur','bergen','zwemmen','wandelen','kinderen'],startDate:futureDate(30)
  };
  state.trip=demo;
  writeTripForm(demo);
  saveDraft({trip:demo});
  setAutosaveStatus('Voorbeeld opgeslagen');
}

function startNewTrip(){
  if(!confirm('Nieuwe reis starten? De huidige conceptinvoer wordt gewist.')) return;
  clearDraft();
  state.trip=null;state.ranked=[];state.destination=null;state.itinerary=[];state.budget=null;state.validation=[];
  els.tripForm.reset();
  document.querySelectorAll('[data-pref]').forEach((box,i)=>box.checked=i<5);
  const defaults={origin:'Saasveld',startDate:futureDate(30),days:10,budget:3500,adults:2,children:2,transport:'car',maxDrive:5,maxChanges:3,comfort:'mid',notes:'',preferences:preferenceDefinitions.slice(0,5).map(x=>x[0])};
  writeTripForm(defaults);
  els.resultsSection.classList.add('hidden');
  els.planSection.classList.add('hidden');
  saveDraft({trip:readTripForm()});
  setAutosaveStatus('Nieuw concept gestart');
  window.scrollTo({top:0,behavior:'smooth'});
}

function saveSelectedTrip(){
  if(!state.destination) return;
  saveTrip(exportState());
  els.saveTripBtn.textContent='Opgeslagen ✓';
  setTimeout(()=>els.saveTripBtn.textContent='Opslaan',1500);
}

function restoreDraftOrDefaults(){
  const restored=loadDraft();
  if(restored?.trip){
    state.trip=restored.trip;
    writeTripForm(restored.trip);
    setAutosaveStatus('Concept hersteld');
  }else{
    const fields=getFormElements();
    if(!fields.startDate.value) fields.startDate.value=futureDate(30);
    state.trip=readTripForm();
    saveDraft({trip:state.trip});
    setAutosaveStatus('Automatisch opslaan actief');
  }
}

function renderDestinations(){
  els.resultCount.textContent=`${state.ranked.length} opties`;
  els.destinationCards.innerHTML=state.ranked.slice(0,6).map(d=>`<article class="destination-card"><div class="card-body"><div class="score">${d.score}%</div><h3>${d.name}</h3><p class="muted">${d.summary}</p><div class="chips">${d.matches.map(m=>`<span class="chip">${m}</span>`).join('')}<span class="chip">± €${d.estimate.toLocaleString('nl-NL')}</span></div><div class="pros-cons"><div><strong>Sterk</strong><ul>${d.pros.map(x=>`<li>${x}</li>`).join('')}</ul></div><div><strong>Let op</strong><ul>${d.cons.map(x=>`<li>${x}</li>`).join('')}</ul></div></div><button data-select="${d.id}" type="button">Kies deze reis</button></div></article>`).join('');
  els.destinationCards.querySelectorAll('[data-select]').forEach(b=>b.addEventListener('click',()=>selectDestination(b.dataset.select)));
}

function selectDestination(id){
  state.destination=state.ranked.find(d=>d.id===id);
  state.itinerary=buildItinerary(state.trip,state.destination);
  state.budget=buildBudget(state.trip,state.destination);
  state.validation=validateTrip(state.trip,state.destination,state.itinerary,state.budget);
  renderPlan();
  els.planSection.classList.remove('hidden');
  saveDraft(exportState());
  els.planSection.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPlan(){
  els.planTitle.textContent=state.destination.name;
  els.summaryGrid.innerHTML=[['Match',`${state.destination.score}%`],['Dagen',state.trip.days],['Afstand heen',`${state.destination.distanceKm} km`],['Budget',`€${state.budget.total.toLocaleString('nl-NL')}`]].map(x=>`<div class="summary-card"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
  els.itinerary.innerHTML=state.itinerary.map(d=>`<div class="day-card"><h4>Dag ${d.day} · ${new Date(d.date+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'})}</h4><strong>${d.location} — ${d.title}</strong><p>${d.description}</p><small>Indicatieve rijtijd: ${d.driveHours.toFixed(1)} uur</small></div>`).join('');
  els.budgetBreakdown.innerHTML=state.budget.rows.map(r=>`<div class="budget-row"><span>${r[0]}</span><strong>€${r[1].toLocaleString('nl-NL')}</strong></div>`).join('')+`<div class="budget-row"><strong>Totaal</strong><strong>€${state.budget.total.toLocaleString('nl-NL')}</strong></div>`;
  els.validationList.innerHTML=state.validation.map(v=>`<div class="validation-row ${v.level}"><span>${v.label}</span><strong>${v.detail}</strong></div>`).join('');
  renderMap(state.itinerary);
}

function exportState(){return {version:VERSION,build:BUILD,trip:state.trip,destination:state.destination,itinerary:state.itinerary,budget:state.budget,validation:state.validation}}
function setAutosaveStatus(text){if(els.autosaveStatus)els.autosaveStatus.textContent=text}
function showFormError(text){if(!els.formError)return;els.formError.textContent=text;els.formError.classList.toggle('hidden',!text)}
function futureDate(offset){const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)}

if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
