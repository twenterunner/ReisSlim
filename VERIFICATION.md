# LabOS Prototype v0.4.0 — Verification Record

Verification date: 4 September 2026

## Final acceptance result

**PASS** — v0.4.0 fixes the reported Cost & Finance / Programme Builder failures and converts Specifications and Requirements into operational workflow-control views.

## Reported-defect closure

### Cost & Finance — PASS

- Portfolio Cost & Finance route renders and remains interactive.
- Programme selector opens leg-level financial control.
- Budget, estimate, actual-to-date, estimate-to-complete, forecast-at-completion and variance are calculated from the canonical cost model.
- Cost rate-card modal works.
- Budget edit/save works and persists.
- The budget editor now uses the same effective/derived programme budget shown in the financial dashboard when no explicit budget was previously stored.
- Cost CSV export remains available.

### Build Programme — PASS

Two implementation defects were corrected:

1. the Test Library selector is a semantic HTML table, but an older CSS rule forced `.builder-library` to `display:grid`; v0.4.0 explicitly restores table layout and interaction;
2. **Create & Auto Plan** successfully created a programme but then navigated into Planning where the project-plan renderer was missing. `renderProjectPlanRows()` plus project/leg planning controls are now implemented.

Acceptance test: quick-start template with four existing methods + one custom method → programme created → five test legs → one development task → specification record → automatic planning → project planning page with five editable leg rows. **PASS**.

### Requirements & Coverage — PASS

The view now operates as a coverage workbench rather than a passive requirement list:

- source/customer need;
- objective acceptance criterion;
- controlled specification basis;
- coverage decision;
- existing released method versus method-development need;
- linked test legs/DUT demand;
- forecast coverage cost;
- planned evidence and verification status.

Creating coverage directly from a Not Covered requirement was browser-tested and created canonical test demand successfully.

### Specifications & Test Basis — PASS

The view now operates as the controlled executable test basis:

- specification/revision and local document;
- requirement mapping;
- objective acceptance readiness;
- method/revision readiness;
- historical specification-caused issues;
- tests blocked by specification release;
- change-impact view;
- six-point structured Review / Release gate.

Specification review/release save was interaction-tested at 100% readiness and recalculated the laboratory plan successfully.

## Project planning controls — PASS

Planning now supports portfolio and single-project views. For a selected project the UI exposes:

- programme priority and business score;
- release gate;
- programme due date;
- budget and programme manager;
- per-leg sample/DUT ready date;
- per-leg required completion;
- automatic/preferred/required staff policy;
- selected preferred/required staff member;
- method release/development state;
- forecast leg cost;
- planned equipment/staff/date;
- blocker/explanation;
- manual booking / lock control.

Project-control save was interaction-tested and recalculated the shared laboratory plan while preserving diagnostics PASS.

## In-app diagnostics — PASS 18/18

Administration → **Run System Verification** reports **18/18 PASS**, covering canonical references, resource overlaps, calibration, competency, critical requirement coverage, durations, dependencies, result evaluation, seeded dataset integrity, specification traceability, disruption inputs, lessons-learned classification, KPI history, cost roll-up/components, sample readiness and programme/specification release gates.

## Extended deterministic model verification — PASS

`node verify-model.mjs` passes all extended checks, including:

- 10 seeded programmes, 60 requirements, 50 test legs and 100 DUTs;
- every seeded requirement has an objective acceptance criterion and controlled specification basis;
- 10 local dummy test specifications;
- period KPI and lessons-learned history;
- sample-delay constraints;
- week/month/custom-period KPI reconciliation;
- Test Execution versus Bad Specification root-cause analytics;
- project-priority scenario changing **17 bookings**;
- calibration effective-date logic;
- capacity/batching;
- development gating;
- predecessor sequencing;
- direct priority promotion changing **26 bookings**;
- equipment-outage scenario changing **2 bookings**;
- invalid manual assignment rejection;
- deterministic non-negative test-leg costs;
- programme/portfolio cost reconciliation;
- sample-ready constraints;
- programme/specification release gates;
- example operational documents/templates;
- JSON state round-trip;
- deterministic planning performance comfortably below one second on the seeded dataset.

## Browser/UI smoke verification — PASS

The final v0.4.0 static UI was tested using an in-memory browser-origin harness because the execution environment blocks normal localhost/file navigation.

Verified:

- all **15** primary routes;
- Requirements coverage workbench and Create Coverage action;
- Specifications readiness board and six-point review modal;
- Cost & Finance portfolio view, programme drill-down and budget modal;
- Programme Builder table layout, quick-start template, existing-method selection and custom method development;
- Create & Auto Plan end-to-end;
- resulting project planning view and project controls;
- dynamically created programme preserving **18/18 PASS** integrity;
- 390 px mobile viewport on Requirements, Specifications, Builder, Cost & Finance and Planning with no page-level horizontal overflow;
- uncaught browser JavaScript errors: **0**.

Additional interaction pass verified:

- cost budget save/close;
- specification release review save/close;
- project planning control save/replan;
- diagnostics remained **PASS** after those mutations.

## Cache/update reliability — PASS

The service worker cache is versioned `labos-v0.4.0`. HTML, JavaScript, CSS and the web manifest use a **network-first** update strategy with cache fallback, reducing the risk that GitHub Pages serves a new navigation shell with stale cached application code. Bundled PDFs/CSVs remain available through cache fallback.

## Included example files

- 31 synthetic calibration certificate PDFs;
- 10 synthetic test-specification PDFs;
- `LabOS-Test-Programme-Template.pdf`;
- `LabOS-Test-Programme-Template.csv`;
- `LabOS-Requirements-Import-Template.csv`;
- `LabOS-Specification-Review-Checklist.csv`;
- `LabOS-Cost-Framework-Guide.pdf`;
- `LabOS-Cost-Rate-Card.csv`;
- `LabOS-Sample-Test-Report.pdf`;
- `LabOS-Method-Development-Plan.pdf`.

## Final package integrity

- root files: **65**;
- nested paths/directories in ZIP: **0**;
- service-worker asset references: **60/60 resolve**;
- bundled PDFs: **45/45 structurally valid**;
- bundled operational CSV examples: **4**;
- ZIP CRC/integrity test: **PASS**.

## Flat repository requirement

**PASS** — all 65 deployable/source/example files are placed directly at repository/ZIP root. No nested application directory is required.
