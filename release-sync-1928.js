(function(){
  const VERSION='1.14.1',BUILD='1928';

  function setText(id,text){
    const el=document.getElementById(id);
    if(el && el.textContent!==text) el.textContent=text;
  }

  function sync(){
    setText('headerRevision',`v${VERSION} · ${BUILD}`);
    setText('versionLabel',`ReisSlim v${VERSION} · Build ${BUILD}`);

    const root=document.documentElement;
    if(root.dataset.reisslimVersion!==VERSION) root.dataset.reisslimVersion=VERSION;
    if(root.dataset.reisslimBuild!==BUILD) root.dataset.reisslimBuild=BUILD;
  }

  // Do not use a subtree MutationObserver here.
  // The previous 1928 implementation observed childList mutations and then
  // changed textContent inside its own callback, which generated another
  // childList mutation and could trap the main thread in a self-triggering loop.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',sync,{once:true});
  }else{
    sync();
  }

  // ui-feature-flags may create the revision badge just after DOMContentLoaded.
  // A few bounded, idempotent retries are sufficient and cannot self-trigger.
  [0,150,500,1200,2500].forEach(delay=>setTimeout(sync,delay));
})();
