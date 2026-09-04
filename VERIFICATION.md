# LabOS Prototype v0.2.0 — Verification Record

Verification date: 4 September 2026

## Delivered deterministic dataset

- Programmes: 10
- Validation requirements: 60
- Test legs: 50
- DUTs: 100
- Test-library methods: 30
- Test specifications: 10
- Historical/current test runs: 100
- Historical/current issue records: 46
- Operational disruption records: 3
- Equipment assets: 33
- Staff: 15
- Calibration records: 36
- Test-development tasks: 5
- Numeric/result records: 40
- Synthetic calibration certificate PDFs: 31
- Synthetic test-specification PDFs: 10

## In-app diagnostics — PASS 14/14

Administration → Run System Verification checks canonical integrity including:

1. orphaned record references;
2. equipment booking overlaps;
3. staff booking overlaps;
4. calibration validity in the future plan;
5. qualified staff allocations;
6. critical requirement coverage;
7. test-library duration integrity;
8. dependency graph integrity;
9. deterministic numeric result evaluation;
10. base demo dataset scale;
11. specification traceability;
12. operational disruption input integrity;
13. lessons-learned / issue root-cause classification;
14. period-KPI historical data integrity.

Result: **PASS — 14/14**.

## Extended deterministic model verification — PASS

`npm test` and `npm run verify` execute `verify-model.mjs`. The final v0.2.0 build passed checks for:

- deterministic seeded dataset scale;
- reusable method/resource dataset scale;
- 10 seeded test specifications with viewable local documents;
- sufficient historical test-run and issue history for period analytics;
- active sample-availability delay becoming a real scheduling constraint;
- week/month/custom-period KPI calculations reconciling executions, issues and utilisation;
- automatic lessons learned separating Test Execution from Bad Specification causes;
- a project-priority strategy materially changing the schedule (**23 booking changes** in the deterministic scenario check);
- current calibration status excluding a future scheduled calibration;
- future planning using scheduled recalibration only after its effective date;
- equipment/DUT capacity producing deterministic multi-batch planning;
- development-gated tests not planning before forecast method release;
- predecessor sequencing;
- normal programme-priority promotion materially replanning the schedule (**25 booking changes** in the deterministic check);
- a seven-day equipment-outage scenario changing the plan;
- rejection of an unqualified/unauthorised manual assignment;
- full JSON canonical-state round-trip;
- initial deterministic scheduling comfortably below the two-second verification target (approximately **48 ms** in the build environment).

Result: **PASS**.

## Browser/UI smoke verification — PASS

A headless Chromium smoke harness loaded the final HTML/CSS and the final JavaScript module sources using an in-memory origin/storage shim because the execution sandbox blocks browser navigation to localhost/file URLs. The application logic and UI modules themselves were not modified for the smoke run.

Verified:

- application initialisation;
- all **13** primary routes;
- this-week, this-month, 30-day and custom KPI presets;
- explicit week picker;
- explicit month picker;
- visual dashboard SVG/bar/donut widgets;
- 10 seeded specifications visible;
- Upload Test Specification modal;
- test-specification file upload and save flow;
- visual analytics;
- Automatic Lessons Learned panel;
- Test Execution vs Bad Specification classification visibility;
- Update Plan Now control;
- four project-priority scenario cards;
- priority-scenario application;
- Log Delay / Test Issue workflow;
- equipment-outage validation requiring an affected asset;
- Sample Delay → Save & Update Plan workflow;
- Administration verification showing **PASS 14/14**;
- responsive 390 × 844 phone viewport;
- page-level horizontal overflow: **none** (`scrollWidth = clientWidth = 390`);
- uncaught browser JavaScript errors: **0**;
- browser console errors/warnings in the smoke run: **0**.

The real `storage.js` IndexedDB/localStorage persistence implementation is unchanged in architecture from the previous build; model JSON round-trip remains independently verified. GitHub Pages/local-server deployment uses the real storage module, not the smoke-run in-memory shim.

## Static/deployment verification — PASS

Final package checks:

- JavaScript syntax checks: PASS
- Navigation routes mapped to views: **13/13**
- UI `data-act` actions mapped to handlers: **25/25**
- Service-worker pre-cache references: **51/51 present**
- Local static-server retrieval of service-worker assets: **51/51 HTTP 200**
- Bundled PDF documents: **41/41 structurally valid PDFs**
  - calibration certificates: 31
  - test specifications: 10
- root application files: **56**
- subdirectories in deployable root: **0**
- GitHub Pages resource paths: repository-relative / relative-path safe

## v0.2.0-specific acceptance coverage

### Test specification capability

PASS — seeded specs, local PDFs, metadata linkage, search/drill-down and user file upload are implemented.

### Arbitrary-period KPIs

PASS — Dashboard and Analytics recalculate for selected week, month, common presets and arbitrary start/end dates.

### Operational replan

PASS — sample/DUT delays, test issues, equipment interruptions and resource constraints can be logged as active planning inputs; **Update Plan Now** reruns deterministic planning around current constraints.

### Priority scenarios

PASS — multiple alternative project-priority strategies are compared non-destructively and can be applied to the current plan.

### Lessons learned / issue Pareto

PASS — issue occurrence and delay impact are ranked automatically, with explicit root-cause separation including **Test Execution** and **Bad Specification**.

### Visual KPI upgrade

PASS — visual period KPI cards, trend graphs, horizontal ranked bars, outcome mix, root-cause donut, capacity/utilisation visuals and priority-scenario cards are included.

## Flat repository structure

PASS — the final deployable ZIP contains **no folders**. HTML, CSS, JavaScript, manifest, icon, README, verification file, all calibration PDFs and all test-specification PDFs sit directly at ZIP root.
