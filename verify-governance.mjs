import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDemoData, cloneData } from './data.js';
import { scheduleAll, validateBooking } from './planner.js';
import { closureContractFor, ensureGovernedAction, refreshGovernedAction, recordGateEvidence, actionCanClose, actionProgress } from './implementation-governance.js';

const results=[];
function test(name,fn){try{fn();results.push({name,passed:true});}catch(err){results.push({name,passed:false,error:err?.stack||err?.message||String(err)});}}
function gate(action,id){return [...action.closureContract.implementation,...action.closureContract.effectiveness].find(g=>g.id===id)}
const acceptedAt='2026-09-06T12:00:00Z';

function equipmentAction(){
 const a={id:'INT-ACT-T-EQ',origin:'planning',planningKind:'equipment',proposalType:'planning_equipment',title:'Add duplicate Climatic Chamber',acceptedAt,owner:'Test',implementation:{},targetEquipmentType:'Climatic Chamber'};
 a.closureContract=closureContractFor({source:'planning',kind:'equipment',title:a.title,targetEquipmentType:a.targetEquipmentType});ensureGovernedAction(a);return a;
}

test('Accepting equipment capacity proposal alone cannot close it',()=>{
 const d=createDemoData(),a=equipmentAction();refreshGovernedAction(d,a);const p=actionProgress(a);assert.equal(a.status,'Implementation pending');assert.equal(p.implementationDone,0);assert.equal(p.effectivenessDone,0);assert.equal(actionCanClose(a),false);
});

test('Registering a real setup satisfies only the asset-exists gate',()=>{
 const d=createDemoData(),a=equipmentAction();d.equipment.push({id:'NEW-99',name:'Climatic Chamber additional setup',type:'Climatic Chamber',status:'Commissioning',capacity:1,calibrationRequired:true,createdAt:'2026-09-06T12:30:00Z',createdFromActionId:a.id,commissionedAt:null,commissioningEvidence:''});refreshGovernedAction(d,a);assert.equal(a.implementation.equipmentId,'NEW-99');assert.equal(gate(a,'asset_registered').status,'Satisfied');assert.equal(gate(a,'commissioning_complete').status,'Pending');assert.equal(gate(a,'calibration_valid').status,'Pending');assert.equal(actionCanClose(a),false);
});

test('Commissioning without calibration still cannot activate the closure chain',()=>{
 const d=createDemoData(),a=equipmentAction(),eq={id:'NEW-99',name:'Climatic Chamber additional setup',type:'Climatic Chamber',status:'Available',capacity:1,calibrationRequired:true,createdAt:'2026-09-06T12:30:00Z',createdFromActionId:a.id,commissionedAt:'2026-09-06T13:00:00Z',commissioningEvidence:'COMM-NEW-99-001 · SAT/OQ passed'};d.equipment.push(eq);refreshGovernedAction(d,a);assert.equal(gate(a,'commissioning_complete').status,'Satisfied');assert.equal(gate(a,'calibration_valid').status,'Pending');assert.equal(a.status,'Implementation pending');
});

test('Equipment action becomes Ready to close only after physical, calibration, usage and effectiveness evidence',()=>{
 const d=createDemoData(),a=equipmentAction(),eq={id:'NEW-99',name:'Climatic Chamber additional setup',type:'Climatic Chamber',status:'Available',capacity:1,calibrationRequired:true,createdAt:'2026-09-06T12:30:00Z',createdFromActionId:a.id,commissionedAt:'2026-09-06T13:00:00Z',commissioningEvidence:'COMM-NEW-99-001 · SAT/OQ passed'};d.equipment.push(eq);d.calibrations.push({id:'CAL-NEW-99',equipmentId:eq.id,calibrationDate:'2026-09-06T14:00:00Z',dueDate:'2027-09-06T14:00:00Z',result:'Pass',certificateNumber:'CERT-NEW-99'});d.testRuns.push({id:'RUN-NEW-99',status:'Completed',equipmentId:eq.id,methodId:'ENV-TC-01',legId:'LEG-X',staffId:'S001',actualEnd:'2026-09-07T16:00:00Z'});refreshGovernedAction(d,a);assert.equal(gate(a,'asset_registered').status,'Satisfied');assert.equal(gate(a,'commissioning_complete').status,'Satisfied');assert.equal(gate(a,'calibration_valid').status,'Satisfied');assert.equal(gate(a,'capacity_used').status,'Satisfied');assert.equal(a.status,'Implemented · monitoring');assert.equal(actionCanClose(a),false);recordGateEvidence(a,'effectiveness_review',{evidence:'Measured queue time reduced from 5.2 d to 2.1 d after the additional setup entered service.',evidenceRef:'CAPREV-NEW-99-001',actor:'Lab Manager'});refreshGovernedAction(d,a);assert.equal(a.status,'Ready to close');assert.equal(actionCanClose(a),true);assert.notEqual(a.status,'Closed · effective','Ready-to-close must remain a separate state until the explicit close action');
});

test('Commissioning-state equipment is a hard deterministic planning constraint',()=>{
 let d=createDemoData();d=scheduleAll(d,{recordAudit:false}).data;const b=d.bookings.find(x=>x.equipmentId&&x.staffId);assert.ok(b,'expected a scheduled booking');const eq=d.equipment.find(x=>x.id===b.equipmentId);eq.status='Commissioning';const r=validateBooking(d,{legId:b.legId,equipmentId:b.equipmentId,staffId:b.staffId,start:b.start,end:b.end,ignoreBookingId:b.id});assert.equal(r.ok,false);assert.ok(r.reasons.some(x=>/commissioning/i.test(x)),`expected commissioning reason; got ${r.reasons.join(' | ')}`);
});

test('Staff reallocation requires controlled assignment and actual executed-work evidence',()=>{
 let d=createDemoData();d=scheduleAll(d,{recordAudit:false}).data;const b=d.bookings[0];assert.ok(b);const a={id:'INT-ACT-T-ST',origin:'planning',planningKind:'staff',proposalType:'planning_staff',title:'Reallocate technician',acceptedAt:'2026-09-01T00:00:00Z',implementation:{legId:b.legId,toStaffId:b.staffId}};a.closureContract=closureContractFor({source:'planning',kind:'staff',title:a.title});ensureGovernedAction(a);refreshGovernedAction(d,a);assert.equal(gate(a,'staff_assignment_applied').status,'Satisfied');assert.equal(gate(a,'staff_execution_confirmed').status,'Pending');d.testRuns.push({id:'RUN-STAFF-EVID',status:'Completed',legId:b.legId,methodId:b.methodId,staffId:b.staffId,equipmentId:b.equipmentId,actualEnd:'2026-09-08T17:00:00Z'});refreshGovernedAction(d,a);assert.equal(gate(a,'staff_execution_confirmed').status,'Satisfied');assert.equal(a.status,'Implemented · monitoring');assert.equal(actionCanClose(a),false);
});

test('Acknowledging live alerts is not effectiveness evidence',()=>{
 const d=createDemoData();d.liveAlerts=[{id:'AL-1',status:'Acknowledged'},{id:'AL-2',status:'Acknowledged'}];d.qualityEvents=[];const a={id:'INT-ACT-T-Q',origin:'intelligence',proposalType:'integrated_investigation',title:'Investigate anomaly',acceptedAt,sourceAlertIds:['AL-1','AL-2'],implementation:{}};a.closureContract=closureContractFor({source:'intelligence',proposalType:'integrated_investigation',title:a.title});ensureGovernedAction(a);refreshGovernedAction(d,a);assert.equal(gate(a,'signals_cleared').status,'Pending');d.liveAlerts.forEach(x=>x.status='Closed');refreshGovernedAction(d,a);assert.equal(gate(a,'signals_cleared').status,'Satisfied');
});

test('Manual closure gates reject empty evidence',()=>{
 const a={id:'INT-ACT-T-G',origin:'intelligence',proposalType:'generic',title:'Generic action',acceptedAt,implementation:{}};ensureGovernedAction(a);assert.throws(()=>recordGateEvidence(a,'controlled_change_released',{evidence:'',evidenceRef:''}),/evidence/i);assert.throws(()=>recordGateEvidence(a,'controlled_change_released',{evidence:'Change completed',evidenceRef:''}),/reference/i);assert.equal(actionCanClose(a),false);
});

test('A recurrence after preventive implementation explicitly fails effectiveness',()=>{
 const d=createDemoData();d.issues=[];d.testRuns=[];const matchingLeg=d.legs.find(l=>l.methodId);assert.ok(matchingLeg);const a={id:'INT-ACT-T-PREV',origin:'intelligence',proposalType:'method_prevention',title:'Prevent setup recurrence',acceptedAt:'2026-09-01T00:00:00Z',methodId:matchingLeg.methodId,issueType:'Deviation',rootCause:'Test Execution',implementation:{}};a.closureContract=closureContractFor({source:'intelligence',proposalType:a.proposalType,title:a.title,methodId:a.methodId});ensureGovernedAction(a);recordGateEvidence(a,'controlled_change_released',{evidence:'WI revised and released',evidenceRef:'WI-ENV-004 Rev C'});recordGateEvidence(a,'people_ready',{evidence:'Operators trained and acknowledged',evidenceRef:'TRN-ENV-004-2026'});for(let i=0;i<3;i++)d.testRuns.push({id:`RUN-P-${i}`,status:'Completed',methodId:a.methodId,actualEnd:`2026-09-0${3+i}T16:00:00Z`});refreshGovernedAction(d,a);assert.equal(gate(a,'three_runs_no_recurrence').status,'Satisfied');d.issues.push({id:'ISS-REC',reportedAt:'2026-09-07T12:00:00Z',issueType:'Deviation',rootCause:'Test Execution',legId:matchingLeg.id});refreshGovernedAction(d,a);assert.equal(gate(a,'three_runs_no_recurrence').status,'Failed');assert.equal(a.status,'Effectiveness failed');assert.equal(actionCanClose(a),false);
});

test('Generic accepted action remains implementation-pending until objective gate evidence exists',()=>{
 const d=createDemoData(),a={id:'INT-ACT-T-G2',origin:'intelligence',proposalType:'generic',title:'Update controlled process',acceptedAt,implementation:{}};ensureGovernedAction(a);refreshGovernedAction(d,a);assert.equal(a.status,'Implementation pending');recordGateEvidence(a,'controlled_change_released',{evidence:'Controlled process change completed',evidenceRef:'CHG-2026-044'});refreshGovernedAction(d,a);assert.equal(a.status,'Implemented · monitoring');recordGateEvidence(a,'effectiveness_review',{evidence:'30-day review confirms intended outcome',evidenceRef:'REV-2026-044'});refreshGovernedAction(d,a);assert.equal(a.status,'Ready to close');assert.equal(actionCanClose(a),true);
});



test('App review flow explicitly separates Accept from closure',()=>{const app=fs.readFileSync('./app.js','utf8');assert.ok(app.includes('Accept = approve the action, not close it.'));assert.ok(app.includes('Accept · start implementation'));assert.ok(app.includes('Closure locked'));assert.ok(app.includes('intelligence-close-action'));});

test('Equipment-capacity approval creates implementation workflow and no fictional asset',()=>{const app=fs.readFileSync('./app.js','utf8');assert.ok(app.includes('no fictional equipment created'));assert.ok(app.includes('Register actual additional setup'));assert.ok(app.includes('Record commissioning evidence'));assert.ok(app.includes('Record calibration result'));});

test('New implementation module is cached for offline PWA use and release version is consistent',()=>{const sw=fs.readFileSync('./service-worker.js','utf8'),pkg=JSON.parse(fs.readFileSync('./package.json','utf8')),data=fs.readFileSync('./data.js','utf8');assert.ok(sw.includes("labos-v1.17.0"));assert.ok(sw.includes('./implementation-governance.js'));assert.equal(pkg.version,'1.17.0');assert.ok(data.includes("APP_VERSION = '1.17.0'"));});
const failed=results.filter(x=>!x.passed);
for(const r of results)console.log(`${r.passed?'PASS':'FAIL'}  ${r.name}${r.passed?'':`\n  ${r.error}`}`);
console.log(`\nImplementation governance: ${results.length-failed.length}/${results.length} passed`);
if(failed.length)process.exit(1);
