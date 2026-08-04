const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const CACHE_PREFIX = 'reisslim.image.v1.';

const stripHtml = value => String(value || '').replace(/<[^>]+>/g, '').trim();

function usableLicense(metadata = {}) {
  const short = metadata.LicenseShortName?.value || '';
  return /CC BY|public domain|CC0/i.test(short);
}

export function normalizeCommonsImage(payload) {
  const page = Object.values(payload?.query?.pages || {}).find(candidate => {
    const info = candidate?.imageinfo?.[0];
    return info?.thumburl && /^https:\/\//i.test(info.thumburl) && usableLicense(info.extmetadata || {});
  });
  const info = page?.imageinfo?.[0];
  const metadata = info?.extmetadata || {};
  if (!page || !info) return null;
  return {
    url: info.thumburl,
    sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
    title: page.title?.replace(/^File:/, '') || 'Bestemmingsbeeld',
    creator: stripHtml(metadata.Artist?.value) || 'Onbekende maker',
    license: metadata.LicenseShortName?.value || 'Open licentie',
    attribution: `${stripHtml(metadata.Artist?.value) || 'Onbekende maker'} · ${metadata.LicenseShortName?.value || 'open licentie'} · Wikimedia Commons`,
    provider: 'Wikimedia Commons',
    checkedAt: new Date().toISOString()
  };
}

export async function fetchDestinationImage(destination, { fetchImpl = globalThis.fetch, storage = globalThis.localStorage, timeoutMs = 7000 } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const key = `${CACHE_PREFIX}${destination.id}`;
  try { const cached = JSON.parse(storage?.getItem(key) || 'null'); if (cached) return cached; } catch { /* optional cache */ }
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${destination.name} landscape`, gsrnamespace: '6', gsrlimit: '3',
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '900', format: 'json', origin: '*'
  });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const image = normalizeCommonsImage(await response.json());
    if (image) try { storage?.setItem(key, JSON.stringify(image)); } catch { /* optional cache */ }
    return image;
  } catch { return null; } finally { clearTimeout(timer); }
}

export async function enrichDestinationImages(destinations, options = {}) {
  const maximum = Math.max(0, Math.min(12, options.maximum || 8));
  const selected = destinations.slice(0, maximum);
  const results = await Promise.all(selected.map(destination => fetchDestinationImage(destination, options)));
  selected.forEach((destination, index) => { if (results[index]) destination.image = results[index]; });
  return destinations;
}

export async function enrichHighlightImages(destination, options = {}) {
  const highlights = (destination?.highlights || []).filter(item => !item.gateway).slice(0, options.maximum || 4);
  const images = await Promise.all(highlights.map(item => fetchDestinationImage({ id: `${destination.id}-${item.id}`, name: item.name }, options)));
  highlights.forEach((item, index) => { if (images[index]) item.image = images[index]; });
  return destination;
}

export const imageProviderAttribution = 'Wikimedia Commons; alleen expliciet open gelicentieerde resultaten met zichtbare attributie.';
