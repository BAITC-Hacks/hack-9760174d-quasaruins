# Akim Lab component contract

Native Node 22+ ESM server; native browser ES modules. No server runtime dependencies. Three.js is pinned and vendored locally by codex-A.
Shared modules must not use Node APIs so the same functions run in browser and server.

## Ownership

- codex-A: `shared/**`, `server/**`, `data/**`, `scripts/**`, `public/vendor/**`, `tests/engine.test.mjs`, `tests/server.test.mjs`, configuration/manifests, README, this contract and integration.
- codex-b: `public/**` except `public/vendor/**`, and `docs/FRONTEND.md`. Complete light 3D frontend. Read the shared STYLE-GUIDE.md before starting.
- claude: `test/acceptance/**`, `tests/acceptance.test.mjs`, `docs/ACCEPTANCE.md`, `docs/REVIEW.md`. Request corrections to owned source; do not edit others' files without assignment.

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

All IDs and canonical field names as above. Additional fields allowed. Extract full original dataset from the supplied Track 12 district PDF. No invented values. Human-facing labels English.

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
- Adviser output is an English AI-curated verified briefing: the model selects approved fact IDs, and the server renders those statements plus the exact recommendation. `generation:'ai-selected-verified-facts'` is returned for live output. `language` input is reserved for future localization; this version renders English. Show `mode` clearly. Do not add a language switch yet.
- General HTTP failures use {error:string}; frontend must handle timeout/network failure and JSON errors. Invalid simulation HTTP422 retains the normal simulation shape. Escape AI text. Discard stale responses after edits.
- UI can use the shared deterministic functions immediately when available; HTTP advice/suggest remain server-side. Building points use `indicatorDeltas`/`contributions`, never a second scoring economy. JSON scenario export is frontend-owned and includes selections, datasetVersion, computed result and provenance labels.
