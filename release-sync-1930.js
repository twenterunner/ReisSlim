(function(){
  const VERSION='1.14.3',BUILD='1930';
  function setText(id,text){const el=document.getElementById(id);if(el&&el.textContent!==text)el.textContent=text}
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
  }
  function sync(){
    setText('headerRevision',`v${VERSION} · ${BUILD}`);
    setText('versionLabel',`ReisSlim v${VERSION} · Build ${BUILD}`);
    const root=document.documentElement;
    root.dataset.reisslimVersion=VERSION;
    root.dataset.reisslimBuild=BUILD;
    syncPlannerSemantics();
  }
  function bind(){
    const structure=document.getElementById('tripStructure');
    if(structure&&!structure.dataset.changeSemantics1930){
      structure.dataset.changeSemantics1930='1';
      structure.addEventListener('change',syncPlannerSemantics);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{sync();bind()},{once:true});else{sync();bind()}
  [0,150,500,1200,2500].forEach(delay=>setTimeout(()=>{sync();bind()},delay));
})();