(function(){
  var BUILD='1906';
  var loadPromise=null;
  var attempt=0;

  function formError(text){
    var error=document.getElementById('formError');
    if(error){
      error.textContent=text||'';
      error.classList.toggle('hidden',!text);
      if(text)error.scrollIntoView({block:'center'});
    }
  }

  function setBusy(busy,text){
    var submit=document.querySelector('#tripForm button[type="submit"]');
    if(submit){
      if(!submit.dataset.originalText)submit.dataset.originalText=submit.textContent;
      submit.setAttribute('aria-busy',busy?'true':'false');
      submit.textContent=busy?(text||'Planner laden…'):submit.dataset.originalText;
    }
    var start=document.getElementById('startPlanningBtn');
    if(start){
      if(!start.dataset.originalText)start.dataset.originalText=start.textContent;
      start.setAttribute('aria-busy',busy?'true':'false');
      start.textContent=busy?(text||'Planner laden…'):start.dataset.originalText;
    }
  }

  function timeout(ms){
    return new Promise(function(_,reject){
      setTimeout(function(){reject(new Error('laden duurde langer dan '+Math.round(ms/1000)+' seconden'))},ms);
    });
  }

  function defaultLoader(){
    attempt+=1;
    // Unique app URL per retry prevents a failed app-module fetch from becoming
    // permanently sticky in the browser module map for this document.
    return import('./app.js?v='+BUILD+'&boot='+attempt);
  }

  async function loadApp(){
    if(typeof window.reisslimSubmitTrip==='function'&&typeof window.reisslimStartNewTrip==='function')return true;
    if(loadPromise)return loadPromise;

    setBusy(true,'Planner laden…');
    formError('');
    var loader=typeof window.__reisslimAppLoader==='function'?window.__reisslimAppLoader:defaultLoader;

    var current=(async function(){
      try{
        await Promise.race([loader(),timeout(15000)]);
        if(typeof window.reisslimSubmitTrip!=='function'||typeof window.reisslimStartNewTrip!=='function'){
          throw new Error('app.js geladen maar plannerfuncties ontbreken');
        }
        document.documentElement.dataset.reisslimApp='ready';
        formError('');
        return true;
      }catch(error){
        document.documentElement.dataset.reisslimApp='failed';
        console.error('ReisSlim app-module kon niet worden geladen',error);
        formError('De planner kon niet worden geladen: '+(error&&error.message?error.message:'onbekende modulefout')+'. Tik nogmaals om opnieuw te proberen.');
        return false;
      }finally{
        setBusy(false);
        // Critical fix: a failed or timed-out boot must never poison all future
        // button presses. The next interaction gets a fresh loader attempt.
        if(document.documentElement.dataset.reisslimApp!=='ready')loadPromise=null;
      }
    })();

    loadPromise=current;
    return current;
  }

  async function activateStart(event){
    var button=event.target&&event.target.closest?event.target.closest('#startPlanningBtn'):null;
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    if(event.__reisslimCriticalStartHandled)return;
    event.__reisslimCriticalStartHandled=true;
    if(await loadApp())window.reisslimStartNewTrip();
  }

  async function interceptSubmit(event){
    var form=event.target;
    if(!form||form.id!=='tripForm')return;
    event.preventDefault();
    event.stopPropagation();
    if(event.__reisslimCriticalSubmitHandled)return;
    event.__reisslimCriticalSubmitHandled=true;
    if(await loadApp())await window.reisslimSubmitTrip(event);
  }

  document.addEventListener('click',function(event){void activateStart(event)},true);
  document.addEventListener('submit',function(event){void interceptSubmit(event)},true);

  // Do NOT pre-load the module in the background. On mobile this could fail
  // transiently during page/SW startup before the user ever interacted.
  // First critical interaction owns the first boot attempt.
  window.reisslimLoadApp=loadApp;
})();