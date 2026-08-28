(function(){
  function guard(event){
    if(event.target?.id!=='tripForm')return;
    event.preventDefault();
    // The application submit handler runs on the same event when app.js initialized.
    // If it did not initialize, never allow a native GET navigation back to index.
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
  document.addEventListener('submit',guard,true);
})();