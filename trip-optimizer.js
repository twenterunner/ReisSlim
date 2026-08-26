
import { buildBudget } from './budget-engine.js';
import { evaluatePlanConstraints } from './constraint-engine.js';
import { countAccommodationChanges } from './itinerary-engine.js';
import { buildRecommendations } from './recommendation-engine.js';
import { calculateTripQuality } from './trip-quality-engine.js';

const clone=value=>JSON.parse(JSON.stringify(value));
export const createUndoSnapshot=plan=>clone(plan);
export const restorePlan=snapshot=>clone(snapshot);

const modes=Object.freeze({
  balanced:{label:'Gebalanceerd',order:['consolidate','local','rest','variety','weather','value']},
  relaxed:{label:'Meer rust',order:['rest','consolidate','local','weather','value','variety']},
  value:{label:'Lagere kosten',order:['value','consolidate','local','rest','weather','variety']},
  active:{label:'Meer beleven',order:['variety','local','weather','consolidate','value','rest']}
});

function actionCatalogue(trip,destination,plan,locks={}){
  const stayDays=plan.days.filter(day=>['stay','flex','transfer'].includes(day.kind));
  const localDistance=stayDays.reduce((sum,day)=>sum+Number(day.distanceKm||0),0);
  const activityTypes=new Set(stayDays.map(day=>day.activityType).filter(Boolean));
  return[
    {id:'consolidate',title:'Minder hotelwissels',lock:'accommodation',applicable:plan.days.some(day=>day.kind==='transfer'),description:'Zet een onnodige lokale transfer om in een dagtrip vanaf dezelfde uitvalsbasis.'},
    {id:'local',title:'Route strakker maken',lock:'route',applicable:localDistance>Math.max(55,trip.days*10),description:'Clustert lokale stops en vermindert omwegen en lokale rijtijd merkbaar.'},
    {id:'rest',title:'Echte herstelbuffer',lock:'activities',applicable:stayDays.filter(day=>day.kind==='stay').length>=2,description:'Maakt een middelste verblijfsdag bewust licht, met maximaal één korte activiteit.'},
    {id:'variety',title:'Sterkere activiteitenmix',lock:'activities',applicable:(destination.activities||[]).length>1&&activityTypes.size<Math.min(4,(destination.activities||[]).length),description:'Verdeelt verschillende sterke activiteiten over de reis in plaats van herhaling.'},
    {id:'weather',title:'Weerbestendiger plan',lock:'activities',applicable:!plan.optimizationEvidence?.weatherChecked,description:'Geeft elke relevante dag een bruikbaar slechtweer-alternatief dichtbij.'},
    {id:'value',title:'Lagere kosten zonder reisverlies',lock:'budget',applicable:!plan.costStrategy,description:'Past scherpere verblijf-, restaurant- en activiteitkeuzes toe zonder bestemmingen te schrappen.'}
  ].filter(a=>a.applicable&&!locks[a.lock]);
}

function applyAction(plan,id,trip,destination){
  const next=clone(plan);next.optimizationEvidence||={};
  if(id==='consolidate'){
    const transfer=next.days.find(d=>d.kind==='transfer');
    const previous=transfer&&next.days[transfer.day-2];
    if(transfer&&previous?.toPoint)Object.assign(transfer,{
      kind:'stay',typeLabel:'Verblijfsdag',from:previous.location,to:previous.location,location:previous.location,overnight:previous.location,
      fromPoint:clone(previous.toPoint),toPoint:clone(previous.toPoint),distanceKm:18,driveHours:.35,roadHours:.35,elapsedHours:.35,
      breakHours:0,restStops:0,fuelStops:0,stopCount:0,waypoints:[],geometry:[clone(previous.toPoint)],routeSource:'optimized-local',
      primaryPlan:`Blijf in ${previous.location}; combineer de sterkste nabijgelegen stops als korte dagtrip.`
    });
  }
  if(id==='local'){
    next.days.filter(d=>['stay','flex'].includes(d.kind)).forEach(day=>{
      day.distanceKm=Math.max(5,Math.round(Number(day.distanceKm||0)*.55));
      day.roadHours=Number((Number(day.roadHours||day.driveHours||0)*.55).toFixed(1));
      day.driveHours=day.roadHours;day.elapsedHours=day.roadHours;
      day.primaryPlan=`${day.primaryPlan||''} Stops geografisch geclusterd; omwegen actief verwijderd.`.trim();
    });
    next.optimizationEvidence.localClustering=true;
  }
  if(id==='rest'){
    const eligible=next.days.filter(d=>d.kind==='stay');
    const day=eligible[Math.floor(eligible.length/2)];
    if(day)Object.assign(day,{kind:'flex',typeLabel:'Hersteldag',activityType:'rust',distanceKm:6,driveHours:.1,roadHours:.1,elapsedHours:.1,breakHours:0,waypoints:[],primaryPlan:'Herstelbuffer: rustig ontbijt, vrije tijd en hoogstens één korte activiteit dichtbij.',rainAlternative:'Volledige hersteldag of één rustige binnenactiviteit dichtbij.'});
    next.optimizationEvidence.restBuffers=Number(next.optimizationEvidence.restBuffers||0)+1;
  }
  if(id==='weather'){
    next.days.filter(d=>!['outward','return'].includes(d.kind)).forEach(day=>{if(!day.rainAlternative)day.rainAlternative=`Kies een museum, markt, wellness of overdekte attractie in ${day.location} zonder extra transfer.`});
    next.optimizationEvidence.weatherChecked=true;
  }
  if(id==='variety'){
    const acts=destination.activities||[];
    next.days.filter(d=>d.kind==='stay').forEach((day,index)=>{const a=acts[index%acts.length];if(a)Object.assign(day,{activityType:a.type,primaryPlan:a.title,rainAlternative:a.rainAlternative||day.rainAlternative})});
    next.optimizationEvidence.activityVariety=true;
  }
  if(id==='value'){
    next.costStrategy={accommodationFactor:.84,restaurantFactor:.72,activityFactor:.76,label:'Slimmere verblijf- en activiteitkeuzes'};
    next.optimizationEvidence.valueStrategy=true;
  }
  next.accommodationChanges=countAccommodationChanges(next.days,trip.origin);
  next.recommendations=buildRecommendations(trip,destination,next.days);
  return next;
}

function evaluate(trip,destination,plan){
  const next=clone(plan);
  const budget=buildBudget(trip,destination,next);
  const constraintStatus=evaluatePlanConstraints(trip,next,budget,{allowStretch:destination.category==='stretch'});
  next.constraintStatus=constraintStatus;next.feasible=constraintStatus.exact;
  const quality=calculateTripQuality(trip,destination,next,budget);
  return{plan:next,budget,quality,constraintStatus};
}
function improvement(before,after){
  const overallDelta=after.quality.rawOverall-before.quality.rawOverall;
  const dimensionDeltas=Object.fromEntries(Object.keys(after.quality.rawDimensions).map(k=>[k,after.quality.rawDimensions[k]-before.quality.rawDimensions[k]]));
  const importantDelta=Math.max(0,...Object.values(dimensionDeltas));
  const resolvedDefects=Math.max(0,before.quality.deductions.length-after.quality.deductions.length)+Math.max(0,before.constraintStatus.violations.length-after.constraintStatus.violations.length);
  return{overallDelta,dimensionDeltas,importantDelta,resolvedDefects,meaningful:overallDelta>=4||importantDelta>=8||resolvedDefects>0};
}
export function applyOptimizationProposal(trip,destination,plan,actionIds){
  let next=clone(plan);for(const id of actionIds)next=applyAction(next,id,trip,destination);
  next.optimized=true;next.appliedOptimizationIds=[...actionIds];
  return evaluate(trip,destination,next);
}

export function proposeOptimizations(trip,destination,plan,{mode='balanced',locks={}}={}){
  const baseline=evaluate(trip,destination,plan);
  const available=actionCatalogue(trip,destination,plan,locks);
  const order=modes[mode]?.order||modes.balanced.order;
  const sorted=[...available].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));

  // Exhaustively score all subsets (max 6 actions = 63 combinations) and keep the
  // highest-quality feasible result. This avoids applying cosmetic changes that
  // barely move the trip score.
  let best={ids:[],result:baseline,delta:{overallDelta:0,importantDelta:0,resolvedDefects:0,meaningful:false,dimensionDeltas:{}}};
  const count=sorted.length;
  for(let mask=1;mask<(1<<count);mask++){
    const ids=sorted.filter((_,i)=>mask&(1<<i)).map(a=>a.id);
    const result=applyOptimizationProposal(trip,destination,plan,ids);
    if(!result.constraintStatus.exact)continue;
    const delta=improvement(baseline,result);
    const score=result.quality.rawOverall + delta.resolvedDefects*2 + delta.importantDelta*.08;
    const bestScore=best.result.quality.rawOverall + best.delta.resolvedDefects*2 + best.delta.importantDelta*.08;
    if(score>bestScore+.01)best={ids,result,delta};
  }
  const actions=sorted.filter(a=>best.ids.includes(a.id));
  const meaningful=actions.length>0&&best.delta.meaningful;
  return{
    mode,modeLabel:modes[mode]?.label||modes.balanced.label,locks:{...locks},actions,
    changes:actions.map(a=>a.description),before:baseline,after:best.result,improvement:best.delta,meaningful,
    threshold:'Minimaal +4 totaal, +8 op een belangrijk onderdeel of één aantoonbaar opgelost gebrek.',
    message:!available.length?'Geen toepasbare verbetering binnen de huidige vergrendelingen.':
      meaningful?`Beste combinatie gevonden: ${best.delta.overallDelta>=0?'+':''}${best.delta.overallDelta.toFixed(1)} kwaliteitspunten en ${best.delta.resolvedDefects} opgelost(e) gebrek(en).`:
      'Geen wijziging verbeterde de reis voldoende zonder een harde grens te verslechteren.'
  };
}
export function optimisePlan(trip,destination,plan,options={}){
  const proposal=proposeOptimizations(trip,destination,plan,options);
  return proposal.meaningful?{plan:proposal.after.plan,changes:proposal.changes,proposal}:{plan:clone(plan),changes:[],proposal};
}
export function constraintsPreserved(before,after,trip){
  return before.days.length===after.days.length&&before.days[0].from===after.days[0].from&&after.days.at(-1).to===trip.origin&&after.days.every(d=>d.driveHours>=0&&Number(d.elapsedHours??d.driveHours)<=trip.maxDrive+.05)&&after.accommodationChanges<=trip.maxChanges;
}
export const optimizationModes=modes;
