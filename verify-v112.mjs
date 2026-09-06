import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
const data=fs.readFileSync(new URL('./data.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('./service-worker.js',import.meta.url),'utf8');
const checks=[
 ['version 1.12.0',data.includes("APP_VERSION = '1.12.0'")&&sw.includes("labos-v1.12.0")],
 ['internal design preset',app.includes('internal_design')&&app.includes('Internal · Design review')],
 ['internal management preset',app.includes('internal_management')&&app.includes('Management / programme review')],
 ['external customer preset',app.includes('external_customer')&&app.includes('External · Customer validation report')],
 ['external third-party preset',app.includes('external_thirdparty')&&app.includes('Third-party / audit evidence pack')],
 ['anonymise control',app.includes('id="reportAnonymize"')&&app.includes('ANONYMISED COPY')],
 ['anonymisation redactions',app.includes('ANONYMISED CUSTOMER')&&app.includes('[Customer-specific requirement text redacted]')&&app.includes('Controlled specification ${i+1}')],
 ['visual flow helper',app.includes('function reportValidationFlowVisualHtml')&&app.includes('Main test legs are independent')],
 ['planning swimlanes',app.includes('function reportPlanningSwimlaneHtml')&&app.includes('Portfolio execution swimlanes')&&app.includes('Required<br>')&&app.includes('Forecast<br>')],
 ['planning statuses',app.includes("return k==='completed'?'Completed':k==='progress'?'In progress':k==='failed'?'Exception':'Planned'")],
 ['logged data graphs',app.includes('function reportLoggedDataGraphsHtml')&&app.includes('<polyline points="${points}" class="series"/>')],
 ['graph statistics',app.includes('Min <b>')&&app.includes('Avg <b>')&&app.includes('Max <b>')],
 ['visual sections wired',app.includes('${flowVisual}<table>')&&app.includes('${planningVisual}<div class="meta">')&&app.includes('${liveGraphs}<table>')],
 ['executive/customer formatting',app.includes('class="cover"')&&app.includes('class="exec-grid"')&&app.includes('A4 landscape')],
 ['draft watermark retained',app.includes('AUTO-GENERATED • NOT APPROVED')&&app.includes('AUTO-GENERATED · NOT APPROVED')],
 ['approval gating retained',app.includes('Final report approval is locked')&&app.includes('reportMandatoryMissing')],
 ['anonymised report id/file naming',app.includes('ANON-PROGRAMME')&&app.includes("anonymized?'ANONYMISED-':''}AUTO-GENERATED-NOT-APPROVED")],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)pass++}
console.log(`\nRESULT: ${pass===checks.length?'PASS':'FAIL'} · ${pass}/${checks.length} v1.12 visual-report checks`);
if(pass!==checks.length)process.exit(1);
