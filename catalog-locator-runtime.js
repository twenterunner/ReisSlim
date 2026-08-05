const normalizeLocatorText = value => String(value || '').normalize('NFKD').toLocaleLowerCase('en')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const rolePriority = role => ({
  'gateway-capital': 5,
  'access-gateway': 4,
  'overnight-base': 3,
  'protected-area': 2,
  'scenic-road-anchor': 2,
  'natural-highlight': 1,
  'cultural-highlight': 1
})[role] || 0;

function distanceKm(left, right) {
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(Number(right.lat) - Number(left.lat));
  const deltaLon = radians(Number(right.lon) - Number(left.lon));
  const start = radians(Number(left.lat));
  const end = radians(Number(right.lat));
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(start) * Math.cos(end) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function createCatalogLocatorRuntime(locator, manifest, resolveCountry) {
  const termIndex = new Map();
  const recordsByCountry = new Map();

  for (const record of locator?.records || []) {
    const countryRecords = recordsByCountry.get(record[0]) || [];
    countryRecords.push(record);
    recordsByCountry.set(record[0], countryRecords);
    for (const term of record[8] || []) {
      const matches = termIndex.get(term) || [];
      matches.push(record);
      termIndex.set(term, matches);
    }
  }

  const recordResolution = record => {
    if (!record) return null;
    const entry = manifest[record[0]];
    const role = record[5];
    const geographicType = ['gateway-capital', 'access-gateway', 'overnight-base'].includes(role)
      ? 'city' : ['protected-area', 'natural-highlight'].includes(role) ? 'region' : 'place';
    return {
      id: `catalogue-locator-${record[1]}`,
      providerId: record[1],
      code: record[0],
      countryCode: record[0],
      countryName: entry?.name || record[0],
      name: record[2],
      displayName: entry ? `${record[2]}, ${entry.name}` : record[2],
      geographicType,
      geographicClass: 'catalogue-locator',
      role,
      adminRegion: record[7],
      point: { lat: record[3], lon: record[4] },
      bounds: null,
      provider: 'ReisSlim compact catalogue locator',
      sourceUrl: `https://www.geonames.org/${String(record[1]).replace(/^gn-/, '')}/`,
      confidence: Number(record[6]) >= 90 ? 'high-catalogue-evidence' : 'catalogue-evidence',
      locator: true,
      catalogVersion: locator.catalogVersion
    };
  };

  const searchTerms = (input, country) => {
    const raw = typeof input === 'object'
      ? (input.name || input.displayName || input.destinationQuery || '')
      : String(input || '');
    const terms = raw.split(',').map(normalizeLocatorText).filter(term => term.length >= 2);
    let full = normalizeLocatorText(raw);
    if (country) {
      const aliases = [country.name, ...(country.aliases || [])]
        .map(normalizeLocatorText).filter(Boolean).sort((left, right) => right.length - left.length);
      for (const alias of aliases) {
        if (full === alias) return [];
        if (full.endsWith(` ${alias}`)) full = full.slice(0, -(alias.length + 1)).trim();
        else if (full.startsWith(`${alias} `)) full = full.slice(alias.length + 1).trim();
      }
    }
    if (full.length >= 2) terms.unshift(full);
    return [...new Set(terms)];
  };

  const resolveCountryFromPoint = point => {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return null;
    const candidates = Object.values(manifest)
      .filter(entry => point.lat >= entry.bounds.south && point.lat <= entry.bounds.north
        && point.lon >= entry.bounds.west && point.lon <= entry.bounds.east);
    if (candidates.length < 2) return candidates[0] || null;
    return candidates.map(entry => {
      const nearestKm = Math.min(...(recordsByCountry.get(entry.code) || [])
        .map(record => distanceKm(point, { lat: record[3], lon: record[4] })));
      const area = (entry.bounds.north - entry.bounds.south) * (entry.bounds.east - entry.bounds.west);
      return { entry, nearestKm, area };
    }).sort((left, right) => left.nearestKm - right.nearestKm || left.area - right.area)[0]?.entry || null;
  };

  const resolveLocation = input => {
    if (!input) return null;
    const country = resolveCountry(input);
    const candidates = [];
    for (const term of searchTerms(input, country)) {
      for (const record of termIndex.get(term) || []) {
        if (country && record[0] !== country.code) continue;
        if (!candidates.includes(record)) candidates.push(record);
      }
    }
    candidates.sort((left, right) => Number(right[6] || 0) - Number(left[6] || 0)
      || rolePriority(right[5]) - rolePriority(left[5])
      || String(left[2]).localeCompare(String(right[2]), 'en'));
    return recordResolution(candidates[0]);
  };

  const resolveLocationFromPoint = (point, {
    countryCode = null,
    maximumDistanceKm = 150,
    preferOvernightBase = false
  } = {}) => {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return null;
    const country = resolveCountry(countryCode) || resolveCountryFromPoint(point);
    const records = country ? (recordsByCountry.get(country.code) || []) : (locator.records || []);
    const candidates = records.map(record => ({ record, distanceKm: distanceKm(point, { lat: record[3], lon: record[4] }) }))
      .filter(item => item.distanceKm <= maximumDistanceKm);
    const overnightRoles = new Set(['gateway-capital', 'access-gateway', 'overnight-base']);
    const eligible = preferOvernightBase && candidates.some(item => overnightRoles.has(item.record[5]))
      ? candidates.filter(item => overnightRoles.has(item.record[5]))
      : candidates;
    const nearest = eligible
      .sort((left, right) => left.distanceKm - right.distanceKm
        || Number(right.record[6] || 0) - Number(left.record[6] || 0)
        || rolePriority(right.record[5]) - rolePriority(left.record[5]))[0];
    const resolution = recordResolution(nearest?.record);
    return resolution ? { ...resolution, distanceFromPointKm: Number(nearest.distanceKm.toFixed(1)) } : null;
  };

  return Object.freeze({
    resolveLocation,
    resolveLocationFromPoint,
    resolveCountryFromPoint,
    stats: Object.freeze({
      schemaVersion: locator?.schemaVersion,
      catalogVersion: locator?.catalogVersion,
      records: locator?.records?.length || 0
    })
  });
}
