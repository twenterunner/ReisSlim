import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {buildRegionSearch,queryRegions,buildSpatialIndex,nearbySpatial,createNodeDataClient} from './travel-data.js';
import {createCanonicalPlan} from './canonical-plan-engine.js';
import {validateCanonicalPlan} from './validator.js';
import {loadData,trip,root} from './test-helpers.mjs';

const pct=(xs,p)=>{const a=[...xs].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(p*a.length)-1))]||0};
const stats=xs=>({p50:Number(pct(xs,.50).toFixed(3)),p95:Number(pct(xs,.95).toFixed(3)),p99:Number(pct(xs,.99).toFixed(3)),max:Number(Math.max(...xs).toFixed(3))});
const timed=(fn,n=250)=>{for(let i=0;i<20;i++)fn();const rows=[];for(let i=0;i<n;i++){const s=performance.now();fn();rows.push(performance.now()-s)}return stats(rows)};
const {index,countries}=loadData();
const realRegions=Object.values(countries).flatMap(c=>c.regions.map(r=>({id:r.id,name:r.name,country:r.country,tags:r.tags||[],searchTerms:r.searchTerms||[],countryCode:r.countryCode})));
const realPois=Object.values(countries).flatMap(c=>c.regions.flatMap(r=>r.pois));
const realBases=index.baseIndex;

function scaleRows(source,n,kind){const out=[];for(let i=0;i<n;i++){const s=source[i%source.length],k=Math.floor(i/source.length);out.push({...s,id:`bench-${kind}-${i}`,name:`${s.name} ${k||''}`.trim(),lat:Number(s.lat)+((i%7)-3)*.00001,lon:Number(s.lon)+((i%11)-5)*.00001,searchTerms:[...(s.searchTerms||[]),`bench${i}`]})}return out}
const report={generatedAt:new Date().toISOString(),method:'Production indexing/query functions with genuine catalogue rows cloned only to exercise scale; times are local CPU wall-clock milliseconds.',destinationSearch:{},poiSpatial:{},planning:{}};

for(const n of [100,1000,5000]){
  const rows=scaleRows(realRegions,n,'region'),idx=buildRegionSearch(rows);
  report.destinationSearch[n]=timed(()=>queryRegions(idx,'mountains nature scenic',20),400);
}
for(const n of [10000,50000]){
  const rows=scaleRows(realPois,n,'poi'),idx=buildSpatialIndex(rows,2),anchor=rows[0];
  report.poiSpatial[n]=timed(()=>nearbySpatial(idx,anchor,250,50),300);
}
for(const n of [100,1000,5000]){
  const scaledIndex={...index,regions:scaleRows(index.regions,n,'region-summary'),baseIndex:scaleRows(realBases,Math.max(n*2,100),'base')};
  const scaledCountries={...countries};
  const client=createNodeDataClient(scaledIndex,scaledCountries);const dest=countries.DE.regions.find(r=>r.name==='Harz');
  report.planning[n]=timed(()=>{const r=createCanonicalPlan(trip({budget:10000}),dest,client);if(!r.ok||!validateCanonicalPlan(r.plan).valid)throw new Error('benchmark plan invalid')},160);
}
const limits={destinationP99Ms:20,poiP99Ms:30,planningP99Ms:40};
for(const s of Object.values(report.destinationSearch))if(s.p99>limits.destinationP99Ms)throw new Error(`destination p99 ${s.p99}ms exceeds ${limits.destinationP99Ms}`);
for(const s of Object.values(report.poiSpatial))if(s.p99>limits.poiP99Ms)throw new Error(`POI p99 ${s.p99}ms exceeds ${limits.poiP99Ms}`);
for(const s of Object.values(report.planning))if(s.p99>limits.planningP99Ms)throw new Error(`planning p99 ${s.p99}ms exceeds ${limits.planningP99Ms}`);
report.thresholds=limits;report.result='PASS';
fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
