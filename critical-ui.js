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

  function showSubmitUnavailable(){
    var error=document.getElementById('formError');
    if(error){
      error.textContent='De planner is nog niet volledig geladen. Vernieuw de pagina en probeer opnieuw.';
      error.classList.remove('hidden');
      error.scrollIntoView({block:'center'});
    }
  }

  function activateStart(event){
    var button = event.target && event.target.closest ? event.target.closest('#startPlanningBtn') : null;
    if(!button) return;
    event.preventDefault();
    if(event.__reisslimCriticalStartHandled) return;
    event.__reisslimCriticalStartHandled = true;

    if(typeof window.reisslimStartNewTrip === 'function'){
      try{ window.reisslimStartNewTrip(); return; }
      catch(error){ console.error('ReisSlim new-trip handler failed; using bootstrap fallback.', error); }
    }
    showPlannerFallback();
  }

  async function invokeSubmit(form,event){
    // Give the ES module a short opportunity to register even on a cold mobile load.
    for(var i=0;i<40;i++){
      if(typeof window.reisslimSubmitTrip === 'function'){
        try{
          await window.reisslimSubmitTrip(event);
          return;
        }catch(error){
          console.error('ReisSlim trip submit failed.',error);
          showSubmitUnavailable();
          return;
        }
      }
      await new Promise(function(resolve){setTimeout(resolve,50)});
    }
    showSubmitUnavailable();
  }

  function interceptSubmit(event){
    var form=event.target;
    if(!form || form.id!=='tripForm') return;
    // Never allow native HTML form navigation/reload. That was the cause of
    // "Zoek mijn roadtrip" returning to the dashboard when app.js was not ready.
    event.preventDefault();
    if(event.__reisslimCriticalSubmitHandled) return;
    event.__reisslimCriticalSubmitHandled=true;
    void invokeSubmit(form,event);
  }

  document.addEventListener('click', activateStart, true);
  document.addEventListener('submit', interceptSubmit, true);
  window.reisslimShowPlannerFallback = showPlannerFallback;
})();