import { vehicleProfiles } from './config.js';
import { createCanonicalPlan } from './canonical-plan-engine.js';
import { validateCanonicalPlan } from './validator.js';
import { haversineKm } from './travel-data.js';

const PREF_TAGS=Object.freeze({
  natuur:['nature','wilderness','wildlife','waterfalls','wetlands','river'],
  bergen:['mountains','hills','canyon'],
  zwemmen:['lakes','lake','coast','water'],
  wandelen:['hiking','nature','mountains','hills'],
  kinderen:['nature','lakes','coast','culture'],
  motor:['motorcycle','mountains','hills','scenic','gravel'],
  cultuur:['culture','history','castles'],
  eten:['food'],
  kust:['coast','islands','water'],
  budget:['nature','hiking','river']
});
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const round=v=>Math.round(Number(v)||0);

function tagSet(summary){return new Set((summary.tags||[]).map(x=>String(x).toLowerCase()))}
function preferenceFit(trip,summary){
  const tags=tagSet(summary),weights=trip.preferenceWeights||{};let earned=0,total=0,matches=[];
  for(const [pref,aliases] of Object.entries(PREF_TAGS)){
    const w=Number(weights[pref]||0);if(w<=0)continue;total+=w;
    if(aliases.some(a=>tags.has(a))){earned+=w;matches.push(pref)}
  }
  return{score:total?clamp(100*earned/total):70,matches};
}
function roughDriveHours(trip,origin,summary){
  const p=vehicleProfiles[trip.transport]||vehicleProfiles.car;const km=haversineKm(origin,summary.anchor)*p.roadFactor;const road=km/Math.max(30,p.roadSpeed);const breaks=Math.floor(Math.max(0,road-.01)/p.breakEveryHours)*(p.breakMinutes/60);return{km,driveHours:road+breaks};
}
function preScore(trip,origin,summary){
  const pref=preferenceFit(trip,summary),rough=roughDriveHours(trip,origin,summary),profile=vehicleProfiles[trip.transport]||vehicleProfiles.car;
  const maxOutboundDays=trip.routeTopology==='open-ended'?Math.max(1,trip.days):Math.max(1,Math.floor(trip.days/2));
  const capacity=Math.max(.5,trip.maxDrive*maxOutboundDays),reach=clamp(100*(1-rough.driveHours/(capacity*1.35)));
  const vehicle=clamp(100*Number(summary.vehicleSuitability?.[trip.transport]??1));
  const roadBonus=trip.routeStyle==='scenic'&&summary.tags?.includes('motorcycle')?100:trip.routeStyle==='fastest'?70:80;
  return{score:pref.score*.48+reach*.27+vehicle*.15+roadBonus*.10,pref,rough,profile};
}
function scoreExact(trip,summary,plan,pref){
  const maxDay=Math.max(...plan.days.map(d=>Number(d.driveHours)||0),0),driveRatio=maxDay/Math.max(.5,trip.maxDrive),travel=clamp(100-Math.abs(driveRatio-.62)*90);
  const budgetRatio=plan.budget.total/Math.max(1,trip.budget),budget=clamp(110-budgetRatio*55);
  const vehicle=clamp(100*Number(summary.vehicleSuitability?.[trip.transport]??1));
  const scenicTags=tagSet(summary),scenery=clamp(45+(scenicTags.has('nature')?20:0)+(scenicTags.has('mountains')?15:0)+(scenicTags.has('coast')?12:0)+(scenicTags.has('motorcycle')&&trip.transport==='motorcycle'?15:0));
  const destinationDays=plan.days.filter(d=>d.canonicalRegionId===summary.id).length,experience=clamp(35+65*destinationDays/Math.max(1,trip.days));
  const score=round(pref.score*.32+travel*.18+budget*.15+vehicle*.10+scenery*.13+experience*.12);
  return{score,dimensions:{preferences:round(pref.score),travel:round(travel),budget:round(budget),vehicle:round(vehicle),scenery:round(scenery),experience:round(experience)},maxDayDrive:maxDay,destinationDays};
}
function reasonText(candidate){
  const m=candidate.matches||[],parts=[];
  if(m.length)parts.push(`sterke match op ${m.slice(0,3).join(', ')}`);
  if(candidate.dimensions.travel>=80)parts.push('goede verhouding tussen reistijd en verblijftijd');
  if(candidate.dimensions.scenery>=80)parts.push('sterk landschaps- en routekarakter');
  if(candidate.dimensions.budget>=80)parts.push('ruim binnen de budgetraming');
  return parts.length?parts.join(' · '):'gebalanceerde match met je reisinstellingen';
}
function diversify(rows,limit){
  const selected=[],countryCount=new Map();
  for(const row of rows){
    if(selected.length>=limit)break;const cc=countryCount.get(row.countryCode)||0;if(cc>=2)continue;
    const tooClose=selected.some(s=>s.countryCode===row.countryCode&&haversineKm(s.anchor,row.anchor)<120);if(tooClose)continue;
    selected.push(row);countryCount.set(row.countryCode,cc+1);
  }
  for(const row of rows){if(selected.length>=limit)break;if(!selected.some(s=>s.id===row.id))selected.push(row)}
  return selected;
}

export async function discoverDestinations(trip,data,{limit=6,prefilter=36}={}){
  const origin=data.resolveOrigin(trip.origin);if(!origin)return{ok:false,failure:{code:'ORIGIN_NOT_IN_OFFLINE_CATALOG',reason:'Vertrekpunt kon offline niet betrouwbaar worden herleid.',constraint:'origin',actual:trip.origin,permitted:'offline known place or lat,lon',possibleSolutions:['Kies een bekende plaats uit de offline catalogus.']}};
  const ranked=(data.index?.regions||[]).map(summary=>({summary,...preScore(trip,origin,summary)})).sort((a,b)=>b.score-a.score).slice(0,prefilter);
  const exact=[];
  for(const row of ranked){
    const region=await data.getRegion(row.summary.id);if(!region)continue;
    const result=createCanonicalPlan({...trip,destinationQuery:row.summary.name},region,data);if(!result.ok)continue;
    const validation=validateCanonicalPlan(result.plan);if(!validation.valid)continue;
    const exactScore=scoreExact(trip,row.summary,result.plan,row.pref);
    exact.push({...row.summary,...exactScore,matches:row.pref.matches,estimate:result.plan.budget.total,totalDistanceKm:result.plan.budget.distanceKm,changes:result.plan.accommodationChanges,plan:result.plan,reason:reasonText({...exactScore,matches:row.pref.matches}),roughDistanceKm:round(row.rough.km)});
  }
  exact.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  const shortlist=diversify(exact,limit).map((x,i)=>({...x,rank:i+1}));
  if(!shortlist.length)return{ok:false,failure:{code:'NO_FEASIBLE_DESTINATIONS',reason:'Geen offline bestemming kon met de huidige harde reisgrenzen een geldig CanonicalPlan opleveren.',constraint:'trip constraints',actual:{days:trip.days,maxDrive:trip.maxDrive,budget:trip.budget,maxChanges:trip.maxChanges},permitted:'at least one feasible destination',possibleSolutions:['Voeg reisdagen toe.','Verhoog maximale reistijd per dag.','Verruim budget of accommodatiewissels.']}};
  return{ok:true,origin,shortlist,evaluated:ranked.length};
}
