(function(){
  const MARKER='reisslim-clean-code-1909';
  async function clean(){
    if(sessionStorage.getItem(MARKER)==='done')return false;
    sessionStorage.setItem(MARKER,'done');
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg=>reg.unregister()));
      }
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys.filter(key=>key.startsWith('reisslim-')).map(key=>caches.delete(key)));
      }
    }catch(error){
      console.warn('ReisSlim cachemigratie kon niet volledig worden uitgevoerd',error);
    }
    const url=new URL(location.href);
    url.searchParams.set('release','1909');
    location.replace(url.toString());
    return true;
  }
  window.__reisslimClean1909=clean;
  void clean();
})();