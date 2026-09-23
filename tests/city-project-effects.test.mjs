import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.js';
import { createProjectEffects } from '../public/city-project-effects.js';

function fixture() {
  const district=(id,x,modeled=true)=>({id,modeled,anchor:[x+2,2],polygons:[[[[x,0],[x+8,0],[x+8,8],[x,8],[x,0]]]],candidates:[[x+2,2],[x+4,4],[x+6,6]]});
  const districts=[district('nura',0),district('esil',10),district('sarayshyk',20,false)];
  const roads=districts.flatMap((d,i)=>[[[i*10+1,2],[i*10+4,2]],[[i*10+4,2],[i*10+7,2]]]);
  const architecture=districts.flatMap(d=>[0,1,2].map(i=>({district:d,point:[d.anchor[0]+i,d.anchor[1]+1],width:.3,depth:.3,height:.5})));
  const landAt=(p,d)=>p[0]>d.anchor[0]-2&&p[0]<d.anchor[0]+6&&p[1]>0&&p[1]<8&&!(p[0]>4&&p[0]<5);
  return {districts,roads,architecture,landAt,isReserved:p=>p[1]>6.8,getProjectSite:id=>districts.find(d=>d.id===id)?.anchor};
}
const all=group=>{const items=[];group.traverse(x=>items.push(x));return items;};

test('visual effects respect replay completion, before/draft views, removal and unmodeled districts',()=>{
  const effects=createProjectEffects({THREE,...fixture()});
  const selections=[{measureId:'M5',districtId:'nura'},{measureId:'M6',districtId:null}];
  effects.update({mode:'after',selections,replay:{completedMeasureIds:[]}});assert.equal(effects.group.children.length,0);
  effects.update({mode:'after',selections,replay:{completedMeasureIds:['M5']}});assert.equal(effects.group.children.length,1);assert.equal(effects.group.children[0].userData.tintedHouses,3);
  effects.update({mode:'after',selections,replay:{completedMeasureIds:['M5','M6']}});assert.equal(effects.group.children.length,3);
  assert.ok(effects.group.children.every(g=>g.userData.districtId!=='sarayshyk'));
  const trees=effects.group.children.filter(g=>g.userData.measureId==='M6');
  for(const g of trees){const d=fixture().districts.find(d=>d.id===g.userData.districtId);assert.ok(g.userData.treePoints.length>0);for(const p of g.userData.treePoints){assert.ok(fixture().landAt(p,d));assert.equal(fixture().isReserved(p),false);}}
  effects.update({mode:'before',selections});assert.equal(effects.group.children.length,0);
  effects.update({mode:'draft',selections});assert.equal(effects.group.children.length,0);
  effects.update({mode:'after',selections:[]});assert.equal(effects.group.children.length,0);
  effects.dispose();effects.dispose();
});

test('every project produces distinct completed scenery and moving transport stays on mapped roads',()=>{
  const effects=createProjectEffects({THREE,...fixture()});
  for(let i=1;i<=14;i++){
    effects.update({mode:'after',selections:[{measureId:`M${i}`,districtId:'nura'}]});
    assert.ok(effects.group.children[0]?.children.length,`M${i} needs a visible effect`);
  }
  effects.update({mode:'after',selections:[{measureId:'M3',districtId:'nura'}]});
  const train=effects.group.children[0].children.find(x=>x.isGroup);
  assert.ok(train);effects.tick({timeSeconds:4,motionEnabled:true});const position=train.position.clone();
  assert.equal(position.z,-2);assert.ok(position.x>=1&&position.x<=7);
  effects.tick({timeSeconds:80,motionEnabled:false});assert.deepEqual(train.position,position);
  effects.tick({timeSeconds:10,motionEnabled:true});assert.notDeepEqual(train.position,position);assert.equal(train.position.z,-2);
  const geo=new Set(all(effects.group).map(x=>x.geometry).filter(Boolean)),mat=new Set(all(effects.group).flatMap(x=>x.material?[x.material]:[]));let released=0;
  for(const x of [...geo,...mat])x.addEventListener('dispose',()=>released++);
  effects.dispose();assert.equal(effects.group.children.length,0);assert.equal(released,geo.size+mat.size);
  effects.update({mode:'after',selections:[{measureId:'M1',districtId:'nura'}]});assert.equal(effects.group.children.length,0);
});

test('transport does not invent links between disconnected source roads',()=>{
  const f=fixture();f.roads=[[[1,2],[2,2]],[[5,2],[7,2]]];
  const effects=createProjectEffects({THREE,...f});
  effects.update({mode:'after',selections:[{measureId:'M1',districtId:'nura'}]});
  const vehicles=effects.group.children[0].children.filter(x=>x.isGroup);assert.equal(vehicles.length,2);
  for(let time=0;time<80;time++){effects.tick({timeSeconds:time});for(const v of vehicles)assert.ok(v.position.x<=2||v.position.x>=5);}
  effects.dispose();
});
