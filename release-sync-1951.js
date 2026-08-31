(function(){
  'use strict';
  const TARGET_VERSION='1.16.3';
  const TARGET_BUILD='1953';
  const setText=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text};
  const setUpgradeStatus=text=>{setText('headerRevision',text);const footer=document.getElementById('versionLabel');if(footer)footer.textContent=`ReisSlim ${text}`};
  async function workerVersion(worker){
    if(!worker)return null;
    return await new Promise(resolve=>{
      const channel=new MessageChannel();let done=false;
      const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value)};
      const timer=setTimeout(()=>finish(null),1800);
      channel.port1.onmessage=event=>finish(event?.data||null);
      try{worker.postMessage({type:'REISSLIM_VERSION_REQUEST'},[channel.port2])}catch{finish(null)}
    });
  }
  async function ensureTargetWorker(){
    if(!('serviceWorker' in navigator))return false;
    let info=await workerVersion(navigator.serviceWorker.controller);
    if(String(info?.build||'')===TARGET_BUILD)return true;
    setUpgradeStatus(`bijwerken naar v${TARGET_VERSION} · ${TARGET_BUILD}…`);
    try{
      const registration=await navigator.serviceWorker.register(`./service-worker.js?build=${TARGET_BUILD}`,{updateViaCache:'none'});
      try{await registration.update()}catch{}
      const deadline=Date.now()+12000;
      while(Date.now()<deadline){
        info=await workerVersion(navigator.serviceWorker.controller);
        if(String(info?.build||'')===TARGET_BUILD)return true;
        await new Promise(resolve=>setTimeout(resolve,350));
      }
    }catch(error){console.error('ReisSlim upgrade bridge',error)}
    return false;
  }
  async function boot(){
    const ok=await ensureTargetWorker();
    if(ok){
      const url=new URL(location.href);
      if(url.searchParams.get('runtime')!==TARGET_BUILD){url.searchParams.set('runtime',TARGET_BUILD);location.replace(url.href);return}
      setText('headerRevision',`v${TARGET_VERSION} · ${TARGET_BUILD}`);
      setText('versionLabel',`ReisSlim v${TARGET_VERSION} · Build ${TARGET_BUILD}`);
    }else{
      setUpgradeStatus(`update ${TARGET_BUILD} niet actief`);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
