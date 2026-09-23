# Frontend checkpoint I02

Light, browser-native Akim Lab frontend. Start with `PORT=3001 ./scripts/start.sh` for the builder worktree (lead uses port 3000). Three.js and OrbitControls are locally vendored by the lead; no CDN or frontend build/install step is needed.

## Files and boundaries

- `public/index.html`: semantic application shell and local Three import map.
- `public/styles.css`: fixed light palette, laptop layout, small-screen layout, keyboard focus, reduced motion and print styles.
- `public/app.js`: plan state, shared evaluator wiring, project/target controls, result/evidence rendering, saved plans, API requests and exports.
- `public/city.js`: geographic projection, procedural presentation, camera, project visuals and fallback. Contains no policy score/effect calculations.

The browser imports `DATASET`/`EXAMPLE_PLAN` and `BASELINE`/`validatePlan`/`simulatePlan` from the contract paths. Missing scene assets cannot prevent the planner from loading. Dataset/model loading failure is visible and never replaced by invented numeric fixtures.

## Plan state

Selections are keyed by `measureId`, with `districtId: null` for city-wide projects. Slots retain selection order; simulation output is allowed to use its own canonical ordering. Each addition/target change passes `validatePlan(..., {allowPartial:true})`. The final Apply action calls `simulatePlan` and requires a valid five-project plan. Editing clears the applied result and pending advice, leaving the baseline explicitly labeled as a reference.

Undo retains up to 30 edit snapshots. Local storage saves only selections/locks and the pinned Plan A selection set, under the dataset version; restored results are recomputed. A/B and before/after reuse one camera. Advice, export and pin actions require the currently displayed, applied plan, so viewing baseline or Plan A cannot silently act on Plan B.

All numeric scores/effects come from the shared model or reverified server response. Catalog chips are labeled **base effects before delay**. Display deltas subtract full-precision values and are rounded once; a note/tooltip explains why subtracting two rounded headline values can differ by 0.01. Exports retain full model precision.

Advice and improvement requests have a 45-second timeout, an AbortController and revision checks. Edits or changed locks invalidate in-flight responses. Text is inserted using `textContent`. Suggestions are locally recomputed, checked for strict improvement, matching preview score and preserved measure/district locks, then presented with a separate Apply action. No global optimum is claimed.

## Geography and visual meaning

The scene consumes `/api/geography` and uses its origin to project longitude/latitude into local kilometers, with north as negative Three.js Z. District borders, roads and water use supplied geometry. Representative buildings are deterministically sampled near roads and within district land; water is excluded. They are not surveyed properties. The initial camera focuses the selected district; **Fit city** restores the full geographic overview.

Sarayshyk is neutral and has no scenario score. Polygon rings that collapse to fewer than three distinct vertices or zero area are excluded from mesh triangulation; this protects the renderer from simplification artifacts, without changing simulation data. All source attribution is provided through the map response and footer.

Each of the 14 projects maps to a small reusable visual form (transit, signals, rail, park, utility retrofit, city greening, school, clinic, sports, safety lighting, crossing, digital hub, network, response van). Draft layers are translucent; valid applied layers are solid. Replacing/removing a project rebuilds that derived layer instead of accumulating permanent upgrades. City-wide measures display in all five modeled districts. Asset locations and sizes are illustrative, not construction proposals. The short vertical reveal is a presentation transition, not a quarter-by-quarter forecast.

The 3D module and vendor imports fail independently of the model. Missing WebGL/geography provides a labeled 2D district view and the same HTML controls/results. `/?view=2d` deliberately selects this fallback for a compatibility check. Labels that would overlap at distant zoom levels are hidden; all modeled districts remain accessible through the labeled district buttons. Shared meshes/materials, instanced base buildings, bounded procedural density, bounded zoom/elevation and a pixel-ratio cap limit rendering cost. No frame-rate guarantee has been measured.

## First-checkpoint validation

Checked on port 3001 against the merged engine/backend/geography baseline `bf497f0`:

- Shared engine, server and independent acceptance suite: 70 tests passed; the server suite was rerun after the tiny-water-ring fix (9 passed).
- Browser: published example costs 95, has five projects, score 56.54 (full precision 56.54307), zero critical indicators, and the Nura school delta is +10.
- Browser: lock the Nura school, pin Plan A, request one improvement, inspect 57.21 / cost 100, then explicitly apply and reproduce 57.21. School and district lock remain intact. Pinned A remains 56.54.
- Browser: a live adviser response renders with its mode and calculation-evidence disclosure. Browser errors were absent on the tested successful load.
- Browser: 390px viewport has no horizontal page overflow and Reset remains available. The 3D map, district focus and project layers render.
- Browser: forced 2D compatibility view still simulates the published example at 56.54 / +3.99, removes a project without retaining an official score, and restores five choices with Undo. It also has no horizontal overflow at 390px.

Further manual checks and limitations are recorded in the worker handoff. This first checkpoint does **not** yet include moving ambient cars/pedestrians, reaction bursts, landmark silhouettes, full changed-asset highlighting or performance profiling. Those are subsequent increments; required numeric behavior is already wired.
