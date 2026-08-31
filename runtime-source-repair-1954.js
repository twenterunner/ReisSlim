(function(root){
  'use strict';

  function canonicalCalculateTemplate(destination,optimize=false){
    let plan=ensureCanonicalRecommendationCoverage(state.trip,destination,buildCanonicalTripPlan(state.trip,destination));
    if(plan?.generationFailure)return{plan,budget:null,quality:null,constraintStatus:{exact:false,feasible:false,violations:[plan.generationFailure]},validation:[]};
    if(optimize){const result=optimisePlan(state.trip,destination,plan,{mode:'maximum'});plan=ensureCanonicalRecommendationCoverage(state.trip,destination,result?.plan||plan)}
    return derivePlanState(destination,plan)
  }
  function canonicalProgressionTemplate(trip,destination,plan){return ensureCanonicalRecommendationCoverage(trip,destination,isCanonicalPlan(plan)?plan:buildCanonicalTripPlan(trip,destination))}
  async function canonicalSupplyTemplate(destination,basePlan){return ensureCanonicalRecommendationCoverage(state.trip,destination,isCanonicalPlan(basePlan)?basePlan:buildCanonicalTripPlan(state.trip,destination))}
  function canonicalDeriveTemplate(destination,plan){
    plan=ensureCanonicalRecommendationCoverage(state.trip,destination,isCanonicalPlan(plan)?plan:buildCanonicalTripPlan(state.trip,destination));
    const diagnostic=canonicalPlanDiagnostic(state.trip,plan,destination);
    const budget=buildBudget(state.trip,destination,plan);
    const constraintStatus=evaluatePlanConstraints(state.trip,plan,budget,{allowStretch:destination.category==='stretch'});
    plan.roadtripPolicy={valid:diagnostic.valid,code:diagnostic.code,violations:diagnostic.valid?[]:[diagnostic.code],pendingResolution:Boolean(diagnostic.pendingResolution)};
    plan.constraintStatus=constraintStatus;plan.feasible=diagnostic.valid&&constraintStatus.exact;
    plan.warnings=[...new Set([...(plan.warnings||[]),...(!diagnostic.valid?[diagnostic.reason]:[]),...(constraintStatus.violations||[]).map(item=>item.detail)])];
    return{plan,budget,quality:calculateTripQuality(state.trip,destination,plan,budget),validation:validatePlan(state.trip,destination,plan,budget),constraintStatus}
  }
  function canonicalReportTemplate(trip,plan){
    if(isCanonicalPlan(plan)){const d=canonicalPlanDiagnostic(trip,plan,state.destination);return{valid:d.valid,moved:0,intentionalStays:0,illegalShortMove:0,reason:d.reason,code:d.code,suggestion:d.suggestion||'',pendingResolution:Boolean(d.pendingResolution)}}
    return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'Een oud niet-canoniek plan is actief geraakt.',code:'non-canonical-plan',suggestion:'Bouw de reis opnieuw op met de huidige canonieke engine.'}
  }
  function canonicalApplyDestinationTemplate(destination,optimize=false){
    if(state.trip?.liveData)showPlanLoading('Reisplan opbouwen…','De canonieke route-engine bouwt iedere kalenderdag, POI-dekking en alle overnachtingsnachten.');
    const result=calculatePlan(destination,optimize),failure=result?.plan?.generationFailure;
    if(failure){hidePlanLoading(false);showError(`Reisplan kan niet worden gegenereerd. Exacte reden: ${failure.reason} ${failure.suggestion?`Wat nodig is: ${failure.suggestion}`:''} [${failure.code}]`);setStatus(`Niet gegenereerd · ${failure.code}`);showView('plannerView');return}
    Object.assign(state,{destination,...result,optimized:optimize,selectedVariantId:'balanced',optimizationProposal:null});state.variants=[];
    $('variantSection')?.classList.add('hidden');$('planSection')?.classList.remove('hidden');$('mapHint')?.classList.add('hidden');$('noPlanItinerary')?.classList.add('hidden');
    try{renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderRoadtripMap(state.plan)}catch(error){console.error('ReisSlim UI-contractfout bij reisrendering',error);hidePlanLoading(false);showError(`Reisplan is opgebouwd maar kon niet volledig worden weergegeven. Exacte interne reden: ${error?.message||error} [ui-render-contract]`);setStatus('Plan opgebouwd · weergavefout');try{renderDashboard(state,loadTrips())}catch{};return}
    persistDraft();renderDashboard(state,loadTrips());if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan);else hidePlanLoading(true)
  }
  function canonicalChooseProposalTemplate(destination){
    learn('select',destination);state.destination=destination;
    if(state.trip?.liveData&&!destination.image)void enrichDestinationImages([destination],{maximum:1}).then(()=>{if(state.destination?.id===destination.id){syncPlanVisualHero();persistDraft('Routebeeld geladen')}});
    state.variants=[];state.selectedVariantId='balanced';state.plan=null;
    $('variantSection')?.classList.add('hidden');$('planSection')?.classList.add('hidden');$('noPlanItinerary')?.classList.add('hidden');
    persistDraft('Reisconcept gekozen · canonieke route-engine');showView('itineraryView');applyDestination(destination,false)
  }
  async function canonicalApplyVariantTemplate(id){const destination=state.destination||state.ranked?.find(item=>item.id===id);if(destination)applyDestination(destination,false)}

  async function canonicalEnhanceLiveDataTemplate(destinationId,originalPlan){
    const run=++state.routingRun,active=()=>run===state.routingRun&&state.destination?.id===destinationId;
    let structural=ensureCanonicalRecommendationCoverage(state.trip,state.destination,isCanonicalPlan(originalPlan)?originalPlan:buildCanonicalTripPlan(state.trip,state.destination));
    let plan=structural;const rejectedStructural=[];
    const adoptStructural=candidate=>{
      if(!candidate)return false;const check=canonicalPlanDiagnostic(state.trip,candidate,state.destination);
      if(check.valid){structural=ensureCanonicalRecommendationCoverage(state.trip,state.destination,candidate);plan=structural;return true}
      rejectedStructural.push(check);plan=preserveEnrichmentOnCanonicalBase(structural,candidate,state.trip,state.destination);return false
    };
    const preserve= candidate=>{plan=preserveEnrichmentOnCanonicalBase(structural,candidate||plan,state.trip,state.destination);return plan};
    const publish=(message='')=>{
      if(!active())return false;plan=ensureCanonicalRecommendationCoverage(state.trip,state.destination,plan);const derived=derivePlanState(state.destination,plan);Object.assign(state,derived);
      try{renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview();renderRoadtripMap(state.plan);if(message)persistDraft(message)}catch(error){console.error('Live verrijking renderde deels',error)}return true
    };
    showPlanLoading('Route en plaatsen opbouwen…','Route, POI’s en overnachtingen worden onafhankelijk opgebouwd. Een live providerfout mag geen dag of nacht verwijderen.');
    $('mapDataStatus').textContent='Geplande POI’s + verblijf staan klaar · live verfijning starten…';planLiveBanner('Iedere dag heeft al een gepland kaartpunt en iedere overnachtingsnacht een verblijfmarker. Live bronnen vervangen die alleen wanneer ze iets beters vinden.');publish();
    try{
      updatePlanLoading(8,'Routepunten controleren…','Transit- en lokale punten aan echte plaatsnamen koppelen.','Geografie');
      try{const resolved=isCanonicalPlan(structural)?await resolveCanonicalPlanPlaces(structural,{trip:state.trip,destination:state.destination,timeoutMs:2800,concurrency:6,onProgress:event=>{if(!active())return;const total=Math.max(1,Number(event?.total||1)),done=Number(event?.completed||0);updatePlanLoading(8+Math.round(done/total*10),'Routepunten controleren…',`${done}/${total} routepunten gecontroleerd.`,'Geografie')}}):await prepareGeneratedRouteStops(structural,{timeoutMs:3000});adoptStructural(resolved)}catch(error){console.warn('Plaatsnaamresolutie deels niet beschikbaar',error)}
      if(!active())return;publish();

      updatePlanLoading(20,'Wegroute berekenen…','Echte weggeometrie wordt opgehaald zonder de reisstructuur te mogen wijzigen.','Route');
      if(routingConfigured(state.trip))try{const routed=await enrichPlanWithLiveRouting(state.trip,state.destination,structural,{timeoutMs:7000,onProgress:event=>{if(!active())return;const total=Math.max(1,Number(event?.total||1)),done=Number(event?.completed||0);updatePlanLoading(20+Math.round(done/total*20),'Wegroute berekenen…',`${done}/${total} etappes gecontroleerd.`,'Route')}});adoptStructural(reconcileDayEndpointsToRoad(routed))}catch(error){console.warn('Live routering niet volledig beschikbaar',error)}
      if(!active())return;publish();

      updatePlanLoading(43,'POI’s zoeken…','Restaurants, rustpunten, brandstof en activiteiten worden per dag gezocht. Geplande punten blijven zichtbaar bij provideruitval.','POI');
      try{const enriched=await enrichPlanWithPlaces(state.trip,state.destination,structural,{placeTimeoutMs:6500,nominatimTimeoutMs:4500,weatherTimeoutMs:4500,onProgress:event=>{if(!active())return;const total=Math.max(1,Number(event?.total||1)),done=Number(event?.completed||event?.index||0);updatePlanLoading(43+Math.round(done/total*20),'POI’s zoeken…',placeProgressText(event),'POI')}});preserve(enriched)}catch(error){console.warn('Primaire POI-verrijking niet volledig beschikbaar',error);preserve(plan)}
      if(!active())return;
      try{const filled=await fillMissingDayPois(plan,{trip:state.trip,timeoutMs:5000,onProgress:event=>{if(!active())return;const total=Math.max(1,Number(event?.total||1)),done=Number(event?.completed||0);updatePlanLoading(63+Math.round(done/total*10),'POI-fallbacks controleren…',`${done}/${total} ontbrekende routepunten gecontroleerd.`,'POI fallback')}});preserve(filled)}catch(error){console.warn('POI-fallback niet volledig beschikbaar',error);preserve(plan)}
      publish();

      updatePlanLoading(75,'Overnachtingen zoeken…','Voor iedere nacht wordt een concreet verblijf gezocht. Een niet-gevonden verblijf blijft als geplande bedmarker zichtbaar.','Verblijf');
      try{const accommodated=await enrichOvernightAccommodations(state.trip,plan,{timeoutMs:14000,onProgress:event=>{if(!active())return;const total=Math.max(1,Number(event?.total||1)),done=Number(event?.completed||0),name=event?.name?` · ${event.name}`:'';let text=`${done}/${total} nachten afgehandeld${name}.`;if(event?.type==='accommodation-day-complete'&&!event.found)text=`Nacht ${done}/${total}: geen concreet verblijf gevonden; geplande bedmarker blijft zichtbaar.`;updatePlanLoading(75+Math.round(done/total*18),'Overnachtingen zoeken…',text,'Verblijf')}});preserve(accommodated)}catch(error){console.warn('Overnachtingsverrijking niet volledig beschikbaar',error);preserve(plan)}
      if(!active())return;publish('Live POI- en verblijfsdekking opgeslagen');

      const c=state.plan?.recommendationCoverage||{},a=state.plan?.accommodationData||{};const specific=Number(c.specific||0),planned=Number(c.planned||0),nights=Number(c.representedNights||a.representedNights||0),required=Number(c.requiredNights||a.requiredNights||0),days=Number(c.daysWithPoi||0),requiredDays=Number(c.requiredDays||0);
      const rejectNote=rejectedStructural.length?` · ${rejectedStructural.length} live routewijziging${rejectedStructural.length===1?'':'en'} afgewezen om het geldige basisplan te beschermen`:'';
      $('mapDataStatus').textContent=`POI ${days}/${requiredDays} dagen · verblijf ${nights}/${required} · ${specific} specifiek${rejectNote}`;
      planLiveBanner(`Klaar · POI-dekking ${days}/${requiredDays} dagen en verblijfdekking ${nights}/${required} nachten. ${specific} specifieke plaatsen gevonden; ${planned} geplande fallbackpunten blijven beschikbaar.${rejectNote}`,c.completeDays&&c.completeNights?'done':'error');
      updatePlanLoading(100,'Reisplan klaar',`POI ${days}/${requiredDays} · verblijf ${nights}/${required}.`,'Klaar');hidePlanLoading(Boolean(c.completeDays&&c.completeNights))
    }catch(error){
      console.error('Live verrijking onderbroken',error);if(!active())return;preserve(plan);publish('Basisplan met gegarandeerde POI- en verblijfsdekking behouden');const c=state.plan?.recommendationCoverage||{};$('mapDataStatus').textContent=`Live bronnen onderbroken · geplande dekking actief`;planLiveBanner(`Live bronnen onderbroken: ${error?.message||error}. Geen dag of nacht is verdwenen; geplande kaartpunten blijven beschikbaar.`,'error');hidePlanLoading(false)
    }
  }

  const fn=(f,name)=>f.toString().replace(f.name,name);
  const CALCULATE=fn(canonicalCalculateTemplate,'calculatePlan'),PROGRESSION=fn(canonicalProgressionTemplate,'ensureMultiDayRoadtripProgression'),SUPPLY=fn(canonicalSupplyTemplate,'ensureTourPlanSupply'),DERIVE=fn(canonicalDeriveTemplate,'derivePlanState'),REPORT=fn(canonicalReportTemplate,'roadtripIntentReport'),APPLY=fn(canonicalApplyDestinationTemplate,'applyDestination'),CHOOSE=fn(canonicalChooseProposalTemplate,'chooseProposal'),APPLY_VARIANT=fn(canonicalApplyVariantTemplate,'applyVariant'),ENHANCE=fn(canonicalEnhanceLiveDataTemplate,'enhanceLiveData');

  function injectCanonicalImports(text){
    const imports=[];
    if(!/from ['"]\.\/canonical-trip-engine\.js/.test(text))imports.push("import { buildCanonicalTripPlan, canonicalPlanDiagnostic, isCanonicalPlan } from './canonical-trip-engine.js?v=1954';");
    if(!/from ['"]\.\/canonical-place-resolver\.js/.test(text))imports.push("import { resolveCanonicalPlanPlaces } from './canonical-place-resolver.js?v=1954';");
    if(!/from ['"]\.\/canonical-recommendation-coverage\.js/.test(text))imports.push("import { ensureCanonicalRecommendationCoverage, preserveEnrichmentOnCanonicalBase } from './canonical-recommendation-coverage.js?v=1954';");
    return imports.length?imports.join('\n')+'\n'+text:text
  }
  function functionRange(text,name){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp(`(?:async\\s+)?function\\s+${escaped}\\s*\\(`).exec(text);if(!match)return null;const open=text.indexOf('{',match.index+match[0].length);if(open<0)return null;let depth=0,mode='normal',templateExpr=[];
    for(let i=open;i<text.length;i++){const c=text[i],n=text[i+1];if(mode==='line'){if(c==='\n')mode='normal';continue}if(mode==='block'){if(c==='*'&&n==='/'){mode='normal';i++}continue}if(mode==='single'){if(c==='\\'){i++;continue}if(c==="'")mode='normal';continue}if(mode==='double'){if(c==='\\'){i++;continue}if(c==='"')mode='normal';continue}if(mode==='template'){if(c==='\\'){i++;continue}if(c==='`'){mode='normal';continue}if(c==='$'&&n==='{'){templateExpr.push(depth);depth++;mode='normal';i++;continue}continue}if(c==='/'&&n==='/'){mode='line';i++;continue}if(c==='/'&&n==='*'){mode='block';i++;continue}if(c==="'"){mode='single';continue}if(c==='"'){mode='double';continue}if(c==='`'){mode='template';continue}if(c==='{'){depth++;continue}if(c==='}'){depth--;if(templateExpr.length&&depth===templateExpr.at(-1)){templateExpr.pop();mode='template';continue}if(depth===0)return{start:match.index,end:i+1}}}return null
  }
  function replaceNamedFunction(text,name,replacement){const range=functionRange(text,name);return range?text.slice(0,range.start)+replacement+text.slice(range.end):text}
  function stripLegacySelectedPlannerImports(text){return text.replace(/^import\s*\{\s*buildItinerary\s*\}\s*from\s*['"]\.\/itinerary-engine\.js[^'"]*['"];?\s*$/m,'').replace(/^import\s*\{\s*buildItineraryVariants\s*\}\s*from\s*['"]\.\/itinerary-variants\.js[^'"]*['"];?\s*$/m,'')}
  function ensureCalculatePlan(text){const range=functionRange(text,'calculatePlan');if(range)return text.slice(0,range.start)+CALCULATE+text.slice(range.end);const apply=functionRange(text,'applyDestination');if(apply)return text.slice(0,apply.start)+CALCULATE+'\n'+text.slice(apply.start);return text+'\n'+CALCULATE+'\n'}
  function replaceCanonicalFunctions(text){text=ensureCalculatePlan(text);for(const [name,replacement] of [['ensureMultiDayRoadtripProgression',PROGRESSION],['derivePlanState',DERIVE],['ensureTourPlanSupply',SUPPLY],['roadtripIntentReport',REPORT],['applyVariant',APPLY_VARIANT],['enhanceLiveData',ENHANCE],['applyDestination',APPLY],['chooseProposal',CHOOSE]])text=replaceNamedFunction(text,name,replacement);return text}
  function replaceFailureMessage(text){const newMessage="showError(`Reisplan kan niet worden gegenereerd. Exacte reden: ${roadtripCheck.reason} ${roadtripCheck.suggestion?`Wat nodig is: ${roadtripCheck.suggestion}`:''} [${roadtripCheck.code||'onbekende-code'}]`);\n    setStatus(`Niet gegenereerd · ${roadtripCheck.code||'onbekende oorzaak'}`);";return text.replace(/showError\(`Nog geen geldige \$\{state\.trip\.days\}-daagse roadtrip gevonden \(\$\{roadtripCheck\.reason\}\)\.[\s\S]*?`\);\s*setStatus\('[^']*'\);/,newMessage)}
  function hardenInitialization(text){const oldLine="const restored=loadDraft();if(restored?.trip)rebuildFromRecord(restored);else resetState();renderDashboard(state,loadTrips());",newLine="const restored=loadDraft();if(restored?.trip){try{rebuildFromRecord(restored)}catch(error){console.error('Opgeslagen reis kon niet veilig worden hersteld',error);const recoveredTrip=normalizeTrip(restored.trip);resetState(recoveredTrip);showError(`Opgeslagen reis kon niet worden hersteld door een interne weergavefout: ${error?.message||error}. Het reisformulier is behouden; genereer het plan opnieuw. [restore-render-contract]`)}}else resetState();try{renderDashboard(state,loadTrips())}catch(error){console.error('Dashboard render mislukt',error)}";return text.includes(oldLine)?text.replace(oldLine,newLine):text}
  function addDeploymentMarker(text){if(text.includes('__REISSLIM_CANONICAL_SELECTED_TRIP_CONTRACT'))text=text.replace(/globalThis\.__REISSLIM_CANONICAL_SELECTED_TRIP_CONTRACT='\d+';/,"globalThis.__REISSLIM_CANONICAL_SELECTED_TRIP_CONTRACT='1954';");else{const marker="\nglobalThis.__REISSLIM_CANONICAL_SELECTED_TRIP_CONTRACT='1954';\n",importEnd=text.lastIndexOf("from './roadtrip-runtime-engine.js");if(importEnd<0)return marker+text;const lineEnd=text.indexOf('\n',importEnd);text=text.slice(0,lineEnd+1)+marker+text.slice(lineEnd+1)}return text}
  function repairAppContract(source){let text=String(source||'');text=injectCanonicalImports(text);text=stripLegacySelectedPlannerImports(text);text=replaceCanonicalFunctions(text);text=replaceFailureMessage(text);text=hardenInitialization(text);text=addDeploymentMarker(text);return text}
  root.ReisSlimRuntimeRepair1954=Object.freeze({repairAppContract,functionRange});
})(typeof self!=='undefined'?self:globalThis);
