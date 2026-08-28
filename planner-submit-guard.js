(function(){
  const RELEASE={version:'1.13.1',build:'1924'};
  function guard(event){
    if(event.target?.id!=='tripForm')return;
    event.preventDefault();
    queueMicrotask(()=>{
      if(typeof window.reisslimAppReady!=='boolean'||!window.reisslimAppReady){
        const box=document.getElementById('formError');
        if(box){box.textContent='De planner kon niet starten. Vernieuw de pagina; je invoer blijft behouden.';box.classList.remove('hidden')}
      }
    });
  }
  function syncBuildBadge(){
    const badge=document.getElementById('headerRevision');
    if(badge)badge.textContent=`v${RELEASE.version} · ${RELEASE.build}`;
  }
  function pacePendingImage(){
    const image=document.getElementById('planLoadingImage');
    if(!image||image.dataset.reisslimPaced==='1')return;
    const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
    if(!descriptor?.get||!descriptor?.set)return;
    image.dataset.reisslimPaced='1';
    const delay=4000;
    let lastShown=0,pending=null,timer=null,internal=false;
    Object.defineProperty(image,'src',{
      configurable:true,
      get(){return descriptor.get.call(this)},
      set(value){
        if(internal){descriptor.set.call(this,value);return}
        const now=Date.now(),elapsed=now-lastShown;
        const show=next=>{internal=true;descriptor.set.call(this,next);internal=false;lastShown=Date.now();pending=null};
        if(!lastShown||elapsed>=delay){clearTimeout(timer);timer=null;show(value);return}
        pending=value;
        if(!timer)timer=setTimeout(()=>{timer=null;if(pending)show(pending)},Math.max(20,delay-elapsed));
      }
    });
  }
  function install(){
    syncBuildBadge();pacePendingImage();
    const observer=new MutationObserver(()=>{syncBuildBadge();pacePendingImage()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  document.addEventListener('submit',guard,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();