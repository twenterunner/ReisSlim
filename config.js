export const VERSION = '1.16.4';
export const BUILD = '1954';
export const ENGINE_VERSION = 84;
export const STORAGE_SCHEMA_VERSION = 7;

export const inputLimits=Object.freeze({
  days:Object.freeze({min:1,max:60,step:1}),
  budget:Object.freeze({min:500,max:null,step:100}),
  adults:Object.freeze({min:1,max:8,step:1}),
  children:Object.freeze({min:0,max:8,step:1}),
  maxDrive:Object.freeze({min:2,max:10,step:.5}),
  maxChanges:Object.freeze({min:0,max:20,step:1,movingMin:1}),
  fuelRangeKm:Object.freeze({min:100,max:1500,step:10}),
  vehicleMaxSpeedKmh:Object.freeze({min:60,max:130,step:5}),
  vehicleHeightM:Object.freeze({min:1.8,max:4.5,step:.05}),
  vehicleLengthM:Object.freeze({min:4,max:20,step:.1}),
  vehicleWeightKg:Object.freeze({min:1500,max:20000,step:50}),
  tripName:Object.freeze({maxLength:60}),
  destinationQuery:Object.freeze({maxLength:100}),
  notes:Object.freeze({maxLength:500})
});
export const preferenceDefinitions=[['natuur','Natuur'],['bergen','Bergen'],['zwemmen','Zwemmen'],['wandelen','Wandelen'],['kinderen','Kindvriendelijk'],['motor','Mooie wegen'],['cultuur','Cultuur'],['eten','Eten'],['kust','Kust'],['budget','Budget']];
export const transportProfiles={
car:{label:'Auto',routeMode:'car',consumption:7.2,roadTimeFactor:1,breakEveryHours:2.25,breakMinutes:15,fuelStopMinutes:12,defaultFuelRangeKm:650,arrivalBufferMinutes:10,parkingDaily:10,tollFactor:1,accommodationFactor:1,supportsDimensions:false,accommodationLabel:'hotel of appartement met passende parking'},
motorcycle:{label:'Motor',routeMode:'motorcycle',consumption:4.8,roadTimeFactor:1.05,breakEveryHours:1.5,breakMinutes:20,fuelStopMinutes:12,defaultFuelRangeKm:350,arrivalBufferMinutes:15,parkingDaily:5,tollFactor:.65,accommodationFactor:.94,supportsDimensions:false,weatherReserveMinutesPerHour:5,accommodationLabel:'motorvriendelijk verblijf met veilige, liefst overdekte parking'},
motorhome:{label:'Camper / motorhome',routeMode:'truck',consumption:11.5,roadTimeFactor:1.12,breakEveryHours:2,breakMinutes:20,fuelStopMinutes:18,defaultFuelRangeKm:520,arrivalBufferMinutes:35,parkingDaily:16,tollFactor:1.3,accommodationFactor:.34,supportsDimensions:true,defaultHeightM:3.1,defaultLengthM:7.2,defaultWeightKg:3500,defaultMaxSpeedKmh:100,accommodationLabel:'camperplaats of camping met stroom, water en servicevoorzieningen'},
caravan:{label:'Auto met caravan',routeMode:'truck',consumption:12.5,roadTimeFactor:1.18,breakEveryHours:1.75,breakMinutes:20,fuelStopMinutes:20,defaultFuelRangeKm:460,arrivalBufferMinutes:45,parkingDaily:14,tollFactor:1.4,accommodationFactor:.3,supportsDimensions:true,defaultHeightM:2.7,defaultLengthM:11.5,defaultWeightKg:3200,defaultMaxSpeedKmh:90,accommodationLabel:'caravancamping met ruime standplaats en eenvoudige manoeuvreertoegang'}};
export const routeStyles={balanced:{label:'Gebalanceerd',description:'Een praktische route met ruimte voor prettige stops.'},fastest:{label:'Snelste',description:'Minimaliseer reistijd en omwegen.'},scenic:{label:'Toeristisch',description:'Geef mooie wegen en uitzichtpunten extra gewicht.'}};
export const routingConfig={apiUrl:'',requestTimeoutMs:7000,providerLabel:'OSRM live routing'};
export const budgetAssumptions={fuelPricePerLitre:1.88,childEquivalent:.6,peoplePerRoom:3.5,groceriesPerEquivalentDay:16,restaurantPerEquivalentDay:42,restaurantShare:{budget:.25,mid:.5,comfort:.72},comfortFactor:{budget:.8,mid:1,comfort:1.35},contingencyRate:.07,minimumContingency:50};
export const originCatalog={saasveld:{name:'Saasveld',lat:52.33,lon:6.81},amsterdam:{name:'Amsterdam',lat:52.3676,lon:4.9041},rotterdam:{name:'Rotterdam',lat:51.9244,lon:4.4777},utrecht:{name:'Utrecht',lat:52.0907,lon:5.1214},eindhoven:{name:'Eindhoven',lat:51.4416,lon:5.4697},groningen:{name:'Groningen',lat:53.2194,lon:6.5665},maastricht:{name:'Maastricht',lat:50.8514,lon:5.691},zwolle:{name:'Zwolle',lat:52.5168,lon:6.083},enschede:{name:'Enschede',lat:52.2215,lon:6.8937},hengelo:{name:'Hengelo',lat:52.2574,lon:6.7928},almelo:{name:'Almelo',lat:52.3566,lon:6.6625},arnhem:{name:'Arnhem',lat:51.9851,lon:5.8987},nijmegen:{name:'Nijmegen',lat:51.8426,lon:5.8546}};
export const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));export const roundScore=value=>Math.round(clamp(value)/5)*5;export const roundMoney=value=>Math.round(Number(value)||0);export const validCoordinate=point=>Boolean(point)&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)&&Math.abs(point.lat)<=90&&Math.abs(point.lon)<=180;
