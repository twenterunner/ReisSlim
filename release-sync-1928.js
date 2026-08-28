(function(){
  const VERSION='1.14.1',BUILD='1928';
  function sync(){
    const header=document.getElementById('headerRevision');
    if(header)header.textContent=`v${VERSION} · ${BUILD}`;
    const label=document.getElementById('versionLabel');
    if(label)label.textContent=`ReisSlim v${VERSION} · Build ${BUILD}`;
    document.documentElement.dataset.reisslimVersion=VERSION;
    document.documentElement.dataset.reisslimBuild=BUILD;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
  else sync();
  // ui-feature-flags can create the badge after DOMContentLoaded; keep the visible
  // revision synchronized without changing any of its functional behaviour.
  const observer=new MutationObserver(()=>sync());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),10000);
})();
