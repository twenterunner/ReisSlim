const REISSLIM_RELEASE=Object.freeze({version:'1.5.4',build:'1504'});
function addRevisionToHeader(){const brand=document.querySelector('.brand');if(!brand||document.getElementById('headerRevision'))return;const badge=document.createElement('span');badge.id='headerRevision';badge.className='header-revision';badge.textContent=`v${REISSLIM_RELEASE.version} · ${REISSLIM_RELEASE.build}`;badge.style.cssText='font-size:11px;font-weight:750;opacity:.82;white-space:nowrap;margin-left:8px;';brand.appendChild(badge)}
function loadCompactUi(){if(document.getElementById('reisslimCompactUi'))return;const link=document.createElement('link');link.id='reisslimCompactUi';link.rel='stylesheet';link.href=`./compact-ui.css?v=${REISSLIM_RELEASE.build}`;document.head.appendChild(link)}
function hideTravelReadiness(){const anchor=document.getElementById('readinessScore')||document.getElementById('readinessList')||document.getElementById('readinessDisclaimer');const panel=anchor?.closest('section,article,.panel');if(panel)panel.hidden=true}
function setupTopology(){const mode=document.getElementById('travelMode');if(mode){mode.value='direct';const label=mode.closest('label');if(label)label.style.display='none'}const select=document.getElementById('routeTopology');if(select){const current=select.value;select.innerHTML='<option value="loop">Lus — andere route terug</option><option value="out-and-back">Heen & terug — dezelfde route</option><option value="open-ended">Open einde — eindig op bestemming</option>';select.value=['loop','out-and-back','open-ended'].includes(current)?current:'loop'}}
function enablePreferenceDrivenReplanning(){const grid=document.getElementById('preferenceGrid'),form=document.getElementById('tripForm'),results=document.getElementById('resultsSection');if(!grid||!form||grid.dataset.preferenceReplan==='1')return;grid.dataset.preferenceReplan='1';let timer;grid.addEventListener('change',event=>{if(!event.target.matches('[data-pref],[data-priority]'))return;clearTimeout(timer);timer=setTimeout(()=>{if(results&&!results.classList.contains('hidden')){const status=document.getElementById('autosaveStatus');if(status)status.textContent='Voorkeuren gewijzigd — voorstellen opnieuw berekenen…';form.requestSubmit()}},250)})}
function hideGenericPlaces(){document.querySelectorAll('.place-proposal').forEach(card=>{const text=card.textContent||'';if(/categorievoorstel|wordt live gezocht/i.test(text))card.style.display='none'})}
function installStrictGpxExport(){const button=document.getElementById('exportGpxBtn');if(!button||button.dataset.strictExport==='1')return;button.dataset.strictExport='1';document.addEventListener('click',async event=>{const target=event.target.closest('#exportGpxBtn');if(!target)return;event.preventDefault();event.stopImmediatePropagation();const status=document.getElementById('exportStatus');target.disabled=true;if(status)status.textContent='Volledige wegroute en specifieke waypoints opbouwen…';try{const[{loadDraft},{downloadGpx},{destinations}]=await Promise.all([import('./storage.js'),import('./gpx-generator.js'),import('./destinations.js')]);const record=loadDraft();if(!record?.trip||!record?.plan)throw new Error('Geen actief reisplan gevonden');const destination=record.destinationProfile||destinations.find(item=>item.id===record.destinationId)||{id:record.destinationId||'reis',name:record.destinationId||'Reis'};const result=await downloadGpx(record.trip,destination,record.plan);if(status)status.textContent=`GPX klaar: ${result.trackPoints} routepunten · ${result.specificWaypoints} specifieke waypoints.`}catch(error){console.error(error);if(status)status.textContent=`GPX niet geëxporteerd: volledige wegroute kon niet worden opgehaald. ${error.message||''}`}finally{target.disabled=false}},true)}

function preferLiveDestinationCards(){
  const results=document.getElementById('resultsSection');
  const cards=[...document.querySelectorAll('.destination-card')];
  if(!results||!cards.length)return;
  const liveCards=cards.filter(card=>!/Fallback roadtripanker/i.test(card.textContent||''));
  const fallbackCards=cards.filter(card=>/Fallback roadtripanker/i.test(card.textContent||''));
  let notice=document.getElementById('liveDiscoveryNotice');
  if(fallbackCards.length && !liveCards.length){
    fallbackCards.forEach(card=>card.style.display='none');
    if(!notice){
      notice=document.createElement('div');
      notice.id='liveDiscoveryNotice';
      notice.className='inline-warning';
      notice.innerHTML='<strong>Live reisopties zoeken…</strong><p>ReisSlim gebruikt de fallbackcatalogus niet zolang live OpenStreetMap-ontdekking nog loopt. Dit kan op mobiele data 10–45 seconden duren.</p>';
      const holder=document.getElementById('destinationCards');
      holder?.prepend(notice);
    }
  }else{
    fallbackCards.forEach(card=>card.style.display='');
    notice?.remove();
  }
}

function applyReleaseUi(){loadCompactUi();addRevisionToHeader();hideTravelReadiness();setupTopology();enablePreferenceDrivenReplanning();installStrictGpxExport();hideGenericPlaces();preferLiveDestinationCards();let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{observer.disconnect();hideGenericPlaces();preferLiveDestinationCards();enablePreferenceDrivenReplanning();installStrictGpxExport();observer.observe(document.body,{childList:true,subtree:true});scheduled=false})});observer.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyReleaseUi,{once:true});else applyReleaseUi();
