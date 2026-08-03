export function buildBudget(trip,destination){
  const nights=trip.days-1,people=trip.adults+trip.children*.6,roomFactor=Math.max(1,Math.ceil((trip.adults+trip.children)/4));
  const comfortFactor=trip.comfort==='budget'?.78:trip.comfort==='comfort'?1.28:1;
  const accommodation=Math.round(nights*destination.nightMid*roomFactor*comfortFactor);
  const food=Math.round(trip.days*destination.foodDaily*(people/3.2));
  const activities=Math.round(trip.days*destination.activityDaily*(people/3.2));
  const consumption=trip.transport==='motorcycle'?4.8:trip.transport==='camper'?10.5:7.2;
  const fuel=Math.round((destination.distanceKm*2+trip.days*85)/100*consumption*1.95);
  const contingency=200;
  const rows=[['Accommodatie',accommodation],['Eten & drinken',food],['Activiteiten',activities],['Brandstof',fuel],['Tol & vignetten',destination.toll],['Buffer',contingency]];
  return {rows,total:rows.reduce((a,r)=>a+r[1],0)};
}
