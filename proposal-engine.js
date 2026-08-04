import { rankDestinationGroups } from './destination-engine.js';
import { preferenceBonus } from './preference-engine.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const band = (value, size) => Math.floor(Number(value || 0) / size);
const overlap = (left = [], right = []) => {
  const a = new Set(left); const b = new Set(right);
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter(item => b.has(item)).length / union.size : 0;
};

const focusProfiles = Object.freeze({
  balanced: { label: 'Beste mix', keys: [] },
  closer: { label: 'Dichterbij', keys: ['driving'] },
  cheaper: { label: 'Voordeliger', keys: ['budget'] },
  surprising: { label: 'Meer verrassend', keys: ['crowds', 'scenery'] },
  family: { label: 'Gezinsvriendelijk', keys: ['family'] },
  scenic: { label: 'Mooiste route', keys: ['scenery', 'motorcycle'] }
});

function primaryStyle(item, trip) {
  if (trip.transport === 'motorcycle' && item.motorcycle >= 8) return ['Beste motorroute', 'Bochtige wegen, vaste ruststops en motorvriendelijke overnachting'];
  if (['motorhome', 'caravan'].includes(trip.transport) && item.camper >= 8) return ['Beste voor camper', 'Makkelijke aanrijroutes, passende standplaatsen en beperkte wissels'];
  if (trip.children && item.family >= 9) return ['Beste voor gezinnen', 'Korte dagafstanden, kindvriendelijke stops en regenalternatieven'];
  if (item.distanceKm <= 400) return ['Makkelijkste reis', 'Weinig aanreisbelasting en veel ruimte om onderweg bij te sturen'];
  if (item.tags.includes('budget')) return ['Beste prijs-kwaliteit', 'Een sterke inhoudelijke reis zonder het budget onnodig op te rekken'];
  if (item.crowds >= 8) return ['Rustige ontdekking', 'Minder drukke bases met natuur en lokale stops'];
  if (item.weather >= 8) return ['Meest weerbestendig', 'Veel bruikbare alternatieven wanneer het weer omslaat'];
  return ['Beste totaalbalans', 'Goede balans tussen route, verblijf, activiteiten en kosten'];
}

function focusBonus(item, focus) {
  if (focus === 'closer') return Math.max(0, 12 - item.distanceKm / 90);
  if (focus === 'cheaper') return Math.max(0, (100 - item.dimensions.budget) * -.04 + 6);
  if (focus === 'surprising') return (item.crowds || 5) * .45 + (item.evidence?.anchors ? Math.min(4, item.evidence.anchors / 10) : 0);
  if (focus === 'family') return (item.dimensions.family || item.family * 10 || 50) * .06;
  if (focus === 'scenic') return (item.dimensions.scenery || 50) * .05 + (item.dimensions.motorcycle || 50) * .02;
  return 0;
}

function explainTradeoff(item) {
  if (item.category === 'stretch') return item.constraintStatus.summary;
  if (item.distanceKm > 850) return 'Meer aanreis dan de dichtbij-opties; de dagindeling reserveert daarvoor extra reisruimte.';
  if (item.weather <= 6) return 'Wisselvalliger weer; elk verblijfsblok krijgt daarom een bruikbaar binnenalternatief.';
  if (item.crowds <= 6) return 'Populaire regio; vroeg starten en een rustiger tweede basisgebied voorkomt piekdrukte.';
  if (item.dimensions.budget < 70) return 'Relatief kostbaar; de raming bewaakt comfort, horeca en onvoorzien afzonderlijk.';
  return 'Geen harde overschrijding; prijzen en beschikbaarheid blijven wel indicatief.';
}

function proposalFromDestination(item, trip, focus, learnedProfile = null) {
  const [label, labelReason] = primaryStyle(item, trip);
  const learned = preferenceBonus(item, learnedProfile);
  const bases = item.bases?.length || 1;
  const recommendedBases = trip.routeTopology === 'open-jaw' ? Math.min(2, bases) : Math.max(1, Math.min(bases, trip.maxChanges <= 2 ? 1 : trip.days >= 10 ? 3 : 2));
  return {
    ...item,
    proposalId: item.id,
    destinationId: item.id,
    proposalLabel: label,
    labelReason,
    focusLabel: focusProfiles[focus]?.label || focusProfiles.balanced.label,
    portfolioScore: item.score + focusBonus(item, focus) + learned.score,
    learnedPreferenceReasons: learned.reasons,
    recommendedBases,
    routeCharacter: trip.travelMode !== 'direct' ? `${trip.travelMode} met lokale ${trip.routeTopology === 'open-jaw' ? 'open-jaw route' : 'rondreis'}` : trip.routeStyle === 'scenic' ? 'toeristische route met uitzichtstops' : trip.routeStyle === 'fastest' ? 'efficiënte hoofdroute' : 'gebalanceerde route met zinvolle tussenstops',
    tripShape: `${recommendedBases} uitvalsbasis${recommendedBases === 1 ? '' : 'sen'} · ${trip.days} dagen · ${item.constraintStatus.travelLegs * 2} reisetappes`,
    keyTradeoff: explainTradeoff(item),
    evidence: [
      `${item.evidence?.anchors || 0} providerankers en ${item.evidence?.highlights || 0} highlights`,
      `${item.bases.length} dynamisch afgeleide mogelijke uitvalsbases`,
      `Voertuigscore ${item.dimensions.transport}/100; neutrale velden: ${(item.evidence?.neutralFields || []).join(', ') || 'geen'}`
    ],
    sourceLabel: item.provider?.confidence
      ? `Dynamisch ontdekt via ${item.discoverySource}; vertrouwen ${item.provider.confidence}, ${item.discoveryCache?.cached ? `exacte cache van ${Math.round(item.discoveryCache.ageMs / 3600000)} uur oud` : `opgehaald ${item.provider.fetchedAt || item.discoveredAt}`}`
      : 'Opnieuw opgebouwd uit eerder opgeslagen canoniek providerbewijs'
  };
}

export function proposalDifference(left, right) {
  if (!left || !right || left.destinationId === right.destinationId) return 0;
  const geography = left.country === right.country ? .45 : 1;
  const distance = Math.min(1, Math.abs(left.distanceKm - right.distanceKm) / 700);
  const cost = Math.min(1, Math.abs(left.estimate - right.estimate) / 1800);
  const tags = 1 - overlap(left.tags, right.tags);
  const baseShape = left.recommendedBases === right.recommendedBases ? .25 : 1;
  return clamp01(geography * .25 + distance * .2 + cost * .15 + tags * .3 + baseShape * .1);
}

export function nearDuplicate(left, right) {
  if (!left || !right) return false;
  if (left.destinationId === right.destinationId) return true;
  return band(left.distanceKm, 120) === band(right.distanceKm, 120)
    && band(left.estimate, 500) === band(right.estimate, 500)
    && overlap(left.tags, right.tags) >= .8
    && left.country === right.country;
}

export function selectDiversePortfolio(candidates, { limit = 8, excludedIds = [] } = {}) {
  const excluded = new Set(excludedIds);
  const pool = candidates.filter(item => !excluded.has(item.id) && !excluded.has(item.proposalId));
  const selected = [];
  while (pool.length && selected.length < limit) {
    const ranked = pool.map(candidate => {
      const minDifference = selected.length ? Math.min(...selected.map(existing => proposalDifference(candidate, existing))) : 1;
      const duplicatePenalty = selected.some(existing => nearDuplicate(candidate, existing)) ? 24 : 0;
      return { candidate, merit: candidate.portfolioScore * .72 + minDifference * 28 - duplicatePenalty };
    }).sort((a, b) => b.merit - a.merit || b.candidate.score - a.candidate.score || a.candidate.id.localeCompare(b.candidate.id));
    const winner = ranked[0].candidate;
    selected.push(winner);
    pool.splice(pool.indexOf(winner), 1);
  }
  return selected;
}

export function buildProposalPortfolio(trip, catalog, { limit = 8, focus = 'balanced', excludedIds = [], preferenceProfile = null } = {}) {
  const ranking = rankDestinationGroups(trip, catalog);
  const requestedMismatch = ranking.rejected.find(item => item.intentMatch) || null;
  const candidates = [...ranking.exact, ...ranking.stretched].map(item => proposalFromDestination(item, trip, focus, preferenceProfile));
  const visible = selectDiversePortfolio(candidates, { limit: Math.min(12, limit), excludedIds });
  const exact = visible.filter(item => item.category === 'exact');
  const stretched = visible.filter(item => item.category === 'stretch').slice(0, 2);
  const accepted = [...exact, ...stretched];
  const shortage = accepted.length >= 6 ? null : {
    requested: 6,
    available: accepted.length,
    explanation: `Er zijn ${accepted.length} onderscheidende reizen die nu selecteerbaar zijn. ReisSlim vult de lijst niet aan met dubbelen of plannen buiten je harde voorwaarden.`,
    relaxations: ranking.closestAdjustments.slice(0, 3)
  };
  return {
    ...ranking,
    exact: accepted.filter(item => item.category === 'exact'),
    stretched: accepted.filter(item => item.category === 'stretch'),
    visible: accepted,
    candidates,
    shortage, requestedMismatch,
    focus,
    focusOptions: focusProfiles
  };
}

export function getMoreProposals(trip, catalog, shownIds, { limit = 4, focus = 'balanced', preferenceProfile = null } = {}) {
  return buildProposalPortfolio(trip, catalog, { limit, focus, excludedIds: shownIds, preferenceProfile }).visible;
}
