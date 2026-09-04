import { DEMO_NOW, dayISO, addHours } from './data.js';

const HOURS_DAY=24, MS_DAY=86400000;
const n=v=>Number(v)||0;
const iso=d=>new Date(d).toISOString();
const overlap=(a,b,c,d)=>new Date(a)<new Date(d)&&new Date(b)>new Date(c);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export const AUDIT_STANDARDS={
 'ISO17025':{name:'ISO/IEC 17025:2017',edition:'2017',note:'Internal readiness checklist based on clause themes; licensed standard text is not reproduced.',items:[
  ['4.1','Impartiality','Governance','Risks to impartiality are identified, reviewed and controlled.'],
  ['4.2','Confidentiality','Governance','Customer and laboratory information is protected and disclosure controls are defined.'],
  ['5','Structural requirements','Governance','Laboratory responsibilities, authority and organizational interfaces are defined.'],
  ['6.2','Personnel competence','Resources','Competence, qualification, authorisation and ongoing monitoring are controlled.'],
  ['6.3','Facilities & environmental conditions','Resources','Facilities and environmental conditions are suitable, monitored and recorded where relevant.'],
  ['6.4','Equipment','Resources','Equipment is suitable, identified, maintained, calibrated where required and protected from invalid use.'],
  ['6.5','Metrological traceability','Resources','Measurement traceability is established and supported by appropriate calibration/reference evidence.'],
  ['6.6','Externally provided products/services','Resources','External suppliers affecting laboratory results are evaluated and controlled.'],
  ['7.1','Review of requests / contracts','Process','Test demand is reviewed for method, capability, capacity, acceptance criteria and customer needs before commitment.'],
  ['7.2','Methods & method validation','Process','Methods are controlled by revision and non-standard/laboratory-developed methods are validated before routine use.'],
  ['7.3','Sampling','Process','Where sampling is performed, plans, methods, records and sample identity are defined and controlled.'],
  ['7.4','Handling of test items','Process','DUT/sample identity, condition, storage, handling and disposition are controlled.'],
  ['7.5','Technical records','Process','Technical records preserve sufficient information to reconstruct test execution and evidence.'],
  ['7.6','Measurement uncertainty','Process','Measurement uncertainty is evaluated where relevant to validity or decision rules.'],
  ['7.7','Validity of results','Process','Quality-control activities are used to monitor and demonstrate validity of results.'],
  ['7.8','Reporting of results','Process','Reports are complete, traceable, reviewed and clearly identify results and relevant conditions.'],
  ['7.9','Complaints','Process','Complaints are received, evaluated, investigated, tracked and resolved with appropriate independence.'],
  ['7.10','Nonconforming work','Process','Nonconforming laboratory work is controlled, impact assessed and dispositioned.'],
  ['7.11','Data & information management','Process','Laboratory information systems and calculations are protected, validated and controlled.'],
  ['8.2','Management-system documentation','Management system','Policies, objectives and management-system information needed for consistent laboratory operation are defined and maintained.'],
  ['8.3','Control of management-system documents','Management system','Management-system documents are approved, current at point of use and protected from unintended use of obsolete information.'],
  ['8.4','Control of records','Management system','Records are identified, retained, protected, retrievable and dispositioned in a controlled manner.'],
  ['8.5','Risks & opportunities','Management system','Risks and opportunities affecting laboratory objectives are identified and acted upon.'],
  ['8.6','Improvement','Management system','Improvement opportunities and customer/laboratory feedback are evaluated and used to improve the management system.'],
  ['8.7','Corrective actions','Management system','Root cause, action, effectiveness and recurrence prevention are demonstrated for nonconformities.'],
  ['8.8','Internal audits','Management system','Internal audits cover the management system and laboratory activities on a planned basis.'],
  ['8.9','Management reviews','Management system','Management review uses performance, risk, resources, complaints, audit and improvement inputs.']
 ]},
 'IATF16949':{name:'IATF 16949:2016',edition:'2016',note:'Internal laboratory/process readiness checklist based on automotive QMS themes; licensed IATF/ISO text and OEM CSRs are not reproduced.',items:[
  ['4.4','QMS process effectiveness','QMS','Laboratory processes, interfaces, measures, risks and process ownership are defined and effective.'],
  ['4.4.1.2','Product safety support','QMS','Product-safety related validation requirements receive defined responsibility, escalation and evidence controls where applicable.'],
  ['5.1','Leadership & customer focus','Leadership','Management demonstrates ownership of customer, quality, delivery and laboratory performance.'],
  ['6.1','Risk analysis & contingency','Planning','Capacity, equipment, utilities, staffing, calibration and supplier risks have contingency controls.'],
  ['7.1.3','Infrastructure','Support','Infrastructure is adequate for product/process validation and planned growth.'],
  ['7.1.4','Environment for process operation','Support','Environmental and housekeeping conditions support reliable test execution.'],
  ['7.1.5','Monitoring & measuring resources','Support','Measurement resources are suitable, calibrated/verified and traceable as required.'],
  ['7.1.5.1.1','Measurement-system analysis','Support','Relevant measurement systems are evaluated for suitability and variation before product decisions.'],
  ['7.1.5.2.1','Calibration / verification records','Support','Calibration and verification records preserve identity, status, traceability, changes and out-of-tolerance impact where applicable.'],
  ['7.1.5.3.1','Internal laboratory scope','Support','The internal laboratory has a defined scope, competent personnel, suitable methods/equipment and controlled records for the services it performs.'],
  ['7.1.5.3.2','External laboratory control','Support','External laboratory services are selected and controlled against applicable qualification/accreditation and customer requirements.'],
  ['7.2','Competence & qualification','Support','Personnel performing validation and review activities are competent and appropriately authorised.'],
  ['7.2.3','Internal auditor competency','Support','Internal auditors are selected and maintained as competent for the processes and requirements they audit.'],
  ['7.5','Documented information','Support','Specifications, methods, revisions, records and externally-originated documents are controlled.'],
  ['8.1','Operational planning & control','Operations','Validation demand is planned against resources, timing, criteria, risks and changes.'],
  ['8.3','Design/development validation','Operations','Validation plans demonstrate requirement coverage and objective evidence for design outputs.'],
  ['8.5.1','Controlled execution','Operations','Test execution uses released instructions, suitable resources and controlled process conditions.'],
  ['8.5.1.5','Total productive maintenance','Operations','Equipment maintenance is planned, measured and aligned to operational risk and capacity.'],
  ['8.5.6','Change control','Operations','Changes to methods, specifications, equipment, software and test conditions are reviewed for impact.'],
  ['8.6','Release / approval','Operations','Results and reports receive defined verification/review before release.'],
  ['8.7','Nonconforming outputs','Operations','Failed/nonconforming results, samples and invalid test work are contained and dispositioned.'],
  ['9.1','Performance evaluation','Performance','Quality, delivery, capacity, cost, reliability and customer-related laboratory metrics are reviewed.'],
  ['9.2','Internal audit','Performance','Internal audits cover system, process and relevant product/test evidence with risk-based frequency.'],
  ['9.3','Management review','Performance','Management reviews performance trends, resource adequacy, risks, audit results and improvement actions.'],
  ['10.2','Problem solving / corrective action','Improvement','Problems are contained, root-caused, corrected and verified for effectiveness and recurrence prevention.'],
  ['CSR','Customer-specific requirements','Customer','Applicable customer-specific requirements are identified and incorporated into validation/test controls.']
 ]}
};

function auditItemsFor(std){return (AUDIT_STANDARDS[std]||AUDIT_STANDARDS.ISO17025).items.map((x,i)=>({id:`${std}-${String(i+1).padStart(2,'0')}`,reference:x[0],title:x[1],section:x[2],expectation:x[3],status:'Not Audited',evidence:'',finding:'',owner:'',dueDate:null,lastAssessed:null}));}
function auditSeed(std,index){const a={id:`AUD-${std==='ISO17025'?'17025':'IATF'}-${index}`,standard:std,name:index===1?'2026 Laboratory Readiness Audit':'Follow-up Audit',scope:'Engineering validation laboratory operations',auditor:'Hugo Pereira',plannedDate:dayISO(std==='ISO17025'?14:28,9),status:'In Progress',items:auditItemsFor(std),createdAt:DEMO_NOW.toISOString(),closedAt:null};return a;}

export function ensureOperationsState(data){
 const seedOpp=!data.opportunities;
 data.opportunities=data.opportunities||[
  {id:'OPP-001',name:'Project Kestrel EV Sensor',customer:'Northstar Mobility',product:'HV current sensor',probability:75,expectedStart:dayISO(35,8),dueDate:dayISO(125,17),status:'Qualified',similarProgrammeId:'VP-ALPHA',profileCategories:['Electrical','Temperature','Humidity','Vibration'],expectedMethodIds:['ELEC-001','ENV-TC-004','ENV-HU-003','MECH-VIB-006','ELEC-002'],notes:'RFQ shortlisted; environmental validation similar to Alpha.'},
  {id:'OPP-002',name:'Project Orion Radar Module',customer:'Apex Automotive',product:'Radar electronics module',probability:45,expectedStart:dayISO(55,8),dueDate:dayISO(165,17),status:'Proposal',similarProgrammeId:'VP-DELTA',profileCategories:['Electrical','EMC','Temperature','Software/Firmware'],expectedMethodIds:['ELEC-001','EMC-007','EMC-008','ENV-HT-008','SW-009'],notes:'EMC-intensive programme; potential specialist constraint.'},
  {id:'OPP-003',name:'Project Nimbus Connector',customer:'Helix Systems',product:'Sealed connector',probability:60,expectedStart:dayISO(20,8),dueDate:dayISO(110,17),status:'Qualified',similarProgrammeId:'VP-FOXTROT',profileCategories:['Mechanical','Durability','Environmental','Reliability'],expectedMethodIds:['MECH-TENS-002','MECH-DUR-009','IP-005','ENV-TS-002'],notes:'Expected durability and ingress demand.'},
  {id:'OPP-004',name:'Project Solace Optical Node',customer:'Lumina Tech',product:'Optical sensing node',probability:30,expectedStart:dayISO(80,8),dueDate:dayISO(190,17),status:'Early',similarProgrammeId:'VP-GOLF',profileCategories:['Optical','Failure Analysis','Temperature'],expectedMethodIds:['OPT-002','THERM-IR-003','Xray-002','FA-004'],notes:'Low-confidence pipeline, specialist equipment demand.'},
  {id:'OPP-005',name:'Project Atlas Pressure Sensor',customer:'Vector Controls',product:'Pressure sensor Gen 4',probability:85,expectedStart:dayISO(15,8),dueDate:dayISO(105,17),status:'Negotiation',similarProgrammeId:'VP-INDIA',profileCategories:['Reliability','Temperature','Electrical'],expectedMethodIds:['PRESS-001','ENV-TC-004','ELEC-001','ELEC-002'],notes:'High probability; pressure specialist is single-point competency.'},
  {id:'OPP-006',name:'Project Cedar Control Unit',customer:'GreenLine Mobility',product:'Body control unit',probability:50,expectedStart:dayISO(70,8),dueDate:dayISO(170,17),status:'Proposal',similarProgrammeId:'VP-BETA',profileCategories:['Electrical','Software/Firmware','EMC','Reliability'],expectedMethodIds:[],notes:'Plan not released; resource estimate inferred from similar programme.'}
 ];
 const seedMaintenance=!data.maintenancePolicies;
 data.maintenancePolicies=data.maintenancePolicies||data.equipment.map((e,i)=>({id:`MP-${e.id}`,equipmentId:e.id,intervalDays:[90,120,180,365][i%4],durationHours:[4,8,8,12][i%4],criticality:['High','Medium','Medium','Low'][i%4],lastMaintenanceDate:dayISO(-(45+(i*17)%240),12),nextDueDate:dayISO([18,28,42,65,90,120][i%6],17),conditionScore:clamp(92-(i*7)%58,35,98),failureRisk:['Low','Low','Medium','Medium','High'][i%5],strategy:i%3===0?'Condition + time based':'Time based',locked:false}));
 const special={
  'VIB-02':{nextDueDate:dayISO(9,17),conditionScore:48,failureRisk:'High',criticality:'Critical',durationHours:8},
  'TC-01':{nextDueDate:dayISO(16,17),conditionScore:61,failureRisk:'Medium',criticality:'High',durationHours:12},
  'EMC-01':{nextDueDate:dayISO(23,17),conditionScore:72,failureRisk:'Medium',criticality:'Critical',durationHours:8},
  'REL-01':{nextDueDate:dayISO(31,17),conditionScore:56,failureRisk:'High',criticality:'High',durationHours:8}
 };
 if(seedMaintenance){for(const [id,patch] of Object.entries(special)){const p=data.maintenancePolicies.find(x=>x.equipmentId===id);if(p)Object.assign(p,patch);}const seededWindows=[['VIB-02',7,8],['TC-01',13,12],['EMC-01',20,8]];for(const [eqId,offset,hours] of seededWindows){const pol=data.maintenancePolicies.find(x=>x.equipmentId===eqId),start=dayISO(offset,8);if(pol&&!data.maintenance.some(m=>m.policyId===pol.id))data.maintenance.push({id:`PMEV-${eqId}`,equipmentId:eqId,start,end:addHours(start,hours),type:'Preventive Maintenance',reason:'Seeded preventive-maintenance window · run optimizer to improve against current demand',policyId:pol.id,status:'Planned',optimized:false});}}
 const seedAudits=!data.audits;
 data.audits=data.audits||[auditSeed('ISO17025',1),auditSeed('IATF16949',1)];
 data.auditActions=data.auditActions||[];
 data.settings=data.settings||{};data.settings.auditStandard=data.settings.auditStandard||'ISO17025';data.settings.capacityHorizon=data.settings.capacityHorizon||12;data.settings.pipelineMode=data.settings.pipelineMode||'weighted';
 if(seedAudits){autoAssessAudit(data,data.audits.find(a=>a.standard==='ISO17025')?.id,{record:false});autoAssessAudit(data,data.audits.find(a=>a.standard==='IATF16949')?.id,{record:false});}
 return data;
}

export function programmeMethodIds(data,pid){return [...new Set(data.legs.filter(l=>l.programmeId===pid).map(l=>l.methodId).filter(Boolean))];}
function learnedN(m,key){const learnedKey={setupHours:'learnedSetupHours',executionHours:'learnedExecutionHours',teardownHours:'learnedTeardownHours',analysisHours:'learnedAnalysisHours'}[key];return n(m?.learningRuns)>=3&&Number.isFinite(Number(m?.[learnedKey]))?n(m[learnedKey]):n(m?.[key]);}
function methodEqHours(m){return learnedN(m,'setupHours')+learnedN(m,'executionHours')+learnedN(m,'teardownHours');}
function programmeCategories(data,pid){return [...new Set(programmeMethodIds(data,pid).map(id=>data.methods.find(m=>m.id===id)?.category).filter(Boolean))];}
function jaccard(a,b){const A=new Set(a),B=new Set(b),u=new Set([...A,...B]);if(!u.size)return 0;let x=0;for(const v of A)if(B.has(v))x++;return x/u.size;}
export function inferOpportunityPlan(data,opp){
 let ids=(opp.expectedMethodIds||[]).filter(id=>data.methods.some(m=>m.id===id));let source='Expected validation plan',similarity=1,similarProgrammeId=opp.similarProgrammeId||null;
 if(!ids.length){const candidates=data.programmes.map(p=>({id:p.id,score:jaccard(opp.profileCategories||[],programmeCategories(data,p.id))})).sort((a,b)=>b.score-a.score);const best=(opp.similarProgrammeId&&candidates.find(x=>x.id===opp.similarProgrammeId))||candidates[0];similarProgrammeId=best?.id||data.programmes[0]?.id;similarity=best?.score||0;ids=programmeMethodIds(data,similarProgrammeId);source=`Inferred from ${similarProgrammeId}`;}
 const methods=ids.map(id=>data.methods.find(m=>m.id===id)).filter(Boolean);const staffHours=methods.reduce((s,m)=>s+methodStaffHours(m),0);const equipmentHours=methods.reduce((s,m)=>s+methodEqHours(m),0);return{methodIds:ids,methods,source,similarProgrammeId,similarity:Math.round(similarity*100),staffHours:Math.round(staffHours*10)/10,equipmentHours:Math.round(equipmentHours*10)/10};
}

function weekStart(d){const x=new Date(d);x.setUTCHours(0,0,0,0);x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return x;}
function intervalOverlapHours(a,b,s,e){return Math.max(0,(Math.min(new Date(b),e)-Math.max(new Date(a),s))/3600000);}
function methodStaffHours(m){return m.continuousStaffing?learnedN(m,'setupHours')+learnedN(m,'executionHours')+learnedN(m,'teardownHours')+learnedN(m,'analysisHours'):learnedN(m,'setupHours')+learnedN(m,'teardownHours')+learnedN(m,'analysisHours');}
function equipmentCapacityByType(data,type,s,e){const assets=data.equipment.filter(x=>x.type===type&&!['Retired','Out of Service'].includes(x.status));let h=assets.length*((e-s)/3600000)*.75;for(const mt of data.maintenance||[]){const eq=data.equipment.find(x=>x.id===mt.equipmentId);if(eq?.type===type)h-=intervalOverlapHours(mt.start,mt.end,s,e)*.75;}return Math.max(0,h);}
function skillCapacity(data,skill){const people=data.staff.filter(s=>s.skills?.includes(skill));return people.length*40*.8;}
function demandMultiplier(mode,prob){return mode==='committed'?0:mode==='full'?1:clamp(n(prob)/100,0,1);}

export function capacityForecast(data,weeks=12,mode='weighted'){
 const first=weekStart(DEMO_NOW), rows=[]; const eqTypes=[...new Set(data.equipment.map(e=>e.type))],skills=[...new Set(data.methods.flatMap(m=>m.requiredSkills||[]))];
 for(let wi=0;wi<weeks;wi++){
  const s=new Date(first.getTime()+wi*7*MS_DAY),e=new Date(s.getTime()+7*MS_DAY),eq={},sk={};for(const t of eqTypes)eq[t]={confirmed:0,pipeline:0,capacity:equipmentCapacityByType(data,t,s,e)};for(const k of skills)sk[k]={confirmed:0,pipeline:0,capacity:skillCapacity(data,k)};
  for(const b of data.bookings.filter(b=>b.status!=='Completed'&&overlap(b.start,b.end,s,e))){const m=data.methods.find(x=>x.id===b.methodId),eqi=data.equipment.find(x=>x.id===b.equipmentId);if(m&&eqi&&eq[eqi.type])eq[eqi.type].confirmed+=intervalOverlapHours(b.start,b.end,s,e);if(m){const attended=Math.min(methodStaffHours(m),intervalOverlapHours(b.start,b.staffEnd||b.end,s,e));for(const k of m.requiredSkills||[])if(sk[k])sk[k].confirmed+=attended;}}
  for(const opp of data.opportunities||[]){if(opp.status==='Lost'||opp.probability<=0)continue;const start=new Date(opp.expectedStart),due=new Date(opp.dueDate);if(e<=start||s>=due)continue;const plan=inferOpportunityPlan(data,opp),activeWeeks=Math.max(1,Math.ceil((due-start)/(7*MS_DAY))),mult=opp.status==='Won'?1:demandMultiplier(mode,opp.probability);for(const m of plan.methods){const eh=methodEqHours(m)/activeWeeks*mult;if(eq[m.equipmentType])eq[m.equipmentType].pipeline+=eh;const sh=methodStaffHours(m)/activeWeeks*mult;for(const k of m.requiredSkills||[])if(sk[k])sk[k].pipeline+=sh;}}
  const eqRows=Object.entries(eq).map(([type,x])=>({type,...x,total:x.confirmed+x.pipeline,gapHours:Math.max(0,x.confirmed+x.pipeline-x.capacity),utilPct:Math.round((x.confirmed+x.pipeline)/Math.max(1,x.capacity)*100),unitsGap:Math.max(0,Math.ceil((x.confirmed+x.pipeline-x.capacity)/(7*24*.75)))})).sort((a,b)=>b.gapHours-a.gapHours||b.utilPct-a.utilPct);
  const staffRows=Object.entries(sk).map(([skill,x])=>({skill,...x,total:x.confirmed+x.pipeline,gapHours:Math.max(0,x.confirmed+x.pipeline-x.capacity),utilPct:Math.round((x.confirmed+x.pipeline)/Math.max(1,x.capacity)*100),fteGap:Math.round(Math.max(0,x.confirmed+x.pipeline-x.capacity)/(40*.8)*10)/10})).sort((a,b)=>b.gapHours-a.gapHours||b.utilPct-a.utilPct);
  rows.push({index:wi,start:s.toISOString(),end:e.toISOString(),label:s.toLocaleDateString(undefined,{month:'short',day:'numeric'}),equipment:eqRows,staff:staffRows,confirmedEq:Math.round(eqRows.reduce((a,x)=>a+x.confirmed,0)),pipelineEq:Math.round(eqRows.reduce((a,x)=>a+x.pipeline,0)),confirmedStaff:Math.round(staffRows.reduce((a,x)=>a+x.confirmed,0)),pipelineStaff:Math.round(staffRows.reduce((a,x)=>a+x.pipeline,0)),equipmentGapHours:Math.round(eqRows.reduce((a,x)=>a+x.gapHours,0)),staffGapHours:Math.round(staffRows.reduce((a,x)=>a+x.gapHours,0)),equipmentUnitsGap:eqRows.reduce((a,x)=>a+x.unitsGap,0),staffFteGap:Math.round(staffRows.reduce((a,x)=>a+x.fteGap,0)*10)/10});
 }
 const eqAgg=eqTypes.map(type=>{const w=rows.map(r=>r.equipment.find(x=>x.type===type));return{type,confirmed:Math.round(w.reduce((a,x)=>a+x.confirmed,0)),pipeline:Math.round(w.reduce((a,x)=>a+x.pipeline,0)),capacity:Math.round(w.reduce((a,x)=>a+x.capacity,0)),peakUtil:Math.max(...w.map(x=>x.utilPct)),gapHours:Math.round(w.reduce((a,x)=>a+x.gapHours,0)),unitsGap:Math.max(...w.map(x=>x.unitsGap))}}).sort((a,b)=>b.gapHours-a.gapHours||b.peakUtil-a.peakUtil);
 const staffAgg=skills.map(skill=>{const w=rows.map(r=>r.staff.find(x=>x.skill===skill));return{skill,confirmed:Math.round(w.reduce((a,x)=>a+x.confirmed,0)),pipeline:Math.round(w.reduce((a,x)=>a+x.pipeline,0)),capacity:Math.round(w.reduce((a,x)=>a+x.capacity,0)),peakUtil:Math.max(...w.map(x=>x.utilPct)),gapHours:Math.round(w.reduce((a,x)=>a+x.gapHours,0)),fteGap:Math.max(...w.map(x=>x.fteGap))}}).sort((a,b)=>b.gapHours-a.gapHours||b.peakUtil-a.peakUtil);
 return {mode,weeks:rows,equipment:eqAgg,staff:staffAgg,opportunities:(data.opportunities||[]).map(o=>({...o,estimate:inferOpportunityPlan(data,o)})),weightedPipeline:(data.opportunities||[]).reduce((a,o)=>a+n(o.probability)/100,0),equipmentGapWeeks:rows.filter(r=>r.equipmentGapHours>0).length,staffGapWeeks:rows.filter(r=>r.staffGapHours>0).length};
}

export function maintenanceSummary(data,horizonDays=90){const end=new Date(DEMO_NOW.getTime()+horizonDays*MS_DAY),policies=(data.maintenancePolicies||[]).map(p=>{const eq=data.equipment.find(e=>e.id===p.equipmentId),due=new Date(p.nextDueDate),days=Math.ceil((due-DEMO_NOW)/MS_DAY),event=(data.maintenance||[]).find(m=>m.policyId===p.id&&new Date(m.start)>=DEMO_NOW);return{...p,equipment:eq,days,event,dueWithin:due<=end,overdue:due<DEMO_NOW}});return{policies,due:policies.filter(p=>p.dueWithin),overdue:policies.filter(p=>p.overdue),planned:policies.filter(p=>p.event),highRisk:policies.filter(p=>['High','Critical'].includes(p.criticality)&&(['High'].includes(p.failureRisk)||p.conditionScore<60)),plannedHours:Math.round(policies.reduce((a,p)=>a+(p.event?(new Date(p.event.end)-new Date(p.event.start))/3600000:0),0))};}
function bookingHoursNear(data,eqId,start,days=3){const s=new Date(start.getTime()-days*MS_DAY),e=new Date(start.getTime()+days*MS_DAY);return data.bookings.filter(b=>b.equipmentId===eqId&&b.status!=='Completed'&&overlap(b.start,b.end,s,e)).reduce((a,b)=>a+intervalOverlapHours(b.start,b.end,s,e),0);}
function eventOverlap(data,eqId,start,end,ignorePolicy){return(data.maintenance||[]).some(m=>m.equipmentId===eqId&&m.policyId!==ignorePolicy&&overlap(start,end,m.start,m.end));}
function calibrationServiceTarget(data,eqId,due){const sched=(data.calibrations||[]).filter(c=>c.equipmentId===eqId&&c.result==='Scheduled').map(c=>new Date(c.calibrationDate)).filter(d=>Math.abs(d-due)<=21*MS_DAY).sort((a,b)=>Math.abs(a-due)-Math.abs(b-due))[0];if(sched)return sched;const cur=(data.calibrations||[]).filter(c=>c.equipmentId===eqId&&c.result!=='Scheduled'&&new Date(c.calibrationDate)<=DEMO_NOW).sort((a,b)=>new Date(b.calibrationDate)-new Date(a.calibrationDate))[0];if(cur){const d=new Date(cur.dueDate);if(Math.abs(d-due)<=21*MS_DAY)return d;}return null;}
export function optimizeMaintenancePlan(data,horizonDays=90){ensureOperationsState(data);let planned=0,avoided=0,moved=0;const horizon=new Date(DEMO_NOW.getTime()+horizonDays*MS_DAY);for(const p of data.maintenancePolicies.filter(p=>new Date(p.nextDueDate)<=horizon&&!p.locked)){const due=new Date(p.nextDueDate),existing=data.maintenance.find(m=>m.policyId===p.id),calTarget=calibrationServiceTarget(data,p.equipmentId,due);const naiveStart=new Date(due);naiveStart.setUTCHours(8,0,0,0);const naiveEnd=new Date(naiveStart.getTime()+p.durationHours*3600000);const naiveConflicts=data.bookings.filter(b=>b.equipmentId===p.equipmentId&&b.status!=='Completed'&&overlap(naiveStart,naiveEnd,b.start,b.end)).length;let best=null;const earliest=new Date(Math.max(DEMO_NOW.getTime()+MS_DAY,due.getTime()-30*MS_DAY));for(let t=weekStart(earliest).getTime();t<=due.getTime();t+=MS_DAY){const s=new Date(t);s.setUTCHours(8,0,0,0);if([0,6].includes(s.getUTCDay()))continue;const e=new Date(s.getTime()+p.durationHours*3600000);if(e>due||eventOverlap(data,p.equipmentId,s,e,p.id))continue;const conflicts=data.bookings.filter(b=>b.equipmentId===p.equipmentId&&b.status!=='Completed'&&overlap(s,e,b.start,b.end)).length,near=bookingHoursNear(data,p.equipmentId,s,3),calPenalty=calTarget?Math.abs(calTarget-s)/MS_DAY*.18:0,score=conflicts*1000+near+(due-s)/MS_DAY*.05+calPenalty;if(!best||score<best.score)best={s,e,score,conflicts};}
 if(!best)continue;const rec={id:existing?.id||`PMEV-${p.equipmentId}`,equipmentId:p.equipmentId,start:best.s.toISOString(),end:best.e.toISOString(),type:'Preventive Maintenance',reason:`Optimized ${p.strategy||'preventive'} maintenance${calTarget&&Math.abs(calTarget-best.s)<=21*MS_DAY?' aligned with calibration window':''}`,policyId:p.id,status:'Planned',optimized:true,calibrationAligned:!!(calTarget&&Math.abs(calTarget-best.s)<=21*MS_DAY)};if(existing){if(existing.start!==rec.start)moved++;Object.assign(existing,rec);}else{data.maintenance.push(rec);planned++;}avoided+=Math.max(0,naiveConflicts-best.conflicts);}
 data.settings.lastMaintenanceOptimization={timestamp:new Date().toISOString(),planned,moved,avoided};return{data,planned,moved,avoided};}

function auditSignal(data,item,std){const ref=item.reference;let status='Conform',evidence='',finding='';const expiredCal=data.equipment.filter(e=>e.calibrationRequired).filter(e=>{const c=data.calibrations.filter(c=>c.equipmentId===e.id&&c.result!=='Scheduled'&&new Date(c.calibrationDate)<=DEMO_NOW).sort((a,b)=>new Date(b.calibrationDate)-new Date(a.calibrationDate))[0];return !c||new Date(c.dueDate)<DEMO_NOW;});const openIssues=(data.issues||[]).filter(i=>i.status==='Open'),qualRisks=data.methods.filter(m=>data.staff.filter(s=>s.qualifications?.some(q=>q.methodId===m.id&&new Date(q.expires)>DEMO_NOW)).length<2),unreleased=(data.methods||[]).filter(m=>!m.active),specBlocks=(data.specifications||[]).filter(s=>s.status!=='Released'),maint=maintenanceSummary(data,60);
 if(std==='ISO17025'){
  if(ref==='6.2'){evidence=`${data.staff.length} staff; ${qualRisks.length} methods with <2 qualified people.`;if(qualRisks.length>3){status='Minor';finding='Competency resilience is weak for several methods.'}else if(qualRisks.length)status='OFI';}
  else if(ref==='6.4'){evidence=`${data.equipment.length} assets; ${expiredCal.length} expired/missing current calibrations; ${maint.highRisk.length} high-risk maintenance items.`;if(expiredCal.length) {status='Minor';finding='At least one equipment item has expired/missing current calibration.'} else if(maint.highRisk.length)status='OFI';}
  else if(ref==='7.2'){evidence=`${data.methods.filter(m=>m.active).length} released methods; ${unreleased.length} under development.`;if(unreleased.length>5)status='OFI';}
  else if(ref==='7.4')evidence=`${data.duts.length} DUT records with genealogy/status history.`;
  else if(ref==='7.5')evidence=`${data.testRuns.length} test-run records and ${data.results.length} result records retained.`;
  else if(ref==='7.7'){evidence=`${data.testRuns.length} historical/current executions support duration, outcome and issue trending.`;status=data.testRuns.length>=50?'Conform':'Minor';}
  else if(ref==='7.10'){evidence=`${openIssues.length} open issue/nonconforming-work records with root cause classification.`;if(openIssues.length>8)status='OFI';}
  else if(ref==='8.8')evidence=`${(data.audits||[]).length} internal readiness audit records in LabOS.`;
  else if(ref==='8.9'){evidence='Dashboard covers quality, delivery, cost, capacity, maintenance and audit readiness.';}
  else if(ref==='8.7'){evidence=`${(data.issues||[]).filter(i=>i.correctiveAction).length} issue records include corrective-action text.`;}
  else if(ref==='7.11')evidence='Browser-local prototype includes deterministic diagnostics, JSON export/import and audit history; production security validation is not claimed.';
  else if(ref==='7.1'){evidence=`${data.programmes.length} programmes use due dates, resource checks, controlled specs and cost/capacity planning.`;}
  else if(ref==='6.5'){evidence=`${data.calibrations.length} calibration records with certificate traceability.`;if(expiredCal.length)status='Minor';}
  else evidence='Management records and controls are represented in the integrated demo workflow.';
 } else {
  if(ref==='6.1'){const cf=capacityForecast(data,12,'weighted');evidence=`12-week forecast: ${cf.equipmentGapWeeks} equipment-gap weeks, ${cf.staffGapWeeks} staff-gap weeks; ${maint.highRisk.length} high-risk maintenance items.`;if(cf.equipmentGapWeeks+cf.staffGapWeeks>8)status='OFI';}
  else if(ref==='7.1.5'){evidence=`${data.calibrations.length} calibration records; ${expiredCal.length} expired/missing current calibrations.`;if(expiredCal.length){status='Minor';finding='Measurement-resource control has an expired/missing calibration exception.'}}
  else if(ref==='7.1.5.2.1'){evidence=`${data.calibrations.length} calibration/verification records with equipment identity, dates, due dates and certificate references.`;if(expiredCal.length)status='Minor';}
  else if(ref==='7.1.5.3.1'){evidence=`Internal lab scope represented by ${data.methods.length} methods, ${data.equipment.length} assets and ${data.staff.length} personnel with qualification records.`;if(qualRisks.length>3)status='OFI';}
  else if(ref==='7.1.5.3.2'){evidence='External/vendor spend and supplier-related fields are represented in the cost/test model; production deployment must configure approved external-laboratory qualification evidence.';status='OFI';finding='Demo does not include a controlled approved external-laboratory register.';}
  else if(ref==='7.2'){evidence=`${qualRisks.length} methods have fewer than two qualified people.`;if(qualRisks.length>3)status='Minor';else if(qualRisks.length)status='OFI';}
  else if(ref==='8.5.1.5'){evidence=`${data.maintenancePolicies.length} preventive-maintenance policies; ${maint.highRisk.length} high-risk items; ${maint.planned.length} optimized events planned.`;if(maint.highRisk.length>3)status='OFI';}
  else if(ref==='8.3'){const cov=data.requirements.filter(r=>r.status!=='Not Covered').length;evidence=`${cov}/${data.requirements.length} validation requirements have test coverage.`;if(cov<data.requirements.length)status='OFI';}
  else if(ref==='7.5'){evidence=`${data.specifications.length} controlled specifications; ${specBlocks.length} not released.`;if(specBlocks.length>4)status='OFI';}
  else if(ref==='9.1')evidence='Executive dashboard trends delivery, quality, cost, capacity, audit, maintenance and pipeline risk.';
  else if(ref==='10.2'){evidence=`${data.issues.length} issues classified by root cause; ${openIssues.length} remain open.`;if(openIssues.length>10)status='OFI';}
  else if(ref==='CSR'){evidence='Customer field is retained per programme; CSR applicability must be configured per production deployment.';status='OFI';finding='Demo does not include customer-specific requirement libraries.';}
  else evidence='Integrated controls/evidence are represented in the operational demo workflow.';
 }
 return{status,evidence,finding};
}

export function autoAssessAudit(data,auditId,{record=true}={}){const a=(data.audits||[]).find(x=>x.id===auditId);if(!a)return null;for(const it of a.items){const s=auditSignal(data,it,a.standard);it.status=s.status;it.evidence=s.evidence;it.finding=s.finding;it.lastAssessed=new Date().toISOString();if(!it.owner&&['Minor','Major','OFI'].includes(it.status))it.owner='Hugo Pereira';if(!it.dueDate&&['Minor','Major'].includes(it.status))it.dueDate=dayISO(it.status==='Major'?7:30,17);}if(record)data.audit?.push?.({timestamp:new Date().toISOString(),actor:data.settings?.actor||'Demo Lab Manager',action:'Audit auto-assessment run',entity:a.id,previousValue:'',newValue:a.standard});return auditScore(a);}
export function auditScore(a){const audited=a.items.filter(i=>!['Not Audited','N/A'].includes(i.status)),w={Conform:1,OFI:.75,Minor:.35,Major:0};const score=Math.round(audited.reduce((s,i)=>s+(w[i.status]??0),0)/Math.max(1,audited.length)*100),major=a.items.filter(i=>i.status==='Major').length,minor=a.items.filter(i=>i.status==='Minor').length,ofi=a.items.filter(i=>i.status==='OFI').length,open=major+minor;return{score,major,minor,ofi,open,audited:audited.length,total:a.items.length,completion:Math.round(audited.length/Math.max(1,a.items.length)*100)};}
export function auditPortfolio(data){const rows=(data.audits||[]).map(a=>({...a,metrics:auditScore(a)}));return{rows,avg:Math.round(rows.reduce((s,a)=>s+a.metrics.score,0)/Math.max(1,rows.length)),open:rows.reduce((s,a)=>s+a.metrics.open,0),major:rows.reduce((s,a)=>s+a.metrics.major,0),minor:rows.reduce((s,a)=>s+a.metrics.minor,0)};}

export function createAudit(data,std='ISO17025',name='Internal Readiness Audit'){
 const seq=(data.audits||[]).filter(a=>a.standard===std).length+1,id=`AUD-${std==='ISO17025'?'17025':'IATF'}-${seq}`;const a={id,standard:std,name,scope:'Engineering validation laboratory operations',auditor:data.settings?.actor||'Demo Lab Manager',plannedDate:dayISO(14,9),status:'Planned',items:auditItemsFor(std),createdAt:new Date().toISOString(),closedAt:null};data.audits.push(a);return a;
}
