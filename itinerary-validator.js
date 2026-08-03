export function validateTrip(trip,destination,itinerary,budget){
  const maxDrive=Math.max(...itinerary.map(d=>d.driveHours));
  const locations=new Set(itinerary.map(d=>d.location));
  return [
    {level:budget.total<=trip.budget?'ok':budget.total<=trip.budget*1.1?'warn':'bad',label:'Budget',detail:`€${budget.total.toLocaleString('nl-NL')} van €${trip.budget.toLocaleString('nl-NL')}`},
    {level:maxDrive<=trip.maxDrive?'ok':'bad',label:'Max. rijtijd',detail:`${maxDrive.toFixed(1)} uur`},
    {level:locations.size-1<=trip.maxChanges?'ok':'warn',label:'Accommodatiewissels',detail:`circa ${Math.max(1,locations.size-1)}`},
    {level:destination.budgetRatio<=1.05?'ok':'warn',label:'Prijszekerheid',detail:'Indicatief, live prijzen nog niet gekoppeld'},
    {level:'warn',label:'Broncontrole',detail:'Openingstijden, beschikbaarheid en reisadvies nog extern verifiëren'}
  ];
}
