# Akim Lab — one city, two futures

**HackAlem AI · Track 12: “Akim for 5 Hours”**

Choose five city projects with a budget of 100. Explore their effects across five modeled districts, compare futures and get an AI-curated briefing grounded in an inspectable simulation.

**Playable checkpoint:** light isometric Astana, project selection, rule validation, building upgrades, exact results, pinned Plan A comparison and a grounded AI adviser work end to end. Moving cars, pedestrians and reaction effects are the next visual increment.

## Run

Requires **Node.js 22+**. No npm install, database, build step, external map service or GPU is needed. Three.js 0.180.0 is vendored locally with its MIT license.

```sh
node server/main.mjs
```

Open **http://localhost:3000**. Alternatively, `./scripts/start.sh` finds Node on PATH or the bundled Codex runtime on this Mac. `npm start` is equivalent when npm is installed. Set `PORT=3001` if 3000 is occupied. The server binds only to the local machine.

For live AI, copy `.env.example` to `.env` and set `OPENAI_API_KEY`. Never place the key in browser code or Git. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. The ignored local `.env.hackalem` is also supported. Existing environment values take priority. To force offline operation:

```sh
OPENAI_API_KEY='' node server/main.mjs
```

All calculations, recommendations and map assets work offline. Missing credentials, provider failures and timeouts return a clearly labeled deterministic explanation. The health endpoint reports configuration status, never the key.

## Try the complete flow

1. Click **Try an example**, then **Simulate my city**: cost95, score56.54, zero critical indicators.
2. Pin it as **Plan A**, and check **Keep in advice** for the Nura school.
3. Click **Find one improvement**, inspect the verified swap, then **Apply verified change**: cost100, score57.21.
4. Switch between **Plan A** and **Your plan** to compare the same city view.
5. Click **Explain my plan** for a live or clearly labeled offline briefing; inspect its calculation evidence.

Select a district to focus the camera; **Fit city** shows the entire map. The planner remains usable if WebGL fails. Open `/?view=2d` to try the compatibility view. [Demo and submission checklist](docs/DEMO.md).

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
- `shared/simulation.js`: pure validation, evaluation and score ledger.
- `shared/optimizer.js`: deterministic single-change search with locks.
- `server/`: native Node HTTP server and grounded AI adviser.
- `data/astana.json`: offline official district, road and water geometry.
- `public/`: browser frontend and procedural city; vendored Three.js.
- `test/acceptance/`: independent Python oracle and expected fixtures.
- `tests/`: engine, HTTP, AI boundary and independent acceptance checks.

See [the interface contract](docs/CONTRACT.md), [acceptance criteria](docs/ACCEPTANCE.md) and [map provenance](data/README.md). Endpoints: `/api/health`, `/api/dataset`, `/api/geography`, `/api/simulate`, `/api/suggest`, `/api/advice`, `/api/speech`. Caller-supplied scores are ignored and recomputed. The optional speech endpoint returns AI-generated MP3 narration of the supplied briefing, using `gpt-4o-mini-tts`/`cedar`; no key or unavailable service returns a recoverable error. Playback controls and disclosure are frontend responsibilities.

`timelinePlan` supplies an optional construction replay for quarters 0–8. Intermediate values are illustrative (`effect * max(0,quarter-lag)/8`, then active fixed synergies, clipping and the usual score). Only the quarter-eight result is official, and it exactly equals `simulatePlan`. The replay introduces no extra benefits or scoring rules.

## Verify

```sh
node --test
python3 test/acceptance/oracle.py
```

Tests compare dataset fields, baseline and reference plans against an independent Python transcription. They cover invalid inputs, negative effects, fixed synergies, order independence, locks, preview consistency and HTTP boundaries. Provider behavior is mocked in tests; live AI is checked separately. A final passing suite must have **zero skipped tests**.

## Geography and limits

The official Astana public geoportal provides the district, road and water backdrop. Road and water geometry is simplified for display. The geography API also supplies four landmark footprints/positions and three real park boundaries, with municipal and OpenStreetMap sources attributed separately. Current Astana has six districts; the challenge supplies five synthetic scoring rows. **Sarayshyk is outside this scenario**, without invented metrics or redistributed population shares. Ordinary buildings, project sites and landmark vertical forms are illustrative. Cars, pedestrians and emoji reactions do not represent real behavior predictions.

Costs are virtual units. This is not financial ROI, a real traffic model, measured happiness or a validated policy forecast. No individual resident data is used. All geographic source links and processing details are in [data/README.md](data/README.md).

## Participant and tools

**Nartay Aikyn** is the sole human participant and project lead. Codex-A assists with planning, backend and integration; Codex-B with the frontend and 3D scene; Claude with independent tests and review. Runtime AI is used for the grounded adviser. Git authorship remains the participant’s; these tools are disclosed and are not additional human participants.
