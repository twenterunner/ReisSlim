export function buildItinerary(trip,destination){
  const stops = destination.stops;
  const days=[];
  for(let i=0;i<trip.days;i++){
    let stopIndex=Math.round((i/(trip.days-1))*(stops.length-1));
    if(i>trip.days/2) stopIndex=Math.max(0,Math.round(((trip.days-1-i)/(trip.days-1))*(stops.length-1)));
    if(i===trip.days-1) stopIndex=0;
    const stop=stops[stopIndex];
    const travelDay=i===0||i===trip.days-1||i%3===0;
    days.push({day:i+1,date:addDays(trip.startDate,i),location:stop[0],lat:stop[1],lon:stop[2],title:travelDay?'Reis- en ontdekdag':'Verblijfsdag',description:travelDay?`Rijd richting ${stop[0]}, plan een ruime pauze en houd de middag licht.`:`Verken ${stop[0]} en omgeving. Kies één hoofdactiviteit en houd een weerbestendig alternatief achter de hand.`,driveHours:travelDay?Math.min(trip.maxDrive, i===0?destination.driveHours/2.2:2.5):.5});
  }
  return days;
}
function addDays(dateString,n){const d=new Date(dateString+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
