// Independent acceptance tests for Akim Lab (HackAlem Track 12).
// Expected values come from test/acceptance/oracle.py, a separate Python implementation of the
// organizer's dataset rules (see docs/ACCEPTANCE.md). Modules and server that are not built yet
// are skipped with a reason, never silently passed. Run: node --test
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.AKIM_ENGINE_ROOT ? path.resolve(process.env.AKIM_ENGINE_ROOT) : REPO;
const FIX = JSON.parse(readFileSync(path.join(REPO, 'test/acceptance/cases.json'), 'utf8'));
const ORACLE = JSON.parse(readFileSync(path.join(REPO, 'test/acceptance/dataset.json'), 'utf8'));
const TOL = FIX.tolerance;

const load = async rel => (existsSync(path.join(ROOT, rel)) ? import(pathToFileURL(path.join(ROOT, rel)).href) : null);
const data = await load('shared/city-data.js');
const sim = await load('shared/simulation.js');
const opt = await load('shared/optimizer.js');
const SKIP_DATA = data ? false : 'shared/city-data.js not available yet';
const SKIP_SIM = sim ? false : 'shared/simulation.js not available yet';
const SKIP_OPT = opt && sim && data ? false : 'shared/optimizer.js not available yet';
const SKIP_HTTP = existsSync(path.join(ROOT, 'server/main.mjs')) ? false : 'server/main.mjs not available yet';

const sel = plan => plan.map(p => ({ measureId: p.measure, districtId: p.district }));
const EXAMPLE = FIX.cases.find(c => c.id === 'published_example');
const close = (got, want, label, tol = TOL) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${label}: expected ${want}, got ${got}`);
const codesOf = r => new Set((r?.errors ?? []).map(e => e.code));
const key = s => `${s.measureId}@${s.districtId ?? 'city'}`;
const planKey = s => s.map(key).sort().join(',');
const deepFreeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
};
const RESULT_NUMBERS = ['score', 'delta', 'average', 'minimum', 'criticalCount'];
const RESULT_ARRAYS = ['districts', 'criticalIndicators', 'synergies', 'contributions'];

describe('dataset matches the organizer PDF (field by field)', { skip: SKIP_DATA }, () => {
  test('budget, horizon and indicator weights', () => {
    const { DATASET } = data;
    assert.equal(DATASET.budget, ORACLE.budget);
    assert.equal(DATASET.horizon, ORACLE.horizon);
    assert.deepEqual(new Set(DATASET.indicators.map(i => i.id)), new Set(Object.keys(ORACLE.weights)));
    for (const ind of DATASET.indicators) close(ind.weight, ORACLE.weights[ind.id], `weight ${ind.id}`, 1e-12);
    close(DATASET.indicators.reduce((s, i) => s + i.weight, 0), 1, 'weights sum', 1e-9);
  });
  test('five districts: population shares and starting indicators', () => {
    const { DATASET } = data;
    assert.deepEqual(new Set(DATASET.districts.map(d => d.id)), new Set(Object.keys(ORACLE.districts)));
    for (const d of DATASET.districts) {
      close(d.populationShare, ORACLE.districts[d.id].populationShare, `population ${d.id}`, 1e-12);
      assert.deepEqual({ ...d.indicators }, ORACLE.districts[d.id].indicators, `indicators ${d.id}`);
    }
  });
  test('fourteen measures: category, scope, cost, delay, effects', () => {
    const { DATASET } = data;
    assert.deepEqual(new Set(DATASET.measures.map(m => m.id)), new Set(Object.keys(ORACLE.measures)));
    for (const m of DATASET.measures) {
      const o = ORACLE.measures[m.id];
      assert.deepEqual([m.category, m.scope, m.cost, m.lag], [o.category, o.scope, o.cost, o.lag], m.id);
      assert.deepEqual({ ...m.effects }, o.effects, `effects ${m.id}`);
    }
  });
  test('synergies and incompatibilities', () => {
    const { DATASET } = data;
    const syn = s => `${[...s.measures].sort().join('+')}>${s.targetMeasure}:${JSON.stringify(s.effects)}`;
    assert.deepEqual(new Set(DATASET.synergies.map(syn)), new Set(ORACLE.synergies.map(syn)));
    const inc = s => `${[...s.measures].sort().join('+')}:${s.scope}`;
    assert.deepEqual(new Set(DATASET.incompatibilities.map(inc)), new Set(ORACLE.incompatibilities.map(inc)));
  });
  test('EXAMPLE_PLAN is the published example', () => {
    assert.equal(planKey(data.EXAMPLE_PLAN), planKey(sel(EXAMPLE.plan)));
  });
});

describe('baseline (no decisions)', { skip: SKIP_SIM }, () => {
  test('anchors: 52.55768, average 56.8624, weakest 49.18, two critical values', () => {
    const b = sim.BASELINE;
    close(b.score, FIX.baseline.score, 'score');
    close(b.average, FIX.baseline.cityAverage, 'average');
    close(b.minimum, FIX.baseline.weakestDistrictScore, 'minimum');
    assert.equal(b.criticalCount, 2);
    for (const [id, v] of Object.entries(FIX.baseline.districtScores)) close(b.districts.find(d => d.id === id)?.score, v, `district ${id}`);
  });
  test('critical means strictly below 40: Nura S1 38 and S2 35, not Saryarka E2 = 40', () => {
    const got = new Set(sim.BASELINE.criticalIndicators.map(c => `${c.districtId}:${c.indicatorId}`));
    assert.deepEqual(got, new Set(['nura:S1', 'nura:S2']));
  });
});

describe('valid plans match the independent oracle', { skip: SKIP_SIM }, () => {
  for (const c of FIX.cases.filter(x => x.expect.valid)) {
    test(c.id, () => {
      const e = c.expect, r = sim.simulatePlan(sel(c.plan));
      assert.equal(r.valid, true, JSON.stringify(r.errors));
      assert.equal(r.errors.length, 0);
      assert.equal(r.cost, e.cost);
      if ('remaining' in r) assert.equal(r.remaining, 100 - e.cost);
      close(r.score, e.score, 'score');
      close(r.average, e.cityAverage, 'average');
      close(r.minimum, e.weakestDistrictScore, 'minimum');
      assert.equal(r.criticalCount, e.criticalCount);
      close(r.delta, e.score - FIX.baseline.score, 'delta', 2 * TOL);
      for (const [id, want] of Object.entries(e.districtScores)) {
        const d = r.districts.find(x => x.id === id);
        assert.ok(d, `district ${id} missing`);
        close(d.score, want, `${id} score`);
        for (const [k, v] of Object.entries(e.indicators[id])) {
          close(d.indicators[k], v, `${id} ${k}`);
          if (d.indicatorDeltas) close(d.indicatorDeltas[k], v - FIX.baseline.indicators[id][k], `${id} ${k} delta`);
        }
      }
      assert.deepEqual(new Set(r.criticalIndicators.map(x => `${x.districtId}:${x.indicatorId}`)),
        new Set(e.critical.map(x => `${x.district}:${x.indicator}`)), 'critical indicators');
      assert.deepEqual(new Set(r.synergies.map(s => `${[...s.measures].sort().join('+')}@${s.districtId}`)),
        new Set(e.synergies.map(s => `${[...s.pair].sort().join('+')}@${s.district}`)), 'synergies');
    });
  }
});

describe('rules: invalid plans are rejected with a reason and no score', { skip: SKIP_SIM }, () => {
  for (const c of FIX.cases.filter(x => !x.expect.valid)) {
    test(`${c.id} -> ${c.expect.reasons.join(', ')}`, () => {
      for (const r of [sim.simulatePlan(sel(c.plan)), sim.validatePlan(sel(c.plan))]) {
        assert.equal(r.valid, false);
        for (const code of c.expect.reasons) assert.ok(codesOf(r).has(code), `missing ${code}: ${JSON.stringify(r.errors)}`);
        assert.ok(r.errors.every(e => typeof e.message === 'string' && e.message.length > 0), 'every error needs a readable message');
      }
      const r = sim.simulatePlan(sel(c.plan));
      for (const k of RESULT_NUMBERS) assert.equal(r[k], null, `${k} must be null`);
      for (const k of RESULT_ARRAYS) assert.ok(Array.isArray(r[k]) && r[k].length === 0, `${k} must be empty`);
    });
  }
});

describe('scoring details', { skip: SKIP_SIM }, () => {
  const run = id => sim.simulatePlan(sel(FIX.cases.find(c => c.id === id).plan));
  test('negative effect: M11 lowers Almaty road flow 40 -> 38.25 and adds one critical value', () => {
    const r = run('new_critical_from_M11');
    const almaty = r.districts.find(d => d.id === 'almaty');
    close(almaty.indicators.T1, 38.25, 'Almaty T1');
    assert.ok(r.criticalIndicators.some(c => c.districtId === 'almaty' && c.indicatorId === 'T1'));
  });
  test('synergy is a fixed +2, not scaled by delay (M5 + M6: Saryarka air 40 -> 52.25)', () => {
    close(run('synergy_M5_M6').districts.find(d => d.id === 'saryarka').indicators.E2, 52.25, 'Saryarka E2');
  });
  test('city-wide measure reaches all five districts (M12: C2 +5 x 7/8)', () => {
    const r = sim.simulatePlan(sel(EXAMPLE.plan));
    for (const d of r.districts) close(d.indicators.C2 - FIX.baseline.indicators[d.id].C2, 4.375, `${d.id} C2`);
  });
  test('order of selections does not change the result', () => {
    for (const c of FIX.cases.filter(x => x.expect.valid)) {
      const s = sel(c.plan), a = sim.simulatePlan(s);
      for (const variant of [[...s].reverse(), [...s.slice(2), ...s.slice(0, 2)]]) {
        const b = sim.simulatePlan(variant);
        close(b.score, a.score, `${c.id} reordered`, 1e-9);
        for (const d of a.districts) close(b.districts.find(x => x.id === d.id).score, d.score, `${c.id} ${d.id}`, 1e-9);
      }
    }
  });
  test('deterministic, and never mutates the input or DATASET', { skip: SKIP_DATA }, () => {
    const before = JSON.stringify(data.DATASET);
    const input = deepFreeze(sel(EXAMPLE.plan));
    const a = sim.simulatePlan(input), b = sim.simulatePlan(input);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(data.DATASET), before);
  });
  test('partial plans can be checked while building but are never scored', () => {
    const three = sel(EXAMPLE.plan).slice(0, 3);
    assert.equal(sim.validatePlan(three, { allowPartial: true }).valid, true);
    assert.ok(codesOf(sim.validatePlan(three)).has('COUNT'));
    const r = sim.simulatePlan(three);
    assert.equal(r.valid, false);
    assert.equal(r.score, null);
    const partial = (p, code) => assert.ok(codesOf(sim.validatePlan(sel(p), { allowPartial: true })).has(code), code);
    partial([{ measure: 'M3', district: 'nura' }, { measure: 'M13', district: 'almaty' }, { measure: 'M5', district: 'saryarka' }, { measure: 'M7', district: 'esil' }], 'BUDGET');
    partial([{ measure: 'M7', district: 'nura' }, { measure: 'M8', district: 'nura' }, { measure: 'M9', district: 'esil' }], 'DIRECTION_LIMIT');
    partial([{ measure: 'M1', district: 'esil' }, { measure: 'M3', district: 'nura' }], 'INCOMPATIBLE');
    partial(FIX.cases.find(c => c.id === 'six_measures').plan, 'COUNT');
  });
  test('malformed input is rejected without throwing', () => {
    const base = sel(EXAMPLE.plan);
    const bad = [null, undefined, 'M7', 42, {}, [null], [{}],
      [{ measureId: 7, districtId: 'nura' }, ...base.slice(1)],
      [{ measureId: 'M7', districtId: 5 }, ...base.slice(1)],
      [...base.slice(0, 3), { measureId: 'M12', districtId: 'city' }, base[4]]];
    for (const input of bad) {
      let r;
      assert.doesNotThrow(() => { r = sim.simulatePlan(input); }, `threw on ${JSON.stringify(input)}`);
      assert.equal(r.valid, false, `accepted ${JSON.stringify(input)}`);
      assert.equal(r.score, null);
      assert.ok(r.errors.length > 0);
    }
  });
});

describe('optimizer: best single change, locks respected, never applied automatically', { skip: SKIP_OPT }, () => {
  const scoreOf = s => sim.simulatePlan(s).score;
  function bestOneChange(current, locked = []) {
    const { DATASET } = data;
    let best = null;
    current.forEach((slot, i) => {
      if (locked.includes(slot.measureId)) return;
      for (const m of DATASET.measures) {
        for (const districtId of m.scope === 'city' ? [null] : DATASET.districts.map(d => d.id)) {
          const cand = current.map((s, j) => (j === i ? { measureId: m.id, districtId } : s));
          if (planKey(cand) === planKey(current)) continue;
          const r = sim.simulatePlan(cand);
          if (r.valid && (!best || r.score > best.score + 1e-12)) best = { score: r.score, sel: cand };
        }
      }
    });
    return best;
  }
  const differsInOneSlot = (a, b) => {
    const A = new Set(a.map(key)), B = new Set(b.map(key));
    return [...A].filter(x => !B.has(x)).length === 1 && a.length === b.length;
  };
  test('published example: finds the best single change and reports it honestly', () => {
    const current = sel(EXAMPLE.plan), s = opt.suggestPlan(current), best = bestOneChange(current);
    assert.equal(s.method, 'exhaustive-one-change');
    assert.ok(Number.isInteger(s.examined) && s.examined > 0, 'examined count');
    if (best && best.score > scoreOf(current) + 1e-12) {
      assert.equal(s.available, true, s.reason);
      assert.equal(s.reason, null);
      close(s.result.score, best.score, 'suggested score', 1e-9);
      close(scoreOf(s.selections), s.result.score, 'result matches simulatePlan', 1e-9);
      close(s.improvement, s.result.score - scoreOf(current), 'improvement', 1e-9);
      assert.ok(differsInOneSlot(current, s.selections), 'exactly one slot changed');
    } else {
      assert.equal(s.available, false);
      assert.equal(s.improvement, 0);
    }
  });
  test('a locked measure keeps both its measure and its district', () => {
    const current = sel(EXAMPLE.plan);
    for (const lock of ['M10', 'M5']) {
      const s = opt.suggestPlan(current, { lockedMeasureIds: [lock] });
      const want = current.find(x => x.measureId === lock);
      if (s.available) assert.ok(s.selections.some(x => x.measureId === lock && x.districtId === want.districtId), `${lock} moved`);
      const best = bestOneChange(current, [lock]);
      if (best && best.score > scoreOf(current) + 1e-12) close(s.result.score, best.score, `best with ${lock} locked`, 1e-9);
    }
  });
  test('all five locked, invalid current plan, or unknown lock: no suggestion, with a reason', () => {
    const current = sel(EXAMPLE.plan);
    const cases = [
      opt.suggestPlan(current, { lockedMeasureIds: current.map(x => x.measureId) }),
      opt.suggestPlan(sel(FIX.cases.find(c => c.id === 'four_measures').plan)),
      opt.suggestPlan(current, { lockedMeasureIds: ['M99'] }),
    ];
    for (const s of cases) {
      assert.equal(s.available, false);
      assert.ok(typeof s.reason === 'string' && s.reason.length > 0);
      assert.equal(s.selections, null);
      assert.equal(s.result, null);
      assert.equal(s.improvement, 0);
    }
  });
  test('deterministic and does not modify the current plan', () => {
    const input = deepFreeze(sel(EXAMPLE.plan));
    assert.deepEqual(opt.suggestPlan(input), opt.suggestPlan(input));
  });
});

describe('HTTP API (offline, no API key)', { skip: SKIP_HTTP }, () => {
  const port = 3900 + Math.floor(Math.random() * 90);
  const url = p => `http://127.0.0.1:${port}${p}`;
  let child, logs = '';
  const post = (p, body, raw = false) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body) });
  before(async () => {
    child = spawn(process.execPath, ['server/main.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '' } });
    child.stdout.on('data', d => { logs += d; });
    child.stderr.on('data', d => { logs += d; });
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(url('/api/health'))).ok) return; } catch { /* starting */ }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`server did not start: ${logs}`);
  });
  after(() => child?.kill());
  test('health and dataset', async () => {
    const h = await (await fetch(url('/api/health'))).json();
    assert.equal(h.ok, true);
    assert.equal(h.aiConfigured, false);
    const d = await (await fetch(url('/api/dataset'))).json();
    close(d.baseline.score, FIX.baseline.score, 'baseline via HTTP');
    assert.equal(planKey(d.examplePlan), planKey(sel(EXAMPLE.plan)));
  });
  test('simulate: valid 200 with the official score; client-supplied scores are ignored', async () => {
    const res = await post('/api/simulate', { selections: sel(EXAMPLE.plan), score: 99, result: { score: 99 } });
    assert.equal(res.status, 200);
    close((await res.json()).score, EXAMPLE.expect.score, 'score via HTTP');
  });
  test('simulate: invalid plan 422 with reason and no score', async () => {
    const res = await post('/api/simulate', { selections: sel(FIX.cases.find(c => c.id === 'over_budget').plan) });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.score, null);
    assert.ok(codesOf(body).has('BUDGET'));
  });
  test('broken JSON and oversized bodies fail cleanly; server keeps running', async () => {
    const broken = await post('/api/simulate', '{"selections": [', true);
    assert.ok(broken.status >= 400 && broken.status < 500);
    assert.equal(typeof (await broken.json()).error, 'string');
    const big = await post('/api/simulate', JSON.stringify({ selections: [], pad: 'x'.repeat(2_000_000) }), true).catch(() => null);
    assert.ok(!big || big.status >= 400, 'oversized body accepted');
    assert.equal((await fetch(url('/api/health'))).status, 200);
  });
  test('no secrets or source-control files are served', async () => {
    for (const p of ['/.env', '/.env.hackalem', '/.env.example', '/../.env', '/%2e%2e/.env', '/%2e%2e%2f.env', '/.git/config', '/server/main.mjs', '/package.json']) {
      const res = await fetch(url(p));
      const text = await res.text();
      assert.ok(!/OPENAI_API_KEY\s*=|sk-[A-Za-z0-9]/.test(text), `${p} leaked a key`);
      if (p.includes('.env') || p.includes('.git')) assert.notEqual(res.status, 200, `${p} served`);
    }
  });
  test('advice without a key: offline, labelled, and only uses computed numbers', async () => {
    const res = await post('/api/advice', { selections: sel(EXAMPLE.plan) });
    assert.equal(res.status, 200);
    const a = await res.json();
    assert.equal(a.mode, 'offline');
    assert.ok(typeof a.text === 'string' && a.text.length > 40);
    const evidence = JSON.stringify(sim ? sim.simulatePlan(sel(EXAMPLE.plan)) : {}) + JSON.stringify(a.trace ?? []) + JSON.stringify(a.suggestion ?? {});
    const allowed = new Set();
    for (const n of evidence.match(/-?\d+(?:\.\d+)?/g) ?? []) {
      const v = Number(n);
      for (const x of [v, Math.abs(v), v * 100, Math.abs(v) * 100]) for (const dp of [0, 1, 2]) allowed.add(x.toFixed(dp));
    }
    for (let i = 0; i <= 100; i++) allowed.add(String(i));
    const unexplained = (a.text.match(/(?<![A-Za-z\d.])\d+(?:\.\d+)?/g) ?? []).filter(n => !allowed.has(n) && !allowed.has(Number(n).toFixed(2)));
    assert.deepEqual(unexplained, [], 'numbers in advice text that the engine did not produce');
  });
  test('suggest: 200 for a valid plan, 422 for an invalid one', async () => {
    assert.equal((await post('/api/suggest', { selections: sel(EXAMPLE.plan) })).status, 200);
    assert.equal((await post('/api/suggest', { selections: sel(FIX.cases.find(c => c.id === 'four_measures').plan) })).status, 422);
  });
});
