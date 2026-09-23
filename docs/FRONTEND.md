# Frontend — I02

Light, browser-native Akim Lab frontend. Start with `PORT=3001 ./scripts/start.sh` for the builder worktree (lead uses port 3000). Three.js and OrbitControls are locally vendored by the lead; no CDN or frontend build/install step is needed.

## Files and boundaries

- `public/index.html`: semantic application shell and local Three import map.
- `public/styles.css`: fixed light palette, laptop layout, small-screen layout, keyboard focus, reduced motion and print styles.
- `public/app.js`: plan state, shared evaluator wiring, project/target controls, result/evidence rendering, saved plans, API requests and exports.
- `public/city.js`: geographic projection, procedural presentation, camera, project visuals and fallback. Contains no policy score/effect calculations.
- `public/city-motion.js`: pure distance-based interpolation along supplied roads; no traffic or citizen behavior simulation.

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

These checks describe the first checkpoint, `ff05bcc`. Further checks and exact commit/port are recorded in the worker handoff.

## Second increment: city life and comparison clarity

- At most 22 small cars and 28 pedestrians follow deterministic samples of the supplied urban road paths. Distance interpolation handles duplicate vertices, endpoints and reversing direction. The speed/density are cosmetic constants, not derived traffic forecasts or resident counts. Shared instanced meshes keep this small population inexpensive to draw.
- Road and water features are combined into one draw object each; base trees are instanced. Geographic outlines and coordinates are preserved, including holes. This reduces object/draw overhead without replacing the source map with invented geometry.
- Applying a new valid plan creates at most four short reaction labels from `result.contributions[].effects`, already realized by the engine. Negative effects use a caution marker; effects are before synergy. Reactions last at most 1.8 seconds, clear on edits/baseline/Plan A/pause, and do not replay merely from toggling a view. They are illustrative, not measured sentiment. Exact numbers remain in the persistent inspector.
- Pause freezes road activity and suppresses reactions. Reduced-motion preferences are respected on load and when changed: city animation stays paused, reaction bursts are omitted, and camera transitions complete immediately. The control says Reduced motion while that preference is active.
- Comparison chips show added and removed project/district pairs relative to pinned A. Green rings mark additions in the current view; amber rings mark the corresponding old assets in Plan A. A chip selects the appropriate view and focuses that project, or focuses its district in 2D mode. Retargeting counts as an old site removed and a new site added. An unchanged plan still exposes project-inspection chips.
- Initial urban framing focuses the selected Nura district, while Fit city retains the complete geographic overview. Labels avoid overlap without moving their geographic anchors.

Validation for this increment includes the 71-test merged model/server/acceptance suite, direct road-interpolation edge checks, real browser reaction values (school +10, clinic +8.75), camera/project comparison controls and pause/resume. Two cropped paused-canvas captures were identical; moving-state captures changed. The comparison flow showed one addition/one removal, 57.21 for current B, and 56.54 for the corresponding pinned A.

Remaining limits: representative assets rather than surveyed buildings; no landmark silhouettes, individual pathfinding or calibrated travel times; no promised frame rate. Export/print artifacts and a deliberately delayed network-race scenario still require manual review. OS-level reduced-motion changes are handled in code; that system setting has not been changed during the browser check.
