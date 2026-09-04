export const APP_VERSION = '0.7.0';
export const DEMO_NOW = new Date('2026-09-04T08:00:00Z');

export const priorityRank = { Critical: 4, High: 3, Normal: 2, Low: 1 };

export function addHours(iso, h) { const d = new Date(iso); d.setTime(d.getTime() + h * 3600000); return d.toISOString(); }
export function addDays(iso, d) { return addHours(iso, d * 24); }
export function dayISO(offset=0, hour=8) { const d = new Date(DEMO_NOW); d.setUTCDate(d.getUTCDate()+offset); d.setUTCHours(hour,0,0,0); return d.toISOString(); }

function id(prefix, n, width=3){ return `${prefix}-${String(n).padStart(width,'0')}`; }
function seeded(seed=42){ let s=seed>>>0; return ()=>{ s=(1664525*s+1013904223)>>>0; return s/4294967296; }; }

const METHOD_SPECS = [
 ['ELEC-001','Initial Electrical Characterisation','Electrical',1.5,0.5,0.25,'Electrical Bench','Electrical Test',true,8],
 ['ELEC-002','Final Electrical Characterisation','Electrical',2.0,0.5,0.25,'Electrical Bench','Electrical Test',true,8],
 ['ENV-TC-004','Thermal Cycling -40C to +150C','Temperature',96,4,2,'Climatic Chamber','Environmental Test',true,20],
 ['ENV-TS-002','Thermal Shock','Temperature',48,3,2,'Thermal Shock Chamber','Environmental Test',true,16],
 ['ENV-HU-003','85C / 85%RH Humidity','Humidity',168,4,2,'Climatic Chamber','Environmental Test',true,20],
 ['MECH-VIB-006','Random Vibration','Vibration',8,2,1,'Vibration System','Vibration',false,8],
 ['MECH-SHOCK-003','Mechanical Shock','Shock',6,2,1,'Vibration System','Vibration',false,8],
 ['MECH-TENS-002','Tensile / Pull Test','Mechanical',3,1,0.5,'Tensile Tester','Mechanical Test',false,6],
 ['EMC-007','Radiated Immunity','EMC',12,3,1,'EMC Cell','EMC Specialist',false,4],
 ['EMC-008','Conducted Emissions','EMC',8,2,1,'EMC Cell','EMC Specialist',false,4],
 ['REL-005','Powered Life Endurance','Reliability',240,6,2,'Reliability Rack','Reliability',true,24],
 ['REL-006','Temperature-Humidity Bias','Reliability',336,6,2,'Climatic Chamber','Reliability',true,20],
 ['DIM-001','Dimensional Inspection','Dimensional',2,0.5,0.25,'Dimensional Bench','Metrology',false,12],
 ['OPT-002','Optical Surface Inspection','Optical',2,0.5,0.25,'Microscope','Optical Inspection',false,10],
 ['FA-004','Cross-section Failure Analysis','Failure Analysis',6,2,1,'Microscope','Failure Analysis',false,4],
 ['FW-003','Firmware Robustness Sweep','Software/Firmware',10,2,1,'Electrical Bench','Firmware Validation',true,6],
 ['FUNC-004','Functional End-of-Line Simulation','Functional',4,1,0.5,'Electrical Bench','Electrical Test',false,10],
 ['MAT-003','Material Hardness','Material',2,0.5,0.25,'Material Bench','Materials',false,8],
 ['DAQ-002','High-Speed Signal Capture','Electrical',4,1,0.5,'DAQ System','Electrical Test',false,6],
 ['SCOPE-003','Transient Capture','Electrical',3,0.5,0.25,'Oscilloscope','Electrical Test',false,4],
 ['ENV-LT-007','Low Temperature Functional','Environmental',24,2,1,'Climatic Chamber','Environmental Test',true,12],
 ['ENV-HT-008','High Temperature Functional','Environmental',24,2,1,'Climatic Chamber','Environmental Test',true,12],
 ['MECH-DUR-009','Connector Durability','Durability',72,3,1,'Durability Rig','Mechanical Test',true,10],
 ['IP-005','Ingress Protection Spray','Environmental',5,2,1,'IP Test Booth','Environmental Test',false,6],
 ['PRESS-001','Pressure Pulse Endurance','Reliability',48,5,2,'Pressure Rig','Pressure Test',true,8],
 ['CHEM-002','Chemical Exposure','Material',48,2,1,'Chemical Cabinet','Materials',true,10],
 ['NOISE-004','Acoustic Noise Characterisation','Functional',6,2,1,'Acoustic Booth','Acoustics',false,6],
 ['SW-009','Software HIL Regression','Software/Firmware',18,2,1,'HIL Bench','Firmware Validation',true,8],
 ['THERM-IR-003','Thermal Imaging','Temperature',4,1,0.5,'Thermal Camera','Environmental Test',false,4],
 ['Xray-002','X-Ray Inspection','Failure Analysis',3,1,0.5,'X-Ray System','Failure Analysis',false,6]
];

export function createDemoData(){
 const rnd=seeded(8675309);
 const methods = METHOD_SPECS.map((m,i)=>({
   id:m[0], name:m[1], category:m[2], revision:i%4===0?'C':i%3===0?'B':'A',
   description:`Controlled laboratory method for ${m[1].toLowerCase()}.`,
   executionHours:m[3], setupHours:m[4], teardownHours:m[5], analysisHours:Math.max(0.5,Math.round(m[3]*0.05*10)/10),
   equipmentType:m[6], requiredSkills:[m[7]], staffing: m[8]?1:1, unattended:m[8], continuousStaffing:!m[8], dutCapacity:m[9],
   defaultParameters:{profile:m[2], cycles:i===2?1000:undefined}, acceptance:`All mandatory parameters within released specification`, active:true,
   useCount:Math.floor(3+rnd()*18), avgActualFactor:Math.round((0.92+rnd()*0.3)*100)/100
 }));

 const equipmentTypes = [
 ['TC','Climatic Chamber',5],['TS','Thermal Shock Chamber',2],['VIB','Vibration System',3],['EB','Electrical Bench',4],['EMC','EMC Cell',1],
 ['REL','Reliability Rack',2],['DIM','Dimensional Bench',1],['MIC','Microscope',2],['TEN','Tensile Tester',1],['DAQ','DAQ System',1],['OSC','Oscilloscope',2],
 ['MAT','Material Bench',1],['DUR','Durability Rig',1],['IP','IP Test Booth',1],['PRS','Pressure Rig',1],['CHEM','Chemical Cabinet',1],['ACO','Acoustic Booth',1],
 ['HIL','HIL Bench',1],['TIR','Thermal Camera',1],['XR','X-Ray System',1]
 ];
 let eqN=0; const equipment=[];
 for(const [p,type,count] of equipmentTypes){
   for(let k=1;k<=count;k++){
     eqN++; equipment.push({
       id:`${p}-${String(k).padStart(2,'0')}`, assetNumber:`AST-${String(1000+eqN)}`, name:`${type} ${k}`, type,
       manufacturer:['Weiss','HBK','Keysight','Tektronix','Instron','National Instruments'][eqN%6], model:`M${200+eqN}`, serialNumber:`SN${70000+eqN}`,
       location:`Lab ${String.fromCharCode(65+(eqN%5))}`, owner:['Environmental','Validation','Metrology','Reliability'][eqN%4],
       status:'Available', capability:type==='Climatic Chamber'?'-70C to +180C, 10-98%RH':type==='Vibration System'?'5-2500 Hz, 60 kN':type==='Pressure Rig'?'0-350 bar':'Standard laboratory range',
       capacity: type==='Climatic Chamber'?20:type==='Electrical Bench'?8:type==='Vibration System'?8:6,
       calibrationRequired:!['Chemical Cabinet','Acoustic Booth'].includes(type), utilisationTarget:0.75, maintenanceDate:dayISO(50+eqN), notes:''
     });
   }
 }
 // Deliberate equipment conditions.
 equipment.find(e=>e.id==='TC-03').status='Maintenance';
 equipment.find(e=>e.id==='VIB-03').status='Breakdown';
 equipment.find(e=>e.id==='EB-04').status='Reserved';

 const staffNames=[
 ['S001','Sarah de Vries','Senior Technician','Environmental','Environmental Test'],['S002','Liam Jacobs','Test Technician','Environmental','Environmental Test'],
 ['S003','Mei Chen','Validation Engineer','Systems','Electrical Test'],['S004','Omar Haddad','Test Engineer','Mechanical','Vibration'],
 ['S005','Priya Nair','EMC Specialist','EMC','EMC Specialist'],['S006','Jonas Müller','Lab Technician','Electrical','Electrical Test'],
 ['S007','Ava Rossi','Reliability Engineer','Reliability','Reliability'],['S008','Noah Smith','Metrology Engineer','Quality','Metrology'],
 ['S009','Sofia Martins','Failure Analysis Engineer','FA','Failure Analysis'],['S010','Ethan Williams','Firmware Validation Engineer','Systems','Firmware Validation'],
 ['S011','Fatima El Amrani','Mechanical Technician','Mechanical','Mechanical Test'],['S012','Lucas van Dijk','Materials Engineer','Materials','Materials'],
 ['S013','Nina Kowalski','Pressure Systems Engineer','Reliability','Pressure Test'],['S014','Hugo Pereira','Lab Manager','Management','Reviewer'],
 ['S015','Grace Kim','Validation Engineer','Systems','Electrical Test']
 ];
 const staff=staffNames.map((s,i)=>({id:s[0],name:s[1],role:s[2],team:s[3],workingHours:{start:8,end:17,hoursPerDay:8},skills:[s[4]],qualifications:[],equipmentQualifications:[],availability:[],workloadTarget:0.8,proficiency:i%5===0?'Trainer/Expert':i%3===0?'Reviewer':'Independent'}));
 // Cross-skills
 staff.find(s=>s.id==='S001').skills.push('Reliability');
 staff.find(s=>s.id==='S003').skills.push('Firmware Validation');
 staff.find(s=>s.id==='S004').skills.push('Mechanical Test');
 staff.find(s=>s.id==='S008').skills.push('Electrical Test');
 staff.find(s=>s.id==='S014').skills.push('Electrical Test','Environmental Test','Vibration');
 staff.find(s=>s.id==='S015').skills.push('Environmental Test');
 // One-person EMC bottleneck, one-person pressure specialist.
 staff.find(s=>s.id==='S005').qualifications.push({methodId:'EMC-007',level:'Trainer/Expert',expires:dayISO(180)});
 staff.find(s=>s.id==='S013').qualifications.push({methodId:'PRESS-001',level:'Trainer/Expert',expires:dayISO(90)});
 for(const s of staff){ for(const m of methods){ if(m.requiredSkills.some(sk=>s.skills.includes(sk)) && rnd()>0.35){ s.qualifications.push({methodId:m.id,level:rnd()>.85?'Reviewer':'Independent',expires:dayISO(90+Math.floor(rnd()*300))}); } } }
 // Ensure each method has at least one qualified person, except development can still delay.
 for(const m of methods){ if(!staff.some(s=>s.qualifications.some(q=>q.methodId===m.id))){ const s=staff.find(s=>s.skills.includes(m.requiredSkills[0]))||staff[13]; s.qualifications.push({methodId:m.id,level:'Independent',expires:dayISO(240)}); } }
 for(const s of staff){ s.equipmentQualifications=[...new Set(s.qualifications.map(q=>methods.find(m=>m.id===q.methodId)?.equipmentType).filter(Boolean))]; }
 // Availability: Sarah away during key period; Priya partly constrained.
 staff.find(s=>s.id==='S001').availability.push({start:dayISO(7,0),end:dayISO(10,23),reason:'Annual leave'});
 staff.find(s=>s.id==='S005').availability.push({start:dayISO(4,0),end:dayISO(5,23),reason:'Supplier training'});
 staff.find(s=>s.id==='S013').availability.push({start:dayISO(12,0),end:dayISO(14,23),reason:'Pressure safety audit'});

 const programmes = [
  ['VP-ALPHA','Project Falcon','Apex Mobility','PressureSense X1','High',18,'Equipment bottleneck'],
  ['VP-BETA','Project Orion','Northstar Controls','TorqueNode R2','Normal',31,'Standard programme'],
  ['VP-GAMMA','Project Nimbus','Helios Robotics','ThermaGuard M4','High',24,'Calibration conflict'],
  ['VP-DELTA','Project Vector','Apex Mobility','DriveSense V3','Normal',40,'Qualification bottleneck'],
  ['VP-ECHO','Project Atlas','Internal R&D','FluidSense P1','High',28,'New test development'],
  ['VP-FOXTROT','Project Solace','Meridian Aero','AeroSwitch A5','Low',50,'Low priority capacity filler'],
  ['VP-GOLF','Project Ember','Helios Robotics','HeatMap H2','Normal',16,'Failed DUT storyline'],
  ['VP-HOTEL','Project Quartz','Northstar Controls','VibeGuard V7','High',22,'Equipment breakdown'],
  ['VP-INDIA','Project Cedar','Meridian Aero','OptiSense O8','Normal',35,'On track'],
  ['VP-JULIET','Project Nova','Internal R&D','SmartDAQ D9','Low',60,'Development pipeline']
 ].map((p,i)=>({id:p[0],project:p[1],customer:p[2],product:p[3],productRevision:`R${1+i%3}.${i%2}`,priority:p[4],businessPriority:70-i*3,dueDate:dayISO(p[5],17),status:i===6?'At Risk':i===7?'Blocked':'Active',owner:staff[(i+2)%staff.length].name,storyline:p[6],created:dayISO(-60-i*3),forecastCompletion:null,gateStatus:i===4?'Draft':'Released',budget:0,programmeManager:staff[(i+2)%staff.length].id,changeReason:'Seeded baseline'}));

 const specifications=programmes.map((p,i)=>({
   id:`SPEC-${String(i+1).padStart(3,'0')}`,programmeId:p.id,name:`${p.product} Validation Test Specification`,revision:`R${1+i%3}`,
   category:['Product Validation','Environmental','Electrical','Mechanical','Reliability'][i%5],status:i===4?'Draft':'Released',
   owner:staff[(i+4)%staff.length].name,effectiveDate:dayISO(-45+i),uploadedAt:dayISO(-50+i),source:'Seeded demo',
   acceptanceBasis:'Released product validation limits and customer requirements',description:`Test specification defining validation conditions, sample population, sequence and acceptance limits for ${p.product}.`,
   linkedMethodIds:[],linkedRequirementIds:[],documentName:`SPEC-${String(i+1).padStart(3,'0')}-${p.product.replace(/[^A-Za-z0-9]+/g,'-')}.pdf`,documentPath:`SPEC-${String(i+1).padStart(3,'0')}.pdf`,mimeType:'application/pdf',fileData:null,
   qualityScore:i===2?62:i===4?58:78+((i*3)%17),qualityFlags:i===2?['Ambiguous dwell-time wording','Acceptance limit missing for one parameter']:i===4?['Draft method reference','Fixture tolerance not released']:[]
 }));

 const requirements=[]; let reqN=0;
 const reqCats=['Environmental','Electrical','Mechanical','Reliability','EMC','Functional'];
 for(let pi=0;pi<programmes.length;pi++){
   for(let r=0;r<6;r++){
     reqN++; const crit = r===0?'Critical':r<3?'High':r<5?'Medium':'Low';
     requirements.push({id:`REQ-${programmes[pi].id.split('-')[1]}-${String(r+1).padStart(3,'0')}`,sourceId:`CUS-${String(reqN).padStart(3,'0')}`,programmeId:programmes[pi].id,
       text:r===0&&pi===0?'Sensor shall remain functional after 1,000 thermal cycles between -40C and +150C.':`${programmes[pi].product} shall satisfy ${reqCats[(r+pi)%reqCats.length].toLowerCase()} validation criterion ${r+1}.`,
       category:reqCats[(r+pi)%reqCats.length],criticality:crit,verificationMethod:'Test',owner:staff[(pi+r)%staff.length].name,status:'Planned',evidence:[]});
   }
 }
 // Force status variety.
 requirements[7].status='Verified'; requirements[8].status='Verified'; requirements[13].status='Failed'; requirements[22].status='Not Covered'; requirements[31].status='Blocked'; requirements[44].status='Partially Verified';
 for(const sp of specifications)sp.linkedRequirementIds=requirements.filter(r=>r.programmeId===sp.programmeId).map(r=>r.id);
 const acceptanceByCategory={Environmental:'No loss of required function and all measured parameters remain within released limits after exposure.',Electrical:'Measured electrical parameters shall remain within released product limits.',Mechanical:'No structural damage and required functional performance shall be maintained.',Reliability:'No critical failure and degradation shall remain within the defined released limit.',EMC:'The DUT shall meet the applicable released immunity/emissions acceptance limits.',Functional:'All specified functions shall operate within the released performance limits.'};
 for(const r of requirements){const sp=specifications.find(s=>s.programmeId===r.programmeId);r.specificationId=sp?.id||'';r.acceptanceCriterion=acceptanceByCategory[r.category]||'Result shall meet the released specification acceptance limits.';r.validationIntent='Demonstrate requirement compliance with objective test evidence.';}

 const methodByCategory={Electrical:'ELEC-001',Environmental:'ENV-TC-004',Mechanical:'MECH-VIB-006',Reliability:'REL-005',EMC:'EMC-007',Functional:'FUNC-004'};
 const legs=[]; let legN=0;
 const duts=[]; let dutN=0;
 const devTasks=[];
 const results=[];
 for(let pi=0;pi<programmes.length;pi++){
   const prog=programmes[pi]; const count=5; const progDuts=[];
   const dutCount=10;
   for(let d=0;d<dutCount;d++){ dutN++; const dut={id:`${prog.id}-D${String(d+1).padStart(3,'0')}`,serialNumber:`SN-${String(40000+dutN)}`,programmeId:prog.id,product:prog.product,status:'Available',group:d<5?'Group A':'Group B',history:[]}; duts.push(dut); progDuts.push(dut.id); }
   const reqs=requirements.filter(r=>r.programmeId===prog.id);
   for(let l=0;l<count;l++){
     legN++; let methodId=methodByCategory[reqs[l%reqs.length].category] || methods[(pi*3+l)%methods.length].id;
     if(pi===0 && l===1) methodId='ENV-TC-004';
     if(pi===2 && l===2) methodId='REL-006';
     if(pi===3 && l===3) methodId='EMC-007';
     if(pi===4 && l===1) methodId='PRESS-001';
     if(pi===7 && l===2) methodId='MECH-VIB-006';
     const selected = l===2?progDuts.slice(0,5):l===3?progDuts.slice(5):progDuts.slice();
     const leg={id:`LEG-${String(legN).padStart(3,'0')}`,programmeId:prog.id,name:l===0?'Initial Characterisation':l===count-1?'Final Verification':`${methods.find(m=>m.id===methodId).name}`,
       sequence:l+1,methodId,dutIds:selected,requirementIds:[reqs[l%reqs.length].id,reqs[(l+1)%reqs.length].id],predecessorIds:l===0?[]:[`LEG-${String(legN-1).padStart(3,'0')}`],parallelGroup:null,
       status:l===0&&(pi<3||pi===6)?'Completed':pi===7&&l===2?'Blocked':'Draft',requestedDate:dayISO(-2+pi+l),dueDate:addDays(prog.dueDate,-Math.max(0,(count-1-l)*2)),plannedStart:null,plannedEnd:null,actualStart:null,actualEnd:null,
       equipmentId:null,staffId:null,preferredStaffId:null,staffPolicy:'Auto',locked:false,blockingReason:null,developmentTaskId:null,planExplanation:[],priority:prog.priority,sampleReadyDate:dayISO(-2+pi+l,8)};
     legs.push(leg);
   }
   if([4,9].includes(pi)){
      const targetLeg=legs.filter(x=>x.programmeId===prog.id)[1];
      const dev={id:`DEV-${String(devTasks.length+1).padStart(3,'0')}`,programmeId:prog.id,legId:targetLeg.id,name:`Develop method for ${targetLeg.name}`,status:pi===4?'In Progress':'Queued',estimatedEngineeringHours:40,estimatedTechnicianHours:16,elapsedDays:pi===4?9:7,requiredSkills:['Pressure Test'],startDate:dayISO(pi===4?-2:6),dueDate:dayISO(pi===4?7:15),completeDate:null};
      devTasks.push(dev); targetLeg.developmentTaskId=dev.id;
   }
 }
 // Add three more dev tasks to exercise queue.
 for(let x=0;x<3;x++) devTasks.push({id:`DEV-${String(devTasks.length+1).padStart(3,'0')}`,programmeId:programmes[5+x].id,legId:null,name:['Fixture automation for vibration endurance','Optical defect classifier correlation','High-temperature connector cycling method'][x],status:x===0?'Queued':x===1?'Review':'Queued',estimatedEngineeringHours:24+8*x,estimatedTechnicianHours:8+4*x,elapsedDays:4+x*2,requiredSkills:[x===0?'Vibration':x===1?'Failure Analysis':'Environmental Test'],startDate:dayISO(3+x*2),dueDate:dayISO(12+x*3),completeDate:x===1?dayISO(2):null});

 // Completed first legs and results.
 let completedIndex=0;
 for(const leg of legs.filter(l=>l.status==='Completed')){
   const off=-12+completedIndex*2; completedIndex++;
   leg.actualStart=dayISO(off,8); leg.actualEnd=dayISO(off+1,15); leg.plannedStart=dayISO(off-1,8); leg.plannedEnd=dayISO(off,15);
   leg.equipmentId=equipment.find(e=>e.type===methods.find(m=>m.id===leg.methodId).equipmentType)?.id||null;
   leg.staffId=staff.find(s=>s.qualifications.some(q=>q.methodId===leg.methodId))?.id||null;
   for(const dutId of leg.dutIds){
      const fail = leg.programmeId==='VP-GOLF' && dutId.endsWith('003');
      const res={id:`RES-${String(results.length+1).padStart(4,'0')}`,legId:leg.id,dutId,parameter:'Functional Margin',value:fail?7.4:10.2+Math.round(rnd()*20)/10,unit:'V',lowerLimit:8,upperLimit:14,resultType:'numeric',status:fail?'FAIL':'PASS',timestamp:leg.actualEnd,evidenceId:`DOC-RPT-${leg.id}`};
      results.push(res);
      const dut=duts.find(d=>d.id===dutId); dut.history.push({legId:leg.id,status:res.status,date:leg.actualEnd}); if(fail) dut.status='Failed';
   }
 }

 // Map requirement coverage from legs.
 for(const req of requirements){ req.testLegIds=legs.filter(l=>l.requirementIds.includes(req.id)).map(l=>l.id); if(!req.testLegIds.length && req.status!=='Not Covered') req.status='Not Covered'; }
 // Explicit uncovered requirements for traceability KPIs.
 for(const idx of [22,37]){ const r=requirements[idx]; if(r){ for(const l of legs) l.requirementIds=l.requirementIds.filter(x=>x!==r.id); r.testLegIds=[]; r.status='Not Covered'; } }
 const testRequests=legs.map((l,i)=>({id:`TR-${String(i+1).padStart(3,'0')}`,programmeId:l.programmeId,legId:l.id,requestedBy:staff[(i+3)%staff.length].name,requestedDate:l.requestedDate,requiredCompletion:l.dueDate,priority:programmes.find(p=>p.id===l.programmeId)?.priority||'Normal',status:l.status==='Completed'?'Closed':'Open',methodId:l.methodId}));
 for(const sp of specifications)sp.linkedMethodIds=[...new Set(legs.filter(l=>l.programmeId===sp.programmeId).map(l=>l.methodId))];

 // Calibration history + deliberate expiry risk.
 const calibrations=[]; let calN=0;
 for(const eq of equipment){
   if(!eq.calibrationRequired) continue;
   const daysValid = eq.id==='TC-04'?12:eq.id==='OSC-02'?-5:60+Math.floor(rnd()*220);
   const due=dayISO(daysValid,17); const date=dayISO(daysValid-365,9);
   calN++; calibrations.push({id:`CAL-${String(calN).padStart(3,'0')}`,equipmentId:eq.id,calibrationDate:date,dueDate:due,certificateNumber:`CERT-${2025+(calN%2)}-${String(1000+calN)}`,provider:['Trescal','Element','Internal Metrology'][calN%3],result:daysValid<0?'Expired':'Pass',comments:'Demo calibration record',certificatePath:`${eq.id.replace(/[^A-Za-z0-9-]/g,'_')}-certificate.pdf`,uncertainty:'Per certificate',asFound:'Within tolerance',asLeft:'Within tolerance',measurementTable:[{point:'Low',nominal:0,measured:0.01},{point:'Mid',nominal:50,measured:50.02},{point:'High',nominal:100,measured:99.98}]});
   eq.currentCalibrationId=`CAL-${String(calN).padStart(3,'0')}`; eq.calibrationDue=due;
 }
 // Add historical calibration records to reach >=30.
 let cursor=0;
 while(calibrations.length<35){ const eq=equipment.filter(e=>e.calibrationRequired)[cursor++%equipment.filter(e=>e.calibrationRequired).length]; calN++; calibrations.push({id:`CAL-${String(calN).padStart(3,'0')}`,equipmentId:eq.id,calibrationDate:dayISO(-500-cursor*3),dueDate:dayISO(-140-cursor*3),certificateNumber:`CERT-HIST-${String(900+calN)}`,provider:'Internal Metrology',result:'Pass',comments:'Historical demo record',certificatePath:`${eq.id.replace(/[^A-Za-z0-9-]/g,'_')}-certificate.pdf`,uncertainty:'Historical',asFound:'Within tolerance',asLeft:'Within tolerance',measurementTable:[]}); }

 const maintenance=[
   {id:'MNT-001',equipmentId:'TC-03',start:dayISO(-1,8),end:dayISO(6,17),type:'Maintenance',reason:'Compressor preventive replacement'},
   {id:'MNT-002',equipmentId:'VIB-03',start:dayISO(-1,8),end:dayISO(9,17),type:'Breakdown',reason:'Power amplifier failure'},
   {id:'MNT-003',equipmentId:'EB-04',start:dayISO(2,8),end:dayISO(4,17),type:'Reserved',reason:'Customer witness test'},
   {id:'MNT-004',equipmentId:'TC-04',start:dayISO(10,8),end:dayISO(10,12),type:'Calibration',reason:'Planned recalibration before long-duration use'}
 ];
 calibrations.push({id:'CAL-PLN-001',equipmentId:'TC-04',calibrationDate:dayISO(10,12),dueDate:dayISO(375,17),certificateNumber:'PLANNED-TC04',provider:'Trescal',result:'Scheduled',comments:'Planned calibration; planning may use TC-04 only after this event.',certificatePath:'TC-04-certificate.pdf',uncertainty:'Pending calibration',asFound:'Pending',asLeft:'Pending',measurementTable:[]});


 // Historical test runs provide deterministic period-based KPI history without duplicating active leg state.
 const testRuns=[];
 const histMethods=methods.filter(m=>m.active);
 for(let i=0;i<96;i++){
   const prog=programmes[i%programmes.length], method=histMethods[(i*7+3)%histMethods.length];
   const startOff=-104+i; const plannedStart=dayISO(startOff,8+(i%3)*2);
   const std=method.setupHours+method.executionHours+method.teardownHours+method.analysisHours;
   const variance=0.82+((i*17)%43)/100; const actualHours=Math.round(std*variance*10)/10;
   const actualStart=addHours(plannedStart,(i%8===0?6:i%11===0?18:0)); const actualEnd=addHours(actualStart,actualHours);
   const plannedEnd=addHours(plannedStart,std); const delayHours=Math.max(0,Math.round(((new Date(actualEnd)-new Date(plannedEnd))/3600000)*10)/10);
   const outcome=i%19===0?'FAIL':i%13===0?'REWORK':'PASS';
   const eq=equipment.find(e=>e.type===method.equipmentType)||equipment[0]; const st=staff.find(x=>x.qualifications.some(q=>q.methodId===method.id))||staff[0];
   testRuns.push({id:`RUN-H-${String(i+1).padStart(3,'0')}`,legId:legs.filter(l=>l.programmeId===prog.id)[i%5]?.id||null,programmeId:prog.id,methodId:method.id,plannedStart,plannedEnd,actualStart,actualEnd,equipmentId:eq.id,staffId:st.id,status:'Completed',outcome,actualHours,standardHours:Math.round(std*10)/10,delayHours,source:'Historical demo'});
 }
 // Add current completed leg executions to the canonical run history.
 for(const leg of legs.filter(l=>l.actualStart&&l.actualEnd)){
   const method=methods.find(m=>m.id===leg.methodId); const standardHours=method?method.setupHours+method.executionHours+method.teardownHours+method.analysisHours:0;
   testRuns.push({id:`RUN-${leg.id}`,legId:leg.id,programmeId:leg.programmeId,methodId:leg.methodId,plannedStart:leg.plannedStart,plannedEnd:leg.plannedEnd,actualStart:leg.actualStart,actualEnd:leg.actualEnd,equipmentId:leg.equipmentId,staffId:leg.staffId,status:'Completed',outcome:results.some(r=>r.legId===leg.id&&r.status==='FAIL')?'FAIL':'PASS',actualHours:Math.round((new Date(leg.actualEnd)-new Date(leg.actualStart))/3600000*10)/10,standardHours,delayHours:Math.max(0,Math.round((new Date(leg.actualEnd)-new Date(leg.plannedEnd))/3600000*10)/10),source:'Current programme'});
 }

 const issueTypes=[
   ['Specification ambiguity','Bad Specification','Clarify acceptance limits and test conditions before release'],
   ['Missing acceptance limit','Bad Specification','Require completeness check for every measured parameter'],
   ['Late specification revision','Bad Specification','Freeze test inputs before resource commitment'],
   ['Incorrect setup / configuration','Test Execution','Use setup checklist and peer verification for critical tests'],
   ['Fixture / connection problem','Test Execution','Add fixture health check before starting exposure'],
   ['Script or data-capture error','Test Execution','Version-control and dry-run test automation before execution'],
   ['Sample arrival delay','Sample / DUT','Confirm sample readiness at planning gate and expose late samples immediately'],
   ['DUT damage / handling','Sample / DUT','Improve sample handling and quarantine controls'],
   ['Equipment interruption','Equipment / Facility','Use condition monitoring and contingency equipment planning'],
   ['Qualification / staffing gap','Planning / Resource','Cross-train single-point skills and maintain coverage targets'],
   ['Method development overrun','Test Method / Development','Use staged method-development readiness gates']
 ];
 const issues=[];
 for(let i=0;i<44;i++){
   const ix=i%10<3?3:i%10<5?0:i%10===5?1:i%10===6?6:i%10===7?4:i%10===8?8:10;
   const [issueType,rootCause,lesson]=issueTypes[ix]; const run=testRuns[(i*9+5)%testRuns.length]; const prog=programmes.find(p=>p.id===run.programmeId);
   const sp=specifications.find(x=>x.programmeId===run.programmeId); const date=dayISO(-92+i*2,11);
   issues.push({id:`ISS-${String(i+1).padStart(3,'0')}`,reportedAt:date,programmeId:run.programmeId,legId:run.legId,testRunId:run.id,specificationId:rootCause==='Bad Specification'?sp?.id:null,issueType,rootCause,severity:i%9===0?'High':i%4===0?'Medium':'Low',delayHours:[2,4,8,12,24,36][i%6],status:i>40?'Open':'Closed',description:`${issueType} identified during ${prog?.project||run.programmeId}.`,lesson,correctiveAction:lesson,owner:staff[(i+6)%staff.length].name});
 }
 const disruptions=[
   {id:'DSP-001',type:'sample_delay',status:'Active',programmeId:'VP-ALPHA',legId:'LEG-002',reportedAt:dayISO(0,9),effectiveUntil:dayISO(5,8),reason:'Customer sample lot A arrival slipped by five days',impactHours:120,sourceIssueId:null},
   {id:'DSP-002',type:'test_issue',status:'Active',programmeId:'VP-HOTEL',legId:'LEG-038',reportedAt:dayISO(0,10),effectiveUntil:dayISO(3,12),reason:'Fixture connector repair and repeat setup required',impactHours:74,sourceIssueId:null},
   {id:'DSP-003',type:'sample_delay',status:'Resolved',programmeId:'VP-BETA',legId:'LEG-007',reportedAt:dayISO(-8,9),effectiveUntil:dayISO(-5,8),reason:'Prototype shipment customs delay',impactHours:72,sourceIssueId:null}
 ];
 issues.push({id:'ISS-045',reportedAt:dayISO(0,9),programmeId:'VP-ALPHA',legId:'LEG-002',testRunId:null,specificationId:null,issueType:'Sample arrival delay',rootCause:'Sample / DUT',severity:'High',delayHours:120,status:'Open',description:'Customer sample lot A arrival slipped by five days.',lesson:'Confirm sample readiness at planning gate and expose late samples immediately',correctiveAction:'Planner to use confirmed sample-ready date before booking constrained chamber capacity',owner:'Demo Lab Manager'});
 issues.push({id:'ISS-046',reportedAt:dayISO(0,10),programmeId:'VP-HOTEL',legId:'LEG-038',testRunId:null,specificationId:null,issueType:'Fixture / connection problem',rootCause:'Test Execution',severity:'Medium',delayHours:74,status:'Open',description:'Fixture connector repair and repeat setup required.',lesson:'Add fixture health check before starting exposure',correctiveAction:'Complete connector repair and repeat pre-test fixture verification',owner:'Demo Lab Manager'});

 const documents=[
  {id:'DOC-001',type:'Calibration Certificate',entityId:'TC-04',name:'TC-04 Calibration Certificate',path:'TC-04-certificate.pdf'},
  {id:'DOC-002',type:'Calibration Certificate',entityId:'VIB-01',name:'VIB-01 Calibration Certificate',path:'VIB-01-certificate.pdf'},
  {id:'DOC-003',type:'Calibration Certificate',entityId:'EMC-01',name:'EMC-01 Calibration Certificate',path:'EMC-01-certificate.pdf'}
 ];

 for(const sp of specifications)documents.push({id:`DOC-${sp.id}`,type:'Test Specification',entityId:sp.id,name:sp.name,path:sp.documentPath});

 const audit=[{timestamp:DEMO_NOW.toISOString(),actor:'Demo Lab Manager',action:'Demo dataset initialised',entity:'System',previousValue:'',newValue:APP_VERSION}];
 const settings={actor:'Demo Lab Manager',role:'Lab Manager',calibrationWarningDays:[60,30,14,7],scenario:null,lastPlannerRun:null,kpiPeriod:{preset:'30d',start:dayISO(-30,0).slice(0,10),end:dayISO(0,23).slice(0,10)},scenarioFocusProgramme:'VP-ALPHA',planningProject:'',builderDraft:null,costFramework:{currency:'EUR',overheadPct:12,contingencyPct:8,defaultStaffRate:92,defaultEquipmentRate:45,defaultConsumablesPerDut:6}};
 return {meta:{version:APP_VERSION,seed:8675309,generatedAt:DEMO_NOW.toISOString()},programmes,requirements,specifications,testRequests,testRuns,issues,disruptions,methods,legs,duts,devTasks,equipment,staff,calibrations,maintenance,results,documents,audit,bookings:[],settings};
}

export function cloneData(data){ return JSON.parse(JSON.stringify(data)); }
