import { destinations } from './destinations.js';
import { normalizeTrip } from './trip-model.js';
import { buildProposalPortfolio } from './proposal-engine.js';
const trip=normalizeTrip({origin:'Saasveld', originPoint:{lat:52.33,lon:6.81,name:'Saasveld'}, startDate:'2026-09-20',days:7,budget:2500,adults:2,children:0,transport:'motorcycle',maxDrive:5,maxChanges:4,comfort:'mid',strictBudget:true,strictDrive:true,strictChanges:true,allowStretch:true,liveData:true,preferences:['cultuur'],preferenceWeights:{cultuur:2},routeTopology:'loop',tripPace:'balanced',routeStyle:'balanced',fuelRangeKm:260});
console.time('portfolio');
const r=buildProposalPortfolio(trip,destinations,{limit:8,focus:'balanced',preferenceProfile:{weights:{},privateMode:false}});
console.timeEnd('portfolio');
console.log(destinations.length,r.visible.length,r.exact.length,r.stretched.length,r.rejected.length);
