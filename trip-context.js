import { validCoordinate, vehicleProfiles } from './config.js';
import { haversineKm } from './travel-data.js';

const clone=value=>globalThis.structuredClone?globalThis.structuredClone(value):JSON.parse(JSON.stringify(value));
const round=(value,digits=0)=>Number(Number(value||0).toFixed(digits));
const interpolate=(a,b,t)=>({lat:Number(a.lat)+(Number(b.lat)-Number(a.lat))*t,lon:Number(a.lon)+(Number(b.lon)-Number(a.lon))*t});

function uniqueNames(items=[]){
  const seen=new Set();
  return items.filter(item=>{
    const key=String(item?.name||'').trim().toLowerCase();
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
}

function restCountForDay(day,trip){
  const profile=vehicleProfiles[trip?.transport]||vehicleProfiles.car;
  const breakHours=Number(day?.breakHours)||0;
  const oneBreakHours=Math.max(.05,Number(profile.breakMinutes||15)/60);
  return Math.max(0,Math.round(breakHours/oneBreakHours));
}

function chooseRestStop(data,from,to,fraction,used){
  if(!validCoordinate(from)||!validCoordinate(to))return null;
  const target=interpolate(from,to,fraction);
  const legKm=Math.max(1,haversineKm(from,to));
  const radius=Math.max(45,Math.min(130,legKm*.22));
  const candidates=(data?.nearbyBases?.(target,radius,40)||[])
    .filter(point=>validCoordinate(point)&&point.id!==from.id&&point.id!==to.id&&!used.has(point.id))
    .map(point=>{
      const progress=haversineKm(from,point)/legKm;
      const lateral=haversineKm(target,point);
      const progressPenalty=Math.abs(progress-fraction)*legKm*.8;
      const serviceBonus=point.fuelService?0:10;
      return{point,progress,lateral,score:lateral+progressPenalty+serviceBonus};
    })
    .filter(row=>row.progress>.08&&row.progress<.92)
    .sort((a,b)=>a.score-b.score||String(a.point.name).localeCompare(String(b.point.name)));
  return candidates[0]?.point||null;
}

export function annotatePlanContext(plan,data,{clonePlan=false}={}){
  const target=clonePlan?clone(plan):plan;
  if(!target?.days?.length)return target;
  const trip=target.trip||{};
  for(const day of target.days){
    const count=restCountForDay(day,trip);
    day.plannedRestCount=count;
    const used=new Set();
    const stops=[];
    if(day.transportMode!=='ferry'&&count>0&&validCoordinate(day.fromPoint)&&validCoordinate(day.toPoint)){
      for(let i=1;i<=count;i++){
        const fraction=i/(count+1);
        const selected=chooseRestStop(data,day.fromPoint,day.toPoint,fraction,used);
        if(!selected)continue;
        used.add(selected.id);
        stops.push({
          id:selected.id,
          name:selected.name,
          lat:Number(selected.lat),lon:Number(selected.lon),
          countryCode:selected.countryCode||null,
          regionId:selected.regionId||null,
          type:'rest',source:'offline-catalog',
          approxAfterKm:round(Number(day.distanceKm||0)*fraction),
          reason:`Geplande rust-/koffiestop rond ${selected.name}`
        });
      }
    }
    day.plannedStops=stops;
    day.routeCities=uniqueNames([
      {name:day.from},...stops.map(s=>({name:s.name})),...(day.waypoints||[]).map(p=>({name:p.name})),{name:day.to}
    ]).map(x=>x.name);
    day.routeContextSource='offline-catalog';
  }
  return target;
}

export function summarizePlanContext(plan){
  const restStops=(plan?.days||[]).flatMap(day=>day.plannedStops||[]);
  const plannedRestCount=(plan?.days||[]).reduce((sum,day)=>sum+Number(day.plannedRestCount||0),0);
  const pois=uniqueNames((plan?.days||[]).flatMap(day=>day.offlinePois||[]));
  const overnightPoints=(plan?.overnights||[]).map(night=>night.state==='SPECIFIC_LIVE_ACCOMMODATION'?night.property:night.zone).filter(Boolean);
  const overnightNames=uniqueNames(overnightPoints).map(x=>x.name).filter(Boolean);
  return{
    pois,poiCount:pois.length,
    restStops,restStopCount:restStops.length,plannedRestCount,
    overnightNames,nightCount:(plan?.overnights||[]).length,
    accommodationChanges:Number(plan?.accommodationChanges||0)
  };
}
