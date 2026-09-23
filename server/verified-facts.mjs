import { DATASET } from '../shared/city-data.js';
const signed=n=>`${n>=0?'+':''}${n.toFixed(2)}`;
const describe=s=>`${DATASET.measures.find(m=>m.id===s.measureId).name} (${s.districtId?DATASET.districts.find(d=>d.id===s.districtId).name:'city-wide'})`;
const same=(a,b)=>a.measureId===b.measureId&&a.districtId===b.districtId;

// AI chooses the most relevant facts. Only these computed statements reach the
// user, preventing invented numbers, project targets, and unsupported effects.
export function verifiedFacts(evidence) {
  const r=evidence.result,s=evidence.suggestion,strengths=[],risks=[];
  const intro=`The plan spends ${r.cost}/100 and scores ${r.score.toFixed(2)} (${signed(r.delta)} from baseline).`;
  for(const d of r.districts) {
    if(d.delta>0) strengths.push({id:`district_${d.id}`,text:`${d.name} improves by ${d.delta.toFixed(2)} district points to ${d.score.toFixed(2)}.`});
    for(const i of DATASET.indicators) {
      const delta=d.indicatorDeltas[i.id],value=d.indicators[i.id];
      if(delta>0) strengths.push({id:`gain_${d.id}_${i.id}`,text:`${d.name}: ${i.name.toLowerCase()} rises by ${delta.toFixed(2)} to ${value.toFixed(2)}.`});
      if(delta<0) risks.push({id:`loss_${d.id}_${i.id}`,text:`Trade-off in ${d.name}: ${i.name.toLowerCase()} falls by ${Math.abs(delta).toFixed(2)} to ${value.toFixed(2)}.`});
      if(value<40) risks.push({id:`critical_${d.id}_${i.id}`,text:`${d.name} still has a critical ${i.name.toLowerCase()} indicator at ${value.toFixed(2)} (below 40).`});
      else if(delta===0 && value<60) risks.push({id:`unchanged_${d.id}_${i.id}`,text:`${d.name}: ${i.name.toLowerCase()} stays unchanged at ${value.toFixed(2)}.`});
    }
  }
  for(const [index,syn] of r.synergies.entries()) {
    strengths.push({id:`synergy_${index}`,text:`${syn.description} The fixed bonus applies in ${DATASET.districts.find(d=>d.id===syn.districtId).name}.`});
  }
  if(r.criticalCount===0) strengths.push({id:'no_critical',text:'No modeled district indicator remains below the critical threshold of 40.'});
  risks.push({id:'weakest',text:`${r.districts.filter(d=>r.weakestDistrictIds.includes(d.id)).map(d=>d.name).join(', ')} remains the weakest district score at ${r.minimum.toFixed(2)}.`});
  risks.push({id:'scope',text:'These are synthetic district outcomes; the buildings and citizen reactions illustrate the model, rather than predict real behavior.'});
  let recommendation=s.reason;
  if(s.available) {
    const removed=r.selections.find(a=>!s.selections.some(b=>same(a,b)));
    const added=s.selections.find(a=>!r.selections.some(b=>same(a,b)));
    recommendation=`Verified alternative: replace ${describe(removed)} with ${describe(added)}. The score becomes ${s.result.score.toFixed(2)} (${signed(s.improvement)}), at a cost of ${s.result.cost}/100. `;
    const decreases=[];
    for(const d of s.result.districts) {
      const old=r.districts.find(x=>x.id===d.id);
      for(const i of DATASET.indicators) if(d.indicators[i.id]<old.indicators[i.id]) {
        decreases.push(`${d.name} ${i.name.toLowerCase()} ${signed(d.indicators[i.id]-old.indicators[i.id])}`);
      }
    }
    if(decreases.length)recommendation+=`Compared with the current plan, the trade-offs are: ${decreases.join('; ')}. `;
    recommendation+='This is the best single-project change under the current locks, not a proven global optimum. Apply it only after reviewing the comparison.';
  }
  return {intro,strengths,risks,recommendation};
}

export function factSelectionSchema(facts) {
  return {type:'json_schema',name:'verified_briefing',strict:true,schema:{type:'object',additionalProperties:false,
    properties:{
      strengthIds:{type:'array',items:{type:'string',enum:facts.strengths.map(f=>f.id)},minItems:1,maxItems:3},
      riskIds:{type:'array',items:{type:'string',enum:facts.risks.map(f=>f.id)},minItems:1,maxItems:3},
    },required:['strengthIds','riskIds']}};
}

export function renderSelectedFacts(facts,selection) {
  if(!selection || Object.keys(selection).sort().join(',')!=='riskIds,strengthIds')throw new Error('Invalid briefing structure.');
  const selected=(ids,source)=>{
    if(!Array.isArray(ids)||ids.length<1||ids.length>3||new Set(ids).size!==ids.length)throw new Error('Invalid fact selection.');
    return ids.map(id=>{const fact=source.find(f=>f.id===id);if(!fact)throw new Error('Unverified statement.');return fact.text;});
  };
  return [facts.intro,selected(selection.strengthIds,facts.strengths).join(' '),
    selected(selection.riskIds,facts.risks).join(' '),facts.recommendation].join('\n\n');
}
