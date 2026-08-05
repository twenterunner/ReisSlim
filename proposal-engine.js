import { rankDestinationGroups } from './destination-engine.js';
import { preferenceBonus } from './preference-engine.js';

const clamp01 = value => Math.max(0, Math.min(1, value));
const overlap = (left = [], right = []) => {
  const a = new Set(left.map(value => String(value || '').trim().toLocaleLowerCase('nl-NL')).filter(Boolean));
  const b = new Set(right.map(value => String(value || '').trim().toLocaleLowerCase('nl-NL')).filter(Boolean));
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter(item => b.has(item)).length / union.size : 0;
};
const normalize = value => String(value || '').trim().toLocaleLowerCase('nl-NL');

function structuralProfile(item) {
  const supplied = item?.planStructure || {};
  const bases = supplied.bases?.length ? supplied.bases : (item?.bases || []).map(base => base.id || base.name);
  const highlights = supplied.highlights?.length ? supplied.highlights : (item?.highlights || []).map(highlight => highlight.id || highlight.name);
  const gateway = supplied.gateway || item?.gateway?.id || item?.gateway?.name || item?.bases?.[0]?.name || '';
  const corridors = supplied.corridors?.length ? supplied.corridors : (item?.routeStops || []).slice(1).map((stop, index) => {
    const previous = item.routeStops[index];
    return [normalize(previous?.name), normalize(stop?.name)].filter(Boolean).sort().join('>');
  });
  const points = (item?.bases || []).filter(point => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)));
  const centroid = points.length ? {
    lat: points.reduce((sum, point) => sum + Number(point.lat), 0) / points.length,
    lon: points.reduce((sum, point) => sum + Number(point.lon), 0) / points.length
  } : null;
  const geographicBand = centroid ? `${Math.floor(centroid.lat / 4)}:${Math.floor(centroid.lon / 4)}` : '';
  return {
    macroRegion: normalize(supplied.macroRegion || item?.regionId || item?.clusterId || `${item?.country || ''}:${geographicBand}`),
    country: normalize(supplied.country || item?.country),
    gateway: normalize(gateway),
    bases: bases.map(normalize).filter(Boolean),
    highlights: highlights.map(normalize).filter(Boolean),
    corridors: corridors.map(normalize).filter(Boolean),
    topology: normalize(supplied.topology || item?.routeTopology)
  };
}

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
  const canonicalBases = [...new Set((item.planStructure?.bases || []).map(normalize).filter(Boolean))].length;
  const recommendedBases = canonicalBases || (trip.routeTopology === 'open-jaw'
    ? Math.min(2, bases)
    : Math.max(1, Math.min(bases, trip.maxChanges <= 2 ? 1 : trip.days >= 10 ? 3 : 2)));
  const suppliedRouteDays = item.planStructure?.routeDays;
  const routeDays = suppliedRouteDays !== null && suppliedRouteDays !== undefined && Number.isFinite(Number(suppliedRouteDays))
    ? Math.max(0, Math.round(Number(suppliedRouteDays)))
    : Math.max(0, Number(item.constraintStatus?.travelLegs || 0) * 2);
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
    routeDays,
    routeCharacter: trip.travelMode !== 'direct' ? `${trip.travelMode} met lokale ${trip.routeTopology === 'open-jaw' ? 'open-jaw route' : 'rondreis'}` : trip.routeStyle === 'scenic' ? 'toeristische route met uitzichtstops' : trip.routeStyle === 'fastest' ? 'efficiënte hoofdroute' : 'gebalanceerde route met zinvolle tussenstops',
    tripShape: `${recommendedBases} uitvalsbasis${recommendedBases === 1 ? '' : 'sen'} · ${trip.days} dagen · ${routeDays} reisetappes`,
    keyTradeoff: explainTradeoff(item),
    evidence: [
      `${item.evidence?.anchors || 0} ${item.catalogue ? 'catalogusankers' : 'providerankers'} en ${item.evidence?.highlights || 0} highlights`,
      `${item.bases.length} ${item.catalogue ? 'bronvermelde catalogusuitvalsbases' : 'dynamisch afgeleide uitvalsbases'}`,
      `Voertuigscore ${item.dimensions.transport}/100; neutrale velden: ${(item.evidence?.neutralFields || []).join(', ') || 'geen'}`,
      ...(item.routeFeasibility ? [`Routebewijs ${item.routeFeasibility.status}: ${item.routeFeasibility.summary}`] : [])
    ],
    sourceLabel: item.catalogue
      ? `ReisSlim touringcatalogus ${item.catalogVersion || ''}; brondata ${item.lastChecked || item.provider?.fetchedAt || 'datum onbekend'}, vertrouwen ${item.provider?.confidence || item.confidence || 'beperkt'}`
      : item.provider?.confidence
      ? `Dynamisch ontdekt via ${item.discoverySource}; vertrouwen ${item.provider.confidence}, ${item.discoveryCache?.cached ? `exacte cache van ${Math.round(item.discoveryCache.ageMs / 3600000)} uur oud` : `opgehaald ${item.provider.fetchedAt || item.discoveredAt}`}`
      : 'Opnieuw opgebouwd uit eerder opgeslagen canoniek providerbewijs'
  };
}

export function proposalDifference(left, right) {
  if (!left || !right || left.destinationId === right.destinationId) return 0;
  const a = structuralProfile(left);
  const b = structuralProfile(right);
  const macroRegion = a.macroRegion && b.macroRegion && a.macroRegion === b.macroRegion ? 0 : a.country && a.country === b.country ? .55 : 1;
  const gateway = a.gateway && b.gateway ? (a.gateway === b.gateway ? 0 : 1) : .5;
  const bases = a.bases.length || b.bases.length ? 1 - overlap(a.bases, b.bases) : .5;
  const highlights = a.highlights.length || b.highlights.length ? 1 - overlap(a.highlights, b.highlights) : .5;
  const corridors = a.corridors.length || b.corridors.length ? 1 - overlap(a.corridors, b.corridors) : .5;
  return clamp01(macroRegion * .24 + gateway * .16 + bases * .24 + highlights * .2 + corridors * .16);
}

export function nearDuplicate(left, right) {
  if (!left || !right) return false;
  if (left.destinationId === right.destinationId) return true;
  const a = structuralProfile(left);
  const b = structuralProfile(right);
  const sameMacro = Boolean(a.macroRegion && b.macroRegion && a.macroRegion === b.macroRegion);
  const sameGateway = Boolean(a.gateway && b.gateway && a.gateway === b.gateway);
  const baseOverlap = overlap(a.bases, b.bases);
  const highlightOverlap = overlap(a.highlights, b.highlights);
  const corridorOverlap = overlap(a.corridors, b.corridors);
  return sameMacro
    && sameGateway
    && baseOverlap >= .65
    && (highlightOverlap >= .6 || corridorOverlap >= .65);
}

export function selectDiversePortfolio(candidates, { limit = 8, excludedIds = [] } = {}) {
  const excluded = new Set(excludedIds);
  const pool = candidates.filter(item => !excluded.has(item.id) && !excluded.has(item.proposalId));
  const selected = [];
  while (pool.length && selected.length < limit) {
    const structurallyDistinct = pool.filter(candidate => !selected.some(existing => nearDuplicate(candidate, existing)));
    if (!structurallyDistinct.length) break;
    const ranked = structurallyDistinct.map(candidate => {
      const minDifference = selected.length ? Math.min(...selected.map(existing => proposalDifference(candidate, existing))) : 1;
      return { candidate, merit: candidate.portfolioScore * .68 + minDifference * 32 };
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
