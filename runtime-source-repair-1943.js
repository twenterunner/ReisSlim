(function(root){
  'use strict';

  const CALCULATE_PLAN_HELPER=`\nfunction calculatePlan(destination,optimize=false){\n  let plan=buildItinerary(state.trip,destination);\n  if(optimize){\n    const result=optimisePlan(state.trip,destination,plan,{mode:'maximum'});\n    plan=result?.plan||plan;\n  }\n  return derivePlanState(destination,plan);\n}\n`;

  const RESTORE_REPLACEMENT=`function rebuildFromRecord(record){\n  state.trip=normalizeTrip(record.trip);\n  state.compareIds=record.compareIds||[];\n  state.savedProposalIds=record.savedProposalIds||[];\n  state.dismissedIds=record.dismissedIds||[];\n  writeTripForm(state.trip);\n  renderVehicleControls();\n  state.catalog=record.destinationProfile?.dynamic?[...destinations,record.destinationProfile]:[...destinations];\n  refreshPortfolio();\n  state.destination=state.ranking.candidates.find(i=>i.id===record.destinationId)||record.destinationProfile||null;\n  if(!state.destination)return;\n  $('resultsSection').classList.remove('hidden');\n  if(record.plan&&!record.needsRebuild){\n    const derived=derivePlanState(state.destination,record.plan);\n    Object.assign(state,{\n      destination:state.destination,\n      selectedVariantId:record.selectedVariantId||'balanced',\n      plan:derived.plan,\n      budget:derived.budget,\n      quality:derived.quality,\n      constraintStatus:derived.constraintStatus,\n      validation:derived.validation,\n      optimized:Boolean(record.optimized)\n    });\n    $('variantSection').classList.add('hidden');\n    $('planSection').classList.remove('hidden');\n    $('mapHint').classList.add('hidden');\n    $('noPlanItinerary').classList.add('hidden');\n    renderPlan(state);\n    syncPlanVisualHero();\n    prepareItineraryCarousel();\n    renderOptimizationPreview(state);\n    renderStrongOptimizationPreview();\n    renderRoadtripMap(state.plan);\n    if(state.trip.liveData)void enhanceLiveData(state.destination.id,state.plan);\n    return;\n  }\n  applyDestination(state.destination,Boolean(record.optimized));\n}`;

  const CANDIDATE_REPLACEMENT=`function roadtripLandCandidates(origin,trip=state.trip){\n const rows=[];\n for(const item of(state.catalog||[]))for(const b of(item?.bases||[])){\n   if(!Number.isFinite(b?.lat)||!Number.isFinite(b?.lon))continue;\n   const originKm=geoDistanceKm(origin,b);if(originKm<12)continue;\n   const activityCount=Number(item.activities?.length||0),tagCount=Number(item.tags?.length||0);\n   const poiRichness=Number.isFinite(Number(item.poiRichness))?Number(item.poiRichness):Math.min(100,activityCount*18+tagCount*5+(item.dynamic?12:0));\n   const preferenceScore=(item.tags||[]).reduce((sum,tag)=>sum+((trip?.preferences||[]).includes(tag)?Number(trip?.preferenceWeights?.[tag]||2)*12:0),0);\n   const vehicleScore=trip?.transport==='motorcycle'?Number(item.motorcycle||0):['motorhome','caravan'].includes(trip?.transport)?Number(item.camper||0):Number(item.family||0);\n   rows.push({...b,name:b.name||item.name||'Overnachtingsregio',role:'destination',landValidated:true,generatedExploration:false,catalogId:item.id||null,originKm,poiRichness,activityCount,tagCount,preferenceScore,vehicleScore,tags:[...(item.tags||[])],destinationName:item.name||b.name});\n }\n // Spatial hash instead of the old O(N²) seen.some(distance) loop. The 12 km\n // de-duplication contract is unchanged, but runtime stays near-linear as live\n // discovery grows the catalogue into the thousands.\n const cellDeg=.12,grid=new Map(),out=[];\n for(const p of rows){\n   const cy=Math.floor(Number(p.lat)/cellDeg),cx=Math.floor(Number(p.lon)/cellDeg);\n   let duplicate=false;\n   for(let dy=-1;dy<=1&&!duplicate;dy++)for(let dx=-1;dx<=1&&!duplicate;dx++){\n     const bucket=grid.get(\`${'${cy+dy}:${cx+dx}'}\`)||[];\n     for(const q of bucket){if(geoDistanceKm(q,p)<12){duplicate=true;break}}\n   }\n   if(duplicate)continue;\n   out.push(p);\n   const key=\`${'${cy}:${cx}'}\`,bucket=grid.get(key)||[];bucket.push(p);grid.set(key,bucket);\n }\n return out;\n}`;

  function injectCalculatePlan(text){
    if(/\bfunction\s+calculatePlan\s*\(/.test(text))return text;
    const marker='function applyDestination(destination,optimize=false)';
    const index=text.indexOf(marker);
    if(index<0)return text;
    return text.slice(0,index)+CALCULATE_PLAN_HELPER+'\n'+text.slice(index);
  }

  function replaceRestorePath(text){
    const pattern=/function rebuildFromRecord\(record\)\{[\s\S]*?\n\}\n\nfunction startNewTrip\(\)/;
    if(pattern.test(text))return text.replace(pattern,`${RESTORE_REPLACEMENT}\n\nfunction startNewTrip()`);
    // Current production source has a compact one-line function. Stop only at the
    // next named function so nested object braces cannot terminate the match.
    const compact=/function rebuildFromRecord\(record\)\{[\s\S]*?\}\n\nfunction startNewTrip\(\)/;
    return compact.test(text)?text.replace(compact,`${RESTORE_REPLACEMENT}\n\nfunction startNewTrip()`):text;
  }

  function replaceCandidateDedupe(text){
    const pattern=/function roadtripLandCandidates\(origin,trip=state\.trip\)\{[\s\S]*?\n\}\nfunction tourLegLimitKm/;
    if(pattern.test(text))return text.replace(pattern,`${CANDIDATE_REPLACEMENT}\nfunction tourLegLimitKm`);
    const compact=/function roadtripLandCandidates\(origin,trip=state\.trip\)\{[\s\S]*?\}\nfunction tourLegLimitKm/;
    return compact.test(text)?text.replace(compact,`${CANDIDATE_REPLACEMENT}\nfunction tourLegLimitKm`):text;
  }

  function repairAppContract(source){
    let text=String(source||'');
    text=injectCalculatePlan(text);
    text=replaceRestorePath(text);
    text=replaceCandidateDedupe(text);
    return text;
  }

  root.ReisSlimRuntimeRepair1943=Object.freeze({repairAppContract});
})(typeof self!=='undefined'?self:globalThis);
