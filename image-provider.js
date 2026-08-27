const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const CACHE_PREFIX = 'reisslim.image.v2.route.';

const stripHtml = value => String(value || '').replace(/<[^>]+>/g, '').trim();

function usableLicense(metadata = {}) {
  const short = metadata.LicenseShortName?.value || '';
  return /CC BY|public domain|CC0/i.test(short);
}
function routeTokens(destination={}){
  return `${destination.name||''} ${destination.country||''}`.toLocaleLowerCase('nl-NL').split(/[^\\p{L}\\p{N}]+/u).filter(token=>token.length>2);
}
function titleScore(page,destination){
  const title=String(page?.title||'').toLocaleLowerCase('nl-NL'),tokens=routeTokens(destination);
  let score=tokens.reduce((sum,token)=>sum+(title.includes(token)?5:0),0);
  if(/map|flag|coat of arms|logo|diagram|locator|symbol/i.test(title))score-=20;
  if(/castle|kasteel|schloss|town|city|village|road|valley|river|landscape|berg|mountain|kerk|church|historic|old town/i.test(title))score+=4;
  return score;
}
export function normalizeCommonsImage(payload,destination=null) {
  const pages=Object.values(payload?.query?.pages || {}).filter(page=>page?.imageinfo?.[0]);
  pages.sort((a,b)=>titleScore(b,destination)-titleScore(a,destination));
  for(const page of pages){
    const info=page?.imageinfo?.[0],metadata=info?.extmetadata||{};
    if(!info?.thumburl||!usableLicense(metadata))continue;
    return {
      url: info.thumburl,
      sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
      title: page.title?.replace(/^File:/, '') || 'Bestemmingsbeeld',
      creator: stripHtml(metadata.Artist?.value) || 'Onbekende maker',
      license: metadata.LicenseShortName?.value || 'Open licentie',
      attribution: `${stripHtml(metadata.Artist?.value) || 'Onbekende maker'} · ${metadata.LicenseShortName?.value || 'open licentie'} · Wikimedia Commons`,
      provider: 'Wikimedia Commons', checkedAt:new Date().toISOString(), routeSpecific:true
    };
  }
  return null;
}
export async function fetchDestinationImage(destination,{fetchImpl=globalThis.fetch,storage=globalThis.localStorage,timeoutMs=7000}={}){
  if(typeof fetchImpl!=='function')return null;
  const key=`${CACHE_PREFIX}${destination.id}`;
  try{const cached=JSON.parse(storage?.getItem(key)||'null');if(cached?.routeSpecific)return cached}catch{}
  const query=[destination.name,destination.country,'landmark town castle river valley road'].filter(Boolean).join(' ');
  const url=new URL(ENDPOINT);
  url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'8',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1100',format:'json',origin:'*'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{signal:controller.signal,headers:{accept:'application/json'}});if(!response.ok)return null;
    const image=normalizeCommonsImage(await response.json(),destination);
    if(image)try{storage?.setItem(key,JSON.stringify(image))}catch{}
    return image;
  }catch{return null}finally{clearTimeout(timer)}
}
export async function enrichDestinationImages(destinations,options={}){
  const maximum=Math.max(0,Math.min(12,options.maximum||6)),selected=destinations.slice(0,maximum);
  const results=await Promise.all(selected.map(destination=>fetchDestinationImage(destination,options)));
  selected.forEach((destination,index)=>{if(results[index])destination.image=results[index]});return destinations;
}
export const imageProviderAttribution='Wikimedia Commons; route-specifieke zoekopdracht, alleen expliciet open gelicentieerde resultaten.';
