import { DEMO_NOW, dayISO } from './data.js';

const H=3600000;
const addH=(iso,h)=>new Date(new Date(iso).getTime()+h*H).toISOString();
const nextWork=(d)=>{const x=new Date(d);while([0,6].includes(x.getUTCDay()))x.setUTCDate(x.getUTCDate()+1);x.setUTCHours(8,0,0,0);return x;};
const overlaps=(a,b,c,d)=>new Date(a)<new Date(d)&&new Date(b)>new Date(c);

export function ensurePrototypeState(data){
 data.prototypeStations=data.prototypeStations||[
  {id:'PB-01',name:'Prototype Assembly Bench 1',type:'Assembly Bench',capacity:1,status:'Available'},
  {id:'PB-02',name:'Prototype Assembly Bench 2',type:'Assembly Bench',capacity:1,status:'Available'},
  {id:'FW-BUILD-01',name:'Prototype Flash / Configuration Station',type:'Configuration Station',capacity:2,status:'Available'}
 ];
 data.prototypeRequests=data.prototypeRequests||[];
 data.prototypeBookings=data.prototypeBookings||[];
 if(!data.prototypeRequests.length){
  const defs=[
   ['PRT-001','Aurora EVT build','VP-ALPHA',24,'EVT','High',dayISO(5,8),dayISO(9,17),'Mechanical assembly + sensor calibration','Prototype Build'],
   ['PRT-002','Falcon DV samples','VP-BETA',20,'DV','Critical',dayISO(2,8),dayISO(6,17),'Configured validation samples','Prototype Build'],
   ['PRT-003','Nimbus fixture correlation lot','',10,'Engineering','Normal',dayISO(8,8),dayISO(12,17),'Instrumented correlation prototypes','Engineering Build'],
   ['PRT-004','Orion EMC pre-scan samples','VP-DELTA',8,'DV','High',dayISO(11,8),dayISO(15,17),'EMC harness + production-intent enclosure','Prototype Build'],
   ['PRT-005','Atlas reliability pilot lot','VP-ECHO',16,'Pilot','Normal',dayISO(18,8),dayISO(24,17),'Pilot process samples for reliability','Pilot Build'],
   ['PRT-006','Helios concept prototypes','',6,'Concept','Low',dayISO(20,8),dayISO(27,17),'Concept evaluation units','Engineering Build']
  ];
  let n=0;
  for(const d of defs){
   const linked=data.programmes?.find(p=>p.id===d[2]);
   data.prototypeRequests.push({id:d[0],name:d[1],linkedProgrammeId:d[2],project:linked?.project||d[1].replace(/ build| samples| lot| prototypes/i,''),product:linked?.product||'Future Platform',quantity:d[3],buildType:d[4],priority:d[5],materialReadyDate:d[6],requiredBy:d[7],status:n++<2?'Planned':'Requested',description:d[8],requestType:d[9],buildHoursPerUnit:d[4]==='Concept'?1.4:.8,setupHours:4,requiredSkill:d[4]==='Concept'?'Prototype Engineering':'Prototype Assembly',stationType:'Assembly Bench',owner:data.staff?.find(s=>/Engineer/.test(s.role))?.name||'Test Engineer',evidence:[],notes:'',createdAt:dayISO(-6+n,9)});
  }
 }
 data.settings=data.settings||{};
 const legacyLinks={'VP-001':'VP-ALPHA','VP-002':'VP-BETA','VP-003':'VP-GAMMA','VP-004':'VP-DELTA','VP-005':'VP-ECHO'};for(const r of data.prototypeRequests){if(legacyLinks[r.linkedProgrammeId]&&data.programmes?.some(p=>p.id===legacyLinks[r.linkedProgrammeId]))r.linkedProgrammeId=legacyLinks[r.linkedProgrammeId];}
 data.settings.prototypeView=data.settings.prototypeView||'all';
 return data;
}

function qualifiedStaff(data,req){return (data.staff||[]).filter(s=>(s.skills||[]).includes(req.requiredSkill)||/Technician|Engineer/.test(s.role||''));}
export function prototypeSummary(data){ensurePrototypeState(data);const open=data.prototypeRequests.filter(r=>!['Complete','Cancelled'].includes(r.status)),linked=open.filter(r=>r.linkedProgrammeId),late=open.filter(r=>new Date(r.requiredBy)<DEMO_NOW),qty=open.reduce((a,r)=>a+Number(r.quantity||0),0);return{open:open.length,linked:linked.length,late:late.length,qty,bookings:data.prototypeBookings.length};}

export function schedulePrototypeBuilds(data,{programmeId=null}={}){
 ensurePrototypeState(data);
 const target=data.prototypeRequests.filter(r=>!['Complete','Cancelled'].includes(r.status)&&(!programmeId||r.linkedProgrammeId===programmeId));
 const keep=data.prototypeBookings.filter(b=>programmeId?data.prototypeRequests.find(r=>r.id===b.requestId)?.linkedProgrammeId!==programmeId:false);
 const bookings=[...keep];
 const stationBusy={},staffBusy={};
 for(const b of keep){(stationBusy[b.stationId]||=[]).push(b);(staffBusy[b.staffId]||=[]).push(b);}
 const rank={Critical:4,High:3,Normal:2,Low:1};
 target.sort((a,b)=>(rank[b.priority]-rank[a.priority])||new Date(a.requiredBy)-new Date(b.requiredBy));
 const moved=[];
 for(const r of target){
  const old=data.prototypeBookings.find(b=>b.requestId===r.id);
  const stations=data.prototypeStations.filter(s=>s.type===r.stationType&&s.status==='Available');
  const people=qualifiedStaff(data,r);
  const hours=Number(r.setupHours||0)+Number(r.quantity||0)*Number(r.buildHoursPerUnit||1);
  let cursor=nextWork(new Date(Math.max(DEMO_NOW.getTime(),new Date(r.materialReadyDate||DEMO_NOW).getTime())));
  let chosen=null;
  for(let day=0;day<90&&!chosen;day++){
   const start=new Date(cursor);start.setUTCDate(start.getUTCDate()+day);const s=nextWork(start);const end=new Date(s.getTime()+hours*H);
   for(const st of stations){if((stationBusy[st.id]||[]).some(b=>overlaps(s,end,b.start,b.end)))continue;for(const p of people){if((staffBusy[p.id]||[]).some(b=>overlaps(s,end,b.start,b.end)))continue;chosen={id:`PBOOK-${r.id}`,requestId:r.id,start:s.toISOString(),end:end.toISOString(),stationId:st.id,staffId:p.id,hours,lateHours:Math.max(0,(end-new Date(r.requiredBy))/H),status:'Planned'};break}if(chosen)break}
  }
  if(chosen){bookings.push(chosen);(stationBusy[chosen.stationId]||=[]).push(chosen);(staffBusy[chosen.staffId]||=[]).push(chosen);r.plannedStart=chosen.start;r.plannedReady=chosen.end;r.status=r.status==='Requested'?'Planned':r.status;if(r.linkedProgrammeId){const first=(data.legs||[]).filter(l=>l.programmeId===r.linkedProgrammeId).sort((a,b)=>a.sequence-b.sequence)[0];if(first&&new Date(first.sampleReadyDate||0)<new Date(chosen.end))first.sampleReadyDate=chosen.end;}if(!old||old.start!==chosen.start||old.stationId!==chosen.stationId||old.staffId!==chosen.staffId)moved.push({requestId:r.id,from:old?.start||null,to:chosen.start});}
 }
 data.prototypeBookings=bookings;return{data,moved};
}

export function createPrototypeRequest(data,input){ensurePrototypeState(data);const id=`PRT-${String(data.prototypeRequests.length+1).padStart(3,'0')}`;const r={id,name:input.name||'New Prototype Build',linkedProgrammeId:input.linkedProgrammeId||'',project:input.project||'',product:input.product||'',quantity:Math.max(1,Number(input.quantity)||1),buildType:input.buildType||'DV',priority:input.priority||'Normal',materialReadyDate:input.materialReadyDate||dayISO(1,8),requiredBy:input.requiredBy||dayISO(7,17),status:'Requested',description:input.description||'',requestType:'Prototype Build',buildHoursPerUnit:Number(input.buildHoursPerUnit)||.8,setupHours:Number(input.setupHours)||4,requiredSkill:input.requiredSkill||'Prototype Assembly',stationType:'Assembly Bench',owner:input.owner||data.settings?.actor||'Demo Lab Manager',evidence:[],notes:input.notes||'',createdAt:new Date().toISOString()};data.prototypeRequests.push(r);return r;}

export function completePrototypeRequest(data,id,evidence){ensurePrototypeState(data);const r=data.prototypeRequests.find(x=>x.id===id);if(!r)return{ok:false,reason:'Prototype request not found.'};if(!String(evidence||'').trim())return{ok:false,reason:'Completion evidence is required.'};r.status='Complete';r.completedAt=new Date().toISOString();r.evidence=[...(r.evidence||[]),{timestamp:new Date().toISOString(),type:'Build completion',reference:String(evidence).trim()}];const b=data.prototypeBookings.find(x=>x.requestId===id);if(b)b.status='Complete';if(r.linkedProgrammeId){const first=(data.legs||[]).filter(l=>l.programmeId===r.linkedProgrammeId).sort((a,b)=>a.sequence-b.sequence)[0];if(first)first.sampleReadyDate=r.completedAt;}return{ok:true,request:r};}
