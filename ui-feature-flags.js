const REISSLIM_RELEASE=Object.freeze({version:'1.4.9',build:'1409'});
function addRevisionToHeader(){const brand=document.querySelector('.brand');if(!brand||document.getElementById('headerRevision'))return;const badge=document.createElement('span');badge.id='headerRevision';badge.className='header-revision';badge.textContent=`v${REISSLIM_RELEASE.version} · ${REISSLIM_RELEASE.build}`;badge.style.cssText='font-size:11px;font-weight:750;opacity:.82;white-space:nowrap;margin-left:8px;';brand.appendChild(badge)}
function loadCompactUi(){if(document.getElementById('reisslimCompactUi'))return;const link=document.createElement('link');link.id='reisslimCompactUi';link.rel='stylesheet';link.href=`./compact-ui.css?v=${REISSLIM_RELEASE.build}`;document.head.appendChild(link)}
function hideTravelReadiness(){const anchor=document.getElementById('readinessScore')||document.getElementById('readinessList')||document.getElementById('readinessDisclaimer');const panel=anchor?.closest('section,article,.panel');if(panel)panel.hidden=true}
function setupTopology(){const mode=document.getElementById('travelMode');if(mode){mode.value='direct';const label=mode.closest('label');if(label)label.style.display='none'}const select=document.getElementById('routeTopology');if(!select)return;const current=select.value;select.innerHTML='<option value="loop">Lus — andere route terug</option><option value="out-and-back">Heen & terug — dezelfde route</option><option value="open-ended">Open einde — eindig op bestemming</option>';select.value=['loop','out-and-back','open-ended'].includes(current)?current:'loop'}
function qualitative(value,kind){const n=Number(value);if(kind==='pref')return n>=90?'zeer sterk':n>=70?'sterk':n>=50?'redelijk':'zwak';if(kind==='budget')return n>=90?'ruime marge':n>=70?'goede marge':n>=50?'krap':'boven doel';return n>=90?'uitstekend':n>=75?'sterk':n>=60?'redelijk':'beperkt'}
function upgradeCards(){
 document.querySelectorAll('.destination-card').forEach(card=>{
   const explanation=card.querySelector('.ai-explanation');if(explanation&&!explanation.dataset.v144){explanation.dataset.v144='1';}
   const pills=[...card.querySelectorAll('.dimension-score')];if(pills.length>=4){
     const vals=pills.map(p=>Number(p.querySelector('strong')?.textContent||0));
     const defs=[['Voorkeursmatch', 'pref'],['Roadtripfit','road'],['Seizoenfit','road'],['Voertuig/routefit','road']];
     pills.forEach((p,i)=>{const span=p.querySelector('span'),strong=p.querySelector('strong');if(span)span.textContent=defs[i][0];if(strong&&!strong.dataset.q){strong.dataset.q='1';strong.insertAdjacentHTML('afterend',`<small>${qualitative(vals[i],defs[i][1])}</small>`)}})
   }
 });
 // Never present unresolved generic placeholders as if they were recommendations.
 document.querySelectorAll('.place-proposal').forEach(card=>{if(card.textContent.includes('categorievoorstel')||card.textContent.includes('wordt live gezocht'))card.style.display='none'})
}
function applyReleaseUi(){
 loadCompactUi();addRevisionToHeader();hideTravelReadiness();setupTopology();upgradeCards();
 let scheduled=false;
 const observer=new MutationObserver(()=>{
   if(scheduled)return;
   scheduled=true;
   requestAnimationFrame(()=>{
     observer.disconnect();
     upgradeCards();
     observer.observe(document.body,{childList:true,subtree:true});
     scheduled=false;
   });
 });
 observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyReleaseUi,{once:true});else applyReleaseUi();

function removeObsoleteFlyDriveCopy(){
  const rx=/fly[ -]?(drive|ride|camper)|flydrive|vlucht\s*\+|vliegen|multimodaal/gi;
  document.querySelectorAll('option,small,p,span,label,legend').forEach(node=>{
    const txt=(node.textContent||'').trim();
    if(!txt||!rx.test(txt)){rx.lastIndex=0;return}
    rx.lastIndex=0;
    if(node.tagName==='OPTION'){node.remove();return}
    if(!node.querySelector('input,select,button,a')){
      node.textContent=txt.replace(rx,'roadtrip').replace(/\s{2,}/g,' ').trim();
    }
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeObsoleteFlyDriveCopy,{once:true});else removeObsoleteFlyDriveCopy();
