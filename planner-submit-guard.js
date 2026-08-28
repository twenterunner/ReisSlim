(function(){
  const RELEASE={version:'1.14.0',build:'1927'};

  function guard(event){
    if(event.target?.id!=='tripForm')return;
    event.preventDefault();
    try{document.activeElement?.blur?.()}catch{}
    requestAnimationFrame(syncPendingViewport);
    queueMicrotask(()=>{
      if(typeof window.reisslimAppReady!=='boolean'||!window.reisslimAppReady){
        const box=document.getElementById('formError');
        if(box){box.textContent='De planner kon niet starten. Vernieuw de pagina; je invoer blijft behouden.';box.classList.remove('hidden')}
      }
    });
  }

  function syncVisibleRevision(){
    const header=document.getElementById('headerRevision');
    if(header)header.textContent=`v${RELEASE.version} · ${RELEASE.build}`;
    const footer=document.getElementById('versionLabel');
    if(footer)footer.textContent=`ReisSlim v${RELEASE.version} · Build ${RELEASE.build}`;
  }

  function smartenDashboard(){
    const card=document.querySelector('.current-trip-card');
    if(card){
      const eyebrow=card.querySelector('.section-heading .eyebrow'),title=card.querySelector('.section-heading h2');
      if(eyebrow)eyebrow.textContent='Jouw roadtrip';
      if(title)title.textContent='Reis verder. ReisSlim.';
    }
    const hero=document.querySelector('#dashboardView .hero-copy');
    if(hero){
      const eyebrow=hero.querySelector('.eyebrow'),title=hero.querySelector('h1');
      if(eyebrow)eyebrow.textContent='Minder zoeken. Meer roadtrip.';
      if(title)title.innerHTML='Ga ver. <em>ReisSlim.</em>';
    }
  }

  function pacePendingImage(){
    const image=document.getElementById('planLoadingImage');
    if(!image||image.dataset.reisslimPaced==='1')return;
    const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
    if(!descriptor?.get||!descriptor?.set)return;
    image.dataset.reisslimPaced='1';
    const delay=1000;
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

  function syncPendingViewport(){
    const overlay=document.getElementById('planLoadingOverlay');if(!overlay)return;
    const viewport=window.visualViewport,top=Math.max(0,Number(viewport?.offsetTop||0)),height=Math.max(320,Number(viewport?.height||window.innerHeight||720));
    overlay.style.setProperty('--pending-visible-top',`${top}px`);
    overlay.style.setProperty('--pending-visible-height',`${height}px`);
  }

  function installPendingPositioning(){
    const overlay=document.getElementById('planLoadingOverlay');if(!overlay||overlay.dataset.viewportPositioning==='1')return;
    overlay.dataset.viewportPositioning='1';syncPendingViewport();
    const observer=new MutationObserver(()=>{if(!overlay.classList.contains('hidden'))requestAnimationFrame(syncPendingViewport)});
    observer.observe(overlay,{attributes:true,attributeFilter:['class']});
    window.visualViewport?.addEventListener('resize',syncPendingViewport,{passive:true});
    window.visualViewport?.addEventListener('scroll',syncPendingViewport,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(syncPendingViewport,80),{passive:true});
  }

  function install(){
    pacePendingImage();installPendingPositioning();smartenDashboard();syncVisibleRevision();
    requestAnimationFrame(()=>{smartenDashboard();syncVisibleRevision();syncPendingViewport()});
  }

  document.addEventListener('submit',guard,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
