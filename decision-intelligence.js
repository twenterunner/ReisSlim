import { DEMO_NOW } from './data.js';
import { methodTimeMetrics } from './intelligence.js';

const DAY=86400000;
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const sevRank={Low:1,Medium:2,High:3,Critical:4};
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36).toUpperCase()};
const median=a=>{const x=(a||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return 0;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};

export function ensureDecisionIntelligenceState(data){
 data.settings=data.settings||{};
 data.settings.decisionIntelligence=data.settings.decisionIntelligence||{enabled:true,intervalSeconds:60,rejected:[],decisions:[],actions:[]};
 const s=data.settings.decisionIntelligence;
 s.enabled=s.enabled!==false;
 s.intervalSeconds=Math.max(30,Number(s.intervalSeconds)||60);
 s.rejected=s.rejected||[];
 s.decisions=s.decisions||[];
 s.actions=s.actions||[];
 return s;
}

export function intelligenceStateSignature(data){
 const trim=a=>(a||[]).map(x=>x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!['readings','evidenceData','measurementTable'].includes(k))):x);
 const payload={
  alerts:trim(data.liveAlerts).map(x=>[x.id,x.legId,x.programmeId,x.channelName,x.type,x.severity,x.status,x.timestamp,x.value]),
  issues:trim(data.issues).map(x=>[x.id,x.programmeId,x.legId,x.issueType,x.rootCause,x.severity,x.status,x.delayHours,x.reportedAt]),
  events:trim(data.operationalEvents).map(x=>[x.id,x.sourceId,x.programmeId,x.legId,x.title,x.severity,x.status,x.planningMaterial]),
  quality:trim(data.qualityEvents).map(x=>[x.id,x.sourceId,x.programmeId,x.legId,x.type,x.status,x.rootCause,x.effectivenessStatus]),
  lessons:trim(data.lessonsLearned).map(x=>[x.id,x.methodId,x.rootCause,x.issueType,x.occurrences,x.delayHours,x.confidence,x.lastSeen]),
  runs:trim(data.testRuns).map(x=>[x.id,x.methodId,x.staffId,x.equipmentId,x.outcome,x.actualHours,x.standardHours,x.actualEnd]),
  methods:trim(data.methods).map(x=>[x.id,x.revision,x.setupHours,x.executionHours,x.teardownHours,x.analysisHours,x.active]),
  programmes:trim(data.programmes).map(x=>[x.id,x.forecastCompletion,x.dueDate,x.scheduleRisk,x.priority]),
  disruptions:trim(data.disruptions).map(x=>[x.id,x.programmeId,x.legId,x.status,x.effectiveUntil,x.impactHours]),
  equipment:trim(data.equipment).map(x=>[x.id,x.type,x.status,x.currentCalibrationId,x.calibrationDue]),
  calibrations:trim(data.calibrations).map(x=>[x.id,x.equipmentId,x.calibrationDate,x.dueDate,x.result]),
 };
 return hash(JSON.stringify(payload));
}

function methodForLeg(data,legId){const leg=(data.legs||[]).find(x=>x.id===legId);return leg?(data.methods||[]).find(m=>m.id===leg.methodId):null;}
function highestSeverity(rows){return (rows||[]).map(x=>x.severity||'Low').sort((a,b)=>(sevRank[b]||0)-(sevRank[a]||0))[0]||'Medium';}
function currentProgrammeImpact(data,programmeId,legId){
 const p=(data.programmes||[]).find(x=>x.id===programmeId),d=(data.disruptions||[]).filter(x=>x.status==='Active'&&x.programmeId===programmeId&&(!legId||x.legId===legId)),impactHours=d.reduce((a,x)=>a+n(x.impactHours),0),until=d.map(x=>new Date(x.effectiveUntil||x.reportedAt).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0]||null;
 const due=p?.dueDate?new Date(p.dueDate):null,forecast=p?.forecastCompletion?new Date(p.forecastCompletion):null,marginHours=due&&forecast?(due-forecast)/3600000:null;
 return {impactHours,until:until?new Date(until).toISOString():null,marginHours,scheduleRisk:p?.scheduleRisk||p?.status||'Unknown'};
}
function liveHypothesis(alerts){
 const text=alerts.map(a=>`${a.channelName||''} ${a.channel||''} ${a.type||''}`).join(' ').toLowerCase();
 if(/supply|voltage|current/.test(text))return 'Power path, connection or fixture instability is the leading hypothesis. Treat it as a hypothesis until the investigation confirms the cause.';
 if(/chamber|fixture temperature|temperature/.test(text))return 'Thermal control, sensor placement or fixture heat transfer is the leading hypothesis. Confirm with independent evidence before changing the method.';
 if(/vibration|grms/.test(text))return 'Excitation/control-loop or fixture coupling instability is the leading hypothesis. Verify fixture integrity and independent reference measurement.';
 return 'The signals are correlated enough to justify one structured investigation instead of independent alert handling.';
}
function liveProposal(alerts){
 const text=alerts.map(a=>`${a.channelName||''} ${a.channel||''}`).join(' ').toLowerCase();
 if(/supply|voltage|current/.test(text))return 'Contain the affected leg, run one supply/connection diagnostic, review DUT validity, and convert the verified finding into a controlled setup/readiness change before release.';
 if(/temperature/.test(text))return 'Contain the affected leg, verify chamber/fixture sensing and control stability, review DUT validity, and only then decide whether calibration, maintenance or method limits must change.';
 if(/vibration|grms/.test(text))return 'Contain the affected leg, inspect fixture torque/coupling and controller feedback, verify the reference channel, then resume only with evidence.';
 return 'Create one integrated investigation, contain the affected work where required, and decide once using the correlated evidence.';
}
function relatedHistory(data,methodId,alerts){
 const words=uniq(alerts.flatMap(a=>clean(a.channelName||a.channel).toLowerCase().split(/[^a-z0-9]+/)).filter(x=>x.length>3));
 const rows=(data.issues||[]).filter(i=>{const leg=(data.legs||[]).find(l=>l.id===i.legId);if(methodId&&leg?.methodId!==methodId)return false;const t=`${i.issueType||''} ${i.description||''}`.toLowerCase();return words.some(w=>t.includes(w))||i.rootCause==='Test Execution';});
 return {count:rows.length,delayHours:rows.reduce((a,i)=>a+n(i.delayHours),0),medianDelay:median(rows.map(i=>n(i.delayHours)))};
}
function buildLiveCases(data){
 const groups=new Map();
 for(const a of (data.liveAlerts||[]).filter(x=>!['Closed','Resolved'].includes(x.status))){const key=`${a.programmeId||'LAB'}|${a.legId||a.sessionId||'live'}`;const g=groups.get(key)||{key,programmeId:a.programmeId||'',legId:a.legId||'',alerts:[]};g.alerts.push(a);groups.set(key,g)}
 const out=[];
 for(const g of groups.values()){
  const alertIds=new Set(g.alerts.map(x=>x.id)),events=(data.operationalEvents||[]).filter(e=>e.legId===g.legId&&e.programmeId===g.programmeId&&(alertIds.has(e.sourceId)||e.sourceType==='Live alert')&&!['Closed','Resolved'].includes(e.status)),issueIds=new Set([...g.alerts.map(a=>a.issueId),...events.map(e=>e.issueId)].filter(Boolean)),issues=(data.issues||[]).filter(i=>issueIds.has(i.id)||(i.legId===g.legId&&i.programmeId===g.programmeId&&String(i.issueType||'').startsWith('Live anomaly'))),quality=(data.qualityEvents||[]).filter(q=>q.legId===g.legId&&q.programmeId===g.programmeId&&q.status!=='Closed'),method=methodForLeg(data,g.legId),channels=uniq(g.alerts.map(a=>a.channelName||a.channel)),types=uniq(g.alerts.map(a=>a.type)),hard=g.alerts.some(a=>['High limit','Low limit'].includes(a.type)),stat=g.alerts.filter(a=>a.type==='Statistical anomaly').length,sev=highestSeverity(g.alerts),history=relatedHistory(data,method?.id,g.alerts),impact=currentProgrammeImpact(data,g.programmeId,g.legId),confidence=clamp(Math.round(48+g.alerts.length*5+channels.length*5+types.length*4+(hard?12:0)+(issues.length?5:0)+(history.count>=3?8:0)),55,98),evidenceCount=g.alerts.length+events.length+issues.length+quality.length;
  const dominant=channels.length===1?channels[0]:channels.slice(0,2).join(' + '),caseKey=`LIVE|${g.key}|${[...alertIds].sort().join(',')}`,fingerprint=hash(`${caseKey}|${g.alerts.map(a=>a.status).join(',')}|${issues.map(i=>i.status).join(',')}`),benefit=Math.max(impact.impactHours,Math.round(history.medianDelay||0));
  out.push({id:`CASE-${hash(caseKey)}`,fingerprint,kind:'live',severity:sev,priorityScore:(sevRank[sev]||2)*100+confidence+Math.min(80,evidenceCount*4)+Math.min(60,benefit),programmeId:g.programmeId,legId:g.legId,methodId:method?.id||'',title:`${g.programmeId} · ${g.legId} — ${dominant||'live test instability'}`,subtitle:`${g.alerts.length} raw alert(s) correlated into one decision case`,confidence,evidenceCount,signals:{alerts:g.alerts.map(x=>x.id),events:events.map(x=>x.id),issues:issues.map(x=>x.id),quality:quality.map(x=>x.id)},pattern:`${g.alerts.length} live signals across ${channels.length} channel(s) and ${types.length} detection mode(s)${hard?' including a hard limit excursion':''}. ${history.count?`${history.count} related historical issue(s) caused ${Math.round(history.delayHours)}h recorded delay.`:'No strong historical recurrence match yet.'}`,hypothesis:liveHypothesis(g.alerts),proposal:liveProposal(g.alerts),proposalType:'integrated_investigation',expectedBenefitHours:benefit,impact,verification:'Close only when containment evidence is complete and the next applicable run shows no recurrence.',learnedFrom:`Live telemetry + ${issues.length} linked issue(s) + ${history.count} related historical issue(s)`,sourceIds:[...alertIds,...events.map(x=>x.id),...issues.map(x=>x.id),...quality.map(x=>x.id)]});
 }
 return out;
}

function recurringProposal(l){
 const rc=String(l.rootCause||'');
 if(rc==='Bad Specification')return {type:'spec_prevention',text:'Create a controlled specification-review improvement: require explicit acceptance limits, conditions and release completeness before resource commitment.',verify:'Verify effectiveness on the next 3 applicable programme releases.'};
 if(rc==='Test Execution')return {type:'method_prevention',text:'Create a controlled method/work-instruction improvement: add a mandatory setup/readiness check and peer verification where risk is high.',verify:'Verify effectiveness on the next 3 applicable test runs.'};
 if(rc==='Equipment / Facility')return {type:'asset_prevention',text:'Create an asset reliability action: review service interval, calibration history, condition evidence and contingency capacity before the next release.',verify:'Verify by recurrence-free operation over the next 3 applicable runs or service cycle.'};
 if(rc==='Sample / DUT')return {type:'sample_prevention',text:'Create a sample-readiness control: confirmed arrival/readiness gate before constrained resources are reserved.',verify:'Verify on the next 3 programmes using the same sample flow.'};
 if(rc==='Planning / Resource')return {type:'resource_prevention',text:'Create a competency/capacity action: cross-qualify the single-point skill or add qualified coverage before the next demand peak.',verify:'Verify the next 12-week capacity scan shows no uncovered qualified-hours peak.'};
 if(rc==='Test Method / Development')return {type:'development_prevention',text:'Create a method-development gate: maturity evidence and realistic learned lead-time must be approved before downstream validation is committed.',verify:'Verify on the next 3 development-gated test requests.'};
 return {type:'process_prevention',text:clean(l.lesson)||'Create a controlled preventive action and verify that the failure mode does not recur.',verify:'Verify effectiveness on the next 3 applicable occurrences.'};
}
function buildRecurringCases(data){
 const out=[];
 for(const l of (data.lessonsLearned||[]).filter(x=>x.source==='Automatic'&&n(x.occurrences)>=2)){
  const p=recurringProposal(l),programmes=uniq(l.programmeIds),caseKey=`LESSON|${l.id}|${n(l.occurrences)}|${n(l.delayHours)}`,fingerprint=hash(caseKey),sev=n(l.delayHours)>=80||n(l.occurrences)>=6?'High':n(l.occurrences)>=4?'Medium':'Low',confidence=clamp(n(l.confidence,70),55,98),benefit=Math.round(n(l.delayHours)/Math.max(1,n(l.occurrences)));
  out.push({id:`CASE-${hash(`REC|${l.id}`)}`,fingerprint,kind:'learning',severity:sev,priorityScore:(sevRank[sev]||1)*80+confidence+Math.min(100,n(l.occurrences)*8)+Math.min(80,n(l.delayHours)/2),programmeId:programmes[0]||'',programmeIds:programmes,legId:'',methodId:l.methodId||'',title:`Prevent recurrence · ${l.title}`,subtitle:`${l.occurrences} occurrences · ${l.delayHours||0}h recorded delay · ${programmes.length} programme(s)`,confidence,evidenceCount:(l.sourceIssueIds||[]).length+(l.sourceRunIds||[]).length,signals:{alerts:[],events:[],issues:l.sourceIssueIds||[],quality:[]},pattern:`${l.issueType} has recurred ${l.occurrences} times${l.methodId?` on ${l.methodId}`:''}. Trend: ${l.trend||'Recurring'}.`,hypothesis:`Recurring root-cause family: ${l.rootCause}. This is evidence-backed from the linked source issues; it is not a new unverified root-cause claim.`,proposal:p.text,proposalType:p.type,expectedBenefitHours:benefit,impact:{impactHours:n(l.delayHours),marginHours:null,scheduleRisk:'Recurring loss'},verification:p.verify,learnedFrom:`${(l.sourceIssueIds||[]).length} source issue(s), ${(l.sourceRunIds||[]).length} run(s), ${(l.sourceStaffIds||[]).length} person reference(s)`,sourceIds:uniq([...(l.sourceIssueIds||[]),...(l.sourceRunIds||[])]),lessonId:l.id});
 }
 return out;
}
function buildTimeLearningCases(data){
 const out=[];
 for(const m of (data.methods||[]).filter(x=>x.active)){
  const t=methodTimeMetrics(data,m.id);if(t.runs<5||Math.abs(n(t.durationVariancePct))<15)continue;
  const caseKey=`TIME|${m.id}|${t.runs}|${t.durationVariancePct}|${t.learned.total}`,fingerprint=hash(caseKey),sev=Math.abs(t.durationVariancePct)>=25?'Medium':'Low',direction=t.durationVariancePct>0?'understates':'overstates';
  out.push({id:`CASE-${hash(`TIME|${m.id}`)}`,fingerprint,kind:'learning',severity:sev,priorityScore:70+Math.min(100,Math.abs(t.durationVariancePct)*2)+t.confidence,programmeId:'',legId:'',methodId:m.id,title:`Update planning standard · ${m.id}`,subtitle:`${t.runs} completed runs · ${t.durationVariancePct>=0?'+':''}${t.durationVariancePct}% actual vs current standard`,confidence:clamp(t.confidence,45,95),evidenceCount:t.runs,signals:{alerts:[],events:[],issues:[],quality:[]},pattern:`Actual history ${direction} the current standard by ${Math.abs(t.durationVariancePct)}%. Learned median total is ${t.learned.total}h.`,hypothesis:'The planning standard has drifted from observed execution history; the learned component medians are more representative of recent runs.',proposal:`Approve learned component times (${t.learned.setup}h setup, ${t.learned.execution}h execution, ${t.learned.teardown}h teardown, ${t.learned.analysis}h analysis) and recalculate future schedules.`,proposalType:'standard_time_update',expectedBenefitHours:0,impact:{impactHours:0,marginHours:null,scheduleRisk:'Forecast accuracy'},verification:'Continue learning; LabOS will reopen the proposal if new history materially changes the median again.',learnedFrom:`${t.runs} completed runs`,sourceIds:(data.testRuns||[]).filter(r=>r.methodId===m.id&&r.status==='Completed').map(r=>r.id),learnedTimes:t.learned});
 }
 return out;
}

export function generateDecisionIntelligence(data,{maxCases=10}={}){
 ensureDecisionIntelligenceState(data);
 const all=[...buildLiveCases(data),...buildRecurringCases(data),...buildTimeLearningCases(data)];
 const seen=new Set(),cases=[];
 for(const c of all.sort((a,b)=>b.priorityScore-a.priorityScore||b.confidence-a.confidence)){if(seen.has(c.fingerprint))continue;seen.add(c.fingerprint);cases.push(c);if(cases.length>=maxCases)break;}
 const rawSignals=(data.liveAlerts||[]).filter(x=>!['Closed','Resolved'].includes(x.status)).length+(data.operationalEvents||[]).filter(x=>!['Closed','Resolved'].includes(x.status)).length+(data.qualityEvents||[]).filter(x=>x.status!=='Closed').length;
 return {signature:intelligenceStateSignature(data),generatedAt:new Date().toISOString(),cases,metrics:{rawSignals,correlatedCases:buildLiveCases(data).length,learningPatterns:(data.lessonsLearned||[]).filter(x=>x.source==='Automatic').length,learnedMethods:(data.methods||[]).filter(m=>n(m.learningRuns)>=3).length,openActions:ensureDecisionIntelligenceState(data).actions.filter(x=>!['Closed','Verified','Rejected'].includes(x.status)).length}};
}
