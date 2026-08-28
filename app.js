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
import { enrichPlanWithPlaces, fetchWeatherForDestination, geocodeOrigin, prepareGeneratedRouteStops } from './place-provider.js';
import { $, renderComparison, renderDashboard, renderDestinations, renderItineraryVariants, renderOptimizationPreview, renderPlan, renderPreferenceGrid, renderVehicleControls, setStatus, showError, showView } from './ui-renderer.js';
import { loadPreferenceProfile, recordPreferenceEvent, savePreferenceProfile } from './preference-engine.js';
import { applyAssistantPatch, interpretAssistantMessage } from './assistant-engine.js';
import { enrichDestinationImages } from './image-provider.js';
import { weatherWindowScore } from './weather-engine.js';
import { ROADTRIP_POLICY, estimatedRoadKm, maximumRoadLegKm, planningSpeedKmh, repeatStayAllowed, requiredDistinctOvernights, selectRoadtripOvernights, selectRoadtripBase, selectBaseDayTrips, validateRoadtrip } from './roadtrip-policy.js';
import { enrichOvernightAccommodations } from './overnight-accommodation.js';
import { discoverRegionalOvernightCandidates } from './regional-overnight-provider.js';

const defaults=()=>normalizeTrip({origin:'Saasveld',startDate:localDate(30),days:10,budget:3500,travelMode:'direct',routeTopology:'loop',tripStructure:'moving',tripPace:'balanced',destinationQuery:'',adults:2,children:0,transport:'motorcycle',maxDrive:5,maxChanges:5,accommodationType:'any',comfort:'mid',strictBudget:true,strictDrive:true,strictChanges:true,allowStretch:true,liveData:true,remoteTravel:false,privateMode:false,notes:'',preferences:['natuur','motor'],preferenceWeights:{natuur:2,motor:2}});
const state={trip:null,ranked:[],ranking:null,destination:null,plan:null,budget:null,validation:[],quality:null,compareIds:[],savedProposalIds:[],dismissedIds:[],variants:[],selectedVariantId:null,optimized:false,undoSnapshot:null,optimizationSummary:null,optimizationProposal:null,routingRun:0,catalog:[...destinations],discoveryCursor:0,discoveryBusy:false,preferenceProfile:loadPreferenceProfile(),assistantPreview:null,liveDiscoveryStartedAt:0,liveDiscoveryTimer:null,liveDiscoveryProgress:null,weatherPortfolioRun:0,imageRejectedIds:[],imageHydrationBusy:false,retryDiscoveryQueued:false,globalDiscoveryBusy:false,anchorDiscoveryPriority:false};
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
function updateManualLiveDiscoveryButton(){
  const button=$('manualLiveDiscoveryBtn');
  if(!button)return;
  const available=Boolean(state.trip?.liveData);
  button.classList.toggle('hidden',!available);
  button.disabled=Boolean(state.retryDiscoveryQueued);
  button.textContent=state.retryDiscoveryQueued?'Nieuwe poging staat klaar…':state.discoveryBusy?'↻ Opnieuw proberen na huidige zoekactie':'↻ Opnieuw proberen';
}
function renderLiveDiscoveryProgress(){
  updateManualLiveDiscoveryButton();
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
  if(retry)retry.onclick=async()=>{
    if(retry.disabled)return;
    retry.disabled=true;
    retry.textContent=state.discoveryBusy?'Wachten op lopende zoekactie…':'Opnieuw zoeken…';
    setStatus(state.discoveryBusy?'Lopende live zoekactie afronden; nieuwe poging staat klaar…':'Nieuwe live zoekpoging starten…');
    await discoverLiveOptions({retry:true});
  };
}
function startLiveDiscoveryProgress(){
  state.liveDiscoveryStartedAt=Date.now();
  clearInterval(state.liveDiscoveryTimer);
  state.liveDiscoveryProgress={origin:state.trip.origin,reachKm:null,pass:0,totalPasses:1,candidateElements:0,liveDestinations:0,lastMessage:'Live OpenStreetMap-ontdekking voorbereiden…',complete:false,failed:false};
  document.body.dataset.liveDiscovery='running';
  renderLiveDiscoveryProgress();
  updateManualLiveDiscoveryButton();
  state.liveDiscoveryTimer=setInterval(renderLiveDiscoveryProgress,1000);
}
function finishLiveDiscoveryProgress(){
  clearInterval(state.liveDiscoveryTimer);
  state.liveDiscoveryTimer=null;
  delete document.body.dataset.liveDiscovery;
  renderLiveDiscoveryProgress();
  updateManualLiveDiscoveryButton();
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

function hasProposalImage(item){return /^https:\/\//i.test(String(item?.image?.url||''))&&item?.image?.validatedPhoto===true&&item?.image?.relevance==='destination-specific'}
function imageReadyState(){
  return{...state,ranked:[...(state.ranked||[])],ranking:state.ranking?{...state.ranking,exact:[...(state.ranking.exact||[])],stretched:[...(state.ranking.stretched||[])],visible:[...(state.ranking.visible||[])]}:null};
}
async function hydrateProposalImages(){
  if(state.imageHydrationBusy||!state.ranked.length)return;
  state.imageHydrationBusy=true;
  try{
    const missing=state.ranked.filter(item=>!hasProposalImage(item)&&!state.imageRejectedIds.includes(item.id));
    if(missing.length)await enrichDestinationImages(missing,{});
    const unresolved=missing.filter(item=>!hasProposalImage(item));
    if(unresolved.length)state.imageRejectedIds=state.imageRejectedIds.filter(id=>!unresolved.some(item=>item.id===id));
    renderDestinations(imageReadyState());renderPortfolioNavigator();renderComparison(imageReadyState());renderEnhancedComparison();
    const ready=state.ranked.filter(hasProposalImage).length;
    if(ready<8&&state.trip?.liveData&&!state.discoveryBusy&&!state.globalDiscoveryBusy&&state.dismissedIds.length<100){
      await discoverLiveOptions({append:true,quiet:true});
    }
  }finally{state.imageHydrationBusy=false}
}
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




function geoDistanceKm(a,b){if(!a||!b||!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||!Number.isFinite(b.lat)||!Number.isFinite(b.lon))return 0;const r=v=>v*Math.PI/180,R=6371,d1=r(b.lat-a.lat),d2=r(b.lon-a.lon),a1=r(a.lat),a2=r(b.lat),h=Math.sin(d1/2)**2+Math.cos(a1)*Math.cos(a2)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function roadtripLandCandidates(origin,trip=state.trip){
 const rows=[];
 for(const item of(state.catalog||[]))for(const b of(item?.bases||[])){
   if(!Number.isFinite(b?.lat)||!Number.isFinite(b?.lon))continue;
   const originKm=geoDistanceKm(origin,b);if(originKm<12)continue;
   const activityCount=Number(item.activities?.length||0),tagCount=Number(item.tags?.length||0);
   const poiRichness=Number.isFinite(Number(item.poiRichness))?Number(item.poiRichness):Math.min(100,activityCount*18+tagCount*5+(item.dynamic?12:0));
   const preferenceScore=(item.tags||[]).reduce((sum,tag)=>sum+((trip?.preferences||[]).includes(tag)?Number(trip?.preferenceWeights?.[tag]||2)*12:0),0);
   const vehicleScore=trip?.transport==='motorcycle'?Number(item.motorcycle||0):['motorhome','caravan'].includes(trip?.transport)?Number(item.camper||0):Number(item.family||0);
   rows.push({...b,name:b.name||item.name||'Overnachtingsregio',role:'destination',landValidated:true,generatedExploration:false,catalogId:item.id||null,originKm,poiRichness,activityCount,tagCount,preferenceScore,vehicleScore,tags:[...(item.tags||[])],destinationName:item.name||b.name});
 }
 const seen=[];return rows.filter(p=>{if(seen.some(q=>geoDistanceKm(q,p)<12))return false;seen.push(p);return true});
}
function tourLegLimitKm(trip){return maximumRoadLegKm(trip)}
function chooseTourStops(origin,trip,destination,nightCount){return selectRoadtripOvernights({origin:{...origin,name:trip.origin},trip,destination,candidates:roadtripLandCandidates(origin,trip)})}
function roadtripIntentReport(trip,plan){if(plan?.roadtripPolicy?.violations?.includes('no-suitable-base'))return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'geen geschikte centrale uitvalsbasis gevonden'};if(plan?.roadtripPolicy?.violations?.includes('insufficient-base-daytrips'))return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'te weinig gevarieerde dagritten rond de beste uitvalsbasis'};if(plan?.roadtripPolicy?.violations?.includes('insufficient-real-overnight-regions'))return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'onvoldoende echte overnachtingsregio’s rond de gekozen reisregio'};const r=validateRoadtrip(trip,plan);return{valid:r.valid,moved:r.moves?.filter(x=>x>=50).length||0,intentionalStays:(plan?.days||[]).filter(x=>x.intentionalStay).length,illegalShortMove:r.violations?.filter(x=>x.startsWith('short-move')).length||0,reason:r.valid?'roadtrip-ok':r.violations.join(', ')}}
function tourDay(kind,from,to,day,trip){const distanceKm=Math.max(10,Math.round(estimatedRoadKm(from,to))),speed=planningSpeedKmh(trip),roadHours=Number((distanceKm/speed).toFixed(1)),d=new Date(`${trip.startDate}T12:00:00`);d.setDate(d.getDate()+day-1);return{kind,typeLabel:kind==='return'?'Terugreis':kind==='transfer'?'Tour-etappe':'Heenreis',from:from.name,to:to.name,location:to.name,fromPoint:{...from},toPoint:{...to},overnight:kind==='return'?trip.origin:to.name,distanceKm,roadHours,driveHours:roadHours,elapsedHours:roadHours,breakHours:0,restStops:0,fuelStops:0,stopCount:0,waypoints:[],geometry:[{...from},{...to}],routeSource:'canonical-roadtrip-policy',primaryPlan:`Roadtrip-etappe naar ${to.name}.`,rainAlternative:'Kies bij slecht weer de veiligste directe route.',exceedsDailyLimit:roadHours>Number(trip.maxDrive||5)+.05,day,date:d.toISOString().slice(0,10)}}
function baseDayTripDay(base,target,day,trip){
 const oneWay=Math.round(estimatedRoadKm(base,target)),distanceKm=oneWay*2,speed=planningSpeedKmh(trip),elapsedHours=Number((distanceKm/speed).toFixed(1)),d=new Date(`${trip.startDate}T12:00:00`);d.setDate(d.getDate()+day-1);
 return{kind:'daytrip',typeLabel:'Dagrit vanuit uitvalsbasis',from:base.name,to:base.name,location:target.name,fromPoint:{...base},toPoint:{...base},destinationPoint:{...target},overnight:base.name,distanceKm,roadHours:elapsedHours,driveHours:elapsedHours,elapsedHours,breakHours:0,restStops:0,fuelStops:0,stopCount:0,waypoints:[{...target,role:'activity'}],geometry:[{...base},{...target},{...base}],routeSource:'canonical-base-daytrip',primaryPlan:`Dagrit vanuit ${base.name} naar ${target.name} en terug.`,rainAlternative:'Kies een kortere daglus vanuit dezelfde uitvalsbasis.',exceedsDailyLimit:elapsedHours>Number(trip.maxDrive||5)+.05,day,date:d.toISOString().slice(0,10)}
}
function ensureBaseTripProgression(trip,destination,plan){
 const days=Number(trip?.days||0);if(days<=1)return plan;
 const origin=plan?.routeMetrics?.origin||plan?.origin||plan?.days?.[0]?.fromPoint;if(!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lon))return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:['missing-origin']}};
 const candidates=roadtripLandCandidates(origin,trip),base=selectRoadtripBase({origin:{...origin,name:trip.origin},trip,destination,candidates});
 if(!base)return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:['no-suitable-base']},warnings:[...(plan.warnings||[]),'Geen voldoende sterke uitvalsbasis gevonden binnen de gekozen reisregio.']};
 const dayTripCount=Math.max(0,days-2),targets=selectBaseDayTrips({base,trip,candidates,count:dayTripCount});
 if(targets.length!==dayTripCount)return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:['insufficient-base-daytrips']},warnings:[...(plan.warnings||[]),'Te weinig gevarieerde dagritten gevonden rond de beste uitvalsbasis.']};
 const home={...origin,name:trip.origin,role:'origin',landValidated:true},rebuilt=[tourDay('outward',home,base,1,trip)];
 for(let i=0;i<targets.length;i++)rebuilt.push(baseDayTripDay(base,targets[i],i+2,trip));
 rebuilt.push(tourDay('return',base,home,days,trip));
 const candidate={...plan,days:rebuilt,accommodationChanges:0,baseSelection:{point:{...base},score:base.baseScore,why:base.baseWhy,label:`${base.name} als slimme uitvalsbasis`},routeMetrics:{...(plan.routeMetrics||{}),origin:{...origin},exploration:{overlap:0,explorationScore:100,method:'intelligent-base-daytrips'}},routing:{...(plan.routing||{}),source:'canonical-base-plan',live:false},topology:'base-daytrips'};
 candidate.roadtripPolicy=validateRoadtrip(trip,candidate);candidate.feasible=candidate.roadtripPolicy.valid;
 return candidate;
}
function ensureMultiDayRoadtripProgression(trip,destination,plan){const days=Number(trip?.days||0);if(days<=1||!plan?.days?.length)return plan;if(trip?.tripStructure==='base')return ensureBaseTripProgression(trip,destination,plan);const origin=plan.routeMetrics?.origin||plan.origin||plan.days[0]?.fromPoint;if(!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lon))return{...plan,roadtripPolicy:{valid:false,violations:['missing-origin']}};const nights=days-1,stops=chooseTourStops({...origin,name:trip.origin},trip,destination,nights);if(stops.length!==nights)return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:['insufficient-real-overnight-regions']},warnings:[...(plan.warnings||[]),'Onvoldoende echte overnachtingsregio’s voor de harde roadtripregels.']};const rebuilt=[],home={...origin,name:trip.origin,role:'origin',landValidated:true};let from=home,last=null,changes=0;for(let i=0;i<nights;i++){const to=stops[i],same=i>0&&last===to.catalogId;if(same){if(!repeatStayAllowed(to,trip,i,nights))return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:[`unjustified-repeat:${i+1}`]}};rebuilt.push({kind:'stay',fromPoint:{...to},toPoint:{...to},from:to.name,to:to.name,location:to.name,overnight:to.name,distanceKm:0,roadHours:0,driveHours:0,elapsedHours:0,intentionalStay:true,stayJustification:Number(to.poiRichness||0)>=85?'exceptionele POI-dichtheid':'geplande rustdag',generatedExploration:false,day:i+1,date:trip.startDate})}else{if(i>0)changes++;rebuilt.push(tourDay(i===0?'outward':'transfer',from,to,i+1,trip))}from=to;last=to.catalogId}if(trip.routeTopology==='open-ended'){
   // For open-ended trips the final day must still make geographic progress.
   const finalCandidates=roadtripLandCandidates(origin).filter(p=>p.catalogId!==last&&estimatedRoadKm(from,p)>=ROADTRIP_POLICY.minRoadMoveKm&&estimatedRoadKm(from,p)<=maximumRoadLegKm(trip));
   const finalStop=finalCandidates.sort((a,b)=>estimatedRoadKm(from,a)-estimatedRoadKm(from,b))[0];
   if(!finalStop)return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:['insufficient-final-open-ended-region']}};
   rebuilt.push(tourDay('transfer',from,finalStop,days,trip));
 }else{
   rebuilt.push(tourDay('return',from,home,days,trip));
 }const candidate={...plan,days:rebuilt,accommodationChanges:changes,routeMetrics:{...(plan.routeMetrics||{}),origin:{...origin},exploration:{overlap:0,explorationScore:100,method:'canonical-roadtrip-policy'}},routing:{...(plan.routing||{}),source:'canonical-roadtrip-policy',live:false}};candidate.roadtripPolicy=validateRoadtrip(trip,candidate);candidate.feasible=candidate.roadtripPolicy.valid;return candidate}

function derivePlanState(destination,plan){plan=ensureMultiDayRoadtripProgression(state.trip,destination,plan);const policy=validateRoadtrip(state.trip,plan),budget=buildBudget(state.trip,destination,plan),constraintStatus=evaluatePlanConstraints(state.trip,plan,budget,{allowStretch:destination.category==='stretch'});plan.roadtripPolicy=policy;plan.constraintStatus=constraintStatus;plan.feasible=policy.valid&&constraintStatus.exact;plan.warnings=[...new Set([...(plan.warnings||[]),...constraintStatus.violations.map(item=>item.detail)])];return{plan,budget,quality:calculateTripQuality(state.trip,destination,plan,budget),validation:validatePlan(state.trip,destination,plan,budget),constraintStatus}}

const optimizerDimensionLabels={driving:'Rijbelasting',budget:'Budget',relaxation:'Ontspanning',family:'Gezin',adventure:'Avontuur',weather:'Weerbestendig',variety:'Variatie',crowds:'Rust',realism:'Realisme',completeness:'Compleetheid',routeEfficiency:'Route-efficiëntie',routeExploration:'Routeverkenning',vehicleSuitability:'Voertuigmatch',safetyReadiness:'Veiligheid',poiQuality:'POI-kwaliteit',bookingReadiness:'Boekbaarheid',documentationReadiness:'Documenten'};
function escOpt(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function renderStrongOptimizationPreview(){const p=state.optimizationProposal,box=$('optimizationPreview');if(!box)return;if(!p){box.innerHTML='';return}const before=Math.round(p.before?.quality?.overall||0),after=Math.round(p.after?.quality?.overall||0),gain=after-before,rb=p.before?.quality?.rawDimensions||{},ra=p.after?.quality?.rawDimensions||{},weights=p.after?.quality?.optimizationWeights||{},totalWeight=Number(p.after?.quality?.optimizationTotalWeight||Object.values(weights).reduce((a,b)=>a+Number(b||0),0)||1),ds=Object.keys({...rb,...ra}).map(key=>{const rawDelta=Number(ra[key]||0)-Number(rb[key]||0),weightedDelta=rawDelta*Number(weights[key]||0)/totalWeight;return{key,b:Math.round(rb[key]||0),a:Math.round(ra[key]||0),d:Math.round(rawDelta),w:weightedDelta}}).filter(x=>Math.abs(x.d)>=1).sort((x,y)=>y.w-x.w),positives=ds.filter(x=>x.w>0).slice(0,6),negatives=ds.filter(x=>x.w<0).sort((x,y)=>x.w-y.w).slice(0,4),weightedNet=ds.reduce((sum,x)=>sum+x.w,0),locks=[...document.querySelectorAll('[data-optimizer-lock]')],allLocked=locks.length&&locks.every(x=>x.checked),strong=Boolean(p.meaningful);$('applyOptimizationBtn').classList.toggle('hidden',!strong);$('rejectOptimizationBtn').classList.remove('hidden');const fmt=n=>`${n>=0?'+':''}${n.toFixed(1)}`;box.innerHTML=`<section class="optimizer-impact-card ${strong?'is-strong':'is-weak'}"><div class="optimizer-score-shift"><div><small>NU</small><strong>${before}</strong><span>/100</span></div><b>→</b><div><small>NA</small><strong>${after}</strong><span>/100</span></div><em>${gain>=0?'+':''}${gain}</em></div><div class="optimizer-impact-copy"><strong>${allLocked?'Optimizer geblokkeerd':strong?'Sterke verbetering gevonden':'Niet sterk genoeg om toe te passen'}</strong><p>${escOpt(p.message||'')}</p></div></section>${allLocked?'<div class="optimizer-blocked-note"><strong>Alle vier onderdelen staan beschermd.</strong><span>ReisSlim mag daardoor niets veranderen. Tik op “Alles vrijgeven”.</span></div>':''}${ds.length?`<div class="optimizer-delta-panel"><div class="optimizer-panel-title"><strong>Zo wordt de totaalscore berekend</strong><small>Deelscore · gewogen effect</small></div>${positives.map(x=>`<div class="optimizer-delta-row"><span>${escOpt(optimizerDimensionLabels[x.key]||x.key)}</span><div><b>${x.b}</b><i>→</i><strong>${x.a}</strong></div><em>${fmt(x.w)}</em></div>`).join('')}${negatives.length?`<div class="optimizer-tradeoffs"><strong>Minpunten</strong>${negatives.map(x=>`<span>${escOpt(optimizerDimensionLabels[x.key]||x.key)} ${fmt(x.w)}</span>`).join('')}</div>`:''}<div class="optimizer-delta-row optimizer-net-row"><span>Netto gewogen effect</span><div></div><em>${fmt(weightedNet)}</em></div><small class="optimizer-math-note">De grote getallen hierboven zijn deelscores op 100. De waarde rechts is hun werkelijke gewogen bijdrage aan de totale reisscore.</small></div>`:''}${p.actions?.length?`<div class="optimizer-change-panel"><div class="optimizer-panel-title"><strong>Wat verandert er concreet?</strong><small>${p.actions.length} wijzigingen</small></div>${p.actions.map(x=>`<label class="optimizer-action-card"><input type="checkbox" data-optimization-action="${escOpt(x.id)}" checked><span class="optimizer-action-icon">✓</span><span><strong>${escOpt(x.title)}</strong><small>${escOpt(x.description)}</small></span></label>`).join('')}</div>`:''}<small class="optimizer-threshold">${escOpt(p.threshold||'')}</small>`} 
function syncPlanVisualHero(){if(!$('planVisualHero')||!state.trip)return;const title=state.destination?.name||'Jouw roadtrip';$('planVisualTitle').textContent=title;$('planVisualDays').textContent=`${state.trip.days} ${state.trip.days===1?'dag':'dagen'}`;$('planVisualRoute').textContent=state.plan?.topology==='day-loop'?'Daglus':state.plan?.topology==='daytrip'?'Dagtrip':state.trip.routeTopology==='loop'?'Lusroute':state.trip.routeTopology==='open-ended'?'Open einde':'Heen & terug';$('planVisualBudget').textContent=state.budget?.total?`± €${Math.round(state.budget.total).toLocaleString('nl-NL')}`:`Budget €${Number(state.trip.budget||0).toLocaleString('nl-NL')}`;const img=$('planVisualImage'),url=String(state.destination?.image?.url||'');if(img){if(/^https:\/\//i.test(url)){img.src=url;img.alt=`Beeld van ${title} langs de voorgestelde route`;img.hidden=false}else{img.removeAttribute('src');img.alt='';img.hidden=true}}}
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


function reconcileDayEndpointsToRoad(plan){
  if(!plan?.routing?.live)return plan;
  const days=plan.days||[];
  for(let i=0;i<days.length;i++){
    const day=days[i],geometry=(day.geometry||[]).filter(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon));
    if(geometry.length<2||!day.toPoint)continue;
    const roadEnd=geometry.at(-1);
    const mismatch=geoDistanceKm(day.toPoint,roadEnd);
    // A live road route is authoritative for where the leg actually ends.
    // Stale synthetic/day points several kilometres away can otherwise survive
    // enrichment and appear as isolated markers in the sea.
    if(mismatch>2.5){
      day.toPoint={...day.toPoint,lat:roadEnd.lat,lon:roadEnd.lon,roadEndpointReconciled:true};
      const next=days[i+1];
      if(next?.fromPoint){
        next.fromPoint={...next.fromPoint,lat:roadEnd.lat,lon:roadEnd.lon,roadEndpointReconciled:true};
        if(Array.isArray(next.geometry)&&next.geometry.length){
          next.geometry[0]={...next.geometry[0],lat:roadEnd.lat,lon:roadEnd.lon};
        }
      }
    }
  }
  return plan;
}

function ensureRenderableDayGeometries(plan){
 if(!plan?.days)return plan;
 for(const day of plan.days){
   const from=day.fromPoint,to=day.toPoint,target=day.destinationPoint;
   if(day.kind==='daytrip'&&from&&target&&to&&Number.isFinite(from.lat)&&Number.isFinite(target.lat)&&Number.isFinite(to.lat)){
     const valid=(day.geometry||[]).filter(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon));
     if(valid.length<3)day.geometry=[{...from},{...target},{...to}];
     continue;
   }
   if(['outward','transfer','return'].includes(day.kind)&&from&&to&&Number.isFinite(from.lat)&&Number.isFinite(from.lon)&&Number.isFinite(to.lat)&&Number.isFinite(to.lon)){
     const valid=(day.geometry||[]).filter(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon));
     if(valid.length<2)day.geometry=[{...from},{...to}];
   }
 }
 return plan;
}
function renderRoadtripMap(plan){
 ensureRenderableDayGeometries(plan);
 const result=renderMap(plan);
 const expected=(plan?.days||[]).filter(day=>Array.isArray(day.geometry)&&day.geometry.filter(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon)).length>1).length;
 if(result?.rendered&&Number(result.segments||0)<expected)console.warn('Kaart mist dagsegmenten',{expected,rendered:result.segments});
 if(plan)plan.mapDiagnostics={expectedSegments:expected,renderedSegments:Number(result?.segments||0),complete:Boolean(result?.rendered&&Number(result.segments||0)>=expected)};
 return result;
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
      plan=await enrichPlanWithLiveRouting(state.trip,state.destination,plan,{timeoutMs:7000,onProgress:event=>{
        if(run!==state.routingRun)return;
        const completed=Number(event?.completed||0),total=Number(event?.total||0),fraction=total?Math.min(1,completed/total):0;
        const day=event?.day?` · dag ${event.day}`:'';
        updatePlanLoading(24+Math.round(fraction*23),'Wegroute berekenen…',`Etappes over echte wegen controleren${day} · ${completed}/${total||'…'} klaar.`,'Route');
        $('mapDataStatus').textContent=`Live wegroute · ${completed}/${total||'…'} etappes`;
      }});
      if(run!==state.routingRun||state.destination?.id!==destinationId)return;
      plan=reconcileDayEndpointsToRoad(plan);
      Object.assign(state,derivePlanState(state.destination,plan));
      renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderRoadtripMap(state.plan);
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
    // Single final accommodation authority: discard the generic provider's older
    // accommodation choice so it cannot conflict with vehicle-aware selection.
    for(const day of plan.days||[]){day.recommendations=(day.recommendations||[]).filter(item=>item.type!=='accommodation');day.sleepProposal=null}
    plan.recommendations=(plan.days||[]).flatMap(day=>day.recommendations||[]);
    plan=await enrichOvernightAccommodations(state.trip,plan,{timeoutMs:5500});
    if(run!==state.routingRun||state.destination?.id!==destinationId)return;
    plan=reconcileDayEndpointsToRoad(plan);

    updatePlanLoading(92,'Reisplan samenstellen…','We verwerken route, POI’s, weer, budget en dagplanning in één reisplan.','Samenstellen');
    const finalRoadtripCheck=roadtripIntentReport(state.trip,plan);
    if(!finalRoadtripCheck.valid){
      hidePlanLoading(false);
      planLiveBanner(`Live verrijking is genegeerd omdat die de geldige roadtrip zou verslechteren (${finalRoadtripCheck.reason}).`,'error');
      setStatus('Bestaande geldige roadtrip behouden');return;
    }
    Object.assign(state,derivePlanState(state.destination,plan));
    renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderRoadtripMap(state.plan);
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
function applyDestination(destination,optimize=false){if(state.trip?.liveData)showPlanLoading('Reisplan opbouwen…','We starten met route, plaatsen en dagplanning.');Object.assign(state,{destination,...calculatePlan(destination,optimize),optimized:optimize,selectedVariantId:'balanced',optimizationProposal:null});renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderRoadtripMap(state.plan);$('variantSection').classList.add('hidden');$('planSection').classList.remove('hidden');$('mapHint').classList.add('hidden');$('noPlanItinerary').classList.add('hidden');persistDraft();renderDashboard(state,loadTrips());if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)}
function chooseProposal(destination){learn('select',destination);state.destination=destination;if(state.trip?.liveData&&!destination.image)void enrichDestinationImages([destination],{maximum:1}).then(()=>{if(state.destination?.id===destination.id){syncPlanVisualHero();persistDraft('Routebeeld geladen')}});state.variants=buildItineraryVariants(state.trip,destination);state.selectedVariantId='balanced';state.plan=null;$('variantSection').classList.add('hidden');$('planSection').classList.add('hidden');$('noPlanItinerary').classList.add('hidden');persistDraft('Reisconcept gekozen · gebalanceerde opbouw');showView('itineraryView');applyVariant('balanced')}
let portfolioWeatherTimer=null;
function schedulePortfolioWeather(){clearTimeout(portfolioWeatherTimer);portfolioWeatherTimer=setTimeout(()=>void enrichPortfolioWeather(),180)}
async function enrichPortfolioWeather(){
  if(!state.trip?.liveData||!state.ranked?.length)return;
  const run=++state.weatherPortfolioRun,targets=state.ranked.slice(0,10);
  await Promise.allSettled(targets.map(async item=>{
    const weather=await fetchWeatherForDestination(state.trip,item,{weatherTimeoutMs:3200});
    if(run!==state.weatherPortfolioRun||!weather?.days?.length)return;
    const window=weatherWindowScore(weather,state.trip);if(!window)return;
    item.weatherBaseSeason??=Number(item.dimensions?.season||50);
    item.weatherBaseScore??=Number(item.score||50);
    item.weatherBasePortfolioScore??=Number(item.portfolioScore||item.score||50);
    const liveSeason=Math.round(item.weatherBaseSeason*.35+window.score*.65);
    const overallDelta=Math.round((liveSeason-item.weatherBaseSeason)*.10);
    item.liveWeather=weather;item.liveWeatherScore=window.score;item.liveWeatherWorst=window.worst;
    item.dimensions.season=liveSeason;item.score=Math.max(0,Math.min(100,item.weatherBaseScore+overallDelta));item.portfolioScore=item.weatherBasePortfolioScore+overallDelta;
    globalThis.__REISSLIM_PROPOSAL_SCORES=globalThis.__REISSLIM_PROPOSAL_SCORES||{};
    if(globalThis.__REISSLIM_PROPOSAL_SCORES[item.id])globalThis.__REISSLIM_PROPOSAL_SCORES[item.id].season=liveSeason;
    globalThis.__REISSLIM_PROPOSAL_WEATHER=globalThis.__REISSLIM_PROPOSAL_WEATHER||{};
    globalThis.__REISSLIM_PROPOSAL_WEATHER[item.id]={score:window.score,worst:window.worst,days:weather.days.length};
  }));
  if(run!==state.weatherPortfolioRun)return;
  const sort=(a,b)=>Number(b.portfolioScore||b.score)-Number(a.portfolioScore||a.score);
  state.ranking.exact.sort(sort);state.ranking.stretched.sort(sort);state.ranking.visible=[...state.ranking.exact,...state.ranking.stretched].slice(0,12);state.ranked=state.ranking.visible;
  renderDestinations(imageReadyState());updateReviewProgress();renderPortfolioNavigator();renderComparison(state);renderEnhancedComparison();window.dispatchEvent(new CustomEvent('reisslim:weather-proposals-updated'));
}
function updateReviewProgress(){
  const badge=$('resultCount');
  if(!badge)return;
  const visible=state.ranked.length,reviewed=state.dismissedIds.length;
  badge.textContent=`${visible} nu · ${reviewed}/100 beoordeeld`;
}
let portfolioImageHydrateTimer=null;
function schedulePortfolioImages(){
  clearTimeout(portfolioImageHydrateTimer);
  portfolioImageHydrateTimer=setTimeout(()=>void hydrateProposalImages(),80);
}
function refreshPortfolio(){
  if(state.trip)state.trip.allowStretch=true;
  const activeCatalog=state.catalog.filter(item=>!state.dismissedIds.includes(item.id));
  state.ranking=buildProposalPortfolio(state.trip,activeCatalog,portfolioOptions({limit:12,focus:$('proposalFocus').value,excludedIds:[]}));
  state.ranked=state.ranking.visible;
  renderDestinations(imageReadyState());updateReviewProgress();renderPortfolioNavigator();renderComparison(state);renderEnhancedComparison();schedulePortfolioWeather();schedulePortfolioImages();updateManualLiveDiscoveryButton();
}
async function discoverLiveOptions({append=false,retry=false,quiet=false}={}){
  if(!state.trip?.liveData)return 0;
  if(state.discoveryBusy){
    if(!retry)return 0;
    // Manual retry must never be swallowed by a background/prefetch discovery.
    // Queue exactly one retry and run it as soon as the active discovery releases the lock.
    if(state.retryDiscoveryQueued)return 0;
    state.retryDiscoveryQueued=true;
    if(!quiet){
      const p=state.liveDiscoveryProgress||(state.liveDiscoveryProgress={});
      p.failed=false;p.complete=false;p.lastMessage='Lopende zoekactie afronden; jouw nieuwe poging start automatisch…';
      renderLiveDiscoveryProgress();
    }
    try{
      const deadline=Date.now()+20000;
      while(state.discoveryBusy&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,120));
      if(state.discoveryBusy){
        if(!quiet){
          const p=state.liveDiscoveryProgress||(state.liveDiscoveryProgress={});
          p.failed=true;p.complete=false;p.failureReason='De vorige live zoekactie reageert niet. Probeer opnieuw.';
          renderLiveDiscoveryProgress();
        }
        return 0;
      }
      return await discoverLiveOptions({append,retry:true,quiet});
    }finally{state.retryDiscoveryQueued=false}
  }
  state.discoveryBusy=true;
  updateManualLiveDiscoveryButton();
  if(retry){
    state.discoveryCursor=Math.max(1,state.discoveryCursor+1);
    // Preserve already discovered global roadtrip regions. The old reset to the
    // static catalogue silently deleted South-African candidates on every retry.
    refreshPortfolio();
  }
  if(!quiet){startLiveDiscoveryProgress();setStatus('Live reisopties zoeken via OpenStreetMap…')}
  try{
    let addedTotal=0;
    const batchHandler=async batch=>{
      const known=new Set(state.catalog.map(i=>i.id));
      const fresh=(batch.destinations||[]).filter(i=>!known.has(i.id));
      if(!fresh.length)return;
      state.catalog.push(...fresh);
      addedTotal+=fresh.length;
      if(!quiet){refreshPortfolio();await new Promise(resolve=>requestAnimationFrame(()=>resolve()));persistDraft(`${addedTotal} live regio’s gevonden — zoeken gaat verder`)}
    };
    let result=await discoverDestinationBatch(state.trip,{
      cursor:state.discoveryCursor,
      excludedIds:[...state.catalog.map(i=>i.id),...state.dismissedIds],
      timeoutMs:7000,
      bypassCache:retry,
      onProgress:quiet?undefined:handleDiscoveryProgress,
      onBatch:batchHandler
    });
    state.discoveryCursor++;

    // Provider contract fix: destination-provider returns the completed discovery
    // set in result.destinations. Older app code only merged onBatch callbacks, but
    // the current provider does not emit onBatch, so live regions were reported as
    // found without ever entering state.catalog. That left tour generation with
    // only the static catalogue (mostly Europe) plus the selected Cape Town item.
    if(result.destinations?.length){
      const known=new Set(state.catalog.map(item=>item.id));
      const fresh=result.destinations.filter(item=>!known.has(item.id));
      if(fresh.length){
        state.catalog.push(...fresh);
        addedTotal+=fresh.length;
        if(!quiet)refreshPortfolio();
      }
    }

    // If an initial cached search produces zero usable destinations, don't stop
    // and show an error. Immediately do one genuinely fresh search using a new
    // seed group. This is the deployed 1605 failure shown as "0s · lokale cache".
    if(!retry&&!result.destinations?.length&&state.liveDiscoveryProgress?.sawCache){
      const p=state.liveDiscoveryProgress;
      p.failed=false;p.complete=false;p.endpointLabel='live bron';
      p.lastMessage='Cache leverde geen bruikbare regio’s op — automatisch een verse OpenStreetMap-zoekronde starten…';
      if(!quiet)renderLiveDiscoveryProgress();
      result=await discoverDestinationBatch(state.trip,{
        cursor:state.discoveryCursor,
        excludedIds:[...state.catalog.map(i=>i.id),...state.dismissedIds],
        timeoutMs:7000,
        bypassCache:true,
        onProgress:quiet?undefined:handleDiscoveryProgress,
        onBatch:batchHandler
      });
      state.discoveryCursor++;
      if(result.destinations?.length){
        const known=new Set(state.catalog.map(item=>item.id));
        const fresh=result.destinations.filter(item=>!known.has(item.id));
        if(fresh.length){state.catalog.push(...fresh);addedTotal+=fresh.length;if(!quiet)refreshPortfolio()}
      }
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
        onProgress:quiet?undefined:handleDiscoveryProgress,
        onBatch:batchHandler
      });
      state.discoveryCursor++;
      if(second.destinations?.length){
        const known=new Set(state.catalog.map(item=>item.id));
        const fresh=second.destinations.filter(item=>!known.has(item.id));
        if(fresh.length){state.catalog.push(...fresh);addedTotal+=fresh.length;if(!quiet)refreshPortfolio()}
        result=second;
      }
    }

    if(result.destinations?.length){
      void hydrateProposalImages();
      persistDraft(`${result.destinations.length} live regio’s gevonden`);
    }else{
      if(!quiet)setStatus('Reisportfolio gereed · live uitbreiding kon deze ronde niet worden toegevoegd');
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
    if(!quiet)renderLiveDiscoveryProgress();
    return result.destinations?.length||0;
  }catch(error){
    console.error(error);
    if(state.liveDiscoveryProgress){
      state.liveDiscoveryProgress.failed=true;
      state.liveDiscoveryProgress.failureReason=String(error?.message||error);
      state.liveDiscoveryProgress.lastMessage='Onverwachte fout tijdens live zoeken.';
    }
    if(!quiet)renderLiveDiscoveryProgress();
    return 0;
  }finally{
    state.discoveryBusy=false;
    updateManualLiveDiscoveryButton();
    if(!quiet)finishLiveDiscoveryProgress();
  }
}

const REVIEW_VISIBLE_TARGET=8;
const REVIEW_RESERVE_TARGET=100;
const REVIEW_SEARCH_ROUNDS=24;
let reviewPrefetchBusy=false;
let reviewSearchEmptyRounds=0;

function showReviewQueueStatus(message){
  let box=document.getElementById('reviewQueueStatus');
  if(!box){
    box=document.createElement('div');
    box.id='reviewQueueStatus';
    box.className='review-queue-status';
    $('destinationCards')?.prepend(box);
  }
  box.textContent=message;
}

function hideReviewQueueStatus(){document.getElementById('reviewQueueStatus')?.remove()}

async function ensureReviewQueue({target=REVIEW_VISIBLE_TARGET,maxRounds=REVIEW_SEARCH_ROUNDS}={}){
  refreshPortfolio();
  if(!state.trip?.liveData||state.ranked.length>=target)return state.ranked.length;
  showReviewQueueStatus(`Nieuwe reisopties zoeken… ${state.dismissedIds.length}/100 beoordeeld`);
  let rounds=0,empty=0;
  while(state.ranked.length<target&&rounds<maxRounds&&empty<6){
    rounds++;
    const before=state.catalog.length;
    if(rounds===1||rounds%4===0)await discoverRoadtripOvernightPool(state.trip);
    const added=await discoverLiveOptions({append:true,quiet:true});
    const gained=Math.max(Number(added||0),state.catalog.length-before);
    if(gained>0){empty=0;reviewSearchEmptyRounds=0}else{empty++;reviewSearchEmptyRounds++}
    refreshPortfolio();
    showReviewQueueStatus(`Nieuwe reisopties zoeken… ${state.ranked.length} klaar · ${state.dismissedIds.length}/100 beoordeeld`);
  }
  hideReviewQueueStatus();
  if(!state.ranked.length){
    const totalReviewed=state.dismissedIds.length;
    const message=document.createElement('div');
    message.className='review-exhausted';
    message.innerHTML=`<strong>${totalReviewed} unieke opties beoordeeld</strong><p>ReisSlim heeft in deze zoekrondes geen nieuwe unieke reis gevonden. We zoeken opnieuw zodra je voorwaarden of focus wijzigen.</p>`;
    $('destinationCards').prepend(message);
  }
  scheduleReviewPrefetch();
  return state.ranked.length;
}

function scheduleReviewPrefetch(){
  if(reviewPrefetchBusy||state.globalDiscoveryBusy||!state.trip?.liveData)return;
  const run=()=>void prefetchReviewReserve();
  if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1800});else setTimeout(run,700);
}

async function prefetchReviewReserve(){
  if(reviewPrefetchBusy||state.discoveryBusy||state.globalDiscoveryBusy||!state.trip?.liveData)return;
  reviewPrefetchBusy=true;
  try{
    let rounds=0,empty=0;
    const unseenCount=()=>Math.max(0,(state.ranking?.candidates||[]).filter(item=>!state.dismissedIds.includes(item.id)).length);
    while(unseenCount()<REVIEW_RESERVE_TARGET&&rounds<18&&empty<6){
      rounds++;
      const before=state.catalog.length;
      if(rounds===1||rounds%3===0)await discoverRoadtripOvernightPool(state.trip);
      const added=await discoverLiveOptions({append:true,quiet:true});
      const gained=Math.max(Number(added||0),state.catalog.length-before);
      if(gained>0){empty=0;reviewSearchEmptyRounds=0}else{empty++;reviewSearchEmptyRounds++}
      // Rebuild only in memory/DOM after each useful batch so newly found regions
      // become immediately available as replacements when a card is dismissed.
      if(gained>0)refreshPortfolio();
    }
  }finally{reviewPrefetchBusy=false}
}

const comparisonPreferenceMap={
  natuur:'natuur',bergen:'bergen',zwemmen:'swimming',wandelen:'walking',
  kinderen:'family',motor:'transport',cultuur:'culture',eten:'food',kust:'kust',budget:'budget'
};
const comparisonLabels={
  score:'Totale match',budget:'Budgetmatch',driving:'Reisbelasting',season:'Seizoen / weer',
  transport:'Voertuigmatch',family:'Kindvriendelijk',natuur:'Natuur',bergen:'Bergen',kust:'Kust / water',
  walking:'Wandelen',swimming:'Zwemmen',food:'Eten',culture:'Cultuur',crowds:'Rust / drukte'
};
let proposalCompareMap=null;
let comparisonView='overview';

function comparisonSelected(){
  const all=[...(state.ranking?.candidates||[]),...state.ranked,...state.catalog];
  return state.compareIds.map(id=>all.find(item=>item.id===id)).filter(Boolean).filter((item,index,array)=>array.findIndex(x=>x.id===item.id)===index);
}
function activeProposalScores(item){return globalThis.__REISSLIM_PROPOSAL_SCORES?.[item.id]||item.scoringContext?.criteria||{}}
function metricValue(item,key){return key==='score'?Number(item.score):Number(activeProposalScores(item)?.[key])}
function selectedComparisonRows(){
  const selected=comparisonSelected();
  const active=[...new Set(selected.flatMap(item=>Object.keys(activeProposalScores(item)||{})))];
  const ordered=['budget','driving','season','transport','family','natuur','bergen','kust','walking','swimming','food','culture','crowds'];
  return ['score',...ordered.filter(key=>active.includes(key))];
}
function comparisonWinnerIndexes(selected,key,{lower=false}={}){
  const values=selected.map(item=>key==='estimate'?Number(item.estimate):key==='distance'?Number(item.distanceKm):metricValue(item,key));
  const finite=values.filter(Number.isFinite);if(!finite.length)return new Set();
  const best=(lower?Math.min:Math.max)(...finite);
  return new Set(values.map((value,index)=>Number.isFinite(value)&&Math.abs(value-best)<.001?index:-1).filter(index=>index>=0));
}
function comparisonDeltaSummary(selected){
  if(selected.length<2)return'';
  const ordered=[...selected].sort((x,y)=>Number(y.score)-Number(x.score));
  const a=ordered[0],b=ordered[1],diff=Math.round(Number(a.score)-Number(b.score));
  const rows=selectedComparisonRows().filter(key=>key!=='score').map(key=>({key,delta:metricValue(a,key)-metricValue(b,key)})).filter(x=>Number.isFinite(x.delta)).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)).slice(0,3);
  const parts=rows.map(x=>`${x.delta>=0?'+':''}${Math.round(x.delta)} ${comparisonLabels[x.key]||x.key}`);
  return `<div class="compare-why"><strong>Waarom ${a.name} boven ${b.name}?</strong><p>${diff>=0?'+':''}${diff} totaal${parts.length?` · ${parts.join(' · ')}`:''}</p></div>`;
}
function renderComparisonMap(selected){
  const node=document.getElementById('proposalCompareMap');if(!node||comparisonView!=='map')return;
  if(proposalCompareMap){proposalCompareMap.remove();proposalCompareMap=null}
  const L=globalThis.L,origin=state.trip?.originPoint;
  const points=selected.map(item=>({item,point:item.bases?.[0]})).filter(x=>Number.isFinite(x.point?.lat)&&Number.isFinite(x.point?.lon));
  if(!L||!points.length){node.innerHTML='<div class="compare-map-empty">Geen kaartcoördinaten beschikbaar voor deze selectie.</div>';return}
  proposalCompareMap=L.map(node,{zoomControl:true,scrollWheelZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap-bijdragers'}).addTo(proposalCompareMap);
  const colors=['#0f766e','#4f7db2','#7d5bc6','#cf6848'];
  const bounds=[];
  if(Number.isFinite(origin?.lat)&&Number.isFinite(origin?.lon)){
    L.circleMarker([origin.lat,origin.lon],{radius:8,weight:3,fillOpacity:1}).addTo(proposalCompareMap).bindTooltip(state.trip.origin||'Vertrek');
    bounds.push([origin.lat,origin.lon]);
  }
  points.forEach(({item,point},index)=>{
    const color=colors[index%colors.length];
    L.circleMarker([point.lat,point.lon],{radius:9,weight:3,fillOpacity:.95,color,fillColor:color}).addTo(proposalCompareMap).bindTooltip(`${item.name} · ${item.score}/100`);
    bounds.push([point.lat,point.lon]);
    if(Number.isFinite(origin?.lat)&&Number.isFinite(origin?.lon))L.polyline([[origin.lat,origin.lon],[point.lat,point.lon]],{color,weight:4,opacity:.8,dashArray:'8 8'}).addTo(proposalCompareMap);
  });
  if(bounds.length)proposalCompareMap.fitBounds(bounds,{padding:[28,28],maxZoom:8});
  setTimeout(()=>proposalCompareMap?.invalidateSize(),80);
}
function renderEnhancedComparison(){
  const selected=comparisonSelected(),host=$('comparisonTable');
  if(!host||selected.length<2)return;
  const rows=selectedComparisonRows();
  const overview=`<div class="compare-overview-strip">${selected.map((item,index)=>{
    const top=rows.filter(k=>k!=='score').map(key=>[key,metricValue(item,key)]).filter(([,v])=>Number.isFinite(v)).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const weak=rows.filter(k=>k!=='score').map(key=>[key,metricValue(item,key)]).filter(([,v])=>Number.isFinite(v)).sort((a,b)=>a[1]-b[1])[0];
    const image=item.image?.url?`<img src="${item.image.url}" alt="">`:'';
    return `<article class="compare-overview-card" style="--compare-index:${index}">${image}<div><span>${item.country||''}</span><h3>${item.name}</h3><strong class="compare-big-score">${item.score}/100</strong><div class="compare-kpis"><b>± €${Number(item.estimate||0).toLocaleString('nl-NL')}</b><b>± ${Math.round(Number(item.distanceKm||0))} km</b><b>${item.liveWeatherScore?`Weer ${Math.round(item.liveWeatherScore)}/100`:'Weer —'}</b></div><ul>${top.map(([k,v])=>`<li>✓ ${comparisonLabels[k]||k} ${Math.round(v)}</li>`).join('')}</ul>${weak?`<p class="compare-weak">Zwakste: ${comparisonLabels[weak[0]]||weak[0]} ${Math.round(weak[1])}</p>`:''}<button type="button" data-compare-choose="${item.id}">Kies deze reis</button></div></article>`;
  }).join('')}</div>${comparisonDeltaSummary(selected)}`;

  const scoreRows=[
    ['Totale match','score',false],
    ['Geschatte kosten','estimate',true],
    ['Afstand enkele reis','distance',true],
    ...rows.filter(k=>k!=='score').map(key=>[comparisonLabels[key]||key,key,false])
  ];
  const scorecard=`<div class="comparison-scroll"><table class="comparison-table visual-scorecard"><thead><tr><th>Factor</th>${selected.map(item=>`<th>${item.name}</th>`).join('')}</tr></thead><tbody>${scoreRows.map(([label,key,lower])=>{
    const winners=comparisonWinnerIndexes(selected,key,{lower});
    return `<tr><th>${label}</th>${selected.map((item,index)=>{
      const raw=key==='estimate'?Number(item.estimate):key==='distance'?Number(item.distanceKm):metricValue(item,key);
      const display=key==='estimate'?`€${Math.round(raw).toLocaleString('nl-NL')}`:key==='distance'?`${Math.round(raw)} km`:`${Math.round(raw)}/100`;
      return `<td class="${winners.has(index)?'comparison-winner':''}"><strong>${display}</strong>${!['estimate','distance'].includes(key)?`<i style="--compare-score:${Math.max(0,Math.min(100,raw))}%"></i>`:''}</td>`;
    }).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;

  const map=`<div class="compare-map-wrap"><div id="proposalCompareMap" class="proposal-compare-map"></div><p>Geografische vergelijking vanaf ${state.trip?.origin||'je vertrekpunt'}. Gestreepte lijnen tonen richting en afstand; de echte wegroute wordt berekend wanneer je een reis kiest.</p></div>`;
  host.innerHTML=`<div class="comparison-experience"><div class="compare-tabs" role="tablist"><button type="button" data-compare-view="overview" class="${comparisonView==='overview'?'active':''}">Overzicht</button><button type="button" data-compare-view="scorecard" class="${comparisonView==='scorecard'?'active':''}">Scorekaart</button><button type="button" data-compare-view="map" class="${comparisonView==='map'?'active':''}">Kaart</button></div><section data-compare-panel="overview" class="${comparisonView==='overview'?'':'hidden'}">${overview}</section><section data-compare-panel="scorecard" class="${comparisonView==='scorecard'?'':'hidden'}">${scorecard}</section><section data-compare-panel="map" class="${comparisonView==='map'?'':'hidden'}">${map}</section></div>`;
  if(comparisonView==='map')requestAnimationFrame(()=>renderComparisonMap(selected));
}


let portfolioView='tiles';
let portfolioMap=null;

function portfolioCandidates(){
  return state.ranked.filter(Boolean);
}
function portfolioMetric(item,key){
  if(key==='score')return Number(item.score);
  if(key==='weather')return Number(item.liveWeatherScore);
  if(key==='cost')return Number(item.estimate);
  if(key==='distance')return Number(item.distanceKm);
  return Number(item.dimensions?.[key]);
}
function portfolioTopMatch(item){
  const labels={budget:'Budget',driving:'Reisbelasting',season:'Seizoen / weer',transport:'Voertuigmatch',family:'Kindvriendelijk',natuur:'Natuur',bergen:'Bergen',kust:'Kust / water',swimming:'Zwemmen',walking:'Wandelen',culture:'Cultuur',food:'Eten',crowds:'Rust'};
  const rows=Object.entries(activeProposalScores(item)).filter(([,v])=>Number.isFinite(Number(v))).sort((x,y)=>Number(y[1])-Number(x[1]));
  if(!rows.length)return 'Algemene match';
  return `${labels[rows[0][0]]||rows[0][0]} ${Math.round(rows[0][1])}`;
}
function portfolioWeakMatch(item){
  const labels={budget:'Budget',driving:'Reisbelasting',season:'Seizoen / weer',transport:'Voertuigmatch',family:'Kindvriendelijk',natuur:'Natuur',bergen:'Bergen',kust:'Kust / water',swimming:'Zwemmen',walking:'Wandelen',food:'Eten',culture:'Cultuur',crowds:'Rust'};
  const rows=Object.entries(activeProposalScores(item)).filter(([,v])=>Number.isFinite(Number(v))).sort((x,y)=>Number(x[1])-Number(y[1]));
  return rows.length?`${labels[rows[0][0]]||rows[0][0]} ${Math.round(rows[0][1])}`:'—';
}
function proposalHeroImage(item){
  const url=item.image?.url;
  return url?`<img src="${url}" alt="Beeld van ${item.name}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="portfolio-fallback portfolio-fallback-photo" aria-label="Beeld voor ${item.name} wordt geladen"></div>`;
}
function proposalThumbImage(item,className='portfolio-thumb'){
  const url=item.image?.url;
  return url?`<img class="${className}" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span class="${className} portfolio-thumb-loading" aria-hidden="true"></span>`;
}
function portfolioVehicleAttribute(item){
  const mode=state.trip?.transport||'car',label={motorcycle:'Motor',car:'Auto',motorhome:'Camper',caravan:'Caravan'}[mode]||'Voertuig';
  const icon={motorcycle:'🏍️',car:'🚗',motorhome:'🚐',caravan:'🚙'}[mode]||'🚗';
  const score=Number(activeProposalScores(item)?.transport);
  const fit=!Number.isFinite(score)?'geschiktheid onbekend':score>=75?'geschikt':score>=55?'redelijk geschikt':'minder passend';
  return `${icon} ${label} · ${fit}`;
}
function renderPortfolioNavigator(){
  const panel=$('destinationCards')?.closest('.panel');
  if(!panel)return;
  let shell=document.getElementById('portfolioNavigator');
  if(!shell){
    shell=document.createElement('section');
    shell.id='portfolioNavigator';
    shell.className='portfolio-navigator';
    $('destinationCards').insertAdjacentElement('beforebegin',shell);
  }
  const items=portfolioCandidates();
  if(!items.length){shell.innerHTML='';shell.classList.add('hidden');return}
  shell.classList.remove('hidden');
  const reviewed=state.dismissedIds.length;
  shell.innerHTML=`<div class="portfolio-view-head"><div><strong>Vergelijk je opties</strong><small>${items.length} voorstellen nu · ${reviewed}/100 beoordeeld</small></div><div class="portfolio-view-tabs" role="tablist"><button type="button" data-portfolio-view="tiles" class="${portfolioView==='tiles'?'active':''}">Tegels</button><button type="button" data-portfolio-view="table" class="${portfolioView==='table'?'active':''}">Tabel</button><button type="button" data-portfolio-view="map" class="${portfolioView==='map'?'active':''}">Kaart</button></div></div>
  <div id="portfolioViewBody"></div>`;

  const body=document.getElementById('portfolioViewBody');
  const cards=$('destinationCards');

  if(portfolioView==='tiles'){
    cards.classList.add('portfolio-full-hidden');
    body.innerHTML=`<div class="portfolio-quick-grid">${items.map((item,index)=>`<article class="portfolio-quick-card">
      ${proposalHeroImage(item)}
      <div class="portfolio-quick-body">
        <div class="portfolio-quick-rank"><span>#${index+1} ${item.country||''}</span><strong>${item.score}/100</strong></div>
        <h3>${item.name}</h3>
        <div class="portfolio-quick-kpis">
          <span><b>${Number.isFinite(portfolioMetric(item,'weather'))?Math.round(portfolioMetric(item,'weather'))+'/100':'—'}</b><small>Weer</small></span>
          <span><b>€${Math.round(Number(item.estimate||0)).toLocaleString('nl-NL')}</b><small>Kosten</small></span>
          <span><b>${Math.round(Number(item.distanceKm||0))} km</b><small>Afstand</small></span>
        </div>
        <div class="portfolio-quick-match"><span>✓ ${portfolioTopMatch(item)}</span><span class="weak">↓ ${portfolioWeakMatch(item)}</span></div>
        <div class="portfolio-vehicle-attribute">${portfolioVehicleAttribute(item)}</div>
        <div class="portfolio-quick-actions">
          <button type="button" data-portfolio-select="${item.id}">Kies</button>
          <button type="button" class="secondary" data-portfolio-details="${item.id}">Details</button>
          <button type="button" class="ghost" data-portfolio-dismiss="${item.id}">Niet voor mij</button>
        </div>
      </div></article>`).join('')}</div>`;
  }else if(portfolioView==='table'){
    cards.classList.add('portfolio-full-hidden');
    const bestFor=key=>{
      const vals=items.map(i=>portfolioMetric(i,key)).filter(Number.isFinite);
      return vals.length?Math.max(...vals):null;
    };
    const bestScore=bestFor('score'),bestWeather=bestFor('weather');
    const minCost=Math.min(...items.map(i=>Number(i.estimate)).filter(Number.isFinite));
    const minDistance=Math.min(...items.map(i=>Number(i.distanceKm)).filter(Number.isFinite));
    body.innerHTML=`<div class="portfolio-table-wrap"><table class="portfolio-table"><thead><tr><th>Reis</th><th>Match</th><th>Weer</th><th>Kosten</th><th>Afstand</th><th>Sterkste</th><th>Voertuig</th><th>Keuze</th><th></th></tr></thead><tbody>${items.map(item=>{
      const weather=portfolioMetric(item,'weather'),cost=Number(item.estimate),distance=Number(item.distanceKm);
      return `<tr>
        <th><div class="portfolio-table-trip">${proposalThumbImage(item,'portfolio-table-thumb')}<span><strong>${item.name}</strong><small>${item.country||''}</small></span></div></th>
        <td class="${Number(item.score)===bestScore?'winner':''}">${item.score}/100</td>
        <td class="${Number.isFinite(weather)&&weather===bestWeather?'winner':''}">${Number.isFinite(weather)?Math.round(weather)+'/100':'—'}</td>
        <td class="${cost===minCost?'winner':''}">€${Math.round(cost).toLocaleString('nl-NL')}</td>
        <td class="${distance===minDistance?'winner':''}">${Math.round(distance)} km</td>
        <td>${portfolioTopMatch(item)}</td>
        <td class="portfolio-vehicle-cell">${portfolioVehicleAttribute(item)}</td>
        <td><button type="button" class="portfolio-table-choose" data-portfolio-select="${item.id}">Kies</button></td>
        <td><button type="button" class="secondary" data-portfolio-details="${item.id}">Bekijk</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }else{
    cards.classList.add('portfolio-full-hidden');
    body.innerHTML=`<div id="portfolioMap" class="portfolio-map"></div><div class="portfolio-map-list">${items.map((item,index)=>`<div class="portfolio-map-row"><button type="button" class="portfolio-map-focus" data-portfolio-map-item="${item.id}">${proposalThumbImage(item,'portfolio-map-thumb')}<span>${index+1}</span><strong>${item.name}</strong><small>${item.score}/100 · ${Math.round(Number(item.distanceKm||0))} km · ${portfolioVehicleAttribute(item)}</small></button><button type="button" class="portfolio-map-choose" data-portfolio-select="${item.id}">Kies</button></div>`).join('')}</div>`;
    requestAnimationFrame(()=>renderPortfolioMap(items));
  }
}
function renderPortfolioMap(items){
  const host=document.getElementById('portfolioMap');if(!host)return;
  if(portfolioMap){portfolioMap.remove();portfolioMap=null}
  const L=globalThis.L;
  const origin=state.trip?.originPoint;
  const points=items.map(item=>({item,point:item.bases?.[0]})).filter(x=>Number.isFinite(x.point?.lat)&&Number.isFinite(x.point?.lon));
  if(!L||!points.length){host.innerHTML='<div class="compare-map-empty">Geen kaartcoördinaten beschikbaar.</div>';return}
  portfolioMap=L.map(host,{zoomControl:true,scrollWheelZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap-bijdragers'}).addTo(portfolioMap);
  const bounds=[];
  if(Number.isFinite(origin?.lat)&&Number.isFinite(origin?.lon)){
    L.circleMarker([origin.lat,origin.lon],{radius:8,weight:3,fillOpacity:1}).addTo(portfolioMap).bindTooltip(state.trip.origin||'Vertrek');
    bounds.push([origin.lat,origin.lon]);
  }
  points.forEach(({item,point},index)=>{
    const marker=L.marker([point.lat,point.lon],{title:item.name}).addTo(portfolioMap);
    marker.bindPopup(`<div class="portfolio-map-popup">${proposalThumbImage(item,'portfolio-popup-thumb')}<strong>${index+1}. ${item.name}</strong><br>${item.score}/100 · €${Math.round(Number(item.estimate||0)).toLocaleString('nl-NL')} · ${Math.round(Number(item.distanceKm||0))} km<br><small>${portfolioVehicleAttribute(item)}</small><button type="button" data-portfolio-select="${item.id}">Kies deze reis</button></div>`);
    marker.on('click',()=>document.querySelector(`[data-portfolio-map-item="${CSS.escape(item.id)}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}));
    bounds.push([point.lat,point.lon]);
  });
  if(bounds.length)portfolioMap.fitBounds(bounds,{padding:[28,28],maxZoom:7});
  setTimeout(()=>portfolioMap?.invalidateSize(),80);
}
document.addEventListener('click',event=>{
  const viewButton=event.target.closest('[data-portfolio-view]');
  if(viewButton){
    portfolioView=viewButton.dataset.portfolioView||'tiles';
    renderPortfolioNavigator();
    return;
  }
  const choose=event.target.closest('[data-portfolio-select]');
  if(choose){
    const item=state.ranked.find(row=>row.id===choose.dataset.portfolioSelect);
    if(item)chooseProposal(item);
    return;
  }
  const details=event.target.closest('[data-portfolio-details]');
  if(details){showProposalDetails(details.dataset.portfolioDetails);return}
  const dismiss=event.target.closest('[data-portfolio-dismiss]');
  if(dismiss){
    state.dismissedIds=[...new Set([...state.dismissedIds,dismiss.dataset.portfolioDismiss])];
    void ensureReviewQueue();
    return;
  }
  const focus=event.target.closest('[data-portfolio-map-item]');
  if(focus&&portfolioMap){
    const item=state.ranked.find(row=>row.id===focus.dataset.portfolioMapItem);
    const point=item?.bases?.[0];
    if(Number.isFinite(point?.lat)&&Number.isFinite(point?.lon))portfolioMap.setView([point.lat,point.lon],Math.max(portfolioMap.getZoom(),7),{animate:true});
  }
});

function showProposalDetails(id){
  const cards=$('destinationCards');
  cards.classList.remove('portfolio-full-hidden');
  const target=cards.querySelector(`[data-select="${CSS.escape(id)}"]`)?.closest('.destination-card');
  target?.scrollIntoView({behavior:'smooth',block:'start'});
  target?.classList.add('proposal-focus-flash');
  setTimeout(()=>target?.classList.remove('proposal-focus-flash'),1400);
}

function roadtripDiscoveryRadiusKm(trip){const leg=tourLegLimitKm(trip),days=Math.max(3,Number(trip.days||3));return Math.round(Math.min(650,Math.max(160,leg*Math.min(1.65,.85+days*.12))))}
function roadtripDiscoveredProfile(trip,element,origin){
 const tags=element?.tags||{},point=Number.isFinite(element?.lat)&&Number.isFinite(element?.lon)?{lat:element.lat,lon:element.lon}:element?.center,name=tags['name:nl']||tags.name;
 if(!name||!Number.isFinite(point?.lat)||!Number.isFinite(point?.lon))return null;const originKm=geoDistanceKm(origin,point);if(originKm<50)return null;
 const importance=tags.place==='city'?95:tags.place==='town'?82:tags.place==='village'?62:55,id=`roadtrip-osm-${element.type||'place'}-${element.id||Math.round(point.lat*1e5)+'-'+Math.round(point.lon*1e5)}`,base={name,lat:Number(point.lat),lon:Number(point.lon)};
 return{id,name:`${name} & omgeving`,country:tags['addr:country']||tags['is_in:country']||'Live regio',distanceKm:Math.round(originKm*1.18),driveHours:Number((originKm*1.18/planningSpeedKmh(trip)).toFixed(1)),nightMid:125,activityDaily:45,toll:0,tags:['natuur','cultuur','eten'],season:[1,2,3,4,5,6,7,8,9,10,11,12],family:7,motorcycle:7,camper:7,weather:7,crowds:7,summary:`Live gevonden overnachtingsregio rond ${name}.`,pros:['Echte benoemde plaats','Geschikt als roadtrip-overnachtingsregio'],cons:['Verblijf en POI’s worden na selectie live ingevuld'],routeStops:[],bases:[base],activities:Array.from({length:Math.max(2,Math.round(importance/28))},(_,i)=>({type:i%2?'cultuur':'natuur',title:`Verken ${name} en omgeving.`,tags:i%2?['cultuur']:['natuur']})),poiRichness:Math.round(importance*.40),dynamic:true,roadtripCandidate:true,discoverySource:'OpenStreetMap roadtrip pool',osm:{type:element.type,id:element.id}};
}
function roadtripSearchSeed(origin,distanceKm,bearingDeg){
 const R=6371,a=distanceKm/R,b=bearingDeg*Math.PI/180,lat1=origin.lat*Math.PI/180,lon1=origin.lon*Math.PI/180;
 const lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b));
 const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));
 return{lat:lat2*180/Math.PI,lon:((lon2*180/Math.PI+540)%360)-180};
}
function buildRoadtripPlaceQueries(trip,origin,anchor=null){
 const maxLeg=tourLegLimitKm(trip),days=Math.max(3,Number(trip.days||3));
 const outer=Math.min(620,Math.max(180,maxLeg*Math.min(1.55,.92+days*.10)));
 const originRings=[.28,.48,.70,.90].map(f=>Math.max(60,outer*f));
 const bearings=[0,45,90,135,180,225,270,315];
 const groups=[];
 if(anchor&&Number.isFinite(anchor.lat)&&Number.isFinite(anchor.lon))groups.push({point:anchor,rings:[35,70,115,165],radius:24000,kind:'anchor'});
 groups.push({point:origin,rings:originRings,radius:26000,kind:'origin'});
 const batches=[];
 // Geographic-spread first: each query contains one seed from every distance
 // ring on the same bearing. This prevents a dense inner ring from satisfying
 // a raw candidate-count threshold before the solver has usable roadtrip legs.
 for(const group of groups){
   for(let b=0;b<bearings.length;b++){
     const clauses=group.rings.map((distance,r)=>{
       const p=roadtripSearchSeed(group.point,distance,bearings[b]+(r%2?22.5:0));
       return `nwr(around:${group.radius},${p.lat.toFixed(4)},${p.lon.toFixed(4)})["place"~"city|town|village"]["name"];`;
     });
     batches.push({kind:group.kind,query:`[out:json][timeout:10][maxsize:12582912];(${clauses.join('')});out center 90;`});
   }
 }
 return batches;
}
function roadtripPoolSupportsTrip(trip,origin,anchor){
 if(!anchor||!Number.isFinite(anchor.lat)||!Number.isFinite(anchor.lon))return false;
 const candidates=roadtripLandCandidates(origin,trip),destination={id:'selected-roadtrip-anchor',bases:[anchor]};
 if(trip?.tripStructure==='base'){
   const base=selectRoadtripBase({origin:{...origin,name:trip.origin},trip,destination,candidates});
   return Boolean(base)&&selectBaseDayTrips({base,trip,candidates,count:Math.max(0,Number(trip.days||0)-2)}).length===Math.max(0,Number(trip.days||0)-2);
 }
 const path=selectRoadtripOvernights({origin:{...origin,name:trip.origin},trip,destination,candidates});
 return path.length===Math.max(0,Number(trip.days||0)-1);
}
function ingestRoadtripElements(trip,elements,origin){
 const knownIds=new Set(state.catalog.map(x=>x.id));
 const existingPoints=state.catalog.flatMap(x=>x.bases||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
 const candidates=(elements||[]).map(el=>roadtripDiscoveredProfile(trip,el,origin)).filter(Boolean)
   .filter(item=>!knownIds.has(item.id))
   .filter(item=>!existingPoints.some(p=>geoDistanceKm(p,item.bases[0])<12))
   .sort((a,b)=>a.distanceKm-b.distanceKm);
 const selected=[];
 for(const item of candidates){
   if(selected.some(x=>geoDistanceKm(x.bases[0],item.bases[0])<22))continue;
   selected.push(item);if(selected.length>=40)break;
 }
 if(selected.length){state.catalog.push(...selected);refreshPortfolio()}
 return selected.length;
}
async function discoverRoadtripOvernightPool(trip,{fetchImpl=fetch,timeoutMs=8500,anchor=null}={}){
 const origin=trip.originPoint||state.plan?.routeMetrics?.origin||state.plan?.origin;
 if(!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lon)){
   globalThis.__REISSLIM_DISCOVERY={status:'no-origin',added:0,batches:0,providers:[],feasible:false};return 0;
 }
 if(anchor&&roadtripPoolSupportsTrip(trip,origin,anchor)){
   globalThis.__REISSLIM_DISCOVERY={status:'already-feasible',added:0,batches:0,providers:[],feasible:true};return 0;
 }
 if(state.globalDiscoveryBusy){
   // A user-selected itinerary has priority over background portfolio discovery.
   // Build 1805 could make the selected Sauerland request wait behind a full
   // origin-wide search for longer than the 26 s wait window, then return zero.
   if(anchor)state.anchorDiscoveryPriority=true;
   const until=Date.now()+(anchor?15000:26000);
   while(state.globalDiscoveryBusy&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));
   if(state.globalDiscoveryBusy){
     if(anchor)globalThis.__REISSLIM_DISCOVERY={status:'anchor-wait-timeout',added:0,batches:0,providers:[],feasible:false};
     return 0;
   }
   if(anchor&&roadtripPoolSupportsTrip(trip,origin,anchor)){
     state.anchorDiscoveryPriority=false;
     globalThis.__REISSLIM_DISCOVERY={status:'became-feasible',added:0,batches:0,providers:[],feasible:true};return 0;
   }
 }
 if(anchor)state.anchorDiscoveryPriority=false;
 state.globalDiscoveryBusy=true;updateManualLiveDiscoveryButton();
 const batches=buildRoadtripPlaceQueries(trip,origin,anchor);
 const endpoints=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
 const seenOsm=new Set();
 const diag={status:'running',added:0,batches:0,failedBatches:0,providers:[],origin:{lat:origin.lat,lon:origin.lon},anchor:anchor?{lat:anchor.lat,lon:anchor.lon}:null,feasible:false};
 globalThis.__REISSLIM_DISCOVERY=diag;
 try{
   for(let q=0;q<batches.length;q++){
     if(!anchor&&state.anchorDiscoveryPriority){diag.status='yielded-to-selected-trip';break}
     let batch=null,usedProvider=null;
     for(let e=0;e<endpoints.length;e++){
       const endpoint=endpoints[(q+e)%endpoints.length],controller=new AbortController(),remaining=Math.max(1200,Math.min(timeoutMs,anchor?6500:5000)),timer=setTimeout(()=>controller.abort(),remaining);
       try{
         const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Accept':'application/json'},body:new URLSearchParams({data:batches[q].query}),signal:controller.signal});
         if(!response.ok)continue;
         const candidate=await response.json();
         if(Array.isArray(candidate?.elements)){batch=candidate.elements;usedProvider=endpoint;break}
       }catch(error){console.warn('Roadtrip discovery batch/provider failed',q+1,endpoint,error)}
       finally{clearTimeout(timer)}
     }
     diag.batches++;
     if(!batch){diag.failedBatches++;continue}
     diag.providers.push(usedProvider);
     const unique=[];
     for(const el of batch){const key=`${el.type||'x'}:${el.id||`${el.lat}:${el.lon}`}`;if(seenOsm.has(key))continue;seenOsm.add(key);unique.push(el)}
     diag.added+=ingestRoadtripElements(trip,unique,origin);
     if(!anchor&&state.anchorDiscoveryPriority){diag.status='yielded-to-selected-trip';break}
     if(anchor){
       diag.feasible=roadtripPoolSupportsTrip(trip,origin,anchor);
       if(diag.feasible){diag.status='feasible';break}
     }else{
       // Before a destination is selected, raw place count is not evidence of
       // usable roadtrip supply. Complete the geographic spread search.
       diag.status='origin-spread-search';
     }
   }
   if(anchor)diag.status=diag.feasible?'feasible':diag.added?'partial':'empty';
   else if(diag.status!=='yielded-to-selected-trip')diag.status=diag.added?'origin-complete':'empty';
   return diag.added;
 }finally{state.globalDiscoveryBusy=false;updateManualLiveDiscoveryButton()}
}
function mergeRegionalOvernightProfiles(profiles){
 const known=new Set(state.catalog.map(x=>x.id)),points=state.catalog.flatMap(x=>x.bases||[]);
 let added=0;
 for(const item of profiles||[]){
   const p=item?.bases?.[0];if(!p||known.has(item.id))continue;
   if(points.some(q=>Number.isFinite(q?.lat)&&Number.isFinite(q?.lon)&&geoDistanceKm(q,p)<12))continue;
   state.catalog.push(item);known.add(item.id);points.push(p);added++;
 }
 if(added)refreshPortfolio();return added;
}
async function ensureTourPlanSupply(destination,basePlan){
  let plan=ensureMultiDayRoadtripProgression(state.trip,destination,basePlan);
  if(Number(state.trip?.days||0)<2||roadtripIntentReport(state.trip,plan).valid||!state.trip?.liveData)return plan;
  const anchor=destination?.bases?.[0]||null;
  if(!anchor||!Number.isFinite(anchor.lat)||!Number.isFinite(anchor.lon))return plan;

  // Source A: detailed Overpass place discovery.
  await discoverRoadtripOvernightPool(state.trip,{anchor});
  plan=ensureMultiDayRoadtripProgression(state.trip,destination,basePlan);
  if(roadtripIntentReport(state.trip,plan).valid)return plan;

  // Source B: independent Nominatim reverse-geocoded regional seeds. This path
  // deliberately does not use globalDiscoveryBusy, so provider/lock failures in
  // source A cannot leave the selected trip without an overnight candidate pool.
  const origin=state.trip.originPoint||plan?.routeMetrics?.origin||plan?.origin;
  const regional=await discoverRegionalOvernightCandidates(state.trip,origin,anchor,{timeoutMs:3200,maxRequests:20});
  mergeRegionalOvernightProfiles(regional);
  plan=ensureMultiDayRoadtripProgression(state.trip,destination,basePlan);
  return plan;
}
async function applyVariant(id){
  const variant=state.variants.find(item=>item.id===id);if(!variant)return;
  if(state.trip?.liveData)showPlanLoading('Reisplan opbouwen…','We zoeken echte overnachtingsregio’s voor iedere etappe.');
  const destination={...state.destination,...variant.destination};
  let plan=await ensureTourPlanSupply(destination,variant.plan);
  const roadtripCheck=roadtripIntentReport(state.trip,plan);
  if(!roadtripCheck.valid){
    hidePlanLoading(false);
    showError(`Nog geen geldige ${state.trip.days}-daagse roadtrip gevonden (${roadtripCheck.reason}). ReisSlim toont geen kunstmatige stadsroute; zoek opnieuw voor extra echte overnachtingsregio’s.`);
    setStatus('Meer echte overnachtingsregio’s nodig');showView('plannerView');return;
  }
  const derived=derivePlanState(destination,plan);
  plan=derived.plan;
  Object.assign(state,{destination,selectedVariantId:variant.id,plan,budget:derived.budget,quality:derived.quality,constraintStatus:derived.constraintStatus,validation:derived.validation,optimized:false});
  $('variantSection').classList.add('hidden');$('planSection').classList.remove('hidden');$('mapHint').classList.add('hidden');
  renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderRoadtripMap(state.plan);persistDraft();
  if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)
}
function resetState(trip=defaults()){
  Object.assign(state,{trip,ranked:[],ranking:null,destination:null,plan:null,budget:null,validation:[],quality:null,compareIds:[],savedProposalIds:[],dismissedIds:[],variants:[],selectedVariantId:null,optimized:false,catalog:[...destinations],discoveryCursor:0,discoveryBusy:false,routingRun:state.routingRun+1,liveDiscoveryProgress:null,globalDiscoveryBusy:false,anchorDiscoveryPriority:false});
  writeTripForm(trip);
  renderVehicleControls();
  $('resultsSection')?.classList.add('hidden');
  $('planSection')?.classList.add('hidden');
  $('variantSection')?.classList.add('hidden');
  $('noPlanItinerary')?.classList.remove('hidden');
  $('mapHint')?.classList.remove('hidden');
  try{persistDraft('Nieuw concept opgeslagen')}catch(error){console.warn('Nieuw concept kon niet direct worden opgeslagen',error)}
  try{renderDashboard(state,loadTrips())}catch(error){console.warn('Dashboard kon niet direct worden ververst',error)}
}
function rebuildFromRecord(record){state.trip=normalizeTrip(record.trip);state.compareIds=record.compareIds||[];state.savedProposalIds=record.savedProposalIds||[];state.dismissedIds=record.dismissedIds||[];writeTripForm(state.trip);renderVehicleControls();state.catalog=record.destinationProfile?.dynamic?[...destinations,record.destinationProfile]:[...destinations];refreshPortfolio();state.destination=state.ranking.candidates.find(i=>i.id===record.destinationId)||record.destinationProfile||null;if(state.destination){applyDestination(state.destination,Boolean(record.optimized));$('resultsSection').classList.remove('hidden')}}

function startNewTrip(){
  // Navigation is immediate. Reset follows synchronously, so a storage/dashboard
  // side-effect can never make the button appear dead.
  try{showView('plannerView')}catch(error){console.warn('Plannerweergave kon niet direct worden geopend',error)}
  try{window.scrollTo({top:0,left:0,behavior:'auto'})}catch{}
  try{
    clearDraft();
    resetState(defaults());
    setStatus('Nieuw reisconcept gestart');
    return true;
  }catch(error){
    console.error('Nieuwe reis starten mislukt',error);
    showError('Nieuwe reis kon niet volledig worden gereset. De planner is geopend; controleer de velden.');
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
  const startPlanningButton=$('startPlanningBtn');
  if(startPlanningButton)startPlanningButton.addEventListener('click',event=>{event.preventDefault();startNewTrip()});
  const brandButton=$('brandBtn');
  if(brandButton){
    brandButton.setAttribute('role','button');brandButton.setAttribute('tabindex','0');
    const goHome=()=>{showView('dashboardView');window.scrollTo({top:0,left:0,behavior:'auto'})};
    brandButton.addEventListener('click',goHome);
    brandButton.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();goHome()}});
  }

  const manualLiveButton=$('manualLiveDiscoveryBtn');
  if(manualLiveButton)manualLiveButton.addEventListener('click',async()=>{
    if(manualLiveButton.disabled)return;
    manualLiveButton.disabled=true;
    manualLiveButton.textContent=state.discoveryBusy?'Nieuwe poging staat klaar…':'Opnieuw zoeken…';
    setStatus(state.discoveryBusy?'Nieuwe live zoekpoging staat klaar na de huidige zoekactie…':'Nieuwe live zoekpoging starten…');
    try{await discoverLiveOptions({retry:true});refreshPortfolio()}
    finally{updateManualLiveDiscoveryButton()}
  });
  renderPreferenceGrid();setupPremiumPlannerControls();renderVehicleControls();$('versionLabel').textContent=`ReisSlim v${VERSION} · Build ${BUILD}`;$('orsApiKey').value=readRoutingSettings().orsApiKey;
  const restored=loadDraft();if(restored?.trip)rebuildFromRecord(restored);else resetState();renderDashboard(state,loadTrips());
  document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>{showView(button.dataset.view);if(button.dataset.view==='mapView')invalidateMap()}));
  document.querySelectorAll('[data-go-planner]').forEach(b=>b.addEventListener('click',()=>showView('plannerView')));
  $('continueTripBtn').addEventListener('click',event=>{event.preventDefault();showView('plannerView')});
  $('transport').addEventListener('change',()=>renderVehicleControls({resetDefaults:true}));$('routeStyle').addEventListener('change',()=>renderVehicleControls());
  $('useLocationBtn').addEventListener('click',()=>{if(!navigator.geolocation)return showError('Locatiebepaling niet ondersteund.');navigator.geolocation.getCurrentPosition(pos=>{const point={lat:pos.coords.latitude,lon:pos.coords.longitude,name:'Huidige locatie',source:'Browser-geolocatie'};$('origin').value='Huidige locatie';state.trip=normalizeTrip({...readTripForm(state.trip),origin:'Huidige locatie',originPoint:point});persistDraft('Huidige locatie opgeslagen')},()=>showError('Locatie kon niet worden bepaald.'),{timeout:10000,maximumAge:600000})});
  $('tripForm').addEventListener('submit',async event=>{event.preventDefault();state.trip=readTripForm(state.trip);const errors=validateTripInput(state.trip);if(errors.length)return showError(errors.join(' '));showError();if(!state.trip.originPoint&&state.trip.liveData){setStatus('Vertrekplaats controleren…');const point=await geocodeOrigin(state.trip.origin);if(point)state.trip=normalizeTrip({...state.trip,originPoint:point})}if(state.trip.destinationQuery&&!state.trip.destinationPoint&&state.trip.liveData){const point=await geocodeOrigin(state.trip.destinationQuery);if(point)state.trip=normalizeTrip({...state.trip,destinationPoint:point})}state.dismissedIds=[];state.imageRejectedIds=[];state.catalog=[...destinations];state.discoveryCursor=0;state.preferenceProfile.privateMode=state.trip.privateMode;savePreferenceProfile(state.preferenceProfile);// Render the planner result immediately. Global roadtrip enrichment runs after
// the first usable portfolio is visible; it must never block the submit button.
refreshPortfolio();state.destination=null;state.plan=null;state.variants=[];$('resultsSection').classList.remove('hidden');$('planSection').classList.add('hidden');persistDraft();$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
  if(state.trip.liveData){
    // Do not await external discovery from the form submit path. Build 1746
    // could wait for up to 8 batches × 2 providers × 11 s before anything
    // appeared, making the button look dead on mobile.
    void (async()=>{
      try{
        const added=await discoverRoadtripOvernightPool(state.trip);
        refreshPortfolio();
        // Only invoke the legacy discovery provider when the dedicated global
        // roadtrip pipeline did not produce a useful pool. Never run both together.
        if(added<6){await discoverLiveOptions({append:true,quiet:true});refreshPortfolio()}
      }catch(error){console.warn('Background roadtrip enrichment failed',error)}
      finally{scheduleReviewPrefetch()}
    })();
  }});


  let saveTimer;const autosave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{state.trip=readTripForm(state.trip);persistDraft()},300)};$('tripForm').addEventListener('input',autosave);$('tripForm').addEventListener('change',autosave);
  $('tripForm').addEventListener('reisslim:preferences-changed',()=>{
    const scrollY=window.scrollY;
    state.trip=readTripForm(state.trip);
    state.preferenceProfile.privateMode=state.trip.privateMode;
    refreshPortfolio();
    persistDraft('Voorkeuren bijgewerkt');
    requestAnimationFrame(()=>window.scrollTo({top:scrollY,left:0,behavior:'auto'}));
  });
  async function refillAfterDismiss(){
    refreshPortfolio();
    persistDraft(`${state.dismissedIds.length}/100 reisopties beoordeeld`);
    await ensureReviewQueue({target:REVIEW_VISIBLE_TARGET,maxRounds:REVIEW_SEARCH_ROUNDS});
  }
  $('destinationCards').addEventListener('click',event=>{const select=event.target.closest('[data-select]');if(select){const d=state.ranked.find(i=>i.id===select.dataset.select);if(d)chooseProposal(d)}const dismiss=event.target.closest('[data-dismiss-proposal]');if(dismiss){state.dismissedIds=[...new Set([...state.dismissedIds,dismiss.dataset.dismissProposal])];void refillAfterDismiss()}const save=event.target.closest('[data-save-proposal]');if(save){const id=save.dataset.saveProposal;state.savedProposalIds=state.savedProposalIds.includes(id)?state.savedProposalIds.filter(i=>i!==id):[...state.savedProposalIds,id];renderDestinations(imageReadyState())}});
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
    renderDestinations(imageReadyState());
    renderComparison(state);renderEnhancedComparison();
    persistDraft(state.compareIds.length>=2?`${state.compareIds.length} reizen geselecteerd voor vergelijking`:'Vergelijking bijgewerkt');
    const section=$('compareSection');
    if(state.compareIds.length>=2)section?.classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('reisslim:compare-updated',{detail:{count:state.compareIds.length}}));
  });
  $('clearCompareBtn').addEventListener('click',()=>{state.compareIds=[];renderDestinations(imageReadyState());renderComparison(state);renderEnhancedComparison();persistDraft('Vergelijking gewist');window.dispatchEvent(new CustomEvent('reisslim:compare-updated',{detail:{count:0}}))});
  $('compareSection').addEventListener('click',event=>{
    const tab=event.target.closest('[data-compare-view]');
    if(tab){
      comparisonView=tab.dataset.compareView;
      renderEnhancedComparison();
      return;
    }
    const choose=event.target.closest('[data-compare-choose]');
    if(choose){
      const d=comparisonSelected().find(item=>item.id===choose.dataset.compareChoose);
      if(d)chooseProposal(d);
    }
  });
  document.addEventListener('click',event=>{
    const view=event.target.closest('[data-portfolio-view]');
    if(view){portfolioView=view.dataset.portfolioView;renderPortfolioNavigator();return}
    const details=event.target.closest('[data-portfolio-details]');
    if(details){showProposalDetails(details.dataset.portfolioDetails);return}
    const select=event.target.closest('[data-portfolio-select]');
    if(select){const d=state.ranked.find(i=>i.id===select.dataset.portfolioSelect);if(d)chooseProposal(d);return}
    const dismiss=event.target.closest('[data-portfolio-dismiss]');
    if(dismiss){
      state.dismissedIds=[...new Set([...state.dismissedIds,dismiss.dataset.portfolioDismiss])];
      void refillAfterDismiss();return;
    }
    const mapItem=event.target.closest('[data-portfolio-map-item]');
    if(mapItem){
      const d=state.ranked.find(i=>i.id===mapItem.dataset.portfolioMapItem);
      const point=d?.bases?.[0];
      if(portfolioMap&&Number.isFinite(point?.lat)&&Number.isFinite(point?.lon))portfolioMap.setView([point.lat,point.lon],8,{animate:true});
    }
  });
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
  $('applyOptimizationBtn').addEventListener('click',()=>{if(!state.plan||!state.optimizationProposal)return;const ids=[...document.querySelectorAll('[data-optimization-action]:checked')].map(x=>x.dataset.optimizationAction);if(!ids.length)return;const before=Math.round(state.quality?.overall||state.optimizationProposal.before?.quality?.overall||0),selected=(state.optimizationProposal.actions||[]).filter(x=>ids.includes(x.id));state.undoSnapshot=clone({plan:state.plan,budget:state.budget,quality:state.quality,validation:state.validation,constraintStatus:state.constraintStatus});Object.assign(state,applyOptimizationProposal(state.trip,state.destination,state.plan,ids));const after=Math.round(state.quality?.overall||0);state.optimizationSummary={before,after,changes:selected.map(x=>`${x.title}: ${x.description}`)};state.optimizationProposal=null;renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderRoadtripMap(state.plan);setStatus(`Optimalisatie toegepast: ${before}/100 → ${after}/100 (${after-before>=0?'+':''}${after-before})`);persistDraft(`Optimalisatie toegepast: ${before} → ${after}`);});
  $('rejectOptimizationBtn').addEventListener('click',()=>{state.optimizationProposal=null;renderOptimizationPreview(state)});
  $('undoOptimizeBtn').addEventListener('click',()=>{if(!state.undoSnapshot)return;Object.assign(state,state.undoSnapshot);state.undoSnapshot=null;renderPlan(state);renderRoadtripMap(state.plan)});
  document.querySelectorAll('[data-inspire]').forEach(button=>button.addEventListener('click',()=>{$('destinationQuery').value=button.dataset.inspire;showView('plannerView')}));
}
document.addEventListener('DOMContentLoaded',initialize);
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(`./service-worker.js?build=${BUILD}`,{updateViaCache:'none'}).then(reg=>reg.update()).catch(console.warn));
