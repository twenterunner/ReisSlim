import { DEMO_NOW } from './data.js';
import { capacityForecast, maintenanceSummary } from './operations.js';

const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const round=(v,p=1)=>{const m=10**p;return Math.round(n(v)*m)/m};
const median=a=>{if(!a.length)return 0;const x=[...a].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function splitActual(run,method){
 const total=Math.max(.1,n(run.actualHours,n(method?.setupHours)+n(method?.executionHours)+n(method?.teardownHours)+n(method?.analysisHours)));
 const std=[n(method?.setupHours),n(method?.executionHours),n(method?.teardownHours),n(method?.analysisHours)],stdTotal=Math.max(.1,std.reduce((a,b)=>a+b,0));
 const seed=[...String(run.id||run.legId||'')].reduce((a,c)=>a+c.charCodeAt(0),0);
 const setup=run.actualSetupHours??round(total*(std[0]/stdTotal)*(0.88+(seed%19)/50),1);
 const exec=run.actualExecutionHours??round(total*(std[1]/stdTotal)*(0.94+(seed%13)/65),1);
 const teardown=run.actualTeardownHours??round(total*(std[2]/stdTotal)*(0.9+(seed%11)/55),1);
 let analysis=run.actualAnalysisHours??round(Math.max(.1,total-setup-exec-teardown),1);
 const sum=setup+exec+teardown+analysis;if(sum>total+.2)analysis=Math.max(.1,round(analysis-(sum-total),1));
 const queue=run.queueHours??round(Math.max(0,n(run.delayHours)*(.45+(seed%7)/20)),1);
 const rework=run.reworkHours??round(run.outcome==='REWORK'?Math.max(1,total*.18):run.outcome==='FAIL'?Math.max(0,total*.05):0,1);
 return {setup,execution:exec,teardown,analysis,queue,rework};
}

export function ensureTimeLearningState(data){
 data.settings=data.settings||{};if(data.settings.durationLearningEnabled==null)data.settings.durationLearningEnabled=true;
 for(const run of data.testRuns||[]){const m=(data.methods||[]).find(x=>x.id===run.methodId);if(!m)continue;const s=splitActual(run,m);run.actualSetupHours=n(run.actualSetupHours,s.setup);run.actualExecutionHours=n(run.actualExecutionHours,s.execution);run.actualTeardownHours=n(run.actualTeardownHours,s.teardown);run.actualAnalysisHours=n(run.actualAnalysisHours,s.analysis);run.queueHours=n(run.queueHours,s.queue);run.reworkHours=n(run.reworkHours,s.rework);run.valueAddedHours=n(run.valueAddedHours,run.actualExecutionHours);}
 for(const d of data.devTasks||[]){const seed=[...String(d.id)].reduce((a,c)=>a+c.charCodeAt(0),0);if(d.completeDate||d.status==='Review'){d.actualEngineeringHours=n(d.actualEngineeringHours,round(n(d.estimatedEngineeringHours)*(0.88+(seed%23)/50),1));d.actualTechnicianHours=n(d.actualTechnicianHours,round(n(d.estimatedTechnicianHours)*(0.86+(seed%17)/50),1));d.actualElapsedDays=n(d.actualElapsedDays,round(n(d.elapsedDays)*(0.9+(seed%13)/40),1));}}
 for(const m of data.methods||[]){const x=methodTimeMetrics(data,m.id);m.learningRuns=x.runs;if(x.runs>=3){m.learnedSetupHours=x.learned.setup;m.learnedExecutionHours=x.learned.execution;m.learnedTeardownHours=x.learned.teardown;m.learnedAnalysisHours=x.learned.analysis;m.learnedTotalHours=x.learned.total;m.learnedConfidence=x.confidence;}}
 return data;
}

export function effectiveMethodTimes(data,method){
 const use=data?.settings?.durationLearningEnabled!==false && n(method?.learningRuns)>=3;
 return {setup:use?n(method.learnedSetupHours,method.setupHours):n(method?.setupHours),execution:use?n(method.learnedExecutionHours,method.executionHours):n(method?.executionHours),teardown:use?n(method.learnedTeardownHours,method.teardownHours):n(method?.teardownHours),analysis:use?n(method.learnedAnalysisHours,method.analysisHours):n(method?.analysisHours),source:use?'Learned':'Library'};
}

export function methodTimeMetrics(data,methodId){
 const m=(data.methods||[]).find(x=>x.id===methodId),runs=(data.testRuns||[]).filter(r=>r.methodId===methodId&&r.status==='Completed');
 const vals=k=>runs.map(r=>n(r[k])).filter(v=>v>=0),setup=vals('actualSetupHours'),execution=vals('actualExecutionHours'),teardown=vals('actualTeardownHours'),analysis=vals('actualAnalysisHours'),queue=vals('queueHours'),rework=vals('reworkHours'),total=vals('actualHours');
 const learned={setup:round(median(setup)||n(m?.setupHours),1),execution:round(median(execution)||n(m?.executionHours),1),teardown:round(median(teardown)||n(m?.teardownHours),1),analysis:round(median(analysis)||n(m?.analysisHours),1)};learned.total=round(learned.setup+learned.execution+learned.teardown+learned.analysis,1);
 const actualSum=total.reduce((a,b)=>a+b,0),execSum=execution.reduce((a,b)=>a+b,0),setupSum=setup.reduce((a,b)=>a+b,0),analysisSum=analysis.reduce((a,b)=>a+b,0),queueSum=queue.reduce((a,b)=>a+b,0),reworkSum=rework.reduce((a,b)=>a+b,0),planned=runs.reduce((a,r)=>a+n(r.standardHours),0);
 const devs=(data.devTasks||[]).filter(d=>{const l=(data.legs||[]).find(x=>x.id===d.legId);return l?.methodId===methodId});
 return {method:m,runs:runs.length,actualHours:round(actualSum),plannedHours:round(planned),durationVariancePct:round((actualSum-planned)/Math.max(1,planned)*100,0),productivePct:round(execSum/Math.max(1,actualSum+queueSum)*100,0),setupPct:round(setupSum/Math.max(1,actualSum)*100,0),analysisPct:round(analysisSum/Math.max(1,actualSum)*100,0),queuePct:round(queueSum/Math.max(1,actualSum+queueSum)*100,0),reworkPct:round(reworkSum/Math.max(1,actualSum)*100,0),firstTimeRightPct:round(runs.filter(r=>r.outcome==='PASS').length/Math.max(1,runs.length)*100,0),learned,confidence:clamp(Math.round(runs.length/12*100),0,100),development:{tasks:devs.length,engineeringHours:round(devs.reduce((a,d)=>a+n(d.actualEngineeringHours,d.estimatedEngineeringHours),0)),technicianHours:round(devs.reduce((a,d)=>a+n(d.actualTechnicianHours,d.estimatedTechnicianHours),0)),elapsedDays:round(devs.reduce((a,d)=>a+n(d.actualElapsedDays,d.elapsedDays),0))}};
}

export function efficiencyMetrics(data,start=null,end=null){
 let runs=(data.testRuns||[]).filter(r=>r.status==='Completed');if(start||end){const s=new Date(start||0),e=new Date(end||'2999-01-01');runs=runs.filter(r=>new Date(r.actualEnd)>=s&&new Date(r.actualEnd)<=e)}
 const sum=k=>runs.reduce((a,r)=>a+n(r[k]),0),actual=sum('actualHours'),exec=sum('actualExecutionHours'),setup=sum('actualSetupHours'),analysis=sum('actualAnalysisHours'),teardown=sum('actualTeardownHours'),queue=sum('queueHours'),rework=sum('reworkHours'),std=sum('standardHours');
 const handsOn=runs.reduce((a,r)=>{const m=(data.methods||[]).find(x=>x.id===r.methodId);return a+(m?.continuousStaffing?n(r.actualHours):n(r.actualSetupHours)+n(r.actualTeardownHours)+n(r.actualAnalysisHours))},0);
 const dev=(data.devTasks||[]),devActual=dev.reduce((a,d)=>a+n(d.actualEngineeringHours,d.estimatedEngineeringHours)+n(d.actualTechnicianHours,d.estimatedTechnicianHours),0),devEstimate=dev.reduce((a,d)=>a+n(d.estimatedEngineeringHours)+n(d.estimatedTechnicianHours),0);
 return {runs:runs.length,productiveTestPct:round(exec/Math.max(1,actual+queue)*100,0),executionSharePct:round(exec/Math.max(1,actual)*100,0),setupPct:round(setup/Math.max(1,actual)*100,0),analysisPct:round(analysis/Math.max(1,actual)*100,0),teardownPct:round(teardown/Math.max(1,actual)*100,0),queueLossPct:round(queue/Math.max(1,actual+queue)*100,0),reworkBurdenPct:round(rework/Math.max(1,actual)*100,0),handsOnPct:round(handsOn/Math.max(1,actual)*100,0),scheduleEfficiencyPct:round(std/Math.max(1,actual)*100,0),firstTimeRightPct:round(runs.filter(r=>r.outcome==='PASS').length/Math.max(1,runs.length)*100,0),automationLeveragePct:round(runs.filter(r=>(data.methods||[]).find(m=>m.id===r.methodId)?.unattended).reduce((a,r)=>a+n(r.actualExecutionHours),0)/Math.max(1,exec)*100,0),developmentEfficiencyPct:round(devEstimate/Math.max(1,devActual)*100,0),actual,execution:exec,setup,analysis,teardown,queue,rework};
}

export function serviceSynergy(data,horizonDays=120){
 const end=new Date(DEMO_NOW.getTime()+horizonDays*86400000),rows=[];
 for(const p of data.maintenancePolicies||[]){const eq=(data.equipment||[]).find(e=>e.id===p.equipmentId);if(!eq)continue;const maintDue=new Date(p.nextDueDate);if(maintDue>end)continue;const current=(data.calibrations||[]).filter(c=>c.equipmentId===eq.id&&c.result!=='Scheduled'&&new Date(c.calibrationDate)<=DEMO_NOW).sort((a,b)=>new Date(b.calibrationDate)-new Date(a.calibrationDate))[0],calDue=current?new Date(current.dueDate):null;const scheduled=(data.calibrations||[]).filter(c=>c.equipmentId===eq.id&&c.result==='Scheduled').sort((a,b)=>new Date(a.calibrationDate)-new Date(b.calibrationDate))[0];const target=scheduled?new Date(scheduled.calibrationDate):calDue;const delta=target?Math.round((target-maintDue)/86400000):null,combine=target&&Math.abs(delta)<=21,calHours=4,avoid=combine?Math.min(calHours,n(p.durationHours)):0;rows.push({equipmentId:eq.id,name:eq.name,type:eq.type,maintenanceDue:p.nextDueDate,calibrationDue:target?.toISOString()||null,deltaDays:delta,combine,avoidedDowntimeHours:avoid,proposal:combine?`Combine ${p.durationHours}h maintenance with calibration in one service window.`:'Keep separate; due dates are too far apart for efficient bundling.'});}
 return rows.sort((a,b)=>(b.combine?1:0)-(a.combine?1:0)||Math.abs(a.deltaDays??999)-Math.abs(b.deltaDays??999));
}

export function operationalRecommendations(data){
 const rec=[];const cf=capacityForecast(data,12,data.settings?.pipelineMode||'weighted'),ms=maintenanceSummary(data,90),syn=serviceSynergy(data,120);
 for(const x of cf.equipment.filter(x=>x.gapHours>0).slice(0,3))rec.push({id:`EQ-${x.type}`,type:'Capacity',severity:x.gapHours>80?'High':'Medium',title:`${x.type} capacity shortfall`,detail:`${Math.round(x.gapHours)} forecast unmet hours; peak utilisation ${Math.round(x.peakUtil)}%.`,solution:`Add/lease ${Math.max(1,x.unitsGap)} ${x.type} unit(s), outsource eligible demand, or rephase low-priority work.`,impact:`Recovers up to ${Math.round(x.gapHours)} constrained hours`,confidence:'High'});
 for(const x of cf.staff.filter(x=>x.gapHours>0).slice(0,3))rec.push({id:`SK-${x.skill}`,type:'Competency',severity:x.gapHours>40?'High':'Medium',title:`${x.skill} staffing gap`,detail:`${Math.round(x.gapHours)} unmet qualified hours; peak need ${x.fteGap} FTE.`,solution:`Cross-qualify an adjacent technician/engineer, contract specialist capacity, or move compatible work outside the peak.`,impact:`Closes ${x.fteGap} FTE peak coverage gap`,confidence:'High'});
 for(const m of data.methods||[]){const t=methodTimeMetrics(data,m.id);if(t.runs>=5&&Math.abs(t.durationVariancePct)>=15)rec.push({id:`TIME-${m.id}`,type:'Standard time',severity:Math.abs(t.durationVariancePct)>=25?'High':'Medium',title:`${m.id} duration standard drift`,detail:`${t.runs} runs show ${t.durationVariancePct>=0?'+':''}${t.durationVariancePct}% actual vs standard; learned total ${t.learned.total}h.`,solution:'Adopt the learned component times for future planning after method-owner review.',impact:`Improves forecast realism for ${m.name}`,confidence:t.confidence>=70?'High':'Medium',action:'apply-learned-standard',entityId:m.id});if(t.runs>=5&&t.productivePct<55)rec.push({id:`EFF-${m.id}`,type:'Efficiency',severity:'Medium',title:`${m.id} low productive test-time ratio`,detail:`Only ${t.productivePct}% of elapsed cycle time is direct execution/exposure; queue ${t.queuePct}%, setup ${t.setupPct}%.`,solution:'Pre-stage fixtures/samples, standardise setup, automate data capture and reduce queue between setup and execution.',impact:'Raises value-added test time and equipment throughput',confidence:'Medium'});}
 for(const s of syn.filter(x=>x.combine).slice(0,4))rec.push({id:`SVC-${s.equipmentId}`,type:'Asset service',severity:'Medium',title:`Combine calibration + maintenance on ${s.equipmentId}`,detail:`Maintenance and calibration are ${Math.abs(s.deltaDays)} days apart.`,solution:s.proposal,impact:`Avoid ~${s.avoidedDowntimeHours}h duplicate downtime`,confidence:'High',action:'optimize-maintenance'});
 const issueMap={};for(const i of data.issues||[]){const k=i.issueType||'Issue';issueMap[k]=issueMap[k]||{count:0,delay:0,lesson:i.lesson};issueMap[k].count++;issueMap[k].delay+=n(i.delayHours)}for(const [k,v] of Object.entries(issueMap).sort((a,b)=>b[1].count-a[1].count).slice(0,3)){if(v.count>=3)rec.push({id:`ISS-${k}`,type:'Recurring issue',severity:v.delay>80?'High':'Medium',title:`Recurring ${k}`,detail:`${v.count} occurrences caused ${Math.round(v.delay)}h delay.`,solution:v.lesson||'Standardise preventive control and verify effectiveness.',impact:'Reduces repeat delay / rework',confidence:'High'});}
 return rec.sort((a,b)=>(({High:3,Medium:2,Low:1}[b.severity]||0)-({High:3,Medium:2,Low:1}[a.severity]||0))||a.title.localeCompare(b.title));
}
