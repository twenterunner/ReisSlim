import { collectPlanWaypoints, collectRouteSegments } from './itinerary-engine.js';
import { validCoordinate } from './config.js';

export const escapeXml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function safeFilename(value, extension) {
  const base = String(value || 'reisslim-reis').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'reisslim-reis';
  return `${base}.${extension}`;
}

export function createGpx(trip, destination, plan) {
  const segments = collectRouteSegments(plan);
  const planPoints = collectPlanWaypoints(plan).filter(validCoordinate);
  const waypoints = planPoints.map(point => `<wpt lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(`Dag ${point.day || 0}: ${point.name}`)}</name><desc>${escapeXml(`${point.date || ''} · ${point.role || 'routepunt'} · controleer actuele geschiktheid`)}</desc><type>${escapeXml(point.role || 'waypoint')}</type></wpt>`).join('');
  const tracks = segments.map(segment => `<trk><name>${escapeXml(`Dag ${segment.day} · ${segment.kind}`)}</name><desc>${escapeXml(`${segment.source}; controleer voertuigbeperkingen en actuele toegankelijkheid`)}</desc><trkseg>${segment.points.filter(validCoordinate).map(point => `<trkpt lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(point.name || 'Routepunt')}</name></trkpt>`).join('')}</trkseg></trk>`).join('');
  const source = plan.routing?.live ? 'live providergeometrie' : 'offline corridorpunten';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ReisSlim ${escapeXml(trip.startDate)}" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(destination.name)}</name><desc>Voertuiggerichte planning met ${escapeXml(source)}; geen gegarandeerde turn-by-turn navigatie. Internationale vlieg-, trein- en ferrysegmenten worden alleen als logistieke metadata geëxporteerd.</desc></metadata>${waypoints}${tracks}</gpx>`;
}

export function createJson(data) {
  return JSON.stringify(data, null, 2);
}

export function downloadBlob(content, name, type) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

export function downloadGpx(trip, destination, plan) {
  downloadBlob(createGpx(trip, destination, plan), safeFilename(`${destination.id}-${trip.startDate}`, 'gpx'), 'application/gpx+xml');
}

export function downloadJson(data, name = 'reisslim-reis') {
  downloadBlob(createJson(data), safeFilename(name, 'json'), 'application/json');
}
