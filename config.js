export const VERSION = '2.0.0';
export const BUILD = '2000';
export const ENGINE_VERSION = 200;
export const STORAGE_SCHEMA_VERSION = 8;
export const DATASET_VERSION = '2026.08.31.1';
export const CANONICAL_ENGINE_ID = 'reisslim-canonical-offline-v1';

export const EU27 = Object.freeze(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);
export const inputLimits = Object.freeze({
  days:{min:1,max:60,step:1}, budget:{min:500,max:100000,step:100}, adults:{min:1,max:8,step:1}, children:{min:0,max:8,step:1},
  maxDrive:{min:2,max:10,step:.5}, maxChanges:{min:0,max:20,step:1}, fuelRangeKm:{min:100,max:1500,step:10},
  vehicleMaxSpeedKmh:{min:60,max:130,step:5}, vehicleHeightM:{min:1.8,max:4.5,step:.05}, vehicleLengthM:{min:4,max:20,step:.1}, vehicleWeightKg:{min:1500,max:20000,step:50}
});
export const enums = Object.freeze({
  transport:['car','motorcycle','motorhome','caravan'], tripStructure:['moving','base'], routeTopology:['loop','out-and-back','open-ended'],
  tripPace:['relaxed','balanced','active'], accommodationType:['any','camping','hotel-bnb'], comfort:['budget','mid','comfort'], routeStyle:['balanced','fastest','scenic']
});
export const preferenceDefinitions = Object.freeze([
  ['natuur','Natuur'],['bergen','Bergen'],['zwemmen','Zwemmen'],['wandelen','Wandelen'],['kinderen','Kindvriendelijk'],['motor','Mooie wegen'],['cultuur','Cultuur'],['eten','Eten'],['kust','Kust'],['budget','Budget']
]);
export const vehicleProfiles = Object.freeze({
  car:{label:'Auto',roadSpeed:78,localSpeed:48,breakEveryHours:2.25,breakMinutes:15,defaultFuelRangeKm:650,roadFactor:1.18},
  motorcycle:{label:'Motor',roadSpeed:72,localSpeed:52,breakEveryHours:1.5,breakMinutes:20,defaultFuelRangeKm:350,roadFactor:1.16},
  motorhome:{label:'Camper / motorhome',roadSpeed:64,localSpeed:42,breakEveryHours:2,breakMinutes:20,defaultFuelRangeKm:520,roadFactor:1.22},
  caravan:{label:'Auto met caravan',roadSpeed:60,localSpeed:40,breakEveryHours:1.75,breakMinutes:20,defaultFuelRangeKm:460,roadFactor:1.24}
});
export const providerConfig = Object.freeze({routingTimeoutMs:6500,poiTimeoutMs:5500,accommodationTimeoutMs:5500,weatherTimeoutMs:4500,imageTimeoutMs:4500});
export function validCoordinate(p){return Boolean(p)&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lon))<=180}
