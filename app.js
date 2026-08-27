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
import { enrichPlanWithPlaces, geocodeOrigin, prepareGeneratedRouteStops } from './place-provider.js';
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
  if(String(endpoint||'').toLowerCase().includes('photon'))return 'OpenStreetMap plaatsendienst A';
  if(String(endpoint||'').toLowerCase().includes('nominatim'))return 'OpenStreetMap plaatsendienst B';
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

  const searchDone=Boolean(p.complete);
  const searchFailed=Boolean(p.failed);
  const resultCount=Number(p.liveDestinations)||0;
  const sourceText=p.endpointLabel||'OpenStreetMap';

  const lines=[];
  if(p.origin)lines.push(`<li class="done"><span>✓</span><div><strong>Vertrek</strong><small>${p.origin}</small></div></li>`);
  if(Number.isFinite(p.reachKm))lines.push(`<li class="done"><span>✓</span><div><strong>Bereik</strong><small>± ${Math.round(p.reachKm)} km</small></div></li>`);
  if(p.pass){
    const cls=searchDone?'done':searchFailed?'failed':'active';
    const symbol=searchDone?'✓':searchFailed?'!':'●';
    lines.push(`<li class="${cls}"><span>${symbol}</span><div><strong>Live bron</strong><small>${sourceText}${p.totalPasses?` · ronde ${p.pass}/${p.totalPasses}`:''}</small></div></li>`);
  }
  if(searchDone){
    lines.push(`<li class="done"><span>✓</span><div><strong>${resultCount} live regio${resultCount===1?'':'’s'}</strong><small>Toegevoegd aan je voorstellen · ${elapsedSeconds()} sec</small></div></li>`);
  }else if(searchFailed){
    lines.push(`<li class="failed"><span>!</span><div><strong>Live uitbreiding beperkt</strong><small>${p.failureReason||'Probeer later opnieuw.'}</small></div></li>`);
  }else if(p.lastMessage){
    lines.push(`<li class="active progress-detail"><span>↻</span><div><strong>Bezig</strong><small>${p.lastMessage}</small></div></li>`);
  }

  box.innerHTML=`<div class="live-progress-head compact"><div><strong>${searchDone?'Live opties klaar':searchFailed?'Portfolio klaar · live uitbreiding niet nodig':'Live opties zoeken'}</strong><small>${searchDone?`${resultCount} nieuwe regio${resultCount===1?'':'’s'} toegevoegd`:searchFailed?'Je reisvoorstellen zijn volledig bruikbaar; alleen extra live regio’s konden deze ronde niet worden toegevoegd.':'Nieuwe resultaten verschijnen direct.'}</small></div><span>${elapsedSeconds()}s</span></div><ul class="live-progress-steps">${lines.join('')}</ul>${searchFailed?'<button id="retryLiveDiscoveryBtn" type="button" class="secondary">Opnieuw proberen</button>':''}`;
  const retry=$('retryLiveDiscoveryBtn');
  if(retry)retry.onclick=()=>discoverLiveOptions({retry:true});
}
function startLiveDiscoveryProgress(){
  state.liveDiscoveryStartedAt=Date.now();
  clearInterval(state.liveDiscoveryTimer);
  state.liveDiscoveryProgress={origin:state.trip.origin,reachKm:null,pass:0,totalPasses:1,candidateElements:0,liveDestinations:0,lastMessage:'Live OpenStreetMap-ontdekking voorbereiden…',complete:false,failed:false};
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
  }else if(event.type==='provider-stage'){
    p.endpointLabel='meerdere live bronnen';p.lastMessage=event.message||'Meerdere live bronnen raadplegen…';
  }else if(event.type==='endpoint-start'){
    p.endpointLabel=endpointLabel(event.endpoint);p.lastMessage=`${p.endpointLabel} bepaalt een bereikbare plaats rond route-seed ${event.seedIndex||''}${event.totalSeeds?`/${event.totalSeeds}`:''}…`;
  }else if(event.type==='endpoint-failure'){
    p.lastMessage=event.timeout?`${endpointLabel(event.endpoint)} reageerde niet binnen de tijdslimiet.`:`${endpointLabel(event.endpoint)} gaf een fout; volgende bron proberen.`;
  }else if(event.type==='endpoint-switch'){
    p.endpointLabel=endpointLabel(event.nextEndpoint);p.lastMessage=`Overschakelen naar ${p.endpointLabel}…`;
  }else if(event.type==='endpoint-success'){
    p.endpointLabel=endpointLabel(event.endpoint);p.lastMessage=`${p.endpointLabel} antwoordde in ${(event.elapsedMs/1000).toFixed(1)} sec.`;
  }else if(event.type==='cache-hit'){
    p.sawCache=true;
    p.endpointLabel='lokale cache';p.lastMessage='Eerdere live zoekdata controleren…';
  }else if(event.type==='cache-bypass'){
    p.endpointLabel='live bron';p.lastMessage='Cache overgeslagen; nieuwe OpenStreetMap-data ophalen…';
  }else if(event.type==='pass-success'){
    p.pass=event.pass;p.candidateElements=event.totalCandidateElements;p.liveDestinations=event.totalDestinations;p.lastMessage=event.newDestinations?`${event.newDestinations} nieuwe live regio’s uit ronde ${event.pass} toegevoegd.`:`Ronde ${event.pass} leverde geen nieuwe unieke regio’s op.`;
  }else if(event.type==='pass-empty'){
    p.pass=event.pass;p.lastMessage=`Ronde ${event.pass}: ${event.reason}`;
  }else if(event.type==='discovery-complete'){
    p.liveDestinations=event.totalDestinations;p.candidateElements=event.candidateElements;p.complete=true;p.failed=false;p.lastMessage=`${event.successfulPasses} van ${event.totalPasses} zoekrondes leverden live data op.`;
  }else if(event.type==='discovery-failure'){
    p.failed=true;p.complete=false;p.failureReason=event.reason;p.lastMessage='Live uitbreiding afgerond; de beschikbare voorstellen blijven actief.';
  }
  renderLiveDiscoveryProgress();
}

async function hydrateProposalImages(){if(!state.trip?.liveData||!state.ranked.length)return;await enrichDestinationImages(state.ranked,{maximum:8});renderDestinations(state)}
function stateForStorage(){return{schemaVersion:STORAGE_SCHEMA_VERSION,engineVersion:ENGINE_VERSION,trip:state.trip,destinationId:state.destination?.destinationId||state.destination?.id||null,destinationProfile:state.destination?.dynamic?state.destination:null,compareIds:state.compareIds,savedProposalIds:state.savedProposalIds,dismissedIds:state.dismissedIds,selectedVariantId:state.selectedVariantId,optimized:state.optimized,plan:state.plan}}
function exportState(){return{version:VERSION,build:BUILD,engineVersion:ENGINE_VERSION,generatedAt:new Date().toISOString(),trip:state.trip,destination:state.destination?{id:state.destination.id,name:state.destination.name,score:state.destination.score,confidence:state.destination.confidence}:null,plan:state.plan,budget:state.budget,validation:state.validation,planningQuality:state.quality}}
function persistDraft(message='Automatisch opgeslagen'){try{saveDraft(stateForStorage());setStatus(message)}catch(error){console.error(error);setStatus('Opslaan mislukt')}}

function planLiveBanner(message,tone='working'){
  let box=document.getElementById('planLiveProgress');
  const planSection=document.getElementById('planSection');
  if(!planSection)return;
  if(!box){
    box=document.createElement('div');
    box.id='planLiveProgress';
    box.className='plan-live-progress';
    const summary=document.getElementById('summaryGrid');
    summary?.insertAdjacentElement('afterend',box);
  }
  box.dataset.tone=tone;
  box.innerHTML=`<strong>${tone==='done'?'✓':tone==='error'?'!':'●'} Live reisopbouw</strong><span>${message}</span>`;
}
function updateVisiblePendingPlaceText(message){
  document.querySelectorAll('.day-details dd').forEach(dd=>{
    if(/wordt live gezocht|corridorraming|voorlopige route-inschatting/i.test(dd.textContent||''))dd.textContent=message;
  });
}
function placeProgressText(event){
  const label={accommodation:'overnachting',restaurant:'restaurant',fuel:'tank-/ruststop',rest:'ruststop',activity:'activiteit',service:'servicepunt'}[event.itemType]||'plaats';
  if(event.type==='places-start')return `Specifieke stops en verblijven zoeken · 0/${event.total}`;
  if(event.type==='place-search')return `Dag ${event.day}: specifieke ${label} zoeken · ${event.completed}/${event.total} klaar`;
  if(event.type==='place-found')return `${event.name} gevonden voor dag ${event.day} · ${event.completed}/${event.total} klaar`;
  if(event.type==='place-missing')return `Dag ${event.day}: geen betrouwbare ${label} gevonden · ${event.completed}/${event.total} klaar`;
  if(event.type==='places-complete')return `${event.found} specifieke plaatsen gevonden · ${event.completed}/${event.total} zoekacties afgerond`;
  return 'Live plaatsen zoeken…';
}

function calculatePlan(destination,optimize=false){let plan=buildItinerary(state.trip,destination),changes=[];if(optimize)({plan,changes}=optimisePlan(state.trip,destination,plan));const budget=buildBudget(state.trip,destination,plan),constraintStatus=evaluatePlanConstraints(state.trip,plan,budget,{allowStretch:destination.category==='stretch'});plan.constraintStatus=constraintStatus;plan.feasible=constraintStatus.exact;plan.warnings=[...new Set([...(plan.warnings||[]),...constraintStatus.violations.map(item=>item.detail)])];return{plan,budget,quality:calculateTripQuality(state.trip,destination,plan,budget),validation:validatePlan(state.trip,destination,plan,budget),constraintStatus,changes}}
function derivePlanState(destination,plan){const budget=buildBudget(state.trip,destination,plan),constraintStatus=evaluatePlanConstraints(state.trip,plan,budget,{allowStretch:destination.category==='stretch'});plan.constraintStatus=constraintStatus;plan.feasible=constraintStatus.exact;plan.warnings=[...new Set([...(plan.warnings||[]),...constraintStatus.violations.map(item=>item.detail)])];return{plan,budget,quality:calculateTripQuality(state.trip,destination,plan,budget),validation:validatePlan(state.trip,destination,plan,budget),constraintStatus}}

const optimizerDimensionLabels={driving:'Rijbelasting',budget:'Budget',relaxation:'Ontspanning',family:'Gezin',adventure:'Avontuur',weather:'Weerbestendig',variety:'Variatie',crowds:'Rust',realism:'Realisme',completeness:'Compleetheid',routeEfficiency:'Route-efficiëntie',routeExploration:'Routeverkenning',vehicleSuitability:'Voertuigmatch',safetyReadiness:'Veiligheid',poiQuality:'POI-kwaliteit',bookingReadiness:'Boekbaarheid',documentationReadiness:'Documenten'};
function escOpt(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function renderStrongOptimizationPreview(){const p=state.optimizationProposal,box=$('optimizationPreview');if(!box)return;if(!p){box.innerHTML='';return}const before=Math.round(p.before?.quality?.overall||0),after=Math.round(p.after?.quality?.overall||0),gain=after-before,rb=p.before?.quality?.rawDimensions||{},ra=p.after?.quality?.rawDimensions||{},ds=Object.keys({...rb,...ra}).map(key=>({key,b:Math.round(rb[key]||0),a:Math.round(ra[key]||0),d:Math.round((ra[key]||0)-(rb[key]||0))})).filter(x=>Math.abs(x.d)>=1).sort((x,y)=>y.d-x.d),positives=ds.filter(x=>x.d>0).slice(0,6),negatives=ds.filter(x=>x.d<0).slice(-3),locks=[...document.querySelectorAll('[data-optimizer-lock]')],allLocked=locks.length&&locks.every(x=>x.checked),strong=Boolean(p.meaningful);$('applyOptimizationBtn').classList.toggle('hidden',!strong);$('rejectOptimizationBtn').classList.remove('hidden');box.innerHTML=`<section class="optimizer-impact-card ${strong?'is-strong':'is-weak'}"><div class="optimizer-score-shift"><div><small>NU</small><strong>${before}</strong><span>/100</span></div><b>→</b><div><small>NA</small><strong>${after}</strong><span>/100</span></div><em>${gain>=0?'+':''}${gain}</em></div><div class="optimizer-impact-copy"><strong>${allLocked?'Optimizer geblokkeerd':strong?'Dit is een betekenisvolle verbetering':'Niet sterk genoeg om toe te passen'}</strong><p>${escOpt(p.message||'')}</p></div></section>${allLocked?'<div class="optimizer-blocked-note"><strong>Alle vier onderdelen staan beschermd.</strong><span>ReisSlim mag daardoor niets veranderen. Tik op “Alles vrijgeven”.</span></div>':''}${positives.length?`<div class="optimizer-delta-panel"><div class="optimizer-panel-title"><strong>Waar komt de verbetering vandaan?</strong><small>Score vóór → na</small></div>${positives.map(x=>`<div class="optimizer-delta-row"><span>${escOpt(optimizerDimensionLabels[x.key]||x.key)}</span><div><b>${x.b}</b><i>→</i><strong>${x.a}</strong></div><em>+${x.d}</em></div>`).join('')}${negatives.length?`<div class="optimizer-tradeoffs"><strong>Kleine afwegingen</strong>${negatives.map(x=>`<span>${escOpt(optimizerDimensionLabels[x.key]||x.key)} ${x.d}</span>`).join('')}</div>`:''}</div>`:''}${p.actions?.length?`<div class="optimizer-change-panel"><div class="optimizer-panel-title"><strong>Wat verandert er concreet?</strong><small>${p.actions.length} wijzigingen</small></div>${p.actions.map(x=>`<label class="optimizer-action-card"><input type="checkbox" data-optimization-action="${escOpt(x.id)}" checked><span class="optimizer-action-icon">✓</span><span><strong>${escOpt(x.title)}</strong><small>${escOpt(x.description)}</small></span></label>`).join('')}</div>`:''}<small class="optimizer-threshold">${escOpt(p.threshold||'')}</small>`}
function syncPlanVisualHero(){if(!$('planVisualHero')||!state.trip)return;const title=state.destination?.name||'Jouw roadtrip';$('planVisualTitle').textContent=title;$('planVisualDays').textContent=`${state.trip.days} dagen`;$('planVisualRoute').textContent=state.trip.routeTopology==='loop'?'Lusroute':state.trip.routeTopology==='open-ended'?'Open einde':'Heen & terug';$('planVisualBudget').textContent=state.budget?.total?`± €${Math.round(state.budget.total).toLocaleString('nl-NL')}`:`Budget €${Number(state.trip.budget||0).toLocaleString('nl-NL')}`;const img=$('planVisualImage');if(img){const n=(Math.abs([...title].reduce((q,c)=>q+c.charCodeAt(0),0))%18)+1;img.src=`progress-${String(n).padStart(2,'0')}.webp`}}
function resetOptimizerLocks(){document.querySelectorAll('[data-optimizer-lock]').forEach(x=>{x.checked=false;x.defaultChecked=false});if($('optimizationMode'))$('optimizationMode').value='maximum'}

const PLAN_LOADING_IMAGES=['progress-01.webp','progress-02.webp','progress-03.webp','progress-04.webp','progress-05.webp','progress-06.webp','progress-07.webp','progress-08.webp','progress-09.webp','progress-10.webp','progress-11.webp','progress-12.webp','progress-13.webp','progress-14.webp','progress-15.webp','progress-16.webp','progress-17.webp','progress-18.webp','progress-19.webp','progress-20.webp','progress-21.webp','progress-22.webp','progress-23.webp','progress-24.webp'];
let planLoadingImageTimer=null,planLoadingImageIndex=0,planLoadingProgress=0;
function showPlanLoading(title='Reisplan voorbereiden…',text='We bouwen je route stap voor stap op.'){
  const overlay=$('planLoadingOverlay');if(!overlay)return;
  planLoadingProgress=0;overlay.classList.remove('hidden');
  updatePlanLoading(4,title,text,'Starten');
  const image=$('planLoadingImage');
  clearInterval(planLoadingImageTimer);
  planLoadingImageTimer=setInterval(()=>{
    planLoadingImageIndex=(planLoadingImageIndex+1)%PLAN_LOADING_IMAGES.length;
    if(image){image.classList.add('is-switching');setTimeout(()=>{image.src=PLAN_LOADING_IMAGES[planLoadingImageIndex];image.classList.remove('is-switching')},180)}
  },1100);
}
function updatePlanLoading(percent,title,text,stage=''){
  const overlay=$('planLoadingOverlay');if(!overlay)return;
  planLoadingProgress=Math.max(planLoadingProgress,Math.min(100,Math.round(Number(percent)||0)));
  if(title)$('planLoadingTitle').textContent=title;
  if(text)$('planLoadingText').textContent=text;
  $('planLoadingProgressBar').style.width=`${planLoadingProgress}%`;
  $('planLoadingPercent').textContent=`${planLoadingProgress}%`;
  $('planLoadingStage').textContent=stage||'Bezig';
}
function hidePlanLoading(success=true){
  const overlay=$('planLoadingOverlay');if(!overlay)return;
  updatePlanLoading(100,success?'Reisplan klaar':'Live data deels geladen',success?'Route, plaatsen en kaart zijn bijgewerkt.':'Het basisplan blijft beschikbaar.','Klaar');
  clearInterval(planLoadingImageTimer);planLoadingImageTimer=null;
  setTimeout(()=>overlay.classList.add('hidden'),success?550:900);
}
function prepareItineraryCarousel(){
  const track=$('itinerary'),counter=$('itineraryCarouselCounter');
  if(!track||!counter)return;
  const cards=[...track.querySelectorAll('.day-card')];
  if(!cards.length){counter.textContent='';return}
  const update=()=>{
    const center=track.scrollLeft+track.clientWidth/2;
    let best=0,bestDistance=Infinity;
    cards.forEach((card,index)=>{
      const cardCenter=card.offsetLeft+card.offsetWidth/2,d=Math.abs(cardCenter-center);
      if(d<bestDistance){bestDistance=d;best=index}
    });
    counter.textContent=`Dag ${best+1} van ${cards.length}`;
    cards.forEach((card,index)=>card.classList.toggle('is-current',index===best));
  };
  track.onscroll=()=>requestAnimationFrame(update);
  requestAnimationFrame(update);
}

async function enhanceLiveData(destinationId,originalPlan){
  const run=++state.routingRun;
  showPlanLoading('Routepunten controleren…','We controleren eerst of alle open-einde routepunten op land en bij echte plaatsen liggen.');
  $('mapDataStatus').textContent='Routepunten controleren…';
  planLiveBanner('Stap 1/4 · routepunten geografisch controleren…');
  try{
    let plan=originalPlan;
    updatePlanLoading(8,'Routepunten controleren…','Open-einde overnachtingszones worden gekoppeld aan echte plaatsen op land.','Geografie');
    plan=await prepareGeneratedRouteStops(plan,{
      timeoutMs:3000,
      onProgress:event=>{
        if(run!==state.routingRun)return;
        const ratio=event.total?event.index/event.total:0;
        updatePlanLoading(8+Math.round(ratio*14),'Routepunten controleren…',event.message||'Zoeken naar een echte plaats op land.','Geografie');
      }
    });
    if(run!==state.routingRun||state.destination?.id!==destinationId)return;

    updatePlanLoading(24,'Wegroute berekenen…','We verbinden alle reisdagen over echte wegen en controleren de etappes.','Route');
    $('mapDataStatus').textContent='Live wegroute berekenen…';
    planLiveBanner('Stap 2/4 · echte wegroute berekenen…');
    updateVisiblePendingPlaceText('Live wegroute wordt berekend…');

    if(routingConfigured(state.trip)){
      plan=await enrichPlanWithLiveRouting(state.trip,state.destination,plan,{timeoutMs:25000});
      if(run!==state.routingRun||state.destination?.id!==destinationId)return;
      Object.assign(state,derivePlanState(state.destination,plan));
      renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderMap(state.plan);
      const routed=Boolean(plan.routing?.live);
      const loopOverlap=Number.isFinite(plan.routing?.loopOverlap)?Math.round(plan.routing.loopOverlap*100):null;
      updatePlanLoading(48,routed?'Wegroute gevonden':'Routebasis gereed',routed?'De echte wegroute staat. Nu zoeken we specifieke stops, eten, brandstof en verblijf.':'We gaan verder met specifieke plaatsen langs de route.','Route');
      planLiveBanner(routed?'Stap 2/4 klaar · wegroute gevonden. Stap 3/4 · specifieke plaatsen zoeken…':'Wegroute deels live. Stap 3/4 · specifieke plaatsen zoeken…',routed?'working':'error');
      $('mapDataStatus').textContent=routed?(loopOverlap!==null?`Live lusroute · ${loopOverlap}% overlap · plaatsen zoeken…`:'Live wegroute gevonden · plaatsen zoeken…'):'Wegroute deels live · plaatsen zoeken…';
    }else{
      updatePlanLoading(42,'Routebasis gereed','Live routering is niet geconfigureerd; we gebruiken de routebasis en zoeken nu plaatsen langs de etappes.','Route');
    }

    plan=await enrichPlanWithPlaces(state.trip,state.destination,plan,{
      placeTimeoutMs:6500,
      nominatimTimeoutMs:4500,
      weatherTimeoutMs:4500,
      onProgress:event=>{
        if(run!==state.routingRun)return;
        const text=placeProgressText(event);
        const completed=Number(event?.completed||event?.index||0),total=Number(event?.total||0);
        const fraction=total?Math.min(1,completed/total):.45;
        updatePlanLoading(50+Math.round(fraction*38),'Specifieke plaatsen zoeken…',text,'POI, verblijf & weer');
        planLiveBanner(`Stap 3/4 · ${text}`);
        updateVisiblePendingPlaceText(text);
        $('mapDataStatus').textContent=text;
      }
    });
    if(run!==state.routingRun||state.destination?.id!==destinationId)return;

    updatePlanLoading(92,'Reisplan samenstellen…','We verwerken route, POI’s, weer, budget en dagplanning in één reisplan.','Samenstellen');
    Object.assign(state,derivePlanState(state.destination,plan));
    renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderMap(state.plan);
    const routed=Boolean(plan.routing?.live),places=plan.recommendations?.length||0,weather=Boolean(plan.weather?.live);
    const finalLoopOverlap=Number.isFinite(plan.routing?.loopOverlap)?Math.round(plan.routing.loopOverlap*100):null;
    const parts=[routed?(finalLoopOverlap!==null?`lusroute ${finalLoopOverlap}% overlap`:'wegroute'):null,places?`${places} plaatsen`:null,weather?'weer':null].filter(Boolean);
    $('mapDataStatus').textContent=parts.length?`Live: ${parts.join(', ')}`:'Live bronnen leverden geen bruikbaar resultaat';
    planLiveBanner(parts.length?`Klaar · ${parts.join(' · ')}`:'Live verrijking afgerond zonder bruikbare resultaten',parts.length?'done':'error');
    persistDraft(parts.length?`Live ${parts.join(', ')} opgeslagen`:'Live verrijking afgerond');
    updatePlanLoading(100,'Reisplan klaar',parts.length?`${parts.join(' · ')} verwerkt.`:'Basisreisplan gereed.','Klaar');
    hidePlanLoading(true);
  }catch(error){
    console.warn(error);
    if(run===state.routingRun){
      $('mapDataStatus').textContent='Live verrijking kon niet volledig worden afgerond';
      planLiveBanner(`Live verrijking onderbroken: ${error?.message||'onbekende fout'}`,'error');
      hidePlanLoading(false);
    }
  }
}
function applyDestination(destination,optimize=false){if(state.trip?.liveData)showPlanLoading('Reisplan opbouwen…','We starten met route, plaatsen en dagplanning.');Object.assign(state,{destination,...calculatePlan(destination,optimize),optimized:optimize,selectedVariantId:'balanced',optimizationProposal:null});renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderMap(state.plan);$('variantSection').classList.add('hidden');$('planSection').classList.remove('hidden');$('mapHint').classList.add('hidden');$('noPlanItinerary').classList.add('hidden');persistDraft();renderDashboard(state,loadTrips());if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)}
function chooseProposal(destination){learn('select',destination);state.destination=destination;state.variants=buildItineraryVariants(state.trip,destination);state.selectedVariantId=null;state.plan=null;renderItineraryVariants(state);$('planSection').classList.add('hidden');$('noPlanItinerary').classList.add('hidden');persistDraft('Reisconcept gekozen');showView('itineraryView')}
function refreshPortfolio(){if(state.trip)state.trip.allowStretch=true;state.ranking=buildProposalPortfolio(state.trip,state.catalog,portfolioOptions({limit:8,focus:$('proposalFocus').value,excludedIds:state.dismissedIds}));state.ranked=state.ranking.visible;renderDestinations(state);renderComparison(state)}
async function discoverLiveOptions({append=false,retry=false}={}){
  if(!state.trip.liveData||state.discoveryBusy)return 0;
  state.discoveryBusy=true;
  if(retry){
    state.discoveryCursor=Math.max(1,state.discoveryCursor+1);
    state.catalog=[...destinations];
    refreshPortfolio();
  }
  startLiveDiscoveryProgress();
  setStatus('Live reisopties zoeken via OpenStreetMap…');
  try{
    let addedTotal=0;
    const batchHandler=async batch=>{
      const known=new Set(state.catalog.map(i=>i.id));
      const fresh=(batch.destinations||[]).filter(i=>!known.has(i.id));
      if(!fresh.length)return;
      state.catalog.push(...fresh);
      addedTotal+=fresh.length;
      refreshPortfolio();
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
      persistDraft(`${addedTotal} live regio’s gevonden — zoeken gaat verder`);
    };
    let result=await discoverDestinationBatch(state.trip,{
      cursor:state.discoveryCursor,
      excludedIds:[...state.catalog.map(i=>i.id),...state.dismissedIds],
      timeoutMs:7000,
      bypassCache:retry,
      onProgress:handleDiscoveryProgress,
      onBatch:batchHandler
    });
    state.discoveryCursor++;

    // If an initial cached search produces zero usable destinations, don't stop
    // and show an error. Immediately do one genuinely fresh search using a new
    // seed group. This is the deployed 1605 failure shown as "0s · lokale cache".
    if(!retry&&!result.destinations?.length&&state.liveDiscoveryProgress?.sawCache){
      const p=state.liveDiscoveryProgress;
      p.failed=false;p.complete=false;p.endpointLabel='live bron';
      p.lastMessage='Cache leverde geen bruikbare regio’s op — automatisch een verse OpenStreetMap-zoekronde starten…';
      renderLiveDiscoveryProgress();
      result=await discoverDestinationBatch(state.trip,{
        cursor:state.discoveryCursor,
        excludedIds:[...state.catalog.map(i=>i.id),...state.dismissedIds],
        timeoutMs:7000,
        bypassCache:true,
        onProgress:handleDiscoveryProgress,
        onBatch:batchHandler
      });
      state.discoveryCursor++;
    }

    // A transient provider miss should not immediately surface as a failure. Try one
    // different seed group automatically; with the new dual geocoder this normally
    // completes in a few seconds and removes the need for manual retry.
    if(!result.destinations?.length&&!retry){
      const p=state.liveDiscoveryProgress;
      if(p){p.failed=false;p.complete=false;p.lastMessage='Eerste live zoekgebied leverde niets op — automatisch een tweede gebied proberen…';renderLiveDiscoveryProgress()}
      const second=await discoverDestinationBatch(state.trip,{
        cursor:state.discoveryCursor,
        excludedIds:[...state.catalog.map(i=>i.id),...state.dismissedIds],
        timeoutMs:5200,
        bypassCache:true,
        onProgress:handleDiscoveryProgress,
        onBatch:batchHandler
      });
      state.discoveryCursor++;
      if(second.destinations?.length)result=second;
    }

    if(result.destinations?.length){
      void hydrateProposalImages();
      persistDraft(`${result.destinations.length} live regio’s gevonden`);
    }else{
      setStatus('Reisportfolio gereed · live uitbreiding kon deze ronde niet worden toegevoegd');
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
function applyVariant(id){const variant=state.variants.find(item=>item.id===id);if(!variant)return;if(state.trip?.liveData)showPlanLoading('Reisplan opbouwen…','We starten met route, plaatsen en dagplanning.');const destination={...state.destination,...variant.destination};Object.assign(state,{destination,selectedVariantId:variant.id,plan:variant.plan,budget:variant.budget,quality:variant.quality,constraintStatus:variant.constraintStatus,validation:validatePlan(state.trip,destination,variant.plan,variant.budget),optimized:false});$('variantSection').classList.add('hidden');$('planSection').classList.remove('hidden');$('mapHint').classList.add('hidden');renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderMap(state.plan);persistDraft();if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)}
function resetState(trip=defaults()){Object.assign(state,{trip,ranked:[],ranking:null,destination:null,plan:null,budget:null,validation:[],quality:null,compareIds:[],savedProposalIds:[],dismissedIds:[],variants:[],selectedVariantId:null,optimized:false,catalog:[...destinations],discoveryCursor:0,discoveryBusy:false,routingRun:state.routingRun+1,liveDiscoveryProgress:null});writeTripForm(trip);renderVehicleControls();$('resultsSection').classList.add('hidden');$('planSection').classList.add('hidden');$('variantSection').classList.add('hidden');$('noPlanItinerary').classList.remove('hidden');$('mapHint').classList.remove('hidden');persistDraft('Nieuw concept opgeslagen');renderDashboard(state,loadTrips())}
function rebuildFromRecord(record){state.trip=normalizeTrip(record.trip);state.compareIds=record.compareIds||[];state.savedProposalIds=record.savedProposalIds||[];state.dismissedIds=record.dismissedIds||[];writeTripForm(state.trip);renderVehicleControls();state.catalog=record.destinationProfile?.dynamic?[...destinations,record.destinationProfile]:[...destinations];refreshPortfolio();state.destination=state.ranking.candidates.find(i=>i.id===record.destinationId)||record.destinationProfile||null;if(state.destination){applyDestination(state.destination,Boolean(record.optimized));$('resultsSection').classList.remove('hidden')}}

function startNewTrip(){
  try{
    clearDraft();
    resetState(defaults());
    showView('plannerView');
    window.scrollTo({top:0,left:0,behavior:'auto'});
    setStatus('Nieuw reisconcept gestart');
    return true;
  }catch(error){
    console.error('Nieuwe reis starten mislukt',error);
    showError('Nieuwe reis kon niet worden gestart. Vernieuw de pagina en probeer opnieuw.');
    return false;
  }
}

function setupPremiumPlannerControls(){
  const topology=$('routeTopology');
  if(topology){
    const radios=[...document.querySelectorAll('input[name="routeTopologyUi"]')];
    const sync=()=>radios.forEach(r=>{r.checked=r.value===topology.value});
    sync();
    radios.forEach(r=>r.addEventListener('change',()=>{if(!r.checked)return;topology.value=r.value;topology.dispatchEvent(new Event('change',{bubbles:true}))}));
    topology.addEventListener('change',sync);
  }
}

function initialize(){
  const newTripButton=$('newTripBtn');
  if(newTripButton)newTripButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();startNewTrip()});
  renderPreferenceGrid();setupPremiumPlannerControls();renderVehicleControls();$('versionLabel').textContent=`ReisSlim v${VERSION} · Build ${BUILD}`;$('orsApiKey').value=readRoutingSettings().orsApiKey;
  const restored=loadDraft();if(restored?.trip)rebuildFromRecord(restored);else resetState();renderDashboard(state,loadTrips());
  document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>{showView(button.dataset.view);if(button.dataset.view==='mapView')invalidateMap()}));
  document.querySelectorAll('[data-go-planner]').forEach(b=>b.addEventListener('click',()=>showView('plannerView')));
  $('startPlanningBtn').addEventListener('click',()=>showView('plannerView'));$('continueTripBtn').addEventListener('click',()=>showView('plannerView'));
  $('transport').addEventListener('change',()=>renderVehicleControls({resetDefaults:true}));$('routeStyle').addEventListener('change',()=>renderVehicleControls());
  $('useLocationBtn').addEventListener('click',()=>{if(!navigator.geolocation)return showError('Locatiebepaling niet ondersteund.');navigator.geolocation.getCurrentPosition(pos=>{const point={lat:pos.coords.latitude,lon:pos.coords.longitude,name:'Huidige locatie',source:'Browser-geolocatie'};$('origin').value='Huidige locatie';state.trip=normalizeTrip({...readTripForm(state.trip),origin:'Huidige locatie',originPoint:point});persistDraft('Huidige locatie opgeslagen')},()=>showError('Locatie kon niet worden bepaald.'),{timeout:10000,maximumAge:600000})});
  $('tripForm').addEventListener('submit',async event=>{event.preventDefault();state.trip=readTripForm(state.trip);const errors=validateTripInput(state.trip);if(errors.length)return showError(errors.join(' '));showError();if(!state.trip.originPoint&&state.trip.liveData){setStatus('Vertrekplaats controleren…');const point=await geocodeOrigin(state.trip.origin);if(point)state.trip=normalizeTrip({...state.trip,originPoint:point})}if(state.trip.destinationQuery&&!state.trip.destinationPoint&&state.trip.liveData){const point=await geocodeOrigin(state.trip.destinationQuery);if(point)state.trip=normalizeTrip({...state.trip,destinationPoint:point})}state.dismissedIds=[];state.catalog=[...destinations];state.discoveryCursor=0;state.preferenceProfile.privateMode=state.trip.privateMode;savePreferenceProfile(state.preferenceProfile);refreshPortfolio();state.destination=null;state.plan=null;state.variants=[];$('resultsSection').classList.remove('hidden');$('planSection').classList.add('hidden');persistDraft();$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});if(state.trip.liveData)await discoverLiveOptions()});
  let saveTimer;const autosave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{state.trip=readTripForm(state.trip);persistDraft()},300)};$('tripForm').addEventListener('input',autosave);$('tripForm').addEventListener('change',autosave);
  $('tripForm').addEventListener('reisslim:preferences-changed',()=>{
    const scrollY=window.scrollY;
    state.trip=readTripForm(state.trip);
    state.preferenceProfile.privateMode=state.trip.privateMode;
    refreshPortfolio();
    persistDraft('Voorkeuren bijgewerkt');
    requestAnimationFrame(()=>window.scrollTo({top:scrollY,left:0,behavior:'auto'}));
  });
  $('destinationCards').addEventListener('click',event=>{const select=event.target.closest('[data-select]');if(select){const d=state.ranked.find(i=>i.id===select.dataset.select);if(d)chooseProposal(d)}const dismiss=event.target.closest('[data-dismiss-proposal]');if(dismiss){state.dismissedIds=[...new Set([...state.dismissedIds,dismiss.dataset.dismissProposal])];refreshPortfolio()}const save=event.target.closest('[data-save-proposal]');if(save){const id=save.dataset.saveProposal;state.savedProposalIds=state.savedProposalIds.includes(id)?state.savedProposalIds.filter(i=>i!==id):[...state.savedProposalIds,id];renderDestinations(state)}});
  $('destinationCards').addEventListener('change',event=>{
    if(!event.target.matches('[data-compare]'))return;
    const id=event.target.dataset.compare;
    if(event.target.checked){
      if(!state.compareIds.includes(id)&&state.compareIds.length<4)state.compareIds.push(id);
      else if(!state.compareIds.includes(id)&&state.compareIds.length>=4){
        event.target.checked=false;
        setStatus('Vergelijk maximaal 4 reisconcepten');
      }
    }else state.compareIds=state.compareIds.filter(i=>i!==id);
    renderDestinations(state);
    renderComparison(state);
    persistDraft(state.compareIds.length>=2?`${state.compareIds.length} reizen geselecteerd voor vergelijking`:'Vergelijking bijgewerkt');
    const section=$('compareSection');
    if(state.compareIds.length>=2)section?.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('reisslim:compare-updated',{detail:{count:state.compareIds.length}}));
  });
  $('clearCompareBtn').addEventListener('click',()=>{state.compareIds=[];renderDestinations(state);renderComparison(state);persistDraft('Vergelijking gewist');window.dispatchEvent(new CustomEvent('reisslim:compare-updated',{detail:{count:0}}))});
  $('moreProposalsBtn').addEventListener('click',async()=>{const more=getMoreProposals(state.trip,state.catalog,state.ranked.map(i=>i.id),portfolioOptions({limit:4,focus:$('proposalFocus').value}));state.ranked.push(...more);renderDestinations(state);if(state.trip.liveData)await discoverLiveOptions({append:true})});
  $('proposalFocus').addEventListener('change',refreshPortfolio);
  $('variantCards').addEventListener('click',event=>{const b=event.target.closest('[data-select-variant]');if(b)applyVariant(b.dataset.selectVariant)});
  $('orsApiKey').addEventListener('change',()=>saveRoutingSettings({orsApiKey:$('orsApiKey').value}));
  
  $('savedTripsList').addEventListener('click',event=>{const open=event.target.closest('[data-open-trip]');if(open){const r=loadTrips().find(i=>i.trip.id===open.dataset.openTrip);if(r){rebuildFromRecord(r);showView(state.destination?'itineraryView':'plannerView')}}const del=event.target.closest('[data-delete-trip]');if(del&&confirm('Reis verwijderen?')){deleteTrip(del.dataset.deleteTrip);renderDashboard(state,loadTrips())}});
  $('saveTripBtn').addEventListener('click',()=>{if(state.destination){if(!state.trip.tripName)state.trip.tripName=state.destination.name;saveTrip(stateForStorage());renderDashboard(state,loadTrips())}});
  $('exportJsonBtn').addEventListener('click',()=>state.destination&&downloadJson(exportState(),`${state.destination.id}-${state.trip.startDate}`));
  $('exportGpxBtn').addEventListener('click',async()=>{if(!state.destination)return;$('exportStatus').textContent='Volledige wegroute en waypoints ophalen…';try{const result=await downloadGpx(state.trip,state.destination,state.plan);$('exportStatus').textContent=`GPX klaar: ${result.trackPoints} routepunten · ${result.specificWaypoints} specifieke waypoints.`}catch(error){console.error(error);$('exportStatus').textContent=`GPX mislukt: ${error.message||'live wegroute niet beschikbaar'}`}});
  $('loadDemoBtn').addEventListener('click',()=>{state.trip=normalizeTrip({...defaults(),id:state.trip?.id,preferences:['natuur','bergen','motor'],preferenceWeights:{natuur:3,bergen:3,motor:2}});writeTripForm(state.trip);persistDraft()});
  $('assistantPreviewBtn').addEventListener('click',()=>{
    state.assistantPreview=interpretAssistantMessage($('assistantMessage').value,state.trip);
    $('assistantPreview').innerHTML=state.assistantPreview.understood?`<div class="assistant-result ok"><strong>Voorstel</strong><p>${state.assistantPreview.summary}</p></div>`:`<div class="assistant-result warn">${state.assistantPreview.message||''}</div>`;
    $('assistantApplyBtn').classList.toggle('hidden',!state.assistantPreview.understood);
    $('assistantCancelBtn').classList.toggle('hidden',!state.assistantPreview.understood);
  });
  $('assistantCancelBtn').addEventListener('click',()=>{$('assistantPreview').textContent='';$('assistantApplyBtn').classList.add('hidden');$('assistantCancelBtn').classList.add('hidden')});
  document.querySelectorAll('[data-assistant-example]').forEach(button=>button.addEventListener('click',()=>{
    $('assistantMessage').value=button.dataset.assistantExample;
    $('assistantPreviewBtn').click();
  }));
  $('assistantMessage').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('assistantPreviewBtn').click()}});
  $('unlockOptimizerBtn')?.addEventListener('click',()=>{resetOptimizerLocks();state.optimizationProposal=null;renderOptimizationPreview(state);renderStrongOptimizationPreview();setStatus('Alle optimizeronderdelen vrijgegeven')});
  resetOptimizerLocks();

  $('assistantApplyBtn').addEventListener('click',()=>{
    if(!state.assistantPreview?.understood)return;
    state.trip=normalizeTrip(applyAssistantPatch(state.trip,state.assistantPreview.patch));
    writeTripForm(state.trip);
    if(state.assistantPreview.optimizerMode&&$('optimizationMode'))$('optimizationMode').value=state.assistantPreview.optimizerMode;
    refreshPortfolio();
    if(state.destination){
      const refreshed=state.ranked.find(item=>item.id===state.destination.id)||state.destination;
      applyDestination(refreshed,false);
      const locks=Object.fromEntries([...document.querySelectorAll('[data-optimizer-lock]')].map(box=>[box.dataset.optimizerLock,box.checked]));
      state.optimizationProposal=proposeOptimizations(state.trip,refreshed,state.plan,{mode:state.assistantPreview.optimizerMode||$('optimizationMode').value,locks});
      renderOptimizationPreview(state);renderStrongOptimizationPreview();
    }
    persistDraft('Assistant-wijziging toegepast');
    $('assistantPreview').innerHTML='<div class="assistant-result applied">✓ Reis opnieuw opgebouwd met je opdracht.</div>';
    $('assistantApplyBtn').classList.add('hidden');$('assistantCancelBtn').classList.add('hidden');
  });
  $('improveTripBtn').addEventListener('click',()=>{if(!state.plan)return;const boxes=[...document.querySelectorAll('[data-optimizer-lock]')],locks=Object.fromEntries(boxes.map(x=>[x.dataset.optimizerLock,x.checked]));state.optimizationProposal=proposeOptimizations(state.trip,state.destination,state.plan,{mode:$('optimizationMode').value||'maximum',locks});renderOptimizationPreview(state);renderStrongOptimizationPreview();const gain=Math.round((state.optimizationProposal.after?.quality?.overall||0)-(state.optimizationProposal.before?.quality?.overall||0));setStatus(state.optimizationProposal.meaningful?`Sterke optimalisatie: ${gain>=0?'+':''}${gain} punten`:boxes.length&&boxes.every(x=>x.checked)?'Alles is beschermd; optimizer kan niets wijzigen':'Geen voldoende sterke verbetering gevonden');$('optimizationPreview')?.scrollIntoView({behavior:'smooth',block:'nearest'});});
  $('applyOptimizationBtn').addEventListener('click',()=>{if(!state.plan||!state.optimizationProposal)return;const ids=[...document.querySelectorAll('[data-optimization-action]:checked')].map(x=>x.dataset.optimizationAction);if(!ids.length)return;const before=Math.round(state.quality?.overall||state.optimizationProposal.before?.quality?.overall||0),selected=(state.optimizationProposal.actions||[]).filter(x=>ids.includes(x.id));state.undoSnapshot=clone({plan:state.plan,budget:state.budget,quality:state.quality,validation:state.validation,constraintStatus:state.constraintStatus});Object.assign(state,applyOptimizationProposal(state.trip,state.destination,state.plan,ids));const after=Math.round(state.quality?.overall||0);state.optimizationSummary={before,after,changes:selected.map(x=>`${x.title}: ${x.description}`)};state.optimizationProposal=null;renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderMap(state.plan);setStatus(`Optimalisatie toegepast: ${before}/100 → ${after}/100 (${after-before>=0?'+':''}${after-before})`);persistDraft(`Optimalisatie toegepast: ${before} → ${after}`);});
  $('rejectOptimizationBtn').addEventListener('click',()=>{state.optimizationProposal=null;renderOptimizationPreview(state)});
  $('undoOptimizeBtn').addEventListener('click',()=>{if(!state.undoSnapshot)return;Object.assign(state,state.undoSnapshot);state.undoSnapshot=null;renderPlan(state);renderMap(state.plan)});
  document.querySelectorAll('[data-inspire]').forEach(button=>button.addEventListener('click',()=>{$('destinationQuery').value=button.dataset.inspire;showView('plannerView')}));
}
document.addEventListener('DOMContentLoaded',initialize);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(`./service-worker.js?build=${BUILD}`,{updateViaCache:'none'}).then(reg=>reg.update()).catch(console.warn));
