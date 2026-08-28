(function(){
  const RELEASE={version:'1.13.3',build:'1926'};

  function guard(event){
    if(event.target?.id!=='tripForm')return;
    event.preventDefault();
    // Hide the mobile keyboard before the global pending overlay is positioned.
    // The first pending screen is opened directly from the form; the later plan
    // pending screen normally opens after focus has already left the form.
    try{document.activeElement?.blur?.()}catch{}
    requestAnimationFrame(syncPendingViewport);
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

  function syncPendingViewport(){
    const overlay=document.getElementById('planLoadingOverlay');
    if(!overlay)return;
    const viewport=window.visualViewport;
    const top=Math.max(0,Number(viewport?.offsetTop||0));
    const height=Math.max(320,Number(viewport?.height||window.innerHeight||720));
    overlay.style.setProperty('--pending-visible-top',`${top}px`);
    overlay.style.setProperty('--pending-visible-height',`${height}px`);
  }

  function installPendingPositioning(){
    const overlay=document.getElementById('planLoadingOverlay');
    if(!overlay||overlay.dataset.viewportPositioning==='1')return;
    overlay.dataset.viewportPositioning='1';
    syncPendingViewport();
    // Observe only the overlay's own class. This cannot recreate the 1924
    // runaway subtree-observer loop because the callback never changes class.
    const observer=new MutationObserver(()=>{
      if(!overlay.classList.contains('hidden'))requestAnimationFrame(syncPendingViewport);
    });
    observer.observe(overlay,{attributes:true,attributeFilter:['class']});
    window.visualViewport?.addEventListener('resize',syncPendingViewport,{passive:true});
    window.visualViewport?.addEventListener('scroll',syncPendingViewport,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(syncPendingViewport,80),{passive:true});
  }

  function install(){
    pacePendingImage();
    installPendingPositioning();
    smartenDashboardTile();
    syncVisibleRevision();
    requestAnimationFrame(()=>{
      smartenDashboardTile();
      syncVisibleRevision();
      syncPendingViewport();
    });
  }

  document.addEventListener('submit',guard,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
