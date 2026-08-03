export const preferenceDefinitions = [
  ['natuur','Natuur'],['bergen','Bergen'],['zwemmen','Zwemmen'],['wandelen','Wandelen'],
  ['kinderen','Kindvriendelijk'],['motor','Mooie wegen'],['cultuur','Cultuur'],['eten','Eten'],
  ['kust','Kust'],['budget','Budget']
];

export function readTripForm() {
  const selected = [...document.querySelectorAll('[data-pref]:checked')].map(x => x.value);
  return {
    id: crypto.randomUUID(), origin: origin.value.trim(), startDate: startDate.value,
    days: Number(days.value), budget: Number(budget.value), adults: Number(adults.value),
    children: Number(children.value), transport: transport.value, maxDrive: Number(maxDrive.value),
    maxChanges: Number(maxChanges.value), comfort: comfort.value, notes: notes.value.trim(), preferences:selected
  };
}
