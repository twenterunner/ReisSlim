// Temporary UI feature flags for ReisSlim.
// Travel Readiness is intentionally hidden in this release and can be restored
// later without deleting the underlying planning/readiness logic.

function hideTravelReadiness() {
  const score = document.getElementById('readinessScore');
  const list = document.getElementById('readinessList');
  const disclaimer = document.getElementById('readinessDisclaimer');

  // Keep the elements in the DOM because the current renderer still writes to
  // them, but hide their containing panel so no runtime null errors are created.
  const anchor = score || list || disclaimer;
  const panel = anchor?.closest('section, article, .panel');
  if (panel) {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.dataset.featureHidden = 'travel-readiness';
  }

  // Remove readiness wording from the dashboard introduction while the feature
  // is disabled.
  document.querySelectorAll('.welcome-card p, .intro-card p').forEach(node => {
    node.textContent = node.textContent
      .replace(/,\s*readiness\b/gi, '')
      .replace(/\breadiness,\s*/gi, '');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideTravelReadiness, { once: true });
} else {
  hideTravelReadiness();
}
