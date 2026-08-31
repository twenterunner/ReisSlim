import { CANONICAL_ENGINE_ID, validCoordinate } from './config.js';
import { allowedLoopOverlap, canonicalSignature, loopRouteOverlap } from './canonical-plan-engine.js';
import { haversineKm } from './travel-data.js';
import { buildGpx, gpxConsistency } from './gpx-generator.js';
import { buildMapModel, mapConsistency } from './map-view.js';
const round=(v,d=2)=>Number(Number(v).toFixed(d));
const same=(a,b)=>Boolean(a&&b)&&(a.id&&b.id?a.id===b.id:haversineKm(a,b)<.75);
const issue=(code,message,details={})=>({code,message,...details});

export function validateCanonicalPlan(plan,{requireCanonicalSignature=true}={}){
  const errors=[],warnings=[];if(!plan||plan.canonicalEngine!==CANONICAL_ENGINE_ID)return{valid:false,errors:[issue('NOT_CANONICAL_PLAN','Plan is not produced by the canonical engine.')],warnings};
  const trip=plan.trip||{},days=plan.days||[],nights=plan.overnights||[];
  if(days.length!==Number(trip.days))errors.push(issue('DAY_COUNT',`Expected ${trip.days} days; got ${days.length}.`,{actual:days.length,expected:trip.days}));
  const seen=new Set();for(let i=0;i<days.length;i++){
    const d=days[i];if(d.day!==i+1)errors.push(issue('DAY_SEQUENCE',`Day at index ${i} is numbered ${d.day}.`,{day:d.day,index:i}));if(seen.has(d.day))errors.push(issue('DUPLICATE_DAY',`Duplicate day ${d.day}.`,{day:d.day}));seen.add(d.day);
    if(!validCoordinate(d.fromPoint)||!validCoordinate(d.toPoint))errors.push(issue('DAY_ENDPOINT_COORDINATE',`Day ${d.day} has invalid endpoint coordinates.`,{day:d.day}));
    if(!Array.isArray(d.geometry)||d.geometry.length<1||d.geometry.some(p=>!validCoordinate(p)))errors.push(issue('DAY_GEOMETRY',`Day ${d.day} lacks drawable geometry.`,{day:d.day}));
    if(trip.strictDrive&&Number(d.driveHours)>Number(trip.maxDrive)+.05)errors.push(issue('MAX_DRIVE',`Day ${d.day} is ${round(d.driveHours)} h vs ${trip.maxDrive} h limit.`,{day:d.day,actual:d.driveHours,limit:trip.maxDrive}));
    if(i>0&&!same(days[i-1].toPoint,d.fromPoint))errors.push(issue('DAY_CONTINUITY',`Day ${d.day} does not start where day ${d.day-1} ended.`,{day:d.day,previous:days[i-1].toPoint?.name,current:d.fromPoint?.name}));
    if(d.kind==='daytrip'){
      if(!same(d.fromPoint,d.toPoint))errors.push(issue('DAYTRIP_BASE_RETURN',`Day ${d.day} does not return to its base.`,{day:d.day}));
      const far=(d.geometry||[]).some(p=>haversineKm(d.fromPoint,p)>1);if(!far)errors.push(issue('DAYTRIP_DOES_NOT_LEAVE_BASE',`Day ${d.day} never leaves its base.`,{day:d.day}));
    }
    for(const p of d.offlinePois||[])if(!validCoordinate(p))errors.push(issue('POI_COORDINATE',`Day ${d.day} contains an invalid POI coordinate.`,{day:d.day,poi:p.name}));
  }
  if(days.length&& !same(days[0].fromPoint,plan.origin))errors.push(issue('ORIGIN_MISMATCH','First day does not start at canonical origin.'));
  if(days.length&&trip.routeTopology!=='open-ended'&&!same(days.at(-1).toPoint,plan.origin))errors.push(issue('CLOSED_ENDPOINT','Closed trip does not end at origin.'));
  const destinationApproach=days.findLast?.(d=>d.journeyPhase==='outbound')?.toPoint||days.find(d=>d.canonicalRegionId===plan.destinationId)?.toPoint;
  if(trip.routeTopology==='loop'&&days.length>1&&destinationApproach&&haversineKm(plan.origin,destinationApproach)>=80){
    const outbound=days.filter(d=>d.journeyPhase==='outbound'),ret=days.filter(d=>d.journeyPhase==='return');
    if(!outbound.length||!ret.length)errors.push(issue('LOOP_PHASES','Loop trip lacks explicit outbound/return phases.'));
    else{const overlap=loopRouteOverlap(plan),distanceKm=haversineKm(plan.origin,destinationApproach),limit=allowedLoopOverlap(distanceKm);if(overlap>limit)errors.push(issue('LOOP_RETURN_OVERLAP',`Alternative return overlaps ${Math.round(overlap*100)}% of the outbound corridor.`,{overlap,limit}));}
  }
  const visits=days.some(d=>d.canonicalRegionId===plan.destinationId)||(plan.offlinePois||[]).some(p=>p.regionId===plan.destinationId);if(!visits)errors.push(issue('DESTINATION_NOT_VISITED','Canonical destination is not represented in the plan.'));
  const expectedNights=Math.max(0,Number(trip.days)-1);if(nights.length!==expectedNights)errors.push(issue('OVERNIGHT_COUNT',`Expected ${expectedNights} nights; got ${nights.length}.`,{actual:nights.length,expected:expectedNights}));
  for(let i=0;i<nights.length;i++){
    const n=nights[i];if(n.night!==i+1)errors.push(issue('NIGHT_SEQUENCE',`Night ${i+1} has incorrect index.`));if(!['SPECIFIC_LIVE_ACCOMMODATION','PLANNED_ACCOMMODATION_ZONE'].includes(n.state))errors.push(issue('OVERNIGHT_STATE',`Night ${n.night} has invalid state ${n.state}.`,{night:n.night}));if(!n.canonicalZoneId)errors.push(issue('OVERNIGHT_ZONE',`Night ${n.night} has no canonical zone.`,{night:n.night}));if(n.state==='PLANNED_ACCOMMODATION_ZONE'&&!validCoordinate(n.zone))errors.push(issue('OVERNIGHT_ZONE_COORDINATE',`Night ${n.night} has invalid zone coordinates.`,{night:n.night}));if(n.state==='SPECIFIC_LIVE_ACCOMMODATION'&&(!validCoordinate(n.property)||n.property.canonicalZoneId!==n.canonicalZoneId))errors.push(issue('LIVE_ACCOMMODATION_IDENTITY',`Night ${n.night} live property does not preserve canonical zone identity.`,{night:n.night}));
  }
  let changes=0;for(let i=1;i<nights.length;i++)if(nights[i].canonicalZoneId!==nights[i-1].canonicalZoneId)changes++;if(changes!==plan.accommodationChanges)errors.push(issue('ACCOMMODATION_CHANGE_CALC','Stored accommodation-change count is inconsistent.',{actual:plan.accommodationChanges,calculated:changes}));if(trip.strictChanges&&changes>trip.maxChanges)errors.push(issue('MAX_CHANGES',`Accommodation changes ${changes} exceed ${trip.maxChanges}.`,{actual:changes,limit:trip.maxChanges}));
  const suitability=plan.datasetRegionSnapshot?.vehicleSuitability?.[trip.transport];if(suitability!=null&&suitability<.25)errors.push(issue('VEHICLE_SUITABILITY',`Vehicle ${trip.transport} is not suitable for this region.`,{score:suitability}));
  const fuelGap=Number(plan.datasetRegionSnapshot?.fuelGapKm||0);if(fuelGap>Number(trip.fuelRangeKm||Infinity))errors.push(issue('FUEL_RANGE',`Fuel range ${trip.fuelRangeKm} km is below offline gap ${fuelGap} km.`,{actual:trip.fuelRangeKm,required:fuelGap}));
  if(trip.strictBudget&&Number(plan.budget?.total)>Number(trip.budget))errors.push(issue('BUDGET',`Budget estimate €${plan.budget?.total} exceeds €${trip.budget}.`,{actual:plan.budget?.total,limit:trip.budget}));
  if(!(plan.offlinePois||[]).length)errors.push(issue('NO_OFFLINE_POIS','Valid trip must retain useful offline POIs.'));for(const p of plan.offlinePois||[])if(!validCoordinate(p))errors.push(issue('PLAN_POI_COORDINATE',`Offline POI ${p.name} has invalid coordinates.`));
  for(const img of plan.images||[]){if(img.placeholder)continue;const ids=new Set([plan.destinationId,...(plan.offlinePois||[]).map(p=>p.id)]);if(!ids.has(img.verifiedEntityId))errors.push(issue('IMAGE_IDENTITY',`Image is not verified against destination or local POI.`,{image:img}));}
  if(requireCanonicalSignature&&plan.canonicalSignature){const before=plan.canonicalSignature;const current=canonicalSignature(plan);if(before!==current)errors.push(issue('CANONICAL_STRUCTURE_CHANGED','A downstream component changed canonical trip structure.'))}
  if(plan.routing?.status==='live'&&plan.days.some(d=>d.transportMode!=='ferry'&&d.routeSource==='live-routing'&&(!Array.isArray(d.geometry)||d.geometry.length<2)))errors.push(issue('LIVE_ROUTING_GEOMETRY','Live-routed day lacks geometry.'));
  const mapCheck=mapConsistency(plan,buildMapModel(plan));if(!mapCheck.valid)errors.push(issue('MAP_CONSISTENCY','Derived map model is inconsistent with the canonical plan.',mapCheck));
  const gpx=buildGpx(plan),gpxCheck=gpxConsistency(plan,gpx);if(!gpxCheck.valid)errors.push(issue('GPX_CONSISTENCY','Derived GPX is inconsistent with the canonical plan.',gpxCheck));
  return{valid:errors.length===0,errors,warnings,metrics:{days:days.length,nights:nights.length,accommodationChanges:changes,offlinePois:(plan.offlinePois||[]).length,totalDistanceKm:days.reduce((s,d)=>s+(Number(d.distanceKm)||0),0)}};
}
export function assertValidCanonicalPlan(plan,opts){const r=validateCanonicalPlan(plan,opts);if(!r.valid){const e=new Error(r.errors.map(x=>x.code).join(','));e.validation=r;throw e}return r}
