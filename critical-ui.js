(function(){
  function showPlannerFallback(){
    document.querySelectorAll('.app-view').forEach(function(view){
      view.classList.toggle('active', view.id === 'plannerView');
    });
    document.querySelectorAll('.nav-item').forEach(function(button){
      button.classList.toggle('active', button.dataset.view === 'plannerView');
    });
    try{ window.scrollTo({top:0,left:0,behavior:'auto'}); }catch(_){}
  }

  function activate(event){
    var button = event.target && event.target.closest ? event.target.closest('#startPlanningBtn') : null;
    if(!button) return;
    event.preventDefault();
    if(event.__reisslimCriticalStartHandled) return;
    event.__reisslimCriticalStartHandled = true;

    if(typeof window.reisslimStartNewTrip === 'function'){
      try{
        window.reisslimStartNewTrip();
        return;
      }catch(error){
        console.error('ReisSlim new-trip handler failed; using bootstrap fallback.', error);
      }
    }
    showPlannerFallback();
  }

  // Capture phase means this survives late initialization failures, replaced DOM
  // nodes, and bubbling handlers elsewhere in the app.
  document.addEventListener('click', activate, true);
  window.reisslimShowPlannerFallback = showPlannerFallback;
})();