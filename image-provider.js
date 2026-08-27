const ENDPOINT='https://commons.wikimedia.org/w/api.php';
const CACHE_PREFIX='reisslim.image.v4.trip-specific.';
const stripHtml=v=>String(v||'').replace(/<[^>]+>/g,'').trim();
function usableLicense(metadata={}){return /CC BY|public domain|CC0/i.test(metadata.LicenseShortName?.value||'')}
function tokens(destination={}){
  return `${destination.name||''} ${destination.country||''}`
    .toLocaleLowerCase('nl-NL')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t=>t.length>2&&!['omgeving','region','regio','provincie','duitsland','nederland','belgie','belgië','frankrijk','denemarken'].includes(t));
}
function primaryTokens(destination={}){
  const raw=String(destination.name||'').replace(/\s*&\s*omgeving$/i,'');
  return raw.toLocaleLowerCase('nl-NL').split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>2);
}
function descriptiveText(page){
  const meta=page?.imageinfo?.[0]?.extmetadata||{};
  return [
    page?.title,
    stripHtml(meta.ImageDescription?.value),
    stripHtml(meta.ObjectName?.value),
    stripHtml(meta.Categories?.value)
  ].filter(Boolean).join(' ').toLocaleLowerCase('nl-NL');
}
const badVisual=/\b(map|kaart|flag|vlag|coat of arms|wapen|logo|diagram|schematic|schema|locator|symbol|icon|pictogram|brochure|leaflet|flyer|poster|paper|document|scan|manuscript|certificate|ticket|menu|book|page|pagina|text|sign|signage|plaque|stamp|postcard|drawing|illustration|painting|engraving|etching|seal|chart|graph|screenshot|satellite|aerial map)\b/i;
const goodVisual=/\b(road|straße|strasse|weg|route|valley|dal|river|rivier|lake|meer|landscape|landschap|mountain|berg|forest|bos|coast|kust|harbour|haven|castle|kasteel|schloss|town|stad|village|dorp|view|panorama|street|pass|passage|waterfall|waterval|canyon|beach|strand|church|kerk|historic|old town|altstadt|nature|natuur)\b/i;

function isPhotographic(page,destination){
  const info=page?.imageinfo?.[0]||{},meta=info.extmetadata||{};
  const text=descriptiveText(page);
  const mime=String(info.mime||'').toLowerCase();
  const width=Number(info.thumbwidth||info.width||0),height=Number(info.thumbheight||info.height||0);
  const ratio=width&&height?width/height:1.5;

  // Reject non-photographic/document-like media before relevance scoring.
  if(mime && !/^image\/(jpeg|png|webp)$/i.test(mime))return false;
  if(badVisual.test(text))return false;
  if(width && width<640)return false;
  if(height && height<360)return false;
  if(ratio<.65||ratio>2.4)return false;

  // HARD destination relevance: a distinctive destination/region token must
  // occur in title/description. Country alone is not sufficient.
  const primary=primaryTokens(destination);
  if(primary.length && !primary.some(token=>text.includes(token)))return false;

  // Avoid abstract/object shots when no scenery/place cue is present.
  if(!goodVisual.test(text) && !/\b(photo|photograph|view of|panorama of)\b/i.test(text))return false;

  // License still must be reusable.
  return usableLicense(meta);
}
function score(page,destination){
  const text=descriptiveText(page),main=primaryTokens(destination),all=tokens(destination);
  let s=0;
  s+=main.reduce((n,t)=>n+(text.includes(t)?28:0),0);
  s+=all.reduce((n,t)=>n+(text.includes(t)?7:0),0);
  if(goodVisual.test(text))s+=18;
  if(/\b(road|straße|strasse|pass|route|landscape|panorama|view|valley|mountain|forest|coast|lake|river)\b/i.test(text))s+=10;
  if(badVisual.test(text))s-=200;
  return s;
}
export function normalizeCommonsImage(payload,destination=null){
  const pages=Object.values(payload?.query?.pages||{}).filter(p=>p?.imageinfo?.[0]).sort((a,b)=>score(b,destination)-score(a,destination));
  for(const page of pages){
    const info=page.imageinfo[0],meta=info.extmetadata||{};
    if(!info.thumburl||!isPhotographic(page,destination))continue;
    return{url:info.thumburl,sourceUrl:info.descriptionurl||`https://commons.wikimedia.org/?curid=${page.pageid}`,title:page.title?.replace(/^File:/,'')||'Bestemmingsbeeld',creator:stripHtml(meta.Artist?.value)||'Onbekende maker',license:meta.LicenseShortName?.value||'Open licentie',attribution:`${stripHtml(meta.Artist?.value)||'Onbekende maker'} · ${meta.LicenseShortName?.value||'open licentie'} · Wikimedia Commons`,provider:'Wikimedia Commons',checkedAt:new Date().toISOString(),routeSpecific:true,validatedPhoto:true,relevance:'destination-specific'};
  }
  return null;
}
async function queryCommons(destination,query,{fetchImpl,timeoutMs}){
  const url=new URL(ENDPOINT);
  url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'16',prop:'imageinfo',iiprop:'url|extmetadata|mime|size',iiurlwidth:'1100',format:'json',origin:'*'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetchImpl(url,{signal:controller.signal,headers:{accept:'application/json'}});if(!r.ok)return null;return normalizeCommonsImage(await r.json(),destination)}
  catch{return null}finally{clearTimeout(timer)}
}
export async function fetchDestinationImage(destination,{fetchImpl=globalThis.fetch,storage=globalThis.localStorage,timeoutMs=6500}={}){
  if(typeof fetchImpl!=='function')return null;
  const key=`${CACHE_PREFIX}${destination.id}`;
  try{const c=JSON.parse(storage?.getItem(key)||'null');if(c?.routeSpecific&&c?.url)return c}catch{}
  const name=destination.name||'',country=destination.country||'';
  const base=String(name).replace(/\s*&\s*omgeving$/i,'').trim();
  const queries=[
    `"${base}" ${country} landscape road`,
    `"${base}" ${country} panorama`,
    `"${base}" ${country} landmark landscape`,
    `"${base}" ${country} valley mountain forest`,
    `"${base}" ${country} town street`
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
