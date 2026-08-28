(function(){
  const CURRENT_KEYS=[
    'reisslim.current.v7','reisslim.current.v6','reisslim.current.v5',
    'reisslim.current.v4','reisslim.current.v3','reisslim.current.v2','reisslim.current'
  ];

  function clearCurrentDraft(){
    for(const key of CURRENT_KEYS){
      try{ localStorage.removeItem(key); }catch(_){}
    }
  }

  function openPlannerFallback(){
    clearCurrentDraft();
    document.querySelectorAll('.app-view').forEach(view=>{
      view.classList.toggle('active',view.id==='plannerView');
    });
    document.querySelectorAll('.nav-item').forEach(button=>{
      button.classList.toggle('active',button.dataset.view==='plannerView');
    });
    const error=document.getElementById('formError');
    if(error){
      error.textContent='';
      error.classList.add('hidden');
    }
    try{ window.scrollTo({top:0,left:0,behavior:'auto'}); }catch(_){}
  }

  function activate(event){
    const button=event.target?.closest?.('#startPlanningBtn');
    if(!button)return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if(typeof window.reisslimStartNewTrip==='function'){
      try{
        window.reisslimStartNewTrip();
        return;
      }catch(error){
        console.error('ReisSlim startNewTrip failed; using standalone fallback.',error);
      }
    }
    openPlannerFallback();
  }

  document.addEventListener('click',activate,true);
  window.reisslimOpenPlannerFallback=openPlannerFallback;
})();