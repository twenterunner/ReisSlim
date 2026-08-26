import { BUILD, ENGINE_VERSION, STORAGE_SCHEMA_VERSION, VERSION, preferenceDefinitions } from './config.js';
import { destinations } from './destinations.js';
import { buildProposalPortfolio, getMoreProposals } from './proposal-engine.js';
import { discoverDestinationBatch } from './destination-provider.js';
import { buildItinerary } from './itinerary-engine.js';
import { buildItineraryVariants } from './itinerary-variants.js';
import { buildBudget } from './budget-engine.js';
import { calculateTripQuality } from './trip-quality-engine.js';
import { applyOptimizationProposal, optimisePlan, proposeOptimizations } from './trip-optimizer.js';
import { validatePlan } from './itinerary-validator.js';
import { clearDraft, deleteTrip, loadDraft, loadTrips, saveDraft, saveTrip } from './storage.js';
import { localDate, normalizeTrip, readTripForm, validateTripInput, writeTripForm } from './trip-model.js';
import { downloadGpx, downloadJson } from './gpx-generator.js';
import { invalidateMap, renderMap } from './map-view.js';
import { enrichPlanWithLiveRouting, readRoutingSettings, routingConfigured, saveRoutingSettings } from './routing-provider.js';
import { evaluatePlanConstraints } from './constraint-engine.js';
import { enrichPlanWithPlaces, geocodeOrigin } from './place-provider.js';
import { $, renderComparison, renderDashboard, renderDestinations, renderItineraryVariants, renderOptimizationPreview, renderPlan, renderPreferenceGrid, renderVehicleControls, setStatus, showError, showView } from './ui-renderer.js';
import { loadPreferenceProfile, recordPreferenceEvent, savePreferenceProfile } from './preference-engine.js';
import { applyAssistantPatch, interpretAssistantMessage } from './assistant-engine.js';
import { enrichDestinationImages } from './image-provider.js';

const defaults=()=>normalizeTrip({origin:'Saasveld',startDate:localDate(30),days:10,budget:3500,travelMode:'direct',routeTopology:'loop',tripPace:'balanced',destinationQuery:'',adults:2,children:0,transport:'motorcycle',maxDrive:5,maxChanges:5,comfort:'mid',strictBudget:true,strictDrive:true,strictChanges:true,allowStretch:true,liveData:true,remoteTravel:false,privateMode:false,notes:'',preferences:['natuur','motor'],preferenceWeights:{natuur:2,motor:2}});
const state={trip:null,ranked:[],ranking:null,destination:null,plan:null,budget:null,validation:[],quality:null,compareIds:[],savedProposalIds:[],dismissedIds:[],variants:[],selectedVariantId:null,optimized:false,undoSnapshot:null,optimizationSummary:null,optimizationProposal:null,routingRun:0,catalog:[...destinations],discoveryCursor:0,discoveryBusy:false,preferenceProfile:loadPreferenceProfile(),assistantPreview:null,liveDiscoveryStartedAt:0,liveDiscoveryTimer:null,liveDiscoveryProgress:null};
const clone=value=>JSON.parse(JSON.stringify(value));
const portfolioOptions=(extra={})=>{state.preferenceProfile.privateMode=Boolean(state.trip?.privateMode);return{preferenceProfile:state.preferenceProfile,...extra}};
function learn(kind,destination){if(!destination)return;state.preferenceProfile.privateMode=Boolean(state.trip?.privateMode);state.preferenceProfile=recordPreferenceEvent(state.preferenceProfile,{kind,destinationId:destination.id,tags:destination.tags});savePreferenceProfile(state.preferenceProfile)}

function endpointLabel(endpoint){
  if(String(endpoint||'').includes('Nominatim'))return 'OpenStreetMap plaatsendienst';
  if(String(endpoint||'').includes('kumi.systems'))return 'OpenStreetMap detailserver 2';
  if(String(endpoint||'').includes('overpass-api.de'))return 'OpenStreetMap detailserver 1';
  if(endpoint==='cache')return 'lokale cache';
  return 'OpenStreetMap-server';
}
function elapsedSeconds(){
  return state.liveDiscoveryStartedAt?Math.max(0,Math.round((Date.now()-state.liveDiscoveryStartedAt)/1000)):0;
}
function renderLiveDiscoveryProgress(){
  const box=$('liveDiscoveryProgress');
  if(!box)return;
  const p=state.liveDiscoveryProgress;
  if(!p){box.classList.add('hidden');box.innerHTML='';return}
  box.classList.remove('hidden');
  const lines=[];
  if(p.origin)lines.push(`<li class="done">✓ Vertrekpunt <strong>${p.origin}</strong></li>`);
  if(Number.isFinite(p.reachKm))lines.push(`<li class="done">✓ Zoekbereik bepaald: tot circa <strong>${Math.round(p.reachKm)} km</strong></li>`);
  if(p.pass)lines.push(`<li class="active">● Zoekronde <strong>${p.pass} van ${p.totalPasses||4}</strong>${p.endpointLabel?` · ${p.endpointLabel}`:''}</li>`);
  if(p.lastMessage)lines.push(`<li>${p.lastMessage}</li>`);
  if(Number.isFinite(p.candidateElements)&&p.candidateElements>0)lines.push(`<li class="done">✓ ${p.candidateElements} locaties ontvangen</li>`);
  if(Number.isFinite(p.liveDestinations)&&p.liveDestinations>0)lines.push(`<li class="done">✓ <strong>${p.liveDestinations} live roadtripregio’s</strong> gevonden en direct toegevoegd</li>`);
  if(p.complete)lines.push(`<li class="done">✓ Live zoeken afgerond in <strong>${elapsedSeconds()} sec</strong></li>`);
  if(p.failed)lines.push(`<li class="failed">✕ Live zoeken afgerond zonder bruikbare live regio’s: ${p.failureReason||'provider gaf geen resultaat'}</li>`);

  box.innerHTML=`<div class="live-progress-head"><div><strong>${p.complete?'Live reisopties gevonden':p.failed?'Live zoeken kon niet worden voltooid':'Live reisopties zoeken…'}</strong><small>${p.complete?'De live resultaten staan nu tussen de voorstellen.':p.failed?'Fallbackresultaten worden nu weer zichtbaar.':'Resultaten verschijnen meteen zodra een zoekronde iets bruikbaars oplevert.'}</small></div><span>${elapsedSeconds()}s</span></div><ul>${lines.join('')}</ul>${p.failed?'<button id="retryLiveDiscoveryBtn" type="button" class="secondary">Probeer live opnieuw</button>':''}`;
  const retry=$('retryLiveDiscoveryBtn');
  if(retry)retry.onclick=()=>discoverLiveOptions({retry:true});
}
function startLiveDiscoveryProgress(){
  state.liveDiscoveryStartedAt=Date.now();
  clearInterval(state.liveDiscoveryTimer);
  state.liveDiscoveryProgress={origin:state.trip.origin,reachKm:null,pass:0,totalPasses:4,candidateElements:0,liveDestinations:0,lastMessage:'Live OpenStreetMap-ontdekking voorbereiden…',complete:false,failed:false};
  document.body.dataset.liveDiscovery='running';
  renderLiveDiscoveryProgress();
  state.liveDiscoveryTimer=setInterval(renderLiveDiscoveryProgress,1000);
}
function finishLiveDiscoveryProgress(){
  clearInterval(state.liveDiscoveryTimer);
  state.liveDiscoveryTimer=null;
  delete document.body.dataset.liveDiscovery;
  renderLiveDiscoveryProgress();
}
function handleDiscoveryProgress(event){
  const p=state.liveDiscoveryProgress||(state.liveDiscoveryProgress={});
  if(event.type==='discovery-start'){
    p.origin=event.origin;p.reachKm=event.reachKm;p.totalPasses=event.totalPasses;p.lastMessage='OpenStreetMap-plaatsendienst wordt benaderd…';
  }else if(event.type==='pass-start'){
    p.pass=event.pass;p.totalPasses=event.totalPasses;p.endpointLabel='';p.lastMessage=`Zoekgebied ${event.pass} voorbereiden…`;
  }else if(event.type==='endpoint-start'){
    p.endpointLabel=endpointLabel(event.endpoint);p.lastMessage=`${p.endpointLabel} bepaalt een bereikbare plaats rond route-seed ${event.seedIndex||''}${event.totalSeeds?`/${event.totalSeeds}`:''}…`;
  }else if(event.type==='endpoint-failure'){
    p.lastMessage=event.timeout?`${endpointLabel(event.endpoint)} reageerde niet binnen de tijdslimiet.`:`${endpointLabel(event.endpoint)} gaf een fout; volgende bron proberen.`;
  }else if(event.type==='endpoint-switch'){
    p.endpointLabel=endpointLabel(event.nextEndpoint);p.lastMessage=`Overschakelen naar ${p.endpointLabel}…`;
  }else if(event.type==='endpoint-success'){
    p.endpointLabel=endpointLabel(event.endpoint);p.lastMessage=`${p.endpointLabel} antwoordde in ${(event.elapsedMs/1000).toFixed(1)} sec.`;
  }else if(event.type==='cache-hit'){
    p.endpointLabel='lokale cache';p.lastMessage='Een eerdere live zoekronde uit de lokale cache gebruiken.';
  }else if(event.type==='pass-success'){
    p.pass=event.pass;p.candidateElements=event.totalCandidateElements;p.liveDestinations=event.totalDestinations;p.lastMessage=event.newDestinations?`${event.newDestinations} nieuwe live regio’s uit ronde ${event.pass} toegevoegd.`:`Ronde ${event.pass} leverde geen nieuwe unieke regio’s op.`;
  }else if(event.type==='pass-empty'){
    p.pass=event.pass;p.lastMessage=`Ronde ${event.pass}: ${event.reason}`;
  }else if(event.type==='discovery-complete'){
    p.liveDestinations=event.totalDestinations;p.candidateElements=event.candidateElements;p.complete=true;p.failed=false;p.lastMessage=`${event.successfulPasses} van ${event.totalPasses} zoekrondes leverden live data op.`;
  }else if(event.type==='discovery-failure'){
    p.failed=true;p.complete=false;p.failureReason=event.reason;p.lastMessage='Alle live zoekrondes zijn afgerond.';
  }
  renderLiveDiscoveryProgress();
}

async function hydrateProposalImages(){if(!state.trip?.liveData||!state.ranked.length)return;await enrichDestinationImages(state.ranked,{maximum:4});renderDestinations(state)}
function stateForStorage(){return{schemaVersion:STORAGE_SCHEMA_VERSION,engineVersion:ENGINE_VERSION,trip:state.trip,destinationId:state.destination?.destinationId||state.destination?.id||null,destinationProfile:state.destination?.dynamic?state.destination:null,compareIds:state.compareIds,savedProposalIds:state.savedProposalIds,dismissedIds:state.dismissedIds,selectedVariantId:state.selectedVariantId,optimized:state.optimized,plan:state.plan}}
function exportState(){return{version:VERSION,build:BUILD,engineVersion:ENGINE_VERSION,generatedAt:new Date().toISOString(),trip:state.trip,destination:state.destination?{id:state.destination.id,name:state.destination.name,score:state.destination.score,confidence:state.destination.confidence}:null,plan:state.plan,budget:state.budget,validation:state.validation,planningQuality:state.quality}}
function persistDraft(message='Automatisch opgeslagen'){try{saveDraft(stateForStorage());setStatus(message)}catch(error){console.error(error);setStatus('Opslaan mislukt')}}
function calculatePlan(destination,optimize=false){let plan=buildItinerary(state.trip,destination),changes=[];if(optimize)({plan,changes}=optimisePlan(state.trip,destination,plan));const budget=buildBudget(state.trip,destination,plan),constraintStatus=evaluatePlanConstraints(state.trip,plan,budget,{allowStretch:destination.category==='stretch'});plan.constraintStatus=constraintStatus;plan.feasible=constraintStatus.exact;plan.warnings=[...new Set([...(plan.warnings||[]),...constraintStatus.violations.map(item=>item.detail)])];return{plan,budget,quality:calculateTripQuality(state.trip,destination,plan,budget),validation:validatePlan(state.trip,destination,plan,budget),constraintStatus,changes}}
function derivePlanState(destination,plan){const budget=buildBudget(state.trip,destination,plan),constraintStatus=evaluatePlanConstraints(state.trip,plan,budget,{allowStretch:destination.category==='stretch'});plan.constraintStatus=constraintStatus;plan.feasible=constraintStatus.exact;plan.warnings=[...new Set([...(plan.warnings||[]),...constraintStatus.violations.map(item=>item.detail)])];return{plan,budget,quality:calculateTripQuality(state.trip,destination,plan,budget),validation:validatePlan(state.trip,destination,plan,budget),constraintStatus}}
async function enhanceLiveData(destinationId,originalPlan){const run=++state.routingRun;$('mapDataStatus').textContent='Live route en plaatsen laden…';try{let plan=originalPlan;if(routingConfigured(state.trip))plan=await enrichPlanWithLiveRouting(state.trip,state.destination,plan,{timeoutMs:18000});plan=await enrichPlanWithPlaces(state.trip,state.destination,plan);if(run!==state.routingRun||state.destination?.id!==destinationId)return;Object.assign(state,derivePlanState(state.destination,plan));renderPlan(state);renderOptimizationPreview(state);renderMap(state.plan);const parts=[plan.routing?.live?'wegroute':null,plan.placeData?.live?'plaatsen':null,plan.weather?.live?'weer':null].filter(Boolean);$('mapDataStatus').textContent=parts.length?`Live: ${parts.join(', ')}`:'Live bron niet beschikbaar';persistDraft(parts.length?`Live ${parts.join(', ')} opgeslagen`:'Live bron niet beschikbaar')}catch(error){console.warn(error);if(run===state.routingRun)$('mapDataStatus').textContent='Live data kon niet worden opgehaald'}}
function applyDestination(destination,optimize=false){Object.assign(state,{destination,...calculatePlan(destination,optimize),optimized:optimize,selectedVariantId:'balanced',optimizationProposal:null});renderPlan(state);renderOptimizationPreview(state);renderMap(state.plan);$('variantSection').classList.add('hidden');$('planSection').classList.remove('hidden');$('mapHint').classList.add('hidden');$('noPlanItinerary').classList.add('hidden');persistDraft();renderDashboard(state,loadTrips());if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)}
function chooseProposal(destination){learn('select',destination);state.destination=destination;state.variants=buildItineraryVariants(state.trip,destination);state.selectedVariantId=null;state.plan=null;renderItineraryVariants(state);$('planSection').classList.add('hidden');$('noPlanItinerary').classList.add('hidden');persistDraft('Reisconcept gekozen');showView('itineraryView')}
function refreshPortfolio(){state.ranking=buildProposalPortfolio(state.trip,state.catalog,portfolioOptions({limit:8,focus:$('proposalFocus').value,excludedIds:state.dismissedIds}));state.ranked=state.ranking.visible;renderDestinations(state);renderComparison(state)}
async function discoverLiveOptions({append=false,retry=false}={}){
  if(!state.trip.liveData||state.discoveryBusy)return 0;
  state.discoveryBusy=true;
  if(retry){
    state.discoveryCursor=0;
    state.catalog=[...destinations];
    refreshPortfolio();
  }
  startLiveDiscoveryProgress();
  setStatus('Live reisopties zoeken via OpenStreetMap…');
  try{
    let addedTotal=0;
    const result=await discoverDestinationBatch(state.trip,{
      cursor:state.discoveryCursor,
      excludedIds:[...state.catalog.map(i=>i.id),...state.dismissedIds],
      timeoutMs:7000,
      onProgress:handleDiscoveryProgress,
      onBatch:async batch=>{
        const known=new Set(state.catalog.map(i=>i.id));
        const fresh=(batch.destinations||[]).filter(i=>!known.has(i.id));
        if(!fresh.length)return;
        state.catalog.push(...fresh);
        addedTotal+=fresh.length;
        refreshPortfolio();
        // Force browser paint before optional image enrichment.
        await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
        persistDraft(`${addedTotal} live regio’s gevonden — zoeken gaat verder`);
      }
    });
    state.discoveryCursor++;

    if(result.destinations?.length){
      void hydrateProposalImages();
      persistDraft(`${result.destinations.length} live regio’s gevonden`);
    }else{
      setStatus(result.reason||'Geen live regio’s gevonden');
    }

    if(state.liveDiscoveryProgress){
      if(result.live){
        state.liveDiscoveryProgress.complete=true;
        state.liveDiscoveryProgress.failed=false;
      }else{
        state.liveDiscoveryProgress.failed=true;
        state.liveDiscoveryProgress.complete=false;
        state.liveDiscoveryProgress.failureReason=result.reason||'Geen live regio’s gevonden.';
      }
    }
    renderLiveDiscoveryProgress();
    return result.destinations?.length||0;
  }catch(error){
    console.error(error);
    if(state.liveDiscoveryProgress){
      state.liveDiscoveryProgress.failed=true;
      state.liveDiscoveryProgress.failureReason=String(error?.message||error);
      state.liveDiscoveryProgress.lastMessage='Onverwachte fout tijdens live zoeken.';
    }
    renderLiveDiscoveryProgress();
    return 0;
  }finally{
    state.discoveryBusy=false;
    finishLiveDiscoveryProgress();
  }
}
function applyVariant(id){const variant=state.variants.find(item=>item.id===id);if(!variant)return;const destination={...state.destination,...variant.destination};Object.assign(state,{destination,selectedVariantId:variant.id,plan:variant.plan,budget:variant.budget,quality:variant.quality,constraintStatus:variant.constraintStatus,validation:validatePlan(state.trip,destination,variant.plan,variant.budget),optimized:false});$('variantSection').classList.add('hidden');$('planSection').classList.remove('hidden');$('mapHint').classList.add('hidden');renderPlan(state);renderOptimizationPreview(state);renderMap(state.plan);persistDraft();if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)}
function resetState(trip=defaults()){Object.assign(state,{trip,ranked:[],ranking:null,destination:null,plan:null,budget:null,validation:[],quality:null,compareIds:[],savedProposalIds:[],dismissedIds:[],variants:[],selectedVariantId:null,optimized:false,catalog:[...destinations],discoveryCursor:0,discoveryBusy:false,routingRun:state.routingRun+1,liveDiscoveryProgress:null});writeTripForm(trip);renderVehicleControls();$('resultsSection').classList.add('hidden');$('planSection').classList.add('hidden');$('variantSection').classList.add('hidden');$('noPlanItinerary').classList.remove('hidden');$('mapHint').classList.remove('hidden');persistDraft('Nieuw concept opgeslagen');renderDashboard(state,loadTrips())}
function rebuildFromRecord(record){state.trip=normalizeTrip(record.trip);state.compareIds=record.compareIds||[];state.savedProposalIds=record.savedProposalIds||[];state.dismissedIds=record.dismissedIds||[];writeTripForm(state.trip);renderVehicleControls();state.catalog=record.destinationProfile?.dynamic?[...destinations,record.destinationProfile]:[...destinations];refreshPortfolio();state.destination=state.ranking.candidates.find(i=>i.id===record.destinationId)||record.destinationProfile||null;if(state.destination){applyDestination(state.destination,Boolean(record.optimized));$('resultsSection').classList.remove('hidden')}}
function initialize(){
  renderPreferenceGrid();renderVehicleControls();$('versionLabel').textContent=`ReisSlim v${VERSION} · Build ${BUILD}`;$('orsApiKey').value=readRoutingSettings().orsApiKey;
  const restored=loadDraft();if(restored?.trip)rebuildFromRecord(restored);else resetState();renderDashboard(state,loadTrips());
  document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>{showView(button.dataset.view);if(button.dataset.view==='mapView')invalidateMap()}));
  document.querySelectorAll('[data-go-planner]').forEach(b=>b.addEventListener('click',()=>showView('plannerView')));
  $('brandBtn').addEventListener('click',()=>showView('dashboardView'));$('startPlanningBtn').addEventListener('click',()=>showView('plannerView'));$('continueTripBtn').addEventListener('click',()=>showView('plannerView'));
  $('transport').addEventListener('change',()=>renderVehicleControls({resetDefaults:true}));$('routeStyle').addEventListener('change',()=>renderVehicleControls());
  $('useLocationBtn').addEventListener('click',()=>{if(!navigator.geolocation)return showError('Locatiebepaling niet ondersteund.');navigator.geolocation.getCurrentPosition(pos=>{const point={lat:pos.coords.latitude,lon:pos.coords.longitude,name:'Huidige locatie',source:'Browser-geolocatie'};$('origin').value='Huidige locatie';state.trip=normalizeTrip({...readTripForm(state.trip),origin:'Huidige locatie',originPoint:point});persistDraft('Huidige locatie opgeslagen')},()=>showError('Locatie kon niet worden bepaald.'),{timeout:10000,maximumAge:600000})});
  $('tripForm').addEventListener('submit',async event=>{event.preventDefault();state.trip=readTripForm(state.trip);const errors=validateTripInput(state.trip);if(errors.length)return showError(errors.join(' '));showError();if(!state.trip.originPoint&&state.trip.liveData){setStatus('Vertrekplaats controleren…');const point=await geocodeOrigin(state.trip.origin);if(point)state.trip=normalizeTrip({...state.trip,originPoint:point})}if(state.trip.destinationQuery&&!state.trip.destinationPoint&&state.trip.liveData){const point=await geocodeOrigin(state.trip.destinationQuery);if(point)state.trip=normalizeTrip({...state.trip,destinationPoint:point})}state.dismissedIds=[];state.catalog=[...destinations];state.discoveryCursor=0;state.preferenceProfile.privateMode=state.trip.privateMode;savePreferenceProfile(state.preferenceProfile);refreshPortfolio();state.destination=null;state.plan=null;state.variants=[];$('resultsSection').classList.remove('hidden');$('planSection').classList.add('hidden');persistDraft();$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});if(state.trip.liveData)await discoverLiveOptions()});
  let saveTimer;const autosave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{state.trip=readTripForm(state.trip);persistDraft()},300)};$('tripForm').addEventListener('input',autosave);$('tripForm').addEventListener('change',autosave);
  $('destinationCards').addEventListener('click',event=>{const select=event.target.closest('[data-select]');if(select){const d=state.ranked.find(i=>i.id===select.dataset.select);if(d)chooseProposal(d)}const dismiss=event.target.closest('[data-dismiss-proposal]');if(dismiss){state.dismissedIds=[...new Set([...state.dismissedIds,dismiss.dataset.dismissProposal])];refreshPortfolio()}const save=event.target.closest('[data-save-proposal]');if(save){const id=save.dataset.saveProposal;state.savedProposalIds=state.savedProposalIds.includes(id)?state.savedProposalIds.filter(i=>i!==id):[...state.savedProposalIds,id];renderDestinations(state)}});
  $('destinationCards').addEventListener('change',event=>{if(!event.target.matches('[data-compare]'))return;const id=event.target.dataset.compare;if(event.target.checked&&!state.compareIds.includes(id)&&state.compareIds.length<4)state.compareIds.push(id);else if(!event.target.checked)state.compareIds=state.compareIds.filter(i=>i!==id);renderComparison(state)});
  $('clearCompareBtn').addEventListener('click',()=>{state.compareIds=[];renderDestinations(state);renderComparison(state)});
  $('moreProposalsBtn').addEventListener('click',async()=>{const more=getMoreProposals(state.trip,state.catalog,state.ranked.map(i=>i.id),portfolioOptions({limit:4,focus:$('proposalFocus').value}));state.ranked.push(...more);renderDestinations(state);if(state.trip.liveData)await discoverLiveOptions({append:true})});
  $('proposalFocus').addEventListener('change',refreshPortfolio);
  $('variantCards').addEventListener('click',event=>{const b=event.target.closest('[data-select-variant]');if(b)applyVariant(b.dataset.selectVariant)});
  $('orsApiKey').addEventListener('change',()=>saveRoutingSettings({orsApiKey:$('orsApiKey').value}));
  $('newTripBtn').addEventListener('click',()=>{if(confirm('Nieuwe reis starten?')){clearDraft();resetState();showView('plannerView')}});
  $('savedTripsList').addEventListener('click',event=>{const open=event.target.closest('[data-open-trip]');if(open){const r=loadTrips().find(i=>i.trip.id===open.dataset.openTrip);if(r){rebuildFromRecord(r);showView(state.destination?'itineraryView':'plannerView')}}const del=event.target.closest('[data-delete-trip]');if(del&&confirm('Reis verwijderen?')){deleteTrip(del.dataset.deleteTrip);renderDashboard(state,loadTrips())}});
  $('saveTripBtn').addEventListener('click',()=>{if(state.destination){if(!state.trip.tripName)state.trip.tripName=state.destination.name;saveTrip(stateForStorage());renderDashboard(state,loadTrips())}});
  $('exportJsonBtn').addEventListener('click',()=>state.destination&&downloadJson(exportState(),`${state.destination.id}-${state.trip.startDate}`));
  $('exportGpxBtn').addEventListener('click',async()=>{if(!state.destination)return;$('exportStatus').textContent='Volledige wegroute en waypoints ophalen…';try{const result=await downloadGpx(state.trip,state.destination,state.plan);$('exportStatus').textContent=`GPX klaar: ${result.trackPoints} routepunten · ${result.specificWaypoints} specifieke waypoints.`}catch(error){console.error(error);$('exportStatus').textContent=`GPX mislukt: ${error.message||'live wegroute niet beschikbaar'}`}});
  $('loadDemoBtn').addEventListener('click',()=>{state.trip=normalizeTrip({...defaults(),id:state.trip?.id,preferences:['natuur','bergen','motor'],preferenceWeights:{natuur:3,bergen:3,motor:2}});writeTripForm(state.trip);persistDraft()});
  $('assistantPreviewBtn').addEventListener('click',()=>{state.assistantPreview=interpretAssistantMessage($('assistantMessage').value,state.trip);$('assistantPreview').textContent=state.assistantPreview.summary||state.assistantPreview.message||'';$('assistantApplyBtn').classList.toggle('hidden',!state.assistantPreview.understood);$('assistantCancelBtn').classList.toggle('hidden',!state.assistantPreview.understood)});
  $('assistantCancelBtn').addEventListener('click',()=>{$('assistantPreview').textContent='';$('assistantApplyBtn').classList.add('hidden');$('assistantCancelBtn').classList.add('hidden')});
  $('assistantApplyBtn').addEventListener('click',()=>{if(!state.assistantPreview?.understood)return;state.trip=normalizeTrip(applyAssistantPatch(state.trip,state.assistantPreview.patch));writeTripForm(state.trip);if(state.destination)applyDestination(state.destination,false)});
  $('improveTripBtn').addEventListener('click',()=>{if(!state.plan)return;const locks=Object.fromEntries([...document.querySelectorAll('[data-optimizer-lock]')].map(box=>[box.dataset.optimizerLock,box.checked]));state.optimizationProposal=proposeOptimizations(state.trip,state.destination,state.plan,{mode:$('optimizationMode').value,locks});renderOptimizationPreview(state)});
  $('applyOptimizationBtn').addEventListener('click',()=>{if(!state.plan||!state.optimizationProposal)return;const ids=[...document.querySelectorAll('[data-optimization-action]:checked')].map(box=>box.dataset.optimizationAction);if(!ids.length)return;state.undoSnapshot=clone({plan:state.plan,budget:state.budget,quality:state.quality,validation:state.validation,constraintStatus:state.constraintStatus});Object.assign(state,applyOptimizationProposal(state.trip,state.destination,state.plan,ids));renderPlan(state);renderOptimizationPreview(state);renderMap(state.plan);persistDraft()});
  $('rejectOptimizationBtn').addEventListener('click',()=>{state.optimizationProposal=null;renderOptimizationPreview(state)});
  $('undoOptimizeBtn').addEventListener('click',()=>{if(!state.undoSnapshot)return;Object.assign(state,state.undoSnapshot);state.undoSnapshot=null;renderPlan(state);renderMap(state.plan)});
  document.querySelectorAll('[data-inspire]').forEach(button=>button.addEventListener('click',()=>{$('destinationQuery').value=button.dataset.inspire;showView('plannerView')}));
}
document.addEventListener('DOMContentLoaded',initialize);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(`./service-worker.js?build=${BUILD}`,{updateViaCache:'none'}).then(reg=>reg.update()).catch(console.warn));
