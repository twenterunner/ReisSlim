import { STORAGE_SCHEMA_VERSION, VERSION } from './config.js';
import { validateCanonicalPlan } from './validator.js';
const KEY='reisslim.v2.trips';
export function serializeTrip(plan){return JSON.stringify({schemaVersion:STORAGE_SCHEMA_VERSION,appVersion:VERSION,savedAt:new Date().toISOString(),plan})}
export function deserializeTrip(text){const x=JSON.parse(text);if(x.schemaVersion!==STORAGE_SCHEMA_VERSION)throw new Error('STORAGE_SCHEMA_MISMATCH');const v=validateCanonicalPlan(x.plan);if(!v.valid)throw Object.assign(new Error('STORED_PLAN_INVALID'),{validation:v});x.plan.validation=v;return x.plan}
export function loadTrips(storage=localStorage){try{return JSON.parse(storage.getItem(KEY)||'[]').map(x=>{try{return deserializeTrip(x)}catch{return null}}).filter(Boolean)}catch{return[]}}
export function saveTrip(plan,storage=localStorage){const current=loadTrips(storage).filter(p=>p.createdAt!==plan.createdAt);current.unshift(plan);storage.setItem(KEY,JSON.stringify(current.slice(0,25).map(serializeTrip)));return current}
export function deleteTrip(createdAt,storage=localStorage){const current=loadTrips(storage).filter(p=>p.createdAt!==createdAt);storage.setItem(KEY,JSON.stringify(current.map(serializeTrip)));return current}
export class MemoryStorage{constructor(){this.m=new Map()}getItem(k){return this.m.get(k)??null}setItem(k,v){this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}}
