(function(){
  const RELEASE={version:'1.13.2',build:'1925'};

  function guard(event){
    if(event.target?.id!=='tripForm')return;
    event.preventDefault();
    queueMicrotask(()=>{
      if(typeof window.reisslimAppReady!=='boolean'||!window.reisslimAppReady){
        const box=document.getElementById('formError');
        if(box){
          box.textContent='De planner kon niet starten. Vernieuw de pagina; je invoer blijft behouden.';
          box.classList.remove('hidden');
        }
      }
    });
  }

  function syncVisibleRevision(){
    const header=document.getElementById('headerRevision');
    if(header){
      const value=`v${RELEASE.version} · ${RELEASE.build}`;
      if(header.textContent!==value)header.textContent=value;
    }
    const footer=document.getElementById('versionLabel');
    if(footer){
      const value=`ReisSlim v${RELEASE.version} · Build ${RELEASE.build}`;
      if(footer.textContent!==value)footer.textContent=value;
    }
  }

  function smartenDashboardTile(){
    const card=document.querySelector('.current-trip-card');
    if(!card)return;
    const eyebrow=card.querySelector('.section-heading .eyebrow');
    const title=card.querySelector('.section-heading h2');
    if(eyebrow)eyebrow.textContent='Jouw roadtrip';
    if(title)title.textContent='Reis verder. ReisSlim.';
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
        const show=next=>{
          internal=true;
          descriptor.set.call(this,next);
          internal=false;
          lastShown=Date.now();
          pending=null;
        };
        if(!lastShown||elapsed>=delay){
          clearTimeout(timer);timer=null;show(value);return;
        }
        pending=value;
        if(!timer)timer=setTimeout(()=>{
          timer=null;
          if(pending)show(pending);
        },Math.max(20,delay-elapsed));
      }
    });
  }

  function install(){
    // 1924 installed a subtree MutationObserver whose callback rewrote the same
    // header text it was observing. textContent creates a childList mutation, so
    // that observer called itself indefinitely and starved the app's event loop.
    // This recovery build deliberately performs only one-shot setup.
    pacePendingImage();
    smartenDashboardTile();
    syncVisibleRevision();
    requestAnimationFrame(()=>{
      smartenDashboardTile();
      syncVisibleRevision();
    });
  }

  document.addEventListener('submit',guard,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
