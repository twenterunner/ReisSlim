
(() => {
  const HOTFIX='1.7.24-compare-map-photo-hotfix';
  if(window.__REISSLIM_COMPARE_MAP_HOTFIX===HOTFIX)return;
  window.__REISSLIM_COMPARE_MAP_HOTFIX=HOTFIX;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const safeUrl=value=>{try{const u=new URL(String(value||''),location.href);return/^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function injectStyles(){
    if(document.getElementById('compareMapPhotoHotfixStyles'))return;
    const style=document.createElement('style');
    style.id='compareMapPhotoHotfixStyles';
    style.textContent=`
      .proposal-pictogram-strip{display:none!important}
      .portfolio-view-switch{display:flex;gap:6px;margin:10px 0 12px;position:sticky;top:72px;z-index:30;background:rgba(255,255,255,.94);padding:7px;border:1px solid var(--line,#dce5e2);border-radius:14px;backdrop-filter:blur(10px)}
      .portfolio-view-switch button{flex:1;padding:.62rem .55rem;background:#f3f7f5;color:#17312e;border:1px solid #dce5e2}
      .portfolio-view-switch button.active{background:#176b5c;color:#fff;border-color:#176b5c}
      .portfolio-alt-view{margin-top:8px}
      .portfolio-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #dce5e2;border-radius:16px;background:#fff}
      .portfolio-table{width:100%;min-width:640px;border-collapse:collapse}
      .portfolio-table th,.portfolio-table td{padding:10px;border-bottom:1px solid #e7eeeb;text-align:left;vertical-align:middle}
      .portfolio-table th{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:#62736f}
      .portfolio-trip-cell{display:flex;align-items:center;gap:10px;min-width:220px}
      .portfolio-trip-cell img,.comparison-destination-photo img{width:64px;height:46px;object-fit:cover;border-radius:10px;background:#edf3f1}
      .portfolio-trip-cell strong{display:block}.portfolio-trip-cell small{display:block;margin-top:2px}
      .portfolio-table .choose-from-table{white-space:nowrap;padding:.55rem .7rem}
      #portfolioProposalMap{height:58vh;min-height:420px;border-radius:18px;overflow:hidden;background:#edf3f1;border:1px solid #dce5e2}
      .portfolio-map-note{font-size:.72rem;color:#62736f;margin:7px 2px 0}
      .proposal-photo-pin{width:54px;height:54px;border-radius:15px;border:3px solid #fff;box-shadow:0 5px 15px rgba(18,63,58,.25);background:#176b5c center/cover no-repeat;position:relative}
      .proposal-photo-pin b{position:absolute;right:-7px;top:-8px;display:grid;place-items:center;min-width:24px;height:24px;padding:0 5px;border-radius:999px;background:#123f3a;color:#fff;font-size:11px}
      .proposal-map-popup{min-width:210px}
      .proposal-map-popup img{width:100%;height:108px;object-fit:cover;border-radius:10px;margin-bottom:7px}
      .proposal-map-popup strong,.proposal-map-popup small{display:block}
      .proposal-map-popup button{width:100%;margin-top:8px;padding:.6rem}
      #comparisonTable .comparison-table thead th:not(:first-child){min-width:170px}
      .comparison-destination-photo{margin:0 0 7px}
      .comparison-destination-photo img{width:100%;height:90px;border-radius:12px}
      .comparison-choose-btn{display:block;width:100%;margin-top:8px;padding:.55rem .65rem;font-size:.75rem}
      #comparisonDestinationMap{height:46vh;min-height:340px;border-radius:16px;overflow:hidden;margin-top:12px;border:1px solid #dce5e2}
      .comparison-view-switch{display:flex;gap:6px;margin:10px 0}
      .comparison-view-switch button{flex:1;background:#f2f6f4;color:#17312e;border:1px solid #dce5e2;padding:.55rem}
      .comparison-view-switch button.active{background:#176b5c;color:#fff}
      @media(max-width:430px){
        .portfolio-view-switch{top:64px}
        .portfolio-table{min-width:590px}
        #portfolioProposalMap{height:52vh;min-height:360px}
      }`;
    document.head.appendChild(style);
  }

  function cardData(){
    return [...document.querySelectorAll('.destination-card')].map((card,index)=>{
      const button=card.querySelector('[data-select]');
      if(!button)return null;
      const id=button.dataset.select;
      const name=(card.querySelector('h3')?.textContent||'').trim();
      const country=(card.querySelector('.eyebrow')?.textContent||'').trim();
      const score=Number((card.querySelector('.score')?.textContent||'').match(/\d+/)?.[0]||0);
      const estimate=[...card.querySelectorAll('.chip')].map(x=>x.textContent||'').find(x=>/€/.test(x))?.trim()||'';
      const img=card.querySelector('.destination-image');
      return{card,id,name,country,score,estimate,index,image:img?.src||'',source:img?.closest('.proposal-hero')?.nextElementSibling?.href||''};
    }).filter(Boolean);
  }

  async function ensureCardPhotos(){
    let provider;
    try{provider=await import('./image-provider.js')}catch{return}
    const items=cardData();
    const missing=items.filter(x=>!x.image);
    for(const item of missing.slice(0,12)){
      try{
        const image=await provider.fetchDestinationImage({id:item.id,name:item.name,country:item.country},{timeoutMs:5500});
        if(!image?.url)continue;
        const hero=item.card.querySelector('.proposal-hero');
        if(hero){
          hero.querySelector('span')?.remove();
          let img=hero.querySelector('.destination-image');
          if(!img){img=document.createElement('img');img.className='destination-image';img.loading='lazy';hero.prepend(img)}
          img.src=image.url;img.alt=item.name;
          item.image=image.url;
        }
      }catch{}
    }
  }

  function chooseProposal(id){
    const source=document.querySelector(`.destination-card [data-select="${CSS.escape(id)}"]`);
    if(source){source.click();return true}
    return false;
  }

  function installChooseDelegation(){
    if(document.body.dataset.compareChooseDelegation==='1')return;
    document.body.dataset.compareChooseDelegation='1';
    document.addEventListener('click',event=>{
      const btn=event.target.closest('[data-choose-proposal]');
      if(!btn)return;
      event.preventDefault();
      chooseProposal(btn.dataset.chooseProposal);
    });
  }

  function buildPortfolioTable(items){
    let host=document.getElementById('portfolioTableView');
    if(!host){
      host=document.createElement('div');host.id='portfolioTableView';host.className='portfolio-alt-view hidden';
      document.getElementById('destinationCards')?.insertAdjacentElement('afterend',host);
    }
    host.innerHTML=`<div class="portfolio-table-wrap"><table class="portfolio-table"><thead><tr><th>Reis</th><th>Match</th><th>Budget</th><th></th></tr></thead><tbody>${
      items.map(item=>`<tr>
        <td><div class="portfolio-trip-cell">${item.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}">`:'<div style="width:64px;height:46px;border-radius:10px;background:#edf3f1"></div>'}<div><strong>${esc(item.name)}</strong><small>${esc(item.country)}</small></div></div></td>
        <td><strong>${item.score}/100</strong></td><td>${esc(item.estimate)}</td>
        <td><button type="button" class="choose-from-table" data-choose-proposal="${esc(item.id)}">Kies deze reis</button></td>
      </tr>`).join('')
    }</tbody></table></div>`;
    return host;
  }

  const geoCacheKey='reisslim.portfolio.geocode.v1.';
  async function geocode(item){
    try{
      const cached=JSON.parse(localStorage.getItem(geoCacheKey+item.id)||'null');
      if(cached&&Number.isFinite(cached.lat)&&Number.isFinite(cached.lon))return cached;
    }catch{}
    const q=[item.name,item.country].filter(Boolean).join(', ');
    const url=`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`;
    try{
      const response=await fetch(url,{headers:{accept:'application/json'}});
      if(!response.ok)return null;
      const feature=(await response.json())?.features?.[0];
      const [lon,lat]=feature?.geometry?.coordinates||[];
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
      const result={lat,lon};
      try{localStorage.setItem(geoCacheKey+item.id,JSON.stringify(result))}catch{}
      return result;
    }catch{return null}
  }

  function photoIcon(item){
    const url=safeUrl(item.image);
    return L.divIcon({
      className:'proposal-photo-pin-wrap',
      html:`<div class="proposal-photo-pin" style="${url?`background-image:url('${url.replace(/'/g,'%27')}')`:''}"><b>${item.score}</b></div>`,
      iconSize:[54,54],iconAnchor:[27,50],popupAnchor:[0,-45]
    });
  }

  let portfolioMap=null;
  async function renderPortfolioMap(items){
    let host=document.getElementById('portfolioMapView');
    if(!host){
      host=document.createElement('div');host.id='portfolioMapView';host.className='portfolio-alt-view hidden';
      host.innerHTML='<div id="portfolioProposalMap"></div><p class="portfolio-map-note">Kaartpunten zijn de reisbestemmingen/regio’s. Tik een foto om de reis te kiezen.</p>';
      document.getElementById('portfolioTableView')?.insertAdjacentElement('afterend',host);
    }
    if(typeof L==='undefined')return host;
    if(portfolioMap){portfolioMap.remove();portfolioMap=null}
    portfolioMap=L.map('portfolioProposalMap',{zoomControl:true}).setView([50.5,8],5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap-bijdragers'}).addTo(portfolioMap);
    const bounds=[];
    for(const item of items){
      const point=await geocode(item);
      if(!point)continue;
      bounds.push([point.lat,point.lon]);
      const marker=L.marker([point.lat,point.lon],{icon:photoIcon(item)}).addTo(portfolioMap);
      marker.bindPopup(`<div class="proposal-map-popup">${item.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}">`:''}<strong>${esc(item.name)}</strong><small>${esc(item.country)} · ${item.score}/100 · ${esc(item.estimate)}</small><button type="button" data-choose-proposal="${esc(item.id)}">Kies deze reis</button></div>`);
    }
    if(bounds.length)portfolioMap.fitBounds(bounds,{padding:[32,32],maxZoom:8});
    setTimeout(()=>portfolioMap?.invalidateSize(),100);
    return host;
  }

  async function ensurePortfolioViews(){
    const cards=document.getElementById('destinationCards'),results=document.getElementById('resultsSection');
    if(!cards||!results||cards.children.length===0)return;
    await ensureCardPhotos();
    const items=cardData();
    if(!items.length)return;

    let switcher=document.getElementById('portfolioViewSwitch');
    if(!switcher){
      switcher=document.createElement('div');switcher.id='portfolioViewSwitch';switcher.className='portfolio-view-switch';
      switcher.innerHTML='<button type="button" data-portfolio-view="cards" class="active">Kaarten</button><button type="button" data-portfolio-view="table">Tabel</button><button type="button" data-portfolio-view="map">Kaart</button>';
      cards.insertAdjacentElement('beforebegin',switcher);
      switcher.addEventListener('click',async event=>{
        const btn=event.target.closest('[data-portfolio-view]');if(!btn)return;
        const view=btn.dataset.portfolioView;
        switcher.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
        cards.classList.toggle('hidden',view!=='cards');
        const table=document.getElementById('portfolioTableView'),mapHost=document.getElementById('portfolioMapView');
        table?.classList.toggle('hidden',view!=='table');
        mapHost?.classList.toggle('hidden',view!=='map');
        if(view==='map'){
          await renderPortfolioMap(cardData());
          document.getElementById('portfolioMapView')?.classList.remove('hidden');
        }
      });
    }
    buildPortfolioTable(items);
    // Never restore the old score pictogram row; destination photography is the visual identity.
    document.querySelectorAll('.proposal-pictogram-strip').forEach(el=>el.remove());
  }

  function enhanceComparisonHeaders(){
    const table=document.querySelector('#comparisonTable .comparison-table');
    if(!table)return;
    const items=cardData();
    [...table.querySelectorAll('thead th')].slice(1).forEach(th=>{
      const name=(th.childNodes[0]?.textContent||th.textContent||'').trim();
      const item=items.find(x=>name.startsWith(x.name)||x.name.startsWith(name));
      if(!item)return;
      if(!th.querySelector('.comparison-destination-photo')){
        const photo=document.createElement('div');photo.className='comparison-destination-photo';
        photo.innerHTML=item.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}">`:'';
        th.prepend(photo);
      }
      if(!th.querySelector('[data-choose-proposal]')){
        const b=document.createElement('button');b.type='button';b.className='comparison-choose-btn';b.dataset.chooseProposal=item.id;b.textContent='Kies deze reis';th.appendChild(b);
      }
    });
  }

  let comparisonMap=null;
  async function renderComparisonMap(){
    const section=document.getElementById('compareSection'),tableWrap=document.getElementById('comparisonTable');
    if(!section||!tableWrap)return;
    const ids=[...document.querySelectorAll('[data-compare]:checked')].map(x=>x.dataset.compare);
    const items=cardData().filter(x=>ids.includes(x.id));
    if(items.length<2)return;

    let switcher=section.querySelector('.comparison-view-switch');
    if(!switcher){
      switcher=document.createElement('div');switcher.className='comparison-view-switch';
      switcher.innerHTML='<button type="button" class="active" data-comparison-view="table">Tabel</button><button type="button" data-comparison-view="map">Kaart</button>';
      tableWrap.insertAdjacentElement('beforebegin',switcher);
      switcher.addEventListener('click',async event=>{
        const btn=event.target.closest('[data-comparison-view]');if(!btn)return;
        const view=btn.dataset.comparisonView;
        switcher.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
        tableWrap.classList.toggle('hidden',view!=='table');
        let host=document.getElementById('comparisonDestinationMap');
        if(view==='map'){
          if(!host){host=document.createElement('div');host.id='comparisonDestinationMap';tableWrap.insertAdjacentElement('afterend',host)}
          host.classList.remove('hidden');
          if(typeof L==='undefined')return;
          if(comparisonMap){comparisonMap.remove();comparisonMap=null}
          comparisonMap=L.map(host).setView([50.5,8],5);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap-bijdragers'}).addTo(comparisonMap);
          const bounds=[];
          for(const item of items){
            const point=await geocode(item);if(!point)continue;
            bounds.push([point.lat,point.lon]);
            L.marker([point.lat,point.lon],{icon:photoIcon(item)}).addTo(comparisonMap)
             .bindPopup(`<div class="proposal-map-popup">${item.image?`<img src="${esc(item.image)}" alt="${esc(item.name)}">`:''}<strong>${esc(item.name)}</strong><small>${item.score}/100 · ${esc(item.estimate)}</small><button type="button" data-choose-proposal="${esc(item.id)}">Kies deze reis</button></div>`);
          }
          if(bounds.length)comparisonMap.fitBounds(bounds,{padding:[32,32],maxZoom:8});
          setTimeout(()=>comparisonMap?.invalidateSize(),100);
        }else{
          document.getElementById('comparisonDestinationMap')?.classList.add('hidden');
        }
      });
    }
  }

  async function enhanceAll(){
    injectStyles();
    installChooseDelegation();
    document.getElementById('compareDock')?.remove();
    await ensurePortfolioViews();
    enhanceComparisonHeaders();
    await renderComparisonMap();
  }

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;scheduled=true;
    setTimeout(()=>{scheduled=false;void enhanceAll()},120);
  };
  const observer=new MutationObserver(schedule);
  const start=()=>{
    void enhanceAll();
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('reisslim:compare-updated',schedule);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
