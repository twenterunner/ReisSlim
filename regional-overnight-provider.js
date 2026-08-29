import { mapConcurrent } from './roadtrip-runtime-engine.js?v=1932';
import { maximumRoadLegKm, selectRoadtripOvernights, selectRoadtripBase, selectBaseDayTrips } from './roadtrip-policy.js?v=1932';

const PHOTON_REVERSE='https://photon.komoot.io/reverse';
const NOMINATIM_REVERSE='https://nominatim.openstreetmap.org/reverse';
const OVERPASS_ENDPOINTS=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
const CACHE_PREFIX='reisslim.regional-resilient.v5-topology';
const FRESH_MS=30*24*60*60*1000;
const STALE_MS=180*24*60*60*1000;
const finite=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
const rad=x=>Number(x)*Math.PI/180;
function geoKm(a,b){if(!finite(a)||!finite(b))return Infinity;const R=6371,d1=rad(b.lat-a.lat),d2=rad(b.lon-a.lon),x=rad(a.lat),y=rad(b.lat),h=Math.sin(d1/2)**2+Math.cos(x)*Math.cos(y)*Math.sin(d2/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function seed(origin,km,bearing){const R=6371,a=km/R,b=rad(bearing),lat1=rad(origin.lat),lon1=rad(origin.lon),lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b)),lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));return{lat:lat2*180/Math.PI,lon:((lon2*180/Math.PI+540)%360)-180}}
function lerp(a,b,t){return{lat:Number(a.lat)+(Number(b.lat)-Number(a.lat))*t,lon:Number(a.lon)+(Number(b.lon)-Number(a.lon))*t}}
function initialBearing(a,b){if(!finite(a)||!finite(b))return 0;const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)),x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));return(Math.atan2(y,x)*180/Math.PI+360)%360}
function key(origin,anchor,trip){return`${CACHE_PREFIX}:${Number(origin.lat).toFixed(2)},${Number(origin.lon).toFixed(2)}:${finite(anchor)?`${Number(anchor.lat).toFixed(2)},${Number(anchor.lon).toFixed(2)}`:'none'}:${trip?.tripStructure||'moving'}:${trip?.days||0}:${trip?.transport||''}:${trip?.maxDrive||0}:${trip?.maxChanges||0}:${trip?.routeTopology||'loop'}`}
function readCache(storage,k,maxAge=FRESH_MS){try{const row=JSON.parse(storage?.getItem(k)||'null');if(!row?.savedAt||!Array.isArray(row.value))return null;const age=Date.now()-row.savedAt;return age<=maxAge?{value:row.value,age}:null}catch{return null}}
function writeCache(storage,k,value){try{storage?.setItem(k,JSON.stringify({savedAt:Date.now(),value}))}catch{}}
function localityName(p={}){return p.city||p.town||p.village||p.locality||p.municipality||p.county||p.name||null}
function normalizePhoton(payload){const f=payload?.features?.[0],p=f?.properties||{},c=f?.geometry?.coordinates||[],point={lat:Number(c[1]),lon:Number(c[0])},name=localityName(p),country=p.country||null,countryCode=String(p.countrycode||p.country_code||'').toUpperCase();return name&&country&&finite(point)?{name:String(name),...point,country,countryCode,osmType:p.osm_type||null,osmId:p.osm_id||null,source:'Photon'}:null}
function normalizeNominatim(row){const a=row?.address||{},point={lat:Number(row?.lat),lon:Number(row?.lon)},name=localityName({...a,name:row?.name}),country=a.country||null,countryCode=String(a.country_code||'').toUpperCase();return name&&country&&finite(point)?{name:String(name),...point,country,countryCode,osmType:row?.osm_type||null,osmId:row?.osm_id||row?.place_id||null,source:'Nominatim'}:null}
function normalizeOverpass(el){const t=el?.tags||{},point={lat:Number(el?.lat??el?.center?.lat),lon:Number(el?.lon??el?.center?.lon)},name=t['name:nl']||t.name||t['name:en'],country=t['is_in:country']||t['addr:country']||'Live regio';return name&&finite(point)?{name:String(name),...point,country,countryCode:String(t['addr:country']||t['is_in:country_code']||'').toUpperCase(),osmType:el.type||null,osmId:el.id||null,source:'Overpass'}:null}
async function fetchJson(url,options,fetchImpl,timeoutMs){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetchImpl(url,{...options,signal:c.signal});if(!r?.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(timer)}}
async function photonReverse(point,fetchImpl,timeoutMs){const u=new URL(PHOTON_REVERSE);u.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),limit:'1',lang:'nl'});return normalizePhoton(await fetchJson(u,{headers:{accept:'application/json'}},fetchImpl,timeoutMs))}
async function nominatimReverse(point,fetchImpl,timeoutMs){const u=new URL(NOMINATIM_REVERSE);u.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lon),format:'jsonv2',zoom:'10',addressdetails:'1'});return normalizeNominatim(await fetchJson(u,{headers:{accept:'application/json'}},fetchImpl,timeoutMs))}
function overpassQuery(points){const clauses=points.map(p=>`nwr(around:30000,${Number(p.lat).toFixed(5)},${Number(p.lon).toFixed(5)})["place"~"^(city|town|village)$"]["name"];`).join('');return`[out:json][timeout:6][maxsize:8388608];(${clauses});out center tags 260;`}
async function overpassBatch(points,fetchImpl,timeoutMs){if(!points.length)return[];const body=new URLSearchParams({data:overpassQuery(points)});return await new Promise(resolve=>{let left=OVERPASS_ENDPOINTS.length,done=false;for(const endpoint of OVERPASS_ENDPOINTS){fetchJson(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body},fetchImpl,timeoutMs).then(payload=>{if(done)return;const rows=(payload?.elements||[]).map(normalizeOverpass).filter(Boolean);if(rows.length){done=true;resolve(rows);return}if(--left===0){done=true;resolve([])}}).catch(()=>{if(--left===0&&!done){done=true;resolve([])}})}})}
function targetCandidateCount(trip){const days=Math.max(2,Number(trip?.days||5));return trip?.tripStructure==='base'?Math.max(5,Math.min(10,days)):Math.max(5,Math.min(10,Math.ceil(days/2)+2))}

// Real named offline regions form a deterministic safety net for roadtrip topology.
// They are NOT shown as destination proposals; they are only merged into the route
// supply when live providers/cache do not form a connected route. This prevents a
// transient map-provider outage from turning an otherwise valid Saasveld roadtrip
// into the fatal "onvoldoende echte overnachtingsregio's" screen.
const OFFLINE_EUROPE_REGIONS=[
 ['Zwolle',52.5168,6.0830,'Nederland'],['Deventer',52.2550,6.1639,'Nederland'],['Apeldoorn',52.2112,5.9699,'Nederland'],['Arnhem',51.9851,5.8987,'Nederland'],['Nijmegen',51.8426,5.8528,'Nederland'],['Utrecht',52.0907,5.1214,'Nederland'],['Maastricht',50.8514,5.6909,'Nederland'],['Groningen',53.2194,6.5665,'Nederland'],['Assen',52.9928,6.5624,'Nederland'],['Emmen',52.7858,6.8976,'Nederland'],
 ['Münster',51.9607,7.6261,'Duitsland'],['Osnabrück',52.2799,8.0472,'Duitsland'],['Bielefeld',52.0302,8.5325,'Duitsland'],['Paderborn',51.7189,8.7575,'Duitsland'],['Dortmund',51.5136,7.4653,'Duitsland'],['Kassel',51.3127,9.4797,'Duitsland'],['Göttingen',51.5413,9.9158,'Duitsland'],['Hannover',52.3759,9.7320,'Duitsland'],['Bremen',53.0793,8.8017,'Duitsland'],['Hamburg',53.5511,9.9937,'Duitsland'],['Lübeck',53.8655,10.6866,'Duitsland'],['Kiel',54.3233,10.1228,'Duitsland'],['Flensburg',54.7937,9.4469,'Duitsland'],['Magdeburg',52.1205,11.6276,'Duitsland'],['Berlin',52.5200,13.4050,'Duitsland'],['Leipzig',51.3397,12.3731,'Duitsland'],['Dresden',51.0504,13.7373,'Duitsland'],['Erfurt',50.9848,11.0299,'Duitsland'],['Jena',50.9271,11.5892,'Duitsland'],['Weimar',50.9795,11.3235,'Duitsland'],['Fulda',50.5558,9.6808,'Duitsland'],['Würzburg',49.7913,9.9534,'Duitsland'],['Frankfurt',50.1109,8.6821,'Duitsland'],['Koblenz',50.3569,7.5889,'Duitsland'],['Trier',49.7499,6.6371,'Duitsland'],['Heidelberg',49.3988,8.6724,'Duitsland'],['Karlsruhe',49.0069,8.4037,'Duitsland'],['Stuttgart',48.7758,9.1829,'Duitsland'],['Ulm',48.4011,9.9876,'Duitsland'],['Augsburg',48.3705,10.8978,'Duitsland'],['München',48.1351,11.5820,'Duitsland'],['Garmisch-Partenkirchen',47.4917,11.0955,'Duitsland'],['Freiburg',47.9990,7.8421,'Duitsland'],['Goslar',51.9059,10.4280,'Duitsland'],['Wernigerode',51.8356,10.7850,'Duitsland'],['Nordhausen',51.5000,10.7900,'Duitsland'],
 ['Antwerpen',51.2194,4.4025,'België'],['Brussel',50.8503,4.3517,'België'],['Leuven',50.8798,4.7005,'België'],['Luik',50.6326,5.5797,'België'],['Namen',50.4674,4.8718,'België'],['Dinant',50.2606,4.9122,'België'],['Bastenaken',50.0035,5.7184,'België'],['Vianden',49.9350,6.2028,'Luxemburg'],['Luxemburg',49.6116,6.1319,'Luxemburg'],
 ['Lille',50.6292,3.0573,'Frankrijk'],['Reims',49.2583,4.0317,'Frankrijk'],['Metz',49.1193,6.1757,'Frankrijk'],['Nancy',48.6921,6.1844,'Frankrijk'],['Straatsburg',48.5734,7.7521,'Frankrijk'],['Colmar',48.0794,7.3585,'Frankrijk'],['Parijs',48.8566,2.3522,'Frankrijk'],['Troyes',48.2973,4.0744,'Frankrijk'],['Dijon',47.3220,5.0415,'Frankrijk'],['Besançon',47.2378,6.0241,'Frankrijk'],['Lyon',45.7640,4.8357,'Frankrijk'],['Annecy',45.8992,6.1294,'Frankrijk'],['Grenoble',45.1885,5.7245,'Frankrijk'],['Clermont-Ferrand',45.7772,3.0870,'Frankrijk'],['Tours',47.3941,0.6848,'Frankrijk'],['Poitiers',46.5802,0.3404,'Frankrijk'],['Bordeaux',44.8378,-0.5792,'Frankrijk'],['Bayonne',43.4929,-1.4748,'Frankrijk'],
 ['Basel',47.5596,7.5886,'Zwitserland'],['Zürich',47.3769,8.5417,'Zwitserland'],['Luzern',47.0502,8.3093,'Zwitserland'],['Bern',46.9480,7.4474,'Zwitserland'],['Interlaken',46.6863,7.8632,'Zwitserland'],['Lausanne',46.5197,6.6323,'Zwitserland'],['Genève',46.2044,6.1432,'Zwitserland'],
 ['Innsbruck',47.2692,11.4041,'Oostenrijk'],['Salzburg',47.8095,13.0550,'Oostenrijk'],['Kufstein',47.5833,12.1667,'Oostenrijk'],['Linz',48.3069,14.2858,'Oostenrijk'],['Wenen',48.2082,16.3738,'Oostenrijk'],['Graz',47.0707,15.4395,'Oostenrijk'],['Villach',46.6103,13.8558,'Oostenrijk'],
 ['Bolzano',46.4983,11.3548,'Italië'],['Trento',46.0748,11.1217,'Italië'],['Verona',45.4384,10.9916,'Italië'],['Brescia',45.5416,10.2118,'Italië'],['Milaan',45.4642,9.1900,'Italië'],
 ['Bled',46.3683,14.1146,'Slovenië'],['Ljubljana',46.0569,14.5058,'Slovenië'],['Maribor',46.5547,15.6459,'Slovenië'],['Zagreb',45.8150,15.9819,'Kroatië'],['Rijeka',45.3271,14.4422,'Kroatië'],
 ['Praag',50.0755,14.4378,'Tsjechië'],['Plzeň',49.7384,13.3736,'Tsjechië'],['České Budějovice',48.9745,14.4743,'Tsjechië'],['Brno',49.1951,16.6068,'Tsjechië'],['Ostrava',49.8209,18.2625,'Tsjechië'],['Wrocław',51.1079,17.0385,'Polen'],['Poznań',52.4064,16.9252,'Polen'],['Szczecin',53.4285,14.5528,'Polen'],['Krakau',50.0647,19.9450,'Polen'],['Katowice',50.2649,19.0238,'Polen'],['Poprad',49.0553,20.2970,'Slowakije'],['Bratislava',48.1486,17.1077,'Slowakije'],['Boedapest',47.4979,19.0402,'Hongarije'],
 ['Ribe',55.3289,8.7622,'Denemarken'],['Kolding',55.4904,9.4722,'Denemarken'],['Odense',55.4038,10.4024,'Denemarken'],['Aarhus',56.1629,10.2039,'Denemarken'],['Aalborg',57.0488,9.9217,'Denemarken'],['Kopenhagen',55.6761,12.5683,'Denemarken'],['Göteborg',57.7089,11.9746,'Zweden'],['Oslo',59.9139,10.7522,'Noorwegen'],
 ['San Sebastián',43.3183,-1.9812,'Spanje'],['Bilbao',43.2630,-2.9350,'Spanje'],['Burgos',42.3440,-3.6969,'Spanje'],['Valladolid',41.6523,-4.7245,'Spanje'],['Madrid',40.4168,-3.7038,'Spanje'],['Zaragoza',41.6488,-0.8891,'Spanje'],['Barcelona',41.3874,2.1686,'Spanje']
].map(([name,lat,lon,country],index)=>({name,lat,lon,country,countryCode:'',osmType:'offline',osmId:`eu-${index+1}`,source:'ReisSlim offline region grid'}));

function europeOrigin(origin){return finite(origin)&&Number(origin.lat)>=39&&Number(origin.lat)<=61&&Number(origin.lon)>=-8&&Number(origin.lon)<=18}
function profilePoints(profiles){return(profiles||[]).map(item=>{const b=item?.bases?.[0];return finite(b)?{name:b.name||String(item.name||'').replace(/\s*&\s*omgeving$/i,''),lat:Number(b.lat),lon:Number(b.lon),country:item.country||'Live regio',source:item.cacheStale?'cache':'cache',osmType:'cache',osmId:item.id}:null}).filter(Boolean)}
function toPolicyCandidates(rows,trip){return(rows||[]).filter(finite).map((p,index)=>({name:p.name||`Regio ${index+1}`,lat:Number(p.lat),lon:Number(p.lon),catalogId:String(p.osmId||`${p.name||'region'}-${Number(p.lat).toFixed(3)}-${Number(p.lon).toFixed(3)}`),landValidated:true,generatedExploration:false,poiRichness:78,preferenceScore:(trip?.preferences||[]).length?24:0,vehicleScore:8}))}
export function regionalSupplySupportsTrip(trip,origin,anchor,rowsOrProfiles){
 if(Number(trip?.days||0)<=1)return true;
 const raw=(rowsOrProfiles||[]).some(x=>Array.isArray(x?.bases))?profilePoints(rowsOrProfiles):rowsOrProfiles;
 const candidates=toPolicyCandidates(raw,trip);
 if(trip?.tripStructure==='base'){
   const base=selectRoadtripBase({origin:{...origin,name:trip.origin||'Vertrek'},trip,destination:{id:'regional-anchor',bases:finite(anchor)?[{...anchor}]:[]},candidates});
   if(!base)return false;
   return selectBaseDayTrips({base,trip,candidates,count:Math.max(0,Number(trip.days||0)-2)}).length===Math.max(0,Number(trip.days||0)-2)
 }
 const path=selectRoadtripOvernights({origin:{...origin,name:trip.origin||'Vertrek'},trip,destination:{id:'regional-anchor',bases:finite(anchor)?[{...anchor}]:[]},candidates});
 return path.length===Math.max(0,Number(trip.days||0)-1)
}

function strategicSeeds(trip,origin,anchor,maxRequests){
 const rows=[],seen=[];const push=p=>{if(!finite(p)||seen.some(q=>geoKm(q,p)<8))return;seen.push(p);rows.push(p)};const limit=Math.max(12,maxRequests||28),base=trip?.tripStructure==='base';
 const centre=finite(anchor)?anchor:origin;if(finite(anchor))push(anchor);
 if(finite(anchor)&&geoKm(origin,anchor)>20){
   const bearing=initialBearing(origin,anchor),side=base?24:38,maxLeg=Math.max(120,maximumRoadLegKm(trip)),roadKm=geoKm(origin,anchor)*1.18;
   const steps=Math.max(2,Math.ceil(roadKm/Math.max(85,maxLeg*.72)));
   for(let i=1;i<=steps;i++){
     const f=Math.min(.94,i/(steps+1)),p=lerp(origin,anchor,f);push(p);push(seed(p,side,bearing+90));push(seed(p,side,bearing-90));
   }
   for(const d of [Math.min(maxLeg*.35,95),Math.min(maxLeg*.65,180),Math.min(maxLeg*.9,260)]){push(seed(origin,d,bearing));push(seed(origin,d,bearing+35));push(seed(origin,d,bearing-35))}
 }
 const radii=base?[28,52,78,105]:[45,80,120,165,215];const bearings=[0,45,90,135,180,225,270,315];
 for(let r=0;r<radii.length;r++)for(let b=0;b<bearings.length;b++)push(seed(centre,radii[r],bearings[b]+(r%2?22.5:0)));
 return rows.slice(0,limit)
}
function dedupe(rows,origin){const out=[];for(const r of rows||[]){if(!r||!finite(r)||geoKm(origin,r)<32)continue;if(out.some(x=>geoKm(x,r)<14))continue;out.push(r)}return out}
function richness(point,all){const neighbours=all.filter(x=>x!==point&&geoKm(x,point)<=110).length;return Math.min(94,42+neighbours*7)}
function profile(p,i,origin,all,trip,stale=false){const poi=richness(p,all),idBase=p.osmId?`${p.osmType||'place'}-${p.osmId}`:`${p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Number(p.lat).toFixed(3)}-${Number(p.lon).toFixed(3)}`;const offline=p.source==='ReisSlim offline region grid';return{id:`regional-resilient-${idBase}`,name:`${p.name} & omgeving`,country:p.country||'Live regio',distanceKm:Math.round(geoKm(origin,p)*1.18),driveHours:null,nightMid:125,activityDaily:45,toll:0,tags:['natuur','cultuur','eten',...(trip?.transport==='motorcycle'?['motor']:[])],season:[1,2,3,4,5,6,7,8,9,10,11,12],family:7,motorcycle:8,camper:7,weather:7,crowds:7,summary:`Echte benoemde overnachtingsregio rond ${p.name}.`,pros:['Echte benoemde plaats',offline?'Offline beschikbaar bij provideruitval':'Meerdere kaartbronnen en lokale cache','Bruikbaar voor route én slimme uitvalsbasis'],cons:offline?['Live verblijf en POI’s worden na selectie apart gecontroleerd']:stale?['Live bron tijdelijk niet beschikbaar; recente gecachte plaats gebruikt']:['Verblijf en POI’s worden na selectie apart gecontroleerd'],routeStops:[],bases:[{name:p.name,lat:Number(p.lat),lon:Number(p.lon),landValidated:true}],activities:[],poiRichness:poi,dynamic:true,roadtripCandidate:true,discoverySource:offline?'ReisSlim offline region grid':stale?'ReisSlim resilient cache':`OpenStreetMap ${p.source||'multi-source'}`}}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function offlineFallback(origin,anchor,trip){if(!europeOrigin(origin))return[];const rows=OFFLINE_EUROPE_REGIONS.filter(p=>geoKm(origin,p)>32);if(!finite(anchor))return rows;const direct=geoKm(origin,anchor),corridorAllowance=Math.max(150,maximumRoadLegKm(trip)*.9);return rows.filter(p=>geoKm(p,anchor)<=Math.max(220,direct*.48)||Math.abs((geoKm(origin,p)+geoKm(p,anchor))-direct)<=corridorAllowance)}
export function buildRegionalSeeds(trip,origin,anchor){return strategicSeeds(trip,origin,anchor,32)}

export async function discoverRegionalOvernightCandidates(trip,origin,anchor,{fetchImpl=globalThis.fetch,timeoutMs=5000,maxRequests=28,concurrency=8,onProgress,storage=globalThis.localStorage}={}){
 if(typeof fetchImpl!=='function'||!finite(origin))return[];
 const cacheKey=key(origin,anchor,trip),target=targetCandidateCount(trip),fresh=readCache(storage,cacheKey,FRESH_MS),stale=readCache(storage,cacheKey,STALE_MS);
 if(fresh?.value?.length&&regionalSupplySupportsTrip(trip,origin,anchor,fresh.value)){onProgress?.({completed:1,total:1,source:'cache',cached:true,topology:true});return fresh.value}
 const seeds=strategicSeeds(trip,origin,anchor,maxRequests);let completed=0;
 let found=dedupe([...(fresh?.value?.length?profilePoints(fresh.value):[])],origin);

 onProgress?.({completed:0,total:1,source:'overpass',stage:'batch'});
 found=dedupe([...found,...await overpassBatch(seeds,fetchImpl,Math.min(3400,timeoutMs))],origin);
 onProgress?.({completed:1,total:1,source:'overpass',stage:'batch'});

 if(!regionalSupplySupportsTrip(trip,origin,anchor,found)){
   const prioritySeeds=seeds.filter(s=>!found.some(x=>geoKm(x,s)<32)).slice(0,Math.min(12,Math.max(8,target*2)));
   const photon=await mapConcurrent(prioritySeeds,async(point,index)=>{const row=await photonReverse(point,fetchImpl,Math.min(2200,timeoutMs));completed++;onProgress?.({completed,total:prioritySeeds.length,source:'photon',index});return row},{concurrency:Math.min(8,Math.max(3,concurrency||8))});
   found=dedupe([...found,...photon.map(x=>x?.error?null:x).filter(Boolean)],origin)
 }

 if(stale?.value?.length)found=dedupe([...found,...profilePoints(stale.value)],origin);

 // Deterministic European safety net before the rate-limited Nominatim fallback.
 // These are real named regions, not synthetic coordinates. Using them here means
 // a temporary provider outage does not add three seconds of serial Nominatim
 // waits before a perfectly usable connected roadtrip can be built.
 if(!regionalSupplySupportsTrip(trip,origin,anchor,found))found=dedupe([...found,...offlineFallback(origin,anchor,trip)],origin);

 // Public Nominatim is deliberately last because its acceptable-use policy
 // requires serial requests. It is only needed outside the offline safety net or
 // when the real named offline regions still cannot form the requested topology.
 if(!regionalSupplySupportsTrip(trip,origin,anchor,found)){
   const missing=seeds.filter(s=>!found.some(x=>geoKm(x,s)<35)).slice(0,europeOrigin(origin)?1:4);
   for(let i=0;i<missing.length;i++){
     if(i)await wait(1050);
     const row=await nominatimReverse(missing[i],fetchImpl,Math.min(2400,timeoutMs));
     if(row)found=dedupe([...found,row],origin);
     if(regionalSupplySupportsTrip(trip,origin,anchor,found))break
   }
 }

 if(!found.length&&stale?.value?.length)return stale.value.map(x=>({...x,discoverySource:'ReisSlim resilient cache',cacheStale:true}));
 // Keep enough spatial coverage for long trips; the old 24-row cap could drop a
 // corridor link after discovery had actually found it.
 const direct=finite(anchor)?geoKm(origin,anchor):0;
 const ordered=finite(anchor)?[...found].sort((a,b)=>{
   const da=Math.abs((geoKm(origin,a)+geoKm(a,anchor))-direct),db=Math.abs((geoKm(origin,b)+geoKm(b,anchor))-direct);
   return da-db||geoKm(origin,a)-geoKm(origin,b)
 }):found;
 const profiles=ordered.slice(0,72).map((p,i)=>profile(p,i,origin,found,trip,p.source==='cache'));
 if(profiles.length)writeCache(storage,cacheKey,profiles);
 return profiles
}
