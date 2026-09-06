import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync('app.js','utf8');
function extract(name){
  const marker=`function ${name}(`;
  const start=src.indexOf(marker); if(start<0) throw new Error(`Missing ${name}`);
  let brace=src.indexOf('{',start), depth=0, quote=null, esc=false, templateDepth=0;
  for(let i=brace;i<src.length;i++){
    const ch=src[i], prev=src[i-1];
    if(quote){
      if(esc){esc=false;continue;} if(ch==='\\'){esc=true;continue;}
      if(quote==='`' && ch==='$' && src[i+1]==='{'){templateDepth++; i++; depth++; continue;}
      if(ch===quote && templateDepth===0){quote=null;continue;}
      if(quote==='`' && ch==='}' && templateDepth>0){templateDepth--; depth--; continue;}
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++; else if(ch==='}'){depth--; if(depth===0)return src.slice(start,i+1);}
  }
  throw new Error(`Unclosed ${name}`);
}

const names=['builderMainLegNo','builderImmediateChildren','builderLegLabel','compactBuilderMainLegNumbers','builderDescendants','normalizeBuilderTopology','rehomeBuilderLegFromPredecessors'];
const context={console,Date,Math,Set,Map,Object,Array,Number,String}; vm.createContext(context);
vm.runInContext(names.map(extract).join('\n'),context);
const {normalizeBuilderTopology,rehomeBuilderLegFromPredecessors,builderLegLabel,builderMainLegNo}=context;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const leg=(id,no,deps=[])=>({id,mainLegNo:no,stepNo:1,dependsOn:deps,phase:'common',branchKey:'',branchGroup:'',mergeFrom:''});

// Single predecessor re-homes the test and downstream chain into predecessor's Test Leg.
{
 const A=leg('A',1),B=leg('B',2),C=leg('C',3,['A']),D=leg('D',3,['C']),d={legs:[A,B,C,D],branchMerges:{}};
 normalizeBuilderTopology(d); const r=rehomeBuilderLegFromPredecessors(d,C);
 assert(r.ok,'single predecessor move rejected');
 assert(builderMainLegNo(C)===1,'C did not move to Test Leg 1');
 assert(builderMainLegNo(D)===1,'downstream D did not follow C into Test Leg 1');
 assert(builderLegLabel(C)==='1.2',`C label wrong: ${builderLegLabel(C)}`);
 assert(builderLegLabel(D)==='1.3',`D label wrong: ${builderLegLabel(D)}`);
}
// Removing predecessor creates an independent main Test Leg and keeps downstream with it.
{
 const A=leg('A',1),B=leg('B',2),C=leg('C',1,['A']),D=leg('D',1,['C']),d={legs:[A,B,C,D],branchMerges:{}};
 normalizeBuilderTopology(d); C.dependsOn=[]; const r=rehomeBuilderLegFromPredecessors(d,C);
 assert(r.ok,'independent move rejected');
 assert(builderMainLegNo(C)===3,'C did not become a new independent Test Leg');
 assert(builderMainLegNo(D)===3,'D did not follow independent C');
 assert(builderLegLabel(C)==='3.1','independent C not renumbered 3.1');
}
// Cross-main-leg joins are rejected because main Test Legs are independent.
{
 const A=leg('A',1),B=leg('B',2),J=leg('J',3,['A','B']),d={legs:[A,B,J],branchMerges:{}};
 normalizeBuilderTopology(d); const r=rehomeBuilderLegFromPredecessors(d,J);
 assert(!r.ok && /different main Test Legs/.test(r.message),'cross-main join was not rejected');
}
// A branch join inside one main Test Leg becomes a common post-merge test.
{
 const P=leg('P',1),A={...leg('A',1,['P']),branchKey:'a',branchGroup:'G',phase:'branch'},B={...leg('B',1,['P']),branchKey:'b',branchGroup:'G',phase:'branch'},J=leg('J',2,['A','B']),d={legs:[P,A,B,J],branchMerges:{}};
 normalizeBuilderTopology(d); const r=rehomeBuilderLegFromPredecessors(d,J);
 assert(r.ok,'same-leg branch join rejected');
 assert(builderMainLegNo(J)===1 && J.phase==='post' && J.mergeFrom==='G','branch join did not become post-merge Test Leg 1 flow');
 assert(d.branchMerges.G?.merged===true,'branch merge state not recorded');
}

// Reporting contract source checks.
for(const token of ['AUTO-GENERATED • NOT APPROVED','Customer & programme','Requirements & acceptance criteria','Complete logged live-data appendix','Approve controlled test report','Authorised reviewer','approvedBy','finalConclusion'])assert(src.includes(token),`reporting feature missing: ${token}`);
// Lesson-to-action contract source checks.
for(const token of ['What LabOS actually does with this lesson','No silent changes.','Review actionable proposal','Open implementation / effectiveness action','Manual lesson retained as advisory evidence'])assert(src.includes(token),`lesson action feature missing: ${token}`);
// Predecessor UI contract source checks.
for(const token of ['Predecessor controls visual position','Save & move into flow','Moved to Test Leg'])assert(src.includes(token),`predecessor UI feature missing: ${token}`);

console.log('LabOS v1.10.0 focused verification: PASS');
console.log(' - predecessor topology: 4/4 scenarios PASS');
console.log(' - controlled auto-report source contract: PASS');
console.log(' - lessons-to-action source contract: PASS');
