import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createAppServer } from '../server/app.mjs';
import { getAdvice } from '../server/adviser.mjs';
import { verifiedFacts, renderSelectedFacts } from '../server/verified-facts.mjs';
import { buildEvidence } from '../server/adviser.mjs';
import { EXAMPLE_PLAN } from '../shared/city-data.js';
let server,base;
before(async()=>{server=createAppServer({apiKey:''});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('HTTP health and exact simulation are usable without API credentials',async()=>{
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.ok,true);assert.equal(health.aiConfigured,false);
  const response=await post('/api/simulate',{selections:EXAMPLE_PLAN,score:999});
  assert.equal(response.status,200);assert.ok(Math.abs((await response.json()).score-56.54307)<1e-9);
});
test('invalid submissions have no score and malformed JSON is explained',async()=>{
  const invalid=await post('/api/simulate',{selections:[]});assert.equal(invalid.status,422);assert.equal((await invalid.json()).score,null);
  const malformed=await fetch(base+'/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(malformed.status,400);assert.equal((await malformed.json()).error,'Invalid JSON.');
});
test('untrusted origins, non-JSON and oversized payloads are rejected',async()=>{
  assert.equal((await post('/api/advice',{selections:EXAMPLE_PLAN},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await post('/api/simulate',{selections:EXAMPLE_PLAN},{'Content-Type':'text/plain'})).status,415);
  assert.equal((await post('/api/simulate',{padding:'x'.repeat(70000)})).status,413);
  const hostileHostStatus=await new Promise((resolve,reject)=>{
    const req=request(base+'/api/health',{headers:{Host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(hostileHostStatus,403);
});
test('server exposes only public assets and named shared modules',async()=>{
  for(const path of ['/.env.hackalem','/server/main.mjs','/shared/../.env','/shared/city-data.js/../.env','/vendor/README.md']) {
    assert.equal((await fetch(base+path)).status,404,path);
  }
  const script=await fetch(base+'/shared/simulation.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
  assert.equal((await fetch(base+'/vendor/three.module.js')).status,200);
});
test('real offline geography has all six districts and explicit model distinction',async()=>{
  const response=await fetch(base+'/api/geography');assert.equal(response.status,200);
  const geo=await response.json();assert.equal(geo.districts.features.length,6);
  assert.equal(geo.districts.features.find(f=>f.properties.id==='sarayshyk').properties.modeled,false);
  assert.equal(geo.roads.features.length,1930);assert.equal(geo.water.features.length,1135);
  for(const layer of ['districts','water'])for(const f of geo[layer].features) {
    const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const polygon of polygons)for(const ring of polygon) {
      assert.ok(ring.length>=4,'Every polygon ring needs at least four coordinates.');
      assert.deepEqual(ring[0],ring.at(-1),'Rings must be closed.');
      assert.ok(new Set(ring.map(p=>p.join(','))).size>=3,'Small polygons must not collapse during rounding.');
    }
  }
});
test('HTTP one-change recommendation retains user locks and fallback is labeled',async()=>{
  const input={selections:EXAMPLE_PLAN,lockedMeasureIds:['M7']};
  const s=await(await post('/api/suggest',input)).json();assert.equal(s.available,true);
  assert.equal(s.selections.find(x=>x.measureId==='M7').districtId,'nura');
  const advice=await(await post('/api/advice',input)).json();assert.equal(advice.mode,'offline');assert.match(advice.text,/56\.54/);
  assert.equal(advice.suggestion.result.score,s.result.score);
  assert.equal((await post('/api/advice',{...input,lockedMeasureIds:['M99']})).status,422);
});
test('live adviser executes an evidence tool before narrative and preserves tool linkage',async()=>{
  const requests=[];
  const fakeFetch=async(url,options)=>{
    const request=JSON.parse(options.body);requests.push(request);
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(request.store,false);
    return {ok:true,json:async()=>requests.length===1?
      {output:[{type:'function_call',name:'get_scenario_evidence',arguments:'{}',call_id:'proof-123'}]}:
      {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({strengthIds:['gain_nura_S1'],riskIds:['weakest']})}]}]}};
  };
  const advice=await getAdvice({selections:EXAMPLE_PLAN,lockedMeasureIds:['M7']},{apiKey:'fake-test-only',fetchImpl:fakeFetch});
  assert.equal(advice.mode,'live');assert.equal(requests.length,2);
  assert.match(advice.text,/schools and childcare rises by 10\.00/);
  assert.match(advice.text,/replace Clean household fuel \(Saryarka\) with Light rail expansion \(Nura\)/);
  assert.equal(requests[1].text.format.type,'json_schema');
  const returned=requests[1].input.find(i=>i.type==='function_call_output');assert.equal(returned.call_id,'proof-123');
  const proof=JSON.parse(returned.output);assert.ok(Math.abs(proof.result.score-56.54307)<1e-9);
  assert.deepEqual(proof.lockedMeasureIds,['M7']);assert.equal(advice.trace[0].tool,'get_scenario_evidence');
  assert.equal(JSON.stringify(advice).includes('fake-test-only'),false);
});
test('upstream errors and unexpected tool calls produce useful offline explanations',async()=>{
  for(const fakeFetch of [async()=>{throw new Error('secret upstream detail');},async()=>({ok:true,json:async()=>({output:[{type:'function_call',name:'invent_score',call_id:'x',arguments:'{}'}]})})]) {
    const advice=await getAdvice({selections:EXAMPLE_PLAN},{apiKey:'fake-test-only',fetchImpl:fakeFetch});
    assert.equal(advice.mode,'offline');assert.equal(JSON.stringify(advice).includes('secret upstream'),false);assert.match(advice.text,/56\.54/);
  }
});

test('AI cannot insert invented facts, duplicate statements or extra prose into a briefing',()=>{
  const facts=verifiedFacts(buildEvidence(EXAMPLE_PLAN,['M7']));
  for(const invalid of [
    {strengthIds:['invented_transport_gain'],riskIds:['weakest']},
    {strengthIds:['district_nura','district_nura'],riskIds:['weakest']},
    {strengthIds:['district_nura'],riskIds:['weakest'],prose:'Your score is 999.'},
    {strengthIds:[],riskIds:['weakest']},
  ])assert.throws(()=>renderSelectedFacts(facts,invalid));
});
