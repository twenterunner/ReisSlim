const intents = [
  { id: 'relax', patterns: [/rustiger/i, /minder druk/i, /meer rust/i], patch: { optimizerMode: 'relaxed' }, summary: 'Maak de reis rustiger met meer herstelruimte.' },
  { id: 'value', patterns: [/goedkoper/i, /budget/i, /kosten lager/i], patch: { optimizerMode: 'value' }, summary: 'Zoek lagere kosten zonder het budget automatisch te verhogen.' },
  { id: 'active', patterns: [/actiever/i, /meer doen/i, /avontuur/i], patch: { optimizerMode: 'active' }, summary: 'Vergroot de activiteitenmix binnen de daglimieten.' },
  { id: 'scenic', patterns: [/mooie route/i, /toeristisch/i, /landschap/i], patch: { routeStyle: 'scenic' }, summary: 'Geef landschappelijke routes meer gewicht.' },
  { id: 'fewer-changes', patterns: [/minder wissel/i, /zelfde hotel/i, /vaste basis/i], patch: { maxChangesDelta: -1, optimizerMode: 'relaxed' }, summary: 'Verminder accommodatiewissels en werk met een vastere basis.' },
  { id: 'more-days', patterns: [/dag langer/i, /meer dagen/i], patch: { daysDelta: 1 }, summary: 'Voeg één dag toe om de reisbelasting te verlagen.' }
];

export function interpretAssistantMessage(message, trip) {
  const text = String(message || '').trim();
  if (!text) return { understood: false, message: 'Beschrijf één wijziging, bijvoorbeeld “maak de reis rustiger”.' };
  const intent = intents.find(candidate => candidate.patterns.some(pattern => pattern.test(text)));
  if (!intent) return { understood: false, message: 'Ik kan nu rust, kosten, activiteit, routestijl, dagen en accommodatiewissels aanpassen. Ik wijzig niets zonder een herkenbare opdracht.' };
  const patch = { ...intent.patch };
  if (patch.daysDelta) patch.days = Math.max(3, Math.min(60, Number(trip.days) + patch.daysDelta));
  if (patch.maxChangesDelta) patch.maxChanges = Math.max(0, Number(trip.maxChanges) + patch.maxChangesDelta);
  delete patch.daysDelta; delete patch.maxChangesDelta;
  return { understood: true, intent: intent.id, summary: intent.summary, patch, requiresConfirmation: true };
}

export function applyAssistantPatch(trip, patch) {
  const allowed = ['days', 'maxChanges', 'routeStyle'];
  return { ...trip, ...Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key))) };
}
