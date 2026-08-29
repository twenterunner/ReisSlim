(function(){
  const VERSION='1.14.5',BUILD='1932';
  function setText(id,text){const el=document.getElementById(id);if(el&&el.textContent!==text)el.textContent=text}
  function safeImageUrl(value){try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:''}catch{return''}}
  function ensureImagePreconnect(){for(const href of ['https://commons.wikimedia.org','https://upload.wikimedia.org']){if(document.head?.querySelector(`link[rel=\"preconnect\"][href=\"${href}\"]`))continue;const link=document.createElement('link');link.rel='preconnect';link.href=href;link.crossOrigin='anonymous';document.head?.appendChild(link)}}
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
      if(movingSelected&&Number(maxChanges.value)<1){
        maxChanges.value='1';
        maxChanges.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const label=maxChanges.closest('label');
      if(label&&!label.querySelector('.max-changes-note')){
        const note=document.createElement('small');
        note.className='max-changes-note';
        note.textContent='Maximum, geen doelwaarde.';
        label.appendChild(note);
      }
    }
    // A central-base holiday necessarily returns from the same base. The old UI
    // allowed the contradictory combination base + open-ended, which app.js then
    // silently treated as a return trip. Normalize that impossible combination.
    const topology=document.getElementById('routeTopology');
    const openRadio=document.querySelector('input[name="routeTopologyUi"][value="open-ended"]');
    const baseSelected=structure?.value==='base';
    if(openRadio)openRadio.disabled=Boolean(baseSelected);
    if(baseSelected&&topology?.value==='open-ended'){
      topology.value='loop';
      topology.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  function sync(){
    setText('headerRevision',`v${VERSION} · ${BUILD}`);
    setText('versionLabel',`ReisSlim v${VERSION} · Build ${BUILD}`);
    const root=document.documentElement;
    root.dataset.reisslimVersion=VERSION;
    root.dataset.reisslimBuild=BUILD;
    ensureImagePreconnect();
    syncPlannerSemantics();
  }
  function bind(){
    const structure=document.getElementById('tripStructure');
    if(structure&&!structure.dataset.changeSemantics1932){
      structure.dataset.changeSemantics1932='1';
      structure.addEventListener('change',syncPlannerSemantics);
    }
  }
  function createImage(url,alt,{className='',eager=false,high=false}={}){
    const img=document.createElement('img');
    if(className)img.className=className;
    img.src=url;img.alt=alt||'';img.decoding='async';img.loading=eager?'eager':'lazy';
    if(high)img.fetchPriority='high';
    img.referrerPolicy='no-referrer';
    return img;
  }
  function patchDestinationCard(card,url,name){
    if(!card)return;
    const hero=card.querySelector('.proposal-hero');
    if(!hero)return;
    let img=hero.querySelector('img.destination-image');
    if(!img){
      img=createImage(url,`Beeld van ${name}`,{className:'destination-image'});
      const placeholder=hero.querySelector(':scope > span');
      if(placeholder)placeholder.replaceWith(img);else hero.prepend(img);
    }else if(img.src!==url)img.src=url;
  }
  function patchQuickCard(card,url,name,index){
    if(!card)return;
    let img=card.querySelector(':scope > img');
    if(!img){
      const fallback=card.querySelector(':scope > .portfolio-fallback-photo');
      img=createImage(url,`Beeld van ${name}`,{eager:index<3,high:index<2});
      if(fallback)fallback.replaceWith(img);else card.prepend(img);
    }else if(img.src!==url)img.src=url;
  }
  function patchThumb(scope,url){
    if(!scope)return;
    const placeholder=scope.querySelector('.portfolio-thumb-loading');
    if(!placeholder)return;
    const className=[...placeholder.classList].filter(c=>c!=='portfolio-thumb-loading').join(' ');
    placeholder.replaceWith(createImage(url,'',{className}));
  }
  function patchComparisonCard(card,url,name,index){
    if(!card)return;
    let img=card.querySelector(':scope > img');
    if(!img){img=createImage(url,`Beeld van ${name}`,{eager:index<2,high:index===0});card.prepend(img)}else if(img.src!==url)img.src=url;
  }
  function onImageReady(event){
    const detail=event?.detail||{},id=String(detail.id||''),url=safeImageUrl(detail.image?.url),name=String(detail.name||'bestemming').replace(/\s*&\s*omgeving$/i,'');
    if(!id||!url)return;
    const escaped=globalThis.CSS?.escape?CSS.escape(id):id.replace(/["\\]/g,'\\$&');
    document.querySelectorAll(`[data-select="${escaped}"]`).forEach(button=>patchDestinationCard(button.closest('.destination-card'),url,name));
    document.querySelectorAll(`[data-portfolio-select="${escaped}"]`).forEach(button=>{
      const card=button.closest('.portfolio-quick-card');
      if(card){const index=[...document.querySelectorAll('.portfolio-quick-card')].indexOf(card);patchQuickCard(card,url,name,index)}
      patchThumb(button.closest('tr,.portfolio-map-row,.portfolio-map-popup'),url);
    });
    document.querySelectorAll(`[data-compare-choose="${escaped}"]`).forEach(button=>{
      const card=button.closest('.compare-overview-card');
      if(card){const index=[...document.querySelectorAll('.compare-overview-card')].indexOf(card);patchComparisonCard(card,url,name,index)}
    });
  }
  globalThis.addEventListener?.('reisslim:image-ready',onImageReady);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{sync();bind()},{once:true});else{sync();bind()}
  [0,150,500,1200,2500].forEach(delay=>setTimeout(()=>{sync();bind()},delay));
})();
