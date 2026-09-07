# LabOS Prototype v1.17.0


## v1.17.0 — automated contention recovery, Programme Workspace & per-test sample allocation

This release moves routine scheduling contention back where it belongs: into the automated planner. Equipment/staff occupancy and downstream predecessor sequencing are no longer presented as user-owned blockers. The planner now orders work dependency-first within priority/due-date classes and searches a full **12-month scheduling horizon**. A programme-specific replan still protects every other programme by default. If the target programme can only be recovered by flexing other programmes, LabOS automatically computes that portfolio alternative and shows programme-by-programme forecast/risk/booking impact for explicit **Accept / Reject**; accepted changes retain Undo.

Every validation programme now has a dedicated **Programme Workspace**. From Validation, Planning or any programme link, the user can open one page containing programme/customer/product identity, delivery status, visual Test Leg/sub-leg flow, Week/Month/Quarter/Year planning swimlanes, serialized DUT traceability, requirements/specifications, prototype and method-development dependencies, budget/actual/forecast cost, execution, quality issues and reports. This removes the need to hunt through unrelated module pages to understand one programme.

Sample allocation is now controllable at every test level. In the Validation Plan Designer, each test and recursively nested sub-leg exposes **◇ Samples**. The user may keep automatic predecessor inheritance/split logic or select exact serialized DUTs. After programme creation, each operational test leg also supports **Assign serialized samples**; only predecessor-compatible DUTs are offered. Any changed population invalidates the unlocked booking and triggers a programme replan so capacity/batching/duration remain correct.

## v1.14.1 — no-dead-end guided DUT blocker resolution

This targeted update fixes the custody/sample blocker workflow shown in the mobile UI. The guided resolution now uses the authoritative chain-of-custody state rather than only the master DUT status, so quarantined/disposed samples are actually surfaced as actionable records. The previous dead-end replacement dialog has been replaced by a guided sample-population resolution flow with these paths:

- release/disposition an affected allocated DUT with evidence;
- replace it with an unused released DUT from the same programme;
- register/receive new physical DUTs with serial identities and release evidence;
- make a controlled reduced-population change using an approved deviation/concession reference;
- reconcile a stale blocker when the current allocation is already released;
- open the programme DUT pool directly from the blocker workflow.

Every resolution path replans the affected programme and retains an undo restore point. Empty replacement pools no longer leave the user with a disabled button and no next action.

## New in v1.14.0 — durable validation designs, recursive branching & multi-scale planning

- Validation Plan Designer changes are now **durable work objects**, not transient form state. Editing auto-saves the current constructed validation into `validationDesigns`, and leaving the designer captures any still-focused input before navigation.
- **Save now** saves the validation design itself; it no longer creates a programme and resets the designer. Saved designs can be reopened from both Validation and the designer.
- A saved validation design can **Request planning**. Once planned, it retains the programme link and can reopen that exact Planning view. If the design changes after planning, LabOS treats the next request as revised planning and preserves the previous programme as a superseded revision.
- Planning no longer clears the constructed validation. The exact design remains available and operational legs retain `sourceValidationDesignId` / `sourceBuilderLegId` traceability.
- Branching is now **recursive**. A common path can split into `1a / 1b`; `1a` can then split into `1aa / 1ab`; those branches can split again to any required depth. Inner split levels must be merged before an outer merge. Terminal branches are valid and do not require an artificial merge merely to request planning.
- Nested split/merge metadata remembers the parent branch path, so merging `1aa + 1ab` correctly returns to `1a` rather than incorrectly returning to the main `1` path.
- The Validation view now includes **Constructed validation designs** with Open design / Request planning / Open planning actions.
- Planning now offers explicit **Week / Month / Quarter / Year** views. Quarter and year views use weekly/monthly buckets while preserving exact booking positions across the full 92 / 366-day horizon. Programme lanes, resource lanes and staff allocation use the selected time scale.

## New in v1.12.0 — executive/customer visual reporting, swimlanes, data plots & anonymisation

- **Reports are now designed as visual controlled deliverables, not table dumps.** Every report has a branded cover, document-control panel, executive status dashboard, print-ready A4 landscape styling, consistent hierarchy and controlled draft/approval messaging.
- **Planning is visualised with execution swimlanes.** Included tests are plotted on a common time axis with distinct Completed, In Progress, Planned and Exception states plus required-date and forecast markers. Interim reports continue to show the detailed blocker/remainder table underneath the visual.
- **Validation topology is visualised with flow blocks.** Test Leg and Programme reports show independent main Test Legs as separate blocks; sequence/branch/merge arrows are only shown inside a leg, preserving the agreed validation-plan semantics.
- **Logged data is graphed automatically.** Populated live-data channels are rendered as report-quality line plots with point count, min/average/max and configured alert-limit context. The full timestamped numeric appendix remains selectable.
- **Presets are now audience-based.** Internal presets: Design Review, Management/Programme Review, Technical/Evidence Review, Comprehensive Engineering Record and Controlled Core. External presets: Customer Validation Report and Third-party/Audit Evidence Pack. All presets remain fully customisable by section.
- **Reports can be anonymised.** When enabled, LabOS redacts customer identity, programme/customer identifiers, customer-specific requirement text and controlled specification naming while retaining non-identifying technical results, acceptance limits and evidence selected by the user. An anonymised report is explicitly marked as such.
- **Approval remains governed.** Anonymisation does not bypass completion/content gates; unapproved reports retain the `AUTO-GENERATED · NOT APPROVED` watermark and final release still requires an authorised reviewer.

## New in v1.11.0 — hierarchical, configurable validation reporting

- **One report builder now supports three authoritative scopes:** a single test, an entire main Test Leg (including its sequential/parallel tests), or the complete validation programme.
- **Incomplete / future tests remain visible in reports.** Interim reports explicitly show current status, blockers, predecessor state, sample readiness, planned/forecast dates, method-development gates and the expected remaining test effort instead of silently omitting work that is not complete yet.
- **Comprehensive is the default.** The report engine can include 20 controlled information sections: executive summary; customer/programme; scope/status/remainder; validation topology; requirements/specifications/acceptance criteria; methods; DUT genealogy; planning/readiness; staff/competency; equipment/calibration/metrology; execution history; logged-data summary; complete logged-data appendix; results/acceptance evaluation; quality/CAPA; lessons/improvement actions; cost/effort; evidence register; conclusions/outstanding actions; and approval/release.
- **Users can tailor every report.** Presets are provided for Comprehensive, Customer, Technical/Evidence, Management and Controlled Core reports, with per-section checkboxes for a fully custom report.
- **Final approval is content- and completion-gated.** Draft/interim reports may omit optional content, but a final controlled approval requires all included tests to be complete and requires the mandatory identity/scope, requirements/acceptance, results, conclusion and approval sections.
- **Draft governance is unchanged and strengthened:** every unapproved output carries the `AUTO-GENERATED · NOT APPROVED` watermark. Authorised approval records reviewer, role, time, conclusion and note, after which the released report no longer carries the watermark.
- **Programme-level reporting is directly accessible from Validation**, while every test detail / execution queue can open the same report builder and switch scope without losing the programme context.

LabOS is a static, browser-only laboratory operations prototype centred on test programmes: validation-plan design, a reusable standard-test portfolio, method development, prototype/sample readiness, deterministic resource-constrained planning, guided/live execution, quality/CAPA, metrology, equipment/people/materials, cost, capacity analytics, lessons learned and management decision support.

The application is intentionally deployable directly on GitHub Pages with no backend, login, API key, npm build or external service required at runtime.

## Core operating model

The canonical workflow is:

**prototype/sample demand → test programme → visual validation legs and DUT genealogy → existing Test Portfolio methods or method development → sample-ready gate → programme/portfolio auto-planning → guided/live execution → evidence/results → deviations/CAPA/lessons → learned time/cost standards → capacity / maintenance / audit assurance**

All major views operate on the same browser-local canonical data model rather than duplicate demo-only representations.








## New in v1.10.0 — predecessor-driven visual topology, controlled auto-reporting & explicit lesson use

- **Predecessor edits now change the visual validation topology.** Selecting one predecessor re-homes the edited test into the same main Test Leg/sub-leg, places it directly after that predecessor, moves its downstream chain with it and renumbers the flow immediately. Removing all predecessors creates a new independent main Test Leg. Cross-main-leg joins are rejected because main Test Legs are independent; multi-predecessor joins are reserved for branch merges inside one Test Leg.
- The predecessor modal now says exactly what will happen and finishes with **Save & move into flow** rather than silently saving a hidden dependency.
- **Automated test reports are now complete controlled drafts**, including customer, programme/project/product/revision, requirements, validation intent, acceptance criteria, method/specification revision, DUT serials/genealogy, staff qualification, equipment/asset/serial, calibration, actual execution time, complete linked live-data log, results and recorded limits, anomalies/deviations, and an automated conclusion.
- Every unapproved report carries a prominent **AUTO-GENERATED · NOT APPROVED** watermark. Final approval is locked until the test leg is completed and must be performed by a relevant configured reviewer (Lab Manager / Validation Engineer / Quality / qualified Reviewer/Expert). Approval records reviewer, role, timestamp, conclusion and approval note; only then is the watermark removed.
- **Lessons learned now show their operational disposition.** Each lesson explicitly shows whether it is already informing learned planning time, whether an improvement proposal is awaiting Accept/Reject, whether an accepted action is in implementation/effectiveness monitoring, or whether it remains advisory evidence. Nothing silently changes a method, specification, work instruction, calibration policy or schedule.


## New in v1.9.0 — evidence-gated implementation & closure

LabOS now separates **decision**, **implementation**, **effectiveness**, and **closure**. Accepting an intelligent proposal starts a controlled action; it never marks the problem solved. Every action carries a proposal-specific closure contract with authoritative and evidence-backed gates.

- Equipment-capacity proposals remain non-physical after approval. A real additional setup must be registered, commissioned/qualified, calibration-valid where required, actually used on a completed run, and its benefit reviewed before closure is enabled.
- Technician-reallocation proposals remain open until the controlled assignment exists and subsequent execution confirms that the intended technician actually performed the work.
- Calibration-timing proposals require an actual completed Pass calibration record and a conflict-free future schedule before effectiveness review.
- Quality / recurring-pattern proposals require actual controlled-change evidence and subsequent no-recurrence evidence before closure.
- Learned planning-standard changes remain reversible and require subsequent observed runs plus an effectiveness review.
- The action UI visibly tracks `Decision accepted → Implement → Prove effectiveness → Close`; the Close button stays locked until every required gate is satisfied.
- New equipment records enter **Commissioning** state and are excluded from deterministic scheduling until commissioning is complete; calibration rules still apply after commissioning.

## New in v1.8.0 — integrated closed-loop decision intelligence

- Replaced the fragmented “raw alert → separate quality list → separate recurring lesson → separate escalation ledger” experience with one **closed-loop intelligence flow**: **Signals → Correlated cases → Proposals → Accepted actions → Verified learning**.
- Home is now a **decision & improvement inbox**. Live anomalies, quality/recurrence patterns and planning digital-twin opportunities are ranked together rather than forcing the user to hunt across unrelated lists.
- Multiple live alarms on the same programme/test leg are correlated into **one operational case**. Source alert/event/issue/quality records stay available as evidence, but are no longer treated as separate work items.
- Each case explains the detected pattern, an explicitly labelled leading hypothesis, the proposed action, expected value, confidence, source evidence and a verification rule before the user decides.
- **Accept / Reject is governed.** Accept creates the appropriate controlled action (integrated investigation, CAPA/prevention action, learned standard-time update, or planning change); Reject suppresses the same recommendation until material evidence changes.
- Accepted prevention actions are **closed-loop monitored** against subsequent actual runs. Three relevant recurrence-free executions move the action to verification-ready; a new matching issue marks effectiveness failed and re-opens learning.
- Learned execution history can now propose **updated planning standards** when recent method duration materially differs from the library standard. Accept recalculates future planning with a restore point; Undo returns both the standard and schedule.
- Quality is now case/action-centric: actionable cases and accepted actions appear first; NCR/deviation records, recurring lessons and live/escalation ledgers are explicitly secondary **source registers**.
- Exception Control uses the same correlated cases and exposes planning impact without duplicating raw signals. Planning contains the same intelligence model beside the continuous digital-twin optimizer.
- The intelligence engine rescans on a bounded 60-second interval while the browser is active, and the UI provides **Scan now** for immediate recalculation.
- The new UI is designed as a visual flow system for mobile and desktop: compact decision cards, evidence → pattern → proposal → decision mini-flows, confidence/value, and one primary review action rather than long repetitive tables.

## New in v1.7.0 — continuous planning optimizer with governed accept / reject

- Added a **Continuous planning optimizer** to Planning. While the app is open, LabOS repeatedly runs digital-twin alternatives across the current constrained portfolio instead of waiting for a delay or manual scenario request. The default scan interval is 60 seconds, and the scan is also refreshed when Planning is rendered against changed planning inputs.
- **Technician reallocation** is now actively searched. LabOS tests qualified alternative technicians against method competency, equipment qualification, availability and double-booking constraints, then simulates the downstream portfolio schedule. Suggestions name the concrete reassignment and, where the scheduler uses the released capacity elsewhere, identify the second programme that benefits.
- **Bottleneck-equipment capacity** is now tested rather than inferred from utilisation alone. For each demanded equipment type, LabOS simulates one additional equivalent unit and only proposes duplication/temporary capacity when the scheduler actually uses that unit and the quantified portfolio outcome improves.
- **Calibration timing** is actively optimised. When calibration validity threatens future work, LabOS searches for an idle four-hour calibration window, reserves a *Scheduled* calibration outage in the digital twin and replans around it. It never records calibration as passed before execution/evidence exists.
- Every suggestion shows the recommendation class, confidence, reason, quantified benefit, programme-by-programme impact, schedule moves and assumptions **before** application.
- Every recommendation has explicit **Accept** and **Reject** controls. Rejected proposals remain suppressed for the current planning-state signature and are eligible again only after material planning inputs change.
- Accepted staff/calibration changes are applied only after review, are audit logged and create a full **Undo** restore point.
- Accepting an equipment-duplication recommendation records an **approved capacity action** and its business-case impact, but does **not** create a fictional asset or move live bookings onto scenario equipment. A real new/temporary asset must still be commissioned, qualified and calibrated before operational use.
- Recent optimizer decisions and approved capacity actions remain visible in Planning so the recommendation history is inspectable rather than ephemeral.
- The optimizer is bounded for browser/mobile use: candidate searches are capped, scans are skipped while the page is hidden, and only material improvements are shown.

## New in v1.6.0 — planning decisions instead of raw alert noise

- Replaced the low-value **Live planning inputs** event table with an exception-based **Planning decision queue**. Planning now answers the operational question: *does this event actually justify changing the schedule?*
- Raw sensor/anomaly records remain in **Execution & Live** and are correlated into **one planning decision per affected programme / test leg** rather than one row per signal.
- A single **High statistical anomaly** no longer automatically creates a 12-hour planning hold. It still creates traceable escalation/issue evidence, but becomes a hard planning constraint only when it is Critical, breaches a hard high/low limit, or is corroborated by at least two High/Critical alerts on the same leg within 30 minutes.
- Correlated alerts update one existing planning constraint: hold duration and impact use the maximum credible value rather than incorrectly summing duplicate sensor alerts. Source alerts/issues are retained for audit traceability.
- Existing v1.5 browser data is normalized on load: expired auto-generated live holds stop blocking the plan and become **Awaiting Evidence**; duplicated live holds for the same programme/leg are consolidated and the redundant records are retained as **Superseded** evidence.
- Each actionable planning card now shows the next booked work, constraint expiry, booking overlap, projected due-date margin and a plain-language recommendation. If schedule recovery is required, **Compare recovery options** opens the existing protected-vs-portfolio replanning workflow before any schedule is mutated.
- Events whose constraint clears before the next booking are shown as **Monitor**, explicitly explaining why no schedule reshuffle is justified. Elapsed holds are separated as an **Evidence closure** queue so quality traceability is preserved without pretending that an old alert is still a scheduling constraint.
- The decision queue includes compact portfolio counts for **Needs decision**, **Monitor only**, **Evidence closure**, **Raw signals correlated**, and **Programmes touched**, plus drill-down to all source alerts/issues.

## New in v1.5.0 — delay recovery approval, cross-programme impact and undo

- Logging a delay no longer immediately reshuffles the schedule. The delay/constraint is saved first and the current schedule stays unchanged until the user approves a recovery option.
- **Option A — Protected replan:** automatically replans only the affected programme. Existing bookings from every other programme are frozen.
- **Option B — Portfolio-aware replan:** LabOS identifies the other programmes whose bookings/forecasts could move, names them explicitly, and lets the user choose which of those programmes may be flexed. All unselected programmes remain protected.
- Before either proposal can be applied, LabOS shows a programme-by-programme impact table: current forecast, proposed forecast, delay/advance in days, due date, delivery-state change and booking moves.
- Every proposal has explicit **Accept** and **Reject** controls. Reject leaves the schedule untouched and keeps planning marked for review.
- Every accepted replan stores a bounded schedule restore point. **Undo accepted replan** restores the exact prior bookings/leg forecasts while keeping the logged operational delay active, so the schedule is visibly marked as needing review rather than silently deleting the real-world constraint.
- Undo is available immediately after acceptance and persistently from Validation / Planning while an undo point exists.

## New in v1.4.0 — corrected Validation Plan Designer and specification-driven test selection

- **No arrows between main Test Legs.** Test Leg 1, Test Leg 2, Test Leg 3, etc. remain independent plan columns. Visual arrows are used only for sequence *inside* a leg; dependencies between main legs remain in the canonical dependency model without a decorative left-to-right connector.
- **Split branches are side by side.** A split inside Test Leg 1 renders **1a** and **1b** in parallel horizontal lanes within the same Test Leg. Each branch can still contain its own sequential tests before an explicit merge. Narrow screens preserve the side-by-side relationship by allowing the validation canvas to scroll horizontally rather than stacking the branches vertically.
- **Every test insertion supports two deliberate paths.** The user can either **Select standard test** from the released Test Library or **Define required specs** when the required validation outcome is known but the method is not.
- **Specification capture is explicit.** The specification route captures test requirement/name, category, required equipment type, required skill, conditions/range, measurement/accuracy requirements, acceptance criteria, expected execution time and DUT quantity.
- **Automatic Test Library assessment.** LabOS compares the entered specification against released standard methods and classifies the result as **Existing standard suitable**, **Existing standard needs adaptation**, or **New test development required**. The assessment shows the closest method, match score, capability gaps, estimated development days, engineering hours, technician hours, estimate confidence and the historical basis used.
- **Development estimates flow into planning.** Adaptation/new-method estimates and their basis/confidence are carried into the method-development task and validation-plan explanation instead of presenting a misleading zero-day development result before the requirement has been assessed.
- **Branch creation uses the same logic.** The first test in 1a and 1b can independently be selected from the Test Library or defined from specifications and assessed before the split is created.
- **Existing split/merge and downstream-flow logic is retained.** Branch DUT populations remain deterministic and non-overlapping, merge remains explicit, and preserved downstream common work is reconnected after the merge.

## New in v1.3.0 — editable splits, coordinated prototype/validation planning and Scenario Studio

- **Split can be inserted into an existing validation path.** A common test can be split even when later tests or later Test Legs already exist. Existing downstream work is preserved behind the merge junction rather than making the Split action disappear.
- **Branch/merge remains explicit.** In v1.3.0 this was rendered as stacked `1a` / `1b` sub-legs; **v1.4.0 supersedes that presentation with side-by-side branches**. Each branch can contain multiple sequential tests, and a prominent **Merge … here** action reunites the DUT populations before the preserved common path continues.
- **Programme-lane planning view.** Planning can show one colour-coded lane per validation programme; a linked prototype build appears in the same programme lane before the validation work it releases.
- **Combined resource planning view.** A toggle switches to the resource/equipment perspective so all programme demand is combined while retaining programme ownership colours.
- **Planning horizon control.** The planning workspace can be viewed over 14, 28 or 42 days.
- **Scenario Studio.** The planner can sandbox equipment breakdowns, sample delays, method-development delays, linked prototype-build delays, key-staff absence and programme-priority changes without altering the live operational plan.
- **Automatic recovery comparison.** For disruption scenarios LabOS recalculates the constrained portfolio and, where relevant, compares it with a programme-protection recovery scenario so the user can see forecast, lateness, moved bookings and unscheduled work before deciding what to do.
- **Prototype linkage remains optional.** Standalone prototype builds remain independent. When a build is linked to validation, sample-ready timing and planning are coordinated automatically.

## New in v1.2.0 — intuitive logical Test Legs

The Validation Plan Designer now separates a **logical Test Leg** from the individual tests that run inside it. This fixes the earlier ambiguity where every test box effectively behaved like a new leg.

- **One Test Leg = one column.** Test Leg 1, Test Leg 2, Test Leg 3, etc. are the main validation columns.
- **Multiple sequential tests per leg.** Use **＋ Test below** to add another test beneath the selected test while remaining inside the same Test Leg.
- **Explicit arrows show sample flow.** In v1.2.0 sequential tests were linked top-to-bottom and main Test Legs also had left-to-right arrows; **v1.4.0 removes the arrows between main Test Legs** while retaining internal-leg sequence indicators.
- **Branches stay inside their parent leg.** In v1.2.0 the sub-legs were stacked; **v1.4.0 keeps them inside the same parent leg but renders 1a and 1b side by side**. They do not become adjacent main Test Legs.
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

## v1.14.0 — guided operations, prototype-to-validation coupling, visual flow editing

This update removes a class of dead-end status screens. Blocking conditions now expose a guided recovery path that explains the physical/controlled action, the evidence required to clear the gate, and the planning action that follows. Custody/sample blockers include per-DUT disposition and replacement workflows; prototype, method-development, calibration, resource, specification and predecessor blockers route to their relevant operational action instead of merely displaying the reason.

Prototype build requests can now be linked to the entire validation programme, a specific main Test Leg, or one specific executable test. The request records both expected material availability and expected build completion. Updates and delays propagate into the linked sample-ready gate and trigger protected replanning of the linked programme by default. Users can optionally simulate a portfolio trade-off in which selected other programmes are allowed to yield capacity, review programme-by-programme impact, then accept or reject. Accepted replans remain undoable.

Prototype execution is evidence-aware: expected material availability is a planning input, while starting the build requires a physical material-release reference and completion requires completion evidence. The prototype detail screen is now a guided workflow rather than a passive status modal.

The Validation Designer now supports drag-and-drop repositioning on desktop and an explicit Move control for touch/mobile. Both change the executable predecessor relationship rather than merely reordering pixels. The established recursive split/merge model remains intact, including nested branches and independent main Test Legs.


## v1.17.0 — Guided workflow & UI simplification

- Schedule review no longer presents a contradictory "best feasible" message when tests remain unscheduled. The user is taken directly to grouped blockers with Resolve actions and a retry loop.
- Auto planning also stops and opens guided blocker recovery if the requested scope cannot be fully scheduled.
- Blocked execution and planning rows expose a direct Resolve blocker action instead of dead/disabled actions.
- Every operational workspace now includes a compact Guided workflow foldout with task-based entry points; nested workspaces route to the relevant action rather than leaving the user to hunt through modules.
- Secondary information sections use progressive disclosure to reduce page clutter, especially on mobile.
- Mobile section headings and planning-intelligence dividers were corrected to prevent headings/hints from running into each other.
- A Help & Manual workspace was added plus a full HTML user manual and quick-start guide using real prototype screenshots and worked examples.
