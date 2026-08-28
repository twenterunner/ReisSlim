(function(){
  var BUILD='1905';
  var loadPromise=null;
  var bootError=null;

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

  function defaultLoader(){
    return import('./app.js?v='+BUILD);
  }

  async function loadApp(){
    if(typeof window.reisslimSubmitTrip==='function'&&typeof window.reisslimStartNewTrip==='function')return true;
    if(loadPromise)return loadPromise;
    bootError=null;
    setBusy(true,'Planner laden…');
    var loader=typeof window.__reisslimAppLoader==='function'?window.__reisslimAppLoader:defaultLoader;
    loadPromise=(async function(){
      try{
        await loader();
        if(typeof window.reisslimSubmitTrip!=='function'||typeof window.reisslimStartNewTrip!=='function'){
          throw new Error('app.js geladen maar plannerfuncties ontbreken');
        }
        document.documentElement.dataset.reisslimApp='ready';
        formError('');
        return true;
      }catch(error){
        bootError=error;
        document.documentElement.dataset.reisslimApp='failed';
        console.error('ReisSlim app-module kon niet worden geladen',error);
        formError('De planner kon niet worden geladen: '+(error&&error.message?error.message:'onbekende modulefout')+'.');
        return false;
      }finally{
        setBusy(false);
      }
    })();
    return loadPromise;
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

  // One owner for both critical actions.
  document.addEventListener('click',function(event){void activateStart(event)},true);
  document.addEventListener('submit',function(event){void interceptSubmit(event)},true);

  // Start loading immediately; interaction waits on the same promise.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){void loadApp()},{once:true});
  else void loadApp();

  window.reisslimLoadApp=loadApp;
})();