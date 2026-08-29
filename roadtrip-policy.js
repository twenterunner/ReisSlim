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

export function planningSpeedKmh(trip){
  return ROADTRIP_POLICY.vehicleAverageKmh[trip?.transport]||60
}

export function maximumRoadLegKm(trip){
  const hours=Math.max(2,Number(trip?.maxDrive||5)),timeBased=hours*planningSpeedKmh(trip);
  return trip?.transport==='motorcycle'
    ?Math.max(120,Math.min(ROADTRIP_POLICY.motorcycleComfortableDayKm,timeBased))
    :Math.max(120,timeBased)
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
  const days=Number(trip?.days||0);
  return days<=5?ROADTRIP_POLICY.shortTripRegionRadiusKm:Math.min(650,ROADTRIP_POLICY.shortTripRegionRadiusKm+(days-5)*55)
}

function candidateRelevant(point,origin,anchor,trip){
  if(!finitePoint(anchor))return true;
  const nearAnchor=estimatedRoadKm(point,anchor)<=regionRadiusKm(trip);
  const corridor=pointSegmentDistanceKm(point,origin,anchor)<=ROADTRIP_POLICY.corridorRadiusKm;
  const notFarPastAnchor=geoKm(origin,point)<=geoKm(origin,anchor)+ROADTRIP_POLICY.corridorRadiusKm*1.5;
  const nearOrigin=estimatedRoadKm(origin,point)<=maximumRoadLegKm(trip)*1.08;
  return nearAnchor||(corridor&&notFarPastAnchor)||nearOrigin
}

function anchorVisited(path,anchor,destinationId,origin){
  if(!finitePoint(anchor))return true;
  if(finitePoint(origin)&&geoKm(origin,anchor)<=12)return true;
  return path.some(p=>p.catalogId===destinationId||estimatedRoadKm(p,anchor)<=ROADTRIP_POLICY.anchorVisitRadiusKm)
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
    if(distinct<targetDistinct||!anchorVisited(row.blocks,anchor,destinationId,origin))return false;
    if(trip?.routeTopology==='open-ended')return true;
    const home=estimatedRoadKm(row.blocks.at(-1),origin);
    return home>=ROADTRIP_POLICY.minRoadMoveKm&&home<=maxRoadKm
  }).sort((a,b)=>b.score-a.score)[0];
  if(!best)return[];

  const sizes=balancedBlockSizes(nights,blockCount),expanded=[];
  best.blocks.forEach((p,i)=>{for(let n=0;n<sizes[i];n++)expanded.push(p)});
  return expanded
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

  if(!pool.length)return[];

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
  return[]
}

function prefScore(p,trip){
  return Number(p.preferenceScore||0)+Number(p.poiRichness||0)*1.4+Number(p.vehicleScore||0)*8
}

export function selectRoadtripBase({origin,trip,destination,candidates}){
  const anchor=destination?.bases?.[0]||destination?.anchor||null,maxLeg=maximumRoadLegKm(trip);
  const anchorIsOrigin=finitePoint(anchor)&&geoKm(origin,anchor)<=12;
  const baseRadius=anchorIsOrigin?Math.min(180,maxLeg*.55):ROADTRIP_POLICY.baseRadiusKm;
  if(!finitePoint(origin))return null;

  const rows=(candidates||[])
    .filter(p=>finitePoint(p)&&p.catalogId)
    .filter(p=>estimatedRoadKm(origin,p)<=maxLeg)
    .filter(p=>!finitePoint(anchor)||estimatedRoadKm(p,anchor)<=baseRadius);

  if(!rows.length)return null;

  const scored=rows.map(p=>{
    const near=(candidates||[]).filter(q=>q.catalogId!==p.catalogId&&finitePoint(q)&&estimatedRoadKm(p,q)>=ROADTRIP_POLICY.baseDayTripMinKm&&estimatedRoadKm(p,q)*2<=maxLeg).length;
    const anchorKm=finitePoint(anchor)?estimatedRoadKm(p,anchor):0,homeKm=estimatedRoadKm(origin,p),centrality=near*18;
    const score=prefScore(p,trip)+centrality-Math.max(0,anchorKm-20)*.9-Math.abs(homeKm-Math.min(maxLeg*.65,210))*.08;
    return{...p,baseScore:Number(score.toFixed(1)),baseWhy:{poiRichness:Number(p.poiRichness||0),preferenceScore:Number(p.preferenceScore||0),reachableDayTrips:near,anchorKm:Math.round(anchorKm)}}
  }).filter(p=>p.baseWhy.reachableDayTrips>=Math.min(2,Math.max(1,Number(trip.days||3)-2))).sort((a,b)=>b.baseScore-a.baseScore);

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
  if(!unique.length)return[];
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
  if(new Set(targets).size<Math.min(middle.length,2))violations.push(`insufficient-daytrip-variety:${new Set(targets).size}`);
  const last=rows.at(-1);
  if(rows.length>1&&(!finitePoint(last?.toPoint)||!finitePoint(origin)||geoKm(last.toPoint,origin)>12))violations.push('does-not-return-origin');
  return{valid:violations.length===0,code:violations.length?'base-trip-invalid':'base-trip-ok',violations,base:base?.name||null,dayTrips:targets.length}
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
  let repeatedNights=0;

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
    if(d.toPoint?.generatedExploration===true||d.toPoint?.landValidated===false)violations.push(`synthetic-stop:${i+1}`)
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
    changes
  }
}
