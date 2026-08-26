import { clamp, roundScore } from './config.js';
import { buildBudget } from './budget-engine.js';
import { calculateRouteMetrics, haversineKm } from './route-engine.js';
import { transportId } from './vehicle-intelligence.js';
import { STRETCH_LIMITS, closestAdjustments, evaluateDestinationConstraints } from './constraint-engine.js';
import { resolveOrigin } from './trip-model.js';

const prefReason={natuur:'natuurgebieden en landschappelijke stops',bergen:'bergachtig terrein en hoogteverschil',zwemmen:'water- of zwemmogelijkheden',wandelen:'wandel- en natuurmogelijkheden',kinderen:'gezinsvriendelijke kenmerken',motor:'landschappelijke/bochtige wegpotentie',cultuur:'steden, erfgoed of culturele bezienswaardigheden',eten:'horeca en lokale eetmogelijkheden',kust:'kust- of waterlandschap',budget:'relatief gunstige kosten'};
const tagScore=(destination,tag,matched=90,unmatched=45)=>destination.tags?.includes(tag)?matched:unmatched;

const prefLabel={natuur:'natuur',bergen:'bergen',zwemmen:'zwemmen',wandelen:'wandelen',kinderen:'gezinsvriendelijkheid',motor:'mooie wegen',cultuur:'cultuur',eten:'eten',kust:'kust',budget:'budget'};
const knownHighlights=[
  ['Harz','dichte bossen, het Brocken-massief en bochtige wegen rond de bergdorpen'],
  ['Dinant','de Maasvallei, de citadel en directe toegang tot de Ardennen'],
  ['Dolomieten','spectaculaire bergpassen, scherpe rotsmassieven en sterke wandelmogelijkheden'],
  ['Salzburg','Alpenlandschap, historische stadskern en bergwegen in meerdere richtingen'],
  ['Annecy','het meer van Annecy, Alpenpassen en een compacte historische stad'],
  ['Bled','het meer van Bled, de Julische Alpen en korte verbindingen naar bergwegen'],
  ['Interlaken','meren, hoog-Alpiene panorama’s en toegang tot meerdere bergdalen'],
  ['Ribe','een historische Deense stad en de Waddenzeekust'],
  ['Vianden','kasteel, rivierdal en bochtige Luxemburgse binnenwegen'],
  ['Maastricht','historische binnenstad, heuvelachtig Zuid-Limburg en Bourgondisch eten'],
  ['Hoge Tatra','compact hooggebergte, wandelroutes en panoramische bergwegen'],
  ['Brasov','Karpaten, historische stad en bergpassen richting Transsylvanië'],
  ['Kotor','Baai van Kotor, steile bergen en spectaculaire kust-/bergwegen'],
  ['Bled','meer, bergen en compacte dagtochten in de Julische Alpen']
];
function destinationHighlight(destination){
  const name=String(destination.name||'').replace(/\s*&\s*omgeving$/i,'');
  const known=knownHighlights.find(([key])=>name.toLocaleLowerCase('nl-NL').includes(key.toLocaleLowerCase('nl-NL')));
  if(known)return known[1];
  const parts=[];
  if(destination.tags?.includes('bergen'))parts.push('berglandschap');
  if(destination.tags?.includes('natuur'))parts.push('natuur');
  if(destination.tags?.includes('motor'))parts.push('mooie/bochtige wegen');
  if(destination.tags?.includes('wandelen'))parts.push('wandelmogelijkheden');
  if(destination.tags?.includes('cultuur'))parts.push('cultuur en erfgoed');
  if(destination.tags?.includes('eten'))parts.push('lokale eetmogelijkheden');
  if(destination.tags?.includes('kust'))parts.push('kust- of waterlandschap');
  return parts.slice(0,3).join(', ')||'een afwisselend roadtripprofiel';
}
function proposalStory(trip,destination,preference,route,budgetMargin,constraintStatus){
  const matched=preference.matches.map(id=>prefLabel[id]||id);
  const matchText=matched.length?matched.slice(0,4).join(', '):'je algemene roadtripvoorwaarden';
  const stages=Math.max(1,route.requiredLegs||1);
  const distance=Math.round(route.oneWayDistanceKm||destination.distanceKm||0);
  const vehicle=trip.transport==='motorcycle'?'motortrip':trip.transport==='motorhome'?'campertrip':trip.transport==='caravan'?'caravanroadtrip':'roadtrip';
  const highlight=destinationHighlight(destination);
  if(!constraintStatus.exact)return `${destination.name} heeft inhoudelijk veel potentie — vooral ${highlight} — maar past nu niet volledig binnen je harde grenzen.`;
  const margin=budgetMargin>=300?` Je houdt naar schatting circa €${Math.round(budgetMargin/50)*50} budgetmarge over.`:'';
  return `${destination.name} is een sterke ${vehicle}: ${highlight}. Het sluit direct aan op ${matchText}. Vanaf ${trip.origin} is het circa ${distance} km enkele reis, verdeeld over ${stages} reis${stages===1?'etappe':'etappes'}.${margin}`;
}

function preferenceScore(trip,destination){
  if(!trip.preferences.length)return{score:55,matches:[],coverage:0,essentialMisses:[],reasons:[],purity:0};
  const possible=trip.preferences.reduce((sum,id)=>sum+(trip.preferenceWeights[id]||2),0);
  const matches=trip.preferences.filter(id=>destination.tags?.includes(id));
  const matched=matches.reduce((sum,id)=>sum+(trip.preferenceWeights[id]||2),0);
  const essentialMisses=trip.preferences.filter(id=>(trip.preferenceWeights[id]||2)>=3&&!destination.tags?.includes(id));
  const coverage=matched/Math.max(1,possible);

  // Preference purity makes a narrow request visibly different from a broad one.
  // Example: with only 'cultuur' selected, a culture-focused city outranks a
  // generic mixed destination carrying many unrelated tags.
  const relevantTags=(destination.tags||[]).filter(tag=>['natuur','bergen','zwemmen','wandelen','kinderen','motor','cultuur','eten','kust','budget'].includes(tag));
  const selectedSet=new Set(trip.preferences);
  const matchedRelevant=relevantTags.filter(tag=>selectedSet.has(tag)).length;
  const purity=relevantTags.length?matchedRelevant/relevantTags.length:0;

  const score=roundScore(
    5
    + 78*coverage
    + 17*purity
    - Math.min(35,essentialMisses.length*20)
  );
  const reasons=matches.map(id=>`${id}: ${prefReason[id]||'relevante kenmerken'}`);
  return{score,matches,coverage,essentialMisses,reasons,purity}
}
function budgetScore(total,budget){const ratio=total/Math.max(1,budget);if(ratio<=.9)return 100;return roundScore(100-(ratio-.9)*150)}
function destinationIntentScore(trip,destination){const query=String(trip.destinationQuery||'').trim().toLocaleLowerCase('nl-NL');if(!query)return 0;const words=query.split(/\s+/).filter(word=>word.length>2),haystack=[destination.name,destination.country,destination.summary,...(destination.tags||[])].join(' ').toLocaleLowerCase('nl-NL'),matches=words.filter(word=>haystack.includes(word)).length;return matches?Math.min(30,18+matches*6):-12}
function roadReachStatus(trip,destination){const origin=resolveOrigin(trip),point=destination.bases?.[0];if(!origin||!point)return{ok:true};const straight=haversineKm(origin,point);if(!Number.isFinite(straight))return{ok:true};const outboundDays=trip.routeTopology==='open-ended'?Math.max(1,trip.days-1):Math.max(1,Math.floor((trip.days-1)/2)),speed=trip.transport==='motorcycle'?72:trip.transport==='caravan'?62:trip.transport==='motorhome'?66:78,roadReach=trip.maxDrive*speed*outboundDays,estimatedRoad=straight*1.18;return{ok:estimatedRoad<=roadReach*1.12,estimatedRoad,roadReach}}
export function scoreDestination(trip,destination){const month=new Date(`${trip.startDate}T12:00:00`).getMonth()+1,route=calculateRouteMetrics(trip,destination),relaxedRoute=route.requiredLegs*2+1>trip.days?calculateRouteMetrics({...trip,maxDrive:trip.maxDrive+STRETCH_LIMITS.maxDriveHours},destination):route,budget=buildBudget(trip,destination),preference=preferenceScore(trip,destination),season=destination.season?.includes(month)?90:40,vehicle=transportId(trip.transport),transport=vehicle==='motorcycle'?destination.motorcycle*10:['motorhome','caravan'].includes(vehicle)?destination.camper*10:destination.family*10,constraintStatus=evaluateDestinationConstraints(trip,{route,relaxedRoute,budget}),road=roadReachStatus(trip,destination);if(!road.ok){constraintStatus.violations.push({key:'road-reach',label:'Roadtripbereik',detail:`${destination.name} ligt buiten het realistische roadtripbereik.`,adjustment:'Kies dichterbij, meer reisdagen of een hogere daglimiet.',stretchable:false});Object.assign(constraintStatus,{category:'rejected',exact:false,stretch:false,selectable:false,summary:constraintStatus.violations.map(item=>item.detail).join(' ')})}
 const minimumDays=trip.routeTopology==='open-ended'?Math.max(2,route.requiredLegs+1):constraintStatus.minimumDays,driving=roundScore(100-Math.max(0,route.requiredLegs-1)*15-Math.max(0,minimumDays-trip.days)*15),budgetFit=budgetScore(budget.total,trip.budget),routePotential=roundScore(((tagScore(destination,'natuur')+tagScore(destination,'bergen')+tagScore(destination,'motor'))/3+transport)/2);
 const dimensions={budget:budgetFit,driving,season,transport,family:destination.family*10,motorcycle:destination.motorcycle*10,camper:destination.camper*10,scenery:roundScore((tagScore(destination,'natuur')+tagScore(destination,'bergen')+tagScore(destination,'kust'))/3),walking:tagScore(destination,'wandelen'),swimming:tagScore(destination,'zwemmen'),food:tagScore(destination,'eten',90,55),culture:tagScore(destination,'cultuur',90,50),crowds:destination.crowds*10};
 const intentScore=destinationIntentScore(trip,destination),score=roundScore(preference.score*.56+budgetFit*.12+season*.09+transport*.11+driving*.12+intentScore-(constraintStatus.category==='stretch'?12:0)),matchSentence=preference.reasons.length?preference.reasons.join('; '):'geen specifieke inhoudelijke voorkeur geselecteerd',budgetMargin=Math.max(0,trip.budget-budget.total);
 const story=proposalStory(trip,destination,preference,route,budgetMargin,constraintStatus);
 const criteria={budget:dimensions.budget,driving:dimensions.driving,season:dimensions.season,transport:dimensions.transport,scenery:dimensions.scenery,walking:dimensions.walking,swimming:dimensions.swimming,food:dimensions.food,culture:dimensions.culture,crowds:dimensions.crowds};
 globalThis.__REISSLIM_PROPOSAL_SCORES=globalThis.__REISSLIM_PROPOSAL_SCORES||{};
 globalThis.__REISSLIM_PROPOSAL_SCORES[destination.id]=criteria;
 return{...destination,summary:story,score,dimensions,estimate:budget.total,budget,route,matches:preference.matches,preferenceCoverage:preference.coverage,preferencePurity:preference.purity,preferenceReasons:preference.reasons,essentialMisses:preference.essentialMisses,intentMatch:intentScore>0,minimumDays,feasible:constraintStatus.exact,category:constraintStatus.category,constraintStatus,confidence:route.originKnown?'redelijk':'beperkt',compromises:constraintStatus.violations.map(item=>item.detail),
 cardMetrics:{preference:preference.score,roadtrip:driving,route:routePotential,budget:budgetFit,budgetMargin},
 explanation:story}
}
const byMatch=(a,b)=>Number(b.intentMatch)-Number(a.intentMatch)||b.preferenceCoverage-a.preferenceCoverage||b.score-a.score||a.estimate-b.estimate||a.name.localeCompare(b.name,'nl');

function cheapCatalogPreselect(trip, destinationList, maximum = 24) {
  const origin = resolveOrigin(trip);
  const selectedPrefs = new Set(trip.preferences || []);
  const weightFor = id => Number(trip.preferenceWeights?.[id] || 2);
  const productiveSpeed = trip.transport === 'motorcycle' ? 72 : trip.transport === 'caravan' ? 62 : trip.transport === 'motorhome' ? 66 : 78;
  const outboundDays = trip.routeTopology === 'open-ended'
    ? Math.max(1, Number(trip.days || 3) - 1)
    : Math.max(1, Math.floor((Number(trip.days || 3) - 1) / 2));
  const reachKm = Math.max(250, Number(trip.maxDrive || 5) * productiveSpeed * outboundDays * 1.12);

  const scored = (destinationList || []).map((destination, index) => {
    const point = destination.bases?.[0];
    const directKm = origin && point ? haversineKm(origin, point) : null;
    const estimatedRoadKm = Number.isFinite(directKm) ? directKm * 1.18 : Number(destination.distanceKm || 99999);
    const withinReach = estimatedRoadKm <= reachKm;
    const matchingTags=(destination.tags||[]).filter(tag=>selectedPrefs.has(tag));
    const tagScore=matchingTags.reduce((sum,tag)=>sum+weightFor(tag),0);
    const selectedCoverage=selectedPrefs.size?matchingTags.length/selectedPrefs.size:0;
    const relevantTags=(destination.tags||[]).filter(tag=>['natuur','bergen','zwemmen','wandelen','kinderen','motor','cultuur','eten','kust','budget'].includes(tag));
    const purity=relevantTags.length?matchingTags.length/relevantTags.length:0;
    const intent=String(trip.destinationQuery||'').trim().toLocaleLowerCase('nl-NL');
    const haystack=`${destination.name||''} ${destination.country||''} ${(destination.tags||[]).join(' ')}`.toLocaleLowerCase('nl-NL');
    const intentBonus=intent&&haystack.includes(intent)?80:0;
    const proximity=Number.isFinite(estimatedRoadKm)?Math.max(0,15-estimatedRoadKm/220):0;
    const preferenceMerit=selectedPrefs.size?(selectedCoverage*120+purity*45+tagScore*18):0;
    return{destination,index,withinReach,preferenceMatch:matchingTags.length,merit:preferenceMerit+intentBonus+proximity};
  });

  const reachable=scored.filter(item=>item.withinReach);
  const basePool=reachable.length?reachable:scored;
  const matchedPool=selectedPrefs.size?basePool.filter(item=>item.preferenceMatch>0):basePool;
  const pool=matchedPool.length>=Math.min(6,maximum)?matchedPool:basePool;
  return pool.sort((a,b)=>b.merit-a.merit||a.index-b.index).slice(0,maximum).map(item=>item.destination);
}

export function rankDestinationGroups(trip,destinationList){const preselected=cheapCatalogPreselect(trip,destinationList,24),scored=preselected.map(destination=>scoreDestination(trip,destination)),exact=scored.filter(item=>item.category==='exact').sort(byMatch),stretched=scored.filter(item=>item.category==='stretch').sort((a,b)=>a.constraintStatus.stretchPenalty-b.constraintStatus.stretchPenalty||byMatch(a,b)).slice(0,STRETCH_LIMITS.visibleProposals),rejected=scored.filter(item=>item.category==='rejected').sort((a,b)=>a.constraintStatus.violations.length-b.constraintStatus.violations.length||byMatch(a,b));return{exact,stretched,rejected,visible:[...exact,...stretched],closestAdjustments:closestAdjustments(rejected)}}
export function rankDestinations(trip,destinationList){return rankDestinationGroups(trip,destinationList).visible}
export const scoreInRange=score=>clamp(score)===score;
