const ENDPOINT='https://commons.wikimedia.org/w/api.php';
const CACHE_PREFIX='reisslim.image.v3.required.';
const stripHtml=v=>String(v||'').replace(/<[^>]+>/g,'').trim();
function usableLicense(metadata={}){return /CC BY|public domain|CC0/i.test(metadata.LicenseShortName?.value||'')}
function tokens(destination={}){return `${destination.name||''} ${destination.country||''}`.toLocaleLowerCase('nl-NL').split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>2)}
function score(page,destination){
  const title=String(page?.title||'').toLocaleLowerCase('nl-NL'),ts=tokens(destination);
  let s=ts.reduce((n,t)=>n+(title.includes(t)?8:0),0);
  if(/map|flag|coat of arms|logo|diagram|locator|symbol|satellite/i.test(title))s-=30;
  if(/castle|schloss|town|city|village|road|valley|river|landscape|mountain|harbour|coast|church|historic|old town/i.test(title))s+=5;
  return s;
}
export function normalizeCommonsImage(payload,destination=null){
  const pages=Object.values(payload?.query?.pages||{}).filter(p=>p?.imageinfo?.[0]).sort((a,b)=>score(b,destination)-score(a,destination));
  for(const page of pages){
    const info=page.imageinfo[0],meta=info.extmetadata||{};
    if(!info.thumburl||!usableLicense(meta))continue;
    return{url:info.thumburl,sourceUrl:info.descriptionurl||`https://commons.wikimedia.org/?curid=${page.pageid}`,title:page.title?.replace(/^File:/,'')||'Bestemmingsbeeld',creator:stripHtml(meta.Artist?.value)||'Onbekende maker',license:meta.LicenseShortName?.value||'Open licentie',attribution:`${stripHtml(meta.Artist?.value)||'Onbekende maker'} · ${meta.LicenseShortName?.value||'open licentie'} · Wikimedia Commons`,provider:'Wikimedia Commons',checkedAt:new Date().toISOString(),routeSpecific:true};
  }
  return null;
}
async function queryCommons(destination,query,{fetchImpl,timeoutMs}){
  const url=new URL(ENDPOINT);
  url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'16',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1100',format:'json',origin:'*'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetchImpl(url,{signal:controller.signal,headers:{accept:'application/json'}});if(!r.ok)return null;return normalizeCommonsImage(await r.json(),destination)}
  catch{return null}finally{clearTimeout(timer)}
}
export async function fetchDestinationImage(destination,{fetchImpl=globalThis.fetch,storage=globalThis.localStorage,timeoutMs=6500}={}){
  if(typeof fetchImpl!=='function')return null;
  const key=`${CACHE_PREFIX}${destination.id}`;
  try{const c=JSON.parse(storage?.getItem(key)||'null');if(c?.routeSpecific&&c?.url)return c}catch{}
  const name=destination.name||'',country=destination.country||'';
  const queries=[
    `"${name}" ${country} tourism landscape`,
    `"${name}" ${country} landmark`,
    `"${name}" ${country} road valley town`,
    `${name} ${country} travel`,
    `${name} ${country}`
  ];
  for(const q of queries){
    const image=await queryCommons(destination,q,{fetchImpl,timeoutMs});
    if(image){try{storage?.setItem(key,JSON.stringify(image))}catch{};return image}
  }
  return null;
}
export async function enrichDestinationImages(destinations,options={}){
  const selected=(destinations||[]).filter(Boolean);
  let cursor=0;
  const workers=Array.from({length:Math.min(4,selected.length)},async()=>{
    while(cursor<selected.length){
      const d=selected[cursor++];
      if(d.image?.url)continue;
      const image=await fetchDestinationImage(d,options);
      if(image)d.image=image;
    }
  });
  await Promise.all(workers);
  return destinations;
}
export const imageProviderAttribution='Wikimedia Commons · voorstel wordt pas getoond nadat een route-relevante foto is gevonden.';
