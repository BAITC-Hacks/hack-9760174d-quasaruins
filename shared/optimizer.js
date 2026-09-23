import { DATASET } from './city-data.js';
import { simulatePlan } from './simulation.js';

export function validateLocks(selections, lockedMeasureIds) {
  return Array.isArray(lockedMeasureIds) && lockedMeasureIds.every(id=>typeof id==='string' && selections.some(s=>s.measureId===id))
    && new Set(lockedMeasureIds).size===lockedMeasureIds.length;
}

const key=plan=>plan.map(s=>`${s.measureId.padStart(3,'0')}:${s.districtId??''}`).sort().join('|');
export function suggestPlan(currentSelections, {lockedMeasureIds=[]}={}) {
  const current=simulatePlan(currentSelections);
  const empty={available:false,reason:null,selections:null,result:null,method:'exhaustive-one-change',examined:0,improvement:0};
  if (!current.valid) return {...empty,reason:'Complete a valid five-project plan before requesting an improvement.'};
  if (!validateLocks(current.selections,lockedMeasureIds)) return {...empty,reason:'Locks must be unique project IDs in the current plan.'};
  const locked=new Set(lockedMeasureIds);
  let best=null,examined=0;
  for (let slot=0;slot<current.selections.length;slot++) {
    if (locked.has(current.selections[slot].measureId)) continue;
    for (const m of DATASET.measures) {
      const targets=m.scope==='city' ? [null] : DATASET.districts.map(d=>d.id);
      for (const districtId of targets) {
        examined++;
        const candidate=current.selections.map((s,i)=>i===slot ? {measureId:m.id,districtId} : {...s});
        const result=simulatePlan(candidate);
        if (!result.valid || result.score<=current.score+1e-10) continue;
        if (!best || result.score>best.score+1e-10 ||
          (Math.abs(result.score-best.score)<1e-10 && (result.cost<best.cost || (result.cost===best.cost && key(result.selections)<key(best.selections))))) best=result;
      }
    }
  }
  if (!best) return {...empty,examined,reason:locked.size===5 ? 'All five projects are locked.' : 'No better single-project replacement exists under these locks.'};
  return {available:true,reason:null,selections:best.selections.map(s=>({...s})),result:best,
    method:'exhaustive-one-change',examined,improvement:best.score-current.score};
}
