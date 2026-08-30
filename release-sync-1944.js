(function(){
  const VERSION='1.15.4',BUILD='1944';
  const LOCAL_TRIP_IMAGES=Array.from({length:30},(_,i)=>`pending-${String(i+1).padStart(2,'0')}.webp`);
  let placeholderRaf=0;
  function setText(id,text){const el=document.getElementById(id);if(el&&el.textContent!==text)el.textContent=text}
  function safeImageUrl(value){try{const u=new URL(String(value||''),location.href);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return''}}
  function ensureImagePreconnect(){for(const href of ['https://en.wikipedia.org','https://commons.wikimedia.org','https://upload.wikimedia.org']){if(document.head?.querySelector(`link[rel="preconnect"][href="${href}"]`))continue;const link=document.createElement('link');link.rel='preconnect';link.href=href;link.crossOrigin='anonymous';document.head?.appendChild(link)}}
  function syncPlannerSemantics(){
    const structure=document.getElementById('tripStructure');
    const maxChanges=document.getElementById('maxChanges');
    const moving=structure?.querySelector('option[value="moving"]');
    if(moving)moving.textContent='Roadtrip — meerdere verblijfplaatsen';
    const base=structure?.querySelector('option[value="base"]');
    if(base)base.textContent='Slimme uitvalsbasis — dagritten';
    if(maxChanges){
      const movingSelected=structure?.value==='moving';
      maxChanges.min=movingSelected?'1':'0';
      if(movingSelected&&Number(maxChanges.value)<1){maxChanges.value='1';maxChanges.dispatchEvent(new Event('change',{bubbles:true}))}
      const label=maxChanges.closest('label');
      if(label&&!label.querySelector('.max-changes-note')){const note=document.createElement('small');note.className='max-changes-note';note.textContent='Maximum, geen doelwaarde.';label.appendChild(note)}
    }
    const topology=document.getElementById('routeTopology');
    const openRadio=document.querySelector('input[name="routeTopologyUi"][value="open-ended"]');
    const baseSelected=structure?.value==='base';
    if(openRadio)openRadio.disabled=Boolean(baseSelected);
    if(baseSelected&&topology?.value==='open-ended'){topology.value='loop';topology.dispatchEvent(new Event('change',{bubbles:true}))}
  }
  function sync(){setText('headerRevision',`v${VERSION} · ${BUILD}`);setText('versionLabel',`ReisSlim v${VERSION} · Build ${BUILD}`);const root=document.documentElement;root.dataset.reisslimVersion=VERSION;root.dataset.reisslimBuild=BUILD;ensureImagePreconnect();syncPlannerSemantics();schedulePlaceholders()}
  function bind(){const structure=document.getElementById('tripStructure');if(structure&&!structure.dataset.changeSemantics1944){structure.dataset.changeSemantics1944='1';structure.addEventListener('change',syncPlannerSemantics)}}
  function createImage(url,alt,{className='',eager=false,high=false,fallback=false}={}){const img=document.createElement('img');if(className)img.className=className;img.src=url;img.alt=alt||'';img.decoding='async';img.loading=eager?'eager':'lazy';if(high)img.fetchPriority='high';if(/^https?:/i.test(url))img.referrerPolicy='no-referrer';if(fallback)img.dataset.reisslimFallback='1';return img}
  function hash(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
  function fallbackUrl(key){return LOCAL_TRIP_IMAGES[hash(key)%LOCAL_TRIP_IMAGES.length]}
  function cardKey(node){return node?.querySelector?.('[data-portfolio-select]')?.dataset.portfolioSelect||node?.querySelector?.('[data-select]')?.dataset.select||node?.querySelector?.('[data-compare-choose]')?.dataset.compareChoose||node?.textContent?.trim().slice(0,80)||'reisslim'}
  function addQuickFallback(card,index){if(!card||card.querySelector(':scope > img'))return;const placeholder=card.querySelector(':scope > .portfolio-fallback-photo');if(!placeholder)return;const key=cardKey(card),img=createImage(fallbackUrl(key),'Reisbeeld terwijl de bestemmingsfoto wordt opgehaald',{eager:index<4,high:index<2,fallback:true});placeholder.replaceWith(img)}
  function addDestinationFallback(card,index){if(!card)return;const hero=card.querySelector('.proposal-hero');if(!hero||hero.querySelector('img.destination-image'))return;const icon=hero.querySelector(':scope > span');if(!icon)return;const key=cardKey(card),img=createImage(fallbackUrl(key),'Reisbeeld terwijl de bestemmingsfoto wordt opgehaald',{className:'destination-image',eager:index<3,high:index<2,fallback:true});icon.replaceWith(img)}
  function addThumbFallback(node){if(!node||node.tagName==='IMG')return;const className=[...node.classList].filter(c=>c!=='portfolio-thumb-loading').join(' ');const scope=node.closest('tr,.portfolio-map-row,.portfolio-map-popup,.portfolio-table-trip')||node.parentElement;const img=createImage(fallbackUrl(cardKey(scope)),'',{className,fallback:true});node.replaceWith(img)}
  function addComparisonFallback(card,index){if(!card||card.querySelector(':scope > img'))return;const img=createImage(fallbackUrl(cardKey(card)),'Reisbeeld terwijl de bestemmingsfoto wordt opgehaald',{eager:index<3,high:index<2,fallback:true});card.prepend(img)}
  function ensureFastPlaceholders(){document.querySelectorAll('.portfolio-quick-card').forEach(addQuickFallback);document.querySelectorAll('.destination-card').forEach(addDestinationFallback);document.querySelectorAll('.portfolio-thumb-loading').forEach(addThumbFallback);document.querySelectorAll('.compare-overview-card').forEach(addComparisonFallback);document.querySelectorAll('.portfolio-quick-card > img').forEach((img,index)=>{img.loading='eager';img.decoding='async';img.fetchPriority=index<4?'high':'auto'});document.querySelectorAll('.portfolio-table-thumb,.portfolio-map-thumb,.portfolio-popup-thumb').forEach(img=>{img.loading='eager';img.decoding='async'})}
  function schedulePlaceholders(){if(placeholderRaf)return;placeholderRaf=requestAnimationFrame(()=>{placeholderRaf=0;ensureFastPlaceholders()})}
  function replaceImage(img,url,alt='',priority=false){if(!img)return;img.loading='eager';img.decoding='async';img.fetchPriority=priority?'high':'auto';img.src=url;if(alt)img.alt=alt;delete img.dataset.reisslimFallback}
  function patchDestinationCard(card,url,name){if(!card)return;const hero=card.querySelector('.proposal-hero');if(!hero)return;let img=hero.querySelector('img.destination-image');if(!img){img=createImage(url,`Beeld van ${name}`,{className:'destination-image'});const placeholder=hero.querySelector(':scope > span');if(placeholder)placeholder.replaceWith(img);else hero.prepend(img)}else replaceImage(img,url,`Beeld van ${name}`,true)}
  function patchQuickCard(card,url,name,index){if(!card)return;let img=card.querySelector(':scope > img');if(!img){const fallback=card.querySelector(':scope > .portfolio-fallback-photo');img=createImage(url,`Beeld van ${name}`,{eager:index<3,high:index<2});if(fallback)fallback.replaceWith(img);else card.prepend(img)}else replaceImage(img,url,`Beeld van ${name}`,index<4)}
  function patchThumb(scope,url){if(!scope)return;const img=scope.querySelector('img[data-reisslim-fallback="1"],.portfolio-thumb-loading');if(!img)return;if(img.tagName==='IMG')replaceImage(img,url,'',false);else{const className=[...img.classList].filter(c=>c!=='portfolio-thumb-loading').join(' ');img.replaceWith(createImage(url,'',{className}))}}
  function patchComparisonCard(card,url,name,index){if(!card)return;let img=card.querySelector(':scope > img');if(!img){img=createImage(url,`Beeld van ${name}`,{eager:index<2,high:index===0});card.prepend(img)}else replaceImage(img,url,`Beeld van ${name}`,index<3)}
  function patchPlanHero(url,name){const title=document.getElementById('planVisualTitle')?.textContent||'';if(!title||!String(title).toLocaleLowerCase('nl-NL').includes(String(name).toLocaleLowerCase('nl-NL')))return;const img=document.getElementById('planVisualImage');if(img){replaceImage(img,url,`Beeld van ${name} langs de voorgestelde route`,true);img.hidden=false}}
  function onImageReady(event){const detail=event?.detail||{},id=String(detail.id||''),url=safeImageUrl(detail.image?.url),name=String(detail.name||'bestemming').replace(/\s*&\s*omgeving$/i,'');if(!id||!url)return;const escaped=globalThis.CSS?.escape?CSS.escape(id):id.replace(/["\\]/g,'\\$&');document.querySelectorAll(`[data-select="${escaped}"]`).forEach(button=>patchDestinationCard(button.closest('.destination-card'),url,name));document.querySelectorAll(`[data-portfolio-select="${escaped}"]`).forEach(button=>{const card=button.closest('.portfolio-quick-card');if(card){const index=[...document.querySelectorAll('.portfolio-quick-card')].indexOf(card);patchQuickCard(card,url,name,index)}patchThumb(button.closest('tr,.portfolio-map-row,.portfolio-map-popup'),url)});document.querySelectorAll(`[data-compare-choose="${escaped}"]`).forEach(button=>{const card=button.closest('.compare-overview-card');if(card){const index=[...document.querySelectorAll('.compare-overview-card')].indexOf(card);patchComparisonCard(card,url,name,index)}});patchPlanHero(url,name)}
  let startStallSince=0,startStallRecovered=false;
  function planOverlayStarting(){
    const overlay=document.getElementById('planLoadingOverlay');
    if(!overlay||overlay.classList.contains('hidden'))return false;
    const percent=String(document.getElementById('planLoadingPercent')?.textContent||'').trim();
    const stage=String(document.getElementById('planLoadingStage')?.textContent||'').trim().toLocaleLowerCase('nl-NL');
    return percent==='4%'&&(!stage||stage==='starten');
  }
  function recoverStartupStall(reason='onbekende fout'){
    if(startStallRecovered||!planOverlayStarting())return false;
    startStallRecovered=true;
    const overlay=document.getElementById('planLoadingOverlay');
    overlay?.classList.add('hidden');
    const error=document.getElementById('formError');
    if(error){
      error.textContent=`Reisplan kon niet starten (${String(reason).slice(0,180)}). De laadweergave is vrijgegeven; probeer de reis opnieuw.`;
      error.classList.remove('hidden');
    }
    const status=document.getElementById('autosaveStatus');if(status)status.textContent='Reisplanstart afgebroken — geen vastgelopen laadscherm';
    console.error('ReisSlim start-invariant hersteld',reason);
    return true;
  }
  globalThis.addEventListener?.('error',event=>{if(planOverlayStarting())recoverStartupStall(event?.error?.message||event?.message||'JavaScript-fout')});
  globalThis.addEventListener?.('unhandledrejection',event=>{if(planOverlayStarting())recoverStartupStall(event?.reason?.message||event?.reason||'asynchrone fout')});
  setInterval(()=>{
    if(!planOverlayStarting()){startStallSince=0;return}
    if(!startStallSince)startStallSince=Date.now();
    else if(Date.now()-startStallSince>3000)recoverStartupStall('startfase langer dan 3 seconden zonder voortgang');
  },250);

  globalThis.addEventListener?.('reisslim:image-ready',onImageReady);
  const observer=new MutationObserver(mutations=>{if(mutations.some(m=>m.addedNodes?.length))schedulePlaceholders()});
  function observe(){if(document.body)observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{sync();bind();observe();schedulePlaceholders()},{once:true});else{sync();bind();observe();schedulePlaceholders()}
  [0,100,300,800,1600].forEach(delay=>setTimeout(()=>{sync();bind();schedulePlaceholders()},delay));
})();
