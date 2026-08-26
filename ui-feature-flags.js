const REISSLIM_RELEASE = Object.freeze({ version: '1.4.1', build: '1401' });

function addRevisionToHeader() {
  const brand = document.querySelector('.brand');
  if (!brand || document.getElementById('headerRevision')) return;
  const badge = document.createElement('span');
  badge.id = 'headerRevision';
  badge.className = 'header-revision';
  badge.textContent = `v${REISSLIM_RELEASE.version} · ${REISSLIM_RELEASE.build}`;
  badge.style.cssText = 'font-size:11px;font-weight:700;opacity:.82;white-space:nowrap;margin-left:8px;';
  brand.appendChild(badge);
}

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
  document.addEventListener('DOMContentLoaded', () => { addRevisionToHeader(); hideTravelReadiness(); }, { once: true });
} else {
  addRevisionToHeader();
  hideTravelReadiness();
}
