# LabOS Prototype v0.4.0

LabOS is a static, browser-only laboratory operations prototype combining LIMS, validation requirements management, specification control, test-programme design, deterministic resource-constrained planning, equipment/calibration management, people/competency management, test-development management, programme prioritisation, cost management, capacity analytics, lessons learned and management decision support.

The application is intentionally deployable directly on GitHub Pages with no backend, login, API key, npm build or external service required at runtime.

## Core operating model

The canonical workflow is:

**requirements → specifications → test programme → test legs → DUT/sample demand → method availability/development → resource-constrained planning → execution → evidence/results → issues/lessons learned → cost/delivery/capacity management**

All major views operate on the same browser-local canonical data model rather than duplicate demo-only representations.

## New in v0.4.0

### Test cost & finance framework

A new **Test Cost & Finance** module calculates transparent costs from the same test legs used by planning and execution.

Cost components include:

- direct labour;
- equipment occupancy/use;
- consumables and fixtures;
- external laboratory/vendor spend;
- test/method development;
- overhead;
- contingency.

Costs are visible at:

- test-method level;
- individual test-leg level;
- complete test-programme/project level;
- portfolio level.

Programme financial views show budget, estimate, actual-to-date where historical execution exists, estimate-to-complete, forecast-at-completion and variance. Rate-card settings can be adjusted in the demo and cost CSV export is provided.

Included examples:

- `LabOS-Cost-Framework-Guide.pdf`;
- `LabOS-Cost-Rate-Card.csv`.

### Project-specific planning and controls

The planning view now supports both **Portfolio** and **single-project** focus.

For an individual project/programme, the user can adjust:

- programme priority;
- business priority score;
- required completion date;
- programme budget;
- programme gate/release status;
- programme owner;
- project/sample-ready date;
- individual leg due dates;
- automatic/preferred/required staff assignment policy;
- preferred/required staff member;
- change reason.

Saving project planning changes immediately reruns the shared deterministic laboratory plan. The project is not scheduled in isolation: displacement and impact on competing projects remain visible.

### Test Programme Builder

A new **Test Programme Builder** can create a validation programme from scratch.

The workflow supports:

1. project/customer/product definition;
2. DUT quantity, priority, due date and budget;
3. selection of existing released Test Library methods;
4. creation of a new/non-existing method when required;
5. sequential test-leg generation and dependencies;
6. preferred or required staff assignment;
7. development-hour/fixture/lead-time assumptions for new methods;
8. cost forecast before programme creation;
9. lessons-learned intelligence for the selected test mix;
10. saving as Draft or **Create & Auto Plan**.

When a selected test does not exist, the builder creates both the draft method and a corresponding Test Development Task. The validation leg is development-gated and cannot be scheduled before forecast method release.

Included examples:

- `LabOS-Test-Programme-Template.pdf`;
- `LabOS-Test-Programme-Template.csv`;
- `LabOS-Requirements-Import-Template.csv`;
- `LabOS-Specification-Review-Checklist.csv`;
- `LabOS-Method-Development-Plan.pdf`;
- `LabOS-Sample-Test-Report.pdf`.

### Lessons learned embedded in programme design

The programme builder does not merely list historical issues. For selected tests it surfaces:

- most frequent issue/root-cause patterns;
- Test Execution versus Bad Specification occurrence;
- delay impact;
- actual-duration variance versus library standard;
- competency coverage;
- method-development exposure;
- recurring setup/equipment/specification themes.

This allows lessons from previous programmes to influence planning before new work is released.

### Additional operational controls added in v0.4.0

To make the prototype more credible as an operational system, v0.4.0 also adds:

- programme release/readiness gates;
- specification release gates;
- sample/DUT-ready dates as hard planning inputs;
- qualification validity through the attended portion of a future test;
- project-level change reasons and audit entries;
- programme readiness scoring;
- project cost and schedule visibility in execution/programme drill-downs;
- test-method cost and historical issue intelligence in the Test Library;
- project-specific leg/staff planning controls;
- operational templates and example records suitable for immediate demonstration.


### Why the Specifications and Requirements views exist

These two views are now operational workflow controls rather than passive registers.

**Specs & Test Basis** answers: *Which controlled document/revision defines the conditions, samples and objective pass/fail limits for this validation work?* It shows specification readiness, requirement mapping, method-release readiness, recurring specification-caused issues and the direct planning impact of an unreleased/weak specification. A structured six-point review gate must be satisfied before a specification can become the released planning basis.

**Requirements & Coverage** answers: *What must be demonstrated, what objectively counts as pass, and which test demand will provide the evidence?* It ranks gaps by criticality/attention, distinguishes existing released methods from tests that still need development, forecasts coverage cost, and lets a user create or extend test coverage directly from a requirement.

Together they make the flow explicit: **source need → objective acceptance criterion → controlled test specification → coverage decision → released/development-gated method → planned test leg → DUT/result/evidence → verified/failed requirement**.

Included workflow examples:

- `LabOS-Requirements-Import-Template.csv`;
- `LabOS-Specification-Review-Checklist.csv`.

### Reliability fixes in v0.4.0

- repaired the Programme Builder method-selection layout and Create & Auto Plan navigation path;
- implemented the missing project-plan renderer used after programme creation;
- added project-level and test-leg planning controls that recalculate the shared laboratory schedule;
- changed the service worker to **network-first for HTML/JavaScript/CSS** so a GitHub Pages update does not combine a new navigation shell with stale cached application logic;
- retained cache fallback for offline use and bundled documents.

## Capabilities retained from v0.2.0

### Test specifications

The **Specifications** module supports:

- 10 seeded synthetic test-specification PDFs;
- programme, requirement and test-method linkage;
- revision, status, owner and effective date;
- quality score and quality flags;
- specification-caused issue history;
- browser-local upload of PDF, Word, text, CSV and image specifications;
- IndexedDB persistence for uploaded documents;
- global search and drill-down.

### Period-selectable KPIs

Dashboard and Analytics KPIs can be recalculated for:

- this week / last week;
- any selected ISO week;
- this month / last month;
- any selected month;
- last 7 / 30 / 90 days;
- arbitrary From / To dates.

Period metrics include throughput, on-time performance, turnaround, utilisation, issue rate, delay impact and outcome mix. Future periods include relevant planned utilisation.

### Visual management analytics

The demo includes visual trend, mix and ranking views for:

- throughput;
- issue frequency;
- root-cause mix;
- pass/rework/fail outcomes;
- equipment utilisation;
- staff utilisation;
- capacity by category;
- bottlenecks;
- recurring issue Pareto;
- programme-priority scenarios;
- cost composition and budget/forecast status.

### Operational event → one-click replanning

**Log Delay / Test Issue** can record sample/DUT delays, execution problems, equipment interruptions, resource/qualification constraints and specification problems.

These become real planning inputs. **Update Plan Now** reruns deterministic scheduling around the latest constraints while preserving calibration, qualification, method, dependency, capacity and resource rules.

### Priority scenarios

The planner can compare alternative project-priority strategies without first altering baseline data, including:

- baseline;
- due-date protection;
- business-value first;
- focus-project prioritisation.

The user can inspect movement, lateness and delivery impact, then apply a chosen strategy.

### Automatic lessons learned

Issue history is deterministically classified into causes including:

- Test Execution;
- Bad Specification;
- Sample / DUT;
- Equipment / Facility;
- Planning / Resource;
- Test Method / Development.

The system ranks recurrence and delay impact and derives recurring corrective-action themes from the actual issue records in the canonical state.

## Seeded demo scale

The baseline deterministic environment includes approximately:

- Programmes: 10 active seeded programmes;
- Validation requirements: 60;
- Test legs: 50;
- DUTs: 100;
- Test-library methods: 30;
- Test specifications: 10;
- Historical/current test runs: 100;
- Historical/current issue records: 46;
- Equipment assets: 33;
- Staff: 15;
- Calibration records: 36;
- Test-development tasks: 5;
- Numeric/result records: 40;
- Synthetic calibration certificates: 31 PDFs;
- Synthetic test specifications: 10 PDFs;
- Operational example/template PDFs: 4;
- Operational example/template CSVs: 4.

The Programme Builder can add further programmes, test legs, DUTs, specifications, draft methods and development tasks during a demo session.

## Major modules

1. **Dashboard** — period KPIs, delivery, visual trends, capacity, issue/root-cause mix, bottlenecks, lessons and scenario comparison.
2. **Requirements** — requirement flowdown and traceability matrix.
3. **Specifications** — uploaded/seeded test specifications, quality flags and linkage.
4. **Programmes** — programme status, forecast, priority, readiness, cost and test-leg progression.
5. **Test Planning** — portfolio/single-project planning, timeline, constraints, manual locks, project controls, replanning and scenarios.
6. **Programme Builder** — create complete programmes from existing and new tests with cost, staff, development and lessons intelligence.
7. **Test Execution** — lifecycle/readiness validation, results and evidence.
8. **DUTs** — genealogy and full test journey.
9. **Test Library** — standard methods, duration/capacity, costs, actual-vs-standard performance and issue history.
10. **Test Cost & Finance** — leg/programme/portfolio cost roll-up, budgets, forecasts and rate-card controls.
11. **Equipment** — capability, utilisation, maintenance and operating state.
12. **Calibration** — current/historical calibration, expiry risk, certificates and upload.
13. **People & Skills** — workload, qualification coverage and single-point competency risks.
14. **Reports / Analytics** — arbitrary-period visual KPI and lessons-learned analytics.
15. **Administration / Demo** — audit history, role view, import/export/reset and deterministic verification.

## GitHub Pages deployment

1. Create a GitHub repository.
2. Upload **all ZIP contents directly to the repository root**.
3. Commit to `main`.
4. Open **GitHub Settings → Pages**.
5. Select **Deploy from a branch**, branch `main`, folder `/ (root)`.
6. Open the generated GitHub Pages URL.

All application paths are relative, so repository-path deployments such as `https://username.github.io/repository-name/` work correctly.

## Run locally

The app requires no build step. For reliable module, IndexedDB and service-worker behaviour, serve the directory with any static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Persistence and transfer

Canonical application state is stored in **IndexedDB**, with localStorage fallback. Changes survive browser refresh/restart for the same browser profile.

Available controls include:

- Export full state to JSON;
- Import JSON;
- Reset Demo Data;
- CSV exports for operational/management tables, including costs.

Uploaded certificates and specifications are stored browser-locally as part of prototype state.

## Planning model and assumptions

The prototype uses a deterministic heuristic scheduler rather than an industrial MILP/CP-SAT solver. It selects the earliest feasible compatible equipment/staff combination while considering:

- programme priority and business score;
- due dates;
- programme/specification release gates;
- predecessors;
- method-development readiness;
- sample/DUT-ready dates and active delays;
- method/equipment compatibility;
- equipment capacity and DUT batching;
- equipment outages and maintenance;
- calibration validity for the full equipment-use period;
- staff skills, method authorisation and equipment authorisation;
- qualification expiry through attended work;
- staff availability;
- prohibited staff/equipment double booking;
- preferred/required staff policy;
- locked/manual bookings.

Unattended methods reserve equipment for the full run but staff only for attended setup/teardown/analysis work.

## Cost-model assumptions

The cost framework is intended for transparent operational comparison, not statutory accounting. Rates are configurable demo assumptions. Cost is calculated from canonical method, resource, development and programme data; it is not manually hard-coded into dashboard totals.

A production system would typically source labour rates, equipment rates, purchase orders, actual consumables and external invoices from controlled ERP/finance systems.

## Prototype limitations

This browser-only prototype does **not** claim production capabilities such as:

- central multi-user database;
- real authentication/authorisation;
- server-enforced security;
- validated electronic signatures;
- authoritative immutable enterprise audit storage;
- regulated document-control workflow;
- automated central backups;
- concurrent-user conflict handling;
- ERP/HR/PLM integrations;
- production notification/escalation workflow;
- production-grade optimisation service.

The conceptual model is designed so those services can later replace browser-local persistence without changing the overall operational architecture.

## Verification

Administration → **Run System Verification** performs **18 deterministic integrity checks**. The repository also includes `verify-model.mjs` for extended model verification. See `VERIFICATION.md` for the final build record.

## Package structure

This delivery uses the requested **completely flat repository structure**. Every HTML, CSS, JavaScript, manifest, icon, README, verification file, calibration certificate, specification and operational example/template is directly at ZIP root. There are no nested folders.
