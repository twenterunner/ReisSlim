const FEATURE_SIGNIFICANCE = Object.freeze({
  PPLC: 66, PPLA: 62, PPLA2: 58, PPLA3: 54, PPLG: 58,
  PRK: 74, RESN: 72, PK: 66, MT: 61, PASS: 67, CAPE: 58, BAY: 56,
  LK: 59, FLLS: 68, GLCR: 72, CNYN: 72, VLC: 72, ISL: 62,
  CSTL: 68, PAL: 66, MUS: 60, MNMT: 63, MONU: 63, ARCH: 64, CAVE: 59,
  SPA: 52, BCH: 54, ANS: 67, RUIN: 66, HSTS: 65, OBPT: 59, LTHSE: 58,
  GDN: 53, ZOO: 53, FT: 63, AMTH: 59, PPLQ: 62, AIRP: 58, PAN: 76,
  HLL: 62, DUNE: 72, RK: 62, VAL: 57, AREA: 52, HBR: 57
});

const ADMINISTRATIVE_SETTLEMENTS = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLG']);

function normalizedName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function alternateNameCount(record) {
  return String(record?.alternateNames || '').split(',').map(value => value.trim()).filter(Boolean).length;
}

function radians(value) {
  return value * Math.PI / 180;
}

export function recordDistanceKm(first, second) {
  const dLat = radians(Number(second.lat) - Number(first.lat));
  const dLon = radians(Number(second.lon) - Number(first.lon));
  const lat1 = radians(Number(first.lat));
  const lat2 = radians(Number(second.lat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isSettlement(record) {
  return record?.featureClass === 'P' && record?.featureCode !== 'PPLQ';
}

export function significanceScore(record) {
  const featureEvidence = FEATURE_SIGNIFICANCE[record?.featureCode]
    ?? (isSettlement(record) ? (record?.featureCode === 'PPLX' ? 12 : 36) : 22);
  const population = Math.max(0, Number(record?.population) || 0);
  const populationEvidence = population > 0 ? Math.min(24, Math.log10(population + 1) * 4) : 0;
  const namingEvidence = Math.min(8, Math.log2(alternateNameCount(record) + 1) * 2);
  const nearbyEvidence = Math.min(10, Math.log2(Math.max(0, Number(record?.nearbyRecommendationCount) || 0) + 1) * 2.5);
  return Math.min(100, Math.round(featureEvidence + populationEvidence + namingEvidence + nearbyEvidence));
}

function metroSeparationKm(record) {
  const population = Math.max(0, Number(record?.population) || 0);
  if (ADMINISTRATIVE_SETTLEMENTS.has(record?.featureCode) || population >= 1_000_000) return 24;
  if (population >= 300_000) return 20;
  if (population >= 100_000) return 15;
  return 9;
}

function deduplicateSpatially(records) {
  const retained = [];
  const settlementGrid = new Map();
  const settlementNameGrid = new Map();
  const touringNameGrid = new Map();
  const cell = record => `${Math.floor(Number(record.lat))}:${Math.floor(Number(record.lon))}`;
  const nearbyFromGrid = (grid, record, cellSize, range, prefix = '') => {
    const row = Math.floor(Number(record.lat) / cellSize);
    const column = Math.floor(Number(record.lon) / cellSize);
    const nearby = [];
    for (let latOffset = -range; latOffset <= range; latOffset += 1) {
      for (let lonOffset = -range; lonOffset <= range; lonOffset += 1) {
        nearby.push(...(grid.get(`${prefix}${row + latOffset}:${column + lonOffset}`) || []));
      }
    }
    return nearby;
  };
  const addToGrid = (grid, key, record) => {
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(record);
  };
  for (const record of records) {
    const name = normalizedName(record.name);
    if (isSettlement(record)) {
      if (record.featureCode === 'PPLX') continue;
      const sameName = nearbyFromGrid(settlementNameGrid, record, 1, 3, `${name}:`);
      const metroDuplicate = nearbyFromGrid(settlementGrid, record, 1, 1).some(existing => recordDistanceKm(record, existing)
        < Math.max(metroSeparationKm(record), metroSeparationKm(existing)));
      if (metroDuplicate || sameName.some(existing => recordDistanceKm(record, existing) < 80)) continue;
      addToGrid(settlementGrid, cell(record), record);
      addToGrid(settlementNameGrid, `${name}:${cell(record)}`, record);
    } else {
      const sameName = nearbyFromGrid(touringNameGrid, record, 0.1, 3, `${name}:`);
      if (sameName.some(existing => recordDistanceKm(record, existing) < 5)) continue;
      addToGrid(touringNameGrid, `${name}:${Math.floor(Number(record.lat) / 0.1)}:${Math.floor(Number(record.lon) / 0.1)}`, record);
    }
    retained.push(record);
  }
  return retained;
}

function gridCell(record, cellSize = 1.5) {
  return `${Math.floor(Number(record.lat) / cellSize)}:${Math.floor(Number(record.lon) / cellSize)}`;
}

function takeStratified(pool, count, selected, selectedIds, keyFor) {
  const buckets = new Map();
  for (const candidate of pool) {
    const key = keyFor(candidate);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(candidate);
  }
  let added = 0;
  while (added < count) {
    let progressed = false;
    for (const bucket of buckets.values()) {
      const next = bucket.find(candidate => !selectedIds.has(candidate.id));
      if (!next) continue;
      selected.push(next);
      selectedIds.add(next.id);
      added += 1;
      progressed = true;
      if (added >= count) break;
    }
    if (!progressed) break;
  }
  return added;
}

/**
 * Selects an evidence-ranked, geographically distributed country portfolio.
 * Administrative areas are cycled instead of letting one metro consume the
 * population quota; non-settlement anchors also use spatial cells so that a
 * dense attraction cluster cannot crowd out the rest of a country.
 */
export function selectTouringAnchors(records, target) {
  const requested = Math.max(0, Math.floor(Number(target) || 0));
  if (!requested) return [];
  const ranked = [...records]
    .filter(record => record?.id && record?.name && Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lon)))
    .sort((first, second) => significanceScore(second) - significanceScore(first)
      || Number(second.population || 0) - Number(first.population || 0)
      || first.name.localeCompare(second.name));
  const candidates = deduplicateSpatially(ranked);
  const settlements = candidates.filter(isSettlement);
  const touring = candidates.filter(record => !isSettlement(record));
  const selected = [];
  const selectedIds = new Set();
  const settlementQuota = Math.min(settlements.length, Math.ceil(requested * 0.52));
  const touringQuota = Math.min(touring.length, requested - settlementQuota);

  takeStratified(settlements, settlementQuota, selected, selectedIds,
    candidate => candidate.admin1 || gridCell(candidate, 2));
  takeStratified(touring, touringQuota, selected, selectedIds,
    candidate => `${candidate.admin1 || '_'}:${gridCell(candidate)}`);

  const remaining = requested - selected.length;
  if (remaining > 0) takeStratified(candidates, remaining, selected, selectedIds,
    candidate => `${candidate.admin1 || '_'}:${gridCell(candidate, 1)}`);

  return selected.sort((first, second) => significanceScore(second) - significanceScore(first)
    || Number(second.population || 0) - Number(first.population || 0)
    || first.name.localeCompare(second.name)).slice(0, requested);
}
