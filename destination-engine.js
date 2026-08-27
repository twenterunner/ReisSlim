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
  const selected=Array.isArray(trip.preferences)?trip.preferences:[];
  if(!selected.length)return{score:null,matches:[],coverage:null,essentialMisses:[],reasons:[],purity:null};
  const possible=selected.reduce((sum,id)=>sum+(trip.preferenceWeights?.[id]||2),0);
  const matches=selected.filter(id=>destination.tags?.includes(id));
  const matched=matches.reduce((sum,id)=>sum+(trip.preferenceWeights?.[id]||2),0);
  const essentialMisses=selected.filter(id=>(trip.preferenceWeights?.[id]||2)>=3&&!destination.tags?.includes(id));
  const coverage=matched/Math.max(1,possible);
  // IMPORTANT: unrelated tags are deliberately ignored. A destination is not
  // penalised for having culture, family or camper attributes when the user did
  // not ask for them; nor can those attributes improve the score.
  const score=roundScore(Math.max(0,100*coverage-Math.min(35,essentialMisses.length*18)));
  const reasons=matches.map(id=>`${id}: ${prefReason[id]||'relevante kenmerken'}`);
  return{score,matches,coverage,essentialMisses,reasons,purity:null}
}
function budgetScore(total,budget){const ratio=total/Math.max(1,budget);if(ratio<=.9)return 100;return roundScore(100-(ratio-.9)*150)}
function destinationIntentScore(trip,destination){const query=String(trip.destinationQuery||'').trim().toLocaleLowerCase('nl-NL');if(!query)return 0;const words=query.split(/\s+/).filter(word=>word.length>2),haystack=[destination.name,destination.country,destination.summary,...(destination.tags||[])].join(' ').toLocaleLowerCase('nl-NL'),matches=words.filter(word=>haystack.includes(word)).length;return matches?Math.min(30,18+matches*6):-12}
function roadReachStatus(trip,destination){const origin=resolveOrigin(trip),point=destination.bases?.[0];if(!origin||!point)return{ok:true};const straight=haversineKm(origin,point);if(!Number.isFinite(straight))return{ok:true};const speed=trip.transport==='motorcycle'?72:trip.transport==='caravan'?62:trip.transport==='motorhome'?66:78,singleDay=Number(trip.days)===1,outboundDays=trip.routeTopology==='open-ended'?Math.max(1,trip.days-1):Math.max(1,Math.floor((trip.days-1)/2)),roadReach=singleDay?trip.maxDrive*speed*.48:trip.maxDrive*speed*outboundDays,estimatedRoad=straight*1.18;return{ok:estimatedRoad<=roadReach*1.08,estimatedRoad,roadReach,singleDay}}
export function scoreDestination(trip,destination){
 const month=new Date(`${trip.startDate}T12:00:00`).getMonth()+1;
 const route=calculateRouteMetrics(trip,destination);
 const relaxedRoute=route.requiredLegs*2+1>trip.days?calculateRouteMetrics({...trip,maxDrive:trip.maxDrive+STRETCH_LIMITS.maxDriveHours},destination):route;
 const budget=buildBudget(trip,destination),preference=preferenceScore(trip,destination);
 const season=destination.season?.includes(month)?90:40,vehicle=transportId(trip.transport);
 const constraintStatus=evaluateDestinationConstraints(trip,{route,relaxedRoute,budget}),road=roadReachStatus(trip,destination);
 if(!road.ok){
   constraintStatus.violations.push({key:'road-reach',label:'Roadtripbereik',detail:`${destination.name} ligt buiten het realistische roadtripbereik.`,adjustment:'Kies dichterbij, meer reisdagen of een hogere daglimiet.',stretchable:false});
   Object.assign(constraintStatus,{category:'rejected',exact:false,stretch:false,selectable:false,summary:constraintStatus.violations.map(item=>item.detail).join(' ')})
 }
 const minimumDays=Number(trip.days)===1?1:trip.routeTopology==='open-ended'?Math.max(2,route.requiredLegs+1):constraintStatus.minimumDays;
 const driving=roundScore(100-Math.max(0,route.requiredLegs-1)*15-Math.max(0,minimumDays-trip.days)*15);
 const budgetFit=budgetScore(budget.total,trip.budget);
 const selected=new Set(trip.preferences||[]);
 const selectedValue=id=>{
   if(id==='kinderen')return destination.family*10;
   if(id==='motor')return destination.motorcycle*10;
   if(id==='budget')return budgetFit;
   return tagScore(destination,id,id==='eten'?90:90,id==='eten'?55:id==='cultuur'?50:45);
 };
 const dimensions={
   budget:budgetFit,driving,season,
   motorcycle:destination.motorcycle*10,camper:destination.camper*10,family:destination.family*10,
   natuur:tagScore(destination,'natuur'),bergen:tagScore(destination,'bergen'),
   swimming:tagScore(destination,'zwemmen'),walking:tagScore(destination,'wandelen'),
   food:tagScore(destination,'eten',90,55),culture:tagScore(destination,'cultuur',90,50),
   kust:tagScore(destination,'kust'),crowds:destination.crowds*10
 };

 // Build the ONLY criteria that are allowed to influence this trip.
 // Entered constraints always matter; vehicle-specific suitability matters only
 // for vehicles where we actually have destination-specific data.
 const criteria={budget:budgetFit,driving,season};
 const weights={budget:1.10,driving:1.35,season:.75};

 if(vehicle==='motorcycle'){
   criteria.transport=destination.motorcycle*10; weights.transport=1.15;
 }else if(['motorhome','caravan'].includes(vehicle)){
   criteria.transport=destination.camper*10; weights.transport=1.15;
 }
 // Cars are intentionally not scored through "family" suitability. We have no
 // destination-specific car-access dimension, so inventing one would distort rank.

 // Children make family suitability relevant even if "kindvriendelijk" was not
 // separately ticked. Solo/adult-only trips never receive a family criterion.
 if(Number(trip.children||0)>0){
   criteria.family=destination.family*10; weights.family=1.25;
 }

 const prefKeyMap={
   natuur:'natuur',bergen:'bergen',zwemmen:'swimming',wandelen:'walking',
   kinderen:'family',motor:'transport',cultuur:'culture',eten:'food',kust:'kust',budget:'budget'
 };
 for(const id of selected){
   const key=prefKeyMap[id];
   if(!key)continue;
   criteria[key]=selectedValue(id);
   const priority=Math.max(1,Math.min(3,Number(trip.preferenceWeights?.[id]||2)));
   weights[key]=Math.max(weights[key]||0,priority===3?1.8:priority===2?1.3:.9);
 }

 // Relaxed pace makes crowd/rest character relevant because the user explicitly
 // asked for a less hectic trip. Otherwise "crowds" is not scored.
 if(trip.tripPace==='relaxed'){
   criteria.crowds=destination.crowds*10; weights.crowds=.65;
 }

 const activeEntries=Object.entries(criteria).filter(([,value])=>Number.isFinite(Number(value)));
 const weightTotal=activeEntries.reduce((sum,[key])=>sum+(weights[key]||1),0);
 let score=roundScore(activeEntries.reduce((sum,[key,value])=>sum+Number(value)*(weights[key]||1),0)/Math.max(.01,weightTotal));
 const intentScore=destinationIntentScore(trip,destination);
 // Destination/richtung text is a user input too, but keep it a bounded nudge
 // rather than letting it overwhelm all other criteria.
 score=roundScore(clamp(score+(intentScore>0?Math.min(7,intentScore/4):intentScore<0?-3:0),0,100));
 if(constraintStatus.category==='stretch')score=roundScore(Math.max(0,score-10));

 const budgetMargin=Math.max(0,trip.budget-budget.total);
 const story=proposalStory(trip,destination,preference,route,budgetMargin,constraintStatus);

 globalThis.__REISSLIM_PROPOSAL_SCORES=globalThis.__REISSLIM_PROPOSAL_SCORES||{};
 globalThis.__REISSLIM_PROPOSAL_SCORE_META=globalThis.__REISSLIM_PROPOSAL_SCORE_META||{};
 globalThis.__REISSLIM_PROPOSAL_SCORES[destination.id]=criteria;
 globalThis.__REISSLIM_PROPOSAL_SCORE_META[destination.id]={criteria:{...criteria},weights:{...weights},active:Object.keys(criteria)};

 const routePreferenceValues=[
   selected.has('natuur')?dimensions.natuur:null,
   selected.has('bergen')?dimensions.bergen:null,
   selected.has('motor')?destination.motorcycle*10:null
 ].filter(Number.isFinite);
 const routePotential=roundScore(routePreferenceValues.length?routePreferenceValues.reduce((a,b)=>a+b,0)/routePreferenceValues.length:driving);

 return{...destination,summary:story,score,dimensions,estimate:budget.total,budget,route,
   matches:preference.matches,preferenceCoverage:preference.coverage,preferencePurity:null,
   preferenceReasons:preference.reasons,essentialMisses:preference.essentialMisses,
   intentMatch:intentScore>0,minimumDays,feasible:constraintStatus.exact,category:constraintStatus.category,
   constraintStatus,confidence:route.originKnown?'redelijk':'beperkt',
   compromises:constraintStatus.violations.map(item=>item.detail),
   cardMetrics:{preference:preference.score,roadtrip:driving,route:routePotential,budget:budgetFit,budgetMargin},
   scoringContext:{criteria:{...criteria},weights:{...weights}},
   explanation:story}
}
const byMatch=(a,b)=>Number(b.intentMatch)-Number(a.intentMatch)||b.preferenceCoverage-a.preferenceCoverage||b.score-a.score||a.estimate-b.estimate||a.name.localeCompare(b.name,'nl');

function cheapCatalogPreselect(trip, destinationList, maximum = 40) {
  const origin = resolveOrigin(trip);
  const selectedPrefs = new Set(trip.preferences || []);
  const weightFor = id => Number(trip.preferenceWeights?.[id] || 2);
  const productiveSpeed = trip.transport === 'motorcycle' ? 72 : trip.transport === 'caravan' ? 62 : trip.transport === 'motorhome' ? 66 : 78;
  const singleDay=Number(trip.days)===1;
  const outboundDays = trip.routeTopology === 'open-ended'
    ? Math.max(1, Number(trip.days || 1) - 1)
    : Math.max(1, Math.floor((Number(trip.days || 1) - 1) / 2));
  const reachKm = singleDay
    ? Math.max(35, Number(trip.maxDrive || 5) * productiveSpeed * .48)
    : Math.max(250, Number(trip.maxDrive || 5) * productiveSpeed * outboundDays * 1.12);

  const scored = (destinationList || []).map((destination, index) => {
    const point = destination.bases?.[0];
    const directKm = origin && point ? haversineKm(origin, point) : null;
    const estimatedRoadKm = Number.isFinite(directKm) ? directKm * 1.18 : Number(destination.distanceKm || 99999);
    const withinReach = estimatedRoadKm <= reachKm;
    const matchingTags=(destination.tags||[]).filter(tag=>selectedPrefs.has(tag));
    const tagScore=matchingTags.reduce((sum,tag)=>sum+weightFor(tag),0);
    const selectedCoverage=selectedPrefs.size?matchingTags.length/selectedPrefs.size:0;
    const relevantTags=(destination.tags||[]).filter(tag=>['natuur','bergen','zwemmen','wandelen','kinderen','motor','cultuur','eten','kust','budget'].includes(tag));
    const purity=0; // unrelated destination tags are neutral, never a ranking penalty
    const intent=String(trip.destinationQuery||'').trim().toLocaleLowerCase('nl-NL');
    const haystack=`${destination.name||''} ${destination.country||''} ${(destination.tags||[]).join(' ')}`.toLocaleLowerCase('nl-NL');
    const intentBonus=intent&&haystack.includes(intent)?80:0;
    const proximity=Number.isFinite(estimatedRoadKm)?Math.max(0,15-estimatedRoadKm/220):0;
    const preferenceMerit=selectedPrefs.size?(selectedCoverage*135+tagScore*18):0;
    return{destination,index,withinReach,preferenceMatch:matchingTags.length,merit:preferenceMerit+intentBonus+proximity};
  });

  const reachable=scored.filter(item=>item.withinReach);
  const basePool=reachable.length?reachable:scored;
  const matchedPool=selectedPrefs.size?basePool.filter(item=>item.preferenceMatch>0):basePool;
  const pool=matchedPool.length>=Math.min(6,maximum)?matchedPool:basePool;
  return pool.sort((a,b)=>b.merit-a.merit||a.index-b.index).slice(0,maximum).map(item=>item.destination);
}

export function rankDestinationGroups(trip,destinationList){const preselected=cheapCatalogPreselect(trip,destinationList,40),scored=preselected.map(destination=>scoreDestination(trip,destination)),exact=scored.filter(item=>item.category==='exact').sort(byMatch),stretched=scored.filter(item=>item.category==='stretch').sort((a,b)=>a.constraintStatus.stretchPenalty-b.constraintStatus.stretchPenalty||byMatch(a,b)).slice(0,STRETCH_LIMITS.visibleProposals),rejected=scored.filter(item=>item.category==='rejected').sort((a,b)=>a.constraintStatus.violations.length-b.constraintStatus.violations.length||byMatch(a,b));return{exact,stretched,rejected,visible:[...exact,...stretched],closestAdjustments:closestAdjustments(rejected)}}
export function rankDestinations(trip,destinationList){return rankDestinationGroups(trip,destinationList).visible}
export const scoreInRange=score=>clamp(score)===score;
