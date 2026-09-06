const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const asTime=v=>{const t=new Date(v||0).getTime();return Number.isFinite(t)?t:0};
const clean=s=>String(s||'').trim();

function gate(id,label,phase='implementation',mode='manual',required=true){
  return {id,label,phase,mode,required,status:'Pending',evidence:'',evidenceRef:'',satisfiedAt:null,satisfiedBy:''};
}
function findGate(a,id){return [...(a?.closureContract?.implementation||[]),...(a?.closureContract?.effectiveness||[])].find(g=>g.id===id)||null}
function setAuto(a,id,ok,evidence=''){
  const g=findGate(a,id);if(!g||g.mode==='manual')return;
  if(ok){g.status='Satisfied';g.evidence=evidence||g.evidence||'Confirmed from canonical LabOS data';g.satisfiedAt=g.satisfiedAt||new Date().toISOString();g.satisfiedBy=g.satisfiedBy||'LabOS canonical state';}
  else if(g.status==='Satisfied'&&g.satisfiedBy==='LabOS canonical state'){g.status='Pending';g.evidence='';g.satisfiedAt=null;g.satisfiedBy='';}
}
function failAuto(a,id,evidence=''){
 const g=findGate(a,id);if(!g)return;g.status='Failed';g.evidence=evidence;g.satisfiedAt=null;g.satisfiedBy='LabOS canonical state';
}
function allRequired(rows){return (rows||[]).filter(g=>g.required!==false).every(g=>g.status==='Satisfied')}
function anyFailed(rows){return (rows||[]).some(g=>g.status==='Failed')}

export function closureContractFor({source='intelligence',proposalType='',kind='',title='',targetEquipmentType='',targetEquipmentId='',methodId='' }={}){
 let implementation=[],effectiveness=[],closeRule='All required implementation and effectiveness gates must be satisfied before closure.';
 const t=proposalType||kind;
 if(source==='planning'&&kind==='equipment'){
   implementation=[gate('asset_registered','A real additional setup / asset is registered in the Equipment Register','implementation','auto'),gate('commissioning_complete','Installation / commissioning is completed with objective evidence','implementation','auto'),gate('calibration_valid','The new setup has a valid calibration record where calibration is required','implementation','auto')];
   effectiveness=[gate('capacity_used','The new setup is actually used on a completed test run','effectiveness','auto'),gate('effectiveness_review','Measured capacity / delivery benefit is reviewed with evidence','effectiveness','manual')];
   closeRule='Approval alone cannot close this action. The additional setup must physically exist, be commissioned, be calibration-valid where required, be used, and have its benefit reviewed.';
 }else if(source==='planning'&&kind==='calibration'){
   implementation=[gate('calibration_scheduled','The approved calibration window is present in the controlled plan','implementation','auto'),gate('calibration_completed_valid','Calibration is actually completed with a valid Pass record / certificate','implementation','auto')];
   effectiveness=[gate('calibration_conflict_free','Future bookings on the asset are calibration-valid after completion','effectiveness','auto'),gate('effectiveness_review','Calibration timing outcome is reviewed with evidence','effectiveness','manual')];
 }else if(source==='planning'&&kind==='staff'){
   implementation=[gate('staff_assignment_applied','The approved technician assignment exists in the controlled schedule','implementation','auto')];
   effectiveness=[gate('staff_execution_confirmed','A completed run confirms the intended technician actually executed the affected work','effectiveness','auto'),gate('effectiveness_review','Delivery / workload outcome is reviewed with evidence','effectiveness','manual')];
 }else if(t==='integrated_investigation'){
   implementation=[gate('quality_case_created','One linked quality investigation exists','implementation','auto'),gate('containment_evidence','Containment / immediate-action evidence has been recorded','implementation','auto'),gate('investigation_disposition','Root cause and disposition have progressed through the evidence-gated quality workflow','implementation','auto')];
   effectiveness=[gate('signals_cleared','The correlated source signals are no longer open','effectiveness','auto'),gate('quality_closed_effective','The linked quality event is evidence-backed Closed / Effective','effectiveness','auto')];
 }else if(t==='standard_time_update'){
   implementation=[gate('standard_updated','The controlled method planning standard contains the approved learned component times','implementation','auto'),gate('portfolio_replanned','Future bookings were recalculated using the new standard','implementation','auto')];
   effectiveness=[gate('three_runs_observed','At least 3 subsequent applicable runs have been observed','effectiveness','auto'),gate('effectiveness_review','Forecast accuracy impact is reviewed with evidence','effectiveness','manual')];
 }else if(t==='method_prevention'){
   implementation=[gate('controlled_change_released','The method / work instruction / LES readiness control is actually revised and released','implementation','manual'),gate('people_ready','Affected operators are trained / acknowledged where required','implementation','manual')];
   effectiveness=[gate('three_runs_no_recurrence','3 subsequent applicable runs complete without matching recurrence','effectiveness','auto'),gate('effectiveness_review','Effectiveness review is recorded with evidence','effectiveness','manual')];
 }else if(t==='spec_prevention'){
   implementation=[gate('controlled_change_released','The specification review/release control is actually revised and released','implementation','manual'),gate('people_ready','Affected reviewers / owners acknowledge the new control','implementation','manual')];
   effectiveness=[gate('three_runs_no_recurrence','3 subsequent applicable executions complete without matching recurrence','effectiveness','auto'),gate('effectiveness_review','Effectiveness review is recorded with evidence','effectiveness','manual')];
 }else if(t==='asset_prevention'){
   implementation=[gate('controlled_change_released','The approved service / calibration / reliability / contingency action is actually completed','implementation','manual')];
   effectiveness=[gate('three_runs_no_recurrence','3 subsequent applicable runs complete without matching recurrence','effectiveness','auto'),gate('effectiveness_review','Asset reliability outcome is reviewed with evidence','effectiveness','manual')];
 }else if(t==='sample_prevention'){
   implementation=[gate('controlled_change_released','The sample-readiness / arrival gate is actually implemented in the workflow','implementation','manual')];
   effectiveness=[gate('three_runs_no_recurrence','3 subsequent applicable executions complete without matching recurrence','effectiveness','auto'),gate('effectiveness_review','Sample-flow effectiveness is reviewed with evidence','effectiveness','manual')];
 }else if(t==='resource_prevention'){
   implementation=[gate('controlled_change_released','The competency / coverage / capacity change is actually implemented','implementation','manual')];
   effectiveness=[gate('three_runs_no_recurrence','3 subsequent applicable executions complete without matching recurrence','effectiveness','auto'),gate('effectiveness_review','Capacity/coverage outcome is reviewed with evidence','effectiveness','manual')];
 }else if(t==='development_prevention'){
   implementation=[gate('controlled_change_released','The development-maturity gate / lead-time standard is actually implemented','implementation','manual')];
   effectiveness=[gate('three_runs_no_recurrence','3 subsequent applicable executions complete without matching recurrence','effectiveness','auto'),gate('effectiveness_review','Development-planning outcome is reviewed with evidence','effectiveness','manual')];
 }else{
   implementation=[gate('controlled_change_released','The accepted proposal is implemented in the authoritative process / system of record','implementation','manual')];
   effectiveness=[gate('effectiveness_review','Effectiveness is reviewed with objective evidence','effectiveness','manual')];
 }
 return {version:1,title:title||'Evidence-gated implementation',targetEquipmentType,targetEquipmentId,methodId,implementation,effectiveness,closeRule};
}

export function ensureGovernedAction(action,context={}){
 if(!action)return action;
 if(!action.closureContract)action.closureContract=closureContractFor({source:action.origin||context.source||'intelligence',proposalType:action.proposalType||context.proposalType||'',kind:action.planningKind||context.kind||'',title:action.title||'',targetEquipmentType:action.targetEquipmentType||context.targetEquipmentType||'',targetEquipmentId:action.targetEquipmentId||context.targetEquipmentId||'',methodId:action.methodId||context.methodId||''});
 action.implementation=action.implementation||{};
 action.governanceVersion=1;
 return action;
}

function validCalibrationFor(data,equipmentId,notBefore=0){
 const rows=(data.calibrations||[]).filter(c=>c.equipmentId===equipmentId&&c.result==='Pass'&&asTime(c.calibrationDate)>=notBefore&&asTime(c.dueDate)>Date.now()).sort((a,b)=>asTime(b.calibrationDate)-asTime(a.calibrationDate));
 return rows[0]||null;
}
function bookingCalibrationValid(data,eqId,booking){
 const when=asTime(booking.start),cal=(data.calibrations||[]).filter(c=>c.equipmentId===eqId&&c.result==='Pass'&&asTime(c.calibrationDate)<=when&&asTime(c.dueDate)>=asTime(booking.end||booking.start)).sort((a,b)=>asTime(b.calibrationDate)-asTime(a.calibrationDate))[0];return !!cal;
}
function relatedRunsAfter(data,a){const since=asTime(a.acceptedAt||a.createdAt);return (data.testRuns||[]).filter(r=>r.status==='Completed'&&asTime(r.actualEnd||r.plannedEnd)>since&&(!a.methodId||r.methodId===a.methodId));}
function relatedRecurrencesAfter(data,a){const since=asTime(a.acceptedAt||a.createdAt),issueType=clean(a.issueType),rootCause=clean(a.rootCause);return (data.issues||[]).filter(i=>asTime(i.reportedAt)>since&&(!rootCause||i.rootCause===rootCause)&&(!issueType||i.issueType===issueType||String(i.issueType||'').includes(issueType))&&(!a.methodId||(data.legs||[]).find(l=>l.id===i.legId)?.methodId===a.methodId));}

export function refreshGovernedAction(data,action){
 ensureGovernedAction(action);
 if(['Undone','Rejected','Closed · effective','Cancelled'].includes(action.status))return action;
 const kind=action.planningKind||'',type=action.proposalType||'',since=asTime(action.acceptedAt||action.createdAt);
 if(action.origin==='planning'&&kind==='equipment'){
   let eq=(data.equipment||[]).find(e=>e.id===action.implementation.equipmentId)||(data.equipment||[]).find(e=>e.createdFromActionId===action.id);
   if(eq){action.implementation.equipmentId=eq.id;setAuto(action,'asset_registered',true,`${eq.id} · ${eq.name}`);setAuto(action,'commissioning_complete',eq.status==='Available'&&!!eq.commissionedAt&&!!clean(eq.commissioningEvidence),eq.commissioningEvidence?`${eq.id} commissioned · ${eq.commissioningEvidence}`:'');const cal=!eq.calibrationRequired?{id:'N/A'}:validCalibrationFor(data,eq.id,Math.max(since,asTime(eq.createdAt)));if(cal){action.implementation.calibrationId=cal.id;setAuto(action,'calibration_valid',true,cal.id==='N/A'?'Calibration not required':`${cal.id} valid to ${cal.dueDate}`)}else setAuto(action,'calibration_valid',false);const runs=(data.testRuns||[]).filter(r=>r.status==='Completed'&&r.equipmentId===eq.id&&asTime(r.actualEnd||r.plannedEnd)>Math.max(since,asTime(eq.commissionedAt)));setAuto(action,'capacity_used',runs.length>0,runs.length?`${runs[0].id} completed using ${eq.id}`:'');action.observedRuns=runs.length;}
   else{setAuto(action,'asset_registered',false);setAuto(action,'commissioning_complete',false);setAuto(action,'calibration_valid',false);setAuto(action,'capacity_used',false)}
 }else if(action.origin==='planning'&&kind==='staff'){
   const legId=action.implementation.legId||action.legId,to=action.implementation.toStaffId||action.toStaffId;const b=(data.bookings||[]).find(x=>x.legId===legId&&x.staffId===to);setAuto(action,'staff_assignment_applied',!!b,b?`${b.id}: ${legId} assigned to ${to}`:'');const run=(data.testRuns||[]).find(r=>r.status==='Completed'&&r.legId===legId&&r.staffId===to&&asTime(r.actualEnd||r.plannedEnd)>since);setAuto(action,'staff_execution_confirmed',!!run,run?`${run.id} completed by ${to}`:'');
 }else if(action.origin==='planning'&&kind==='calibration'){
   const eqId=action.implementation.equipmentId||action.targetEquipmentId;const scheduled=(data.calibrations||[]).find(c=>c.equipmentId===eqId&&c.result==='Scheduled'&&asTime(c.calibrationDate)>=since)||(data.maintenance||[]).find(m=>m.equipmentId===eqId&&String(m.type).toLowerCase().includes('calibration')&&asTime(m.start)>=since);setAuto(action,'calibration_scheduled',!!scheduled,scheduled?`${scheduled.id||scheduled.type} · ${scheduled.calibrationDate||scheduled.start}`:'');const cal=validCalibrationFor(data,eqId,since);if(cal){action.implementation.calibrationId=cal.id;setAuto(action,'calibration_completed_valid',true,`${cal.id} · valid to ${cal.dueDate}`);const bad=(data.bookings||[]).filter(b=>b.equipmentId===eqId&&asTime(b.start)>=asTime(cal.calibrationDate)&&!bookingCalibrationValid(data,eqId,b));setAuto(action,'calibration_conflict_free',bad.length===0,bad.length?'':`No calibration-invalid future booking remains on ${eqId}`)}else{setAuto(action,'calibration_completed_valid',false);setAuto(action,'calibration_conflict_free',false)}
 }else if(type==='integrated_investigation'){
   const q=action.qualityEventId?(data.qualityEvents||[]).find(x=>x.id===action.qualityEventId):null;setAuto(action,'quality_case_created',!!q,q?`${q.id} · ${q.status}`:'');const ev=q?.evidenceRefs||[];setAuto(action,'containment_evidence',ev.some(x=>['Investigation','Containment'].includes(x.stage)),ev.length?`${ev.length} quality evidence record(s)`:'');const progressed=q&&['Disposition','CAPA','CAPA Verification','Closed'].includes(q.status)&&q.rootCause&&q.rootCause!=='Under investigation'&&q.disposition&&q.disposition!=='Pending controlled decision';setAuto(action,'investigation_disposition',!!progressed,progressed?`${q.id}: root cause / disposition recorded`:'' );const alerts=(action.sourceAlertIds||[]).map(id=>(data.liveAlerts||[]).find(x=>x.id===id)).filter(Boolean);setAuto(action,'signals_cleared',alerts.length>0&&alerts.every(x=>['Closed','Resolved'].includes(x.status)),alerts.length?`${alerts.filter(x=>['Closed','Resolved'].includes(x.status)).length}/${alerts.length} correlated alerts actually closed/resolved`:'' );setAuto(action,'quality_closed_effective',q?.status==='Closed'&&q?.effectivenessStatus==='Effective',q?.status==='Closed'?`${q.id} closed · ${q.effectivenessStatus}`:'');
 }else if(type==='standard_time_update'){
   const m=(data.methods||[]).find(x=>x.id===action.methodId),t=action.appliedTimes||action.learnedTimes||{};const same=m&&['setup','execution','teardown','analysis'].every(k=>Math.abs(n(m[k+'Hours'])-n(t[k]))<0.001);setAuto(action,'standard_updated',!!same,m?`${m.id} Rev ${m.revision||'—'} standard = ${n(m.setupHours)+n(m.executionHours)+n(m.teardownHours)+n(m.analysisHours)}h`:'' );setAuto(action,'portfolio_replanned',action.replanChanges!=null,`${n(action.replanChanges)} booking change(s) recorded when applied`);const runs=relatedRunsAfter(data,action);setAuto(action,'three_runs_observed',runs.length>=3,`${runs.length}/3 subsequent applicable runs observed`);action.observedRuns=runs.length;
 }else{
   const runs=relatedRunsAfter(data,action),rec=relatedRecurrencesAfter(data,action);action.observedRuns=runs.length;action.recurrencesAfterAcceptance=rec.length;if(rec.length)failAuto(action,'three_runs_no_recurrence',`${rec.length} matching recurrence(s) detected after implementation/acceptance`);else setAuto(action,'three_runs_no_recurrence',runs.length>=3,`${runs.length}/3 subsequent applicable run(s); no matching recurrence detected`);
 }
 const impl=action.closureContract.implementation||[],eff=action.closureContract.effectiveness||[];
 action.implementationProgress={done:impl.filter(g=>g.status==='Satisfied').length,total:impl.filter(g=>g.required!==false).length};action.effectivenessProgress={done:eff.filter(g=>g.status==='Satisfied').length,total:eff.filter(g=>g.required!==false).length};
 if(anyFailed(eff)){action.status='Effectiveness failed';action.verificationSummary=eff.find(g=>g.status==='Failed')?.evidence||'Effectiveness evidence failed.';}
 else if(!allRequired(impl)){action.status='Implementation pending';action.verificationSummary=`Implementation ${action.implementationProgress.done}/${action.implementationProgress.total} gates complete.`;}
 else if(!allRequired(eff)){action.status='Implemented · monitoring';action.verificationSummary=`Implemented. Effectiveness ${action.effectivenessProgress.done}/${action.effectivenessProgress.total} gates complete.`;}
 else{action.status='Ready to close';action.verificationSummary='All implementation and effectiveness gates are satisfied. Closure is now permitted.';}
 return action;
}

export function recordGateEvidence(action,gateId,{evidence,evidenceRef='',actor='User'}={}){
 ensureGovernedAction(action);const g=findGate(action,gateId);if(!g)throw new Error('Closure gate not found');if(g.mode!=='manual')throw new Error('This gate is satisfied only from authoritative system state');if(!clean(evidence)||!clean(evidenceRef))throw new Error('Objective evidence and a traceable record / document reference are both required');g.status='Satisfied';g.evidence=clean(evidence)||clean(evidenceRef);g.evidenceRef=clean(evidenceRef);g.satisfiedAt=new Date().toISOString();g.satisfiedBy=actor;return g;
}
export function reopenGate(action,gateId,reason='Evidence invalidated'){
 const g=findGate(action,gateId);if(!g)return null;g.status='Pending';g.evidence=reason;g.evidenceRef='';g.satisfiedAt=null;g.satisfiedBy='';return g;
}
export function actionCanClose(action){ensureGovernedAction(action);return allRequired(action.closureContract.implementation)&&allRequired(action.closureContract.effectiveness)&&!anyFailed(action.closureContract.effectiveness)}
export function actionProgress(action){ensureGovernedAction(action);const i=action.closureContract.implementation||[],e=action.closureContract.effectiveness||[];return{implementationDone:i.filter(g=>g.status==='Satisfied').length,implementationTotal:i.filter(g=>g.required!==false).length,effectivenessDone:e.filter(g=>g.status==='Satisfied').length,effectivenessTotal:e.filter(g=>g.required!==false).length,canClose:actionCanClose(action)}}
