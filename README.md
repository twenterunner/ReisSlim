# LabOS Prototype v1.3.0

LabOS is a static, browser-only laboratory operations prototype centred on test programmes: validation-plan design, a reusable standard-test portfolio, method development, prototype/sample readiness, deterministic resource-constrained planning, guided/live execution, quality/CAPA, metrology, equipment/people/materials, cost, capacity analytics, lessons learned and management decision support.

The application is intentionally deployable directly on GitHub Pages with no backend, login, API key, npm build or external service required at runtime.

## Core operating model

The canonical workflow is:

**prototype/sample demand → test programme → visual validation legs and DUT genealogy → existing Test Portfolio methods or method development → sample-ready gate → programme/portfolio auto-planning → guided/live execution → evidence/results → deviations/CAPA/lessons → learned time/cost standards → capacity / maintenance / audit assurance**

All major views operate on the same browser-local canonical data model rather than duplicate demo-only representations.





## New in v1.3.0 — editable split/merge topology and scenario-driven planning

This release fixes the remaining branch-editing limitation and connects Validation, Prototyping and Planning more tightly.

- **Split can be inserted into an existing plan.** A common test can be split even when later tests or later main Test Legs already exist. Those downstream tests are preserved and wait behind the merge junction instead of making Split disappear.
- **Visible merge junction.** Once 1a / 1b exist, **⇉ Merge 1a + 1b here** remains visible directly under the active branch tails until the user explicitly reunites them.
- **Existing downstream path is retained.** Example: `1.1 → 1.2 → split → [1a.1 → 1a.2] + [1b.1 → 1b.2] → merge → 1.3 → Leg 2`.
- **Programme-lane planning view.** Each validation programme has a persistent colour; linked prototype builds, method-development work and validation tests appear in the same programme lane so the dependency is visible.
- **Combined resource planning view.** Toggle to a resource-centric plan where all programmes compete for shared equipment, staff and prototype-build capacity while retaining programme colours.
- **Planning Scenario Studio.** Sandboxed scenarios cover equipment breakdown/outage, sample delay, method-development delay, linked prototype-build delay, key-staff unavailability and programme-priority changes. Running a scenario does not alter the operational plan.
- **Automatic recovery comparison.** For a disruption, LabOS recalculates the constrained portfolio and also tests a programme-protection recovery where relevant, showing booking movement, unscheduled work and delivery impact before any operational change is committed.
- **Linked prototype/validation coordination remains optional.** Standalone prototype work remains independent; linked prototype completion controls validation sample readiness and appears in the same planning context.

## New in v1.2.0 — intuitive logical Test Legs

The Validation Plan Designer now separates a **logical Test Leg** from the individual tests that run inside it. This fixes the earlier ambiguity where every test box effectively behaved like a new leg.

- **One Test Leg = one column.** Test Leg 1, Test Leg 2, Test Leg 3, etc. are the main validation columns.
- **Multiple sequential tests per leg.** Use **＋ Test below** to add another test beneath the selected test while remaining inside the same Test Leg.
- **Explicit arrows show sample flow.** Sequential tests are linked top-to-bottom with visible arrows, while main Test Legs flow left-to-right.
- **Branches stay inside their parent leg.** **⑂ Split samples** creates stacked sub-legs such as **1a** and **1b** inside the Test Leg 1 column. They do not become adjacent main Test Legs.
- **Each sub-leg is itself a sequence.** 1a can contain 1a.1 → 1a.2 → 1a.3 while 1b independently contains 1b.1 → 1b.2, all visibly grouped under Test Leg 1.
- **Merge is a prominent inline action.** While branches are active, **⇉ Merge 1a + 1b** is always shown directly underneath them. The user chooses the first common test after the merge.
- **Common testing can continue after merge inside the same leg.** The merged population can proceed through 1.3 → 1.4, etc. before Test Leg 2 is created.
- **Starting a new leg is deliberately different.** **＋ Add Test Leg 2** appears only at the bottom of a completed common path. The former ambiguous per-test “Next leg” control is removed.
- **Branch DUT allocation is deterministic and non-overlapping.** Split A/B populations are taken from the incoming DUT set, branch tests keep their own population, and merge uses the union of surviving branch populations.
- **The builder is visual-first.** Programme settings and templates are collapsible support panels; the validation flow is the primary interaction surface. The Test Portfolio remains available underneath for adding standard tests.
- **Prototype linkage remains optional.** Validation and Prototyping remain separate primary workspaces; linked prototype completion controls validation sample readiness, while standalone prototype builds remain independent.

The included `LabOS-Validation-Network-Example.csv` now demonstrates multiple common tests inside a leg, multi-test 1a/1b branches, merge, post-merge common testing, and transition to the next main Test Leg.

## New in v1.0.0 — guided, automation-first UX

LabOS v1.0.0 is primarily a usability and operating-model release. The underlying canonical laboratory model remains intact, but routine work is organised around five jobs: **create a programme, create a prototype build, get programme status, plan/replan, and manage the laboratory from decision-focused KPIs**.

- **v1.0 historical navigation:** Home, Programmes, Planning, Execution, Lab, Quality and Insights. v1.1 promotes Validation and Prototyping to separate primary workspaces. Specialist registers remain available as contextual drill-downs instead of competing for permanent menu space.
- **Permanent ＋ Create action:** starts a validation programme, prototype build, new/non-existing test, issue/delay or maintenance event from one consistent launcher.
- **Four-step programme wizard:** Programme → Starting Plan → Samples → Automation. LabOS recommends a comparable historical programme or reusable architecture, then opens the visual validation-plan designer with every leg still editable.
- **Three planning modes:**
  - **Auto:** LabOS maintains the best feasible schedule automatically.
  - **Assisted (recommended):** LabOS calculates the best feasible change set and shows the impact before anything is applied.
  - **Manual:** LabOS recommends options but never changes bookings unless the planner applies them.
- **Clear planning language:** ambiguous actions such as “Update Operational Plan” are removed. The UI uses outcome-based terms such as **Review recommended schedule**, **Recalculate this programme**, **Recalculate all lab schedules**, **Apply recommended schedule** and **Override booking**.
- **Impact preview before commit:** Assisted replanning shows programmes affected, moved/new bookings, unscheduled work, old/new dates, equipment and staff. The existing plan remains unchanged until **Apply recommended schedule** is pressed.
- **Manual intervention without losing automation:** bookings can be dragged to another equipment/day for a quick override or tapped to change date, equipment and staff. Overrides can be locked so future automation must plan around them. Hard constraints remain enforced.
- **One-tap Programme Status:** gives management health, due date, deterministic forecast, P80 forecast, on-time probability, test-leg progress, sample/prototype status, open method development, cost/budget, current critical path/blocker and the decision requiring attention. Status text can be copied for meetings/email.
- **Three-step prototype-build wizard:** Build → Validation Link → Schedule. Linking a build to validation automatically propagates sample readiness rather than asking the user to maintain duplicate dates.
- **Decision-first Home:** “Needs your attention” surfaces only work requiring acknowledgement, recovery or a management decision. Six management questions replace a wall of unrelated KPIs.
- **Deep KPI drill-down:** delivery, capacity, productive time, recurring issues, finance and future risk tiles lead to the programmes/tests/resources driving the result.
- **Role-oriented starting experience:** Technician, Test Engineer, Planner, Lab Manager and Quality roles land on the most relevant operational view while retaining the same canonical data.
- **Backward-compatible state migration:** compatible v0.9.x browser-local data is upgraded to v1.0.0 rather than reset solely because the app version changed.

The design rule for v1.0.0 is: **automate the ordinary, explain the recommendation, preview consequences, allow override, and remember the override.**

## New in v0.8.0 — P1/P2 operational depth

- **Unified Quality Events / CAPA / MRB:** deviations, NCR, OOS and OOT records now progress through containment, investigation, disposition, CAPA and effectiveness verification. Major quality events can place affected test legs on hold and feed the shared exception/escalation engine.
- **Full DUT/sample chain of custody:** sample status, location, quarantine, genealogy and split/merge population logic are now first-class records. Quarantined or otherwise unavailable DUTs block readiness through the same planning constraint path.
- **Guided LES execution:** controlled step-by-step execution supports mandatory checkpoints/evidence and review-by-exception. Execution exceptions can automatically create controlled quality events.
- **Planning digital twin:** deterministic Monte Carlo forecasting provides programme-level P50/P80/P95 completion dates, on-time confidence and schedule uncertainty alongside the deterministic plan.
- **Metrology/MSA depth:** Gage R&R, uncertainty budgets, reference-standard status and measurement-system readiness now feed method/test readiness. Out-of-tolerance calibration outcomes support retrospective test-impact assessment.
- **Predictive equipment health:** failure history, maintenance condition, live anomalies and calibration history combine into bounded asset-risk scores and recommended service actions.
- **Calibration + maintenance synergy:** service opportunities can be combined to reduce duplicated equipment downtime while calibration validity and locked bookings remain protected.
- **Fixtures, consumables and spares:** consumables use quantity/reservation logic; reusable fixtures use time-overlap capacity logic. Missing material or fixture capacity can block planning.
- **External laboratories:** approved external labs, scope/accreditation metadata, turnaround and cost can be used as an explicit planning alternative. Outsourcing removes corresponding internal capacity demand and creates controlled supplier work.
- **Knowledge / similarity engine:** comparable historical programmes are used to recommend test content, methods, resources and reusable lessons for new validation plans.

### New v0.8.0 example files

- `LabOS-Quality-CAPA-Workflow.csv`
- `LabOS-Chain-of-Custody-Example.csv`
- `LabOS-LES-Execution-Template.csv`
- `LabOS-MSA-GageRR-Example.csv`
- `LabOS-Uncertainty-Budget-Example.csv`
- `LabOS-Fixtures-Consumables-Spares.csv`
- `LabOS-External-Lab-Panel.csv`
- `LabOS-Knowledge-Similarity-Example.csv`
- `LabOS-Digital-Twin-Guide.csv`

## New in v0.7.0 — connected laboratory operations

- **Visual validation network builder:** test legs are now displayed as a validation graph. A leg can start a programme, follow another leg, branch in parallel, or join multiple predecessor legs. Each node retains its own DUT population, method maturity, staff policy, cost and readiness state.
- **Explicit local vs portfolio planning:** planners can log a programme/leg delay, replan only the affected programme while preserving other project bookings, or deliberately recalculate the full laboratory portfolio. Replanning records a booking-by-booking impact set.
- **Exception & Escalation Center:** live anomalies and manually logged issues use one severity framework (Low / Medium / High / Critical) with acknowledgement SLA, notified roles, issue/delay creation policy, test blocking policy and programme/portfolio replan scope.
- **Notification/event traceability:** anomalies and issues create operational events and role-targeted notification records linked back to programme, test leg, issue, disruption and live alert.
- **Automatic recurring-issue learning:** LabOS clusters recurring issues by method, issue family and root cause, automatically creates lessons when recurrence thresholds are met, and retains the exact source issues, runs, people and programmes. Manual lessons can be logged alongside automatically detected lessons.
- **Deeper KPI drill-down:** command-center and analytics KPI tiles are interactive. Delivery, validation assurance, productive time, live alerts, financial control, capacity, FTR, queue, setup, rework, automation, audit and service KPIs open their underlying records and drivers instead of remaining passive summary cards.
- **Live anomaly → operational action:** a configured live-data rule can now generate the same escalation and planning workflow used for manually reported test issues, including acknowledgements, notifications, delays and blocking for critical events.
- **Builder dependency editing:** explicit predecessor selection supports parallel branches and multi-predecessor joins without requiring users to infer dependency logic from row order.
- **New operating examples:** `LabOS-Validation-Network-Example.csv` and `LabOS-Escalation-Matrix.csv`.

### Recommended next best-in-class layer

The prototype now has a strong connected operations backbone. The highest-value next production/product modules are:

1. **Deviation / NCR / OOS / OOT / CAPA / MRB:** one quality-event object spanning test anomalies, failed DUT disposition, root-cause investigation, containment, effectiveness verification and CAPA.
2. **Sample chain of custody:** barcode/QR receipt, location, condition, quantity, reservation, split/merge, consumption, retention and disposal with full genealogy.
3. **Guided LES execution:** step-by-step work instructions, mandatory checkpoints, instrument prompts, review-by-exception and controlled test-step deviations.
4. **Metrology depth:** MSA/Gage R&R, uncertainty budgets, reference standards, intermediate checks and calibration drift / out-of-tolerance impact analysis.
5. **Predictive asset reliability:** failure-rate and condition trends feeding maintenance interval optimisation, spares demand, redundancy risk and calibration/maintenance bundling.
6. **Materials / consumables / fixtures inventory:** stock, lot/expiry, test-kit readiness, fixture configuration and automated replenishment risk.
7. **External laboratory / supplier workflow:** RFQ, external-test booking, competence/accreditation scope, sample shipment, results/certificate intake, cost and turnaround tracking.
8. **Controlled approvals and e-signatures:** method/spec/report approval workflows, segregation of duties, RBAC/SSO and server-enforced audit history for a production deployment.
9. **Industrial integration layer:** secure gateway/broker support for OPC UA, MQTT, historian/SDMS/ELN and equipment APIs rather than browser-direct feeds.
10. **Advanced planning digital twin:** Monte-Carlo/probabilistic due-date confidence, portfolio option optimisation, outsource-vs-buy-vs-hire comparisons and investment ROI from avoided delay.
11. **Knowledge graph / similarity intelligence:** connect requirements, specs, methods, issues, DUT failures, staff, equipment and reports so new validation programmes can reuse historically successful patterns and preventive controls.
12. **Mobile laboratory execution:** barcode scanning, photo/evidence capture, offline task execution and rapid issue/maintenance reporting at the asset or DUT.

## New in v0.6.0

- Multi-leg validation Programme Builder with per-leg DUT populations, dependencies, staff policy, method state and learned/planned durations.
- Drillable lessons-learned provenance linking each lesson to the originating issue, run, test leg, programme, person, equipment and corrective action.
- Live Test Monitor with offline simulation, CSV/JSON ingestion, configurable thresholds/rate rules, statistical anomaly detection, alerts and acknowledgements.
- Automated engineering test-report generation from canonical programme, DUT, result, equipment, calibration, live-data and issue records.
- Granular cost controls at skillset, person, equipment and test-method level.
- Closed-loop time learning from actual setup, execution/exposure, teardown, analysis, queue/rework and method-development effort. Learned planning times feed future scheduling and capacity forecasts.
- Expanded efficiency analytics including productive test time, execution share, setup burden, analysis burden, queue loss, rework burden, hands-on ratio, first-time-right, schedule efficiency, automation leverage and development efficiency.
- Automated bottleneck/issue recommendations with proposed management actions and confidence/impact.
- Calibration and maintenance synergy analysis to combine compatible service windows and reduce duplicate downtime.
- New operational examples: `LabOS-Live-Data-Example.csv`, `LabOS-Live-Feed-Schema.json`, and `LabOS-Efficiency-Metrics-Guide.csv`.

## New in v0.5.0

### Audit & compliance workbench

A new **Audit & Compliance** module supports internal readiness audits using original workflow prompts based on the themes of **ISO/IEC 17025:2017** and **IATF 16949:2016**. The application does not reproduce licensed standard text and does not claim accreditation or certification.

The workbench provides:

- selectable ISO/IEC 17025 or IATF audit basis;
- multiple audit records and planned dates;
- clause/process-area readiness overview;
- Conform / OFI / Minor / Major / N/A status;
- system-derived evidence suggestions from calibration, competence, validation, maintenance, capacity and issue data;
- manual auditor evidence, findings, action owner and due date;
- readiness score, open nonconformities and process-area visuals;
- CSV audit export;
- seeded ISO/IEC 17025 and IATF readiness audits.

Included audit templates:

- `LabOS-Audit-Checklist-ISO17025.csv`;
- `LabOS-Audit-Checklist-IATF16949.csv`.

The ISO workbench uses ISO/IEC 17025:2017 as the current edition. The IATF workbench uses IATF 16949:2016 while explicitly noting that IATF has announced work on a second edition; the checklist should be updated when a future edition becomes effective.

### Demand, staffing & equipment forecast

A new **Demand & Capacity** module combines ongoing committed work with potential future projects. Potential projects can be entered with:

- opportunity probability;
- expected start and validation completion;
- customer/product;
- pipeline status;
- explicit expected validation methods when known;
- a selected similar existing programme;
- or automatic similarity inference when the detailed validation plan is not yet known.

The forecast supports **Committed only**, **Probability weighted**, and **Full pipeline / if all won** scenarios. It converts demand into weekly equipment occupancy, competency/staff hours, capacity gaps, incremental equipment units and FTE needs. The demo deliberately contains future constraints such as Reliability Rack, EMC and specialist competence pressure.

Potential projects can be sent directly into the Test Programme Builder; inferred/expected test methods are preselected and can then be edited before programme release.

Included example: `LabOS-Opportunity-Pipeline-Template.csv`.

### Maintenance planning & optimisation

A new **Maintenance Plan** module adds per-asset preventive-maintenance policy, criticality, condition score, failure risk, interval, next due date, duration and locked/flexible planning.

**Optimize Maintenance & Replan** searches for low-demand windows before each due date, avoids locked test work, creates hard equipment-downtime blocks and reruns the shared laboratory scheduler. The view shows due/overdue maintenance, high-risk assets, planned downtime and optimisation benefit.

Included example: `LabOS-Maintenance-Plan-Template.csv`.

### Executive KPI command center

The dashboard is upgraded from a basic KPI tile page into a management command center combining:

- portfolio delivery and validation assurance;
- financial control;
- 12-week staffing/equipment outlook;
- probability-weighted pipeline exposure;
- audit readiness;
- maintenance risk;
- requirement assurance;
- delivery/outcome/root-cause trends;
- future equipment additions and FTE/skill needs;
- automatic management actions;
- programme priority scenario comparison;
- cost/investment signal.

Period-selectable weekly/monthly/custom KPI analytics remain available alongside these forward-looking views.

## v0.4.0 workflow foundation retained

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

Requirement records remain part of the canonical traceability chain and automated evidence roll-up, but v1.0.0 intentionally removes the separate Requirements & Coverage primary tab so laboratory work is driven from Test Programmes and Test Portfolio.

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

When a compatible earlier LabOS prototype state is detected, v0.5.0 migrates that browser-local state through the current canonical shape rather than resetting it solely because the app version changed; the version upgrade is recorded in the prototype audit trail.

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
