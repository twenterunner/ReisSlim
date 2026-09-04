# LabOS Prototype v0.1.0 — Verification Record

Verification date: 4 September 2026

## Delivered deterministic dataset

- Programmes: 10
- Validation requirements: 60
- Test legs: 50
- DUTs: 100
- Test-library methods: 30
- Equipment assets: 33
- Staff: 15
- Calibration records: 36 (including historical/current records and one deliberately scheduled future recalibration)
- Test-development tasks: 5
- Seeded result records: 40
- Synthetic calibration certificate PDFs: 31

## In-app diagnostics — PASS 10/10

Administration → Run System Verification checks:

1. Orphaned record references
2. Equipment booking overlaps
3. Staff booking overlaps
4. Calibration validity in the future plan
5. Qualified staff allocations
6. Critical requirement coverage
7. Test-library durations
8. Dependency graph integrity
9. Deterministic numeric result evaluation
10. Demo dataset scale

Result: **PASS — 10/10**.

## Extended deterministic model verification — PASS

The repository includes `verify-model.mjs`. The final build passed checks for:

- deterministic seeded dataset scale;
- method/equipment/DUT capacity multi-batch planning;
- development-gated test release;
- predecessor sequencing;
- current calibration status excluding a future scheduled calibration;
- future planning using that scheduled recalibration only after its effective date;
- priority promotion materially replanning the schedule (28 booking changes in the seeded test);
- a 7-day equipment-outage scenario changing the plan;
- rejection of a manual assignment without the required authorisation;
- full JSON canonical-state round-trip;
- initial deterministic scheduling well below the 2-second target in the verification environment.

Result: **PASS**.

## Static/deployment verification — PASS

- JavaScript syntax checks: PASS
- HTML local references: PASS
- Manifest icon/reference checks: PASS
- Service-worker cache asset references: **40/40 present**
- Local static-server retrieval of service-worker assets: **40/40 HTTP 200**
- Bundled calibration PDFs: **31/31 valid PDFs**
- GitHub Pages paths: relative (`./` / repository-relative), with no root-path dependency

## UI smoke verification

During the build, the application was smoke-rendered in headless Chromium at desktop and mobile viewport sizes across all 12 primary navigation routes, with no uncaught JavaScript errors observed. The final calibration reconciliation change was subsequently rechecked through JavaScript syntax verification, deterministic model verification and static-asset verification. The final execution sandbox had a managed Chromium URL block policy, so a second navigation-based Chromium run after that last reconciliation change could not be performed in that environment.

## Key reconciliation fixed before packaging

The final pass corrected calibration effective-date handling so that:

- a future **Scheduled** calibration is not shown as the asset's current certificate;
- current equipment/calibration status uses only calibrations already effective;
- the scheduler may rely on a scheduled recalibration only for work beginning after that calibration event;
- future-plan diagnostics evaluate the calibration effective at each booking's planned start;
- execution readiness uses the calibration effective at the planned test window and still requires the planned start to have been reached.

- Flat repository structure: PASS — no directories; all application files and demo certificates are at repository root.
