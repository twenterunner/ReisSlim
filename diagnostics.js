import { DEMO_NOW } from './data.js';

function overlap(a,b,c,d){return new Date(a)<new Date(d)&&new Date(b)>new Date(c);}
export function calibrationAt(data,eqId,at=DEMO_NOW,{allowScheduled=false}={}){const when=new Date(at);return data.calibrations.filter(c=>c.equipmentId===eqId&&new Date(c.calibrationDate)<=when&&(allowScheduled||c.result!=='Scheduled')).sort((a,b)=>new Date(b.calibrationDate)-new Date(a.calibrationDate))[0]||null;}
export function nextScheduledCalibration(data,eqId,at=DEMO_NOW){const when=new Date(at);return data.calibrations.filter(c=>c.equipmentId===eqId&&c.result==='Scheduled'&&new Date(c.calibrationDate)>when).sort((a,b)=>new Date(a.calibrationDate)-new Date(b.calibrationDate))[0]||null;}
export function calibrationStatus(eq,data,at=DEMO_NOW){if(!eq.calibrationRequired)return {label:'Not required',tone:'grey',days:null,calibration:null};const c=calibrationAt(data,eq.id,at);if(!c)return {label:'Missing',tone:'red',days:null,calibration:null};const days=Math.ceil((new Date(c.dueDate)-new Date(at))/86400000);if(days<0)return {label:'Expired',tone:'red',days,calibration:c};const thresholds=(data.settings?.calibrationWarningDays||[60,30,14,7]).filter(Number.isFinite);const urgent=Math.min(...thresholds,7),warn=Math.max(...thresholds,60);if(days<=urgent)return {label:`Due ${days}d`,tone:'red',days,calibration:c};if(days<=warn)return {label:`Due ${days}d`,tone:'amber',days,calibration:c};return {label:'Valid',tone:'green',days,calibration:c};}

export function recomputeRequirementStatuses(data){
 for(const r of data.requirements){
  const legs=data.legs.filter(l=>r.testLegIds?.includes(l.id)||l.requirementIds?.includes(r.id));
  if(!legs.length){r.status='Not Covered';continue;}
  if(legs.some(l=>l.blockingReason)){r.status='Blocked';continue;}
  const res=data.results.filter(x=>legs.some(l=>l.id===x.legId));
  if(res.some(x=>x.status==='FAIL')){r.status='Failed';continue;}
  const completed=legs.filter(l=>l.status==='Completed');
  if(completed.length===legs.length&&res.length){r.status='Verified';continue;}
  if(completed.length>0){r.status='Partially Verified';continue;}
  if(legs.some(l=>l.status==='In Progress')){r.status='In Progress';continue;}
  r.status='Planned';
 }
 return data;
}

export function kpis(data){
 const req=data.requirements,total=req.length,covered=req.filter(r=>r.status!=='Not Covered').length,verified=req.filter(r=>r.status==='Verified').length,failed=req.filter(r=>r.status==='Failed').length,criticalOutstanding=req.filter(r=>r.criticality==='Critical'&&!['Verified'].includes(r.status)).length;
 const testsOpen=data.legs.filter(l=>!['Completed','Cancelled'].includes(l.status)).length,inProgress=data.legs.filter(l=>l.status==='In Progress').length,overdue=data.legs.filter(l=>l.plannedEnd&&new Date(l.plannedEnd)>new Date(l.dueDate)).length;
 const completed=data.legs.filter(l=>l.actualStart&&l.actualEnd),turn=completed.map(l=>(new Date(l.actualEnd)-new Date(l.actualStart))/3600000),avg=turn.length?turn.reduce((a,b)=>a+b,0)/turn.length:0;const median=turn.length?[...turn].sort((a,b)=>a-b)[Math.floor(turn.length/2)]:0;
 const onTime=data.programmes.filter(p=>p.forecastCompletion&&new Date(p.forecastCompletion)<=new Date(p.dueDate)).length;
 const util=resourceUtilisation(data);
 const devOpen=data.devTasks.filter(d=>!d.completeDate&&d.status!=='Complete');
 return {activeProgrammes:data.programmes.filter(p=>p.status!=='Closed').length,testsOpen,inProgress,overdue,atRisk:data.programmes.filter(p=>['At Risk','Late','Blocked'].includes(p.scheduleRisk)).length,
  reqCoverage:Math.round(covered/total*100),reqVerified:Math.round(verified/total*100),reqFailed:failed,reqUncovered:total-covered,criticalOutstanding,
  onTimePct:Math.round(onTime/Math.max(1,data.programmes.length)*100),avgTurnaround:Math.round(avg*10)/10,medianTurnaround:Math.round(median*10)/10,
  equipmentUtil:util.equipmentAvg,staffUtil:util.staffAvg,devHours:devOpen.reduce((s,d)=>s+d.estimatedEngineeringHours+d.estimatedTechnicianHours,0),devQueue:devOpen.length};
}

export function resourceUtilisation(data,days=28){const start=DEMO_NOW,end=new Date(DEMO_NOW.getTime()+days*86400000);const totalHours=days*24;
 const eqs=data.equipment.map(e=>{const h=data.bookings.filter(b=>b.equipmentId===e.id&&overlap(b.start,b.end,start,end)).reduce((s,b)=>s+(Math.min(new Date(b.end),end)-Math.max(new Date(b.start),start))/3600000,0);return {id:e.id,name:e.name,type:e.type,hours:Math.max(0,h),pct:Math.min(100,Math.round(Math.max(0,h)/totalHours*100))};});
 const staff=data.staff.map(s=>{const h=data.bookings.filter(b=>b.staffId===s.id&&overlap(b.start,b.staffEnd||b.end,start,end)).reduce((x,b)=>x+(Math.min(new Date(b.staffEnd||b.end),end)-Math.max(new Date(b.start),start))/3600000,0);const avail=days/7*5*8;return {id:s.id,name:s.name,hours:Math.max(0,h),pct:Math.min(100,Math.round(Math.max(0,h)/Math.max(1,avail)*100))};});
 return {equipment:eqs,staff,equipmentAvg:Math.round(eqs.reduce((s,x)=>s+x.pct,0)/Math.max(1,eqs.length)),staffAvg:Math.round(staff.reduce((s,x)=>s+x.pct,0)/Math.max(1,staff.length))};}

export function categoryMetrics(data){return [...new Set(data.methods.map(m=>m.category))].map(cat=>{const mids=new Set(data.methods.filter(m=>m.category===cat).map(m=>m.id));const legs=data.legs.filter(l=>mids.has(l.methodId));const open=legs.filter(l=>l.status!=='Completed').length,late=legs.filter(l=>l.plannedEnd&&new Date(l.plannedEnd)>new Date(l.dueDate)).length;const hours=legs.filter(l=>l.plannedStart).reduce((s,l)=>{const m=data.methods.find(x=>x.id===l.methodId);return s+(m?m.executionHours+m.setupHours+m.teardownHours+m.analysisHours:0)},0);return {category:cat,open,late,upcomingHours:Math.round(hours),utilisation:Math.min(100,Math.round(hours/(28*24)*100))};}).sort((a,b)=>b.upcomingHours-a.upcomingHours);}

export function bottlenecks(data){
 const counts={}; const add=(k,v=1)=>counts[k]=(counts[k]||0)+v;
 for(const l of data.legs){const txt=(l.blockingReason||'')+' '+(l.planExplanation||[]).join(' ');if(/calibration/i.test(txt))add('Calibration');if(/occupied|capacity|booked/i.test(txt))add('Equipment capacity');if(/breakdown|maintenance|unavailable: /i.test(txt))add('Equipment unavailable');if(/missing qualification|no independently qualified|lacks the required method|qualification bottleneck|only one .*qualified/i.test(txt))add('Qualification');if(/staff.*unavailable|another booking/i.test(txt))add('Staff availability');if(/development/i.test(txt))add('Test development');if(/predecessor/i.test(txt))add('Predecessor dependency');}
 const util=resourceUtilisation(data,14);for(const e of util.equipment.filter(x=>x.pct>=70))add(`${e.type} capacity`,Math.ceil(e.pct/20));
 const dev=data.devTasks.filter(d=>!d.completeDate&&d.status!=='Complete').length;if(dev)add('Test Development Engineering',dev);
 const singlePoint=data.methods.filter(m=>data.staff.filter(s=>s.qualifications.some(q=>q.methodId===m.id&&['Independent','Reviewer','Trainer/Expert'].includes(q.level))).length===1);if(singlePoint.length)add('Single-point competency',singlePoint.length);
 return Object.entries(counts).map(([name,score])=>({name,score,detail:bottleneckDetail(name,data,score)})).sort((a,b)=>b.score-a.score).slice(0,8);
}
function bottleneckDetail(name,data,score){if(name.includes('Development'))return `${data.devTasks.filter(d=>!d.completeDate).length} method-development items open; engineering effort is on the critical path.`;if(name.includes('Calibration'))return `${data.equipment.filter(e=>calibrationStatus(e,data).tone==='red').length} assets expired/due within 7 days; planned tests may be blocked.`;if(name.includes('Single-point'))return `${score} test methods rely on a single independently qualified person.`;if(name.includes('capacity'))return `High scheduled utilisation or unmet demand is constraining throughput.`;if(name.includes('Qualification'))return `Required authorisations narrow the set of feasible staff assignments.`;return `${score} current/forecast constraints detected from planned work.`;}

export function skillsRisks(data){const rows=data.methods.map(m=>{const people=data.staff.filter(s=>s.qualifications.some(q=>q.methodId===m.id&&['Independent','Reviewer','Trainer/Expert'].includes(q.level)&&new Date(q.expires)>DEMO_NOW));return {methodId:m.id,name:m.name,count:people.length,people:people.map(x=>x.name).join(', ')}});return rows.filter(r=>r.count<=1).sort((a,b)=>a.count-b.count);}

export function runDiagnostics(data){const checks=[];const push=(name,ok,detail)=>checks.push({name,ok,detail});
 const ids={programmes:new Set(data.programmes.map(x=>x.id)),methods:new Set(data.methods.map(x=>x.id)),legs:new Set(data.legs.map(x=>x.id)),equipment:new Set(data.equipment.map(x=>x.id)),staff:new Set(data.staff.map(x=>x.id)),duts:new Set(data.duts.map(x=>x.id))};
 const orphanLegs=data.legs.filter(l=>!ids.programmes.has(l.programmeId)||!ids.methods.has(l.methodId)||l.dutIds.some(d=>!ids.duts.has(d)));push('Orphaned record references',orphanLegs.length===0,orphanLegs.length?`${orphanLegs.length} invalid leg references`:'All canonical references resolve');
 let eqOver=0,stOver=0;for(let i=0;i<data.bookings.length;i++)for(let j=i+1;j<data.bookings.length;j++){const a=data.bookings[i],b=data.bookings[j];if(a.equipmentId===b.equipmentId&&overlap(a.start,a.end,b.start,b.end))eqOver++;if(a.staffId===b.staffId&&overlap(a.start,a.staffEnd||a.end,b.start,b.staffEnd||b.end))stOver++;}push('Equipment booking overlaps',eqOver===0,eqOver?`${eqOver} overlaps detected`:'No prohibited double bookings');push('Staff booking overlaps',stOver===0,stOver?`${stOver} overlaps detected`:'No prohibited double bookings');
 const invalidCal=data.bookings.filter(b=>{const e=data.equipment.find(x=>x.id===b.equipmentId);if(!e||!e.calibrationRequired)return false;const c=calibrationAt(data,e.id,b.start,{allowScheduled:true});return !c||new Date(c.dueDate)<new Date(b.end);});push('Calibration validity in future plan',invalidCal.length===0,invalidCal.length?`${invalidCal.length} bookings extend beyond calibration validity at their effective use date`:'All scheduled calibrated assets remain valid through use, including planned recalibrations');
 const unqual=data.bookings.filter(b=>{const l=data.legs.find(x=>x.id===b.legId),s=data.staff.find(x=>x.id===b.staffId),m=data.methods.find(x=>x.id===l?.methodId);return !l||!s||!m||!(s.equipmentQualifications||[]).includes(m.equipmentType)||!s.qualifications.some(q=>q.methodId===l.methodId&&['Independent','Reviewer','Trainer/Expert'].includes(q.level)&&new Date(q.expires)>new Date(b.start));});push('Qualified staff allocations',unqual.length===0,unqual.length?`${unqual.length} unqualified allocations`:'Every planned operator is independently qualified');
 const crit=data.requirements.filter(r=>r.criticality==='Critical'&&r.status==='Not Covered');push('Critical requirement coverage',crit.length===0,crit.length?`${crit.length} critical requirements uncovered`:'All critical requirements have test coverage');
 const missingDur=data.methods.filter(m=>![m.executionHours,m.setupHours,m.teardownHours].every(Number.isFinite));push('Test-library durations',missingDur.length===0,missingDur.length?`${missingDur.length} methods missing duration data`:'All active methods have deterministic planning durations');
 const depCycles=detectCycles(data.legs);push('Dependency graph',depCycles.length===0,depCycles.length?`Cycle detected: ${depCycles[0].join(' -> ')}`:'No impossible dependency cycles');
 const pf=data.results.filter(r=>r.resultType==='numeric'&&(((r.lowerLimit!=null&&r.value<r.lowerLimit)||(r.upperLimit!=null&&r.value>r.upperLimit))?r.status!=='FAIL':r.status!=='PASS'));push('Deterministic result evaluation',pf.length===0,pf.length?`${pf.length} numeric result status mismatches`:'Numeric pass/fail agrees with limits');
 const counts={programmes:data.programmes.length,requirements:data.requirements.length,legs:data.legs.length,duts:data.duts.length,methods:data.methods.length,equipment:data.equipment.length,staff:data.staff.length,calibrations:data.calibrations.length};push('Demo dataset scale',counts.programmes>=8&&counts.requirements>=50&&counts.legs>=40&&counts.duts>=80&&counts.methods>=25&&counts.equipment>=20&&counts.staff>=12&&counts.calibrations>=30,JSON.stringify(counts));
 const pass=checks.filter(c=>c.ok).length;return {checks,pass,fail:checks.length-pass,overall:pass===checks.length?'PASS':'FAIL'};}
function detectCycles(legs){const graph=Object.fromEntries(legs.map(l=>[l.id,l.predecessorIds||[]]));const state={},path=[];function dfs(n){if(state[n]===1)return [...path,n];if(state[n]===2)return null;state[n]=1;path.push(n);for(const p of graph[n]||[]){const r=dfs(p);if(r)return r;}path.pop();state[n]=2;return null;}for(const n of Object.keys(graph)){const r=dfs(n);if(r)return [r];}return [];}
