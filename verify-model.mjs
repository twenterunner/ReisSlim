import { createDemoData, DEMO_NOW } from './data.js';
import { scheduleAll, applyPriority, manualMove } from './planner.js';
import { runDiagnostics, recomputeRequirementStatuses, calibrationStatus, calibrationAt, periodMetrics, issueAnalytics } from './diagnostics.js';
import { estimateLegCost, programmeCost, portfolioCost } from './costs.js';
import { existsSync } from 'node:fs';

function assert(ok, msg){ if(!ok) throw new Error(msg); console.log(`PASS  ${msg}`); }
function seedCompletedBookings(d){ for(const l of d.legs.filter(x=>x.status==='Completed'&&x.actualStart&&x.actualEnd)) d.bookings.push({id:`BKG-${l.id}`,legId:l.id,programmeId:l.programmeId,methodId:l.methodId,start:l.actualStart,end:l.actualEnd,staffEnd:l.actualEnd,equipmentId:l.equipmentId,staffId:l.staffId,locked:true,status:'Completed',priority:d.programmes.find(p=>p.id===l.programmeId)?.priority||'Normal',dueDate:l.dueDate,lateHours:0}); }

const started=performance.now();
let data=createDemoData(); seedCompletedBookings(data);
let run=scheduleAll(data,{recordAudit:false}); data=run.data; recomputeRequirementStatuses(data);
const elapsed=performance.now()-started;
const diag=runDiagnostics(data);
assert(diag.overall==='PASS',`System diagnostics ${diag.pass}/${diag.checks.length}`);
assert(data.programmes.length===10 && data.requirements.length===60 && data.legs.length===50 && data.duts.length===100, 'Seeded dataset scale is deterministic');
assert(data.methods.length===30 && data.equipment.length>=20 && data.staff.length===15 && data.calibrations.length>=30, 'Library/resource dataset scale is deterministic');

assert(data.specifications.length===10 && data.specifications.every(sp=>sp.documentPath||sp.fileData), 'Seeded test specifications are present and have viewable document references');
assert(data.testRuns.length>=100 && data.issues.length>=40, 'Period KPI and lessons-learned history is sufficiently populated');
const sampleDelay=data.disruptions.find(d=>d.id==='DSP-001'),sampleLeg=data.legs.find(l=>l.id===sampleDelay.legId);
assert(sampleLeg.plannedStart && new Date(sampleLeg.plannedStart)>=new Date(sampleDelay.effectiveUntil), 'Automatic planning respects active sample-availability delays');
const pm=periodMetrics(data,'2026-08-01','2026-09-04'),ia=issueAnalytics(data,'2026-08-01','2026-09-04');
assert(pm.completed>0 && pm.issues>0 && Number.isFinite(pm.onTimePct) && Number.isFinite(pm.equipmentUtil), 'Week/month/custom-period KPI engine reconciles executions, issues and utilisation');
assert(ia.topTypes.length>0 && ia.rootCauses.some(x=>x.name==='Test Execution') && ia.rootCauses.some(x=>x.name==='Bad Specification'), 'Automatic lessons learned separates execution causes from bad specifications');
const priorityMap=Object.fromEntries(data.programmes.map((p,i)=>[p.id,i===0?'Critical':i<4?'High':'Low']));
const priorityScenario=scheduleAll(data,{recordAudit:false,scenario:{type:'priority_mix',priorityMap,label:'verification priority mix'}});
assert(priorityScenario.diagnostics.moved.length>0, `Project-priority scenario materially changes the plan (${priorityScenario.diagnostics.moved.length} booking changes)`);
const tc04=data.equipment.find(e=>e.id==='TC-04'),tc04Now=calibrationStatus(tc04,data),tc04Future=calibrationAt(data,'TC-04','2026-09-15T08:00:00Z',{allowScheduled:true});
assert(tc04Now.calibration?.result!=='Scheduled' && new Date(tc04Now.calibration?.calibrationDate)<=DEMO_NOW, 'Current calibration status excludes future scheduled calibration');
assert(tc04Future?.id==='CAL-PLN-001', 'Future planning uses the scheduled recalibration only after its effective date');
assert(data.bookings.some(b=>b.batches>1), 'Equipment/DUT capacity creates deterministic multi-batch planning');
assert(data.legs.filter(l=>l.developmentTaskId && l.plannedStart).every(l=>new Date(l.plannedStart)>=new Date(data.devTasks.find(d=>d.id===l.developmentTaskId).dueDate)), 'Development-gated tests are not planned before forecast method release');
assert(data.legs.filter(l=>l.plannedStart&&l.predecessorIds.length).every(l=>l.predecessorIds.every(id=>{const p=data.legs.find(x=>x.id===id);return (p.actualEnd||p.plannedEnd)&&new Date(l.plannedStart)>=new Date(p.actualEnd||p.plannedEnd)})), 'Predecessor sequencing is respected');
const promoted=applyPriority(data,'VP-FOXTROT','Critical'); const reprioritised=scheduleAll(promoted,{recordAudit:false});
assert(reprioritised.diagnostics.moved.length>0, `Priority change materially replans schedule (${reprioritised.diagnostics.moved.length} booking changes)`);
const scenario=scheduleAll(data,{recordAudit:false,scenario:{type:'equipment_unavailable',equipmentId:'TC-01',start:'2026-09-04T08:00:00Z',end:'2026-09-11T17:00:00Z'}});
assert(scenario.diagnostics.moved.length>0, `Equipment-outage scenario changes plan (${scenario.diagnostics.moved.length} booking changes)`);
const b=data.bookings.find(x=>x.status==='Planned'); const method=data.methods.find(m=>m.id===b.methodId); const badStaff=data.staff.find(s=>!(s.equipmentQualifications||[]).includes(method.equipmentType));
assert(badStaff && !manualMove(data,b.id,{staffId:badStaff.id,equipmentId:b.equipmentId,start:b.start}).ok, 'Manual assignment rejects missing method/equipment authorisation');

const legCost=estimateLegCost(data,data.legs.find(l=>l.status!=='Completed'));
assert(legCost.total>0 && ['labour','equipment','consumables','external','development','overhead','contingency'].every(k=>Number.isFinite(legCost[k])&&legCost[k]>=0), 'Test-leg cost framework produces finite non-negative component costs');
const alphaCost=programmeCost(data,'VP-ALPHA'),portCost=portfolioCost(data);
assert(alphaCost.forecast>0 && alphaCost.legs.length>0 && portCost.programmes.length===data.programmes.length && portCost.totalForecast>0, 'Programme and portfolio cost roll-ups reconcile to canonical test legs');
assert(data.legs.filter(l=>l.status!=='Completed'&&l.plannedStart&&l.sampleReadyDate).every(l=>new Date(l.plannedStart)>=new Date(l.sampleReadyDate)), 'All future planned legs respect project sample-ready inputs');
assert(data.legs.filter(l=>l.plannedStart).every(l=>{const p=data.programmes.find(p=>p.id===l.programmeId),sp=data.specifications.filter(s=>s.programmeId===l.programmeId);return (p?.gateStatus||'Released')==='Released'&&(!sp.length||sp.some(s=>s.status==='Released'))}), 'Draft/unreleased programme and specification gates do not consume planned capacity');
const exampleFiles=['LabOS-Test-Programme-Template.pdf','LabOS-Cost-Framework-Guide.pdf','LabOS-Sample-Test-Report.pdf','LabOS-Method-Development-Plan.pdf','LabOS-Cost-Rate-Card.csv','LabOS-Test-Programme-Template.csv'];
assert(exampleFiles.every(f=>existsSync(new URL(f,import.meta.url))), 'Operational example documents/templates are included');

const roundtrip=JSON.parse(JSON.stringify(data));
assert(roundtrip.requirements.length===data.requirements.length && roundtrip.bookings.length===data.bookings.length, 'Full JSON state round-trip preserves canonical records');
assert(elapsed<2000, `Initial deterministic planning completes comfortably (${elapsed.toFixed(1)} ms)`);
console.log(`\nRESULT: PASS · ${diag.pass}/${diag.checks.length} in-app integrity checks plus extended model verification`);
