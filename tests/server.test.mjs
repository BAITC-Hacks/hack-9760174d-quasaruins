import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createAppServer } from '../server/app.mjs';
import { getAdvice } from '../server/adviser.mjs';
import { verifiedFacts, renderSelectedFacts } from '../server/verified-facts.mjs';
import { buildEvidence } from '../server/adviser.mjs';
import { EXAMPLE_PLAN } from '../shared/city-data.js';
import { synthesizeSpeech } from '../server/speech.mjs';
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
  assert.equal(geo.landmarks.features.length,14);assert.equal(geo.parks.features.length,3);
  assert.match(geo.credit,/OpenStreetMap/);assert.equal(geo.attributionUrl,'https://www.openstreetmap.org/copyright');
  // Catch coordinate order/orientation errors that would move the landmarks
  // off the central axis or swap the palace to the opposite river bank.
  const landmark=id=>geo.landmarks.features.find(f=>f.properties.id===id).geometry.coordinates;
  assert.ok(landmark('khan-shatyr')[0]<landmark('bayterek')[0]);
  assert.ok(landmark('bayterek')[0]<landmark('ak-orda')[0]);
  assert.ok(landmark('ak-orda')[0]<landmark('peace-palace')[0]);
  assert.ok(landmark('grand-mosque')[1]<landmark('nur-alem')[1]);
  assert.ok(landmark('nur-alem')[1]<landmark('bayterek')[1]);
  assert.ok(landmark('peace-palace')[0]<landmark('hazret-sultan')[0]);
  const track=geo.lrt.line.features[0].geometry.coordinates,stops=geo.lrt.stations.features;
  assert.equal(geo.lrt.line.features.length,1);assert.equal(stops.length,18);
  assert.equal(new Set(stops.map(f=>f.properties.id)).size,18);
  assert.deepEqual(track[0],stops[0].geometry.coordinates);assert.deepEqual(track.at(-1),stops.at(-1).geometry.coordinates);
  for(const stop of stops)assert.ok(track.some(p=>p[0]===stop.geometry.coordinates[0]&&p[1]===stop.geometry.coordinates[1]),'Stops must lie on the mapped route.');
  for(const f of [...geo.landmarks.features,...geo.parks.features,...geo.lrt.line.features,...stops]) {
    assert.equal(f.properties.scored,false);assert.match(f.properties.sourceUrl,/^https:/);
  }
  for(const layer of ['districts','water','parks'])for(const f of geo[layer].features) {
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

test('AI fact selection cannot hide an adverse effect or remaining critical indicator',()=>{
  const plan=[['M11','almaty'],['M7','nura'],['M8','nura'],['M12',null],['M4','saryarka']]
    .map(([measureId,districtId])=>({measureId,districtId}));
  const facts=verifiedFacts(buildEvidence(plan));
  const text=renderSelectedFacts(facts,{strengthIds:['gain_nura_S1'],riskIds:['scope']});
  assert.match(text,/Almaty: road flow falls by 1\.75 to 38\.25/);
  assert.match(text,/Almaty still has a critical road flow indicator at 38\.25/);
});

test('speech endpoint validates text, preserves origin protection and has a no-key fallback',async()=>{
  assert.equal((await post('/api/speech',{text:'Your city plan is ready.'})).status,503);
  for(const text of ['',null,12,' '.repeat(3),'a'.repeat(4001)])assert.equal((await post('/api/speech',{text})).status,400);
  assert.equal((await post('/api/speech',{text:'Ready.'},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await post('/api/speech',{text:'Ready.'},{'Content-Type':'text/plain'})).status,415);
});

test('speech transport preserves briefing text and never returns upstream error details',async()=>{
  const input='The score is 56.54. Road flow falls by 1.75.',sample=Buffer.from('ID3 transport fixture');
  const bytes=await synthesizeSpeech(input,{apiKey:'fake-test-only',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/audio/speech');
    const body=JSON.parse(options.body);assert.equal(body.input,input);assert.equal(body.voice,'cedar');
    assert.equal(body.model,'gpt-4o-mini-tts');assert.equal(body.response_format,'mp3');
    return {ok:true,arrayBuffer:async()=>sample};
  }});
  assert.deepEqual(bytes,sample);
  for(const fetchImpl of [async()=>{throw new Error('secret upstream details');},async()=>({ok:false})]) {
    await assert.rejects(synthesizeSpeech(input,{apiKey:'fake-test-only',fetchImpl}),error=>error.status===503 && !error.message.includes('secret'));
  }
});

test('speech HTTP delivers audio, discloses its source and reuses identical requests',async()=>{
  const sample=Buffer.from('ID3 transport fixture');let calls=0;
  const speechServer=createAppServer({apiKey:'fake-test-only',speechFn:async text=>{
    calls++;assert.equal(text,'Ready.');return sample;
  }});
  speechServer.listen(0,'127.0.0.1');await once(speechServer,'listening');
  try {
    for(let i=0;i<2;i++) {
      const response=await fetch(`http://127.0.0.1:${speechServer.address().port}/api/speech`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Ready.'}),
      });
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/mpeg');
      assert.equal(response.headers.get('x-audio-source'),'AI-generated voice');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),sample);
    }
    assert.equal(calls,1);
  } finally {speechServer.closeAllConnections();await new Promise(resolve=>speechServer.close(resolve));}
});
