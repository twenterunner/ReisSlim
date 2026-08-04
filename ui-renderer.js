import { preferenceDefinitions, routeStyles, transportProfiles } from './config.js';
import { vehicleProfile } from './vehicle-intelligence.js';
import { weatherSuitability } from './weather-engine.js';

export const $ = id => document.getElementById(id);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function showView(viewId) {
  document.querySelectorAll('.app-view').forEach(view => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function renderPreferenceGrid() {
  $('preferenceGrid').innerHTML = preferenceDefinitions.map(([id, label], index) => `<div class="pref priority-item"><label><input type="checkbox" data-pref value="${id}" ${index < 5 ? 'checked' : ''}><span>${label}</span></label><select data-priority="${id}" aria-label="Prioriteit ${label}" ${index < 5 ? '' : 'disabled'}><option value="1">Nice to have</option><option value="2" selected>Belangrijk</option><option value="3">Essentieel</option></select></div>`).join('');
}

export function renderVehicleControls({ resetDefaults = false } = {}) {
  const id = $('transport').value;
  const profile = vehicleProfile(id);
  $('vehicleProfileTitle').textContent = profile.label;
  $('vehicleProfileSummary').textContent = `Pauze na circa ${profile.breakEveryHours} uur, ${profile.breakMinutes} minuten per ruststop. ${profile.accommodationLabel}.`;
  document.querySelectorAll('.vehicle-dimension-field').forEach(field => field.classList.toggle('hidden', !profile.supportsDimensions));
  if (resetDefaults) {
    $('fuelRangeKm').value = String(profile.defaultFuelRangeKm);
    $('routeStyle').value = id === 'motorcycle' ? 'scenic' : 'balanced';
    if (profile.supportsDimensions) {
      $('vehicleMaxSpeedKmh').value = String(profile.defaultMaxSpeedKmh);
      $('vehicleHeightM').value = String(profile.defaultHeightM);
      $('vehicleLengthM').value = String(profile.defaultLengthM);
      $('vehicleWeightKg').value = String(profile.defaultWeightKg);
    }
  }
  $('routeStyle').title = routeStyles[$('routeStyle').value]?.description || '';
}

export function showError(message = '') {
  $('formError').textContent = message;
  $('formError').classList.toggle('hidden', !message);
}

export function setStatus(message) {
  $('autosaveStatus').textContent = message;
}

function tripTitle(trip, destinationName) {
  return trip?.tripName || destinationName || `Reis vanaf ${trip?.origin || 'Nederland'}`;
}

export function renderDashboard(state, trips) {
  const trip = state.trip;
  $('savedTripCount').textContent = String(trips.length);
  $('draftDays').textContent = trip?.days ? String(trip.days) : '—';
  $('draftBudget').textContent = trip?.budget ? `€${trip.budget.toLocaleString('nl-NL')}` : '—';
  if (!trip) {
    $('currentTripSummary').textContent = 'Nog geen reisconcept.';
  } else {
    $('currentTripSummary').innerHTML = `<h3>${escapeHtml(tripTitle(trip, state.destination?.name))}</h3><div class="current-trip-details"><div><span>Vertrek</span><strong>${escapeHtml(trip.origin)}</strong></div><div><span>Start</span><strong>${escapeHtml(trip.startDate)}</strong></div><div><span>Reisduur</span><strong>${trip.days} dagen</strong></div></div>`;
  }
  $('savedTripsList').innerHTML = trips.length
    ? trips.map(item => `<article class="saved-trip"><p class="eyebrow">${escapeHtml(item.destinationId || 'Reisconcept')}</p><h3>${escapeHtml(tripTitle(item.trip))}</h3><p class="muted">${item.trip.days} dagen · €${item.trip.budget.toLocaleString('nl-NL')} · ${escapeHtml(transportProfiles[item.trip.transport]?.label || 'Auto')}</p><div class="saved-trip-actions"><button type="button" data-open-trip="${escapeHtml(item.trip.id)}">Open</button><button type="button" class="delete-trip" data-delete-trip="${escapeHtml(item.trip.id)}">Verwijder</button></div></article>`).join('')
    : '<div class="empty-state">Nog geen opgeslagen reizen. Kies een bestemming en tik op Opslaan.</div>';
}

function scorePill(label, value) {
  return `<div class="dimension-score"><span>${escapeHtml(label)}</span><strong>${value}</strong><i style="--score:${value}%"></i></div>`;
}

export function renderDestinations(state) {
  const ranking = state.ranking || { exact: state.ranked.filter(item => item.category === 'exact'), stretched: state.ranked.filter(item => item.category === 'stretch'), closestAdjustments: [] };
  $('resultCount').textContent = `${ranking.visible.length} verschillend · ${ranking.exact.length} passend · ${ranking.stretched.length} stretch`;
  const notice = $('portfolioNotice');
  const accessNotice = state.accessNotice
    ? `<div class="shortage-notice access-notice"><strong>${escapeHtml(state.accessNotice.title)}</strong><p>${escapeHtml(state.accessNotice.detail)}</p></div>`
    : '';
  const portfolioNotice = ranking.requestedMismatch
    ? `<div class="shortage-notice"><strong>${escapeHtml(ranking.requestedMismatch.name)} valt buiten je harde voorwaarden</strong><p>${escapeHtml(ranking.requestedMismatch.constraintStatus.summary)}</p><ul>${ranking.requestedMismatch.constraintStatus.violations.map(item => `<li>${escapeHtml(item.adjustment)}</li>`).join('')}</ul><p>De kaarten hieronder zijn alternatieven die wél binnen je huidige grenzen passen.</p></div>`
    : ranking.shortage
    ? `<div class="shortage-notice"><strong>Minder dan zes bruikbare opties</strong><p>${escapeHtml(ranking.shortage.explanation)}</p>${ranking.shortage.relaxations?.length ? `<ul>${ranking.shortage.relaxations.map(item => `<li>${escapeHtml(item.adjustments[0])}</li>`).join('')}</ul>` : ''}<button type="button" class="secondary" data-relax-constraints>Bekijk zachte grenzen</button></div>`
    : `<p><strong>Waarom deze mix?</strong> De selectie spreidt regio, afstand, prijs, routekarakter en reisstijl. Bijna-dubbelen worden onderdrukt; score alleen bepaalt de volgorde niet.</p>`;
  if (notice) notice.innerHTML = accessNotice + portfolioNotice;
  const card = (destination, index) => `<article class="destination-card intelligence-card ${destination.category === 'stretch' ? 'stretch-card' : 'exact-card'}"><div class="proposal-hero" data-theme="${escapeHtml(destination.proposalLabel || 'reis')}">${destination.image && safeExternalUrl(destination.image.url) ? `<img class="destination-image" src="${escapeHtml(safeExternalUrl(destination.image.url))}" alt="${escapeHtml(destination.name)}" loading="lazy">` : `<span>${destination.tags.includes('bergen') ? '🏔️' : destination.tags.includes('kust') ? '🌊' : destination.tags.includes('cultuur') ? '🏛️' : '🌿'}</span>`}<strong>${escapeHtml(destination.proposalLabel || 'Reisvoorstel')}</strong></div>${destination.image ? `<a class="proposal-attribution" href="${escapeHtml(safeExternalUrl(destination.image.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(destination.image.attribution)}</a>` : ''}<div class="destination-rank">#${index + 1}</div><div class="card-body"><div class="score">${destination.score}/100</div><p class="eyebrow">${escapeHtml(destination.country)}</p><span class="fit-badge ${destination.category}">${destination.category === 'stretch' ? 'Stretch-idee' : 'Past binnen je harde voorwaarden'}</span><h3>${escapeHtml(destination.name)}</h3><p class="muted">${escapeHtml(destination.summary)}</p><p class="proposal-shape"><strong>${escapeHtml(destination.tripShape || '')}</strong><br>${escapeHtml(destination.routeCharacter || '')}</p><p class="ai-explanation"><strong>Waarom deze?</strong> ${escapeHtml(destination.explanation)} ${escapeHtml(destination.labelReason || '')}${destination.learnedPreferenceReasons?.length ? ` Lokaal geleerd: ${escapeHtml(destination.learnedPreferenceReasons.join(', '))}.` : ''}</p><div class="constraint-summary ${destination.category}">${escapeHtml(destination.constraintStatus.summary)}</div><div class="dimension-grid">${scorePill('Budget', destination.dimensions.budget)}${scorePill('Reisbelasting', destination.dimensions.driving)}${scorePill('Seizoen', destination.dimensions.season)}${scorePill('Voertuigmatch', destination.dimensions.transport)}</div><div class="chips">${destination.matches.map(match => `<span class="chip">${escapeHtml(match)}</span>`).join('')}<span class="chip">± €${destination.estimate.toLocaleString('nl-NL')}</span><span class="chip">min. ${destination.minimumDays} dagen</span></div><div class="tradeoff"><strong>Belangrijkste afweging</strong><p>${escapeHtml(destination.keyTradeoff || destination.cons[0])}</p></div><details class="proposal-evidence"><summary>Onderbouwing & bron</summary><ul>${(destination.evidence || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><small>${escapeHtml(destination.sourceLabel || '')}</small></details><div class="card-actions proposal-actions"><button data-select="${destination.id}" type="button">${destination.category === 'stretch' ? 'Bekijk stretch-idee' : 'Kies deze reis'}</button><label class="compare-toggle"><input type="checkbox" data-compare="${destination.id}" ${state.compareIds.includes(destination.id) ? 'checked' : ''}> Vergelijk</label><button class="secondary" data-save-proposal="${destination.id}" type="button">${state.savedProposalIds?.includes(destination.id) ? 'Bewaard ✓' : 'Bewaar'}</button><button class="secondary" data-dismiss-proposal="${destination.id}" type="button">Niet voor mij</button></div></div></article>`;
  const exactHtml = ranking.exact.length
    ? `<div class="proposal-group-heading"><div><p class="eyebrow">Eerst haalbaarheid</p><h3>Past binnen je voorwaarden</h3></div><span>${ranking.exact.length}</span></div>${ranking.exact.map(card).join('')}`
    : `<div class="no-exact-results"><h3>Geen exacte match gevonden</h3><p>ReisSlim toont geen onhaalbare reis als normale aanbeveling.</p>${ranking.closestAdjustments?.length ? `<ul>${ranking.closestAdjustments.map(item => `<li><strong>${escapeHtml(item.destination)}:</strong> ${escapeHtml(item.adjustments[0])}</li>`).join('')}</ul>` : ''}</div>`;
  const stretchHtml = ranking.stretched.length
    ? `<div class="proposal-group-heading stretch-heading"><div><p class="eyebrow">Optioneel, maximaal twee</p><h3>Stretch-ideeën</h3></div><span>${ranking.stretched.length}</span></div>${ranking.stretched.map((item, index) => card(item, ranking.exact.length + index)).join('')}`
    : '';
  $('destinationCards').innerHTML = exactHtml + stretchHtml;
}

export function renderItineraryVariants(state) {
  const variants = state.variants || [];
  $('variantSection').classList.toggle('hidden', !variants.length);
  $('variantCards').innerHTML = variants.map(variant => `<article class="variant-card"><p class="eyebrow">${escapeHtml(variant.label)}</p><h3>${escapeHtml(state.destination?.name || '')}</h3><p>${escapeHtml(variant.summary)}</p><div class="variant-metrics"><span>± €${variant.metrics.total.toLocaleString('nl-NL')}</span><span>max ${variant.metrics.maxDrive.toFixed(1)} u</span><span>${variant.metrics.changes} wissels</span><span>${variant.metrics.flexDays} rustdag${variant.metrics.flexDays === 1 ? '' : 'en'}</span></div><div class="constraint-summary ${variant.constraintStatus.category}">${escapeHtml(variant.constraintStatus.summary)}</div><button type="button" data-select-variant="${variant.id}">Kies ${escapeHtml(variant.label.toLowerCase())}</button></article>`).join('');
}

export function renderOptimizationPreview(state) {
  const proposal = state.optimizationProposal;
  const preview = $('optimizationPreview');
  $('applyOptimizationBtn').classList.toggle('hidden', !proposal?.meaningful);
  $('rejectOptimizationBtn').classList.toggle('hidden', !proposal);
  if (!proposal) { preview.innerHTML = ''; return; }
  const before = proposal.before.quality.overall; const after = proposal.after.quality.overall;
  preview.innerHTML = `<div class="optimizer-verdict ${proposal.meaningful ? 'ok' : 'warn'}"><strong>${before}/100 → ${after}/100</strong><p>${escapeHtml(proposal.message)}</p><small>${escapeHtml(proposal.threshold)}</small></div>${proposal.actions.length ? `<fieldset><legend>Selecteer wijzigingen</legend>${proposal.actions.map(action => `<label class="optimizer-action"><input type="checkbox" data-optimization-action="${action.id}" checked><span><strong>${escapeHtml(action.title)}</strong><small>${escapeHtml(action.description)}</small></span></label>`).join('')}</fieldset>` : ''}`;
}

export function renderComparison(state) {
  const selected = state.compareIds.map(id => state.ranked.find(item => item.id === id)).filter(Boolean);
  $('compareSection').classList.toggle('hidden', selected.length < 2);
  if (selected.length < 2) { $('comparisonTable').innerHTML = ''; return; }
  const rows = [['Totale match', 'score'], ['Budget', 'budget'], ['Reisbelasting', 'driving'], ['Seizoen', 'season'], ['Voertuigmatch', 'transport'], ['Gezin', 'family'], ['Motor', 'motorcycle'], ['Camper/caravan', 'camper'], ['Landschap', 'scenery'], ['Wandelen', 'walking'], ['Zwemmen', 'swimming'], ['Eten', 'food'], ['Cultuur', 'culture'], ['Rust / drukte', 'crowds']];
  $('comparisonTable').innerHTML = `<table class="comparison-table"><thead><tr><th>Factor</th>${selected.map(item => `<th>${escapeHtml(item.name)}<small>± €${item.estimate.toLocaleString('nl-NL')}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([label, key]) => `<tr><th>${label}</th>${selected.map(item => `<td><strong>${key === 'score' ? item.score : item.dimensions[key]}</strong><span>/100</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const recommendationLabels = {
  accommodation: 'Overnachten', restaurant: 'Eten', activity: 'Doen',
  fuel: 'Brandstof & rust', rest: 'Ruststop', service: 'Voertuigservice'
};

function renderDayRecommendations(day) {
  if (!day.recommendations?.length) return '';
  return `<div class="day-recommendations"><h5>Waar stoppen, slapen, eten en wat te zien</h5><div class="recommendation-grid">${day.recommendations.map(item => {
    const sourceUrl = safeExternalUrl(item.url);
    return `<article class="place-proposal ${escapeHtml(item.type)}"><span>${escapeHtml(recommendationLabels[item.type] || item.type)}</span><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.reason)}</p>${item.openingHours ? `<small>Openingstijden: ${escapeHtml(item.openingHours)}</small>` : ''}${Number.isFinite(item.detourKm) ? `<small>Afstand tot planpunt: ± ${item.detourKm.toFixed(1)} km</small>` : ''}<small>${escapeHtml(item.source)} · ${item.live ? 'live locatie, beschikbaarheid controleren' : 'categorievoorstel'}</small>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Bekijk bron</a>` : ''}</article>`;
  }).join('')}</div></div>`;
}

function renderDay(day) {
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  const routeTitle = ['outward', 'return', 'transfer'].includes(day.kind) ? `${day.from} → ${day.to}` : day.location;
  const moving = Number(day.roadHours ?? day.driveHours ?? 0);
  const elapsed = Number(day.elapsedHours ?? day.driveHours ?? 0);
  const nonDriving = Number(day.breakHours || 0);
  const schedule = day.schedule || {};
  const scheduleText = schedule.departure ? `${escapeHtml(schedule.departure)} vertrek · ${escapeHtml(schedule.arrival)} aankomst` : escapeHtml(schedule.activityWindow || 'Flexibel');
  const segments = day.transportSegments?.length ? `<ul class="segment-list">${day.transportSegments.map(segment => `<li><strong>${escapeHtml(segment.mode)}</strong>: ${escapeHtml(segment.from)} → ${escapeHtml(segment.to)}${segment.durationHours ? ` · indicatief ${segment.durationHours.toFixed(1)} u` : ''} · ${segment.scheduleVerified ? 'schema bevestigd' : 'schema niet bevestigd'}</li>`).join('')}</ul>` : '';
  return `<article class="day-card ${day.kind} ${day.exceedsDailyLimit ? 'excessive' : ''}"><div class="day-card-inner"><div class="day-heading"><div><p class="eyebrow">Dag ${day.day} · ${escapeHtml(day.typeLabel)}</p><h4>${date}</h4></div><span class="day-drive">${elapsed.toFixed(1)} u lokale reistijd · ± ${day.distanceKm} km</span></div><strong>${escapeHtml(routeTitle)}</strong>${segments}<dl class="day-details"><div><dt>Tijdschema</dt><dd>${scheduleText}</dd></div><div><dt>Rijtijd</dt><dd>${moving.toFixed(1)} uur rijdend + ${nonDriving.toFixed(1)} uur pauze/aankomst</dd></div><div><dt>Waypoints</dt><dd>${day.stopCount || 0} geplande stop${day.stopCount === 1 ? '' : 's'} · ${escapeHtml(['tomtom', 'openrouteservice', 'osrm'].includes(day.routeSource) ? 'live routegeometrie' : day.routeSource === 'multimodal-planning-estimate' ? 'indicatieve logistiek' : 'offline corridorraming')}</dd></div><div><dt>Overnachting</dt><dd>${escapeHtml(day.sleepProposal?.name || day.overnight)}</dd></div><div><dt>Hoofdplan</dt><dd>${escapeHtml(day.primaryPlan)}</dd></div><div><dt>Regenalternatief</dt><dd>${escapeHtml(day.rainAlternative)}</dd></div></dl>${renderDayRecommendations(day)}${day.exceedsDailyLimit ? '<p class="limit-warning">Deze totale reisdag overschrijdt je ingestelde limiet.</p>' : ''}</div></article>`;
}

export function renderPlan(state) {
  const { trip, destination, plan, budget, validation, quality } = state;
  if (!destination || !plan) return;
  const profile = vehicleProfile(trip);
  $('planTitle').textContent = destination.name;
  $('summaryGrid').innerHTML = [
    ['Match', `${destination.score}/100`],
    ['Dagen', trip.days],
    ['Vervoer', profile.label],
    ['Voorwaarden', plan.constraintStatus?.exact ? 'Exact passend' : plan.constraintStatus?.stretch ? 'Stretch' : 'Aanpassen'],
    ['Afstand heen', `± ${plan.routeMetrics.oneWayDistanceKm} km`],
    ['Reistijd heen', `± ${plan.routeMetrics.oneWayElapsedHours.toFixed(1)} u`],
    ['Budget', `€${budget.total.toLocaleString('nl-NL')}`]
  ].map(([label, value]) => `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const planImages = [destination.image ? { name: destination.name, image: destination.image } : null, ...(destination.highlights || []).filter(item => item.image).slice(0, 4)].filter(Boolean);
  $('planImages').innerHTML = planImages.map(item => `<figure class="destination-card"><img class="destination-image" src="${escapeHtml(safeExternalUrl(item.image.url))}" alt="${escapeHtml(item.name)}" loading="lazy"><figcaption><strong>${escapeHtml(item.name)}</strong><br><a class="proposal-attribution" href="${escapeHtml(safeExternalUrl(item.image.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.image.attribution)}</a></figcaption></figure>`).join('');
  $('planImages').classList.toggle('hidden', !planImages.length);
  const omissionDetails = (plan.omittedHighlights || []).length
    ? `<details class="proposal-evidence" open><summary>Bewust weggelaten highlights</summary><ul>${plan.omittedHighlights.map(item => `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.reason)} ${item.minimumTripDays ? `Minimumreis: ${item.minimumTripDays} dagen.` : ''}</li>`).join('')}</ul><p>Indicatie voor de eerstvolgende uitbreiding: ${plan.minimumAdditionalDays || 1} extra dag(en). ReisSlim forceert deze highlights niet in een onrealistische route.</p></details>`
    : '';
  $('planWarnings').innerHTML = (plan.warnings.length ? plan.warnings.map(item => `<div class="inline-warning">${escapeHtml(item)}</div>`).join('') : '<div class="inline-success">Budget, reisduur, daglimiet en accommodatiewissels passen binnen je voorwaarden.</div>') + omissionDetails;
  const weatherDays = plan.weather?.days || [];
  $('weatherSummary').innerHTML = weatherDays.length
    ? `<strong>Weer langs de bestemming</strong><div class="weather-days">${weatherDays.slice(0, 7).map(day => { const weather = weatherSuitability(day, trip); return `<div class="weather-day"><span class="weather-icon" aria-hidden="true">${weather.icon}</span><strong>${escapeHtml(day.date.slice(5))}</strong><span>${Math.round(day.minimumC)}–${Math.round(day.maximumC)}°C</span><small>${escapeHtml(weather.label)} · ${weather.score}/100</small></div>`; }).join('')}</div><small>Bron: Open-Meteo · verwachting, geen garantie. Geschiktheid houdt rekening met voertuig, wind en neerslag.</small>`
    : '<strong>Weer</strong><p>Voor deze vertrekdatum is nog geen live verwachting beschikbaar; gebruik de seizoensinschatting en controleer kort voor vertrek.</p>';
  $('itinerary').innerHTML = plan.days.map(renderDay).join('');
  [...$('itinerary').querySelectorAll('.day-card')].forEach((card, index) => {
    card.dataset.mapDay = String(plan.days[index]?.day || index + 1);
    card.title = `Tik om dag ${card.dataset.mapDay} op de kaart te markeren`;
  });
  $('budgetSummary').innerHTML = [['Lage raming', `€${budget.lowTotal.toLocaleString('nl-NL')}`], ['Centrale raming', `€${budget.total.toLocaleString('nl-NL')}`], ['Hoge raming', `€${budget.conservativeTotal.toLocaleString('nl-NL')}`], [budget.remaining >= 0 ? 'Resterend' : 'Overschrijding', `${budget.remaining >= 0 ? '' : '−'}€${Math.abs(budget.remaining).toLocaleString('nl-NL')}`]].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('budgetBreakdown').innerHTML = budget.rows.map(([label, amount]) => `<div class="budget-row"><span>${escapeHtml(label)}</span><strong>€${amount.toLocaleString('nl-NL')}</strong></div>`).join('') + `<div class="budget-row total"><strong>Totaal</strong><strong>€${budget.total.toLocaleString('nl-NL')}</strong></div>`;
  $('budgetAssumptions').innerHTML = `<summary>Aannames en vertrouwen</summary><p>Ramingvertrouwen: <strong>${escapeHtml(budget.confidence)}</strong>. Brandstof €${budget.assumptions.fuelPricePerLitre.toFixed(2)}/l, verbruik ${budget.assumptions.consumption} l/100 km, onvoorzien ${Math.round(budget.assumptions.contingencyRate * 100)}%. Overnachtingstype: ${escapeHtml(profile.accommodationLabel)}. Prijzen zijn niet-live.</p>`;
  $('validationList').innerHTML = validation.map(item => `<div class="validation-row ${item.level}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.detail)}</strong></div>`).join('');
  const labels = { driving: 'Rijden', budget: 'Budget', relaxation: 'Ontspanning', family: 'Familie', adventure: 'Avontuur', weather: 'Weerbestendigheid', variety: 'Variatie', crowds: 'Rust / drukte', realism: 'Realisme', completeness: 'Compleetheid', routeEfficiency: 'Route-efficiëntie', routeExploration: 'Routeverkenning', vehicleSuitability: 'Voertuigmatch', safetyReadiness: 'Veiligheid', poiQuality: 'Plaatskwaliteit', bookingReadiness: 'Boekbaarheid', documentationReadiness: 'Documenten' };
  $('qualityScore').textContent = quality.overall;
  $('qualityVerdict').textContent = quality.overall >= 85 ? 'Sterk plan' : quality.overall >= 70 ? 'Goed, met verbeterpunten' : 'Aanpassing aanbevolen';
  $('qualityDisclaimer').textContent = quality.disclaimer;
  $('qualityDimensions').innerHTML = Object.entries(quality.dimensions).map(([key, value]) => `<div class="quality-row"><span>${labels[key]}</span><div class="quality-bar"><i style="width:${value}%"></i></div><strong>${value}/100</strong></div>`).join('');
  $('qualityDeductions').innerHTML = quality.deductions.length ? `<h3>Belangrijkste aftrek</h3><ul>${quality.deductions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  $('qualityRecommendations').innerHTML = quality.recommendations.map((item, index) => `<li><span>${index + 1}</span><p>${escapeHtml(item.text)}<small>Mogelijke verbetering: ${item.impact ? `tot +${item.impact}` : 'behouden'} punten op dit onderdeel</small></p></li>`).join('');
  $('optimizerSection').classList.remove('hidden');
  $('undoOptimizeBtn').classList.toggle('hidden', !state.undoSnapshot);
  $('optimizationSummary').innerHTML = state.optimizationSummary ? `<strong>Voor ${state.optimizationSummary.before}/100 → na ${state.optimizationSummary.after}/100</strong><ul>${state.optimizationSummary.changes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  $('mapDataStatus').textContent = `${plan.routing?.label || 'Offline corridorraming'} · ${plan.placeData?.live ? `${plan.placeData.namedPlaces} live plaatsen` : 'offline plaatsen'}`;
  $('gpxNotice').textContent = plan.routing?.live
    ? 'GPX gebruikt live routegeometrie en gekozen waypoints; controleer de route vóór vertrek.'
    : 'GPX gebruikt offline corridorpunten en voertuiggerichte waypoints, geen gegarandeerde turn-by-turn route.';
  const readiness = plan.readiness;
  $('readinessScore').textContent = readiness ? `${readiness.score}/100` : '—';
  $('readinessDisclaimer').textContent = readiness?.disclaimer || '';
  $('readinessList').innerHTML = (readiness?.items || []).map(item => `<div class="readiness-row"><span class="readiness-status">${escapeHtml(item.status)}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small>${item.action ? `<small><strong>Actie:</strong> ${escapeHtml(item.action)}</small>` : ''}</div>${safeExternalUrl(item.url) ? `<a href="${escapeHtml(safeExternalUrl(item.url))}" target="_blank" rel="noopener noreferrer">Officiële bron</a>` : ''}</div>`).join('');
}
