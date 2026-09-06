import { DEMO_NOW, cloneData, priorityRank, addHours } from './data.js';
import { scheduleAll, validateBooking } from './planner.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const RISK_PENALTY = { Blocked: 9000, Late: 6500, 'At Risk': 3200, 'On Track': 0, Active: 0, Closed: 0 };

const round1 = n => Math.round((Number(n) || 0) * 10) / 10;
const uniq = rows => [...new Set(rows.filter(Boolean))];

function hashText(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36);
}

export function advisorStateSignature(data){
  const compact={
    bookings:(data.bookings||[]).map(b=>[b.id,b.start,b.end,b.staffEnd,b.staffId,b.equipmentId,!!b.locked,b.status]),
    legs:(data.legs||[]).map(l=>[l.id,l.status,l.dueDate,l.sampleReadyDate,l.preferredStaffId,l.staffPolicy,l.developmentTaskId]),
    programmes:(data.programmes||[]).map(p=>[p.id,p.priority,p.dueDate,p.forecastCompletion,p.scheduleRisk,p.gateStatus]),
    staff:(data.staff||[]).map(s=>[s.id,s.availability,s.qualifications?.map(q=>[q.methodId,q.level,q.expires]),s.equipmentQualifications]),
    equipment:(data.equipment||[]).map(e=>[e.id,e.type,e.status,e.capacity,e.calibrationRequired,e.calibrationDue]),
    calibrations:(data.calibrations||[]).map(c=>[c.id,c.equipmentId,c.calibrationDate,c.dueDate,c.result]),
    maintenance:(data.maintenance||[]).map(m=>[m.id,m.equipmentId,m.start,m.end,m.type]),
    disruptions:(data.disruptions||[]).filter(d=>d.status==='Active').map(d=>[d.id,d.programmeId,d.legId,d.equipmentId,d.effectiveUntil,d.type])
  };
  return hashText(JSON.stringify(compact));
}

function programmeWeight(data,id){return priorityRank[data.programmes?.find(p=>p.id===id)?.priority]||1;}

export function advisorMetrics(data){
  const activeLegs=(data.legs||[]).filter(l=>l.status!=='Completed'&&!['Cancelled','Failed'].includes(l.status));
  const unscheduled=activeLegs.filter(l=>!l.plannedStart).length;
  let forecastLateHours=0,riskPenalty=0,atRisk=0;
  for(const p of data.programmes||[]){
    const risk=p.scheduleRisk||p.status||'On Track',w=priorityRank[p.priority]||1;
    riskPenalty+=(RISK_PENALTY[risk]||0)*w;
    if(['Blocked','Late','At Risk'].includes(risk))atRisk++;
    if(p.forecastCompletion&&p.dueDate)forecastLateHours+=Math.max(0,(new Date(p.forecastCompletion)-new Date(p.dueDate))/HOUR)*w;
  }
  const bookingLateHours=(data.bookings||[]).reduce((a,b)=>a+Math.max(0,Number(b.lateHours)||0)*programmeWeight(data,b.programmeId),0);
  const loads=staffLoads(data),loadVals=Object.values(loads),maxStaffHours=Math.max(0,...loadVals),avgStaffHours=loadVals.length?loadVals.reduce((a,b)=>a+b,0)/loadVals.length:0,loadSpread=Math.max(0,maxStaffHours-avgStaffHours);
  const penalty=unscheduled*50000+riskPenalty+forecastLateHours*35+bookingLateHours*12+loadSpread*4;
  return {unscheduled,atRisk,forecastLateHours:round1(forecastLateHours),bookingLateHours:round1(bookingLateHours),maxStaffHours:round1(maxStaffHours),avgStaffHours:round1(avgStaffHours),loadSpread:round1(loadSpread),penalty:round1(penalty)};
}

function staffLoads(data,horizonDays=28){
  const end=DEMO_NOW.getTime()+horizonDays*DAY,out=Object.fromEntries((data.staff||[]).map(s=>[s.id,0]));
  for(const b of data.bookings||[]){
    const s=new Date(b.start).getTime(),e=new Date(b.staffEnd||b.end).getTime();
    if(!Number.isFinite(s)||!Number.isFinite(e)||e<=DEMO_NOW.getTime()||s>=end||!out.hasOwnProperty(b.staffId))continue;
    out[b.staffId]+=Math.max(0,(Math.min(e,end)-Math.max(s,DEMO_NOW.getTime()))/HOUR);
  }
  return out;
}

function equipmentLoads(data,horizonDays=28){
  const end=DEMO_NOW.getTime()+horizonDays*DAY,out={};
  for(const e of data.equipment||[])out[e.id]=0;
  for(const b of data.bookings||[]){const s=new Date(b.start).getTime(),e=new Date(b.end).getTime();if(!Number.isFinite(s)||!Number.isFinite(e)||e<=DEMO_NOW.getTime()||s>=end||!out.hasOwnProperty(b.equipmentId))continue;out[b.equipmentId]+=Math.max(0,(Math.min(e,end)-Math.max(s,DEMO_NOW.getTime()))/HOUR);}
  return out;
}

function programmeImpacts(base,next){
  const rows=[];
  for(const p of base.programmes||[]){
    const n=next.programmes?.find(x=>x.id===p.id)||p,oldF=p.forecastCompletion?new Date(p.forecastCompletion):null,newF=n.forecastCompletion?new Date(n.forecastCompletion):null;
    const deltaDays=oldF&&newF?round1((newF-oldF)/DAY):0;
    if(Math.abs(deltaDays)>.01||(p.scheduleRisk||p.status)!==(n.scheduleRisk||n.status))rows.push({programmeId:p.id,project:p.project,priority:p.priority,oldForecast:p.forecastCompletion,newForecast:n.forecastCompletion,deltaDays,oldRisk:p.scheduleRisk||p.status,newRisk:n.scheduleRisk||n.status,dueDate:n.dueDate});
  }
  return rows;
}

function bookingDiff(base,next){
  const old=Object.fromEntries((base.bookings||[]).map(b=>[b.legId,b])),rows=[];
  for(const b of next.bookings||[]){const o=old[b.legId];if(!o){rows.push({legId:b.legId,programmeId:b.programmeId,oldStaff:null,newStaff:b.staffId,oldEquipment:null,newEquipment:b.equipmentId,oldStart:null,newStart:b.start});continue;}if(o.start!==b.start||o.staffId!==b.staffId||o.equipmentId!==b.equipmentId)rows.push({legId:b.legId,programmeId:b.programmeId,oldStaff:o.staffId,newStaff:b.staffId,oldEquipment:o.equipmentId,newEquipment:b.equipmentId,oldStart:o.start,newStart:b.start});}
  return rows;
}

function candidateGain(baseMetrics,nextMetrics){
  return round1(baseMetrics.penalty-nextMetrics.penalty);
}
function meaningful(baseMetrics,nextMetrics){
  return nextMetrics.unscheduled<baseMetrics.unscheduled||nextMetrics.atRisk<baseMetrics.atRisk||nextMetrics.forecastLateHours+2<baseMetrics.forecastLateHours||nextMetrics.bookingLateHours+2<baseMetrics.bookingLateHours||nextMetrics.loadSpread+4<baseMetrics.loadSpread;
}
function confidenceFor(kind,base,next){
  if(kind==='staff')return next.unscheduled<base.unscheduled||next.atRisk<base.atRisk?'High':'Medium';
  if(kind==='calibration')return 'High';
  if(kind==='equipment')return 'Medium';
  return 'Medium';
}

function makeSuggestion({kind,key,title,summary,why,payload,base,data,diagnostics,assumptions=[]}){
  const baseMetrics=advisorMetrics(base),nextMetrics=advisorMetrics(data),impacts=programmeImpacts(base,data),diff=bookingDiff(base,data),gain=candidateGain(baseMetrics,nextMetrics),improved=impacts.filter(x=>x.deltaDays<0||(['Blocked','Late','At Risk'].includes(x.oldRisk)&&x.newRisk==='On Track')),worsened=impacts.filter(x=>x.deltaDays>0||(!['Blocked','Late','At Risk'].includes(x.oldRisk)&&['Blocked','Late','At Risk'].includes(x.newRisk)));
  const fingerprint=hashText(`${kind}|${key}|${advisorStateSignature(base)}`);
  return {id:`OPT-${fingerprint}`,fingerprint,kind,key,title,summary,why,payload,confidence:confidenceFor(kind,baseMetrics,nextMetrics),gain,baseMetrics,nextMetrics,impacts,diff,improved,worsened,diagnostics:diagnostics||{},assumptions,candidateData:data};
}

function staffEligibleForBooking(data,b,staffId){
  const bEnd=b.staffEnd||b.end;
  return validateBooking(data,{legId:b.legId,equipmentId:b.equipmentId,staffId,start:b.start,end:b.end,ignoreBookingId:b.id}).ok && new Date(bEnd)>DEMO_NOW;
}

function generateStaffSuggestions(data,baseMetrics,max=3){
  const loads=staffLoads(data),rows=[],bookings=(data.bookings||[]).filter(b=>!b.locked&&b.status!=='Completed'&&new Date(b.end)>DEMO_NOW).sort((a,b)=>(b.lateHours||0)-(a.lateHours||0)||programmeWeight(data,b.programmeId)-programmeWeight(data,a.programmeId));
  let evaluations=0;
  for(const b of bookings.slice(0,18)){
    const leg=data.legs.find(l=>l.id===b.legId),method=data.methods.find(m=>m.id===b.methodId||m.id===leg?.methodId),old=data.staff.find(s=>s.id===b.staffId);if(!leg||!method||!old)continue;
    const alternatives=(data.staff||[]).filter(s=>s.id!==old.id&&s.skills?.includes(method.requiredSkills?.[0])&&(s.equipmentQualifications||[]).includes(method.equipmentType)).filter(s=>s.qualifications?.some(q=>q.methodId===method.id&&['Independent','Reviewer','Trainer/Expert'].includes(q.level)&&new Date(q.expires)>=new Date(b.staffEnd||b.end))).sort((a,z)=>(loads[a.id]||0)-(loads[z.id]||0)).slice(0,3);
    for(const alt of alternatives){if(evaluations++>=24)break;if(!staffEligibleForBooking(data,b,alt.id))continue;const sim=cloneData(data),sl=sim.legs.find(x=>x.id===leg.id);sl.preferredStaffId=alt.id;sl.staffPolicy='Preferred';const r=scheduleAll(sim,{recordAudit:false}),nb=r.data.bookings.find(x=>x.legId===b.legId);if(!nb||nb.staffId!==alt.id)continue;const nextMetrics=advisorMetrics(r.data);if(!meaningful(baseMetrics,nextMetrics))continue;const diff=bookingDiff(data,r.data),secondary=diff.find(x=>x.programmeId!==b.programmeId&&x.newStaff===old.id),title=secondary?`Reallocate ${alt.name} to ${b.programmeId}; free ${old.name} for ${secondary.programmeId}`:`Rebalance ${b.programmeId}: ${old.name} → ${alt.name}`;const why=secondary?`${alt.name} is qualified for ${leg.id}. Moving that assignment frees ${old.name}, and the simulated portfolio plan uses that capacity on ${secondary.programmeId} (${secondary.legId}).`:`${alt.name} is qualified and available for ${leg.id}; the simulation reduces portfolio delivery/resource penalty without violating method, equipment, calibration or double-booking constraints.`;rows.push(makeSuggestion({kind:'staff',key:`${b.legId}|${alt.id}`,title,summary:`Assign ${alt.name} to ${leg.id} (${b.programmeId}) as preferred staff and let LabOS re-optimise the remaining portfolio.`,why,payload:{legId:b.legId,fromStaffId:old.id,toStaffId:alt.id,programmeId:b.programmeId},base:data,data:r.data,diagnostics:r.diagnostics,assumptions:['Existing qualifications and availability remain valid.','The reassignment is a preferred assignment; hard constraints still override it.']}));}
    if(evaluations>=24)break;
  }
  const byLeg=new Map();for(const r of rows.sort((a,b)=>b.gain-a.gain)){const leg=r.payload?.legId;if(!leg||!byLeg.has(leg))byLeg.set(leg,r);}
  return [...byLeg.values()].slice(0,max);
}

function latestActualCalibration(data,eqId){return (data.calibrations||[]).filter(c=>c.equipmentId===eqId&&c.result!=='Scheduled'&&new Date(c.calibrationDate)<=DEMO_NOW).sort((a,b)=>new Date(b.calibrationDate)-new Date(a.calibrationDate))[0]||null;}
function overlaps(a,b,c,d){return new Date(a)<new Date(d)&&new Date(b)>new Date(c);}
function nextWorkSlot(date){const d=new Date(date);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);if(d.getUTCHours()<8)d.setUTCHours(8,0,0,0);if(d.getUTCHours()>=17){d.setUTCDate(d.getUTCDate()+1);d.setUTCHours(8,0,0,0);while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);}return d;}
function findCalibrationSlot(data,eqId,before){
  let cursor=nextWorkSlot(new Date(Math.max(DEMO_NOW.getTime()+DAY,new Date(before).getTime()-7*DAY)));
  const deadline=new Date(before);
  for(let i=0;i<42&&cursor<deadline;i++){
    const end=new Date(cursor.getTime()+4*HOUR);
    const busy=(data.bookings||[]).some(b=>b.equipmentId===eqId&&overlaps(cursor,end,b.start,b.end))||(data.maintenance||[]).some(m=>m.equipmentId===eqId&&overlaps(cursor,end,m.start,m.end));
    if(!busy&&end<=deadline)return {start:cursor.toISOString(),end:end.toISOString()};
    cursor=new Date(cursor.getTime()+4*HOUR);if(cursor.getUTCHours()>=17||cursor.getUTCHours()<8)cursor=nextWorkSlot(cursor);
  }
  return null;
}
function addScheduledCalibration(sim,eq,slot,current){
  const existing=(sim.calibrations||[]).filter(c=>c.equipmentId===eq.id&&c.result==='Scheduled'&&Math.abs(new Date(c.calibrationDate)-new Date(slot.end))<DAY);if(existing.length)return existing[0];
  const id=`CAL-OPT-${eq.id}-${new Date(slot.start).toISOString().slice(0,10).replaceAll('-','')}`;
  const due=new Date(slot.end);due.setUTCFullYear(due.getUTCFullYear()+1);
  const cal={id,equipmentId:eq.id,calibrationDate:slot.end,dueDate:due.toISOString(),certificateNumber:'PENDING',provider:current?.provider||'Internal Metrology',result:'Scheduled',comments:'Planning-advisor approved calibration slot. Becomes valid only after calibration completion/evidence is recorded.',certificatePath:'',uncertainty:'Pending calibration',asFound:'Pending',asLeft:'Pending',measurementTable:[],planningAdvisor:true};
  sim.calibrations.push(cal);sim.maintenance=sim.maintenance||[];sim.maintenance.push({id:`MNT-${id}`,equipmentId:eq.id,start:slot.start,end:slot.end,type:'Calibration',reason:'Planning-advisor scheduled calibration window',status:'Planned',planningAdvisor:true});return cal;
}
function generateCalibrationSuggestions(data,baseMetrics,max=2){
  const rows=[];
  for(const eq of (data.equipment||[]).filter(e=>e.calibrationRequired&&e.status!=='Retired')){
    const current=latestActualCalibration(data,eq.id);if(!current)continue;const due=new Date(current.dueDate),future=(data.bookings||[]).filter(b=>b.equipmentId===eq.id&&new Date(b.end)>DEMO_NOW).sort((a,b)=>new Date(a.start)-new Date(b.start));const conflict=future.find(b=>new Date(b.end)>due),near=future.find(b=>Math.abs(new Date(b.start)-due)<=7*DAY);const sameTypeBookings=(data.bookings||[]).filter(b=>{const other=data.equipment.find(e=>e.id===b.equipmentId);return other?.type===eq.type&&new Date(b.end)>DEMO_NOW}).sort((a,b)=>new Date(a.start)-new Date(b.start));const dueSoon=(due-DEMO_NOW)<=30*DAY&&sameTypeBookings.length>0;const trigger=conflict||near||(dueSoon?sameTypeBookings[0]:null);if(!trigger)continue;const slot=findCalibrationSlot(data,eq.id,conflict||near?trigger.start:due);if(!slot)continue;const sim=cloneData(data),seq=sim.equipment.find(x=>x.id===eq.id),scur=latestActualCalibration(sim,eq.id),cal=addScheduledCalibration(sim,seq,slot,scur),r=scheduleAll(sim,{recordAudit:false}),nextMetrics=advisorMetrics(r.data),newUse=r.data.bookings.filter(b=>b.equipmentId===eq.id&&new Date(b.start)>=new Date(cal.calibrationDate));if(!meaningful(baseMetrics,nextMetrics)&&!conflict&&!newUse.length)continue;const unlock=!future.length&&newUse.length,title=unlock?`Pull forward ${eq.id} calibration to unlock reserve ${eq.type} capacity`:`Move ${eq.id} calibration into an earlier idle window`,why=unlock?`${eq.id} is currently not used in the forward plan because its calibration expires on ${due.toISOString().slice(0,10)}. Scheduling calibration in an idle slot lets the digital twin use this existing asset on ${newUse.length} future booking(s), potentially avoiding new equipment spend or delay.`:`${eq.id}'s current calibration is due ${due.toISOString().slice(0,10)} and ${trigger.programmeId}/${trigger.legId} uses the asset ${conflict?'across or after':'close to'} that boundary. The proposed slot is idle in the current equipment plan.`;rows.push(makeSuggestion({kind:'calibration',key:`${eq.id}|${slot.start}`,title,summary:`Reserve ${new Date(slot.start).toISOString().slice(0,16).replace('T',' ')}–${new Date(slot.end).toISOString().slice(11,16)} for calibration, then re-optimise around the controlled outage.`,why,payload:{equipmentId:eq.id,slot,currentCalibrationId:current.id,programmeId:trigger.programmeId,legId:trigger.legId,newUseLegs:newUse.map(b=>b.legId)},base:data,data:r.data,diagnostics:r.diagnostics,assumptions:['Calibration is scheduled, not falsely recorded as passed.','Execution still requires completion/evidence before the asset is treated as released operationally.']}));}
  return rows.sort((a,b)=>b.gain-a.gain).slice(0,max);
}

function typeDemand(data,type){const ids=new Set((data.equipment||[]).filter(e=>e.type===type).map(e=>e.id)),loads=equipmentLoads(data),hours=[...ids].reduce((a,id)=>a+(loads[id]||0),0),units=Math.max(1,ids.size),util=round1(hours/(units*28*24)*100),future=(data.legs||[]).filter(l=>{const m=data.methods.find(x=>x.id===l.methodId);return m?.equipmentType===type&&l.status!=='Completed'&&!['Cancelled','Failed'].includes(l.status)}).length;return {hours,units,util,future};}
function generateEquipmentSuggestions(data,baseMetrics,max=2){
  const types=uniq((data.methods||[]).map(m=>m.equipmentType)),rows=[];
  for(const type of types){const demand=typeDemand(data,type);if(!demand.future)continue;const scenario={type:'add_equipment',equipmentType:type,label:`Add one temporary/duplicate ${type}`},r=scheduleAll(data,{scenario,recordAudit:false}),nextMetrics=advisorMetrics(r.data),gain=candidateGain(baseMetrics,nextMetrics);if(!meaningful(baseMetrics,nextMetrics)||(!(nextMetrics.unscheduled<baseMetrics.unscheduled||nextMetrics.atRisk<baseMetrics.atRisk)&&gain<1000))continue;const used=r.data.bookings.filter(b=>b.equipmentId==='SCN-EQ-01');if(!used.length)continue;const programmes=uniq(used.map(b=>b.programmeId));rows.push(makeSuggestion({kind:'equipment',key:type,title:`Add duplicate capacity for ${type}`,summary:`The digital-twin schedule uses one additional ${type} on ${used.length} booking(s), affecting ${programmes.join(', ')}.`,why:`Current demand is concentrated on ${demand.units} installed ${type} asset(s). A one-unit capacity scenario reduces portfolio penalty and is actually selected by the scheduler, so this is a quantified bottleneck recommendation rather than a generic utilisation alert.`,payload:{equipmentType:type,programmes,scenarioImpactBookings:used.map(b=>b.legId),utilisation:demand.util},base:data,data:r.data,diagnostics:r.diagnostics,assumptions:['Scenario assumes an equivalent qualified asset is available immediately.','Accepting approves a capacity action only; LabOS will not create a fake commissioned/calibrated asset or move operational bookings until the real asset is available.']}));}
  return rows.sort((a,b)=>b.gain-a.gain).slice(0,max);
}

export function generatePlanningSuggestions(data,{maxSuggestions=7}={}){
  const baseMetrics=advisorMetrics(data),all=[...generateStaffSuggestions(data,baseMetrics,3),...generateCalibrationSuggestions(data,baseMetrics,2),...generateEquipmentSuggestions(data,baseMetrics,3)];
  const seen=new Set(),dedup=[];
  for(const s of all.sort((a,b)=>b.gain-a.gain)){const k=`${s.kind}|${s.key}`;if(seen.has(k))continue;seen.add(k);dedup.push(s);if(dedup.length>=maxSuggestions)break;}
  return {signature:advisorStateSignature(data),generatedAt:new Date().toISOString(),metrics:baseMetrics,suggestions:dedup};
}
