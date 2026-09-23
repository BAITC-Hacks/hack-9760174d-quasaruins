# Model, AI and implementation

[Back to the project overview](../README.md)

## Rules and exact model

Every run uses the organizer’s same five synthetic districts, ten indicators, fourteen measures and 100-unit budget. Choose **exactly five unique projects**, at most two per category. District projects require a target; city projects affect all five modeled districts. All specified incompatibilities are enforced. Invalid plans have no score. The detailed rules permit 3–5 represented categories, rather than requiring one project per category.

1. Scale each effect by `(8 - lag) / 8` for the eight-quarter horizon.
2. Add the fixed synergy bonuses without lag scaling.
3. Clip each indicator to 0–100, then compute the supplied weighted district scores.
4. Apply the official formula:

```text
Score = 0.7 × population-weighted district average
      + 0.3 × weakest district score
      − number of district/indicator pairs strictly below 40
```

Unspent budget earns no bonus. Negative effects are retained. Full precision is kept internally. Baseline **52.55768**; the published example costs **95**, scores **56.54307**, and leaves **zero critical indicators**:

| Project | Target |
| --- | --- |
| M7 School and kindergarten | Nura |
| M8 Family health clinic | Nura |
| M10 Lighting and cameras | Nura |
| M12 Digital resident requests | City-wide |
| M5 Clean household fuel | Saryarka |

## Recommendations and AI

The deterministic optimizer checks every single-slot replacement, including district changes. Locked projects retain both their ID and target. Every candidate is fully validated and rescored, including synergies and critical penalties. Ties use cost and canonical IDs. This is exhaustive **one-change search**, not a claim of global optimality. Recommendations never apply automatically.

The live adviser uses the OpenAI Responses API. It calls `get_scenario_evidence`, receives the current result, verified alternative and fact catalog, then selects relevant strength/risk fact IDs using strict structured output. The server validates the IDs and renders those exact statements plus the precise recommendation. Adverse effects, remaining critical indicators and the weakest district are always disclosed. The model prioritizes evidence; it cannot invent a displayed score, effect, project or target. The trace explains these steps. Briefings are English in this version; questions select relevant facts rather than start a general-purpose chat.

Calls have a 25-second limit, a concurrency bound and a small memory cache. Provider errors and credentials never reach the browser. The offline explanation is explicitly labeled.

## Architecture

- `shared/city-data.js`: immutable source dataset and example plan.
- `shared/simulation.js`: pure validation, evaluation, score ledger and shared illustrative replay.
- `shared/optimizer.js`: deterministic single-change search with locks.
- `server/`: native Node HTTP server, grounded AI adviser and optional speech generation.
- `data/astana.json`: offline official district, road and water geometry.
- `data/city-details.json`: fifteen attributed landmark positions, fourteen footprints, three real park boundaries and the mapped LRT route with eighteen stations.
- `public/city-project-effects.js`: completion-gated road, rail, tree and building treatments; [visual semantics](PROJECT-EFFECTS.md).
- `public/assets/projects/`: fourteen distinct AI-generated project illustrations; [art direction and exact prompts](PROJECT-ART.md).
- `public/`: browser frontend and procedural city; vendored Three.js.
- `test/acceptance/`: independent Python oracle and expected fixtures.
- `tests/`: engine, HTTP, AI boundary and independent acceptance checks.

See [the interface contract](CONTRACT.md), [acceptance criteria](ACCEPTANCE.md) and [map provenance](../data/README.md). Endpoints: `/api/health`, `/api/dataset`, `/api/geography`, `/api/simulate`, `/api/suggest`, `/api/advice`, `/api/speech`. Caller-supplied scores are ignored and recomputed. The optional speech endpoint returns AI-generated MP3 narration of the supplied briefing, using `gpt-4o-mini-tts`/`cedar`; no key or unavailable service returns a recoverable error. Playback controls and disclosure are frontend responsibilities.

`timelinePlan` supplies the construction replay for quarters 0–8. Intermediate values are illustrative (`effect * max(0,quarter-lag)/8`, then active fixed synergies, clipping and the usual score). Only the quarter-eight result is official, and it exactly equals `simulatePlan`. The replay introduces no extra benefits or scoring rules. Reduced motion skips the animation and preserves the result.

## Verify

```sh
node --test
python3 test/acceptance/oracle.py
```

Tests compare dataset fields, baseline and reference plans against an independent Python transcription. They cover invalid inputs, negative effects, fixed synergies, order independence, locks, preview consistency and HTTP boundaries. Provider behavior is mocked in tests; live AI is checked separately. A final passing suite must have **zero skipped tests**.

## Geography and limits

The official Astana public geoportal provides the district, road and water backdrop. Road and water geometry is simplified for display. The geography API also supplies fifteen landmark positions (including EXPO's Nur Alem and Nazarbayev University), fourteen footprints, three real park boundaries and the mapped LRT route with eighteen stations, with municipal and OpenStreetMap sources attributed separately. Existing LRT is a decorative backdrop independent of intervention M3. Current Astana has six districts; the challenge supplies five synthetic scoring rows. **Sarayshyk is outside this scenario**, without invented metrics or redistributed population shares. Ordinary buildings, project sites and landmark vertical forms are illustrative. Cars, pedestrians and emoji reactions do not represent real behavior predictions.

The renderer expands horizontal map spacing by a factor of two while keeping procedural model sizes readable. All geographic layers use the same projection; source coordinates and district topology are unchanged. This is a cartographic presentation, not a uniformly scaled architectural survey. Existing service locations and empty intervention parcels are illustrative.

Costs are virtual units. This is not financial ROI, a real traffic model, measured happiness or a validated policy forecast. No individual resident data is used. All geographic source links and processing details are in [data/README.md](../data/README.md).
