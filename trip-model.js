import { inputLimits, originCatalog, preferenceDefinitions, validCoordinate } from './config.js';
import { transportId, vehicleProfile, vehicleSpec } from './vehicle-intelligence.js';
const FIELD_IDS=['tripName','origin','startDate','days','budget','adults','children','transport','travelMode','routeTopology','tripStructure','tripPace','destinationQuery','routeStyle','fuelRangeKm','vehicleMaxSpeedKmh','vehicleHeightM','vehicleLengthM','vehicleWeightKg','maxDrive','maxChanges','accommodationType','comfort','strictBudget','strictDrive','strictChanges','allowStretch','liveData','remoteTravel','privateMode','notes'];
export function uniqueId(){return globalThis.crypto?.randomUUID?.()||`trip-${Date.now()}-${Math.random().toString(16).slice(2)}`}
export function localDate(offsetDays=0,now=new Date()){const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offsetDays,12);return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function resolveOrigin(originOrTrip){if(originOrTrip&&typeof originOrTrip==='object'&&validCoordinate(originOrTrip.originPoint))return{...originOrTrip.originPoint,name:originOrTrip.origin};const origin=typeof originOrTrip==='object'?originOrTrip.origin:originOrTrip,key=String(origin||'').trim().toLocaleLowerCase('nl-NL');return originCatalog[key]?{...originCatalog[key]}:null}
function enumValue(value,allowed,fallback){return allowed.includes(value)?value:fallback}
function boolDefaultTrue(value){return value!==false&&value!=='false'}
function validIsoDate(value){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!m)return false;const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);if(month<1||month>12||day<1)return false;const leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];return day<=days[month-1]}
function inStep(value,{min,max,step}){const n=Number(value);if(!Number.isFinite(n)||n<min||(Number.isFinite(max)&&n>max))return false;if(!step)return true;const units=(n-min)/step;return Math.abs(units-Math.round(units))<1e-7}
export function normalizeTrip(input={}){
 const preferences=Array.isArray(input.preferences)?input.preferences.filter(id=>preferenceDefinitions.some(([known])=>known===id)):[];
 const weights=Object.fromEntries(preferences.map(id=>[id,Math.max(1,Math.min(3,Number(input.preferenceWeights?.[id])||2))]));
 const travelMode='direct',transport=transportId(input.transport),spec=vehicleSpec({...input,transport});
 const tripStructure=enumValue(input.tripStructure,['moving','base'],'moving');
 let routeTopology=enumValue(input.routeTopology,['loop','out-and-back','open-ended'],'loop');
 if(tripStructure==='base'&&routeTopology==='open-ended')routeTopology='loop';
 return{id:input.id||uniqueId(),tripName:String(input.tripName||'').trim().slice(0,inputLimits.tripName.maxLength),origin:String(input.origin||'').trim(),originPoint:validCoordinate(input.originPoint)?{lat:Number(input.originPoint.lat),lon:Number(input.originPoint.lon),name:String(input.originPoint.name||input.origin||'').trim()}:null,startDate:String(input.startDate||''),days:Number(input.days),budget:Number(input.budget),adults:Number(input.adults),children:Number(input.children||0),transport,travelMode,routeTopology,tripStructure,tripPace:enumValue(input.tripPace,['relaxed','balanced','active'],'balanced'),destinationQuery:String(input.destinationQuery||'').trim().slice(0,inputLimits.destinationQuery.maxLength),destinationPoint:validCoordinate(input.destinationPoint)?{lat:Number(input.destinationPoint.lat),lon:Number(input.destinationPoint.lon),name:String(input.destinationPoint.name||input.destinationQuery||'').trim()}:null,routeStyle:spec.routeStyle,fuelRangeKm:spec.fuelRangeKm,vehicleMaxSpeedKmh:spec.maxSpeedKmh,vehicleHeightM:spec.heightM,vehicleLengthM:spec.lengthM,vehicleWeightKg:spec.weightKg,maxDrive:Number(input.maxDrive),maxChanges:Number(input.maxChanges),accommodationType:enumValue(input.accommodationType,['any','camping','hotel-bnb'],'any'),comfort:enumValue(input.comfort,['budget','mid','comfort'],'mid'),strictBudget:boolDefaultTrue(input.strictBudget),strictDrive:boolDefaultTrue(input.strictDrive),strictChanges:boolDefaultTrue(input.strictChanges),allowStretch:boolDefaultTrue(input.allowStretch),liveData:boolDefaultTrue(input.liveData),remoteTravel:false,privateMode:input.privateMode===true||input.privateMode==='true',notes:String(input.notes||'').trim().slice(0,inputLimits.notes.maxLength),preferences,preferenceWeights:weights,updatedAt:input.updatedAt||new Date().toISOString()}
}
export function validateTripInput(trip){
 const errors=[];
 if(!trip.origin)errors.push('Vul een vertrekplaats in.');
 if(!validIsoDate(trip.startDate))errors.push('Kies een geldige startdatum.');
 if(!Number.isInteger(trip.days)||!inStep(trip.days,inputLimits.days))errors.push('Kies 1 tot 60 reisdagen.');
 if(!inStep(trip.budget,inputLimits.budget))errors.push('Kies een budget vanaf €500 in stappen van €100.');
 if(!Number.isInteger(trip.adults)||!inStep(trip.adults,inputLimits.adults))errors.push('Kies 1 tot 8 volwassenen.');
 if(!Number.isInteger(trip.children)||!inStep(trip.children,inputLimits.children))errors.push('Kies 0 tot 8 kinderen.');
 if(!inStep(trip.maxDrive,inputLimits.maxDrive))errors.push('Kies 2 tot 10 uur maximale rijtijd per dag in stappen van 0,5 uur.');
 if(!Number.isInteger(trip.maxChanges)||!inStep(trip.maxChanges,inputLimits.maxChanges))errors.push('Kies 0 tot 20 accommodatiewissels.');
 if(trip.tripStructure==='moving'&&trip.maxChanges<inputLimits.maxChanges.movingMin)errors.push('Een roadtrip met meerdere verblijfplaatsen vereist minimaal 1 toegestane accommodatiewissel.');
 if(!inStep(trip.fuelRangeKm,inputLimits.fuelRangeKm))errors.push('Kies een actieradius van 100 tot 1.500 kilometer in stappen van 10 kilometer.');
 const profile=vehicleProfile(trip);
 if(profile.supportsDimensions){
   if(!inStep(trip.vehicleMaxSpeedKmh,inputLimits.vehicleMaxSpeedKmh))errors.push('Kies een maximumsnelheid van 60 tot 130 km/u in stappen van 5 km/u.');
   if(!inStep(trip.vehicleHeightM,inputLimits.vehicleHeightM))errors.push('Kies een voertuighoogte van 1,8 tot 4,5 meter in stappen van 0,05 meter.');
   if(!inStep(trip.vehicleLengthM,inputLimits.vehicleLengthM))errors.push('Kies een totale voertuiglengte van 4 tot 20 meter in stappen van 0,1 meter.');
   if(!inStep(trip.vehicleWeightKg,inputLimits.vehicleWeightKg))errors.push('Kies een totaalgewicht van 1.500 tot 20.000 kilogram in stappen van 50 kilogram.');
 }
 return errors
}
export function getFormElements(root=document){return Object.fromEntries(FIELD_IDS.map(id=>[id,root.getElementById(id)]))}
export function readTripForm(existing=null,root=document){const form=getFormElements(root),existingTrip=existing&&typeof existing==='object'?existing:null,preferences=[...root.querySelectorAll('[data-pref]:checked')].map(element=>element.value),preferenceWeights=Object.fromEntries(preferences.map(id=>[id,Number(root.querySelector(`[data-priority="${id}"]`)?.value||2)])),values=Object.fromEntries(Object.entries(form).map(([key,element])=>[key,element?.type==='checkbox'?element.checked:element?.value]));return normalizeTrip({id:existingTrip?.id||existing||undefined,...values,travelMode:'direct',originPoint:existingTrip?.origin===values.origin?existingTrip.originPoint:null,destinationPoint:existingTrip?.destinationQuery===values.destinationQuery?existingTrip.destinationPoint:null,preferences,preferenceWeights})}
export function writeTripForm(trip={},root=document){const form=getFormElements(root);for(const[key,element]of Object.entries(form)){if(!element||trip[key]===undefined||trip[key]===null)continue;if(element.type==='checkbox')element.checked=Boolean(trip[key]);else element.value=String(trip[key])}root.querySelectorAll('[data-pref]').forEach(box=>{box.checked=trip.preferences?.includes(box.value)||false});root.querySelectorAll('[data-priority]').forEach(select=>{const selected=root.querySelector(`[data-pref][value="${select.dataset.priority}"]`)?.checked;select.value=String(trip.preferenceWeights?.[select.dataset.priority]||2);select.disabled=!selected})}
