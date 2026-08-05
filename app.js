import { BUILD, ENGINE_VERSION, STORAGE_SCHEMA_VERSION, VERSION, preferenceDefinitions } from './config.js?v=1102';
import { buildProposalPortfolio, getMoreProposals } from './proposal-engine.js?v=1102';
import { discoverDestinationBatch, recommendAccessMode, resolveDestination } from './destination-provider.js?v=1102';
import { buildItinerary } from './itinerary-engine.js?v=1102';
import { buildItineraryVariant, buildItineraryVariants } from './itinerary-variants.js?v=1102';
import { buildBudget } from './budget-engine.js?v=1102';
import { calculateTripQuality } from './trip-quality-engine.js?v=1102';
import { applyOptimizationProposal, optimisePlan, proposeOptimizations } from './trip-optimizer.js?v=1102';
import { validatePlan } from './itinerary-validator.js?v=1102';
import { clearDraft, deleteTrip, loadDraft, loadTrips, saveDraft, saveTrip } from './storage.js?v=1102';
import { localDate, normalizeTrip, readTripForm, resolveOrigin, validateTripInput, writeTripForm } from './trip-model.js?v=1102';
import { downloadGpx, downloadJson } from './gpx-generator.js?v=1102';
import { highlightMapDay, invalidateMap, renderMap } from './map-view.js?v=1102';
import { enrichPlanWithLiveRouting, readRoutingSettings, routingConfigured, saveRoutingSettings } from './routing-provider.js?v=1102';
import { evaluatePlanConstraints } from './constraint-engine.js?v=1102';
import { enrichPlanWithPlaces, geocodeOrigin } from './place-provider.js?v=1102';
import { $, renderComparison, renderDashboard, renderDestinations, renderItineraryVariants, renderOptimizationPreview, renderPlan, renderPreferenceGrid, renderVehicleControls, setStatus, showError, showView } from './ui-renderer.js?v=1102';
import { loadPreferenceProfile, recordPreferenceEvent, savePreferenceProfile } from './preference-engine.js?v=1102';
import { applyAssistantPatch, interpretAssistantMessage } from './assistant-engine.js?v=1102';
import { enrichDestinationImages, enrichHighlightImages } from './image-provider.js?v=1102';

const defaults = () => normalizeTrip({
  origin: 'Saasveld', startDate: localDate(30), days: 10, budget: 3500, travelMode: 'direct', routeTopology: 'loop', tripPace: 'balanced', destinationQuery: '',
  adults: 2, children: 2, transport: 'car', maxDrive: 5, maxChanges: 5,
  comfort: 'mid', strictBudget: true, strictDrive: true, strictChanges: true, allowStretch: true, liveData: true, remoteTravel: false, privateMode: false, notes: '', preferences: preferenceDefinitions.slice(0, 5).map(([id]) => id),
  preferenceWeights: Object.fromEntries(preferenceDefinitions.slice(0, 5).map(([id]) => [id, 2]))
});

const state = {
  trip: null, ranked: [], ranking: null, destination: null, plan: null, budget: null,
  validation: [], quality: null, compareIds: [], savedProposalIds: [], dismissedIds: [], variants: [], selectedVariantId: null, optimized: false,
  undoSnapshot: null, optimizationSummary: null, optimizationProposal: null, routingRun: 0, catalog: [], discoveryCursor: 0, discoveryBusy: false,
  discoveryRunId: 0, discoveryController: null, accessNotice: null,
  preferenceProfile: loadPreferenceProfile(), assistantPreview: null
};

const clone = value => JSON.parse(JSON.stringify(value));
const materialTripFingerprint = trip => JSON.stringify({
  origin: trip?.origin, originPoint: trip?.originPoint, destinationQuery: trip?.destinationQuery,
  startDate: trip?.startDate, days: trip?.days, budget: trip?.budget, adults: trip?.adults,
  children: trip?.children, travelMode: trip?.travelMode, transport: trip?.transport,
  routeTopology: trip?.routeTopology, tripPace: trip?.tripPace, maxDrive: trip?.maxDrive,
  maxChanges: trip?.maxChanges, comfort: trip?.comfort, liveData: trip?.liveData,
  preferences: trip?.preferences, preferenceWeights: trip?.preferenceWeights
});

function beginDiscoveryRun() {
  state.discoveryController?.abort();
  const controller = new AbortController();
  const runId = ++state.discoveryRunId;
  state.discoveryController = controller;
  state.discoveryBusy = true;
  return { runId, controller, signal: controller.signal };
}

const discoveryRunIsCurrent = runId => runId === state.discoveryRunId;

function portfolioOptions(extra = {}) {
  state.preferenceProfile.privateMode = Boolean(state.trip?.privateMode);
  return { preferenceProfile: state.preferenceProfile, ...extra };
}

function syncTravelModeControls() {
  const multimodal = $('travelMode').value !== 'direct';
  const openJaw = $('routeTopology').querySelector('option[value="open-jaw"]');
  if (openJaw) openJaw.disabled = !multimodal;
  if (!multimodal && $('routeTopology').value === 'open-jaw') $('routeTopology').value = 'loop';
}

function learn(kind, destination) {
  if (!destination) return;
  state.preferenceProfile.privateMode = Boolean(state.trip?.privateMode);
  state.preferenceProfile = recordPreferenceEvent(state.preferenceProfile, { kind, destinationId: destination.id, tags: destination.tags });
  savePreferenceProfile(state.preferenceProfile);
}

async function hydrateProposalImages() {
  if (!state.trip?.liveData || !state.ranked.length) return;
  await enrichDestinationImages(state.ranked, { maximum: 8 });
  renderDestinations(state);
}

async function hydratePlanImages(destinationId) {
  if (!state.trip?.liveData || !state.destination) return;
  await enrichDestinationImages([state.destination], { maximum: 1 });
  await enrichHighlightImages(state.destination, { maximum: 4 });
  if (state.destination?.id === destinationId && state.plan) renderPlan(state);
}

function stateForStorage() {
  return { schemaVersion: STORAGE_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, trip: state.trip, destinationId: state.destination?.destinationId || state.destination?.id || null, destinationProfile: state.destination?.dynamic ? state.destination : null, compareIds: state.compareIds, savedProposalIds: state.savedProposalIds, dismissedIds: state.dismissedIds, selectedVariantId: state.selectedVariantId, optimized: state.optimized, plan: state.plan };
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
  const constraintStatus = evaluatePlanConstraints(state.trip, plan, budget, { allowStretch: destination.category === 'stretch' });
  plan.constraintStatus = constraintStatus;
  plan.feasible = constraintStatus.exact;
  plan.warnings = [...new Set([...(plan.warnings || []), ...constraintStatus.violations.map(item => item.detail)])];
  const quality = calculateTripQuality(state.trip, destination, plan, budget);
  const validation = validatePlan(state.trip, destination, plan, budget);
  return { plan, budget, quality, validation, constraintStatus, changes };
}

function derivePlanState(destination, plan) {
  const budget = buildBudget(state.trip, destination, plan);
  const constraintStatus = evaluatePlanConstraints(state.trip, plan, budget, { allowStretch: destination.category === 'stretch' });
  plan.constraintStatus = constraintStatus;
  plan.feasible = constraintStatus.exact;
  plan.warnings = [...new Set([...(plan.warnings || []), ...constraintStatus.violations.map(item => item.detail)])];
  const quality = calculateTripQuality(state.trip, destination, plan, budget);
  const validation = validatePlan(state.trip, destination, plan, budget);
  return { plan, budget, quality, validation, constraintStatus };
}

function applyDestination(destination, optimize = false) {
  const result = calculatePlan(destination, optimize);
  Object.assign(state, { destination, ...result, optimized: optimize, selectedVariantId: 'balanced', optimizationProposal: null });
  renderPlan(state);
  renderOptimizationPreview(state);
  renderMap(state.plan);
  $('variantSection').classList.add('hidden');
  $('planSection').classList.remove('hidden');
  $('mapHint').classList.add('hidden');
  $('noPlanItinerary').classList.add('hidden');
  persistDraft();
  renderDashboard(state, loadTrips());
  if (state.trip.liveData) void enhanceLiveData(destination.id, state.plan);
  if (state.trip.liveData) void hydratePlanImages(destination.id);
}

function chooseProposal(destination) {
  state.trip = readTripForm(state.trip);
  learn('select', destination);
  state.destination = destination;
  state.variants = buildItineraryVariants(state.trip, destination);
  state.selectedVariantId = null;
  state.plan = null;
  state.optimizationProposal = null;
  renderItineraryVariants(state);
  $('planSection').classList.add('hidden');
  $('noPlanItinerary').classList.add('hidden');
  persistDraft('Reisconcept gekozen; kies nu een dagindeling');
  showView('itineraryView');
}

function refreshVisibleGroups() {
  state.ranking.visible = [...state.ranked];
  state.ranking.exact = state.ranked.filter(item => item.category === 'exact');
  state.ranking.stretched = state.ranked.filter(item => item.category === 'stretch').slice(0, 2);
  if (state.ranked.length >= 6) state.ranking.shortage = null;
  renderDestinations(state); renderComparison(state); persistDraft();
}

function appendMoreProposals(limit = 4) {
  const excluded = [...new Set([...state.ranked.map(item => item.id), ...state.dismissedIds])];
  const existingStretches = state.ranked.filter(item => item.category === 'stretch').length;
  let stretchSlots = Math.max(0, 2 - existingStretches);
  const more = getMoreProposals(state.trip, state.catalog, excluded, portfolioOptions({ limit: limit + 2, focus: $('proposalFocus').value })).filter(item => {
    if (item.category !== 'stretch') return true;
    if (!stretchSlots) return false;
    stretchSlots -= 1; return true;
  }).slice(0, limit);
  state.ranked.push(...more);
  refreshVisibleGroups();
  setStatus(more.length ? `${more.length} nieuwe, niet eerder getoonde opties toegevoegd` : 'Geen nieuwe onderscheidende opties binnen de huidige grenzen');
  return more.length;
}

async function discoverLiveOptions({ replace = false, append = false, run: suppliedRun = null } = {}) {
  if (!state.trip.liveData) return 0;
  const run = suppliedRun || beginDiscoveryRun();
  const requestTrip = clone(state.trip);
  const requestCursor = state.discoveryCursor;
  const excludedIds = [...state.catalog.map(item => item.id), ...state.dismissedIds];
  try {
    setStatus('Bestemming en toegang controleren…');
    let resolution = null;
    let effectiveTrip = requestTrip;
    if (requestTrip.destinationQuery) {
      resolution = await resolveDestination(requestTrip.destinationQuery, { signal: run.signal });
      if (!discoveryRunIsCurrent(run.runId)) return 0;
      if (!resolution) {
        const reason = 'De opgegeven bestemming kon door geen geocodingprovider worden gevonden. Controleer de spelling of probeer opnieuw.';
        if (replace) {
          state.catalog = [];
          state.ranking = buildProposalPortfolio(requestTrip, [], portfolioOptions({ limit: 8 }));
          state.ranked = [];
          renderDestinations(state); renderComparison(state);
        }
        showError(reason); setStatus(reason);
        return 0;
      }
      effectiveTrip = normalizeTrip({ ...requestTrip, destinationPoint: { ...resolution.point, name: resolution.name } });
      const access = recommendAccessMode(effectiveTrip, resolution);
      if (access?.automatic) {
        $('travelMode').value = access.travelMode;
        $('transport').value = access.transport;
        renderVehicleControls();
        syncTravelModeControls();
        effectiveTrip = normalizeTrip({ ...readTripForm(effectiveTrip), travelMode: access.travelMode, transport: access.transport });
        state.accessNotice = { title: `${access.label} geselecteerd voor de toegang`, detail: access.reason };
      } else if (access?.required) {
        state.accessNotice = { title: 'Andere toegang nodig', detail: access.reason };
      }
    }
    state.trip = effectiveTrip;
    setStatus('Regioankers en highlights via meerdere bronnen ontdekken…');
    const result = await discoverDestinationBatch(effectiveTrip, {
      cursor: requestCursor,
      excludedIds,
      resolution,
      signal: run.signal
    });
    if (!discoveryRunIsCurrent(run.runId)) return 0;
    if (!result.destinations.length) {
      if (result.outcome === 'no-unseen-results') {
        showError();
        setStatus(result.reason || 'Geen nieuwe onderscheidende regio\'s gevonden.');
        return 0;
      }
      if (replace) {
        state.catalog = [];
        state.ranking = buildProposalPortfolio(effectiveTrip, [], portfolioOptions({ limit: 8 }));
        state.ranked = [];
        renderDestinations(state); renderComparison(state);
      }
      showError(result.reason || 'Dynamische plaatsontdekking reageert tijdelijk niet; er zijn geen ongerelateerde reizen toegevoegd.');
      setStatus(result.reason || 'Dynamische ontdekking niet beschikbaar');
      return 0;
    }
    state.discoveryCursor = requestCursor + 1;
    const known = new Set(replace ? [] : state.catalog.map(item => item.id));
    if (replace) state.catalog = [];
    state.catalog.push(...result.destinations.filter(item => !known.has(item.id)));
    showError();
    if (replace) {
      state.ranking = buildProposalPortfolio(effectiveTrip, state.catalog, portfolioOptions({ limit: 8, focus: $('proposalFocus').value, excludedIds: state.dismissedIds }));
      state.ranked = state.ranking.visible; renderDestinations(state); renderComparison(state); void hydrateProposalImages();
    } else if (append) appendMoreProposals(4);
    const providerState = result.stale ? 'exacte oudere evidence' : result.degraded ? 'beperkte multi-providerdata' : 'live verrijkt';
    const accessState = state.accessNotice ? `${state.accessNotice.title}. ` : '';
    persistDraft(`${accessState}${result.destinations.length} regio’s beschikbaar (${providerState})`);
    return result.destinations.length;
  } catch (error) {
    if (error?.name === 'AbortError' || !discoveryRunIsCurrent(run.runId)) return 0;
    const reason = 'Dynamische ontdekking kon niet worden afgerond. Probeer opnieuw; de planner heeft geen ongerelateerde reizen toegevoegd.';
    console.error(error);
    if (replace) {
      state.catalog = [];
      state.ranking = buildProposalPortfolio(requestTrip, [], portfolioOptions({ limit: 8 }));
      state.ranked = [];
      renderDestinations(state); renderComparison(state);
    }
    showError(reason); setStatus(reason);
    return 0;
  } finally {
    if (discoveryRunIsCurrent(run.runId)) {
      state.discoveryBusy = false;
      if (state.discoveryController === run.controller) state.discoveryController = null;
    }
  }
}

function applyVariant(variantId) {
  const currentTrip = readTripForm(state.trip);
  state.trip = currentTrip;
  const variant = buildItineraryVariant(currentTrip, state.destination, variantId);
  state.routingRun += 1;
  const destination = { ...state.destination, ...variant.destination };
  const validation = validatePlan(state.trip, destination, variant.plan, variant.budget);
  Object.assign(state, {
    destination, selectedVariantId: variant.id, plan: variant.plan, budget: variant.budget,
    quality: variant.quality, constraintStatus: variant.constraintStatus, validation,
    optimized: false, undoSnapshot: null, optimizationSummary: null, optimizationProposal: null
  });
  $('variantSection').classList.add('hidden');
  $('planSection').classList.remove('hidden');
  $('mapHint').classList.add('hidden');
  renderPlan(state); renderOptimizationPreview(state); renderMap(state.plan);
  persistDraft(`${variant.label} reisplan opgeslagen`);
  renderDashboard(state, loadTrips());
  if (state.trip.liveData) void enhanceLiveData(destination.id, state.plan);
  if (state.trip.liveData) void hydratePlanImages(destination.id);
}

async function enhanceLiveData(destinationId, originalPlan) {
  const run = ++state.routingRun;
  $('mapDataStatus').textContent = 'Route en plaatsen laden…';
  try {
    let plan = originalPlan;
    if (routingConfigured(state.trip)) plan = await enrichPlanWithLiveRouting(state.trip, state.destination, plan);
    plan = await enrichPlanWithPlaces(state.trip, state.destination, plan);
    if (run !== state.routingRun || state.destination?.id !== destinationId) return;
    Object.assign(state, derivePlanState(state.destination, plan));
    renderPlan(state);
    renderOptimizationPreview(state);
    renderMap(state.plan);
    const liveParts = [plan.routing?.live ? 'wegroute' : null, plan.placeData?.live ? 'plaatsen' : null, plan.weather?.live ? 'weer' : null].filter(Boolean);
    persistDraft(liveParts.length ? `Live ${liveParts.join(', ')} opgeslagen` : 'Offline planning actief');
  } catch (error) {
    console.warn('Live routering niet beschikbaar', error);
    if (run === state.routingRun) $('mapDataStatus').textContent = 'Offline corridorraming';
  }
}

function rebuildFromRecord(record) {
  state.trip = normalizeTrip(record.trip);
  state.compareIds = record.compareIds || [];
  state.savedProposalIds = record.savedProposalIds || [];
  state.dismissedIds = record.dismissedIds || [];
  writeTripForm(state.trip);
  renderVehicleControls();
  syncTravelModeControls();
  state.catalog = record.destinationProfile?.dynamic ? [record.destinationProfile] : [];
  state.ranking = buildProposalPortfolio(state.trip, state.catalog, portfolioOptions({ limit: 8, excludedIds: state.dismissedIds }));
  state.ranked = state.ranking.visible;
  state.destination = state.ranking.candidates.find(item => item.id === record.destinationId) || (record.destinationProfile?.id === record.destinationId ? record.destinationProfile : null);
  if (state.destination) {
    if (record.optimized) applyDestination(state.destination, true);
    else {
      state.variants = buildItineraryVariants(state.trip, state.destination);
      applyVariant(record.selectedVariantId || 'balanced');
    }
    $('resultsSection').classList.remove('hidden');
    renderDestinations(state);
    renderComparison(state);
  }
}

function resetState(trip = defaults()) {
  state.discoveryController?.abort();
  Object.assign(state, { trip, ranked: [], ranking: null, destination: null, plan: null, budget: null, validation: [], quality: null, compareIds: [], savedProposalIds: [], dismissedIds: [], variants: [], selectedVariantId: null, optimized: false, undoSnapshot: null, optimizationSummary: null, optimizationProposal: null, assistantPreview: null, routingRun: state.routingRun + 1, catalog: [], discoveryCursor: 0, discoveryBusy: false, discoveryRunId: state.discoveryRunId + 1, discoveryController: null, accessNotice: null });
  writeTripForm(trip);
  renderVehicleControls();
  syncTravelModeControls();
  $('resultsSection').classList.add('hidden');
  $('planSection').classList.add('hidden');
  $('variantSection').classList.add('hidden');
  $('noPlanItinerary').classList.remove('hidden');
  $('mapHint').classList.remove('hidden');
  persistDraft('Nieuw concept opgeslagen');
  renderDashboard(state, loadTrips());
}

function initialize() {
  renderPreferenceGrid();
  renderVehicleControls();
  syncTravelModeControls();
  $('versionLabel').textContent = `ReisSlim v${VERSION} · Build ${BUILD} · Multi-provider travel intelligence`;
  $('orsApiKey').value = readRoutingSettings().orsApiKey;
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
  $('transport').addEventListener('change', () => {
    renderVehicleControls({ resetDefaults: true });
    state.routingRun += 1;
    state.plan = null; state.destination = null; state.variants = [];
    if (!$('resultsSection').classList.contains('hidden')) queueMicrotask(() => $('tripForm').requestSubmit());
  });
  $('travelMode').addEventListener('change', () => {
    const vehicle = { 'fly-drive': 'car', 'fly-ride': 'motorcycle', 'fly-camper': 'motorhome' }[$('travelMode').value];
    if (vehicle) $('transport').value = vehicle;
    renderVehicleControls({ resetDefaults: Boolean(vehicle) });
    syncTravelModeControls();
  });
  $('routeStyle').addEventListener('change', () => renderVehicleControls());
  $('itinerary').addEventListener('click', event => {
    const card = event.target.closest('[data-map-day]');
    if (card && highlightMapDay(card.dataset.mapDay)) showView('mapView');
  });
  $('useLocationBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { showError('Locatiebepaling wordt niet ondersteund op dit apparaat.'); return; }
    setStatus('Huidige locatie opvragen…');
    navigator.geolocation.getCurrentPosition(position => {
      const point = { lat: position.coords.latitude, lon: position.coords.longitude, name: 'Huidige locatie', source: 'Browser-geolocatie' };
      $('origin').value = 'Huidige locatie';
      state.trip = normalizeTrip({ ...readTripForm(state.trip), origin: 'Huidige locatie', originPoint: point });
      persistDraft('Huidige locatie alleen lokaal opgeslagen');
    }, () => showError('Locatie kon niet worden bepaald. Controleer de browsertoestemming.'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  });

  $('tripForm').addEventListener('submit', async event => {
    event.preventDefault();
    state.trip = readTripForm(state.trip);
    const errors = validateTripInput(state.trip);
    if (errors.length) { showError(errors.join(' ')); return; }
    const run = beginDiscoveryRun();
    showError();
    if (!state.trip.originPoint && state.trip.liveData) {
      const knownOrigin = resolveOrigin(state.trip);
      if (knownOrigin) state.trip = normalizeTrip({ ...state.trip, originPoint: knownOrigin });
      else {
        setStatus('Vertrekplaats controleren…');
        let originPoint;
        try { originPoint = await geocodeOrigin(state.trip.origin, { signal: run.signal }); }
        catch (error) {
          if (error?.name === 'AbortError' || !discoveryRunIsCurrent(run.runId)) return;
          const message = 'De vertrekplaats kon tijdelijk niet worden gecontroleerd. Probeer opnieuw.';
          showError(message); setStatus(message); state.discoveryBusy = false; state.discoveryController = null; return;
        }
        if (!discoveryRunIsCurrent(run.runId)) return;
        if (originPoint) state.trip = normalizeTrip({ ...state.trip, originPoint });
      }
      if (!resolveOrigin(state.trip)) {
        const message = 'De vertrekplaats kon door geen geocodingprovider worden gevonden. Controleer de spelling of probeer opnieuw.';
        showError(message); setStatus(message); state.discoveryBusy = false; state.discoveryController = null; return;
      }
    }
    state.dismissedIds = []; state.catalog = []; state.discoveryCursor = 0; state.accessNotice = null;
    state.preferenceProfile.privateMode = state.trip.privateMode;
    savePreferenceProfile(state.preferenceProfile);
    state.ranking = buildProposalPortfolio(state.trip, [], portfolioOptions({ limit: 8, focus: $('proposalFocus').value }));
    state.ranked = [];
    state.destination = null; state.plan = null; state.variants = []; state.selectedVariantId = null; state.undoSnapshot = null; state.optimizationSummary = null; state.optimizationProposal = null;
    $('destinationCards').innerHTML = '<div class="empty-state"><strong>Bestemming en reisregio’s dynamisch ontdekken…</strong><p>ReisSlim toont pas voorstellen nadat geocodering, ankerontdekking, clustering en de harde-voorwaardentoets klaar zijn.</p></div>';
    $('resultCount').textContent = 'Dynamische ontdekking actief';
    renderComparison(state);
    $('resultsSection').classList.remove('hidden');
    $('planSection').classList.add('hidden');
    persistDraft();
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (state.trip.liveData) await discoverLiveOptions({ replace: true, run });
    else {
      const message = 'Dynamische bestemmingontdekking is uitgeschakeld. Zonder passende opgeslagen providerdata worden geen nieuwe voorstellen gemaakt.';
      showError(message); setStatus(message); state.discoveryBusy = false; state.discoveryController = null;
    }
  });

  let autosaveTimer;
  const scheduleAutosave = () => {
    clearTimeout(autosaveTimer); setStatus('Wijzigingen opslaan…');
    autosaveTimer = setTimeout(() => {
      const nextTrip = readTripForm(state.trip);
      const materialChanged = materialTripFingerprint(state.trip) !== materialTripFingerprint(nextTrip);
      state.trip = nextTrip;
      if (materialChanged && (state.destination || state.plan || state.variants.length)) {
        state.routingRun += 1;
        state.destination = null; state.plan = null; state.budget = null; state.variants = []; state.selectedVariantId = null;
        state.validation = []; state.quality = null;
        $('planSection').classList.add('hidden'); $('variantSection').classList.add('hidden'); $('noPlanItinerary').classList.remove('hidden');
      }
      persistDraft(); renderDashboard(state, loadTrips());
    }, 250);
  };
  $('tripForm').addEventListener('input', scheduleAutosave);
  $('tripForm').addEventListener('change', scheduleAutosave);

  $('destinationCards').addEventListener('click', event => {
    const save = event.target.closest('[data-save-proposal]');
    if (save) {
      const id = save.dataset.saveProposal;
      learn(state.savedProposalIds.includes(id) ? 'dismiss' : 'save', state.ranked.find(item => item.id === id));
      state.savedProposalIds = state.savedProposalIds.includes(id) ? state.savedProposalIds.filter(item => item !== id) : [...state.savedProposalIds, id];
      renderDestinations(state); persistDraft('Bewaarde voorstellen bijgewerkt'); return;
    }
    const dismiss = event.target.closest('[data-dismiss-proposal]');
    if (dismiss) {
      const id = dismiss.dataset.dismissProposal;
      learn('dismiss', state.ranked.find(item => item.id === id));
      state.dismissedIds = [...new Set([...state.dismissedIds, id])];
      state.ranked = state.ranked.filter(item => item.id !== id);
      state.compareIds = state.compareIds.filter(item => item !== id);
      appendMoreProposals(1); return;
    }
    const select = event.target.closest('[data-select]');
    if (select) {
      const destination = state.ranked.find(item => item.id === select.dataset.select);
      if (destination) {
        if (destination.category === 'stretch' && !confirm(`Dit is een stretch-idee. ${destination.constraintStatus.summary} Toch openen?`)) return;
        chooseProposal(destination);
      }
    }
  });
  $('destinationCards').addEventListener('change', event => {
    if (!event.target.matches('[data-compare]')) return;
    const id = event.target.dataset.compare;
    if (event.target.checked && !state.compareIds.includes(id)) {
      if (state.compareIds.length >= 4) { event.target.checked = false; alert('Je kunt maximaal vier reisconcepten vergelijken.'); return; }
      state.compareIds.push(id);
    } else if (!event.target.checked) state.compareIds = state.compareIds.filter(item => item !== id);
    renderComparison(state); persistDraft();
  });
  $('clearCompareBtn').addEventListener('click', () => { state.compareIds = []; renderDestinations(state); renderComparison(state); persistDraft(); });
  $('moreProposalsBtn').addEventListener('click', async () => {
    const localCount = appendMoreProposals(4);
    if (state.trip.liveData) await discoverLiveOptions({ append: true });
    else if (!localCount) setStatus('Schakel live data in om nieuwe bestemmingen dynamisch te ontdekken');
  });
  $('proposalFocus').addEventListener('change', () => {
    state.ranking = buildProposalPortfolio(state.trip, state.catalog, portfolioOptions({ limit: 8, focus: $('proposalFocus').value, excludedIds: state.dismissedIds }));
    state.ranked = state.ranking.visible; state.compareIds = [];
    renderDestinations(state); renderComparison(state); persistDraft('Portfoliofocus bijgewerkt');
  });
  $('portfolioNotice').addEventListener('click', event => {
    if (!event.target.closest('[data-relax-constraints]')) return;
    $('strictBudget').checked = false; $('strictDrive').checked = false; $('strictChanges').checked = false;
    state.trip = readTripForm(state.trip); state.ranking = buildProposalPortfolio(state.trip, state.catalog, portfolioOptions({ limit: 8, focus: $('proposalFocus').value, excludedIds: state.dismissedIds }));
    state.ranked = state.ranking.visible; renderDestinations(state); renderComparison(state); persistDraft('Grenzen als zachte voorkeuren toegepast');
  });
  $('variantCards').addEventListener('click', event => {
    const button = event.target.closest('[data-select-variant]');
    if (button) applyVariant(button.dataset.selectVariant);
  });
  $('orsApiKey').addEventListener('change', () => {
    saveRoutingSettings({ orsApiKey: $('orsApiKey').value });
    setStatus($('orsApiKey').value.trim() ? 'OpenRouteService-sleutel lokaal opgeslagen' : 'OpenRouteService-sleutel verwijderd');
  });

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
    const locks = Object.fromEntries([...document.querySelectorAll('[data-optimizer-lock]')].map(box => [box.dataset.optimizerLock, box.checked]));
    state.optimizationProposal = proposeOptimizations(state.trip, state.destination, state.plan, { mode: $('optimizationMode').value, locks });
    renderOptimizationPreview(state);
  });
  $('applyOptimizationBtn').addEventListener('click', () => {
    if (!state.plan || !state.optimizationProposal) return;
    const actionIds = [...document.querySelectorAll('[data-optimization-action]:checked')].map(box => box.dataset.optimizationAction);
    if (!actionIds.length) { alert('Selecteer minimaal één verbetering.'); return; }
    const result = applyOptimizationProposal(state.trip, state.destination, state.plan, actionIds);
    const before = state.quality;
    const overallDelta = result.quality.rawOverall - before.rawOverall;
    const importantDelta = Math.max(...Object.keys(result.quality.rawDimensions).map(key => result.quality.rawDimensions[key] - before.rawDimensions[key]));
    const resolved = before.deductions.length > result.quality.deductions.length || (state.constraintStatus?.violations?.length || 0) > result.constraintStatus.violations.length;
    if (overallDelta < 5 && importantDelta < 10 && !resolved) { alert('Deze selectie haalt de minimale verbeterdrempel niet. Kies meer gecoördineerde wijzigingen of sluit het voorstel.'); return; }
    state.undoSnapshot = clone({ plan: state.plan, budget: state.budget, quality: state.quality, validation: state.validation, constraintStatus: state.constraintStatus, optimized: state.optimized });
    Object.assign(state, { ...result, validation: validatePlan(state.trip, state.destination, result.plan, result.budget), optimized: true });
    state.optimizationSummary = { before: before.overall, after: result.quality.overall, changes: state.optimizationProposal.actions.filter(action => actionIds.includes(action.id)).map(action => action.description) };
    state.optimizationProposal = null;
    renderPlan(state); renderOptimizationPreview(state); renderMap(state.plan); persistDraft('Geselecteerde verbeteringen opgeslagen');
  });
  $('rejectOptimizationBtn').addEventListener('click', () => {
    state.optimizationProposal = null; renderOptimizationPreview(state);
  });
  $('undoOptimizeBtn').addEventListener('click', () => {
    if (!state.undoSnapshot) return;
    Object.assign(state, state.undoSnapshot); state.undoSnapshot = null; state.optimizationSummary = null;
    state.optimizationProposal = null; renderPlan(state); renderOptimizationPreview(state); renderMap(state.plan); persistDraft('Optimalisatie ongedaan gemaakt');
  });

  $('assistantPreviewBtn').addEventListener('click', () => {
    if (!state.trip) return;
    state.assistantPreview = interpretAssistantMessage($('assistantMessage').value, state.trip);
    const preview = state.assistantPreview;
    $('assistantPreview').innerHTML = `<div class="assistant-preview-card"><strong>${preview.understood ? 'Voorgestelde wijziging' : 'Nog niet begrepen'}</strong><p>${String(preview.summary || preview.message || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character])}</p><small>${preview.understood ? 'Voorbeeldweergave: er is nog niets gewijzigd.' : 'Probeer één concrete opdracht.'}</small></div>`;
    $('assistantApplyBtn').classList.toggle('hidden', !preview.understood);
    $('assistantCancelBtn').classList.toggle('hidden', !preview.understood);
  });
  $('assistantCancelBtn').addEventListener('click', () => {
    state.assistantPreview = null; $('assistantPreview').innerHTML = '';
    $('assistantApplyBtn').classList.add('hidden'); $('assistantCancelBtn').classList.add('hidden');
  });
  $('assistantApplyBtn').addEventListener('click', () => {
    const preview = state.assistantPreview;
    if (!preview?.understood) return;
    const before = clone(state.trip);
    state.trip = normalizeTrip(applyAssistantPatch(state.trip, preview.patch));
    if (preview.patch.optimizerMode) $('optimizationMode').value = preview.patch.optimizerMode;
    writeTripForm(state.trip);
    if (state.destination) applyDestination(state.destination, false);
    state.undoAssistantTrip = before;
    state.assistantPreview = null; $('assistantPreview').innerHTML = '<div class="inline-success">Wijziging toegepast. Het plan en de controles zijn opnieuw berekend.</div>';
    $('assistantApplyBtn').classList.add('hidden'); $('assistantCancelBtn').classList.add('hidden');
  });

  document.querySelectorAll('[data-inspire]').forEach(button => button.addEventListener('click', () => {
    $('destinationQuery').value = button.textContent.trim().split('\n')[0];
    showView('plannerView');
    $('destinationQuery').focus();
  }));
}

document.addEventListener('DOMContentLoaded', initialize);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(`./service-worker.js?build=${BUILD}`).catch(error => console.warn('Service worker niet beschikbaar', error)));
