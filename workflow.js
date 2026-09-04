import { DEMO_NOW, cloneData } from './data.js';

const n=v=>Number(v)||0;
const addHours=(iso,h)=>new Date(new Date(iso).getTime()+h*3600000).toISOString();
const severityRank={Low:1,Medium:2,High:3,Critical:4};
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36).toUpperCase()};
const clean=s=>String(s||'Issue').trim().replace(/\s+/g,' ');

export const DEFAULT_ESCALATION_RULES=[
 {id:'ESC-LOW',severity:'Low',slaMinutes:240,notifyRoles:['Test Engineer'],createIssue:false,createDelay:false,blockTest:false,replanScope:'None',defaultDelayHours:0},
 {id:'ESC-MED',severity:'Medium',slaMinutes:120,notifyRoles:['Test Engineer','Planner'],createIssue:true,createDelay:false,blockTest:false,replanScope:'Programme',defaultDelayHours:4},
 {id:'ESC-HIGH',severity:'High',slaMinutes:30,notifyRoles:['Test Engineer','Planner','Lab Manager'],createIssue:true,createDelay:true,blockTest:false,replanScope:'Programme',defaultDelayHours:12},
 {id:'ESC-CRIT',severity:'Critical',slaMinutes:10,notifyRoles:['Test Engineer','Planner','Lab Manager','Quality'],createIssue:true,createDelay:true,blockTest:true,replanScope:'Portfolio',defaultDelayHours:24}
];

export function ensureWorkflowState(data){
 data.notifications=data.notifications||[];
 data.operationalEvents=data.operationalEvents||[];
 data.escalationRules=data.escalationRules?.length?data.escalationRules:DEFAULT_ESCALATION_RULES.map(x=>({...x}));
 data.lessonsLearned=data.lessonsLearned||[];
 data.planningSnapshots=data.planningSnapshots||[];
 data.settings=data.settings||{};
 data.settings.controlFilters=data.settings.controlFilters||{status:'Open',severity:'All',programme:''};
 data.settings.lessonDetection=data.settings.lessonDetection||{minOccurrences:2,lookbackDays:365};
 detectRecurringLessons(data);
 return data;
}

export function ruleForSeverity(data,severity='Medium'){
 ensureWorkflowState(data);
 return data.escalationRules.find(r=>r.severity===severity)||data.escalationRules.find(r=>r.severity==='Medium')||DEFAULT_ESCALATION_RULES[1];
}

function issueMethodId(data,i){const leg=data.legs?.find(l=>l.id===i.legId);return leg?.methodId||data.testRuns?.find(r=>r.id===i.testRunId)?.methodId||null;}
function issueFamily(i){return `${clean(i.rootCause)} · ${clean(i.issueType).replace(/\d+(\.\d+)?/g,'#')}`;}
function sourceStaffId(data,i){const r=data.testRuns?.find(x=>x.id===i.testRunId),l=data.legs?.find(x=>x.id===i.legId);return r?.staffId||l?.staffId||null;}

export function detectRecurringLessons(data,{minOccurrences=null}={}){
 ensureWorkflowStateShallow(data);
 const min=Math.max(2,Number(minOccurrences||data.settings?.lessonDetection?.minOccurrences)||2),groups=new Map();
 for(const i of data.issues||[]){
  const methodId=issueMethodId(data,i),key=`${methodId||'PROGRAMME'}|${issueFamily(i)}`;
  const g=groups.get(key)||{key,methodId,rootCause:i.rootCause||'Unclassified',issueType:i.issueType||'Issue',issues:[],delayHours:0,staffIds:new Set(),programmeIds:new Set()};
  g.issues.push(i);g.delayHours+=n(i.delayHours);const sid=sourceStaffId(data,i);if(sid)g.staffIds.add(sid);if(i.programmeId)g.programmeIds.add(i.programmeId);groups.set(key,g);
 }
 const auto=[];
 for(const g of groups.values()){
  if(g.issues.length<min)continue;
  const sorted=[...g.issues].sort((a,b)=>new Date(a.reportedAt)-new Date(b.reportedAt)),recent=sorted.slice(-Math.min(3,sorted.length));
  const recurrenceDays=sorted.length>1?(new Date(sorted.at(-1).reportedAt)-new Date(sorted[0].reportedAt))/86400000:0;
  const trend=sorted.length>=4&&new Date(recent[0].reportedAt)>new Date(sorted[Math.max(0,sorted.length-4)].reportedAt)?'Recurring':'Stable';
  const confidence=Math.min(98,50+g.issues.length*8+Math.min(16,g.delayHours/12));
  const title=`${g.issueType} recurring${g.methodId?` on ${g.methodId}`:''}`;
  const action=g.rootCause==='Bad Specification'?'Strengthen specification review/release criteria and acceptance-definition checks before planning.':g.rootCause==='Test Execution'?'Standardise setup/readiness checks, update the method work instruction, and verify recurrence after the next three runs.':g.rootCause==='Equipment / Facility'?'Review equipment reliability/service interval and contingency capacity before the next programme release.':g.rootCause==='Sample / DUT'?'Use confirmed sample-ready milestones and escalation triggers before reserving constrained resources.':'Review the recurring failure mode, assign an owner, and implement a preventive control.';
  auto.push({id:`AUTO-LSN-${hash(g.key)}`,source:'Automatic',status:'Detected',methodId:g.methodId,rootCause:g.rootCause,issueType:g.issueType,title,lesson:action,occurrences:g.issues.length,delayHours:Math.round(g.delayHours),sourceIssueIds:g.issues.map(i=>i.id),sourceRunIds:[...new Set(g.issues.map(i=>i.testRunId).filter(Boolean))],sourceStaffIds:[...g.staffIds],programmeIds:[...g.programmeIds],firstSeen:sorted[0].reportedAt,lastSeen:sorted.at(-1).reportedAt,recurrenceDays:Math.round(recurrenceDays),trend,confidence:Math.round(confidence),detectedAt:new Date().toISOString()});
 }
 const manual=(data.lessonsLearned||[]).filter(x=>x.source==='Manual');data.lessonsLearned=[...manual,...auto];return data.lessonsLearned;
}
function ensureWorkflowStateShallow(data){data.notifications=data.notifications||[];data.operationalEvents=data.operationalEvents||[];data.escalationRules=data.escalationRules?.length?data.escalationRules:DEFAULT_ESCALATION_RULES.map(x=>({...x}));data.lessonsLearned=data.lessonsLearned||[];data.settings=data.settings||{};data.settings.lessonDetection=data.settings.lessonDetection||{minOccurrences:2,lookbackDays:365};}

export function addManualLesson(data,input){ensureWorkflowState(data);const lesson={id:`LSN-${String(data.lessonsLearned.filter(x=>x.source==='Manual').length+1).padStart(3,'0')}`,source:'Manual',status:'Active',methodId:input.methodId||null,programmeIds:input.programmeId?[input.programmeId]:[],rootCause:input.rootCause||'Other',issueType:input.issueType||'Observation',title:input.title||'Manual lesson learned',lesson:input.lesson||'',occurrences:1,delayHours:n(input.delayHours),sourceIssueIds:input.issueId?[input.issueId]:[],sourceRunIds:input.testRunId?[input.testRunId]:[],sourceStaffIds:input.staffId?[input.staffId]:[],createdBy:input.actor||data.settings?.actor||'Demo Lab Manager',detectedAt:new Date().toISOString(),confidence:100};data.lessonsLearned=data.lessonsLearned.filter(x=>x.id!==lesson.id);data.lessonsLearned.unshift(lesson);return lesson;}

export function lessonSummary(data,{methodId=null,programmeId=null}={}){ensureWorkflowState(data);const rows=data.lessonsLearned.filter(l=>(!methodId||l.methodId===methodId)&&(!programmeId||l.programmeIds?.includes(programmeId))).sort((a,b)=>(b.occurrences||0)-(a.occurrences||0)||n(b.delayHours)-n(a.delayHours));return{rows,automatic:rows.filter(x=>x.source==='Automatic').length,manual:rows.filter(x=>x.source==='Manual').length,delayHours:rows.reduce((a,x)=>a+n(x.delayHours),0),recurrences:rows.reduce((a,x)=>a+n(x.occurrences),0)};}

export function syncLiveEscalations(data){ensureWorkflowState(data);let created=0;for(const a of data.liveAlerts||[]){if(data.operationalEvents.some(e=>e.sourceType==='Live alert'&&e.sourceId===a.id))continue;const r=ruleForSeverity(data,a.severity),leg=data.legs?.find(l=>l.id===a.legId),p=data.programmes?.find(x=>x.id===a.programmeId),now=a.timestamp||new Date().toISOString();let issueId=a.issueId||null;if(r.createIssue&&!issueId){const issue={id:`ISS-${String((data.issues||[]).length+1).padStart(3,'0')}`,reportedAt:now,programmeId:a.programmeId,legId:a.legId,testRunId:null,specificationId:null,issueType:`Live anomaly · ${a.channelName}`,rootCause:'Test Execution',severity:a.severity,delayHours:r.createDelay?r.defaultDelayHours:0,status:'Open',description:a.message,lesson:'Review anomaly containment, test validity and repeat-prevention before continuing.',correctiveAction:'Acknowledge, contain, assess data validity and disposition the test before release.',owner:data.settings?.actor||'Demo Lab Manager',liveAlertId:a.id};data.issues.push(issue);issueId=issue.id;a.issueId=issue.id;}
  let disruptionId=null;if(r.createDelay&&a.legId){const existing=(data.disruptions||[]).find(d=>d.sourceLiveAlertId===a.id);if(existing)disruptionId=existing.id;else{const d={id:`DSP-${String((data.disruptions||[]).length+1).padStart(3,'0')}`,type:'test_issue',status:'Active',programmeId:a.programmeId,legId:a.legId,equipmentId:leg?.equipmentId||null,reportedAt:now,effectiveUntil:addHours(now,r.defaultDelayHours||4),reason:`Live anomaly escalation: ${a.message}`,impactHours:r.defaultDelayHours||4,sourceIssueId:issueId,sourceLiveAlertId:a.id};data.disruptions.push(d);disruptionId=d.id;data.settings.planDirty=true;}}
  if(r.blockTest&&leg&&!['Completed','Cancelled','Failed'].includes(leg.status)){leg.status='Blocked';leg.blockingReason=`Critical live anomaly ${a.id}: ${a.message}`;data.settings.planDirty=true;}
  const event={id:`EVT-${String(data.operationalEvents.length+1).padStart(4,'0')}`,timestamp:now,sourceType:'Live alert',sourceId:a.id,programmeId:a.programmeId,legId:a.legId,severity:a.severity,status:'Open',title:`${a.type}: ${a.channelName}`,detail:a.message,issueId,disruptionId,escalationRuleId:r.id,requiredAckBy:addHours(now,r.slaMinutes/60),replanScope:r.replanScope,ownerRoles:r.notifyRoles};data.operationalEvents.push(event);
  for(const role of r.notifyRoles)data.notifications.push({id:`NTF-${String(data.notifications.length+1).padStart(4,'0')}`,timestamp:now,eventId:event.id,programmeId:a.programmeId,legId:a.legId,role,status:'Unread',severity:a.severity,title:`${a.severity} · ${event.title}`,message:`${p?.id||a.programmeId} ${leg?.id||a.legId}: ${a.message}`,dueAt:event.requiredAckBy});created++;
 }
 detectRecurringLessons(data);return created;}

export function recordOperationalIssueEvent(data,issue,{replanScope='Programme'}={}){ensureWorkflowState(data);if(data.operationalEvents.some(e=>e.sourceType==='Issue'&&e.sourceId===issue.id))return null;const r=ruleForSeverity(data,issue.severity),event={id:`EVT-${String(data.operationalEvents.length+1).padStart(4,'0')}`,timestamp:issue.reportedAt||new Date().toISOString(),sourceType:'Issue',sourceId:issue.id,programmeId:issue.programmeId,legId:issue.legId||null,severity:issue.severity||'Medium',status:'Open',title:issue.issueType||'Operational issue',detail:issue.description||'',issueId:issue.id,disruptionId:null,escalationRuleId:r.id,requiredAckBy:addHours(issue.reportedAt||new Date().toISOString(),r.slaMinutes/60),replanScope:r.replanScope==='None'?replanScope:r.replanScope,ownerRoles:r.notifyRoles};data.operationalEvents.push(event);for(const role of r.notifyRoles)data.notifications.push({id:`NTF-${String(data.notifications.length+1).padStart(4,'0')}`,timestamp:event.timestamp,eventId:event.id,programmeId:event.programmeId,legId:event.legId,role,status:'Unread',severity:event.severity,title:`${event.severity} · ${event.title}`,message:event.detail,dueAt:event.requiredAckBy});detectRecurringLessons(data);return event;}

export function acknowledgeOperationalEvent(data,eventId,actor='Demo Lab Manager'){ensureWorkflowState(data);const e=data.operationalEvents.find(x=>x.id===eventId);if(!e)return false;e.status='Acknowledged';e.acknowledgedAt=new Date().toISOString();e.acknowledgedBy=actor;for(const n of data.notifications.filter(n=>n.eventId===eventId))n.status='Read';return true;}

export function escalationSummary(data){ensureWorkflowState(data);const open=data.operationalEvents.filter(e=>e.status==='Open'),overdue=open.filter(e=>e.requiredAckBy&&new Date(e.requiredAckBy)<new Date()),critical=open.filter(e=>e.severity==='Critical'),high=open.filter(e=>e.severity==='High');return{open:open.length,overdue:overdue.length,critical:critical.length,high:high.length,unread:data.notifications.filter(n=>n.status==='Unread').length,planImpact:open.filter(e=>e.replanScope&&e.replanScope!=='None').length,events:open.sort((a,b)=>(severityRank[b.severity]||0)-(severityRank[a.severity]||0)||new Date(a.requiredAckBy)-new Date(b.requiredAckBy))};}

export function capturePlanningSnapshot(data,label='Planning snapshot'){ensureWorkflowState(data);const row={id:`PLSN-${String(data.planningSnapshots.length+1).padStart(4,'0')}`,timestamp:new Date().toISOString(),label,bookings:(data.bookings||[]).map(b=>({legId:b.legId,programmeId:b.programmeId,start:b.start,end:b.end,equipmentId:b.equipmentId,staffId:b.staffId,locked:b.locked})),programmeForecasts:(data.programmes||[]).map(p=>({programmeId:p.id,forecastCompletion:p.forecastCompletion,scheduleRisk:p.scheduleRisk}))};data.planningSnapshots.push(row);if(data.planningSnapshots.length>20)data.planningSnapshots=data.planningSnapshots.slice(-20);return row;}
export function planningDiff(before,data,{programmeId=null}={}){const old=Object.fromEntries((before?.bookings||[]).map(b=>[b.legId,b])),rows=[];for(const b of data.bookings||[]){if(programmeId&&b.programmeId!==programmeId)continue;const o=old[b.legId];if(!o){rows.push({legId:b.legId,programmeId:b.programmeId,type:'New booking',oldStart:null,newStart:b.start,oldEquipment:null,newEquipment:b.equipmentId,oldStaff:null,newStaff:b.staffId});continue;}if(o.start!==b.start||o.equipmentId!==b.equipmentId||o.staffId!==b.staffId)rows.push({legId:b.legId,programmeId:b.programmeId,type:'Moved',oldStart:o.start,newStart:b.start,oldEquipment:o.equipmentId,newEquipment:b.equipmentId,oldStaff:o.staffId,newStaff:b.staffId});}return rows;}

export function workflowHealth(data){ensureWorkflowState(data);const es=escalationSummary(data),ls=lessonSummary(data),issues=(data.issues||[]).filter(i=>i.status==='Open'),delays=(data.disruptions||[]).filter(d=>d.status==='Active');return{...es,openIssues:issues.length,activeDelays:delays.length,automaticLessons:ls.automatic,manualLessons:ls.manual,recurrences:ls.recurrences,lessonDelayHours:Math.round(ls.delayHours)};}
