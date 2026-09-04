# LabOS Prototype v0.1.0

LabOS is a static, browser-only prototype combining Laboratory Information Management (LIMS), validation requirements management, resource-constrained laboratory planning, equipment/calibration management, people/skills management, test-development management, programme prioritisation, capacity analytics and management decision support.

## What this prototype demonstrates

The canonical workflow is **requirements -> test demand -> deterministic resource-constrained planning -> execution -> evidence -> management visibility**. The seeded dataset includes requirement flowdown, programmes and multi-leg DUT populations, a reusable test library, new-method development tasks, equipment and calibration validity, staff qualifications, deterministic scheduling, manual locked bookings, planning explanations, what-if scenarios, numeric result evaluation, DUT genealogy, bottleneck analytics, global search, browser-local documents, JSON/CSV export and a deterministic system verification page.

Deliberate demo storylines include a normal standard programme, thermal-chamber capacity pressure, calibration expiry conflict, a single-person EMC qualification bottleneck, test-method development delay, critical reprioritisation, a failed DUT and a vibration-system breakdown.

## GitHub Pages deployment

1. Create a GitHub repository.
2. Upload **all ZIP contents directly to the repository root**.
3. Commit the files to `main`.
4. Open **GitHub Settings -> Pages**.
5. Select **Deploy from a branch**, branch `main`, folder `/ (root)`.
6. Open the generated GitHub Pages URL.

All application paths are relative, so deployment also works at URLs such as `https://username.github.io/repository-name/`.

## Run locally

The app is static. For the most reliable browser behaviour (service worker and IndexedDB), serve the folder with any local static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

Opening `index.html` directly may work for core UI functions, but browsers can restrict service-worker/module behaviour on `file://` URLs.

## Major modules

- Dashboard: portfolio, delivery, capacity, bottlenecks, requirement health, development queue and calibration risk.
- Requirements: traceability matrix and end-to-end requirement drill-down.
- Programmes: priority control, forecast dates, storylines and test-leg progression.
- Test Planning: deterministic scheduling, equipment timeline, planning explanations, manual locked bookings and what-if scenarios.
- Test Execution: lifecycle/readiness checks and result/evidence visibility.
- DUTs: genealogy and full programme journey.
- Test Library: standard durations, equipment/skill requirements, usage and actual-vs-standard analytics.
- Equipment: asset register, capability, utilisation, maintenance and calibration state.
- Calibration: current/historical records, warning states, demo certificates and local certificate upload.
- People & Skills: workloads, qualifications and single-point competency risks.
- Reports / Analytics: category demand, utilisation, planned-vs-actual and development workload.
- Administration / Demo: role view, audit history, scenarios, reset/import/export and system verification.

## Persistence and data transfer

The canonical application state is stored in **IndexedDB**, with localStorage fallback where IndexedDB is unavailable. User changes survive refresh/browser restart on the same browser profile. Use **Export Data** for a complete JSON snapshot, **Import Data** to restore a snapshot, and **Reset Demo Data** to restore the deterministic original dataset. CSV exports are provided for key tables.

Uploaded calibration certificates are stored browser-locally as data URLs inside the prototype state. Three synthetic PDF certificates are also shipped as local demo documents.

## Planning assumptions

This prototype uses a deterministic heuristic scheduler rather than an industrial MILP/CP-SAT optimiser. It sorts demand by programme priority and due date, then finds the earliest feasible equipment/operator combination while enforcing: method/equipment compatibility, predecessor completion, development readiness, equipment outages, calibration validity through the full equipment booking, qualified staff, staff unavailability and prohibited resource overlaps. Unattended methods reserve equipment for the full run but reserve the assigned person for the attended setup/teardown/analysis window.

The planning horizon is 90 days and candidate starts use deterministic workday slots. These choices keep the browser-only demo fast and reproducible while preserving the conceptual architecture required for a later enterprise optimiser.

## Static-prototype limitations

This is intentionally **not** presented as a production-validated LIMS. It does not yet provide a central multi-user database, true authentication, server-enforced authorisation, validated electronic signatures, authoritative enterprise audit storage, automated server backups, concurrent-user conflict management, production document controls or regulated validation evidence. Role switching is illustrative only and is not security.

A production migration can preserve the conceptual model: move canonical entities to a transactional backend/database, replace browser persistence with APIs, add identity/authorisation and immutable audit storage, migrate documents to managed object storage, and replace/augment the heuristic scheduler with an enterprise optimisation service.

## Verification

Administration -> **Run System Verification** checks canonical references, equipment booking overlaps, staff booking overlaps, calibration validity in the future plan, qualified allocations, critical coverage, library durations, dependency cycles, deterministic numeric pass/fail evaluation and seeded dataset scale.

The delivered build was also tested outside the app with deterministic Node-based model checks, static deployment/asset validation and headless Chromium smoke rendering during the build. See `VERIFICATION.md` for the exact final verification record and environment note.


## Package structure

This delivery uses a completely flat repository structure: all HTML, CSS, JavaScript, manifest, icon, synthetic calibration PDFs, documentation and verification files sit directly in the repository root. There are no asset or certificate subfolders.

