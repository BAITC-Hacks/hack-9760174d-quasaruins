# Review log: Akim Lab (Track 12)

Owner: claude (independent tests and review). Each entry names the exact commit reviewed, what was run and what was found. Findings are requests to the file owner; the reviewer does not edit other owners' files.

## Checklist per integrated commit

P0, correctness and safety (automated in `tests/acceptance.test.mjs`):
- Dataset equals the organizer PDF field by field; published anchors 52.55768 and 56.54307.
- All oracle cases match; invalid plans have a reason and no score; partial plans are never scored.
- Server re-validates everything; client-supplied scores are ignored; 422 for invalid plans.
- AI text uses only engine numbers; no key, API error, timeout or malformed reply falls back to a labelled offline explanation; suggestions are engine-validated and never auto-applied.
- API key never reaches the browser, responses, logs or Git; no `.env` or `.git` files served; secret scan of full history before submission.

P1, the app as a user sees it (headless browser, reviewer port 3002):
- Fresh load: budget 100, labelled baseline 52.56, five districts with published values.
- Build the published example: 56.54; change one project: the score changes; invalid plan: reason, no score.
- Same number, same rounding, everywhere (selector, city view, result, comparison, export).
- Optimizer suggestion: previewed with its real score, applied only on click, locks respected.
- Timeline or animation, if shown: labelled illustrative; final state equals the official score.
- No console errors; usable at phone width and by keyboard; reduced motion respected.

P2, submission readiness:
- Fresh clone: `node server/main.mjs` starts with no install and no key; `node --test` passes.
- README claims only what exists; AI tool use documented; synthetic data and schematic/backdrop geography labelled.
- Five-minute demo runs twice without errors.

Visual consistency (after functional checks): same color meaning, legends and labels across views, per STYLE-GUIDE.md.

## Entries

### 2026-09-23, branch agents/claude-review (I03 first checkpoint)

- Baseline merged: bfa1e7f (contract). Oracle commit 3fd240a preserved.
- `tests/acceptance.test.mjs` written against docs/CONTRACT.md. shared/city-data.js, shared/simulation.js, shared/optimizer.js and server/main.mjs are not in the baseline yet, so every suite currently reports SKIP with the missing file named. Not yet run against the real engine.
- Harness validated against a throwaway contract-shaped engine kept outside the repository: 47 of 47 tests pass; a mutant that scales synergies by delay fails 11 tests, so the checks are sensitive. HTTP suite not yet exercised (no server to run against).

### 2026-09-23 10:35 UTC, main 4ad4a07 (integrated backend, AI and playable frontend)

- `node --test`: 71/71 pass, 0 skipped, both in the reviewer worktree and in a clean `git archive` export with no install.
- End to end in headless Chromium (software WebGL), port 3002, AI offline: baseline 52.56 labelled as reference; published example 56.54 (+3.99, unrounded-difference note shown); offline explanation labelled; one-change suggestion 57.21 (+0.66: clean fuel in Saryarka replaced by light rail in Nura), applied only on click, result 57.21. No console errors, no failed requests, no horizontal scroll at 390 px, 3D scene renders, Sarayshyk labelled outside the scenario.
- Server review: binds to 127.0.0.1, checks Host and Origin, blocks dotfiles, traversal and symlink escape, requires JSON with a size limit, keeps the key server-side and honours an explicitly empty key. Live adviser selects from server-verified facts through a strict schema, 25 s timeout, no storage.
- Secret scan of every commit on every branch: no keys or partner credentials; only `.env.example` is tracked; no file over 2 MB.
- README walkthrough numbers reproduce (95 / 56.54 and 100 / 57.21).
- Finding (minor, server/adviser.mjs): offline text reads "1 synergy bonus apply"; should be "applies".
- Not yet reviewable: full-screen HUD redesign, quarter-by-quarter timeline helper and `/api/speech`. Tests for the timeline (quarter 0 = baseline, quarter 8 = official score for every plan) will be added when the helper lands.
