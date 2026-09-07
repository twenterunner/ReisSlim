import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDemoData } from './data.js';
import { scheduleAll } from './planner.js';
import { ensureLiveState } from './live.js';
import { ensureWorkflowState, syncLiveEscalations, detectRecurringLessons } from './workflow.js';
import { ensureAdvancedState } from './advanced.js';
import { ensureTimeLearningState } from './intelligence.js';
import { ensureDecisionIntelligenceState, generateDecisionIntelligence, intelligenceStateSignature } from './decision-intelligence.js';

const results=[];
function test(name,fn){try{fn();results.push({name,passed:true});}catch(err){results.push({name,passed:false,error:err.message});}}

let state=createDemoData();
ensureAdvancedState(state);
ensureTimeLearningState(state);
ensureWorkflowState(state);
ensureLiveState(state);
syncLiveEscalations(state);
detectRecurringLessons(state);
ensureDecisionIntelligenceState(state);
state=scheduleAll(state,{recordAudit:false}).data;
ensureAdvancedState(state);ensureTimeLearningState(state);ensureWorkflowState(state);ensureLiveState(state);syncLiveEscalations(state);detectRecurringLessons(state);ensureDecisionIntelligenceState(state);
const bundle=generateDecisionIntelligence(state,{maxCases:50});

const openAlerts=state.liveAlerts.filter(x=>!['Closed','Resolved'].includes(x.status));
const grouped=new Map();
for(const a of openAlerts){const k=`${a.programmeId}|${a.legId}`;grouped.set(k,(grouped.get(k)||0)+1)}
const multi=[...grouped].find(([,count])=>count>1);

test('Decision intelligence produces current cases',()=>assert.ok(bundle.cases.length>0));
test('Raw live signals are correlated by programme + leg',()=>{
 assert.ok(multi,'demo must contain a multi-alert leg');
 const [key,count]=multi; const [programmeId,legId]=key.split('|');
 const cases=bundle.cases.filter(c=>c.kind==='live'&&c.programmeId===programmeId&&c.legId===legId);
 assert.equal(cases.length,1);
 assert.ok(cases[0].signals.alerts.length>=count);
});
test('Live case is an actionable integrated investigation, not a raw alert',()=>{
 const c=bundle.cases.find(x=>x.kind==='live');assert.ok(c);assert.equal(c.proposalType,'integrated_investigation');assert.ok(c.proposal.length>30);assert.ok(c.verification.length>20);assert.ok(c.confidence>=55);
});
test('Recurring lessons become prevention proposals',()=>{
 const auto=state.lessonsLearned.filter(x=>x.source==='Automatic'&&(x.occurrences||0)>=2);assert.ok(auto.length>0);
 const proposals=bundle.cases.filter(x=>x.kind==='learning'&&x.proposalType!=='standard_time_update');assert.ok(proposals.length>0);
 assert.ok(proposals.some(x=>/prevention|readiness|review|reliability|capacity|development/i.test(x.proposal)));
});
test('Learned standard-time drift can generate a planning accuracy proposal',()=>{
 const m=state.methods.find(x=>x.active);assert.ok(m);
 const runs=state.testRuns.filter(r=>r.methodId===m.id&&r.status==='Completed');
 if(runs.length<5){
   const base=state.testRuns.find(r=>r.status==='Completed');
   for(let i=runs.length;i<5;i++) state.testRuns.push({...base,id:`TEST-LEARN-${i}`,methodId:m.id,status:'Completed',setupHoursActual:10,executionHoursActual:10,teardownHoursActual:5,analysisHoursActual:5});
 }
 m.setupHours=.1;m.executionHours=.1;m.teardownHours=.1;m.analysisHours=.1;
 ensureTimeLearningState(state);
 const b=generateDecisionIntelligence(state,{maxCases:200});
 assert.ok(b.cases.some(c=>c.proposalType==='standard_time_update'&&c.methodId===m.id));
});
test('Rejected-case evidence signature changes when evidence changes',()=>{
 const before=intelligenceStateSignature(state);
 state.issues.push({id:'ISS-INT-VERIFY',reportedAt:new Date().toISOString(),programmeId:'VP-ALPHA',legId:'LEG-002',issueType:'Live anomaly · verification',rootCause:'Test Execution',severity:'High',delayHours:1,status:'Open',description:'verification evidence change'});
 const after=intelligenceStateSignature(state);assert.notEqual(before,after);
});
test('Generating intelligence does not directly mutate the schedule',()=>{
 const before=JSON.stringify(state.bookings);
 generateDecisionIntelligence(state,{maxCases:50});
 assert.equal(JSON.stringify(state.bookings),before);
});

test('Integrated UI actions are wired',()=>{
 const src=fs.readFileSync('./app.js','utf8');
 for(const token of ["data-act=\"intelligence-review\"","data-act=\"intelligence-reject\"","a==='intelligence-review'","a==='intelligence-evidence'","a==='intelligence-action'","a==='intelligence-scan'"]) assert.ok(src.includes(token),token);
});
test('Quality and control views are case-centric rather than the old raw-ledger headings',()=>{
 const src=fs.readFileSync('./app.js','utf8');
 const q0=src.indexOf('function renderQualityHub()'),q1=src.indexOf('function renderPlanning()',q0),quality=src.slice(q0,q1);
 assert.ok(quality.includes('Actionable cases & prevention proposals'));
 assert.ok(quality.includes('Raw records are evidence, not the work queue'));
 assert.ok(!quality.includes('Evidence-gated quality work'));
 assert.ok(!quality.includes('Recurring lessons'));
 assert.ok(!quality.includes('Escalation / delay chain'));
 const c0=src.indexOf('function renderControl()'),c1=src.indexOf('async function handleAction',c0),control=src.slice(c0,c1);
 assert.ok(control.includes('Operational decision cases'));
 assert.ok(control.includes('Source event ledger'));
});


test('Home uses the integrated decision inbox instead of the old per-alert attention queue',()=>{
 const src=fs.readFileSync('./app.js','utf8');const h0=src.indexOf('function renderHomeV100()'),h1=src.indexOf('function render(){',h0),home=src.slice(h0,h1);
 assert.ok(home.includes('Decision & improvement inbox'));assert.ok(home.includes('LabOS Intelligence active'));assert.ok(!home.includes('Needs your attention'));
});
test('Primary route render functions are all defined after integration',()=>{
 const src=fs.readFileSync('./app.js','utf8');for(const name of ['renderHomeV100','renderProgrammesV100','renderPlanningV100','renderExecutionHub','renderQualityHub','renderLabV100','renderInsightsV100','renderResourcesHub','renderMetrologyService','renderAnalyticsHub'])assert.ok(src.includes(`function ${name}(`),name);
});
test('Service worker caches the decision-intelligence module',()=>{
 const sw=fs.readFileSync('./service-worker.js','utf8');assert.ok(sw.includes('./decision-intelligence.js'));assert.ok(sw.includes('./implementation-governance.js'));assert.ok(sw.includes("labos-v1.17.0"));
});

const failed=results.filter(x=>!x.passed);
for(const r of results) console.log(`${r.passed?'PASS':'FAIL'}  ${r.name}${r.error?` — ${r.error}`:''}`);
console.log(`\n${results.length-failed.length}/${results.length} passed`);
if(failed.length) process.exit(1);
