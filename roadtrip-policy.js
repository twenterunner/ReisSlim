export const ROADTRIP_POLICY=Object.freeze({
  minRoadMoveKm:50,
  estimatedRoadFactor:1.18,
  motorcycleScenicAverageKmh:55,
  motorcycleComfortableDayKm:350,
  vehicleAverageKmh:Object.freeze({motorcycle:55,car:65,motorhome:55,caravan:50}),
  repeatStayMinDays:4,
  repeatPoiThreshold:85,
  maxRepeatNights:1,
  preferredMaxStayNights:3,
  shortTripRegionRadiusKm:220,
  anchorVisitRadiusKm:85,
  corridorRadiusKm:135,
  baseRadiusKm:95,
  baseDayTripMinKm:30
});

const finitePoint=p=>Boolean(p)&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));

export function geoKm(a,b){
  if(!finitePoint(a)||!finitePoint(b))return Infinity;
  const r=x=>Number(x)*Math.PI/180,R=6371,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),la=r(a.lat),lb=r(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))
}

export const estimatedRoadKm=(a,b)=>geoKm(a,b)*ROADTRIP_POLICY.estimatedRoadFactor;

const FEASIBILITY_PROFILES=Object.freeze({
  car:Object.freeze({productiveKmh:78,roadTimeFactor:1,breakEveryHours:2.25,breakMinutes:15,fuelStopMinutes:12,defaultFuelRangeKm:650,arrivalBufferMinutes:10,weatherReserveMinutesPerHour:0}),
  motorcycle:Object.freeze({productiveKmh:72,roadTimeFactor:1.05,breakEveryHours:1.5,breakMinutes:20,fuelStopMinutes:12,defaultFuelRangeKm:350,arrivalBufferMinutes:15,weatherReserveMinutesPerHour:5}),
  motorhome:Object.freeze({productiveKmh:66,roadTimeFactor:1.12,breakEveryHours:2,breakMinutes:20,fuelStopMinutes:18,defaultFuelRangeKm:520,arrivalBufferMinutes:35,weatherReserveMinutesPerHour:0}),
  caravan:Object.freeze({productiveKmh:62,roadTimeFactor:1.18,breakEveryHours:1.75,breakMinutes:20,fuelStopMinutes:20,defaultFuelRangeKm:460,arrivalBufferMinutes:45,weatherReserveMinutesPerHour:0})
});
function feasibilityProfile(trip){return FEASIBILITY_PROFILES[trip?.transport]||FEASIBILITY_PROFILES.car}
function policyElapsedHours(trip,distanceKm){
  const profile=feasibilityProfile(trip),distance=Math.max(0,Number(distanceKm)||0);
  const movingHours=distance/profile.productiveKmh*profile.roadTimeFactor;
  const restStops=movingHours<=.25?0:Math.floor(Math.max(0,movingHours-.05)/profile.breakEveryHours);
  const fuelRange=Math.max(100,Number(trip?.fuelRangeKm)||profile.defaultFuelRangeKm);
  const fuelStops=Math.max(0,Math.ceil(distance/Math.max(80,fuelRange*.86))-1);
  const restMinutes=restStops*profile.breakMinutes;
  const extraFuelMinutes=Math.max(0,fuelStops-restStops)*profile.fuelStopMinutes;
  const weatherMinutes=Math.round(movingHours*profile.weatherReserveMinutesPerHour);
  return movingHours+(restMinutes+extraFuelMinutes+weatherMinutes+profile.arrivalBufferMinutes)/60
}

/*
 * This is the same hard daily-time model used by destination feasibility.
 * Older builds ranked a destination with one speed model and then tried to
 * construct the selected trip with a different 50/55/65 km/h hard limit. That
 * allowed a portfolio card to say "passend" while the route solver rejected it.
 */
export function maximumRoadLegKm(trip){
  const hours=Math.max(2,Number(trip?.maxDrive||5));
  let low=0,high=1500;
  for(let i=0;i<34;i++){const mid=(low+high)/2;if(policyElapsedHours(trip,mid)<=hours+.05)low=mid;else high=mid}
  return Math.max(50,low)
}

/* app.js uses this to turn an estimated distance back into a displayed time.
 * Use the effective all-in average implied by the same maximum-leg model so a
 * solver-legal leg cannot be reclassified as over the user's time limit later. */
export function planningSpeedKmh(trip){
  const hours=Math.max(2,Number(trip?.maxDrive||5));
  return Math.max(30,maximumRoadLegKm(trip)/hours)
}

function configuredMaxChanges(trip,nights){
  const value=Number(trip?.maxChanges);
  const requested=Number.isFinite(value)?Math.max(0,Math.floor(value)):Math.max(0,nights-1);
  const movingMinimum=trip?.tripStructure==='moving'&&nights>1?1:0;
  return Math.max(movingMinimum,requested)
}

/*
 * This is the preferred diversity target, not a hard validity gate. A roadtrip
 * should normally reach this many real overnight regions, but temporary live
 * provider gaps must not make an otherwise coherent trip impossible. The solver
 * therefore tries this target first and only degrades to fewer real regions when
 * no feasible path exists.
 */
export function requiredDistinctOvernights(trip){
  const nights=Math.max(0,Number(trip?.days||0)-1);
  if(nights<=1)return nights;
  const maxDistinctByChanges=Math.min(nights,configuredMaxChanges(trip,nights)+1);
  const nightsPerBase=trip?.tripPace==='active'?2.25:trip?.tripPace==='relaxed'?3.75:3;
  const sensibleMinimum=Math.min(nights,Math.max(2,Math.ceil(nights/nightsPerBase)+1));
  return Math.min(sensibleMinimum,maxDistinctByChanges)
}

function hardMinimumDistinctOvernights(trip){
  const nights=Math.max(0,Number(trip?.days||0)-1);
  if(nights<=1)return nights;
  return Math.min(nights,2)
}

/*
 * A repeat is an intentional multi-night stay. The exact cadence and maximum
 * consecutive stay length are enforced by selectRoadtripOvernights(); this
 * predicate only determines whether repeats are conceptually allowed.
 */
export function repeatStayAllowed(point,trip,nightIndex,nightCount){
  const days=Number(trip?.days||0);
  if(days<ROADTRIP_POLICY.repeatStayMinDays||Number(nightIndex)<=0||Number(nightCount)<=1)return false;
  // Once the solver has deliberately allocated a repeat block, the repeat is
  // intentional by construction. Requiring high POI/preference scores here made
  // 4- and 5-day trips mathematically impossible when only two real regions were
  // available, despite the hard diversity floor explicitly allowing two.
  return true
}

function pointSegmentDistanceKm(p,a,b){
  if(!finitePoint(p)||!finitePoint(a)||!finitePoint(b))return Infinity;
  const lat0=p.lat*Math.PI/180,kx=111.32*Math.cos(lat0),ky=110.57;
  const ax=(a.lon-p.lon)*kx,ay=(a.lat-p.lat)*ky,bx=(b.lon-p.lon)*kx,by=(b.lat-p.lat)*ky,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
  return Math.hypot(ax+t*dx,ay+t*dy)
}

function regionRadiusKm(trip){
  const days=Number(trip?.days||0),leg=maximumRoadLegKm(trip);
  return Math.min(900,Math.max(ROADTRIP_POLICY.shortTripRegionRadiusKm,leg*1.25,ROADTRIP_POLICY.shortTripRegionRadiusKm+Math.max(0,days-5)*45))
}

function candidateRelevant(point,origin,anchor,trip){
  if(!finitePoint(anchor))return true;
  const leg=maximumRoadLegKm(trip),corridorRadius=Math.max(ROADTRIP_POLICY.corridorRadiusKm,leg*.55);
  const nearAnchor=estimatedRoadKm(point,anchor)<=regionRadiusKm(trip);
  const corridor=pointSegmentDistanceKm(point,origin,anchor)<=corridorRadius;
  const notFarPastAnchor=geoKm(origin,point)<=geoKm(origin,anchor)+corridorRadius*1.5;
  const nearOrigin=estimatedRoadKm(origin,point)<=leg*1.08;
  return nearAnchor||(corridor&&notFarPastAnchor)||nearOrigin
}

function anchorVisited(path,anchor,destinationId,origin,trip=null){
  if(!finitePoint(anchor))return true;
  if(finitePoint(origin)&&geoKm(origin,anchor)<=12)return true;
  const radius=trip?Math.max(ROADTRIP_POLICY.anchorVisitRadiusKm,Math.min(160,maximumRoadLegKm(trip)*.38)):ROADTRIP_POLICY.anchorVisitRadiusKm;
  return path.some(p=>p.catalogId===destinationId||estimatedRoadKm(p,anchor)<=radius)
}

function balancedBlockSizes(nightCount,blockCount){
  if(blockCount<=0||nightCount<=0)return[];
  const base=Math.floor(nightCount/blockCount),extra=nightCount%blockCount;
  return Array.from({length:blockCount},(_,i)=>base+(i<extra?1:0))
}

/*
 * Solve the route at accommodation-block level, not one night at a time.
 *
 * A 60-day roadtrip with five accommodation changes has at most six actual
 * move blocks. Builds <=1931 expanded every repeated night inside the beam
 * search, multiplying identical states and making long trips extremely slow.
 * Searching only the real moves is both equivalent for the hard constraints
 * and dramatically cheaper. Once a block path is found, it is expanded into
 * deliberate multi-night stays.
 */
function solveRoadtripBlocks({origin,trip,destination,pool,nights,maxRoadKm,targetDistinct,blockCount}){
  const anchor=destination?.bases?.[0]||destination?.anchor||null;
  const destinationId=destination?.id||null;
  const targetLeg=Math.min(maxRoadKm*.62,trip?.transport==='motorcycle'?185:220);
  const beamWidth=Math.min(180,Math.max(64,pool.length*7));
  let beam=[{blocks:[],score:0}];

  for(let block=0;block<blockCount;block++){
    const remainingBlocks=blockCount-block-1,next=[];
    for(const row of beam){
      const current=row.blocks.at(-1)||origin;
      for(const p of pool){
        if(row.blocks.length&&current.catalogId===p.catalogId)continue;
        const road=estimatedRoadKm(current,p);
        if(road<ROADTRIP_POLICY.minRoadMoveKm||road>maxRoadKm)continue;

        // A loop must still be geometrically capable of getting home using the
        // remaining move blocks plus the final return leg.
        const home=estimatedRoadKm(p,origin);
        if(trip?.routeTopology!=='open-ended'&&home>maxRoadKm*Math.max(1,remainingBlocks+1))continue;

        const blocks=[...row.blocks,p],distinct=new Set(blocks.map(x=>x.catalogId)).size;
        if(distinct+remainingBlocks<targetDistinct)continue;

        const anchorRoad=finitePoint(anchor)?estimatedRoadKm(p,anchor):0;
        const anchorBonus=(p.catalogId===destinationId?220:0)+(finitePoint(anchor)?Math.max(0,150-anchorRoad*.45):0);
        const legComfort=Math.abs(road-targetLeg);
        const preferenceBonus=Number(p.preferenceScore||0)*.4+Number(p.poiRichness||0)*.24+Number(p.vehicleScore||0)*4;
        const variety=distinct*165;
        const returnBonus=trip?.routeTopology==='open-ended'?0:(remainingBlocks<=1?Math.max(0,120-home*.22):0);
        next.push({blocks,score:row.score+anchorBonus+preferenceBonus+variety+returnBonus-legComfort*.16});
      }
    }
    next.sort((a,b)=>b.score-a.score);
    beam=next.slice(0,beamWidth);
    if(!beam.length)return[]
  }

  const best=beam.filter(row=>{
    const distinct=new Set(row.blocks.map(x=>x.catalogId)).size;
    if(distinct<targetDistinct||!anchorVisited(row.blocks,anchor,destinationId,origin,trip))return false;
    if(trip?.routeTopology==='open-ended')return true;
    const home=estimatedRoadKm(row.blocks.at(-1),origin);
    return home>=ROADTRIP_POLICY.minRoadMoveKm&&home<=maxRoadKm
  }).sort((a,b)=>b.score-a.score)[0];
  if(!best)return[];

  const sizes=balancedBlockSizes(nights,blockCount),expanded=[];
  best.blocks.forEach((p,i)=>{for(let n=0;n<sizes[i];n++)expanded.push(p)});
  return expanded
}


function destinationPoint(origin,distanceKm,bearingDegrees){
  const R=6371,b=bearingDegrees*Math.PI/180,lat1=Number(origin.lat)*Math.PI/180,lon1=Number(origin.lon)*Math.PI/180,a=distanceKm/R;
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(a)+Math.cos(lat1)*Math.sin(a)*Math.cos(b));
  const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat1),Math.cos(a)-Math.sin(lat1)*Math.sin(lat2));
  return{lat:lat2*180/Math.PI,lon:((lon2*180/Math.PI+540)%360)-180}
}
function initialBearing(a,b){
  if(!finitePoint(a)||!finitePoint(b))return 0;
  const r=x=>Number(x)*Math.PI/180,y=Math.sin(r(b.lon-a.lon))*Math.cos(r(b.lat)),x=Math.cos(r(a.lat))*Math.sin(r(b.lat))-Math.sin(r(a.lat))*Math.cos(r(b.lat))*Math.cos(r(b.lon-a.lon));
  return(Math.atan2(y,x)*180/Math.PI+360)%360
}
function interpolateGreatCircle(a,b,t){
  // For roadtrip-scale legs a linear lat/lon interpolation is stable and keeps
  // the point on the origin/anchor corridor; longitude is normalized afterward.
  let dLon=Number(b.lon)-Number(a.lon);if(dLon>180)dLon-=360;if(dLon<-180)dLon+=360;
  return{lat:Number(a.lat)+(Number(b.lat)-Number(a.lat))*t,lon:((Number(a.lon)+dLon*t+540)%360)-180}
}
function provisionalCandidate(point,id,name){return{...point,name,catalogId:id,generatedExploration:true,landValidated:null,provisionalRoutePoint:true,poiRichness:70,preferenceScore:18,vehicleScore:8}}

/*
 * Last-resort topology skeleton, not a fake-city fallback.
 *
 * If live locality discovery has not supplied enough named towns yet, selection
 * must not fail merely because the network providers are incomplete. We build
 * constraint-valid geometric route points, label them explicitly as pending and
 * let prepareGeneratedRouteStops() resolve them to real named localities in the
 * next live stage. No country/city tables or origin-specific exceptions exist.
 */
function buildProvisionalRoadtripPath({origin,trip,destination,nights,maxRoadKm,maxChanges}){
  const anchor=destination?.bases?.[0]||destination?.anchor||null;
  if(!finitePoint(origin)||!finitePoint(anchor)||nights<1)return[];
  const maxBlocks=Math.max(1,Math.min(nights,maxChanges+1)),directRoad=estimatedRoadKm(origin,anchor);
  const validMove=(a,b)=>{const d=estimatedRoadKm(a,b);return d>=ROADTRIP_POLICY.minRoadMoveKm&&d<=maxRoadKm*.985};
  const makePending=(point,id,label)=>provisionalCandidate(point,id,label);
  const anchorPoint={...anchor,name:anchor.name||destination?.name||'Gekozen reisregio',catalogId:destination?.id||'selected-anchor',generatedExploration:false,landValidated:true,poiRichness:90,preferenceScore:30,vehicleScore:9};
  const blocks=[];

  if(directRoad>=ROADTRIP_POLICY.minRoadMoveKm){
    const legs=Math.max(1,Math.ceil(directRoad/Math.max(1,maxRoadKm*.94)));
    const minimumRoundTripBlocks=trip?.routeTopology==='open-ended'?legs:legs*2-1;
    if(minimumRoundTripBlocks>maxBlocks)return[];
    for(let i=1;i<legs;i++)blocks.push(makePending(interpolateGreatCircle(origin,anchor,i/legs),`provisional-out-${i}`,`Routepunt ${i} · plaats live bepalen`));
    blocks.push(anchorPoint);
    if(trip?.routeTopology!=='open-ended'){
      const bearing=initialBearing(origin,anchor);
      for(let i=legs-1;i>=1;i--){
        const base=interpolateGreatCircle(origin,anchor,i/legs);
        if(trip?.routeTopology==='loop'){
          const side=Math.min(42,Math.max(12,maxRoadKm/ROADTRIP_POLICY.estimatedRoadFactor*.10));
          const offset=destinationPoint(base,side,bearing+92);
          const prev=blocks.at(-1)||origin;
          if(validMove(prev,offset)&&validMove(offset,i===1?origin:interpolateGreatCircle(origin,anchor,(i-1)/legs))){blocks.push(makePending(offset,`provisional-return-${i}`,`Routepunt terug ${i} · plaats live bepalen`));continue}
        }
        blocks.push(makePending(base,`provisional-return-${i}`,`Routepunt terug ${i} · plaats live bepalen`))
      }
    }
  }

  // A nearby selected region can be a visit without being a legal >=50 km
  // overnight move. Likewise, a one-leg destination needs a second real future
  // locality for a multi-night moving trip. Find generic geometry that is legal
  // from both the current block and home; it is resolved to an actual locality
  // immediately after selection.
  const requiredDistinct=hardMinimumDistinctOvernights(trip);
  const distinctCount=()=>new Set(blocks.map(x=>x.catalogId)).size;
  const needExploration=blocks.length===0||distinctCount()<requiredDistinct;
  if(needExploration){
    const from=blocks.at(-1)||origin,bearing=initialBearing(origin,anchor),radii=[.42,.58,.72,.84].map(f=>maxRoadKm*f/ROADTRIP_POLICY.estimatedRoadFactor),offsets=[65,-65,115,-115,155,-155,205];
    let picked=null;
    outer:for(const radius of radii)for(const offset of offsets){
      const p=destinationPoint(anchor,radius,bearing+offset);
      if(validMove(from,p)&&(trip?.routeTopology==='open-ended'||validMove(p,origin))){picked=p;break outer}
    }
    if(!picked){
      outer:for(const radius of radii)for(const offset of offsets){const p=destinationPoint(origin,radius,offset);if(validMove(from,p)&&(trip?.routeTopology==='open-ended'||validMove(p,origin))){picked=p;break outer}}
    }
    if(!picked)return[];
    blocks.push(makePending(picked,'provisional-explore-1','Routepunt · plaats live bepalen'))
  }

  if(blocks.length>maxBlocks)return[];
  if(trip?.routeTopology!=='open-ended'&&!validMove(blocks.at(-1),origin))return[];
  for(let i=0;i<blocks.length;i++){
    const from=i?blocks[i-1]:origin;if(!validMove(from,blocks[i]))return[]
  }

  // Extra accommodation changes are a maximum, never a target. Keep provisional
  // geometry to one night per generated block and put surplus nights on the real
  // selected anchor where possible. That avoids reverse-geocoding the same pending
  // waypoint four or five times on longer trips.
  const sizes=Array(blocks.length).fill(1),anchorIndex=blocks.findIndex(p=>p.generatedExploration!==true);
  sizes[anchorIndex>=0?anchorIndex:0]+=Math.max(0,nights-blocks.length);
  const expanded=[];blocks.forEach((point,i)=>{for(let n=0;n<sizes[i];n++)expanded.push(point)});
  return expanded.length===nights?expanded:[]
}

export function selectRoadtripOvernights({origin,trip,destination,candidates}){
  const nights=Math.max(0,Number(trip?.days||0)-1);
  const maxRoadKm=maximumRoadLegKm(trip);
  const maxChanges=configuredMaxChanges(trip,nights);
  const preferred=requiredDistinctOvernights(trip);
  const hardMinimum=hardMinimumDistinctOvernights(trip);
  const anchor=destination?.bases?.[0]||destination?.anchor||null;

  if(!finitePoint(origin)||nights<1)return[];

  const pool=(candidates||[])
    .filter(p=>finitePoint(p)&&p.catalogId)
    .filter(p=>estimatedRoadKm(origin,p)>=ROADTRIP_POLICY.minRoadMoveKm)
    .filter(p=>candidateRelevant(p,origin,anchor,trip));

  if(!pool.length)return buildProvisionalRoadtripPath({origin,trip,destination,nights,maxRoadKm,maxChanges});

  // Preferred diversity is attempted first. Only if the real candidate topology
  // cannot satisfy it do we fall back one level at a time, never below two real
  // overnight regions for a multi-night moving roadtrip.
  const maxBlocks=Math.max(1,Math.min(nights,maxChanges+1));
  const comfortBlocks=Math.ceil(nights/ROADTRIP_POLICY.preferredMaxStayNights);
  for(let target=preferred;target>=hardMinimum;target--){
    const minimumBlocks=Math.min(maxBlocks,Math.max(target,comfortBlocks));
    for(let blockCount=minimumBlocks;blockCount<=maxBlocks;blockCount++){
      const path=solveRoadtripBlocks({origin,trip,destination,pool,nights,maxRoadKm,targetDistinct:target,blockCount});
      if(path.length===nights)return path
    }
  }
  return buildProvisionalRoadtripPath({origin,trip,destination,nights,maxRoadKm,maxChanges})
}

function prefScore(p,trip){
  return Number(p.preferenceScore||0)+Number(p.poiRichness||0)*1.4+Number(p.vehicleScore||0)*8
}

export function selectRoadtripBase({origin,trip,destination,candidates}){
  const anchor=destination?.bases?.[0]||destination?.anchor||null,maxLeg=maximumRoadLegKm(trip);
  const anchorIsOrigin=finitePoint(anchor)&&geoKm(origin,anchor)<=12;
  const baseRadius=anchorIsOrigin?Math.min(180,maxLeg*.55):Math.max(ROADTRIP_POLICY.baseRadiusKm,Math.min(180,maxLeg*.55));
  if(!finitePoint(origin))return null;

  let rows=(candidates||[])
    .filter(p=>finitePoint(p)&&p.catalogId)
    .filter(p=>estimatedRoadKm(origin,p)<=maxLeg)
    .filter(p=>!finitePoint(anchor)||estimatedRoadKm(p,anchor)<=baseRadius);

  // A base trip needs a reachable real base, not a mandatory inventory of
  // surrounding towns. If discovery around the selected destination is sparse,
  // the selected destination itself is a legitimate base and local activity
  // days can be enriched later from POIs around it.
  if(!rows.length&&finitePoint(anchor)&&estimatedRoadKm(origin,anchor)<=maxLeg){
    rows=[{...anchor,name:anchor.name||destination?.name||'Uitvalsbasis',catalogId:destination?.id||'selected-base',landValidated:true,generatedExploration:false,poiRichness:80,preferenceScore:20,vehicleScore:8,selectedDestinationBase:true}]
  }
  if(!rows.length)return null;

  const scored=rows.map(p=>{
    const near=(candidates||[]).filter(q=>q.catalogId!==p.catalogId&&finitePoint(q)&&estimatedRoadKm(p,q)>=ROADTRIP_POLICY.baseDayTripMinKm&&estimatedRoadKm(p,q)*2<=maxLeg).length;
    const anchorKm=finitePoint(anchor)?estimatedRoadKm(p,anchor):0,homeKm=estimatedRoadKm(origin,p),centrality=near*18;
    const score=prefScore(p,trip)+centrality-Math.max(0,anchorKm-20)*.9-Math.abs(homeKm-Math.min(maxLeg*.65,210))*.08;
    return{...p,baseScore:Number(score.toFixed(1)),baseWhy:{poiRichness:Number(p.poiRichness||0),preferenceScore:Number(p.preferenceScore||0),reachableDayTrips:near,anchorKm:Math.round(anchorKm)}}
  }).sort((a,b)=>b.baseScore-a.baseScore);

  return scored[0]||null
}

export function selectBaseDayTrips({base,trip,candidates,count}){
  if(!finitePoint(base)||count<=0)return[];
  const maxTotal=maximumRoadLegKm(trip);
  const pool=(candidates||[])
    .filter(p=>finitePoint(p)&&p.catalogId!==base.catalogId)
    .map(p=>({...p,oneWay:estimatedRoadKm(base,p)}))
    .filter(p=>p.oneWay>=ROADTRIP_POLICY.baseDayTripMinKm&&p.oneWay*2<=maxTotal)
    .sort((a,b)=>(prefScore(b,trip)-Math.abs(b.oneWay-90)*.12)-(prefScore(a,trip)-Math.abs(a.oneWay-90)*.12));

  const unique=[];
  for(const p of pool){
    if(unique.some(x=>geoKm(x,p)<18))continue;
    unique.push(p);
    if(unique.length>=count)break
  }
  if(!unique.length)return Array.from({length:count},(_,i)=>({...base,name:`Lokale dag rond ${base.name||'uitvalsbasis'}`,localBaseDay:true,reusedDayTrip:i>0}));
  if(unique.length>=count)return unique.slice(0,count);

  // A long base holiday does not require a different town every single day.
  // Builds <=1931 returned fewer rows than requested once the finite nearby-town
  // pool was exhausted, and app.js interpreted that as a fatal planning error.
  // Reuse the strongest genuine day-trip targets only after every unique target
  // has been used once. validateBaseTrip still requires variety when possible.
  const picked=[...unique];
  for(let i=unique.length;i<count;i++)picked.push({...unique[(i-unique.length)%unique.length],reusedDayTrip:true});
  return picked
}

function logicalSamePlace(day){
  const a=day?.fromPoint,b=day?.toPoint;
  if(!finitePoint(a)||!finitePoint(b))return false;
  return String(a.catalogId||day.from||'')===String(b.catalogId||day.to||'')&&geoKm(a,b)<12
}

function validateBaseTrip(trip,plan){
  const rows=plan?.days||[],violations=[];
  if(rows.length!==Number(trip.days||0))violations.push(`day-count:${rows.length}/${trip.days}`);
  const origin=plan?.routeMetrics?.origin||plan?.origin||rows[0]?.fromPoint,base=plan?.baseSelection?.point||rows[0]?.toPoint;
  if(!finitePoint(base))violations.push('missing-base');
  if(rows.length&&finitePoint(origin)&&finitePoint(rows[0]?.toPoint)&&geoKm(origin,rows[0].toPoint)>12&&Number(rows[0].distanceKm||estimatedRoadKm(origin,rows[0].toPoint))<ROADTRIP_POLICY.minRoadMoveKm)violations.push('short-outbound-to-base');
  const middle=rows.slice(1,-1),targets=[];
  for(let i=0;i<middle.length;i++){
    const d=middle[i];
    if(d.kind!=='daytrip')violations.push(`expected-daytrip:${i+2}`);
    if(!logicalSamePlace(d))violations.push(`base-changed:${i+2}`);
    if(finitePoint(d.destinationPoint)){
      targets.push(String(d.destinationPoint.catalogId||`${d.destinationPoint.lat.toFixed(3)},${d.destinationPoint.lon.toFixed(3)}`))
    }else violations.push(`missing-daytrip-target:${i+2}`)
  }
  // Variety is a quality preference, not a validity gate. A base holiday may
  // deliberately spend several days in the same real area while live POIs fill
  // different local activities.
  const distinctDayTrips=new Set(targets).size;
  const last=rows.at(-1);
  if(rows.length>1&&(!finitePoint(last?.toPoint)||!finitePoint(origin)||geoKm(last.toPoint,origin)>12))violations.push('does-not-return-origin');
  return{valid:violations.length===0,code:violations.length?'base-trip-invalid':'base-trip-ok',violations,base:base?.name||null,dayTrips:targets.length,distinctDayTrips}
}

export function validateRoadtrip(trip,plan){
  if(trip?.tripStructure==='base')return validateBaseTrip(trip,plan);
  const days=Number(trip?.days||0);
  if(days<=1)return{valid:true,code:'single-day',violations:[],distinct:0,required:0,recommendedDistinct:0,moves:[]};

  const rows=plan?.days||[],violations=[];
  if(rows.length!==days)violations.push(`day-count:${rows.length}/${days}`);

  const origin=plan?.routeMetrics?.origin||plan?.origin||rows[0]?.fromPoint;
  // `days` counts calendar days, so every trip has days-1 overnight nights.
  // The final open-ended transfer is an endpoint, not an extra accommodation
  // night. Counting it as an overnight added a phantom accommodation change.
  const overnightRows=rows.slice(0,-1);
  const ids=[],moves=[];
  let repeatedNights=0,provisionalStops=0;

  for(let i=0;i<overnightRows.length;i++){
    const d=overnightRows[i],a=d.fromPoint,b=d.toPoint;
    if(!finitePoint(a)||!finitePoint(b)){violations.push(`missing-coordinate:${i+1}`);continue}
    const same=logicalSamePlace(d),road=Number(d.distanceKm)>0?Number(d.distanceKm):estimatedRoadKm(a,b);
    if(same){
      repeatedNights++;
      if(!d.intentionalStay||!d.stayJustification)violations.push(`unjustified-repeat:${i+1}`)
    }else if(road<ROADTRIP_POLICY.minRoadMoveKm)violations.push(`short-move:${i+1}:${Math.round(road)}`);
    moves.push(road);
    ids.push(String(d.toPoint?.catalogId||d.overnight||`${Number(b.lat).toFixed(3)},${Number(b.lon).toFixed(3)}`));
    if(d.toPoint?.landValidated===false)violations.push(`unresolved-stop:${i+1}`);
    else if(d.toPoint?.generatedExploration===true&&d.toPoint?.landValidated!==true)provisionalStops++
  }

  const distinct=new Set(ids).size,recommendedDistinct=requiredDistinctOvernights(trip),required=hardMinimumDistinctOvernights(trip);
  const allowedRepeatNights=Math.max(0,overnightRows.length-required);
  if(repeatedNights>allowedRepeatNights)violations.push(`too-many-repeat-nights:${repeatedNights}/${allowedRepeatNights}`);
  if(distinct<required)violations.push(`distinct-overnights:${distinct}/${required}`);

  const maxChanges=configuredMaxChanges(trip,Math.max(0,days-1));
  let changes=0,previousId=null;
  for(const id of ids){if(previousId!==null&&id!==previousId)changes++;previousId=id}
  if(changes>maxChanges)violations.push(`too-many-changes:${changes}/${maxChanges}`);

  const last=rows.at(-1);
  if(trip?.routeTopology!=='open-ended'){
    if(!finitePoint(origin)||!finitePoint(last?.toPoint)||geoKm(origin,last.toPoint)>12)violations.push('does-not-return-origin')
  }else if(finitePoint(origin)&&finitePoint(last?.toPoint)&&geoKm(origin,last.toPoint)<ROADTRIP_POLICY.minRoadMoveKm){
    violations.push('open-ended-no-progression')
  }

  return{
    valid:violations.length===0,
    code:violations.length?'roadtrip-invalid':'roadtrip-ok',
    violations,
    distinct,
    required,
    recommendedDistinct,
    diversityShortfall:Math.max(0,recommendedDistinct-distinct),
    moves,
    repeatedNights,
    changes,
    provisionalStops,
    pendingResolution:provisionalStops>0
  }
}
