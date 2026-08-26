import { clamp, roundScore } from './config.js';
import { buildBudget } from './budget-engine.js';
import { calculateRouteMetrics, haversineKm } from './route-engine.js';
import { estimateLegTiming, transportId } from './vehicle-intelligence.js';
import { STRETCH_LIMITS, closestAdjustments, evaluateDestinationConstraints } from './constraint-engine.js';
import { resolveOrigin } from './trip-model.js';

const tagScore=(destination,tag,matched=90,unmatched=45)=>destination.tags?.includes(tag)?matched:unmatched;
function preferenceScore(trip,destination){
  if(!trip.preferences.length)return{score:55,matches:[],coverage:0,essentialMisses:[]};
  const possible=trip.preferences.reduce((sum,id)=>sum+(trip.preferenceWeights[id]||2),0);
  const matches=trip.preferences.filter(id=>destination.tags?.includes(id));
  const matched=matches.reduce((sum,id)=>sum+(trip.preferenceWeights[id]||2),0);
  const essentialMisses=trip.preferences.filter(id=>(trip.preferenceWeights[id]||2)>=3&&!destination.tags?.includes(id));
  const coverage=matched/Math.max(1,possible);
  // Selected preferences must materially reorder proposals.
  const score=roundScore(10+90*coverage-Math.min(25,essentialMisses.length*15));
  return{score,matches,coverage,essentialMisses}
}
function budgetScore(total,budget){const ratio=total/Math.max(1,budget);if(ratio<=.9)return 100;return roundScore(100-(ratio-.9)*150)}
function destinationIntentScore(trip,destination){const query=String(trip.destinationQuery||'').trim().toLocaleLowerCase('nl-NL');if(!query||['verras me','overal','wereldwijd'].includes(query))return 0;const words=query.split(/\s+/).filter(word=>word.length>2),haystack=[destination.name,destination.country,destination.summary,...(destination.tags||[])].join(' ').toLocaleLowerCase('nl-NL'),matches=words.filter(word=>haystack.includes(word)).length;return matches?Math.min(30,18+matches*6):-12}
function roadReachStatus(trip,destination){
  const origin=resolveOrigin(trip),point=destination.bases?.[0];if(!origin||!point)return{ok:true};
  const straight=haversineKm(origin,point);if(!Number.isFinite(straight))return{ok:true};
  const outboundDays=Math.max(1,Math.floor((trip.days-1)/2));
  const productiveSpeed=trip.transport==='motorcycle'?72:trip.transport==='caravan'?62:trip.transport==='motorhome'?66:78;
  const roadReach=trip.maxDrive*productiveSpeed*outboundDays;
  const estimatedRoad=straight*1.18;
  return{ok:estimatedRoad<=roadReach*1.12,estimatedRoad,roadReach}
}
export function scoreDestination(trip,destination){
  const month=new Date(`${trip.startDate}T12:00:00`).getMonth()+1,route=calculateRouteMetrics(trip,destination);
  const relaxedRoute=route.requiredLegs*2+1>trip.days?calculateRouteMetrics({...trip,maxDrive:trip.maxDrive+STRETCH_LIMITS.maxDriveHours},destination):route;
  const budget=buildBudget(trip,destination),preference=preferenceScore(trip,destination),season=destination.season?.includes(month)?90:40,vehicle=transportId(trip.transport);
  const transport=vehicle==='motorcycle'?destination.motorcycle*10:['motorhome','caravan'].includes(vehicle)?destination.camper*10:destination.family*10;
  const constraintStatus=evaluateDestinationConstraints(trip,{route,relaxedRoute,budget});
  const road=roadReachStatus(trip,destination);
  if(!road.ok){
    constraintStatus.violations.push({key:'road-reach',label:'Roadtripbereik',actual:Math.round(road.estimatedRoad),limit:Math.round(road.roadReach),detail:`${destination.name} ligt buiten het realistische heen-en-terug roadtripbereik voor ${trip.days} dagen en maximaal ${trip.maxDrive} uur rijden per dag.`,adjustment:'Kies een dichterbij gelegen bestemming, meer reisdagen of een hogere daglimiet.',stretchable:false,severity:1});
    Object.assign(constraintStatus,{category:'rejected',exact:false,stretch:false,selectable:false,summary:constraintStatus.violations.map(item=>item.detail).join(' ')})
  }
  const minimumDays=constraintStatus.minimumDays,driving=roundScore(100-Math.max(0,route.requiredLegs-1)*15-Math.max(0,minimumDays-trip.days)*15),budgetFit=budgetScore(budget.total,trip.budget);
  const dimensions={budget:budgetFit,driving,season,transport,family:destination.family*10,motorcycle:destination.motorcycle*10,camper:destination.camper*10,
    scenery:roundScore((tagScore(destination,'natuur')+tagScore(destination,'bergen')+tagScore(destination,'kust'))/3),
    walking:tagScore(destination,'wandelen'),swimming:tagScore(destination,'zwemmen'),food:tagScore(destination,'eten',90,55),culture:tagScore(destination,'cultuur',90,50),crowds:destination.crowds*10};
  const intentScore=destinationIntentScore(trip,destination);
  // Explicit preferences are dominant; operational feasibility remains decisive via category filtering.
  const score=roundScore(preference.score*.56+budgetFit*.12+season*.09+transport*.11+driving*.12+intentScore);
  const compromises=[...constraintStatus.violations.map(item=>item.detail)];
  if(preference.essentialMisses.length)compromises.push(`Mist essentiële voorkeur(en): ${preference.essentialMisses.join(', ')}.`);
  if(season<60)compromises.push('De reis valt buiten de voorkeursmaanden in de offline bestemmingdata.');
  const confidence=route.originKnown?(destination.routeStops?.length>=route.requiredLegs-1?'redelijk':'beperkt'):'beperkt';
  const matchLabels=preference.matches.length?preference.matches.slice(0,4).join(', '):'geen geselecteerde voorkeur';
  return{...destination,score,dimensions,estimate:budget.total,budget,route,matches:preference.matches,preferenceCoverage:preference.coverage,essentialMisses:preference.essentialMisses,
    intentMatch:intentScore>0,minimumDays,feasible:constraintStatus.exact,category:constraintStatus.category,constraintStatus,confidence,compromises,
    explanation:constraintStatus.exact?`Matcht ${Math.round(preference.coverage*100)}% van je gewogen voorkeuren (${matchLabels}) en past binnen de roadtripvoorwaarden.`:`Past inhoudelijk deels, maar overschrijdt een harde roadtripvoorwaarde.`}
}
const byMatch=(a,b)=>Number(b.intentMatch)-Number(a.intentMatch)||b.preferenceCoverage-a.preferenceCoverage||b.score-a.score||a.estimate-b.estimate||a.name.localeCompare(b.name,'nl');
export function rankDestinationGroups(trip,destinationList){
  const scored=destinationList.map(destination=>scoreDestination(trip,destination));
  const exact=scored.filter(item=>item.category==='exact').sort(byMatch);
  const stretched=scored.filter(item=>item.category==='stretch').sort((a,b)=>a.constraintStatus.stretchPenalty-b.constraintStatus.stretchPenalty||byMatch(a,b)).slice(0,STRETCH_LIMITS.visibleProposals);
  const rejected=scored.filter(item=>item.category==='rejected').sort((a,b)=>a.constraintStatus.violations.length-b.constraintStatus.violations.length||byMatch(a,b));
  return{exact,stretched,rejected,visible:[...exact,...stretched],closestAdjustments:closestAdjustments(rejected)}
}
export function rankDestinations(trip,destinationList){return rankDestinationGroups(trip,destinationList).visible}
export const scoreInRange=score=>clamp(score)===score;
