import { BUILD, ENGINE_VERSION, VERSION, preferenceDefinitions } from './config.js';
import { destinations, getDestination } from './destinations.js';
import { rankDestinations } from './destination-engine.js';
import { buildItinerary } from './itinerary-engine.js';
import { buildBudget } from './budget-engine.js';
import { calculateTripQuality } from './trip-quality-engine.js';
import { optimisePlan } from './trip-optimizer.js';
import { validatePlan } from './itinerary-validator.js';
import { clearDraft, deleteTrip, loadDraft, loadTrips, saveDraft, saveTrip } from './storage.js';
import { localDate, normalizeTrip, readTripForm, validateTripInput, writeTripForm } from './trip-model.js';
import { downloadGpx, downloadJson } from './gpx-generator.js';
import { invalidateMap, renderMap } from './map-view.js';
import { $, renderComparison, renderDashboard, renderDestinations, renderPlan, renderPreferenceGrid, setStatus, showError, showView } from './ui-renderer.js';

const defaults = () => normalizeTrip({
  origin: 'Saasveld', startDate: localDate(30), days: 10, budget: 3500,
  adults: 2, children: 2, transport: 'car', maxDrive: 5, maxChanges: 5,
  comfort: 'mid', notes: '', preferences: preferenceDefinitions.slice(0, 5).map(([id]) => id),
  preferenceWeights: Object.fromEntries(preferenceDefinitions.slice(0, 5).map(([id]) => [id, 2]))
});

const state = {
  trip: null, ranked: [], destination: null, plan: null, budget: null,
  validation: [], quality: null, compareIds: [], optimized: false,
  undoSnapshot: null, optimizationSummary: null
};

const clone = value => JSON.parse(JSON.stringify(value));

function stateForStorage() {
  return { schemaVersion: 3, engineVersion: ENGINE_VERSION, trip: state.trip, destinationId: state.destination?.id || null, compareIds: state.compareIds, optimized: state.optimized, plan: state.plan };
}

function exportState() {
  return {
    version: VERSION, build: BUILD, engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(), trip: state.trip,
    destination: state.destination ? { id: state.destination.id, name: state.destination.name, score: state.destination.score, confidence: state.destination.confidence } : null,
    plan: state.plan, budget: state.budget, validation: state.validation,
    planningQuality: state.quality,
    notices: ['Prijzen, rijtijden en beschikbaarheid zijn indicatief en niet-live.', 'Controleer officiële informatie en de GPX-route vóór vertrek.']
  };
}

function persistDraft(message = 'Automatisch opgeslagen') {
  try { saveDraft(stateForStorage()); setStatus(message); }
  catch (error) { console.error(error); setStatus('Opslaan mislukt'); }
}

function calculatePlan(destination, optimize = false) {
  let plan = buildItinerary(state.trip, destination);
  let changes = [];
  if (optimize) ({ plan, changes } = optimisePlan(state.trip, destination, plan));
  const budget = buildBudget(state.trip, destination, plan);
  const quality = calculateTripQuality(state.trip, destination, plan, budget);
  const validation = validatePlan(state.trip, destination, plan, budget);
  return { plan, budget, quality, validation, changes };
}

function applyDestination(destination, optimize = false) {
  const result = calculatePlan(destination, optimize);
  Object.assign(state, { destination, ...result, optimized: optimize });
  renderPlan(state);
  renderMap(state.plan);
  $('planSection').classList.remove('hidden');
  $('noPlanItinerary').classList.add('hidden');
  $('mapHint').classList.add('hidden');
  persistDraft();
  renderDashboard(state, loadTrips());
}

function rebuildFromRecord(record) {
  state.trip = normalizeTrip(record.trip);
  state.compareIds = record.compareIds || [];
  writeTripForm(state.trip);
  state.ranked = rankDestinations(state.trip, destinations);
  state.destination = getDestination(record.destinationId) ? state.ranked.find(item => item.id === record.destinationId) : null;
  if (state.destination) {
    applyDestination(state.destination, Boolean(record.optimized));
    $('resultsSection').classList.remove('hidden');
    renderDestinations(state);
    renderComparison(state);
  }
}

function resetState(trip = defaults()) {
  Object.assign(state, { trip, ranked: [], destination: null, plan: null, budget: null, validation: [], quality: null, compareIds: [], optimized: false, undoSnapshot: null, optimizationSummary: null });
  writeTripForm(trip);
  $('resultsSection').classList.add('hidden');
  $('planSection').classList.add('hidden');
  $('noPlanItinerary').classList.remove('hidden');
  $('mapHint').classList.remove('hidden');
  persistDraft('Nieuw concept opgeslagen');
  renderDashboard(state, loadTrips());
}

function initialize() {
  renderPreferenceGrid();
  $('versionLabel').textContent = `ReisSlim v${VERSION} · Build ${BUILD} · Foundation`;
  const restored = loadDraft();
  if (restored?.trip) { rebuildFromRecord(restored); setStatus('Concept hersteld en met de actuele planner herberekend'); }
  else resetState();
  renderDashboard(state, loadTrips());

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { showView(button.dataset.view); if (button.dataset.view === 'mapView') invalidateMap(); }));
  document.querySelectorAll('[data-go-planner]').forEach(button => button.addEventListener('click', () => showView('plannerView')));
  $('brandBtn').addEventListener('click', () => showView('dashboardView'));
  $('startPlanningBtn').addEventListener('click', () => showView('plannerView'));
  $('continueTripBtn').addEventListener('click', () => showView('plannerView'));

  $('preferenceGrid').addEventListener('change', event => {
    if (event.target.matches('[data-pref]')) {
      const select = document.querySelector(`[data-priority="${event.target.value}"]`);
      if (select) select.disabled = !event.target.checked;
    }
  });

  $('tripForm').addEventListener('submit', event => {
    event.preventDefault();
    state.trip = readTripForm(state.trip?.id);
    const errors = validateTripInput(state.trip);
    if (errors.length) { showError(errors.join(' ')); return; }
    showError();
    state.ranked = rankDestinations(state.trip, destinations);
    state.destination = null; state.plan = null; state.undoSnapshot = null; state.optimizationSummary = null;
    renderDestinations(state); renderComparison(state);
    $('resultsSection').classList.remove('hidden');
    $('planSection').classList.add('hidden');
    persistDraft();
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  let autosaveTimer;
  const scheduleAutosave = () => {
    clearTimeout(autosaveTimer); setStatus('Wijzigingen opslaan…');
    autosaveTimer = setTimeout(() => { state.trip = readTripForm(state.trip?.id); persistDraft(); renderDashboard(state, loadTrips()); }, 250);
  };
  $('tripForm').addEventListener('input', scheduleAutosave);
  $('tripForm').addEventListener('change', scheduleAutosave);

  $('destinationCards').addEventListener('click', event => {
    const select = event.target.closest('[data-select]');
    if (select) {
      const destination = state.ranked.find(item => item.id === select.dataset.select);
      if (destination) { applyDestination(destination); showView('itineraryView'); }
    }
  });
  $('destinationCards').addEventListener('change', event => {
    if (!event.target.matches('[data-compare]')) return;
    const id = event.target.dataset.compare;
    if (event.target.checked && !state.compareIds.includes(id)) {
      if (state.compareIds.length >= 3) { event.target.checked = false; alert('Je kunt maximaal drie bestemmingen vergelijken.'); return; }
      state.compareIds.push(id);
    } else if (!event.target.checked) state.compareIds = state.compareIds.filter(item => item !== id);
    renderComparison(state); persistDraft();
  });
  $('clearCompareBtn').addEventListener('click', () => { state.compareIds = []; renderDestinations(state); renderComparison(state); persistDraft(); });

  $('loadDemoBtn').addEventListener('click', () => {
    state.trip = normalizeTrip({ ...defaults(), id: state.trip?.id, tripName: 'Gezinsreis naar de bergen', days: 9, budget: 3200, maxChanges: 5, preferenceWeights: { natuur: 3, bergen: 3, zwemmen: 2, wandelen: 2, kinderen: 3 } });
    writeTripForm(state.trip); persistDraft('Voorbeeld opgeslagen');
  });
  $('newTripBtn').addEventListener('click', () => { if (confirm('Nieuwe reis starten? Je opgeslagen reizen blijven behouden.')) { clearDraft(); resetState(); showView('plannerView'); } });

  $('savedTripsList').addEventListener('click', event => {
    const open = event.target.closest('[data-open-trip]');
    if (open) { const record = loadTrips().find(item => item.trip.id === open.dataset.openTrip); if (record) { rebuildFromRecord(record); renderDashboard(state, loadTrips()); showView(state.destination ? 'itineraryView' : 'plannerView'); } }
    const remove = event.target.closest('[data-delete-trip]');
    if (remove && confirm('Deze opgeslagen reis definitief verwijderen?')) { deleteTrip(remove.dataset.deleteTrip); renderDashboard(state, loadTrips()); }
  });

  $('saveTripBtn').addEventListener('click', () => {
    if (!state.destination) return;
    if (!state.trip.tripName) { state.trip.tripName = state.destination.name; writeTripForm(state.trip); }
    saveTrip(stateForStorage()); renderDashboard(state, loadTrips());
    $('saveTripBtn').textContent = 'Opgeslagen ✓'; setTimeout(() => { $('saveTripBtn').textContent = 'Opslaan'; }, 1400);
  });
  $('exportJsonBtn').addEventListener('click', () => {
    if (!state.destination) return;
    try { downloadJson(exportState(), `${state.destination.id}-${state.trip.startDate}`); $('exportStatus').textContent = 'JSON-download gestart.'; }
    catch (error) { console.error(error); $('exportStatus').textContent = 'JSON-export mislukt.'; }
  });
  $('exportGpxBtn').addEventListener('click', () => {
    if (!state.destination) return;
    try { downloadGpx(state.trip, state.destination, state.plan); $('exportStatus').textContent = 'GPX-download gestart.'; }
    catch (error) { console.error(error); $('exportStatus').textContent = 'GPX-export mislukt.'; }
  });

  $('improveTripBtn').addEventListener('click', () => {
    if (!state.plan) return;
    state.undoSnapshot = clone({ plan: state.plan, budget: state.budget, quality: state.quality, validation: state.validation, optimized: state.optimized });
    const before = state.quality.overall;
    const result = optimisePlan(state.trip, state.destination, state.plan);
    state.plan = result.plan;
    state.budget = buildBudget(state.trip, state.destination, state.plan);
    state.quality = calculateTripQuality(state.trip, state.destination, state.plan, state.budget);
    state.validation = validatePlan(state.trip, state.destination, state.plan, state.budget);
    state.optimized = true;
    state.optimizationSummary = { before, after: state.quality.overall, changes: result.changes };
    renderPlan(state); renderMap(state.plan); persistDraft('Verbeteringen opgeslagen');
  });
  $('undoOptimizeBtn').addEventListener('click', () => {
    if (!state.undoSnapshot) return;
    Object.assign(state, state.undoSnapshot); state.undoSnapshot = null; state.optimizationSummary = null;
    renderPlan(state); renderMap(state.plan); persistDraft('Optimalisatie ongedaan gemaakt');
  });
}

document.addEventListener('DOMContentLoaded', initialize);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(`./service-worker.js?build=${BUILD}`).catch(error => console.warn('Service worker niet beschikbaar', error)));
