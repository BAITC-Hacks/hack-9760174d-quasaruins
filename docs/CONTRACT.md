# Akim Lab component contract

Native Node 22+ ESM server; native browser ES modules. No server runtime dependencies. Three.js is pinned and vendored locally by codex-A.
Shared modules must not use Node APIs so the same functions run in browser and server.

## Ownership

- codex-A: `shared/**`, `server/**`, `data/**`, `scripts/**`, `public/vendor/**`, `public/assets/projects/**`, `docs/PROJECT-ART.md`, `tests/engine.test.mjs`, `tests/server.test.mjs`, configuration/manifests, README, this contract and integration. R04 geographic data is complete. R10 finishes approved art and combined checks.
- codex-b: R07 owns `public/app.js`, `public/index.html`, `public/styles.css` and `docs/FRONTEND.md` for the illustrated card deck. After R07 integration acknowledgment, R08 owns `public/city.js` for city spacing, architectural colors and additional baseline services; CSS changes are limited to the matching white background. Preserve all construction/replay/hover behavior. Read the shared STYLE-GUIDE.md before starting.
- claude: finishes R06 map-detail handoff, then R11 owns `public/i18n.js` and `docs/I18N.md` for Kazakh/Russian/English UI switching. A takes `public/city-details.js` and `docs/CITY-DETAILS.md` for R09 materials/reservation checks after the R06 handoff. Review files remain `test/acceptance/**`, `tests/acceptance.test.mjs`, `docs/ACCEPTANCE.md`, `docs/REVIEW.md`.

### Immediate scene integration contract

Claude exports `createCityDetails({THREE,geography,project,groundY=.16})`, returning
`{group,landmarkAnchors,isReserved,dispose}`. `project([lon,lat])` returns local
`[east,north]` in scene units; Three x=east, z=-north. The returned Group includes
mapped landmarks and three park surfaces with sparse trees. No DOM, network,
global scene or application state mutation. Reuse supplied THREE and cap trees
to about 90 total. Respect Polygon/MultiPolygon and holes. Landmark vertical
forms may be exaggerated for the miniature style, while horizontal placement
follows the supplied footprints. `landmarkAnchors` is
`[{id,name,position:[x,y,z]}]`; A handles any HTML labels. `isReserved(point,clearance=0)`
accepts `[east,north]` and detects park/landmark interiors or boundary distance
within `clearance` scene units, including an enlarged visible landmark base.
`dispose()` releases the module's own geometries/materials. A wires this module
into `city.js`; B must not duplicate it.

R08/R09 spacing refinement: the renderer may multiply the local kilometer
projection by approximately two horizontally. Every geographic layer consumes
the same supplied projection; do not scale landmark positions independently.
Source lon/lat, topology, district identities and official math stay unchanged.
Use modest, readable model dimensions rather than doubling the entire scene.
Reservations must cover actual rendered geometry at the chosen projection scale.
Building heights and placements of ordinary services remain illustrative.

### Expanded mapped backdrop — R04/R05/R06

Landmark Point properties retain the same schema. Additional model IDs are
`hazret-sultan`, `nur-alem`, `kazakh-eli`, `astana-opera`, `concert-hall`,
`astana-arena`, `abu-dhabi-plaza`, `grand-mosque`, `national-museum`, and
`mangilik-el-arch`. A supplies only verified coordinates, with attributed
footprints where available. Missing layers and unknown model IDs are safe to skip.
Enlarged landmark forms must reserve their visible base and stay recognizable.

Optional `geography.lrt` has `{line,stations}`: a LineString/MultiLineString
FeatureCollection and a Point FeatureCollection with properties `{id,name,
scored:false,sourceUrl,attribution,licenseUrl?}`. Lines carry the same provenance.
Geometry is a real mapped backdrop, independent of synthetic intervention M3.
Neither existing landmarks nor LRT add benefits, measures or scores.

The details module may return `update({timeSeconds,motionEnabled})` to animate
one decorative train. B calls it from the scene's existing clock; that clock
stops when paused or reduced motion is active. `isReserved` also covers the LRT
corridor, and `dispose()` releases its resources. Keep the 90-tree cap and mapped
water/landmark exclusions.

Baseline service forms appear in every modeled district before any project.
These placements remain illustrative, separate from mapped landmarks. Projects
add or upgrade their relevant service forms using shared replay/result state.
Existing services do not disappear when a plan is edited, reset, or compared.

The existing `city.update` gains optional `replay:{quarter,completedMeasureIds,running,speed}`.
B owns the replay clock and passes the shared frame's `result` through the
existing `result` field, with `mode:'after'` during replay. A derives construction
visuals from replay state; neither renderer nor UI invents intermediate math.
Clearing replay restores ordinary before/after/A views. Existing callers remain
valid. `createCity` gains optional `onDistrictHover(idOrNull)`; district clicks
continue to call `onDistrictSelect(id)`.

Browser imports use `/shared/city-data.js` and `/shared/simulation.js`. Backend serves those exact paths. Backend default port 3000; worker/reviewer may use PORT=3001/3002. Main launch: `node server/main.mjs`. Workers merge the assigned main baseline into their own branch; never reset or rewrite another branch.

Frontend library paths: `/vendor/three.module.js`, `/vendor/three.core.js`, `/vendor/OrbitControls.js`. Use an HTML import map mapping `three` to `/vendor/three.module.js`. codex-A supplies these files; codex-b may begin UI/scene source against these names immediately.

## Dataset (`shared/city-data.js`)

Named exports `DATASET`, `EXAMPLE_PLAN`.

```
DATASET = {
  version: 'hackalem-12-v1', budget: 100, horizon: 8,
  categories: [{id:'transport'|'ecology'|'social'|'safety'|'services', name:'Transport', color:'#...'}],
  indicators: [{id:'T1', name:'Road flow', category:'transport', weight:0.10, description:'...'}],
  districts: [{id:'esil'|'almaty'|'saryarka'|'baikonur'|'nura', name:'Esil', populationShare:0.27, description:'...', indicators:{T1:45,...}}],
  measures: [{id:'M1', name:'Dedicated bus lanes', description:'...', category:'transport', scope:'district'|'city', cost:18, lag:2, effects:{T1:6,T2:9}}],
  synergies: [{measures:['M1','M2'], targetMeasure:'M1', effects:{T1:2}, description:'...'}],
  incompatibilities: [{measures:['M1','M3'], scope:'any'|'same-district', message:'...'}]
}
EXAMPLE_PLAN = [{measureId:'M7',districtId:'nura'}, {measureId:'M8',districtId:'nura'}, {measureId:'M10',districtId:'nura'}, {measureId:'M12',districtId:null}, {measureId:'M5',districtId:'saryarka'}]
```

All IDs and canonical field names as above. Additional fields allowed. Extract full original dataset from the supplied Track 12 district PDF. No invented values. Dataset labels remain canonical English; the UI may translate them without mutating the dataset or IDs.

## Simulation (`shared/simulation.js`)

Named exports `BASELINE`, `validatePlan`, `simulatePlan`, `timelinePlan`.

```
validatePlan(selections, {allowPartial=false}={}) => {
 valid:boolean,
 errors:[{code:string,message:string,measureIds?:string[]}],
 cost:number, remaining:number, counts:{transport:number,...}
}
```

`allowPartial:true` permits 0-5 measures but still enforces budget, categories, uniqueness, IDs and conflicts. Used only to decide if adding a measure is allowed; it must not create an official score. `simulatePlan` always requires exactly five. Error codes: COUNT, BUDGET, DUPLICATE, DISTRICT_REQUIRED, DISTRICT_NOT_ALLOWED, UNKNOWN_MEASURE, UNKNOWN_DISTRICT, DIRECTION_LIMIT, INCOMPATIBLE, INPUT. Extra errors are allowed; callers must not depend on their ordering.

```
BASELINE = {
 score:52.55768, average:56.8624, minimum:49.18, criticalCount:2,
 districts:[{id,name,populationShare,indicators:{T1:45,...},score:62.99}],
 criticalIndicators:[{districtId:'nura',indicatorId:'S1',value:38},...]
}
simulatePlan(selections) => {
 ...validatePlan(selections),
 selections:[...],
 score:number|null, delta:number|null,
 average:number|null, minimum:number|null, criticalCount:number|null,
 districts: [{id,name,populationShare,indicators:{...},score,delta,indicatorDeltas:{...}}],
 criticalIndicators:[{districtId,indicatorId,value}],
 synergies:[{measures:[...],districtId,effects,description}],
 contributions:[{measureId,districtId,cost,realizedFraction,effects:{...},districtIds:[...]}]
}
```

For invalid plans, score/delta/average/minimum/criticalCount are null and calculated-result arrays are empty. Do not treat invalid plans as baseline or produce a score. Never mutate inputs or DATASET. Validate unknown IDs, duplicate measures, district/city targeting, max five/exact five, budget, max two per category, incompatible pairs. Strict number types are not coerced. The data include the negative T1 effect for M11. Order must not change result. Preserve numeric precision, round only in presentation. Baseline should be independently computed from data. Example cost95 score56.54307.

### Illustrative construction replay

`timelinePlan(selections)` returns `{valid,errors,cost,frames}`. Invalid plans
have an empty `frames` array. Valid plans have nine frames (quarters 0–8):
`{quarter,illustrative,official,completedMeasureIds,result}`. `result` has the
same shape as `simulatePlan`. Quarter 0 is labelled **Baseline**. Quarters 1–7
are explicitly **Illustrative replay**, never official intermediate forecasts.
Quarter 8 is the official result and is exactly `simulatePlan(selections)`.

For visual interpolation, a project's effect at quarter q is
`fullEffect * max(0,q-lag)/8`; a fixed synergy activates only after both projects'
delays have elapsed (`q > lag` for both). Clipping and score rules are unchanged.
`completedMeasureIds` marks construction complete at `q >= lag`; benefits begin
in the following quarter. No frame is created for a partial/invalid plan.
The frontend must use this function, not independently interpolate scores.

## Optimization (`shared/optimizer.js`)

Named export `suggestPlan(currentSelections, {lockedMeasureIds=[]}={})` returning `{available,reason,selections,result,method,examined,improvement}`. Input must be a valid five-project plan. Enumerate every single-slot replacement by an eligible measure/district, including relocation of an unlocked district measure. Preserve every locked measure AND its district. Optimize official score; deterministic ties prefer lower cost then canonical measure/district IDs. `method` is `exhaustive-one-change`; this is not a global optimum. Count examined candidates before validity filtering. When improvement exists, available=true, reason=null, selections is a cloned valid plan, result is simulatePlan output and improvement is result.score-current.score. Otherwise available=false, reason explains why, selections/result=null and improvement=0. Invalid plan/unknown locks return available=false with an explanatory reason. Never apply automatically. Global exhaustive optimization is stretch scope only.

## HTTP owned by codex-A

- GET /api/health -> {ok,aiConfigured,model,datasetVersion}
- GET /api/dataset -> {dataset:DATASET,examplePlan:EXAMPLE_PLAN,baseline:BASELINE}
- GET /api/geography -> {districts:GeoJSONFeatureCollection,roads:GeoJSONFeatureCollection,water:GeoJSONFeatureCollection,origin:[longitude,latitude],credit:string}. Coordinates WGS84 longitude/latitude. Each district has properties {id,name,modeled}; IDs include the five scoring districts plus sarayshyk with modeled=false. Geometry can be Polygon/MultiPolygon, roads LineString/MultiLineString. Suggested local projection: east=(lon-originLon)*111.32*cos(originLat*pi/180), north=(lat-originLat)*111.32, in kilometers; Three.js x=east,z=-north. Geographic data are a real backdrop; service/building positions are illustrative. Asset preparation is codex-A's task.
- Geography also includes `landmarks` and `parks` FeatureCollections, `attributionUrl` and `detailsNotice`. Landmark Point properties: `{id,name,model,footprint:GeoJSONPolygon,scored:false,sourceUrl,attribution,licenseUrl?}`. Models are `bayterek`, `khan-shatyr`, `ak-orda`, `peace-palace`. Parks are Polygon/MultiPolygon with `{id,name,scored:false,sourceUrl,attribution,licenseUrl}`. IDs: `botanical-garden`, `central-park`, `presidential-park`. Preserve geography and avoid procedural building placement inside park/landmark footprints; tree placement and 3D vertical forms are decorative. Display the combined `credit` plus a clickable `attributionUrl`. Source attribution applies independently to each layer. Data are offline; no runtime map service is needed.
- POST /api/simulate body {selections} -> simulation output; invalid plans HTTP422
- POST /api/suggest body {selections,lockedMeasureIds?:string[]} -> suggestPlan output; invalid current plan/locks HTTP422; valid plan with no improvement HTTP200
- POST /api/advice body {selections,question?,lockedMeasureIds?:string[],language?:'en'|'ru'} -> {mode:'live'|'offline',text,trace:[{tool,input,summary}],suggestion?:suggestPlanOutput,model?:string}; invalid plan HTTP422
- POST /api/speech body `{text:string}` -> HTTP200 `audio/mpeg` MP3, `X-Audio-Source: AI-generated voice`. Text must contain 1–4000 characters. Send exactly the visible briefing; play only after a user button press and keep that text available as subtitles. Clearly display **AI-generated voice**. Server uses `gpt-4o-mini-tts`, voice `cedar`, 25-second upstream timeout, one active request and a small five-minute memory cache. On HTTP503 (no key/upstream unavailable), HTTP429 or network failure, offer browser speech or text-only viewing; do not block simulation. Errors use `{error:string}`. The key stays server-side and returned upstream errors are sanitized. Stop/revoke old audio when the briefing or plan changes.
- Server recalculates all evidence; never trusts user-supplied scores. Key only on server. Same-origin local app, request-size limits, no secrets in responses/logs.
- Adviser output is an English AI-curated verified briefing: the model selects approved fact IDs, and the server renders those statements plus the exact recommendation. `generation:'ai-selected-verified-facts'` is returned for live output. The adviser API `language` input is reserved for future localization; this version renders English. Show `mode` clearly. R11 adds Kazakh/Russian/English UI switching, while clearly retaining the adviser and narration in English; never translate or alter its verified numeric evidence opportunistically.
- General HTTP failures use {error:string}; frontend must handle timeout/network failure and JSON errors. Invalid simulation HTTP422 retains the normal simulation shape. Escape AI text. Discard stale responses after edits.
- UI can use the shared deterministic functions immediately when available; HTTP advice/suggest remain server-side. Building points use `indicatorDeltas`/`contributions`, never a second scoring economy. JSON scenario export is frontend-owned and includes selections, datasetVersion, computed result and provenance labels.

## Final-hour scene and placement contract

Claude owns city.js/city-details.js, B owns app.js/index.html/styles.css, A owns city-project-effects.js and geography. Renderer adds districtAtClientPoint(clientX,clientY), getPlacementAnchors() -> {districts:{[id]:{x,y,visible}},city:{x,y,visible}} (canvas-relative pixels), and setInteractionLocked(boolean). Disable orbit during card drag and restore on every completion/cancel path. Sarayshyk is decorative only and rejects scored district drops. Official cap remains two projects per category, not district.

A exports createProjectEffects({THREE,roads,districts,architecture,landAt,isReserved,getProjectSite,groundY=.18}) -> {group,update,tick,dispose}. Instantiate after architecture and parcel allocation, add group to scene, call update(props) after upgrade update, tick({timeSeconds:motionTime,motionEnabled:moving}) using shared paused/reduced-motion clock. Roads/points use shared [east,north] projection; architecture has point,district,width,depth,height. getProjectSite takes districtId,measureId. No effect adds simulation values. Effects appear only for completed projects in replay, with draft previews distinct. Before view clears effects. Dispose all owned geometry/materials.

Nazarbayev University model ID is nazarbayev-university, point [71.3984719,51.0903582], footprint from official city building layer OBJECTID 47194. Reserve both source footprint and actual mesh extent.
