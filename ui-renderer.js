import { preferenceDefinitions, transportProfiles } from './config.js';

export const $ = id => document.getElementById(id);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);

export function showView(viewId) {
  document.querySelectorAll('.app-view').forEach(view => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function renderPreferenceGrid() {
  $('preferenceGrid').innerHTML = preferenceDefinitions.map(([id, label], index) => `<div class="pref priority-item"><label><input type="checkbox" data-pref value="${id}" ${index < 5 ? 'checked' : ''}><span>${label}</span></label><select data-priority="${id}" aria-label="Prioriteit ${label}" ${index < 5 ? '' : 'disabled'}><option value="1">Nice to have</option><option value="2" selected>Belangrijk</option><option value="3">Essentieel</option></select></div>`).join('');
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
  $('savedTripsList').innerHTML = trips.length ? trips.map(item => `<article class="saved-trip"><p class="eyebrow">${escapeHtml(item.destinationId || 'Reisconcept')}</p><h3>${escapeHtml(tripTitle(item.trip))}</h3><p class="muted">${item.trip.days} dagen · €${item.trip.budget.toLocaleString('nl-NL')} · ${transportProfiles[item.trip.transport]?.label || 'Auto'}</p><div class="saved-trip-actions"><button type="button" data-open-trip="${escapeHtml(item.trip.id)}">Open</button><button type="button" class="delete-trip" data-delete-trip="${escapeHtml(item.trip.id)}">Verwijder</button></div></article>`).join('') : '<div class="empty-state">Nog geen opgeslagen reizen. Kies een bestemming en tik op Opslaan.</div>';
}

function scorePill(label, value) {
  return `<div class="dimension-score"><span>${escapeHtml(label)}</span><strong>${value}</strong><i style="--score:${value}%"></i></div>`;
}

export function renderDestinations(state) {
  $('resultCount').textContent = `${state.ranked.length} opties`;
  $('destinationCards').innerHTML = state.ranked.map((destination, index) => `<article class="destination-card intelligence-card ${destination.feasible ? '' : 'not-feasible'}"><div class="destination-rank">#${index + 1}</div><div class="card-body"><div class="score">${destination.score}/100</div><p class="eyebrow">${escapeHtml(destination.country)}</p><h3>${escapeHtml(destination.name)}</h3><p class="muted">${escapeHtml(destination.summary)}</p><p class="ai-explanation"><strong>Waarom deze?</strong> ${escapeHtml(destination.explanation)}</p><div class="confidence-row"><span>Ramingvertrouwen</span><strong>${escapeHtml(destination.confidence)}</strong></div><div class="dimension-grid">${scorePill('Budget', destination.dimensions.budget)}${scorePill('Rijbelasting', destination.dimensions.driving)}${scorePill('Seizoen', destination.dimensions.season)}${scorePill('Landschap', destination.dimensions.scenery)}</div><div class="chips">${destination.matches.map(match => `<span class="chip">${escapeHtml(match)}</span>`).join('')}<span class="chip">± €${destination.estimate.toLocaleString('nl-NL')}</span><span class="chip">min. ${destination.minimumDays} dagen</span></div>${destination.compromises.length ? `<div class="compromise"><strong>Compromissen</strong><ul>${destination.compromises.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}<div class="pros-cons"><div><strong>Sterk</strong><ul>${destination.pros.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div><div><strong>Let op</strong><ul>${destination.cons.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div></div><div class="card-actions"><button data-select="${destination.id}" type="button">Kies deze reis</button><label class="compare-toggle"><input type="checkbox" data-compare="${destination.id}" ${state.compareIds.includes(destination.id) ? 'checked' : ''}> Vergelijk</label></div></div></article>`).join('');
}

export function renderComparison(state) {
  const selected = state.compareIds.map(id => state.ranked.find(item => item.id === id)).filter(Boolean);
  $('compareSection').classList.toggle('hidden', selected.length < 2);
  if (selected.length < 2) { $('comparisonTable').innerHTML = ''; return; }
  const rows = [['Totale match', 'score'], ['Budget', 'budget'], ['Rijbelasting', 'driving'], ['Seizoen', 'season'], ['Gezin', 'family'], ['Motor', 'motorcycle'], ['Camper', 'camper'], ['Landschap', 'scenery'], ['Wandelen', 'walking'], ['Zwemmen', 'swimming'], ['Eten', 'food'], ['Cultuur', 'culture'], ['Rust / drukte', 'crowds']];
  $('comparisonTable').innerHTML = `<table class="comparison-table"><thead><tr><th>Factor</th>${selected.map(item => `<th>${escapeHtml(item.name)}<small>± €${item.estimate.toLocaleString('nl-NL')}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([label, key]) => `<tr><th>${label}</th>${selected.map(item => `<td><strong>${key === 'score' ? item.score : item.dimensions[key]}</strong><span>/100</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function renderPlan(state) {
  const { trip, destination, plan, budget, validation, quality } = state;
  if (!destination || !plan) return;
  $('planTitle').textContent = destination.name;
  $('summaryGrid').innerHTML = [['Match', `${destination.score}/100`], ['Dagen', trip.days], ['Afstand heen', `± ${plan.routeMetrics.oneWayDistanceKm} km`], ['Budget', `€${budget.total.toLocaleString('nl-NL')}`]].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('planWarnings').innerHTML = plan.warnings.length ? plan.warnings.map(item => `<div class="inline-warning">${escapeHtml(item)}</div>`).join('') : '<div class="inline-success">De gekozen duur en rijlimiet zijn verenigbaar.</div>';
  $('itinerary').innerHTML = plan.days.map(day => `<article class="day-card ${day.kind} ${day.exceedsDailyLimit ? 'excessive' : ''}"><div class="day-card-inner"><div class="day-heading"><div><p class="eyebrow">Dag ${day.day} · ${escapeHtml(day.typeLabel)}</p><h4>${new Date(`${day.date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}</h4></div><span class="day-drive">${day.driveHours.toFixed(1)} u · ± ${day.distanceKm} km</span></div><strong>${escapeHtml(['outward', 'return', 'transfer'].includes(day.kind) ? `${day.from} → ${day.to}` : day.location)}</strong><dl class="day-details"><div><dt>Overnachting</dt><dd>${escapeHtml(day.overnight)}</dd></div><div><dt>Hoofdplan</dt><dd>${escapeHtml(day.primaryPlan)}</dd></div><div><dt>Regenalternatief</dt><dd>${escapeHtml(day.rainAlternative)}</dd></div></dl>${day.exceedsDailyLimit ? '<p class="limit-warning">Deze rijdag overschrijdt je ingestelde limiet.</p>' : ''}</div></article>`).join('');
  $('budgetSummary').innerHTML = [['Totaal', `€${budget.total.toLocaleString('nl-NL')}`], ['Per dag', `€${budget.perDay.toLocaleString('nl-NL')}`], ['Per reiziger-equivalent', `€${budget.perTravellerEquivalent.toLocaleString('nl-NL')}`], [budget.remaining >= 0 ? 'Resterend' : 'Overschrijding', `${budget.remaining >= 0 ? '' : '−'}€${Math.abs(budget.remaining).toLocaleString('nl-NL')}`]].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('budgetBreakdown').innerHTML = budget.rows.map(([label, amount]) => `<div class="budget-row"><span>${escapeHtml(label)}</span><strong>€${amount.toLocaleString('nl-NL')}</strong></div>`).join('') + `<div class="budget-row total"><strong>Totaal</strong><strong>€${budget.total.toLocaleString('nl-NL')}</strong></div>`;
  $('budgetAssumptions').innerHTML = `<summary>Aannames en vertrouwen</summary><p>Ramingvertrouwen: <strong>${escapeHtml(budget.confidence)}</strong>. Brandstof €${budget.assumptions.fuelPricePerLitre.toFixed(2)}/l, verbruik ${budget.assumptions.consumption} l/100 km, onvoorzien ${Math.round(budget.assumptions.contingencyRate * 100)}%. Prijzen zijn niet-live.</p>`;
  $('validationList').innerHTML = validation.map(item => `<div class="validation-row ${item.level}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.detail)}</strong></div>`).join('');
  const labels = { driving: 'Rijden', budget: 'Budget', relaxation: 'Ontspanning', family: 'Familie', adventure: 'Avontuur', weather: 'Weerbestendigheid', variety: 'Variatie', crowds: 'Rust / drukte', realism: 'Realisme' };
  $('qualityScore').textContent = quality.overall;
  $('qualityVerdict').textContent = quality.overall >= 85 ? 'Sterk plan' : quality.overall >= 70 ? 'Goed, met verbeterpunten' : 'Aanpassing aanbevolen';
  $('qualityDisclaimer').textContent = quality.disclaimer;
  $('qualityDimensions').innerHTML = Object.entries(quality.dimensions).map(([key, value]) => `<div class="quality-row"><span>${labels[key]}</span><div class="quality-bar"><i style="width:${value}%"></i></div><strong>${value}/100</strong></div>`).join('');
  $('qualityDeductions').innerHTML = quality.deductions.length ? `<h3>Belangrijkste aftrek</h3><ul>${quality.deductions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  $('qualityRecommendations').innerHTML = quality.recommendations.map((item, index) => `<li><span>${index + 1}</span><p>${escapeHtml(item.text)}<small>Mogelijke verbetering: ${item.impact ? `tot +${item.impact}` : 'behouden'} punten op dit onderdeel</small></p></li>`).join('');
  $('optimizerSection').classList.remove('hidden');
  $('undoOptimizeBtn').classList.toggle('hidden', !state.undoSnapshot);
  $('optimizationSummary').innerHTML = state.optimizationSummary ? `<strong>Voor ${state.optimizationSummary.before}/100 → na ${state.optimizationSummary.after}/100</strong><ul>${state.optimizationSummary.changes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  $('gpxNotice').textContent = 'GPX is een indicatieve planningstrack met dagpunten, geen gegarandeerde turn-by-turn route.';
}
