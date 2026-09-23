# Frontend — I02 and R02

Light, browser-native Akim Lab frontend. Start with `PORT=3001 ./scripts/start.sh` for the builder worktree (lead uses port 3000). Three.js and OrbitControls are locally vendored by the lead; no CDN or frontend build/install step is needed.

## Files and boundaries

- `public/index.html`: semantic application shell and local Three import map.
- `public/styles.css`: fixed light palette, laptop layout, small-screen layout, keyboard focus, reduced motion and print styles.
- `public/app.js`: plan state, shared evaluator wiring, project/target controls, result/evidence rendering, saved plans, API requests and exports.
- `public/city.js`: geographic projection, procedural presentation, camera, project visuals and fallback. Contains no policy score/effect calculations.
- `public/city-motion.js`: pure distance-based interpolation along supplied roads; no traffic or citizen behavior simulation.

The browser imports `DATASET`/`EXAMPLE_PLAN` and `BASELINE`/`validatePlan`/`simulatePlan` from the contract paths. Missing scene assets cannot prevent the planner from loading. Dataset/model loading failure is visible and never replaced by invented numeric fixtures.

## Plan state

Selections are keyed by `measureId`, with `districtId: null` for city-wide projects. Slots retain selection order; simulation output is allowed to use its own canonical ordering. Each addition/target change passes `validatePlan(..., {allowPartial:true})`. Start calls `timelinePlan` once and requires a valid five-project plan. Its quarter-eight result is exactly `simulatePlan`. Editing clears the applied result and pending advice, leaving the baseline explicitly labeled as a reference.

Undo retains up to 30 edit snapshots. Local storage saves only selections/locks and the pinned Plan A selection set, under the dataset version; restored results are recomputed. A/B and before/after reuse one camera. Advice, export and pin actions require the currently displayed, applied plan, so viewing baseline or Plan A cannot silently act on Plan B.

All numeric scores/effects come from the shared model or reverified server response. Catalog chips are labeled **base effects before delay**. Display deltas subtract full-precision values and are rounded once; a note/tooltip explains why subtracting two rounded headline values can differ by 0.01. Exports retain full model precision.

Advice and improvement requests have a 45-second timeout, an AbortController and revision checks. Edits or changed locks invalidate in-flight responses. Text is inserted using `textContent`. Suggestions are locally recomputed, checked for strict improvement, matching preview score and preserved measure/district locks, then presented with a separate Apply action. No global optimum is claimed.

## Geography and visual meaning

The scene consumes `/api/geography` and uses its origin to project longitude/latitude into local kilometers, with north as negative Three.js Z. District borders, roads and water use supplied geometry. Representative buildings are deterministically sampled near roads and within district land; water is excluded. They are not surveyed properties. The initial camera focuses the selected district; **Fit city** restores the full geographic overview.

Sarayshyk is neutral and has no scenario score. Polygon rings that collapse to fewer than three distinct vertices or zero area are excluded from mesh triangulation; this protects the renderer from simplification artifacts, without changing simulation data. All source attribution is provided through the map response and footer.

Each of the 14 projects maps to a small reusable visual form (transit, signals, rail, park, utility retrofit, city greening, school, clinic, sports, safety lighting, crossing, digital hub, network, response van). Draft layers are translucent; valid applied layers are solid. Replacing/removing a project rebuilds that derived layer instead of accumulating permanent upgrades. City-wide measures display in all five modeled districts. Asset locations and sizes are illustrative, not construction proposals. The short vertical reveal is a presentation transition. The HUD now supplies shared timeline frames to the renderer; quarter 1–7 is explicitly illustrative, not a forecast.

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


## R02: fullscreen HUD and construction replay

The city fills the viewport. A compact top HUD shows the budget, slot count, baseline or completed official score, weakest district and critical count. The bottom horizontal tray uses fourteen distinct inline SVG icons, short names and costs. Hover, keyboard focus and tap expose the full description, base effects, delay and scope. District projects use card → district placement; labeled district buttons and an explicit Place button provide keyboard and touch alternatives. City-wide cards add across all five districts. Invalid additions show the shared validator's reason.

Detailed slots/locks, statistics/end report, timeline and source information open in native modal dialogs. Only one dialog is open at a time. The report retains the score ledger, adverse effects, district indicators, immutable Plan A comparison, verified improvement, JSON export and print. Project inspection closes the report and focuses its map asset.

Start calls `timelinePlan(selections)` once. The client owns only the replay clock: one quarter takes 1.8 seconds at 1×; pause, 2× and 4× change playback. Background tabs pause progression. The renderer receives the matching shared frame result and `replay: {quarter, completedMeasureIds, running, speed}` with mode `after`. A owns construction scene implementation. No official headline or adviser is available during a run; the HUD shows an em dash until quarter eight. Quarter zero is baseline and intermediate report/chart values are labeled illustrative. The end result is the exact final shared frame. Edits cancel the run and clear computed results/advice. Reduced motion skips to the same official endpoint.

The timeline window draws a city/district chart and accessible numeric table using only frames reached so far. The end report opens automatically at quarter eight. Pinning a completed plan preserves A while subsequent edits and runs form B.

Narration is button initiated. `/api/speech` receives exactly `.adviser-text`'s displayed briefing, with an AI-generated voice disclosure. The visible text remains the transcript. Stop, dialog close, view changes, plan edits and new advice stop/revoke audio and cancel speech requests. A failed server request attempts browser speech, then retains the text. Revision/request identity checks discard stale responses. API keys remain server-side. The optional second `onCredit(text, attributionUrl)` callback argument creates a safe HTTP(S) source link in About; legacy one-argument callbacks still show attribution text.

### R02 checks on port 3001

- All 76 shared model/server/acceptance tests pass, including exact q8 replay equality, negative effects, invalid plans and speech transport. Frontend syntax and whitespace checks pass.
- Browser desktop 1280×900: full-canvas map, compact HUD and horizontal tray; card selection alone leaves 0/5, clicking Nura places the school at 24 units. Start remains disabled for a partial plan.
- Browser example replay: Pause held at Q0 across observations, official headline stayed empty; 4× resumed to 56.54 / +3.99 / zero critical indicators. Intermediate timeline rows explicitly say illustrative.
- Browser mobile 390×844: usable HUD/cards/district controls and modal report. No page or report horizontal overflow after correcting inherited inspector grid placement. Saved A 56.54 versus replacement B 57.21 shows +0.66, cost95 → 100.
- Browser live AI: verified briefing and replacement proposal rendered. Read briefing aloud progressed from preparation to AI-generated voice playback; Stop worked without browser errors.
- Browser forced 2D: replaced lighting with M11 in Almaty, completed at 55.14; road flow 38.3 / -1.8 is visibly critical and road safety +10.5 remains positive. Completing while Timeline was open leaves only the result dialog open.

Limits: the R02 checkpoint does not edit `city.js` or implement landmark models. A/Claude own those integrations. Browser speech fallback and an OS-level reduced-motion switch were not deliberately forced; code handles both, while backend no-key/transport tests pass. Printed/exported artifact files have not been manually reviewed. No dragging or worker-machine ornament is added.

## R02 combined follow-up on 0566aeb

The real browser JSON download at `/Users/admin/Downloads/akim-lab-plan.json` was parsed and its result deep-compared with `simulatePlan(selections)`: five selections, cost95, full score56.54306999999999, critical0, correct dataset version and map/scenario provenance. The Print button was invoked, but the in-app browser exposed no print preview or printed artifact. Printing therefore remains unverified. Its available browser capabilities also lack media emulation. A temporary Node harness executed the actual `applyPlan`/`finishRun` code with `reducedMotion=true`: it immediately preserved the exact shared result, kept motion paused and opened the end report. This is a control-flow check, not verification of OS preference propagation.

## R05: existing services and additive projects

Every modeled district has six permanent representative service parcels: school, clinic, safety/lighting post, utility plant, civic service centre and transit stop. Their locations are deterministic illustrative placements near the mapped road samples, with a deterministic land search when samples are sparse. They are not a surveyed service inventory. Before, draft, quarter zero, replay, Plan A and completed views retain the same baseline objects. Zoomed district labels identify the service; tooltips show its corresponding shared-model indicator and whether its project is planned or completed.

Projects linked to those services add a wing, retrofit, signal, lamp/camera, crossing, service terminal, transit segment or crew van beside the original form. Independent park, greening and sports interventions use smaller separate parcels. Construction scaffolding occupies the extension side while the existing service stays open visually; completion follows `completedMeasureIds`, and indicator values remain the shared frame's values. No new scores or economic model are introduced.

All service and project parcels are reserved before ordinary filler buildings are sampled. The placement check uses distances to district and water boundaries, including holes, plus `cityDetails.isReserved`. This catches narrow waterways passing through a footprint, which checking only its corners would miss. Six existing parcels and three independent intervention parcels are allocated deterministically per district; building filler avoids these spaces. Physical bounds are checked separately from decorative selection rings.

`cityDetails.update?.({timeSeconds: motionTime, motionEnabled: moving})` uses the same elapsed-time clock as road population. The optional call safely handles older detail modules and freezes with pause/reduced motion; replay speed scales elapsed time. The mapped LRT remains a geographic detail, separate from the synthetic M3 intervention.

Per the latest user direction, persistent landmark nameplates are hidden; mapped landmark meshes and `focusLandmark` remain available. The new `highlightProject(measureId|null, districtId|null)` API highlights an affected district/service parcel or all five modeled districts for a city-wide project. Passing null clears it. It does not change plan selections, results or camera. R07 will wire card hover/focus to this method.

### R05 validation

A temporary Node geometry harness runs the actual scene functions with the real vendored Three geometry and real geography, replacing only WebGL/DOM presentation. It verifies 30 services across five districts; their actual footprint corners are on land and outside reserved layers; identical baseline group objects survive all nine replay quarters and every view; all nine published-example visual additions follow construction completion IDs. Every one of the fourteen archetypes renders for every permitted district and has physical footprint corners on unreserved land. Hover ring counts switch 5 → 1 → 0 without changing selections. The details clock stops for both pause and reduced motion. This caught and corrected a narrow-waterway footprint collision and an overlarge independent park parcel.

Browser on port3001 verified actual WebGL, six service labels per district (30 total), zero visible landmark nameplates, and a paused quarter-zero scene with existing forms plus scaffolding, no upgraded labels and no official score. Existing 76 engine/server/acceptance tests still pass. Syntax and whitespace checks pass.

This checkpoint is based on geography/module 0566aeb. The next 14-landmark/LRT geometry and enhanced detail module are parallel dependencies; recheck placement after integrating them. No claim of a measured frame rate or surveyed building inventory is made.

## R07: illustrated physical card deck

Project cards now sit directly over the city on a shallow arc, with no enclosing panel. Each card uses `/assets/projects/M1.png` through `M14.png` as a contained illustration: full object silhouettes remain visible, and the title, cost and placement state remain live HTML. A owns and supplies the approved project-specific artwork. Distinct inline icons remain available if an image cannot load. Card surfaces stay opaque when unavailable or disabled during replay.

The deck supports native horizontal scrolling, previous/next buttons, keyboard arrows and Home/End. Short filtered groups center on desktop; filters reset the scroll position without changing the plan. Card rotation and height depend on the visible deck centre. Focus stays visible while scrolling; reduced motion removes animated card lifting and smooth scripted scrolling.

Hover or keyboard focus calls the optional `city.highlightProject` API. City-wide measures highlight all five modeled districts; a district measure uses its already selected target or the current district. Leave, blur, manual scrolling, dialogs and re-rendering clear the highlight. Keyboard scrolling retains the focused project's highlight. Neither the highlight controller nor card navigation changes the plan or camera. Replay suppresses card highlights.

AkimLab appears centered only inside the actual scene-loading overlay and disappears when the existing scene-ready/fallback path hides that overlay. The permanent header brand and large scene slogan have been removed. Main-screen guidance is concise; full effects, delays, scope and provenance remain in the project details and About/report windows.

### R07 validation checkpoint

On port3001, desktop1280×720 and mobile390×844: card-to-district placement produced M1 in Almaty, cost18/one slot; the Transport filter showed exactly three projects. Attempting M3 with M1 preserved the plan and displayed the incompatibility. Keyboard End reached M14 and the deck's scroll limit, and arrow navigation revealed the correct details. Keyboard city-wide focus preserved the budget, slots and every district label's projected coordinates. The actual highlight-controller code also passed a temporary Node harness for existing target/current district/city-wide scope, clearing, dialog/replay guards and unchanged input state.

A paused example replay retained opaque cards, disabled card edits and an em dash for the official headline. Resuming at4× completed at56.54/+3.99/zero critical indicators and opened the report. Mobile page/report had no horizontal overflow. The existing76 model/server/acceptance tests and frontend syntax/whitespace checks pass. Loading branding was absent after scene readiness, and the deck background computed as fully transparent.

After merging artwork baseline `4892695`, all fourteen browser image elements loaded successfully with contain sizing and opaque card surfaces; costs matched the dataset. Desktop screenshots covered M1–M14, including the alpha-bearing M13 over its opaque backing; mobile390×844 artwork also remained readable. A compact375×667 layout had no main-screen clipping, and filtering a pending school placement cancelled that unplaced choice without adding a project. Browser JavaScript warning/error logs were empty. This checkpoint makes no new print-preview, OS media-emulation or frame-rate claim.
