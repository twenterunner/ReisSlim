# LabOS Prototype v0.2.0

LabOS is a static, browser-only prototype combining Laboratory Information Management (LIMS), validation requirements management, test-specification control, resource-constrained laboratory planning, equipment/calibration management, people/skills management, test-development management, programme prioritisation, capacity analytics, lessons learned and management decision support.

## What this prototype demonstrates

The canonical workflow is **requirements -> specifications / test demand -> deterministic resource-constrained planning -> execution -> evidence -> issues / lessons -> management visibility**.

The seeded dataset includes requirement flowdown, 10 interconnected programmes, multi-leg DUT populations, a reusable test library, uploaded/seeded test specifications, new-method development tasks, equipment and calibration validity, staff qualifications, deterministic scheduling, operational disruptions, manual locked bookings, planning explanations, priority scenarios, numeric result evaluation, DUT genealogy, historical KPI data, bottleneck analytics, lessons-learned analytics, global search, browser-local documents, JSON/CSV export and a deterministic system-verification page.

Deliberate demo storylines include a normal standard programme, thermal-chamber capacity pressure, calibration expiry conflict, a single-person EMC qualification bottleneck, test-method development delay, critical reprioritisation, a failed DUT, vibration-system breakdown, sample-arrival delay, test-execution recovery and specification-quality issues.

## New in v0.2.0

### Test specifications

A dedicated **Specifications** module now supports:

- seeded dummy test specifications with 10 synthetic PDF documents;
- programme, requirement and test-method linkage;
- revision, status, owner, effective date and acceptance-basis metadata;
- specification-quality score and quality flags;
- specification-caused issue history;
- browser-local upload of PDF, Word, text, CSV and image specifications (8 MB prototype limit);
- IndexedDB persistence for uploaded documents;
- global search and drill-down.

Uploaded specifications are prototype documents stored in the browser; this is not a production document-control or approval system.

### Period-selectable management KPIs

The Dashboard and Reports / Analytics views can recalculate KPIs for:

- this week;
- last week;
- any selected ISO week;
- this month;
- last month;
- any selected month;
- last 7 / 30 / 90 days;
- an arbitrary From / To date range.

Period calculations use historical execution and issue records, and use relevant future planned bookings for forward-looking utilisation where applicable. Visuals include throughput trends, issue trends, outcome mix, root-cause mix, issue Pareto/rankings, category performance, equipment utilisation and staff utilisation.

### Operational-event-driven automatic planning

**Log Delay / Test Issue** records operational changes such as:

- sample / DUT delays;
- test-execution issues;
- equipment outages / interruptions;
- staff / qualification constraints;
- bad / ambiguous specifications.

Sample, test, equipment and resource events become real planning constraints. The plan is marked as needing refresh and **Update Plan Now** deterministically rebuilds the laboratory schedule around the latest constraints while preserving hard qualification, calibration, equipment, predecessor and resource rules. Equipment interruptions require an affected asset, and active events can be resolved when the constraint clears.

### Priority-scenario comparison

The planning and dashboard views compare non-destructive project-priority strategies, including:

- baseline priorities;
- due-date protection;
- business-value-first prioritisation;
- focus-project prioritisation.

Each strategy is run through the deterministic scheduler and compares on-time delivery, at-risk work, lateness and moved bookings. A selected strategy can then be applied to the live browser-local demo plan.

### Automatic lessons learned

Historical and newly logged issues are classified into root causes such as:

- Test Execution;
- Bad Specification;
- Sample / DUT;
- Equipment / Facility;
- Planning / Resource;
- Test Method / Development.

The analytics automatically rank highest-occurrence issue types and root causes, calculate delay impact and generate recurring lessons / corrective-action themes. A dedicated comparison shows how much issue occurrence came from **test execution versus bad specifications**.

## Seeded v0.2.0 demo scale

- Programmes: 10
- Validation requirements: 60
- Test legs: 50
- DUTs: 100
- Test-library methods: 30
- Test specifications: 10
- Historical/current test runs: 100
- Historical/current issue records: 46
- Operational disruptions: 3 (including active sample and test issues)
- Equipment assets: 33
- Staff: 15
- Calibration records: 36
- Test-development tasks: 5
- Numeric/result records: 40
- Synthetic calibration certificate PDFs: 31
- Synthetic test-specification PDFs: 10

## GitHub Pages deployment

1. Create a GitHub repository.
2. Upload **all ZIP contents directly to the repository root**.
3. Commit the files to `main`.
4. Open **GitHub Settings -> Pages**.
5. Select **Deploy from a branch**, branch `main`, folder `/ (root)`.
6. Open the generated GitHub Pages URL.

All application paths are relative, so deployment also works at URLs such as `https://username.github.io/repository-name/`.

## Run locally

The app is static. For the most reliable browser behaviour (service worker and IndexedDB), serve the files with any local static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

Opening `index.html` directly may be restricted by browser module/service-worker rules on `file://` URLs.

## Major modules

- **Dashboard:** visual period KPIs, delivery, root-cause mix, issue Pareto, lessons learned, capacity, bottlenecks and priority-scenario comparison.
- **Requirements:** traceability matrix and end-to-end requirement drill-down.
- **Specifications:** seeded/uploaded specifications, quality flags, linked requirements/methods and spec-caused issues.
- **Programmes:** priority control, forecast dates, storylines and test-leg progression.
- **Test Planning:** automatic deterministic scheduling, operational disruption inputs, one-click plan refresh, equipment timeline, priority scenarios, planning explanations, manual locked bookings and what-if scenarios.
- **Test Execution:** lifecycle/readiness checks and result/evidence visibility.
- **DUTs:** genealogy and full programme journey.
- **Test Library:** standard durations, equipment/skill requirements, usage and actual-vs-standard analytics.
- **Equipment:** asset register, capability, utilisation, maintenance and calibration state.
- **Calibration:** current/historical records, warning states, demo certificates and local certificate upload.
- **People & Skills:** workloads, qualifications and single-point competency risks.
- **Reports / Analytics:** arbitrary-period KPI analytics, graphical trends, Pareto/root-cause analysis, execution-vs-spec issue split, lessons learned, utilisation and planned-vs-actual performance.
- **Administration / Demo:** role view, audit history, scenarios, reset/import/export and system verification.

## Persistence and data transfer

The canonical application state is stored in **IndexedDB**, with localStorage fallback where IndexedDB is unavailable. User changes survive refresh/browser restart on the same browser profile.

Use:

- **Export Data** for a complete JSON snapshot;
- **Import Data** to restore a snapshot;
- **Reset Demo Data** to restore the deterministic original dataset;
- CSV exports for requirements, planning, equipment, calibration and KPI data.

Uploaded calibration certificates and uploaded test specifications are stored browser-locally as data URLs inside the prototype state. The delivery also contains synthetic local PDF documents for immediate demonstration.

## Planning assumptions

This prototype uses a deterministic heuristic scheduler rather than an industrial MILP/CP-SAT optimiser. It orders demand according to effective programme priority and due-date logic, then finds the earliest feasible equipment/operator combination while enforcing:

- test-method/equipment compatibility;
- predecessor completion;
- test-development readiness;
- sample/DUT operational availability constraints;
- equipment outages/interruptions;
- calibration validity through the full equipment booking;
- required staff qualification and equipment authorisation;
- staff unavailability;
- prohibited equipment/staff overlaps;
- capacity and DUT batch constraints;
- locked/manual bookings.

Unattended methods reserve equipment for the full run but reserve the assigned person for the attended setup/teardown/analysis window. The planning horizon and deterministic work-slot choices keep the browser-only demo fast and reproducible while preserving the conceptual architecture required for a later enterprise optimiser.

## Lessons-learned assumptions

Root-cause and lesson analytics are deliberately deterministic and transparent. They aggregate the issue records saved in the canonical state; they are not generated by an external AI service. New issue records immediately contribute to recurrence rankings, delay impact and the Test Execution vs Bad Specification comparison for any KPI period that contains the issue date.

## Static-prototype limitations

This is intentionally **not** presented as a production-validated LIMS. It does not yet provide:

- a central multi-user database;
- true authentication;
- server-enforced authorisation;
- validated electronic signatures;
- authoritative enterprise audit storage;
- automated server backups;
- concurrent-user conflict management;
- production document-control workflow;
- regulated validation evidence storage;
- enterprise notification/workflow integrations.

Role switching is illustrative only and is not security.

A production migration can preserve the conceptual model: move canonical entities to a transactional backend/database, replace browser persistence with APIs, add identity/authorisation and immutable audit storage, migrate documents to managed object storage, and replace/augment the deterministic heuristic scheduler with an enterprise optimisation service.

## Verification

Administration -> **Run System Verification** performs 14 deterministic checks spanning references, equipment/staff overlaps, calibration validity, qualified allocations, requirement coverage, method durations, dependency integrity, numeric pass/fail, specification traceability, disruption integrity, lessons-learned classification, KPI-history scale and seeded dataset integrity.

The repository also includes `verify-model.mjs`, which tests the new specification, period-KPI, operational-delay and prioritisation-scenario behaviour outside the UI. See `VERIFICATION.md` for the final build record.

## Package structure

The delivery retains the requested **completely flat repository structure**. Every HTML, CSS, JavaScript, manifest, icon, documentation file, calibration PDF and test-specification PDF is directly at repository root. There are no asset, certificate or specification subfolders.
