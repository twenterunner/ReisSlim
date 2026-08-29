(function(){
  const VERSION='1.14.2',BUILD='1929';
  function setText(id,text){const el=document.getElementById(id);if(el&&el.textContent!==text)el.textContent=text}
  function sync(){setText('headerRevision',`v${VERSION} · ${BUILD}`);setText('versionLabel',`ReisSlim v${VERSION} · Build ${BUILD}`);const root=document.documentElement;if(root.dataset.reisslimVersion!==VERSION)root.dataset.reisslimVersion=VERSION;if(root.dataset.reisslimBuild!==BUILD)root.dataset.reisslimBuild=BUILD}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  [0,150,500,1200,2500].forEach(delay=>setTimeout(sync,delay));
})();