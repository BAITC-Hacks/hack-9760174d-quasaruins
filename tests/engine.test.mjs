import test from 'node:test';
import assert from 'node:assert/strict';
import { DATASET, EXAMPLE_PLAN } from '../shared/city-data.js';
import { BASELINE, validatePlan, simulatePlan, timelinePlan } from '../shared/simulation.js';
import { suggestPlan } from '../shared/optimizer.js';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('published independent numeric anchors and score ledger reconcile',()=>{
  close(BASELINE.score,52.55768);
  close(BASELINE.average,56.8624);
  const r=simulatePlan(EXAMPLE_PLAN);
  assert.equal(r.valid,true); assert.equal(r.cost,95); assert.equal(r.criticalCount,0);
  close(r.score,56.54307);
  close(r.districts.find(d=>d.id==='nura').score,52.9625);
  close(r.score,r.breakdown.averageTerm+r.breakdown.minimumTerm-r.breakdown.criticalPenalty);
  assert.deepEqual(r.synergies.map(s=>s.effects),[{B1:2}]);
});

test('drafts validate for selection but never produce an official score',()=>{
  assert.equal(validatePlan([],{allowPartial:true}).valid,true);
  const r=simulatePlan([]);
  assert.equal(r.valid,false); assert.equal(r.score,null); assert.deepEqual(r.districts,[]);
});

test('untrusted input and prototype-like IDs are rejected without exceptions',()=>{
  for (const input of [null,{},'five',[null],[1],[{measureId:'toString'}],[{measureId:'__proto__'}],[{measureId:7}]]) {
    assert.equal(simulatePlan(input).valid,false);
    assert.equal(simulatePlan(input).score,null);
  }
  const plan=EXAMPLE_PLAN.map(s=>({...s}));plan[0].districtId='toString';
  assert.ok(simulatePlan(plan).errors.some(e=>e.code==='UNKNOWN_DISTRICT'));
});

test('road-safety trade-off creates the correct critical penalty',()=>{
  const plan=[['M11','almaty'],['M7','nura'],['M8','nura'],['M12',null],['M4','saryarka']]
    .map(([measureId,districtId])=>({measureId,districtId}));
  const r=simulatePlan(plan);
  assert.equal(r.valid,true);close(r.districts.find(d=>d.id==='almaty').indicators.T1,38.25);
  assert.equal(r.criticalCount,1);
  assert.deepEqual(r.criticalIndicators.map(i=>[i.districtId,i.indicatorId]),[['almaty','T1']]);
});

test('input order is irrelevant and frozen input/data are not changed',()=>{
  const snapshot=JSON.stringify(DATASET);
  const r=simulatePlan(EXAMPLE_PLAN),reversed=simulatePlan([...EXAMPLE_PLAN].reverse());
  assert.deepEqual(r,reversed); assert.equal(JSON.stringify(DATASET),snapshot);
  r.districts[0].indicators.T1=-100;
  assert.notEqual(simulatePlan(EXAMPLE_PLAN).districts[0].indicators.T1,-100);
});

test('best one-change advice preserves measure and target, then reproduces its preview',()=>{
  const s=suggestPlan(EXAMPLE_PLAN,{lockedMeasureIds:['M7']});
  assert.equal(s.available,true); assert.equal(s.examined,216);
  assert.deepEqual(s.selections.find(x=>x.measureId==='M7'),{measureId:'M7',districtId:'nura'});
  close(s.result.score,57.20556); close(s.improvement,.66249);
  assert.deepEqual(simulatePlan(s.selections),s.result);
  const changed=EXAMPLE_PLAN.filter(x=>!s.selections.some(y=>y.measureId===x.measureId&&y.districtId===x.districtId));
  assert.equal(changed.length,1);
  assert.deepEqual(suggestPlan([...EXAMPLE_PLAN].reverse(),{lockedMeasureIds:['M7']}).selections,s.selections);
});

test('all-locked and invalid plans cannot generate suggestions',()=>{
  const s=suggestPlan(EXAMPLE_PLAN,{lockedMeasureIds:EXAMPLE_PLAN.map(s=>s.measureId)});
  assert.equal(s.available,false);assert.equal(s.examined,0);
  for (const options of [{lockedMeasureIds:['M99']},{lockedMeasureIds:['M7','M7']},{lockedMeasureIds:'M7'}]) {
    assert.equal(suggestPlan(EXAMPLE_PLAN,options).available,false);
  }
  assert.equal(suggestPlan([]).available,false);
});

test('illustrative replay preserves lags, synergy activation and exact final results',()=>{
  const timeline=timelinePlan(EXAMPLE_PLAN),frames=timeline.frames;
  assert.equal(timeline.valid,true);assert.equal(frames.length,9);
  close(frames[0].result.score,BASELINE.score);close(frames[1].result.score,BASELINE.score);
  assert.equal(frames[0].official,false);assert.equal(frames[0].illustrative,false);
  assert.deepEqual(frames[1].completedMeasureIds,['M10','M12']);
  assert.equal(frames[1].result.synergies.length,0);assert.equal(frames[2].result.synergies.length,1);
  const nura=q=>frames[q].result.districts.find(d=>d.id==='nura');
  close(nura(2).indicators.B1,58.5);close(nura(3).indicators.S1,38);close(nura(4).indicators.S1,40);
  assert.equal(frames[4].result.criticalIndicators.some(x=>x.districtId==='nura'&&x.indicatorId==='S1'),false);
  for(const frame of frames.slice(1,8)){assert.equal(frame.illustrative,true);assert.equal(frame.official,false);}
  assert.equal(frames[8].official,true);assert.equal(frames[8].illustrative,false);
  assert.deepEqual(frames[8].result,simulatePlan(EXAMPLE_PLAN));
  assert.deepEqual(timelinePlan([...EXAMPLE_PLAN].reverse()),timeline);
});

test('replay never supplies frames for invalid plans and retains negative trade-offs',()=>{
  for(const input of [null,[],EXAMPLE_PLAN.slice(1)]) {
    const result=timelinePlan(input);assert.equal(result.valid,false);assert.deepEqual(result.frames,[]);
  }
  const plan=[['M11','almaty'],['M7','nura'],['M8','nura'],['M12',null],['M4','saryarka']]
    .map(([measureId,districtId])=>({measureId,districtId}));
  const {frames}=timelinePlan(plan);
  close(frames[2].result.districts.find(d=>d.id==='almaty').indicators.T1,39.75);
  assert.ok(frames[2].result.criticalIndicators.some(x=>x.districtId==='almaty'&&x.indicatorId==='T1'));
  assert.deepEqual(frames[8].result,simulatePlan(plan));
});
