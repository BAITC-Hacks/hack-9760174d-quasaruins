import { DATASET, deepFreeze } from './city-data.js';

const measures = new Map(DATASET.measures.map(m=>[m.id,m]));
const districtIds = new Set(DATASET.districts.map(d=>d.id));
const canonical = selections => selections.map(s=>({measureId:s.measureId,districtId:s.districtId ?? null}))
  .sort((a,b)=>Number(a.measureId.slice(1))-Number(b.measureId.slice(1)));

export function validatePlan(selections, {allowPartial=false}={}) {
  const errors=[];
  const counts=Object.fromEntries(DATASET.categories.map(c=>[c.id,0]));
  let cost=0;
  const add=(code,message,measureIds)=>errors.push({code,message,...(measureIds ? {measureIds}: {})});
  if (!Array.isArray(selections)) {
    return {valid:false,errors:[{code:'INPUT',message:'Selections must be an array.'}],cost,remaining:DATASET.budget,counts};
  }
  if (selections.length>5 || (!allowPartial && selections.length!==5)) add('COUNT','Choose exactly five different projects.');
  const seen=new Set(), where=new Map();
  for (const selection of selections) {
    if (!selection || typeof selection!=='object' || Array.isArray(selection)) {
      add('INPUT','Every selection must be a project and district object.'); continue;
    }
    const {measureId,districtId}=selection;
    const measure=measures.get(measureId);
    if (!measure) { add('UNKNOWN_MEASURE','Unknown project ID.'); continue; }
    if (seen.has(measureId)) add('DUPLICATE',`${measure.name} can only be selected once.`,[measureId]);
    seen.add(measureId); where.set(measureId,districtId);
    cost+=measure.cost; counts[measure.category]++;
    if (measure.scope==='district') {
      if (districtId==null) add('DISTRICT_REQUIRED',`Choose a district for ${measure.name}.`,[measureId]);
      else if (!districtIds.has(districtId)) add('UNKNOWN_DISTRICT','Choose one of the five modeled districts.',[measureId]);
    } else if (districtId!=null) add('DISTRICT_NOT_ALLOWED',`${measure.name} applies across the modeled city.`,[measureId]);
  }
  if (cost>DATASET.budget) add('BUDGET',`The plan costs ${cost}; the budget is ${DATASET.budget}.`);
  for (const category of DATASET.categories) {
    if (counts[category.id]>2) add('DIRECTION_LIMIT',`Choose at most two ${category.name.toLowerCase()} projects.`);
  }
  for (const rule of DATASET.incompatibilities) {
    const [a,b]=rule.measures;
    if (where.has(a) && where.has(b) && (rule.scope==='any' || where.get(a)===where.get(b))) {
      add('INCOMPATIBLE',rule.message,rule.measures.slice());
    }
  }
  return {valid:errors.length===0,errors,cost,remaining:DATASET.budget-cost,counts};
}

function scoreDistricts(districts) {
  const criticalIndicators=[];
  for (const district of districts) {
    district.score=DATASET.indicators.reduce((sum,i)=>sum+i.weight*district.indicators[i.id],0);
    for (const indicator of DATASET.indicators) {
      const value=district.indicators[indicator.id];
      if (value<DATASET.criticalThreshold) criticalIndicators.push({districtId:district.id,indicatorId:indicator.id,value});
    }
  }
  const average=districts.reduce((sum,d)=>sum+d.populationShare*d.score,0);
  const minimum=Math.min(...districts.map(d=>d.score));
  const criticalCount=criticalIndicators.length;
  const score=.7*average+.3*minimum-criticalCount;
  return {score,average,minimum,criticalCount,districts,criticalIndicators,
    breakdown:{averageTerm:.7*average,minimumTerm:.3*minimum,criticalPenalty:criticalCount},
    weakestDistrictIds:districts.filter(d=>Math.abs(d.score-minimum)<1e-10).map(d=>d.id)};
}

const freshDistricts=()=>DATASET.districts.map(d=>({...d,indicators:{...d.indicators}}));
export const BASELINE=deepFreeze(scoreDistricts(freshDistricts()));

export function simulatePlan(selections) {
  const validation=validatePlan(selections);
  if (!validation.valid) return {...validation,selections:[],score:null,delta:null,average:null,minimum:null,
    criticalCount:null,districts:[],criticalIndicators:[],synergies:[],contributions:[],breakdown:null,weakestDistrictIds:[]};
  const sorted=canonical(selections), districts=freshDistricts();
  const byId=new Map(districts.map(d=>[d.id,d]));
  const contributions=[], synergies=[];
  for (const selection of sorted) {
    const m=measures.get(selection.measureId), realizedFraction=(DATASET.horizon-m.lag)/DATASET.horizon;
    const effects=Object.fromEntries(Object.entries(m.effects).map(([key,value])=>[key,value*realizedFraction]));
    const targets=m.scope==='city' ? districts : [byId.get(selection.districtId)];
    for (const d of targets) for (const [key,value] of Object.entries(effects)) d.indicators[key]+=value;
    contributions.push({...selection,cost:m.cost,realizedFraction,effects,districtIds:targets.map(d=>d.id)});
  }
  const where=new Map(sorted.map(s=>[s.measureId,s.districtId]));
  for (const rule of DATASET.synergies) if (rule.measures.every(id=>where.has(id))) {
    const districtId=where.get(rule.targetMeasure), district=byId.get(districtId);
    for (const [key,value] of Object.entries(rule.effects)) district.indicators[key]+=value;
    synergies.push({measures:rule.measures.slice(),districtId,effects:{...rule.effects},description:rule.description});
  }
  for (const d of districts) {
    const original=BASELINE.districts.find(b=>b.id===d.id);
    d.indicatorDeltas={};
    for (const key of Object.keys(d.indicators)) {
      d.indicators[key]=Math.max(0,Math.min(100,d.indicators[key]));
      d.indicatorDeltas[key]=d.indicators[key]-original.indicators[key];
    }
  }
  const result=scoreDistricts(districts);
  for (const d of districts) d.delta=d.score-BASELINE.districts.find(b=>b.id===d.id).score;
  return {...validation,...result,selections:sorted,delta:result.score-BASELINE.score,synergies,contributions};
}
