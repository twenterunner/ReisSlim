const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export const PROVIDER_STATUS = Object.freeze({ OK: 'ok', STALE: 'stale', DEGRADED: 'degraded', UNAVAILABLE: 'unavailable' });

export function providerEnvelope(provider, data, options = {}) {
  return {
    provider,
    status: options.status || PROVIDER_STATUS.OK,
    data: clone(data),
    fetchedAt: options.fetchedAt || new Date().toISOString(),
    staleAt: options.staleAt || null,
    attribution: options.attribution || null,
    confidence: options.confidence || 'medium',
    cached: Boolean(options.cached),
    warnings: [...(options.warnings || [])]
  };
}

export function createRequestBudget({ maximum = 8 } = {}) {
  let used = 0;
  return Object.freeze({
    claim(count = 1) {
      if (used + count > maximum) return false;
      used += count;
      return true;
    },
    snapshot() { return { used, maximum, remaining: Math.max(0, maximum - used) }; }
  });
}

export async function fetchProviderJson({ provider, url, options = {}, timeoutMs = 8000, fetchImpl = globalThis.fetch, validate = value => Boolean(value) }) {
  if (typeof fetchImpl !== 'function') return providerEnvelope(provider, null, { status: PROVIDER_STATUS.UNAVAILABLE, confidence: 'none', warnings: ['Geen netwerkfunctie beschikbaar.'] });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${provider} antwoordde met ${response.status}.`);
    const data = await response.json();
    if (!validate(data)) throw new Error(`${provider} leverde ongeldige gegevens.`);
    return providerEnvelope(provider, data);
  } catch (error) {
    const warning = error?.name === 'AbortError' ? `${provider} reageerde niet binnen ${timeoutMs / 1000} seconden.` : String(error?.message || `${provider} is niet beschikbaar.`);
    return providerEnvelope(provider, null, { status: PROVIDER_STATUS.UNAVAILABLE, confidence: 'none', warnings: [warning] });
  } finally { clearTimeout(timer); }
}

export function deduplicateBy(items, keyOf, prefer = left => left) {
  const values = new Map();
  for (const item of items || []) {
    const key = keyOf(item);
    if (key == null) continue;
    values.set(key, values.has(key) ? prefer(values.get(key), item) : item);
  }
  return [...values.values()];
}

export function providerHealth(envelopes = []) {
  const available = envelopes.filter(item => item?.status === PROVIDER_STATUS.OK).length;
  return {
    available,
    total: envelopes.length,
    status: available === envelopes.length ? PROVIDER_STATUS.OK : available ? PROVIDER_STATUS.DEGRADED : PROVIDER_STATUS.UNAVAILABLE,
    warnings: envelopes.flatMap(item => item?.warnings || [])
  };
}
