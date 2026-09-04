# LabOS Prototype v0.3.0 — Verification Record

Verification date: 4 September 2026

## Final acceptance result

**PASS** — v0.3.0 deterministic model verification and in-app integrity suite pass after the cost/project-planning/programme-builder upgrade.

## In-app diagnostics — PASS 18/18

Administration → **Run System Verification** checks canonical integrity across the application. The final build reports **18/18 PASS**.

Coverage includes:

1. orphan/reference integrity;
2. equipment booking overlaps;
3. staff booking overlaps;
4. calibration validity in future planning;
5. competent/authorised staff allocations;
6. critical requirement coverage;
7. test-library duration integrity;
8. dependency graph integrity;
9. deterministic numeric result evaluation;
10. base seeded dataset integrity;
11. specification traceability;
12. operational disruption integrity;
13. issue/root-cause classification;
14. period-KPI history integrity;
15. cost roll-up integrity;
16. cost-component validity;
17. future sample-ready constraint integrity;
18. release-gate integrity for programmes/specifications.

## Extended deterministic model verification — PASS

`node verify-model.mjs` passes the complete extended suite in the delivered build.

Verified behaviour includes:

- deterministic seeded programme/requirements/test-resource scale;
- seeded test specifications with valid local document references;
- sufficient historical test-run/issue history for visual period analytics;
- active sample availability delays becoming real planning constraints;
- week/month/custom-period KPI reconciliation;
- automatic lessons learned separating Test Execution and Bad Specification causes;
- project-priority scenario materially changing the plan (**17 booking changes** in the deterministic scenario test);
- current calibration status excluding future scheduled calibration;
- future scheduling using scheduled recalibration only after its effective date;
- equipment/DUT capacity producing deterministic multi-batch planning;
- method-development gating;
- predecessor sequencing;
- normal programme-priority promotion materially replanning the schedule (**26 booking changes**);
- equipment-outage scenario changing the plan (**2 booking changes** in the deterministic test);
- rejection of invalid manual staff/equipment authorisation;
- finite, non-negative test-leg cost components;
- programme and portfolio cost roll-ups reconciling to canonical test legs;
- all future planned legs respecting project/sample-ready inputs;
- Draft/unreleased programme and specification gates preventing committed-capacity consumption;
- operational example documents/templates present;
- full JSON canonical-state round trip;
- deterministic initial scheduling completing comfortably in the build environment (about **47 ms** in the final model run).

Result: **PASS**.

## v0.3.0 operational acceptance coverage

### Test cost framework

**PASS** — labour, equipment, consumable/external, development, overhead and contingency costs are calculated from canonical records. Leg, programme and portfolio roll-ups reconcile. Programme budget/forecast/variance and cost CSV export are implemented.

### Project-specific planning

**PASS** — planning can be viewed portfolio-wide or for a selected project. Project controls can modify priority, business score, due date, budget, release gate, owner, sample readiness and leg/staff policy; save/replan uses the shared laboratory schedule.

### Test Programme Builder

**PASS** — a new programme can be built from scratch with DUT count, selected existing methods, a completely new method, preferred/required staff policy, budget and due date. New methods create method-development tasks and dependent validation legs.

### Lessons learned during programme design

**PASS** — selected methods expose historical recurring issues, Test Execution versus Bad Specification causes, delay impact, actual-vs-standard duration signals, competency coverage and development exposure before programme creation.

### Release/readiness controls

**PASS** — draft/unreleased programme/specification gates and future sample-ready dates are planning constraints. Qualification validity is checked through attended future work.

### Operational example content

**PASS** — the package contains example cost, programme, test-report and development-plan documents in addition to the existing test specifications and calibration certificates.

## Browser/UI smoke verification — PASS

The final v0.3.0 UI was smoke-tested after the new cost and programme-control implementation using the same in-memory browser-origin harness used for the static prototype because the execution environment restricts direct browser navigation to local origins.

Verified in the completed pass:

- application initialisation;
- all **15** primary routes;
- Dashboard visual KPI period controls;
- Requirements and Specifications;
- Programmes;
- portfolio planning;
- single-project planning;
- project planning controls and laboratory replan;
- Test Programme Builder;
- existing-method selection;
- creation of a new method plus development task;
- Create & Auto Plan workflow;
- Test Execution;
- DUTs;
- Test Library cost/lessons intelligence;
- Test Cost & Finance;
- Equipment;
- Calibration;
- People & Skills;
- Analytics/lessons learned;
- Administration verification;
- dynamically created programme preserving **18/18 PASS** integrity;
- 390 px mobile viewport with no page-level horizontal overflow;
- uncaught browser JavaScript errors: **0**.

## Static/deployment verification

Final package checks performed before ZIP creation:

- JavaScript/model verification: **PASS**;
- primary navigation routes present: **15**;
- service-worker cache references resolve to root files: **PASS**;
- bundled PDFs structurally readable: **PASS**;
- repository-relative resource references retained;
- deployable source directory contains no nested subdirectories;
- GitHub Pages does not require a build process.

## Included example documents

- 31 synthetic calibration certificate PDFs;
- 10 synthetic test-specification PDFs;
- `LabOS-Test-Programme-Template.pdf`;
- `LabOS-Test-Programme-Template.csv`;
- `LabOS-Cost-Framework-Guide.pdf`;
- `LabOS-Cost-Rate-Card.csv`;
- `LabOS-Sample-Test-Report.pdf`;
- `LabOS-Method-Development-Plan.pdf`.

## Flat repository requirement

**PASS** — all deployable files are placed directly at repository/ZIP root. No nested directories are required or included.
