# Acceptance checks: Akim Lab (Track 12)

Sources: organizer brief "«Аким на 5 часов» – AI-симулятор управления городом" and the five-page dataset "Датасет районов". Expected numbers come from `test/acceptance/oracle.py`, an independent Python implementation of the dataset rules that the app does not use. It writes `test/acceptance/cases.json` (29 plans with expected results) and `test/acceptance/dataset.json` (the transcribed dataset).

## How to run

- `node --test` runs everything, including `tests/acceptance.test.mjs`. Suites whose modules are not built yet are reported as skipped with the missing file named, never as passed.
- `python3 test/acceptance/oracle.py --write` regenerates the expected values (about 10 seconds, no packages).
- `AKIM_ENGINE_ROOT=/path/to/checkout node --test tests/acceptance.test.mjs` runs the same tests against another checkout.

What `tests/acceptance.test.mjs` checks, against `docs/CONTRACT.md`:

- Dataset: every weight, population share, starting indicator, cost, delay, effect, synergy and incompatibility equals the independent transcription; `EXAMPLE_PLAN` is the published example.
- Baseline: 52.55768, average 56.8624, weakest 49.18, exactly Nura S1 and S2 critical.
- 16 valid plans: score, average, weakest, delta, cost, every district score and indicator, critical list and synergies match the oracle within 1e-4.
- 12 invalid plans: expected error code, readable message, null score fields and empty result arrays.
- Details: negative effect (M11), fixed +2 synergy, city-wide reach, order invariance, determinism, no mutation of input or DATASET, partial plans never scored, malformed input rejected without throwing.
- Optimizer: best single change equals an independent enumeration, one slot changed, locked measures keep their district, no suggestion for fully locked/invalid/unknown-lock inputs, deterministic.
- HTTP (offline, key blanked): health, dataset, 200/422 simulate, client scores ignored, broken and oversized JSON, no `.env`/`.git` files served, offline advice uses only engine numbers, suggest status codes.
## Organizer verification criteria

| # | Criterion | How we check | Expected |
| --- | --- | --- | --- |
| 1 | Everyone starts with the same budget and data | Fresh load, no decisions | Budget 100; baseline Score 52.55768 (shown 52.56); district scores Esil 62.99, Almaty 57.06, Saryarka 54.65, Baikonur 56.63, Nura 49.18; 2 critical values (Nura S1 38, S2 35) |
| 2 | Budget cannot be exceeded | Case `over_budget` (cost 129) | Rejected with a reason, no Score |
| 3 | Decisions change the model's indicators | Case `published_example` | Nura S1 48, S2 43.75, B1 67.5 (+2 synergy); Score 56.54307 |
| 4 | AI explains the result and main trade-offs | Manual, see AI guardrails | Plain-language strengths, risks, consequences; numbers only from the engine |
| 5 | Changing decisions changes the Score | `published_example` vs `exact_budget_100` | 56.54307 vs 57.20556 |

## Dataset rules (one case each)

| Rule | Case id | Expected |
| --- | --- | --- |
| Exactly 5 decisions | `four_measures`, `six_measures` | invalid, COUNT |
| Budget at most 100 (leftover allowed) | `over_budget`, `exact_budget_100` (cost 100) | invalid BUDGET / valid |
| No repeated measure | `duplicate_measure` | invalid, DUPLICATE |
| District required for district measures | `district_missing` | invalid, DISTRICT_REQUIRED |
| No district for city-wide measures (M2, M6, M12, M14) | `district_on_city_measure` | invalid, DISTRICT_NOT_ALLOWED |
| At most 2 measures per direction | `three_social` | invalid, DIRECTION_LIMIT |
| M1 and M3 never together | `M1_and_M3` | invalid, INCOMPATIBLE |
| M4 and M7 not in the same district | `M4_M7_same_district`, `M4_M7_different_districts_ok` | invalid / valid |
| M5 and M13 not in the same district | `M5_M13_same_district` | invalid, INCOMPATIBLE |
| Unknown ids rejected | `unknown_measure`, `unknown_district` | invalid |

Reason codes are the oracle's names; the app may use its own, but every invalid plan must return no Score and a human-readable reason.

## Scoring details the tests pin down

- Effect share (8 - lag) / 8: lag 1 = 87.5%, lag 4 = 50%.
- Synergies are a fixed +2 in the district of the first measure, not scaled by lag (`synergy_M1_M2_and_M10_M12`, `synergy_M5_M6`).
- Clip to 0..100 after effects and synergies.
- Critical means strictly below 40: Saryarka E2 = 40 at baseline is not critical. `new_critical_from_M11`: M11 in Almaty drops T1 to 38.25 and costs one point.
- Score = 0.7 x population-weighted average + 0.3 x weakest district - number of critical values.

## Search facts (optimizer checks)

- Valid plans: 694,395 (5 distinct measures, all district assignments, all rules).
- Best Score 57.23673: M2 city, M3 Nura, M8 Nura, M9 Nura, M14 city (cost 98). Median 53.82579, worst 52.04.
- The published example beats 99.918% of all valid plans.
- Every top plan concentrates on Nura, because 30% of the Score is the weakest district.

## AI guardrails

- Every number in the AI text appears in the engine output (rounding allowed).
- An AI-suggested plan is validated and scored by the engine before it is shown, and is never applied automatically.
- Without an API key, or when the API fails or returns malformed output, the app still works and labels the explanation as offline.
- The key is read on the server only and never appears in the browser, logs or Git.

## Demo checklist (under 5 minutes)

1. Fresh start: budget 100, baseline 52.56, Nura flagged as the weakest district with 2 critical values.
2. Try an invalid plan (over budget or M1 + M3): clear reason, no Score.
3. Build the published example: Score 56.54, synergy M10 + M12 visible, AI explanation of strengths, risks and trade-offs.
4. Ask the AI adviser for an improvement: engine-validated alternative with its real Score, applied only on click.
5. Show where the plan ranks among all 694,395 valid plans.

## Reproducibility

- One documented command starts the app; `node --test` passes with no package installation.
- `python3 test/acceptance/oracle.py` regenerates the expected numbers independently.
