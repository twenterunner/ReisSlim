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



  const BASE_PROGRESSION_REPLACEMENT=`function ensureBaseTripProgression(trip,destination,plan){
 const days=Number(trip?.days||0);if(days<=1)return plan;
 const origin=plan?.routeMetrics?.origin||plan?.origin||plan?.days?.[0]?.fromPoint;
 if(!origin||!Number.isFinite(origin.lat)||!Number.isFinite(origin.lon))return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:['missing-origin']}};
 const candidates=roadtripLandCandidates(origin,trip),skeleton=buildBaseTripSkeleton({origin:{...origin,name:trip.origin},trip,destination,candidates});
 if(!skeleton?.valid){const reason=skeleton?.reason||'no-suitable-base';return{...plan,feasible:false,roadtripPolicy:{valid:false,violations:[reason]},warnings:[...(plan.warnings||[]),reason==='base-too-far-for-duration'?'De gekozen uitvalsbasis vraagt meer transitdagen dan de reisduur toelaat.':reason==='base-transit-exceeds-changes'?'De uitvalsbasis vraagt meer accommodatiewissels onderweg dan toegestaan.':'Geen haalbare centrale uitvalsbasis gevonden binnen de ingestelde grenzen.']}};
 const base=skeleton.base,home={...origin,name:trip.origin,role:'origin',landValidated:true},rebuilt=[];let from=home,day=1;
 for(let i=0;i<skeleton.outboundStops.length;i++){const to=skeleton.outboundStops[i];rebuilt.push(tourDay(i===0?'outward':'transfer',from,to,day++,trip));from=to}
 for(const target of skeleton.dayTripTargets){rebuilt.push(baseDayTripDay(base,target,day++,trip));from=base}
 for(const to of skeleton.inboundStops){rebuilt.push(tourDay('transfer',from,to,day++,trip));from=to}
 rebuilt.push(tourDay('return',from,home,day++,trip));
 const overnightIds=rebuilt.slice(0,-1).map(d=>String(d.toPoint?.catalogId||d.overnight||\`\${Number(d.toPoint?.lat).toFixed(3)},\${Number(d.toPoint?.lon).toFixed(3)}\`));let changes=0,previous=null;for(const id of overnightIds){if(previous!==null&&id!==previous)changes++;previous=id}
 const candidate={...plan,days:rebuilt,accommodationChanges:changes,baseSelection:{point:{...base},score:base.baseScore,why:{...(base.baseWhy||{}),transitLegs:skeleton.transitLegs,minimumChanges:skeleton.minimumChanges},label:\`\${base.name} als slimme uitvalsbasis\`},routeMetrics:{...(plan.routeMetrics||{}),origin:{...origin},exploration:{overlap:0,explorationScore:100,method:'multi-leg-base-transit-policy'}},routing:{...(plan.routing||{}),source:'canonical-base-plan',live:false},topology:'base-daytrips'};
 candidate.roadtripPolicy=validateRoadtrip(trip,candidate);candidate.feasible=candidate.roadtripPolicy.valid;return candidate
}`;

  function injectBaseSkeletonImport(text){
    return text.replace(/import\s*\{([^}]*?)\}\s*from\s*(['"]\.\/roadtrip-policy\.js[^'"]*['"]);/,function(match,names,source){if(/\bbuildBaseTripSkeleton\b/.test(names))return match;return `import { buildBaseTripSkeleton,${names}} from ${source};`})
  }

  function replaceBaseProgression(text){
    const pattern=/function ensureBaseTripProgression\(trip,destination,plan\)\{[\s\S]*?\n\}\nfunction ensureMultiDayRoadtripProgression/;
    if(pattern.test(text))return text.replace(pattern,`${BASE_PROGRESSION_REPLACEMENT}\nfunction ensureMultiDayRoadtripProgression`);
    const compact=/function ensureBaseTripProgression\(trip,destination,plan\)\{[\s\S]*?\}\nfunction ensureMultiDayRoadtripProgression/;
    return compact.test(text)?text.replace(compact,`${BASE_PROGRESSION_REPLACEMENT}\nfunction ensureMultiDayRoadtripProgression`):text
  }

  function expandBaseFailureMessages(text){
    const marker="if(plan?.roadtripPolicy?.violations?.includes('no-suitable-base'))return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'geen geschikte centrale uitvalsbasis gevonden'};";
    if(!text.includes(marker))return text;
    const extra=marker+"if(plan?.roadtripPolicy?.violations?.includes('base-too-far-for-duration'))return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'uitvalsbasis niet bereikbaar binnen reisduur en dagelijkse rijtijd'};if(plan?.roadtripPolicy?.violations?.includes('base-transit-exceeds-changes'))return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'te weinig accommodatiewissels toegestaan voor de noodzakelijke transitnachten'};if(plan?.roadtripPolicy?.violations?.includes('base-transit-chain-failed'))return{valid:false,moved:0,intentionalStays:0,illegalShortMove:0,reason:'geen geldige transitketen naar de uitvalsbasis'};";
    return text.replace(marker,extra)
  }



  function exactTripFailureDiagnosticTemplate(trip,plan){
    const policyViolations=[...(plan?.roadtripPolicy?.violations||[])];
    const policy=validateRoadtrip(trip,plan);
    const violations=policyViolations.length?policyViolations:[...(policy?.violations||[])];
    const code=String(violations[0]||'unknown-generation-failure');
    const origin=plan?.routeMetrics?.origin||plan?.origin||plan?.days?.[0]?.fromPoint||null;
    const destination=state.destination||null;
    const anchor=destination?.bases?.[0]||destination?.anchor||null;
    const maxLeg=Math.round(maximumRoadLegKm(trip));
    const days=Math.max(1,Number(trip?.days||1));
    const maxChanges=Math.max(0,Number(trip?.maxChanges||0));
    const vehicle={motorcycle:'motor',car:'auto',motorhome:'camper',caravan:'auto met caravan'}[trip?.transport]||String(trip?.transport||'voertuig');
    const candidates=origin&&Number.isFinite(origin.lat)&&Number.isFinite(origin.lon)?roadtripLandCandidates(origin,trip):[];
    const km=value=>Number.isFinite(Number(value))?Math.round(Number(value)):null;
    const one=value=>Number.isFinite(Number(value))?Number(value).toFixed(1).replace('.',','):String(value);
    const parts=raw=>String(raw||'').split(':');
    const fraction=raw=>String(raw||'').split('/');
    const constraint=plan?.constraintStatus?.violations?.[0];
    if(constraint?.detail)return{code:'constraint-'+constraint.key,reason:constraint.detail,suggestion:constraint.adjustment||'Pas de genoemde harde voorwaarde aan.'};

    if(code==='missing-origin'||code==='missing-origin-or-duration')return{code,reason:'De vertrekplaats heeft geen geldige coördinaten, waardoor geen routeberekening mogelijk is.',suggestion:'Controleer de vertrekplaats of probeer de plaats opnieuw te laten geocoderen.'};
    if(code==='no-suitable-base'){
      const direct=origin&&anchor?km(estimatedRoadKm(origin,anchor)):null;
      const byDays=Math.max(1,Math.floor(days/2));
      const legBudget=Math.max(1,Math.min(byDays,trip?.strictChanges===false?byDays:Math.floor(maxChanges/2)+1));
      const maxReach=maxLeg*legBudget;
      if(direct!==null&&direct>maxReach)return{code,reason:`De gekozen uitvalsbasis ligt naar schatting ${direct} km van ${trip.origin}. Met ${one(trip.maxDrive)} uur maximale rijtijd per dag is circa ${maxLeg} km per reisetappe toegestaan. Binnen ${days} dagen en maximaal ${maxChanges} accommodatiewissels zijn maximaal ${legBudget} etappes per richting beschikbaar (circa ${maxReach} km bereik), dus de uitvalsbasis ligt ${direct-maxReach} km buiten het haalbare bereik.`,suggestion:`Verhoog de reisduur, dagelijkse rijtijd of het aantal toegestane accommodatiewissels, of kies een bestemming binnen circa ${maxReach} km geschatte wegafstand.`};
      return{code,reason:`De uitvalsbasis-selector hield 0 geldige bases over uit ${candidates.length} beschikbare routekandidaten, terwijl de geselecteerde regio ${direct===null?'geen bruikbare ankerafstand heeft':`op circa ${direct} km ligt`} en de daglimiet circa ${maxLeg} km is. Dit is een interne route-opbouwfout, niet bewijs dat er werkelijk geen verblijfplaatsen bestaan.`,suggestion:'Probeer opnieuw; als dit reproduceerbaar blijft moet de route-opbouw worden gecorrigeerd, niet je reisvoorkeur.'};
    }
    if(['base-too-far-for-duration','base-transit-exceeds-changes','base-transit-chain-failed','insufficient-base-daytrips'].includes(code)){
      let skeleton=null;try{skeleton=buildBaseTripSkeleton({origin:{...origin,name:trip.origin},trip,destination,candidates})}catch{}
      const direct=origin&&skeleton?.base?km(estimatedRoadKm(origin,skeleton.base)):origin&&anchor?km(estimatedRoadKm(origin,anchor)):null;
      const legs=Number(skeleton?.transitLegs||Math.max(1,Math.ceil((direct||0)/Math.max(1,maxLeg))));
      if(code==='base-too-far-for-duration')return{code,reason:`De centrale basis vraagt ${legs} reisetappes heen en ${legs} terug (${legs*2} reisdagen) bij circa ${maxLeg} km per dag, maar de reis duurt ${days} dagen${direct!==null?` en de basis ligt circa ${direct} km weg`:''}.`,suggestion:`Gebruik minimaal ${legs*2} reisdagen, verhoog de dagelijkse rijtijd of kies een dichterbij gelegen basis.`};
      if(code==='base-transit-exceeds-changes'){
        const needed=Number(skeleton?.minimumChanges??Math.max(0,2*(legs-1)));
        return{code,reason:`Voor ${legs} reisetappes per richting zijn minimaal ${needed} accommodatiewissels nodig, maar je maximum is ${maxChanges}.`,suggestion:`Sta minimaal ${needed} accommodatiewissels toe, verhoog de dagelijkse rijtijd zodat minder transitnachten nodig zijn, of kies een dichterbij gelegen basis.`};
      }
      if(code==='base-transit-chain-failed')return{code,reason:`De basis vereist ${legs} reisetappes per richting, maar uit ${candidates.length} routekandidaten kon geen aaneengesloten transitketen worden gebouwd waarin iedere etappe maximaal circa ${maxLeg} km is.`,suggestion:'Dit is een route-supply/solverprobleem. Opnieuw zoeken naar routeplaatsen is zinvol; de app mag dit niet presenteren als “geen accommodaties”.'};
      const localDays=Number(skeleton?.localDays??Math.max(0,days-legs*2));
      return{code,reason:`Na ${legs} etappes heen en terug blijven ${localDays} lokale dag${localDays===1?'':'en'} over, maar de dagrit-generator leverde minder dan ${localDays} geldige dagritdoelen binnen de ingestelde rijtijd.`,suggestion:'Dit is een dagrit-opbouwprobleem; lokale POI’s mogen worden hergebruikt zolang de basis en rijtijd geldig blijven.'};
    }
    if(code==='insufficient-real-overnight-regions'){
      const nights=Math.max(0,days-1);let generated=0;try{generated=chooseTourStops({...origin,name:trip.origin},trip,destination,nights).length}catch{}
      return{code,reason:`De ${days}-daagse roadtrip vereist ${nights} overnachtingsnachten. De route-opbouwer leverde ${generated} van ${nights} benodigde nachtposities uit ${candidates.length} routekandidaten, met maximaal circa ${maxLeg} km per reisetappe en maximaal ${maxChanges} accommodatiewissels.`,suggestion:generated<nights?'Dit is een route-opbouw/supplyfout. Extra echte routeplaatsen moeten worden gezocht of de generieke routegeometrie moet worden gebruikt; de app mag niet suggereren dat de bestemming zelf geen mogelijkheden heeft.':'De nachtposities zijn aanwezig; de fout zit in de daaropvolgende validatie.'};
    }
    if(code==='insufficient-final-open-ended-region')return{code,reason:`Voor de laatste open-einde etappe werd geen nieuwe regio gevonden die minimaal ${ROADTRIP_POLICY.minRoadMoveKm} km verder ligt en binnen circa ${maxLeg} km rijafstand blijft.`,suggestion:'Zoek extra routeplaatsen rond het laatste routepunt of kies een lus/heen-en-terug-topologie.'};
    const p=parts(code),kind=p[0];
    if(kind==='day-count')return{code,reason:`De route bevat ${fraction(p[1])[0]||'?'} dagen terwijl ${days} dagen zijn gevraagd.`,suggestion:'Bouw de route opnieuw op met exact het ingestelde aantal dagen.'};
    if(kind==='missing-coordinate')return{code,reason:`Dag ${p[1]} mist een geldige begin- of eindcoördinaat.`,suggestion:'De ontbrekende plaats moet opnieuw worden gegeocodeerd voordat het plan geldig kan zijn.'};
    if(kind==='disconnected-day')return{code,reason:`Dag ${p[1]} sluit geografisch niet aan op het eindpunt van de vorige dag.`,suggestion:'Herbouw de overgang tussen deze twee reisdagen.'};
    if(kind==='base-changed')return{code,reason:`Dag ${p[1]} is als lokale basisdag gepland maar vertrekt of eindigt niet bij dezelfde centrale uitvalsbasis.`,suggestion:'Herbouw die dag als echte dagrit vanaf dezelfde basis.'};
    if(kind==='missing-daytrip-target')return{code,reason:`Dag ${p[1]} heeft geen geldig dagritdoel met coördinaten.`,suggestion:'Zoek een echt POI/dagritdoel binnen de toegestane rijtijd.'};
    if(kind==='short-transit'||kind==='short-move')return{code,reason:`Etappe ${p[1]} is slechts ongeveer ${p[2]||'?'} km, onder de minimale echte verplaatsing van ${ROADTRIP_POLICY.minRoadMoveKm} km, terwijl de locaties niet als dezelfde verblijfplaats gelden.`,suggestion:'Maak dit een expliciete verblijfsdag of kies een verder gelegen echte overnachtingsregio.'};
    if(kind==='over-daily-leg'){const roadLimit=fraction(p[2]);return{code,reason:`Dag ${p[1]} is ongeveer ${roadLimit[0]||'?'} km terwijl de berekende daglimiet voor ${vehicle} circa ${roadLimit[1]||maxLeg} km is bij ${one(trip.maxDrive)} uur maximale rijtijd.`,suggestion:'Verkort deze etappe, voeg een transitnacht toe of verhoog de dagelijkse rijtijd.'}};
    if(kind==='unresolved-stop')return{code,reason:`Overnachtings-/routepunt op dag ${p[1]} kon niet aan een echte plaats op land worden gekoppeld.`,suggestion:'Voer de live plaatsresolutie opnieuw uit of kies een nabijgelegen gevalideerde plaats.'};
    if(kind==='unjustified-repeat')return{code,reason:`Dag ${p[1]} herhaalt dezelfde overnachtingsplaats zonder dat de dag als geplande verblijfsdag is gemarkeerd.`,suggestion:'Markeer dit als verblijfsdag of kies een andere overnachtingsplaats.'};
    if(kind==='too-many-repeat-nights')return{code,reason:`De route bevat ${fraction(p[1])[0]||'?'} herhaalde nachten terwijl maximaal ${fraction(p[1])[1]||'?'} binnen deze routeopbouw zijn toegestaan.`,suggestion:'Verdeel de nachten over meer echte regio’s of pas de routeopbouw aan.'};
    if(kind==='distinct-overnights')return{code,reason:`De route bevat ${fraction(p[1])[0]||'?'} verschillende overnachtingsregio’s terwijl minimaal ${fraction(p[1])[1]||'?'} nodig zijn voor deze roadtrip.`,suggestion:'Voeg een extra echte overnachtingsregio toe.'};
    if(kind==='too-many-changes')return{code,reason:`De route vraagt ${fraction(p[1])[0]||'?'} accommodatiewissels terwijl je maximum ${fraction(p[1])[1]||maxChanges} is.`,suggestion:'Verminder het aantal verblijfplaatsen of verhoog het maximum aantal wissels.'};
    if(code==='base-not-visited')return{code,reason:'De gegenereerde basisreis bezoekt de geselecteerde centrale uitvalsbasis nergens in het dagplan.',suggestion:'Herbouw de basisroute rond de geselecteerde uitvalsbasis.'};
    if(code==='does-not-return-origin')return{code,reason:`De ingestelde route is geen open-einde reis, maar de laatste dag eindigt niet terug in ${trip.origin}.`,suggestion:'Voeg de ontbrekende terugrit toe of kies expliciet een open-einde route.'};
    if(code==='open-ended-no-progression')return{code,reason:`De open-einde route eindigt minder dan ${ROADTRIP_POLICY.minRoadMoveKm} km van het vertrekpunt en maakt daardoor geen echte geografische voortgang.`,suggestion:'Kies een verder eindpunt voor de laatste etappe.'};
    return{code,reason:`De routevalidator blokkeerde het plan met code “${code}”${violations.length>1?` en daarnaast: ${violations.slice(1).join(', ')}`:''}.`,suggestion:'Deze validatorcode is niet aan een normale gebruikersbeperking gekoppeld en moet als interne planningsfout worden onderzocht.'};
  }

  function roadtripIntentReportTemplate(trip,plan){
    const r=validateRoadtrip(trip,plan);
    if(r.valid)return{valid:true,moved:r.moves?.filter(x=>x>=ROADTRIP_POLICY.minRoadMoveKm).length||0,intentionalStays:(plan?.days||[]).filter(x=>x.intentionalStay).length,illegalShortMove:0,reason:'roadtrip-ok',code:'roadtrip-ok',suggestion:''};
    const diagnostic=exactTripFailureDiagnostic(trip,plan);
    return{valid:false,moved:r.moves?.filter(x=>x>=ROADTRIP_POLICY.minRoadMoveKm).length||0,intentionalStays:(plan?.days||[]).filter(x=>x.intentionalStay).length,illegalShortMove:r.violations?.filter(x=>x.startsWith('short-move')).length||0,...diagnostic};
  }

  const FAILURE_DIAGNOSTIC_REPLACEMENT=exactTripFailureDiagnosticTemplate.toString().replace('exactTripFailureDiagnosticTemplate','exactTripFailureDiagnostic')+'\n'+roadtripIntentReportTemplate.toString().replace('roadtripIntentReportTemplate','roadtripIntentReport');

  function replaceFailureDiagnostic(text){
    const pattern=/function roadtripIntentReport\(trip,plan\)\{[\s\S]*?\}\nfunction tourDay/;
    if(pattern.test(text))text=text.replace(pattern,`${FAILURE_DIAGNOSTIC_REPLACEMENT}\nfunction tourDay`);
    const oldMessage="showError(`Nog geen geldige ${state.trip.days}-daagse roadtrip gevonden (${roadtripCheck.reason}). ReisSlim toont geen kunstmatige stadsroute; zoek opnieuw voor extra echte overnachtingsregio’s.`);\n    setStatus('Meer echte overnachtingsregio’s nodig');";
    const newMessage="showError(`Reisplan kan niet worden gegenereerd. Exacte reden: ${roadtripCheck.reason} ${roadtripCheck.suggestion?`Wat nodig is: ${roadtripCheck.suggestion}`:''} [${roadtripCheck.code||'onbekende-code'}]`);\n    setStatus(`Niet gegenereerd · ${roadtripCheck.code||'onbekende oorzaak'}`);";
    if(text.includes(oldMessage))text=text.replace(oldMessage,newMessage);
    else text=text.replace(/showError\(`Nog geen geldige \$\{state\.trip\.days\}-daagse roadtrip gevonden \(\$\{roadtripCheck\.reason\}\)\.[\s\S]*?`\);\s*setStatus\('[^']*'\);/,newMessage);
    return text
  }

  function repairAppContract(source){
    let text=String(source||'');
    text=injectCalculatePlan(text);
    text=replaceRestorePath(text);
    text=replaceCandidateDedupe(text);
    text=injectBaseSkeletonImport(text);
    text=replaceBaseProgression(text);
    text=expandBaseFailureMessages(text);
    text=replaceFailureDiagnostic(text);
    return text;
  }

  root.ReisSlimRuntimeRepair1950=Object.freeze({repairAppContract});
})(typeof self!=='undefined'?self:globalThis);
