(() => {
  const RELEASE={version:'1.7.25',build:'1725'};
  const KEY='reisslim-ui-1725-photo-select';
  if(window.__REISSLIM_UI_1725===KEY)return;
  window.__REISSLIM_UI_1725=KEY;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function setRevision(){
    const header=document.getElementById('headerRevision');
    if(header)header.textContent=`v${RELEASE.version} · ${RELEASE.build}`;
    const footer=document.getElementById('versionLabel');
    if(footer)footer.textContent=`ReisSlim v${RELEASE.version} · Build ${RELEASE.build}`;
    let meta=document.querySelector('meta[name="reisslim-build"]');
    if(meta)meta.content=`${RELEASE.version}-${RELEASE.build}-photo-select`;
  }

  function injectStyles(){
    if(document.getElementById('reisslim1725Styles'))return;
    const style=document.createElement('style');
    style.id='reisslim1725Styles';
    style.textContent=`
      #compareDock,.compare-dock{display:none!important;visibility:hidden!important;pointer-events:none!important}
      .proposal-pictogram-strip,.legacy-dimensions-hidden{display:none!important}
      .destination-photo-1725{width:100%;height:170px;object-fit:cover;border-radius:16px;margin:0 0 12px;background:#edf3f1}
      .destination-photo-placeholder-1725{height:170px;border-radius:16px;margin:0 0 12px;background:linear-gradient(135deg,#dfeae7,#f2f6f4);display:grid;place-items:center;color:#62736f;font-weight:800}
      .portfolio-table .destination-photo-1725{width:76px;height:54px;margin:0;border-radius:10px}
      .portfolio-table tr[data-trip-id]{cursor:pointer}
      .portfolio-table tr[data-trip-id]:active{background:#edf6f3}
      .select-trip-1725{white-space:nowrap;padding:.56rem .72rem;border-radius:11px}
      #comparisonTable .comparison-photo-1725{width:100%;height:96px;object-fit:cover;border-radius:12px;margin:0 0 8px;background:#edf3f1}
      #comparisonTable .comparison-select-1725{display:block;width:100%;margin-top:8px;padding:.58rem .65rem}
      .proposal-map-popup-1725 img{width:100%;height:112px;object-fit:cover;border-radius:11px;margin-bottom:7px}
      .proposal-map-popup-1725 button{width:100%;margin-top:8px}
      .proposal-photo-pin-1725{width:58px;height:58px;border-radius:16px;border:3px solid #fff;box-shadow:0 5px 16px rgba(18,63,58,.28);background:#176b5c center/cover no-repeat}
    `;
    document.head.appendChild(style);
  }

  function removeCompareDock(){
    document.getElementById('compareDock')?.remove();
    document.querySelectorAll('.compare-dock').forEach(el=>el.remove());
  }

  function proposalCards(){
    return [...document.querySelectorAll('.destination-card')].map(card=>{
      const choose=card.querySelector('[data-select]');
      if(!choose)return null;
      const id=choose.dataset.select;
      const name=(card.querySelector('h3')?.textContent||'').trim();
      const country=(card.querySelector('.eyebrow')?.textContent||'').trim();
      const score=Number((card.querySelector('.score')?.textContent||'').match(/\d+/)?.[0]||0);
      const existing=card.querySelector('.destination-image,.destination-photo-1725');
      return{card,choose,id,name,country,score,image:existing?.src||''};
    }).filter(Boolean);
  }

  function chooseTrip(id){
    const item=proposalCards().find(x=>x.id===id);
    if(!item)return false;
    item.choose.click();
    return true;
  }

  async function fetchPhoto(item){
    if(item.image)return item.image;
    try{
      const provider=await import('./image-provider.js');
      const result=await provider.fetchDestinationImage(
        {id:item.id,name:item.name,country:item.country},
        {timeoutMs:6000}
      );
      return result?.url||'';
    }catch{return''}
  }

  async function ensurePhotos(){
    for(const item of proposalCards()){
      let img=item.card.querySelector('.destination-image,.destination-photo-1725');
      if(img?.src){item.image=img.src;continue}
      const url=await fetchPhoto(item);
      if(!url)continue;
      img=document.createElement('img');
      img.className='destination-photo-1725';
      img.loading='lazy';
      img.alt=item.name;
      img.src=url;
      const body=item.card.querySelector('.card-body')||item.card;
      body.prepend(img);
      item.image=url;
    }
    document.querySelectorAll('.proposal-pictogram-strip').forEach(el=>el.remove());
  }

  function enhancePortfolioTable(){
    const table=document.querySelector('#portfolioTableView .portfolio-table');
    if(!table)return;
    const items=proposalCards();
    [...table.querySelectorAll('tbody tr')].forEach(row=>{
      const name=(row.querySelector('strong')?.textContent||'').trim();
      const item=items.find(x=>x.name===name||name.startsWith(x.name)||x.name.startsWith(name));
      if(!item)return;
      row.dataset.tripId=item.id;
      const first=row.querySelector('td');
      if(first&&!first.querySelector('.destination-photo-1725')&&item.image){
        const img=document.createElement('img');
        img.className='destination-photo-1725';
        img.src=item.image;img.alt=item.name;
        first.prepend(img);
      }
      const last=row.querySelector('td:last-child')||row.insertCell();
      let btn=last.querySelector('[data-select-trip-1725]');
      if(!btn){
        btn=document.createElement('button');
        btn.type='button';
        btn.className='select-trip-1725';
        btn.dataset.selectTrip1725=item.id;
        btn.textContent='Kies deze reis';
        last.appendChild(btn);
      }
    });
  }

  function enhanceComparisonTable(){
    const table=document.querySelector('#comparisonTable .comparison-table');
    if(!table)return;
    const items=proposalCards();
    [...table.querySelectorAll('thead th')].slice(1).forEach(th=>{
      const raw=(th.textContent||'').trim();
      const item=items.find(x=>raw.includes(x.name)||x.name.includes(raw));
      if(!item)return;
      if(item.image&&!th.querySelector('.comparison-photo-1725')){
        const img=document.createElement('img');
        img.className='comparison-photo-1725';
        img.src=item.image;img.alt=item.name;
        th.prepend(img);
      }
      if(!th.querySelector('.comparison-select-1725')){
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='comparison-select-1725';
        btn.dataset.selectTrip1725=item.id;
        btn.textContent='Kies deze reis';
        th.appendChild(btn);
      }
    });
  }

  function installDelegation(){
    if(document.body.dataset.selectTrip1725==='1')return;
    document.body.dataset.selectTrip1725='1';
    document.addEventListener('click',event=>{
      const btn=event.target.closest('[data-select-trip-1725],[data-choose-proposal]');
      if(btn){
        event.preventDefault();
        const id=btn.dataset.selectTrip1725||btn.dataset.chooseProposal;
        chooseTrip(id);
        return;
      }
      const row=event.target.closest('#portfolioTableView tr[data-trip-id]');
      if(row&&!event.target.closest('button,a,input,label'))chooseTrip(row.dataset.tripId);
    });
  }

  function enhanceMapPopups(){
    if(typeof L==='undefined')return;
    // Existing portfolio map hotfix already creates photo pins and popups.
    // This function guarantees each popup has a working preferred-trip action.
    document.querySelectorAll('.leaflet-popup-content').forEach(popup=>{
      const existing=popup.querySelector('[data-choose-proposal],[data-select-trip-1725]');
      if(existing)return;
      const title=(popup.querySelector('strong')?.textContent||'').trim();
      const item=proposalCards().find(x=>x.name===title);
      if(!item)return;
      popup.classList.add('proposal-map-popup-1725');
      if(item.image&&!popup.querySelector('img')){
        const img=document.createElement('img');img.src=item.image;img.alt=item.name;popup.prepend(img);
      }
      const btn=document.createElement('button');
      btn.type='button';btn.dataset.selectTrip1725=item.id;btn.textContent='Kies deze reis';
      popup.appendChild(btn);
    });
  }

  async function refresh(){
    setRevision();
    injectStyles();
    removeCompareDock();
    await ensurePhotos();
    enhancePortfolioTable();
    enhanceComparisonTable();
    enhanceMapPopups();
    installDelegation();
  }

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(async()=>{
      scheduled=false;
      await refresh();
    });
  };

  const start=()=>{
    refresh();
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('reisslim:compare-updated',schedule);
    window.addEventListener('reisslim:weather-proposals-updated',schedule);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
