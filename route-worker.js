const TOMTOM_BASE = 'https://api.tomtom.com/routing/1/calculateRoute';

const corsHeaders = origin => ({
  'access-control-allow-origin': origin || '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  vary: 'Origin'
});

function allowedOrigin(requestOrigin, env) {
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!configured.length) return requestOrigin || '*';
  return configured.includes(requestOrigin) ? requestOrigin : null;
}

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

export function buildTomTomUrl(input, apiKey) {
  const points = [input.origin, ...(input.waypoints || []), input.destination];
  if (!points.every(validPoint) || points.length > 7) throw new Error('Ongeldige routepunten.');
  const locations = points.map(point => `${point.lat},${point.lon}`).join(':');
  const url = new URL(`${TOMTOM_BASE}/${locations}/json`);
  const vehicle = input.vehicle || {};
  url.searchParams.set('key', apiKey);
  url.searchParams.set('travelMode', vehicle.routeMode || 'car');
  url.searchParams.set('traffic', 'true');
  url.searchParams.set('routeRepresentation', 'polyline');
  url.searchParams.set('computeTravelTimeFor', 'all');
  url.searchParams.set('avoid', 'unpavedRoads');
  if (vehicle.routeStyle === 'fastest') url.searchParams.set('routeType', 'fastest');
  if (vehicle.routeStyle === 'scenic' && vehicle.routeMode === 'motorcycle') {
    url.searchParams.set('routeType', 'thrilling');
    url.searchParams.set('windingness', 'high');
    url.searchParams.set('hilliness', 'normal');
  }
  const numeric = [
    ['vehicleMaxSpeed', vehicle.maxSpeedKmh],
    ['vehicleHeight', vehicle.heightM],
    ['vehicleLength', vehicle.lengthM],
    ['vehicleWeight', vehicle.weightKg]
  ];
  numeric.forEach(([key, value]) => { if (Number.isFinite(value) && value > 0) url.searchParams.set(key, String(value)); });
  if (vehicle.routeMode === 'truck') url.searchParams.set('vehicleCommercial', 'false');
  return url;
}

export function normalizeTomTomRoute(payload) {
  const route = payload?.routes?.[0];
  const geometry = (route?.legs || []).flatMap((leg, index) => (leg.points || []).slice(index ? 1 : 0))
    .map(point => ({ lat: point.latitude, lon: point.longitude }));
  if (!route?.summary || geometry.length < 2) throw new Error('Geen bruikbare route ontvangen.');
  return {
    provider: 'tomtom',
    distanceKm: route.summary.lengthInMeters / 1000,
    roadHours: route.summary.travelTimeInSeconds / 3600,
    geometry
  };
}

async function handle(request, env) {
  const requestOrigin = request.headers.get('origin') || '';
  const origin = allowedOrigin(requestOrigin, env);
  if (!origin) return Response.json({ error: 'Origin is niet toegestaan.' }, { status: 403 });
  const headers = { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return Response.json({ error: 'Alleen POST is toegestaan.' }, { status: 405, headers });
  if (!env.TOMTOM_API_KEY) return Response.json({ error: 'Routingprovider is niet geconfigureerd.' }, { status: 503, headers });
  try {
    const input = await request.json();
    const response = await fetch(buildTomTomUrl(input, env.TOMTOM_API_KEY), { headers: { accept: 'application/json' } });
    if (!response.ok) return Response.json({ error: `Routingprovider antwoordde met ${response.status}.` }, { status: 502, headers });
    return Response.json(normalizeTomTomRoute(await response.json()), { headers });
  } catch (error) {
    return Response.json({ error: error.message || 'Route kon niet worden berekend.' }, { status: 400, headers });
  }
}

export default { fetch: handle };
