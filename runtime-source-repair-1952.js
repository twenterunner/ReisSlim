(function(root){
  'use strict';

  function canonicalCalculateTemplate(destination,optimize=false){
    let plan=buildCanonicalTripPlan(state.trip,destination);
    if(plan?.generationFailure)return{plan,budget:null,quality:null,constraintStatus:{exact:false,feasible:false,violations:[plan.generationFailure]},validation:[]};
    if(optimize){const result=optimisePlan(state.trip,destination,plan,{mode:'maximum'});plan=result?.plan||plan}
    return derivePlanState(destination,plan)
  }
  function canonicalProgressionTemplate(trip,destination,plan){return isCanonicalPlan(plan)?plan:buildCanonicalTripPlan(trip,destination)}
  function canonicalSupplyTemplate(destination,basePlan){return Promise.resolve(isCanonicalPlan(basePlan)?basePlan:buildCanonicalTripPlan(state.trip,destination))}
  function canonicalDeriveTemplate(destination,plan){
    plan=isCanonicalPlan(plan)?plan:buildCanonicalTripPlan(state.trip,destination);
    const diagnostic=canonicalPlanDiagnostic(state.trip,plan,destination);
    const budget=buildBudget(state.trip,destination,plan);
    const constraintStatus=evaluatePlanConstraints(state.trip,plan,budget,{allowStretch:destination.category==='stretch'});
    plan.roadtripPolicy={valid:diagnostic.valid,code:diagnostic.code,violations:diagnostic.valid?[]:[diagnostic.code],pendingResolution:Boolean(diagnostic.pendingResolution)};
    plan.constraintStatus=constraintStatus;
    plan.feasible=diagnostic.valid&&constraintStatus.exact;
    plan.warnings=[...new Set([...(plan.warnings||[]),...(!diagnostic.valid?[diagnostic.reason]:[]),...(constraintStatus.violations||[]).map(item=>item.detail)])];
    return{plan,budget,quality:calculateTripQuality(state.trip,destination,plan,budget),validation:validatePlan(state.trip,destination,plan,budget),constraintStatus}
  }
  function canonicalReportTemplate(trip,plan){
    if(isCanonicalPlan(plan)){const d=canonicalPlanDiagnostic(trip,plan,state.destination);return{valid:d.valid,moved:0,intentionalStays:0,illegalShortMove:0,reason:d.reason,code:d.code,suggestion:d.suggestion||'',pendingResolution:Boolean(d.pendingResolution)}}
    const r=validateRoadtrip(trip,plan);if(r.valid)return{valid:true,moved:r.moves?.filter(x=>x>=ROADTRIP_POLICY.minRoadMoveKm).length||0,intentionalStays:(plan?.days||[]).filter(x=>x.intentionalStay).length,illegalShortMove:0,reason:'roadtrip-ok',code:'roadtrip-ok',suggestion:''};
    const diagnostic=typeof exactTripFailureDiagnostic==='function'?exactTripFailureDiagnostic(trip,plan):{code:r.violations?.[0]||'legacy-plan-invalid',reason:'Een niet-canoniek oud plan is ongeldig.',suggestion:'Bouw de reis opnieuw op met de huidige engine.'};
    return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,...diagnostic}
  }
  function canonicalApplyDestinationTemplate(destination,optimize=false){
    if(state.trip?.liveData)showPlanLoading('Reisplan opbouwen…','De canonieke route-engine bouwt iedere kalenderdag inclusief kaartgeometrie.');
    const result=calculatePlan(destination,optimize),failure=result?.plan?.generationFailure;
    if(failure){hidePlanLoading(false);showError(`Reisplan kan niet worden gegenereerd. Exacte reden: ${failure.reason} ${failure.suggestion?`Wat nodig is: ${failure.suggestion}`:''} [${failure.code}]`);setStatus(`Niet gegenereerd · ${failure.code}`);showView('plannerView');return}
    Object.assign(state,{destination,...result,optimized:optimize,selectedVariantId:'balanced',optimizationProposal:null});$('variantSection').classList.add('hidden');$('planSection').classList.remove('hidden');$('mapHint').classList.add('hidden');$('noPlanItinerary').classList.add('hidden');try{renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview()}catch(error){console.error('ReisSlim UI-contractfout bij reisrendering',error);showError(`Reisplan is opgebouwd maar kon niet volledig worden weergegeven. Exacte interne reden: ${error?.message||error} [ui-render-contract]`);setStatus('Plan opgebouwd · weergavefout');try{renderDashboard(state,loadTrips())}catch{};try{renderRoadtripMap(state.plan)}catch{};return}renderRoadtripMap(state.plan);persistDraft();renderDashboard(state,loadTrips());if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)
  }

  const fn=(f,name)=>f.toString().replace(f.name,name);
  const CALCULATE=fn(canonicalCalculateTemplate,'calculatePlan');
  const PROGRESSION=fn(canonicalProgressionTemplate,'ensureMultiDayRoadtripProgression');
  const SUPPLY='async '+fn(canonicalSupplyTemplate,'ensureTourPlanSupply').replace(/^function /,'function ');
  const DERIVE=fn(canonicalDeriveTemplate,'derivePlanState');
  const REPORT=fn(canonicalReportTemplate,'roadtripIntentReport');
  const APPLY=fn(canonicalApplyDestinationTemplate,'applyDestination');

  function injectCanonicalImports(text){
    if(!/from ['"]\.\/canonical-trip-engine\.js/.test(text))text=`import { buildCanonicalTripPlan, canonicalPlanDiagnostic, isCanonicalPlan } from './canonical-trip-engine.js?v=1952';\nimport { resolveCanonicalPlanPlaces } from './canonical-place-resolver.js?v=1952';\n${text}`;
    return text
  }
  function replaceNamedFunction(text,name,nextMarker,replacement){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),next=nextMarker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const p=new RegExp(`(?:async\\s+)?function\\s+${escaped}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n(?=${next})`);
    if(p.test(text))return text.replace(p,replacement+'\n');
    const compact=new RegExp(`(?:async\\s+)?function\\s+${escaped}\\([^)]*\\)\\{[\\s\\S]*?\\}(?=\\n?${next})`);
    return compact.test(text)?text.replace(compact,replacement):text
  }
  function replaceCanonicalFunctions(text){
    text=replaceNamedFunction(text,'calculatePlan','function applyDestination',CALCULATE);
    text=replaceNamedFunction(text,'ensureMultiDayRoadtripProgression','function derivePlanState',PROGRESSION);
    text=replaceNamedFunction(text,'derivePlanState','const optimizerDimensionLabels',DERIVE);
    text=replaceNamedFunction(text,'ensureTourPlanSupply','async function applyVariant',SUPPLY);
    text=replaceNamedFunction(text,'roadtripIntentReport','function tourDay',REPORT);
    text=replaceNamedFunction(text,'applyDestination','function chooseProposal',APPLY);
    return text
  }
  function injectCanonicalResolver(text){
    const needle='plan=await prepareGeneratedRouteStops(plan,{';
    if(!text.includes(needle)||text.includes('resolveCanonicalPlanPlaces(plan,{trip:state.trip'))return text;
    const prefix="if(isCanonicalPlan(plan)){plan=await resolveCanonicalPlanPlaces(plan,{trip:state.trip,destination:state.destination,timeoutMs:1800,concurrency:6,onProgress:event=>{if(run!==state.routingRun)return;const total=Number(event?.total||0),completed=Number(event?.completed||0),fraction=total?completed/total:0;updatePlanLoading(8+Math.round(fraction*10),'Routepunten controleren…','Lokale en transitpunten aan echte plaatsen koppelen.','Geografie')}})}\n    plan=isCanonicalPlan(plan)?plan:await prepareGeneratedRouteStops(plan,{";
    return text.replace(needle,prefix)
  }
  function replaceFailureMessage(text){
    const newMessage="showError(`Reisplan kan niet worden gegenereerd. Exacte reden: ${roadtripCheck.reason} ${roadtripCheck.suggestion?`Wat nodig is: ${roadtripCheck.suggestion}`:''} [${roadtripCheck.code||'onbekende-code'}]`);\n    setStatus(`Niet gegenereerd · ${roadtripCheck.code||'onbekende oorzaak'}`);";
    return text.replace(/showError\(`Nog geen geldige \$\{state\.trip\.days\}-daagse roadtrip gevonden \(\$\{roadtripCheck\.reason\}\)\.[\s\S]*?`\);\s*setStatus\('[^']*'\);/,newMessage)
  }
  function hardenInitialization(text){
    const oldLine="const restored=loadDraft();if(restored?.trip)rebuildFromRecord(restored);else resetState();renderDashboard(state,loadTrips());";
    const newLine="const restored=loadDraft();if(restored?.trip){try{rebuildFromRecord(restored)}catch(error){console.error('Opgeslagen reis kon niet veilig worden hersteld',error);const recoveredTrip=normalizeTrip(restored.trip);resetState(recoveredTrip);showError(`Opgeslagen reis kon niet worden hersteld door een interne weergavefout: ${error?.message||error}. Het reisformulier is behouden; genereer het plan opnieuw. [restore-render-contract]`)}}else resetState();try{renderDashboard(state,loadTrips())}catch(error){console.error('Dashboard render mislukt',error)}";
    return text.includes(oldLine)?text.replace(oldLine,newLine):text
  }
  function repairAppContract(source){
    let text=String(source||'');
    if(root.ReisSlimRuntimeRepair1950?.repairAppContract)text=root.ReisSlimRuntimeRepair1950.repairAppContract(text);
    text=injectCanonicalImports(text);
    text=replaceCanonicalFunctions(text);
    text=injectCanonicalResolver(text);
    text=replaceFailureMessage(text);
    text=hardenInitialization(text);
    return text
  }
  root.ReisSlimRuntimeRepair1952=Object.freeze({repairAppContract});
})(typeof self!=='undefined'?self:globalThis);
