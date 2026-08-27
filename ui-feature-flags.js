const REISSLIM_RELEASE=Object.freeze({version:'1.7.12',build:'1712'});
function addRevisionToHeader(){const brand=document.querySelector('.brand');if(!brand||document.getElementById('headerRevision'))return;const badge=document.createElement('span');badge.id='headerRevision';badge.className='header-revision';badge.textContent=`v${REISSLIM_RELEASE.version} · ${REISSLIM_RELEASE.build}`;badge.style.cssText='font-size:11px;font-weight:750;opacity:.82;white-space:nowrap;margin-left:8px;';brand.appendChild(badge)}
function loadCompactUi(){if(document.getElementById('reisslimCompactUi'))return;const link=document.createElement('link');link.id='reisslimCompactUi';link.rel='stylesheet';link.href=`./compact-ui.css?v=${REISSLIM_RELEASE.build}`;document.head.appendChild(link)}
function hideTravelReadiness(){const anchor=document.getElementById('readinessScore')||document.getElementById('readinessList')||document.getElementById('readinessDisclaimer');const panel=anchor?.closest('section,article,.panel');if(panel)panel.hidden=true}
function setupTopology(){const mode=document.getElementById('travelMode');if(mode){mode.value='direct';const label=mode.closest('label');if(label)label.style.display='none'}const select=document.getElementById('routeTopology');if(select){const current=select.value;select.innerHTML='<option value="loop">Lus — andere route terug</option><option value="out-and-back">Heen & terug — dezelfde route</option><option value="open-ended">Open einde — eindig op bestemming</option>';select.value=['loop','out-and-back','open-ended'].includes(current)?current:'loop'}}
function enablePreferenceDrivenReplanning(){
  const grid=document.getElementById('preferenceGrid'),form=document.getElementById('tripForm');
  if(!grid||!form||grid.dataset.preferenceReplan==='1')return;
  grid.dataset.preferenceReplan='1';
  let timer;
  grid.addEventListener('change',event=>{
    if(!event.target.matches('[data-pref],[data-priority]'))return;
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const status=document.getElementById('autosaveStatus');
      if(status)status.textContent='Voorkeuren bijgewerkt — voorstellen opnieuw gerangschikt';
      form.dispatchEvent(new CustomEvent('reisslim:preferences-changed',{bubbles:false}));
    },120);
  });
}
function hideGenericPlaces(){document.querySelectorAll('.place-proposal').forEach(card=>{const text=card.textContent||'';if(/categorievoorstel|wordt live gezocht/i.test(text))card.style.display='none'})}
function installStrictGpxExport(){const button=document.getElementById('exportGpxBtn');if(!button||button.dataset.strictExport==='1')return;button.dataset.strictExport='1';document.addEventListener('click',async event=>{const target=event.target.closest('#exportGpxBtn');if(!target)return;event.preventDefault();event.stopImmediatePropagation();const status=document.getElementById('exportStatus');target.disabled=true;if(status)status.textContent='Volledige wegroute en specifieke waypoints opbouwen…';try{const[{loadDraft},{downloadGpx},{destinations}]=await Promise.all([import('./storage.js'),import('./gpx-generator.js'),import('./destinations.js')]);const record=loadDraft();if(!record?.trip||!record?.plan)throw new Error('Geen actief reisplan gevonden');const destination=record.destinationProfile||destinations.find(item=>item.id===record.destinationId)||{id:record.destinationId||'reis',name:record.destinationId||'Reis'};const result=await downloadGpx(record.trip,destination,record.plan);if(status)status.textContent=`GPX klaar: ${result.trackPoints} routepunten · ${result.specificWaypoints} specifieke waypoints.`}catch(error){console.error(error);if(status)status.textContent=`GPX niet geëxporteerd: volledige wegroute kon niet worden opgehaald. ${error.message||''}`}finally{target.disabled=false}},true)}

function preferLiveDestinationCards(){
  const cards=[...document.querySelectorAll('.destination-card')];
  const running=document.body.dataset.liveDiscovery==='running';
  const liveCards=cards.filter(card=>!/Fallback roadtripanker/i.test(card.textContent||''));
  const fallbackCards=cards.filter(card=>/Fallback roadtripanker/i.test(card.textContent||''));
  if(running && fallbackCards.length && !liveCards.length)fallbackCards.forEach(card=>card.style.display='none');
  else fallbackCards.forEach(card=>card.style.display='');
}


function normalizeLegacyStatusText(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{
    const value=node.nodeValue||'';
    if(/offline corridorraming/i.test(value))node.nodeValue=value.replace(/offline corridorraming/gi,'voorlopige route-inschatting');
    if(/offline plaatsen/i.test(value))node.nodeValue=value.replace(/offline plaatsen/gi,'specifieke plaatsen nog niet geladen');
  });
}


const criteriaLabels={budget:'Budget',driving:'Reisbelasting',season:'Seizoen',transport:'Voertuigmatch',scenery:'Landschap',walking:'Wandelen',swimming:'Zwemmen',food:'Eten',culture:'Cultuur',crowds:'Rust / drukte'};

function removeDeprecatedSections(){
  document.querySelectorAll('.inspiration-grid').forEach(grid=>grid.closest('section.panel')?.remove());
  document.getElementById('allowStretch')?.closest('label')?.remove();
  const notice=document.getElementById('portfolioNotice');
  if(notice&&/^Waarom deze mix\?/i.test((notice.textContent||'').trim()))notice.innerHTML='';
}

function criterionRow(key,value,tone){
  const label=criteriaLabels[key]||key;
  return `<div class="criterion-row ${tone}"><span>${label}</span><strong>${Math.round(value)}</strong><i style="--criterion:${Math.max(0,Math.min(100,value))}%"></i></div>`;
}

function enhanceProposalScores(){
  const registry=globalThis.__REISSLIM_PROPOSAL_SCORES||{};
  document.querySelectorAll('.destination-card').forEach(card=>{
    const id=card.querySelector('[data-select]')?.dataset.select;
    const scores=id&&registry[id];
    if(!scores)return;
    card.querySelector('.dimension-grid')?.classList.add('legacy-dimensions-hidden');
    let panel=card.querySelector('.score-extremes');
    const entries=Object.entries(scores).filter(([,value])=>Number.isFinite(Number(value))).map(([key,value])=>[key,Number(value)]);
    if(entries.length<6)return;
    const top=[...entries].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3);
    const bottom=[...entries].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).slice(0,3);
    const content=`<div class="score-extremes-head"><div><span>STERKSTE MATCH</span><strong>Top 3</strong></div><div><span>ZWAKSTE MATCH</span><strong>Bottom 3</strong></div></div><div class="score-extremes-grid"><div>${top.map(([key,value])=>criterionRow(key,value,'positive')).join('')}</div><div>${bottom.map(([key,value])=>criterionRow(key,value,'negative')).join('')}</div></div>`;
    if(!panel){
      panel=document.createElement('section');
      panel.className='score-extremes';
      const anchor=card.querySelector('.constraint-summary')||card.querySelector('.chips');
      anchor?.insertAdjacentElement('afterend',panel);
    }
    panel.innerHTML=content;
  });
}

function polishProposalCards(){
  document.querySelectorAll('.destination-card').forEach(card=>{
    card.classList.add('premium-proposal');
    const explanation=card.querySelector('.ai-explanation');
    if(explanation&&!explanation.dataset.polished){
      explanation.dataset.polished='1';
      explanation.classList.add('proposal-insight');
    }
  });
}


const visualCriterionIcons={budget:'€',driving:'🛣️',season:'☀️',transport:'🏍️',scenery:'🏔️',walking:'🥾',swimming:'🏊',food:'🍽️',culture:'🏛️',crowds:'🌿'};

function visualiseProposalCards(){
  const registry=globalThis.__REISSLIM_PROPOSAL_SCORES||{};
  document.querySelectorAll('.destination-card').forEach(card=>{
    if(card.dataset.visualised==='1')return;
    card.dataset.visualised='1';
    const id=card.querySelector('[data-select]')?.dataset.select;
    const scores=id&&registry[id];
    const body=card.querySelector('.card-body');
    if(!body)return;

    const summary=card.querySelector('.card-body>.muted');
    if(summary)summary.classList.add('proposal-summary-compact');

    const explanation=card.querySelector('.ai-explanation');
    if(explanation){
      const raw=(explanation.textContent||'').replace(/^Waarom deze\?\s*/i,'').trim();
      const bullets=raw.split(/(?:;\s+|\.\s+)/).map(v=>v.trim()).filter(v=>v.length>12).slice(0,3);
      const visual=document.createElement('div');
      visual.className='proposal-visual-highlights';
      visual.innerHTML=`<div class="visual-highlight-title"><span>✨</span><strong>Waarom deze reis</strong></div><ul>${bullets.map(item=>`<li>${item}</li>`).join('')}</ul>`;
      explanation.replaceWith(visual);
    }

    if(scores){
      const best=Object.entries(scores).filter(([,v])=>Number.isFinite(Number(v))).sort((a,b)=>b[1]-a[1]).slice(0,4);
      const strip=document.createElement('div');
      strip.className='proposal-pictogram-strip';
      strip.innerHTML=best.map(([key,value])=>`<span title="${criteriaLabels[key]||key} ${Math.round(value)}/100"><b>${visualCriterionIcons[key]||'★'}</b><small>${criteriaLabels[key]||key}</small></span>`).join('');
      const title=card.querySelector('h3');
      title?.insertAdjacentElement('afterend',strip);
    }
  });
}

function ensureCompareDock(){
  let dock=document.getElementById('compareDock');
  if(!dock){
    dock=document.createElement('div');
    dock.id='compareDock';
    dock.className='compare-dock hidden';
    dock.innerHTML='<div><span>⇄</span><strong>Vergelijk reizen</strong><small id="compareDockCount">0 geselecteerd</small></div><button type="button" id="openCompareDock">Vergelijk</button>';
    document.body.appendChild(dock);
    dock.querySelector('#openCompareDock')?.addEventListener('click',()=>{
      const section=document.getElementById('compareSection');
      if(section){
        section.classList.remove('hidden');
        section.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
  }
  const count=document.querySelectorAll('[data-compare]:checked').length;
  dock.classList.toggle('hidden',count<2);
  const countEl=dock.querySelector('#compareDockCount');
  if(countEl)countEl.textContent=`${count} geselecteerd`;
}

function enhanceComparisonUi(){
  ensureCompareDock();
  const section=document.getElementById('compareSection');
  if(!section)return;
  const checked=document.querySelectorAll('[data-compare]:checked').length;
  if(checked>=2)section.classList.remove('hidden');
  section.classList.add('premium-comparison');
}

function applyReleaseUi(){loadCompactUi();addRevisionToHeader();hideTravelReadiness();setupTopology();enablePreferenceDrivenReplanning();installStrictGpxExport();hideGenericPlaces();normalizeLegacyStatusText();preferLiveDestinationCards();removeDeprecatedSections();enhanceProposalScores();polishProposalCards();visualiseProposalCards();enhanceComparisonUi();let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{observer.disconnect();hideGenericPlaces();normalizeLegacyStatusText();preferLiveDestinationCards();removeDeprecatedSections();enhanceProposalScores();polishProposalCards();visualiseProposalCards();enhanceComparisonUi();enablePreferenceDrivenReplanning();installStrictGpxExport();observer.observe(document.body,{childList:true,subtree:true});scheduled=false})});observer.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyReleaseUi,{once:true});else applyReleaseUi();

window.addEventListener('reisslim:compare-updated',()=>setTimeout(enhanceComparisonUi,0));

function syncPremiumRouteRadios(){
  const select=document.getElementById('routeTopology');
  document.querySelectorAll('input[name="routeTopologyUi"]').forEach(r=>r.checked=r.value===select?.value);
}
new MutationObserver(()=>syncPremiumRouteRadios()).observe(document.body,{subtree:true,childList:true});
document.addEventListener('change',event=>{if(event.target?.id==='routeTopology')syncPremiumRouteRadios()});
