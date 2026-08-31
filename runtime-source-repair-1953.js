(function(root){
  'use strict';

  function canonicalCalculateTemplate(destination,optimize=false){
    let plan=buildCanonicalTripPlan(state.trip,destination);
    if(plan?.generationFailure)return{plan,budget:null,quality:null,constraintStatus:{exact:false,feasible:false,violations:[plan.generationFailure]},validation:[]};
    if(optimize){const result=optimisePlan(state.trip,destination,plan,{mode:'maximum'});plan=result?.plan||plan}
    return derivePlanState(destination,plan)
  }
  function canonicalProgressionTemplate(trip,destination,plan){return isCanonicalPlan(plan)?plan:buildCanonicalTripPlan(trip,destination)}
  async function canonicalSupplyTemplate(destination,basePlan){return isCanonicalPlan(basePlan)?basePlan:buildCanonicalTripPlan(state.trip,destination)}
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
    const diagnostic=typeof exactTripFailureDiagnostic==='function'?exactTripFailureDiagnostic(trip,plan):{code:'non-canonical-plan',reason:'Een oud niet-canoniek plan is actief geraakt.',suggestion:'Bouw de reis opnieuw op met de huidige canonieke engine.'};
    return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,...diagnostic}
  }
  function canonicalApplyDestinationTemplate(destination,optimize=false){
    if(state.trip?.liveData)showPlanLoading('Reisplan opbouwen…','De canonieke route-engine bouwt iedere kalenderdag inclusief kaartgeometrie.');
    const result=calculatePlan(destination,optimize),failure=result?.plan?.generationFailure;
    if(failure){hidePlanLoading(false);showError(`Reisplan kan niet worden gegenereerd. Exacte reden: ${failure.reason} ${failure.suggestion?`Wat nodig is: ${failure.suggestion}`:''} [${failure.code}]`);setStatus(`Niet gegenereerd · ${failure.code}`);showView('plannerView');return}
    Object.assign(state,{destination,...result,optimized:optimize,selectedVariantId:'balanced',optimizationProposal:null});
    state.variants=[];
    $('variantSection')?.classList.add('hidden');$('planSection')?.classList.remove('hidden');$('mapHint')?.classList.add('hidden');$('noPlanItinerary')?.classList.add('hidden');
    try{renderPlan(state);syncPlanVisualHero();prepareItineraryCarousel();renderOptimizationPreview(state);renderStrongOptimizationPreview()}catch(error){console.error('ReisSlim UI-contractfout bij reisrendering',error);hidePlanLoading(false);showError(`Reisplan is opgebouwd maar kon niet volledig worden weergegeven. Exacte interne reden: ${error?.message||error} [ui-render-contract]`);setStatus('Plan opgebouwd · weergavefout');try{renderDashboard(state,loadTrips())}catch{};try{renderRoadtripMap(state.plan)}catch{};return}
    renderRoadtripMap(state.plan);persistDraft();renderDashboard(state,loadTrips());if(state.trip.liveData)void enhanceLiveData(destination.id,state.plan)
  }
  function canonicalChooseProposalTemplate(destination){
    learn('select',destination);state.destination=destination;
    if(state.trip?.liveData&&!destination.image)void enrichDestinationImages([destination],{maximum:1}).then(()=>{if(state.destination?.id===destination.id){syncPlanVisualHero();persistDraft('Routebeeld geladen')}});
    state.variants=[];state.selectedVariantId='balanced';state.plan=null;
    $('variantSection')?.classList.add('hidden');$('planSection')?.classList.add('hidden');$('noPlanItinerary')?.classList.add('hidden');
    persistDraft('Reisconcept gekozen · canonieke route-engine');showView('itineraryView');applyDestination(destination,false)
  }
  async function canonicalApplyVariantTemplate(id){
    const destination=state.destination||state.ranked?.find(item=>item.id===id);if(!destination)return;
    applyDestination(destination,false)
  }

  const fn=(f,name)=>f.toString().replace(f.name,name);
  const CALCULATE=fn(canonicalCalculateTemplate,'calculatePlan');
  const PROGRESSION=fn(canonicalProgressionTemplate,'ensureMultiDayRoadtripProgression');
  const SUPPLY=fn(canonicalSupplyTemplate,'ensureTourPlanSupply');
  const DERIVE=fn(canonicalDeriveTemplate,'derivePlanState');
  const REPORT=fn(canonicalReportTemplate,'roadtripIntentReport');
  const APPLY=fn(canonicalApplyDestinationTemplate,'applyDestination');
  const CHOOSE=fn(canonicalChooseProposalTemplate,'chooseProposal');
  const APPLY_VARIANT=fn(canonicalApplyVariantTemplate,'applyVariant');

  function injectCanonicalImports(text){
    if(!/from ['"]\.\/canonical-trip-engine\.js/.test(text))text=`import { buildCanonicalTripPlan, canonicalPlanDiagnostic, isCanonicalPlan } from './canonical-trip-engine.js?v=1953';\nimport { resolveCanonicalPlanPlaces } from './canonical-place-resolver.js?v=1953';\n${text}`;
    return text
  }

  // Brace-aware function replacement. This deliberately avoids regex body matching:
  // nested blocks, object literals and template-string ${...} expressions are common
  // in app.js and were the reason older source-repair releases could patch only part
  // of a function and leave legacy code active on the phone.
  function functionRange(text,name){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const match=new RegExp(`(?:async\\s+)?function\\s+${escaped}\\s*\\(`).exec(text);if(!match)return null;
    const open=text.indexOf('{',match.index+match[0].length);if(open<0)return null;
    let depth=0,mode='normal',templateExpr=[];
    for(let i=open;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(mode==='line'){if(c==='\n')mode='normal';continue}
      if(mode==='block'){if(c==='*'&&n==='/'){mode='normal';i++}continue}
      if(mode==='single'){if(c==='\\'){i++;continue}if(c==="'")mode='normal';continue}
      if(mode==='double'){if(c==='\\'){i++;continue}if(c==='"')mode='normal';continue}
      if(mode==='template'){
        if(c==='\\'){i++;continue}
        if(c==='`'){mode='normal';continue}
        if(c==='$'&&n==='{'){templateExpr.push(depth);depth++;mode='normal';i++;continue}
        continue
      }
      if(c==='/'&&n==='/'){mode='line';i++;continue}
      if(c==='/'&&n==='*'){mode='block';i++;continue}
      if(c==="'"){mode='single';continue}
      if(c==='"'){mode='double';continue}
      if(c==='`'){mode='template';continue}
      if(c==='{'){depth++;continue}
      if(c==='}'){
        depth--;
        if(templateExpr.length&&depth===templateExpr.at(-1)){templateExpr.pop();mode='template';continue}
        if(depth===0)return{start:match.index,end:i+1}
      }
    }
    return null
  }
  function replaceNamedFunction(text,name,replacement){const range=functionRange(text,name);return range?text.slice(0,range.start)+replacement+text.slice(range.end):text}
  function stripLegacySelectedPlannerImports(text){
    return text
      .replace(/^import\s*\{\s*buildItinerary\s*\}\s*from\s*['"]\.\/itinerary-engine\.js[^'"]*['"];?\s*$/m,'')
      .replace(/^import\s*\{\s*buildItineraryVariants\s*\}\s*from\s*['"]\.\/itinerary-variants\.js[^'"]*['"];?\s*$/m,'')
  }
  function ensureCalculatePlan(text){
    const range=functionRange(text,'calculatePlan');if(range)return text.slice(0,range.start)+CALCULATE+text.slice(range.end);
    const apply=functionRange(text,'applyDestination');if(apply)return text.slice(0,apply.start)+CALCULATE+'\n'+text.slice(apply.start);
    return text+'\n'+CALCULATE+'\n'
  }
  function replaceCanonicalFunctions(text){
    text=ensureCalculatePlan(text);
    for(const [name,replacement] of [['ensureMultiDayRoadtripProgression',PROGRESSION],['derivePlanState',DERIVE],['ensureTourPlanSupply',SUPPLY],['roadtripIntentReport',REPORT],['applyVariant',APPLY_VARIANT],['applyDestination',APPLY],['chooseProposal',CHOOSE]])text=replaceNamedFunction(text,name,replacement);
    return text
  }
  function injectCanonicalResolver(text){
    const needle='plan=await prepareGeneratedRouteStops(plan,{';
    if(!text.includes(needle)||text.includes('resolveCanonicalPlanPlaces(plan,{trip:state.trip'))return text;
    const prefix="if(isCanonicalPlan(plan)){plan=await resolveCanonicalPlanPlaces(plan,{trip:state.trip,destination:state.destination,timeoutMs:1800,concurrency:6,onProgress:event=>{if(run!==state.routingRun)return;const total=Number(event?.total||0),completed=Number(event?.completed||0),fraction=total?completed/total:0;updatePlanLoading(8+Math.round(fraction*10),'Routepunten controleren…','Lokale en transitpunten aan echte plaatsen koppelen.','Geografie')}})}\n    plan=isCanonicalPlan(plan)?plan:await prepareGeneratedRouteStops(plan,{";
    return text.replace(needle,prefix)
  }
  function preserveAccommodationPlaceholders(text){
    // Do not delete the last known representation of an overnight before the live
    // accommodation resolver succeeds. The resolver itself replaces each night atomically.
    return text.replace(/\s*\/\/ Single final accommodation authority:[\s\S]*?plan\.recommendations=\(plan\.days\|\|\[\]\)\.flatMap\(day=>day\.recommendations\|\|\[\]\);\s*updatePlanLoading\(89,/,
      "\n    // Accommodation coverage is transactional: existing per-night placeholders stay until a specific live replacement succeeds.\n    plan.recommendations=(plan.days||[]).flatMap(day=>day.recommendations||[]);\n    updatePlanLoading(89,")
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
  function addDeploymentMarker(text){
    if(text.includes('__REISSLIM_CANONICAL_SELECTED_TRIP_CONTRACT'))return text;
    const marker="\nglobalThis.__REISSLIM_CANONICAL_SELECTED_TRIP_CONTRACT='1953';\n";
    const importEnd=text.lastIndexOf("from './roadtrip-runtime-engine.js");
    if(importEnd<0)return marker+text;
    const lineEnd=text.indexOf('\n',importEnd);return text.slice(0,lineEnd+1)+marker+text.slice(lineEnd+1)
  }
  function repairAppContract(source){
    let text=String(source||'');
    text=injectCanonicalImports(text);
    text=stripLegacySelectedPlannerImports(text);
    text=replaceCanonicalFunctions(text);
    text=injectCanonicalResolver(text);
    text=preserveAccommodationPlaceholders(text);
    text=replaceFailureMessage(text);
    text=hardenInitialization(text);
    text=addDeploymentMarker(text);
    return text
  }
  root.ReisSlimRuntimeRepair1953=Object.freeze({repairAppContract,functionRange});
})(typeof self!=='undefined'?self:globalThis);
