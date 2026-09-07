import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createDemoData,DEMO_NOW,APP_VERSION} from './data.js';
import {ensureAdvancedState,custodyReadyForLeg} from './advanced.js';

let pass=0;
function check(name,fn){try{fn();pass++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1;}}
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const planner=fs.readFileSync(new URL('./planner.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('./service-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8'));

check('version 1.15.0',()=>assert.equal(APP_VERSION,'1.15.0'));
check('service worker cache bumped',()=>assert.match(sw,/labos-v1\.15\.0/));
check('package version bumped',()=>assert.equal(pkg.version,'1.15.0'));
check('four guided steps named',()=>{for(const x of ['Programme & samples','Design test flow','Review readiness','Schedule'])assert.ok(app.includes(x),x)});
check('direct sample availability option',()=>assert.ok(app.includes('Direct sample availability date')));
check('existing prototype availability option',()=>assert.ok(app.includes('Use an existing prototype build')));
check('new prototype dependency option',()=>assert.ok(app.includes('Create & link a new prototype build')));
check('prototype material date captured',()=>assert.ok(app.includes('prototypeMaterialReadyDate')));
check('prototype completion date captured',()=>assert.ok(app.includes('prototypeExpectedCompleteDate')));
check('auto serial identities generated',()=>assert.ok(app.includes('AUTO-SN-')));
check('serial identities editable',()=>assert.ok(app.includes('builder-serial')));
check('serial uniqueness is readiness checked',()=>assert.match(app,/Serial identities.*unique|unique.*serial/i));
check('request planning gated by readiness',()=>assert.ok(app.includes("if(planNow&&!readiness.ready)")));
check('exact serial numbers create DUT records',()=>assert.ok(app.includes('serialNumber:serial')));
check('future samples represented as Expected',()=>assert.ok(app.includes("custodyStatus:samplesExpectedLater?'Expected':'Available'")));
check('available samples receive custody release',()=>assert.ok(app.includes("moveDut(state,id,'LOC-A01','Released'")));
check('prototype dependency applied to validation',()=>assert.ok(app.includes('applyPrototypeDependency')));
check('workflow advances to schedule step',()=>assert.ok(app.includes('d.builderStep=4')));
check('planning uses future-custody readiness mode',()=>assert.ok(planner.includes('advancedReadiness(data,leg,{forPlanning:true})')));

check('future expected DUT is schedulable but not executable',()=>{
  const data=createDemoData(); ensureAdvancedState(data);
  const p=data.programmes[0];
  const dut={id:'DUT-V115-FUTURE',programmeId:p.id,product:p.product,status:'Expected',custodyStatus:'Expected',currentLocation:'Expected / not yet received',expectedReadyDate:new Date(DEMO_NOW.getTime()+3*86400000).toISOString(),history:[]};
  data.duts.push(dut);
  const leg={...data.legs.find(l=>l.programmeId===p.id),id:'LEG-V115-FUTURE',dutIds:[dut.id],sampleReadyDate:new Date(DEMO_NOW.getTime()+3*86400000).toISOString()};
  const planning=custodyReadyForLeg(data,leg,{forPlanning:true});
  const execution=custodyReadyForLeg(data,leg);
  assert.equal(planning.ok,true);
  assert.equal(planning.plannedFuture,true);
  assert.equal(execution.ok,false);
});

check('past expected DUT remains blocked for planning',()=>{
  const data=createDemoData(); ensureAdvancedState(data);
  const p=data.programmes[0];
  const dut={id:'DUT-V115-PAST',programmeId:p.id,product:p.product,status:'Expected',custodyStatus:'Expected',currentLocation:'Expected / not yet received',history:[]};
  data.duts.push(dut);
  const leg={...data.legs.find(l=>l.programmeId===p.id),id:'LEG-V115-PAST',dutIds:[dut.id],sampleReadyDate:new Date(DEMO_NOW.getTime()-86400000).toISOString()};
  assert.equal(custodyReadyForLeg(data,leg,{forPlanning:true}).ok,false);
});

console.log(`\nv1.15 focused verification: ${pass}/21 PASS`);
if(process.exitCode) process.exit(process.exitCode);
