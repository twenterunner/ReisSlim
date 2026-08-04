import { collectRoutePoints } from './itinerary-engine.js';
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
  const trackPoints = collectRoutePoints(plan).filter(validCoordinate);
  const dailyPoints = collectRoutePoints(plan, { daily: true }).filter(validCoordinate);
  const waypoints = dailyPoints.map(point => `<wpt lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(`Dag ${point.day || 0}: ${point.name}`)}</name><desc>${escapeXml(point.date || '')}</desc></wpt>`).join('');
  const track = trackPoints.map(point => `<trkpt lat="${point.lat}" lon="${point.lon}"><name>${escapeXml(point.name)}</name></trkpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ReisSlim ${escapeXml(trip.startDate)}" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(destination.name)}</name><desc>Indicatieve planningstrack; niet gegarandeerd geschikt voor turn-by-turn navigatie.</desc></metadata>${waypoints}<trk><name>${escapeXml(destination.name)}</name><desc>Controleer de route in je navigatie-app vóór vertrek.</desc><trkseg>${track}</trkseg></trk></gpx>`;
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
