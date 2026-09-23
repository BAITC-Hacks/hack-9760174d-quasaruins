const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const signed = (value, digits = 2) => `${value > 0 ? '+' : ''}${fmt(value, digits)}`;
// Differences use full model precision and are rounded exactly once for display.
const displayDelta = (after, before) => after - before;
const clone = (value) => JSON.parse(JSON.stringify(value));
const key = (plan) => plan.map((item) => `${item.measureId}:${item.districtId ?? '*'}`).sort().join('|');
const storageKey = 'akim-lab.plan.v1';
const state = { selections: [], history: [], locks: new Set(), applied: null, pinned: null, districtId: 'nura', category: 'all', view: 'after', paused: matchMedia('(prefers-reduced-motion: reduce)').matches, revision: 0, busy: null, request: null, suggestion: null };
let DATASET, EXAMPLE_PLAN, BASELINE, validatePlan, simulatePlan, city;
let measures = new Map(), districts = new Map(), categories = new Map();

function node(tag, className, content, attrs = {}) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (content !== undefined && content !== null) item.textContent = String(content);
  for (const [name, value] of Object.entries(attrs)) if (value !== undefined && value !== null) item.setAttribute(name, String(value));
  return item;
}
function button(content, className, action, attrs = {}) {
  const item = node('button', className, content, { type: 'button', ...attrs });
  item.addEventListener('click', action);
  return item;
}
function message(text = '', isError = false) {
  $('app-message').textContent = text;
  $('app-message').classList.toggle('error', isError);
}
function districtName(id) { return districts.get(id)?.name ?? 'City-wide'; }
function effectiveResult() {
  if (state.view === 'before') return BASELINE;
  if (state.view === 'a' && state.pinned) return state.pinned.result;
  return state.applied?.result ?? BASELINE;
}
function displayedPlan() {
  if (state.view === 'before') return [];
  if (state.view === 'a' && state.pinned) return state.pinned.selections;
  return state.selections;
}
function cancelRequest() {
  state.request?.abort(); state.request = null; state.busy = null;
}
function invalidateAdvice() {
  cancelRequest(); state.suggestion = null;
  $('adviser-output').replaceChildren(); $('suggestion-output').replaceChildren();
}
function saveLocal() {
  try { localStorage.setItem(storageKey, JSON.stringify({ datasetVersion: DATASET.version, selections: state.selections, pinned: state.pinned?.selections ?? null, locks: [...state.locks] })); } catch { /* Storage may be disabled; the active plan still works. */ }
}
function editPlan(next, { remember = true } = {}) {
  if (remember) state.history.push({ selections: clone(state.selections), locks: [...state.locks] });
  if (state.history.length > 30) state.history.shift();
  state.selections = clone(next); state.applied = null; state.view = 'after'; state.revision += 1;
  const selectedIds = new Set(next.map((item) => item.measureId));
  state.locks = new Set([...state.locks].filter((id) => selectedIds.has(id)));
  invalidateAdvice(); message(); saveLocal(); render();
}
function chooseDistrict(id, focus = true) {
  if (!districts.has(id)) return;
  state.districtId = id;
  $('target-district').value = id;
  render();
  if (focus) city?.focusDistrict(id);
}
function renderSlots() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 5; i += 1) {
    const selection = state.selections[i];
    const slot = node('div', `plan-slot ${selection ? 'filled' : 'empty'}`);
    if (!selection) { slot.append(node('span', 'slot-number', String(i + 1).padStart(2, '0')), node('span', '', 'Your choice')); fragment.append(slot); continue; }
    const measure = measures.get(selection.measureId);
    const title = node('div', 'slot-title');
    const dot = node('span', 'category-dot'); dot.style.setProperty('--category', categories.get(measure.category)?.color ?? '#327857');
    title.append(dot, node('strong', '', measure.name, { title: measure.name }));
    slot.append(title, button('×', 'slot-remove', () => editPlan(state.selections.filter((item) => item.measureId !== measure.id)), { 'aria-label': `Remove ${measure.name}`, 'data-focus': `remove-${measure.id}` }));
    if (measure.scope === 'district') {
      const target = node('select', 'slot-target', null, { 'aria-label': `District for ${measure.name}`, 'data-focus': `target-${measure.id}` });
      for (const district of DATASET.districts) target.append(node('option', '', district.name, { value: district.id }));
      target.value = selection.districtId;
      target.addEventListener('change', () => {
        const candidate = state.selections.map((item) => item.measureId === measure.id ? { ...item, districtId: target.value } : item);
        const validation = validatePlan(candidate, { allowPartial: true });
        if (!validation.valid) { message(validation.errors.map((error) => error.message).join(' '), true); target.value = selection.districtId; return; }
        editPlan(candidate);
      });
      slot.append(target);
    } else slot.append(node('div', 'citywide-slot', 'All five districts'));
    const lockLabel = node('label', 'slot-lock');
    const lock = node('input', '', null, { type: 'checkbox', 'aria-label': `Keep ${measure.name} and its district in recommendations`, 'data-focus': `lock-${measure.id}` });
    lock.checked = state.locks.has(measure.id);
    lock.addEventListener('change', () => { if (lock.checked) state.locks.add(measure.id); else state.locks.delete(measure.id); state.revision += 1; invalidateAdvice(); saveLocal(); render(); });
    lockLabel.append(lock, document.createTextNode('Keep in advice')); slot.append(lockLabel); fragment.append(slot);
  }
  $('plan-slots').replaceChildren(fragment);
}
function renderProjects() {
  const filters = [button('All projects', 'filter', () => { state.category = 'all'; render(); }, { 'aria-pressed': state.category === 'all', 'data-focus': 'filter-all' })];
  for (const category of DATASET.categories) {
    const filter = button(category.name, 'filter', () => { state.category = category.id; render(); }, { 'aria-pressed': state.category === category.id, 'data-focus': `filter-${category.id}` });
    filters.push(filter);
  }
  $('category-filters').replaceChildren(...filters);
  const fragment = document.createDocumentFragment();
  const visible = DATASET.measures.filter((measure) => state.category === 'all' || measure.category === state.category);
  $('project-total').textContent = String(visible.length);
  for (const measure of visible) {
    const selected = state.selections.find((item) => item.measureId === measure.id);
    const districtId = measure.scope === 'city' ? null : state.districtId;
    const candidate = [...state.selections, { measureId: measure.id, districtId }];
    const validation = selected ? null : validatePlan(candidate, { allowPartial: true });
    const category = categories.get(measure.category);
    const card = node('article', `project-card${selected ? ' selected' : ''}`);
    const head = node('div', 'project-card-head');
    const categoryLabel = node('span', 'category-label'); const dot = node('span', 'category-dot'); dot.style.setProperty('--category', category?.color ?? '#327857');
    categoryLabel.append(dot, document.createTextNode(category?.name ?? measure.category));
    const cost = node('span', 'project-cost', measure.cost); cost.append(node('small', '', ' units'));
    head.append(categoryLabel, cost);
    card.append(head, node('h3', '', measure.name), node('p', 'description', measure.description));
    const effects = node('div', 'effect-chips', null, { 'aria-label': 'Base effects before delay adjustment' });
    for (const [id, value] of Object.entries(measure.effects)) effects.append(node('span', `effect-chip${value < 0 ? ' negative' : ''}`, `${id} ${value > 0 ? '+' : ''}${value}`, { title: DATASET.indicators.find((indicator) => indicator.id === id)?.name ?? id }));
    card.append(effects, node('p', 'project-card-meta', `Base effects · ${measure.lag}-quarter delay · ${measure.scope === 'city' ? 'City-wide' : 'One district'}`));
    const action = button(selected ? `✓ ${districtName(selected.districtId)} · Remove` : `Add ${measure.scope === 'city' ? 'city-wide' : `to ${districtName(districtId)}`} +`, 'add-project', () => {
      if (selected) editPlan(state.selections.filter((item) => item.measureId !== measure.id));
      else {
        const checked = validatePlan([...state.selections, { measureId: measure.id, districtId: measure.scope === 'city' ? null : state.districtId }], { allowPartial: true });
        if (!checked.valid) { message(checked.errors.map((error) => error.message).join(' '), true); return; }
        editPlan([...state.selections, { measureId: measure.id, districtId: measure.scope === 'city' ? null : state.districtId }]);
      }
    }, { 'aria-label': selected ? `Remove ${measure.name}` : `Add ${measure.name} ${measure.scope === 'city' ? 'city-wide' : `in ${districtName(districtId)}`}`, 'data-focus': `project-${measure.id}` });
    action.disabled = !selected && !validation.valid;
    card.append(action);
    if (!selected && !validation.valid) card.append(node('p', 'blocked-reason', state.selections.length >= 5 ? 'Remove a project to make room.' : validation.errors.map((error) => error.message).join(' ')));
    fragment.append(card);
  }
  $('projects').replaceChildren(fragment);
}
function renderResults(validation) {
  const displayed = effectiveResult();
  const hasOutcome = state.view === 'a' ? Boolean(state.pinned) : state.view !== 'before' && Boolean(state.applied);
  const baselineView = !hasOutcome;
  const headline = $('headline-result');
  const caption = node('div', 'result-caption', baselineView ? 'Baseline reference' : state.view === 'a' ? 'Pinned Plan A · official score' : 'Your plan · official score');
  const score = node('div', 'score-line'); score.append(node('strong', 'score-big', fmt(displayed.score)));
  if (hasOutcome) { const delta = displayDelta(displayed.score, BASELINE.score); score.append(node('span', `delta-pill${delta < 0 ? ' negative' : delta === 0 ? ' neutral' : ''}`, signed(delta), { title: `Full-precision change: ${fmt(displayed.score - BASELINE.score, 5)}` })); }
  const note = node('p', 'baseline-note', baselineView ? 'The city before intervention. This is not your draft plan’s score.' : `Compared with the ${fmt(BASELINE.score)} baseline, after 8 quarters. Changes use unrounded model values.`);
  const metrics = node('div', 'summary-metrics');
  const weakest = [...displayed.districts].sort((a, b) => a.score - b.score)[0];
  const weakCard = node('div', 'summary-metric'); weakCard.append(node('span', '', 'Weakest district'), node('strong', '', weakest?.name ?? '—'), node('small', '', `${fmt(weakest?.score)} district index`));
  const criticalCard = node('div', 'summary-metric'); criticalCard.append(node('span', '', 'Critical indicators'), node('strong', '', displayed.criticalCount), node('small', '', hasOutcome ? `${BASELINE.criticalCount} at baseline · below 40` : 'Values strictly below 40'));
  metrics.append(weakCard, criticalCard); headline.replaceChildren(caption, score, note, metrics);
  const validationBox = $('validation');
  if (state.view === 'a' && state.pinned) validationBox.replaceChildren(node('p', 'valid-message', `✓ Pinned Plan A · ${state.pinned.result.cost} / ${DATASET.budget} units · 5 projects`));
  else if (state.applied) validationBox.replaceChildren(node('p', 'valid-message', `✓ Valid plan · ${state.applied.result.cost} / ${DATASET.budget} units · 5 projects`));
  else if (validation.valid) validationBox.replaceChildren(node('p', 'valid-message', '✓ Your five-project plan is ready. Simulate to see its impact.'));
  else {
    const text = state.selections.length < 5 ? `${5 - state.selections.length} more ${state.selections.length === 4 ? 'project' : 'projects'} to complete your plan. No draft score is calculated.` : 'Resolve these issues before simulating.';
    const items = [node('p', '', text)];
    const errors = validation.errors.filter((error) => error.code !== 'COUNT');
    if (errors.length) { const list = node('ul'); errors.forEach((error) => list.append(node('li', '', error.message))); items.push(list); }
    validationBox.replaceChildren(...items);
  }
  $('district-results').replaceChildren(...displayed.districts.map((district) => {
    const baseline = BASELINE.districts.find((item) => item.id === district.id); const delta = displayDelta(district.score, baseline.score);
    const row = button('', `district-row${state.districtId === district.id ? ' active' : ''}`, () => chooseDistrict(district.id), { 'aria-label': `${district.name}, district score ${fmt(district.score)}${hasOutcome ? `, change ${signed(delta)}` : ''}`, 'data-focus': `result-${district.id}` });
    row.append(node('span', '', district.name), node('strong', '', fmt(district.score)), node('span', `change${delta < 0 ? ' negative' : ''}`, hasOutcome ? signed(delta) : '—')); return row;
  }));
  const ledger = [node('p', '', 'Official score = 70% population-weighted average + 30% weakest district − count of indicators below 40.')];
  for (const [label, value] of [['City average × 0.7', displayed.average * .7], ['Weakest district × 0.3', displayed.minimum * .3], ['Critical penalty', -displayed.criticalCount]]) { const row = node('div', 'ledger-row'); row.append(node('span', '', label), node('strong', '', fmt(value, 5))); ledger.push(row); }
  if (hasOutcome) for (const synergy of displayed.synergies ?? []) ledger.push(node('div', 'synergy-note', `${synergy.measures.join(' + ')} · ${districtName(synergy.districtId)}: ${synergy.description}`));
  ledger.push(node('p', '', 'Effects use the supplied delays, then fixed synergy bonuses and clipping. Display values are rounded; the model retains full precision.'));
  $('score-breakdown').replaceChildren(...ledger);
  const focus = displayed.districts.find((district) => district.id === state.districtId);
  const base = BASELINE.districts.find((district) => district.id === state.districtId);
  $('focus-name').textContent = `${focus.name} · indicators`;
  $('focus-share').textContent = `${Math.round(focus.populationShare * 100)}% of population`;
  $('indicator-list').replaceChildren(...DATASET.indicators.map((indicator) => {
    const value = focus.indicators[indicator.id], delta = value - base.indicators[indicator.id], critical = value < 40;
    const row = node('div', `indicator-row${critical ? ' critical' : ''}`);
    const heading = node('div', 'indicator-heading'); const label = node('span', '', indicator.name, { title: `${indicator.id}: ${indicator.description}` });
    if (critical) label.append(node('span', 'critical-label', '⚠ <40'));
    const number = node('span', '', fmt(value, 1));
    if (hasOutcome && delta !== 0) number.append(node('span', `indicator-delta${delta < 0 ? ' negative' : ''}`, signed(delta, 1)));
    heading.append(label, number); const track = node('div', 'indicator-track', null, { 'aria-hidden': 'true' }); const fill = node('span'); fill.style.width = `${Math.max(0, Math.min(100, value))}%`; track.append(fill); row.append(heading, track); return row;
  }));
}
function render() {
  if (!DATASET) return;
  const activeFocus = document.activeElement?.getAttribute('data-focus');
  const validation = validatePlan(state.selections);
  $('spent').textContent = String(validation.cost); $('remaining').textContent = `${validation.remaining} units ${validation.remaining >= 0 ? 'available' : 'over budget'}`;
  $('budget-fill').style.width = `${Math.min(100, validation.cost / DATASET.budget * 100)}%`;
  const track = $('budget-fill').parentElement; track.setAttribute('aria-valuenow', Math.min(DATASET.budget, validation.cost)); track.classList.toggle('over', validation.remaining < 0);
  $('slot-count').textContent = `${state.selections.length} / 5 selected`;
  $('apply-plan').disabled = !validation.valid || Boolean(state.applied);
  $('apply-plan').firstElementChild.textContent = state.applied ? 'City simulated' : 'Simulate my city';
  $('plan-hint').textContent = state.applied ? 'Change a choice to try another future' : validation.valid ? 'Ready to see your city change' : `${5 - state.selections.length} ${5 - state.selections.length === 1 ? 'choice' : 'choices'} left to make`;
  $('undo').disabled = state.history.length === 0; $('reset-plan').disabled = state.selections.length === 0;
  const activePlan = state.view === 'after' && Boolean(state.applied);
  $('pin-plan').disabled = !activePlan; $('view-a').disabled = !state.pinned;
  $('get-advice').disabled = !activePlan || Boolean(state.busy); $('get-improvement').disabled = !activePlan || Boolean(state.busy);
  $('get-advice').textContent = state.busy === 'advice' ? 'Explaining…' : 'Explain my plan';
  $('get-improvement').textContent = state.busy === 'suggest' ? 'Checking changes…' : 'Find one improvement';
  $('export-plan').disabled = !activePlan; $('print-plan').disabled = !activePlan;
  $('adviser-output').hidden = state.view !== 'after'; $('suggestion-output').hidden = state.view !== 'after';
  $('pause-city').setAttribute('aria-pressed', state.paused); $('pause-city').textContent = state.paused ? 'Resume motion' : 'Pause motion';
  document.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', item.dataset.view === state.view));
  $('district-shortcuts').replaceChildren(...DATASET.districts.map((district) => button(district.name, '', () => chooseDistrict(district.id), { 'aria-pressed': district.id === state.districtId, 'data-focus': `district-${district.id}` })));
  renderSlots(); renderProjects(); renderResults(validation);
  const mode = state.view === 'before' ? 'before' : state.view === 'a' ? 'a' : state.applied ? 'after' : 'draft';
  $('scene-state').textContent = { before: 'BASELINE CITY', a: 'PINNED PLAN A', after: 'YOUR FUTURE CITY', draft: state.selections.length ? 'DRAFT · PROJECT PREVIEW' : 'BASELINE CITY' }[mode];
  $('scene-description').textContent = mode === 'a' ? 'Pinned Plan A. The same camera keeps changes easy to compare.' : mode === 'before' ? 'The city before intervention. Your choices are preserved.' : mode === 'after' ? 'Your validated end-state at 8 quarters. Representative upgrades illustrate the selected projects.' : 'Translucent projects are previews. Complete five choices and simulate to calculate official outcomes.';
  city?.update({ selections: displayedPlan(), result: mode === 'draft' ? null : effectiveResult(), districtId: state.districtId, mode, paused: state.paused });
  if (activeFocus) [...document.querySelectorAll('[data-focus]')].find((item) => item.dataset.focus === activeFocus)?.focus({ preventScroll: true });
}
function applyPlan() {
  const result = simulatePlan(state.selections);
  if (!result.valid) { message(result.errors.map((error) => error.message).join(' '), true); render(); return; }
  state.applied = { selections: clone(state.selections), result }; state.view = 'after';
  message(`Your five decisions are applied. Official score: ${fmt(result.score)} (${signed(displayDelta(result.score, BASELINE.score))} vs baseline).`);
  render();
}
async function requestAnalysis(kind) {
  if (!state.applied || state.busy) return;
  const revision = state.revision, currentKey = key(state.selections), controller = new AbortController();
  state.request = controller; state.busy = kind; state.suggestion = null; $('suggestion-output').replaceChildren();
  $('adviser-output').textContent = kind === 'advice' ? 'Reading your calculated outcomes…' : 'Checking every eligible one-project change…'; render();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`/api/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: state.applied.selections, lockedMeasureIds: [...state.locks], language: 'en' }), signal: controller.signal });
    let data; try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response. Please try again.'); }
    if (revision !== state.revision || currentKey !== key(state.selections)) return;
    if (!response.ok) throw new Error(data.error ?? data.reason ?? 'The server could not analyze this plan.');
    $('adviser-output').replaceChildren();
    if (kind === 'advice') {
      $('adviser-output').append(node('span', 'adviser-mode', data.mode === 'live' ? 'Live AI · grounded in model outputs' : 'Offline · deterministic explanation'), node('div', 'adviser-text', data.text ?? 'No explanation was returned.'));
      if (data.trace?.length) { const trace = node('details'); trace.append(node('summary', '', 'View calculation evidence')); for (const item of data.trace) trace.append(node('div', 'trace-item', `${item.tool}: ${typeof item.summary === 'string' ? item.summary : JSON.stringify(item.summary)}`)); $('adviser-output').append(trace); }
      if (data.suggestion) showSuggestion(data.suggestion);
    } else showSuggestion(data);
  } catch (error) {
    if (revision !== state.revision) return;
    $('adviser-output').textContent = error.name === 'AbortError' ? 'The request timed out. Your plan and calculated results are safe; try again.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (state.request === controller) { state.request = null; state.busy = null; render(); }
  }
}
function showSuggestion(data) {
  if (!data.available) { $('suggestion-output').replaceChildren(node('p', 'help', data.reason ?? 'No improving one-project change was found.')); return; }
  const verified = simulatePlan(data.selections);
  const locksPreserved = [...state.locks].every((id) => {
    const previous = state.selections.find((item) => item.measureId === id), next = data.selections.find((item) => item.measureId === id);
    return previous && next && previous.districtId === next.districtId;
  });
  if (!verified.valid || !locksPreserved || !(verified.score > state.applied.result.score) || !Number.isFinite(data.result?.score) || Math.abs(verified.score - data.result.score) > 1e-8) { $('suggestion-output').replaceChildren(node('p', 'help', 'The proposed change could not be verified against this plan. It has not been applied.')); return; }
  state.suggestion = { selections: clone(data.selections), result: verified, revision: state.revision };
  const card = node('div', 'suggestion-card');
  card.append(node('strong', '', `${fmt(verified.score)} · ${signed(displayDelta(verified.score, state.applied.result.score))} improvement`), node('p', '', `Cost ${verified.cost}/100. Best one-change search; not a global optimum.`));
  const removed = state.selections.filter((item) => !data.selections.some((next) => next.measureId === item.measureId && next.districtId === item.districtId));
  const added = data.selections.filter((item) => !state.selections.some((previous) => previous.measureId === item.measureId && previous.districtId === item.districtId));
  removed.forEach((item) => card.append(node('p', '', `Replace: ${measures.get(item.measureId).name} · ${districtName(item.districtId)}`)));
  added.forEach((item) => card.append(node('p', '', `With: ${measures.get(item.measureId).name} · ${districtName(item.districtId)}`)));
  card.append(button('Apply verified change ↗', 'button primary', () => {
    const suggestion = state.suggestion;
    if (!suggestion || suggestion.revision !== state.revision) return;
    editPlan(suggestion.selections); applyPlan();
  }));
  $('suggestion-output').replaceChildren(card);
}
function bindControls() {
  $('target-district').append(...DATASET.districts.map((district) => node('option', '', district.name, { value: district.id })));
  $('target-district').value = state.districtId; $('target-district').disabled = false;
  $('target-district').addEventListener('change', () => chooseDistrict($('target-district').value));
  $('load-example').disabled = false; $('load-example').addEventListener('click', () => { editPlan(EXAMPLE_PLAN); message('The supplied example is ready: five projects, 95 units. Simulate to see the result.'); });
  $('reset-plan').addEventListener('click', () => editPlan([]));
  $('undo').addEventListener('click', () => { const previous = state.history.pop(); if (previous) { state.locks = new Set(previous.locks); editPlan(previous.selections, { remember: false }); } });
  $('apply-plan').addEventListener('click', applyPlan);
  $('pin-plan').addEventListener('click', () => { if (state.applied) { state.pinned = clone(state.applied); saveLocal(); message('Plan A is pinned. Edit your choices to explore Plan B; switch views without moving the camera.'); render(); } });
  document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => { if (item.dataset.view === 'a' && !state.pinned) return; state.view = item.dataset.view; render(); }));
  $('pause-city').addEventListener('click', () => { state.paused = !state.paused; render(); });
  $('reset-view').addEventListener('click', () => city?.resetView());
  $('get-advice').addEventListener('click', () => requestAnalysis('advice'));
  $('get-improvement').addEventListener('click', () => requestAnalysis('suggest'));
  $('export-plan').addEventListener('click', () => {
    if (!state.applied) return;
    const payload = { datasetVersion: DATASET.version, selections: state.applied.selections, result: state.applied.result, lockedMeasureIds: [...state.locks], assumptions: 'Organizer-supplied synthetic scenario. Geographic backdrop is real; buildings, projects and reactions are illustrative.', geographyCredit: $('geography-credit').textContent };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = node('a', '', '', { href: url, download: 'akim-lab-plan.json' }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('print-plan').addEventListener('click', () => { state.view = 'after'; render(); window.print(); });
}
async function boot() {
  // The planner must still boot if the separate 3D module cannot load.
  const sceneReady = import('./city.js').then(({ createCity }) => {
    city = createCity({ canvasHost: $('city-canvas'), labelsHost: $('city-labels'), fallbackHost: $('city-fallback'), loadingHost: $('scene-loading'), onDistrictSelect: (id) => chooseDistrict(id), onCredit: (text) => { $('geography-credit').textContent = text; } });
    return city.ready.then(() => render());
  }).catch((error) => {
    $('scene-loading').hidden = true; $('city-fallback').hidden = false;
    $('city-fallback').replaceChildren(node('p', '', 'The 3D view is unavailable. Use the district controls below; planning and calculations still work.'));
    console.warn('Scene module unavailable:', error.message);
  });
  try {
    const [dataModule, simulationModule] = await Promise.all([import('/shared/city-data.js'), import('/shared/simulation.js')]);
    ({ DATASET, EXAMPLE_PLAN } = dataModule); ({ BASELINE, validatePlan, simulatePlan } = simulationModule);
    measures = new Map(DATASET.measures.map((measure) => [measure.id, measure])); districts = new Map(DATASET.districts.map((district) => [district.id, district])); categories = new Map(DATASET.categories.map((category) => [category.id, category]));
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved?.datasetVersion === DATASET.version && validatePlan(saved.selections, { allowPartial: true }).valid) {
        state.selections = clone(saved.selections); state.locks = new Set((saved.locks ?? []).filter((id) => state.selections.some((item) => item.measureId === id)));
        if (saved.pinned && simulatePlan(saved.pinned).valid) state.pinned = { selections: clone(saved.pinned), result: simulatePlan(saved.pinned) };
      }
    } catch { /* Ignore an unavailable or obsolete saved plan. */ }
    bindControls(); render(); $('app').setAttribute('aria-busy', 'false'); message(state.selections.length ? 'Your saved draft is restored. Simulate to recalculate its outcomes.' : 'Start with a district and five projects — or try the supplied example.');
    void sceneReady;
  } catch (error) {
    $('app').setAttribute('aria-busy', 'false'); message('The city calculation model could not load. Your browser has not calculated a score. Reload to retry.', true);
    $('app-message').append(button('Reload', 'button', () => location.reload()));
    $('projects').replaceChildren(node('p', 'empty-copy', 'The project library will appear when the shared model is available.'));
    console.error('City model failed to load:', error.message);
  }
}
boot();
