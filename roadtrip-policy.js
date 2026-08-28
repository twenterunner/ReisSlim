export const ROADTRIP_POLICY=Object.freeze({
  minRoadMoveKm:50,
  estimatedRoadFactor:1.18,
  motorcycleScenicAverageKmh:55,
  motorcycleComfortableDayKm:350,
  vehicleAverageKmh:Object.freeze({motorcycle:55,car:65,motorhome:55,caravan:50}),
  repeatStayMinDays:6,
  repeatPoiThreshold:85,
  maxRepeatNights:1,
  shortTripRegionRadiusKm:190,
  anchorVisitRadiusKm:75,
  corridorRadiusKm:95,
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
  return Number.isFinite(value)?Math.max(0,Math.floor(value)):Math.max(0,nights-1)
}

/*
 * Distinct overnight locations must respect the user's accommodation-change
 * limit. Builds <=1927 required eight distinct overnight regions on the default
 * 10-day / max-5-changes trip, which mathematically contradicts that setting:
 * five changes can produce at most six distinct overnight bases.
 *
 * We still require a genuine moving roadtrip (at least two distinct overnight
 * bases when there is more than one night), but deliberate multi-night stays are
 * allowed instead of being rejected as a failure to discover enough regions.
 */
export function requiredDistinctOvernights(trip){
  const nights=Math.max(0,Number(trip?.days||0)-1);
  if(nights<=1)return nights;
  const maxDistinctByChanges=Math.min(nights,configuredMaxChanges(trip,nights)+1);
  // Preserve the existing moving-roadtrip character: for longer trips we
  // normally want all but one night to be at a distinct base. The user's
  // maxChanges setting is the hard ceiling.
  const desired=nights<=4?nights:Math.max(3,nights-1);
  return Math.max(2,Math.min(desired,maxDistinctByChanges))
}

function repeatSlots(nightCount,repeatsNeeded){
  if(repeatsNeeded<=0)return new Set();
  const slots=new Set();
  for(let i=1;i<=repeatsNeeded;i++){
    const slot=Math.max(1,Math.min(nightCount-1,Math.round(i*nightCount/(repeatsNeeded+1))));
    slots.add(slot);
  }
  return slots
}

export function repeatStayAllowed(point,trip,nightIndex,nightCount){
  const days=Number(trip?.days||0);
  if(days<ROADTRIP_POLICY.repeatStayMinDays)return false;

  const required=requiredDistinctOvernights(trip);
  const repeatsNeeded=Math.max(0,Number(nightCount||0)-required);
  if(repeatsNeeded<=0)return false;

  const scheduled=repeatSlots(Number(nightCount||0),repeatsNeeded).has(Number(nightIndex));
  const highPoi=Number(point?.poiRichness||0)>=ROADTRIP_POLICY.repeatPoiThreshold;
  const preferenceFit=Number(point?.preferenceScore||0)>=12;
  const relaxed=trip?.tripPace==='relaxed';

  // A repeat must have a reason: planned recovery/spacing, a strong POI base,
  // a strong preference match, or an explicitly relaxed trip pace.
  return Boolean(scheduled||highPoi||preferenceFit||relaxed)
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
  return days<=5?ROADTRIP_POLICY.shortTripRegionRadiusKm:Math.min(420,ROADTRIP_POLICY.shortTripRegionRadiusKm+(days-5)*35)
}

function candidateRelevant(point,origin,anchor,trip){
  if(!finitePoint(anchor))return true;
  const nearAnchor=estimatedRoadKm(point,anchor)<=regionRadiusKm(trip);
  const corridor=pointSegmentDistanceKm(point,origin,anchor)<=ROADTRIP_POLICY.corridorRadiusKm;
  const notPastAnchor=geoKm(origin,point)<=geoKm(origin,anchor)+ROADTRIP_POLICY.corridorRadiusKm;
  return nearAnchor||(corridor&&notPastAnchor)
}

function anchorVisited(path,anchor,destinationId,origin){
  if(!finitePoint(anchor))return true;
  if(finitePoint(origin)&&geoKm(origin,anchor)<=12)return true;
  return path.some(p=>p.catalogId===destinationId||estimatedRoadKm(p,anchor)<=ROADTRIP_POLICY.anchorVisitRadiusKm)
}

export function selectRoadtripOvernights({origin,trip,destination,candidates}){
  const nights=Math.max(0,Number(trip?.days||0)-1);
  const maxRoadKm=maximumRoadLegKm(trip);
  const maxChanges=configuredMaxChanges(trip,nights);
  const required=requiredDistinctOvernights(trip);
  const repeatsNeeded=Math.max(0,nights-required);
  const plannedRepeatSlots=repeatSlots(nights,repeatsNeeded);
  const maxConsecutive=Math.max(2,Math.ceil(nights/Math.max(1,required)));
  const anchor=destination?.bases?.[0]||destination?.anchor||null;
  const destinationId=destination?.id||null;

  if(!finitePoint(origin)||nights<1)return[];

  const pool=(candidates||[])
    .filter(p=>finitePoint(p)&&p.catalogId)
    .filter(p=>estimatedRoadKm(origin,p)>=ROADTRIP_POLICY.minRoadMoveKm)
    .filter(p=>candidateRelevant(p,origin,anchor,trip));

  if(!pool.length)return[];

  let beam=[{path:[],score:0,consecutive:0,changes:0}],beamWidth=320;
  const targetLeg=Math.min(maxRoadKm*.58,trip?.transport==='motorcycle'?185:215);

  for(let night=0;night<nights;night++){
    const remaining=nights-night-1,next=[];

    for(const row of beam){
      const current=row.path.at(-1)||origin;

      for(const p of pool){
        const same=row.path.length>0&&current.catalogId===p.catalogId;
        const road=same?0:estimatedRoadKm(current,p);
        const scheduledRepeat=row.path.length>0&&plannedRepeatSlots.has(night);

        // Deliberate multi-night stays are placed at deterministic, well-spaced
        // slots. This prevents the beam scorer from postponing every necessary
        // repeat until the change budget is already exhausted.
        if(scheduledRepeat&&!same)continue;
        if(!same&&(road<ROADTRIP_POLICY.minRoadMoveKm||road>maxRoadKm))continue;
        if(same&&!repeatStayAllowed(p,trip,night,nights))continue;

        const consecutive=same?row.consecutive+1:1;
        if(consecutive>maxConsecutive)continue;

        // First overnight does not count as an accommodation change. Every
        // subsequent move to a different overnight base does.
        const changes=row.changes+(!same&&row.path.length>0?1:0);
        if(changes>maxChanges)continue;

        const home=estimatedRoadKm(p,origin);
        if(trip?.routeTopology!=='open-ended'&&home>maxRoadKm*Math.max(1,remaining+1))continue;

        const path=[...row.path,p],distinct=new Set(path.map(x=>x.catalogId)).size;
        const anchorRoad=finitePoint(anchor)?estimatedRoadKm(p,anchor):0;
        const legComfort=same?0:Math.abs(road-targetLeg);
        const anchorBonus=(p.catalogId===destinationId?180:0)+(finitePoint(anchor)?Math.max(0,130-anchorRoad*.45):0);
        const variety=distinct*145;
        const repeatPenalty=same?120:0;
        const comfortPenalty=legComfort*.20;

        next.push({
          path,
          score:row.score+variety+anchorBonus-comfortPenalty-repeatPenalty,
          consecutive,
          changes
        })
      }
    }

    next.sort((a,b)=>b.score-a.score);
    beam=next.slice(0,beamWidth);
    if(!beam.length)return[]
  }

  return beam
    .filter(row=>{
      const distinct=new Set(row.path.map(x=>x.catalogId)).size;
      if(distinct<required||row.changes>maxChanges||!anchorVisited(row.path,anchor,destinationId,origin))return false;
      if(trip?.routeTopology==='open-ended')return true;
      const home=estimatedRoadKm(row.path.at(-1),origin);
      return home>=ROADTRIP_POLICY.minRoadMoveKm&&home<=maxRoadKm
    })
    .sort((a,b)=>b.score-a.score)[0]?.path||[]
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

  const picked=[];
  for(const p of pool){
    if(picked.some(x=>geoKm(x,p)<18))continue;
    picked.push(p);
    if(picked.length>=count)break
  }
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
  if(days<=1)return{valid:true,code:'single-day',violations:[],distinct:0,required:0,moves:[]};

  const rows=plan?.days||[],violations=[];
  if(rows.length!==days)violations.push(`day-count:${rows.length}/${days}`);

  const origin=plan?.routeMetrics?.origin||plan?.origin||rows[0]?.fromPoint;
  const overnightRows=trip?.routeTopology==='open-ended'?rows:rows.slice(0,-1);
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

  const distinct=new Set(ids).size,required=requiredDistinctOvernights(trip);
  const allowedRepeatNights=Math.max(0,overnightRows.length-required);
  if(repeatedNights>allowedRepeatNights)violations.push(`too-many-repeat-nights:${repeatedNights}/${allowedRepeatNights}`);
  if(distinct<required)violations.push(`distinct-overnights:${distinct}/${required}`);

  const last=rows.at(-1);
  if(trip?.routeTopology!=='open-ended'){
    if(!finitePoint(origin)||!finitePoint(last?.toPoint)||geoKm(origin,last.toPoint)>12)violations.push('does-not-return-origin')
  }else if(finitePoint(origin)&&finitePoint(last?.toPoint)&&geoKm(origin,last.toPoint)<ROADTRIP_POLICY.minRoadMoveKm){
    violations.push('open-ended-no-progression')
  }

  return{valid:violations.length===0,code:violations.length?'roadtrip-invalid':'roadtrip-ok',violations,distinct,required,moves,repeatedNights}
}
