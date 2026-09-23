/** Illustrative project scenery. Never computes policy scores or traffic forecasts. */
import { makeTrack, sampleTrack } from './city-motion.js';

const GREEN = 0x9bd7a4, TEAL = 0x159cab, BLUE = 0x438eb8, GOLD = 0xf2be58;
const hash = text => [...text].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);
const randomFor = seed => { let n=hash(seed);return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296); };
function inRing(p,ring) {
  let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
}
const inside = (p,d) => d.polygons.some(r=>inRing(p,r[0])&&!r.slice(1).some(h=>inRing(p,h)));
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);

// Stitch only identical source endpoints; never bridge a missing road segment.
function roadTracks(roads,district) {
  const pieces=[];
  for(const road of roads) {
    let run=[];
    for(let i=1;i<road.length;i++) {
      const a=road[i-1],b=road[i];
      if(inside(a,district)&&inside(b,district)) { if(!run.length)run.push(a);run.push(b); }
      else if(run.length) { pieces.push(run);run=[]; }
    }
    if(run.length)pieces.push(run);
  }
  const ends=new Map(),used=new Set(),key=p=>p.join(',');
  pieces.forEach((p,i)=>{for(const end of [p[0],p.at(-1)]){const k=key(end);if(!ends.has(k))ends.set(k,[]);ends.get(k).push(i);}});
  const tracks=[];
  for(let i=0;i<pieces.length;i++) {
    if(used.has(i))continue;
    used.add(i);let line=pieces[i].slice();
    for(let side=0;side<2;side++) {
      if(side)line.reverse();
      for(let count=0;count<80;count++) {
        const index=(ends.get(key(line.at(-1)))??[]).find(n=>!used.has(n));
        if(index===undefined)break;
        used.add(index);let next=pieces[index];if(key(next[0])!==key(line.at(-1)))next=next.slice().reverse();
        line.push(...next.slice(1));
      }
    }
    const track=makeTrack(line);if(track&&track.length>.12)tracks.push(track);
  }
  return tracks.sort((a,b)=>{
    const score=t=>Math.min(t.length,15)/(1+Math.min(...t.vertices.map(p=>distance(p,district.anchor)))*.2);
    return score(b)-score(a);
  });
}

export function createProjectEffects({THREE,roads=[],districts=[],architecture=[],landAt=()=>true,isReserved=()=>false,getProjectSite=()=>null,groundY=.18}) {
  const group=new THREE.Group();group.name='Project effects';
  const geometries=new Map(),materials=new Map(),tracks=new Map(),moving=[];
  const dummy=new THREE.Object3D();let signature='',disposed=false,clock=0;
  const geometry=(key,create)=>{if(!geometries.has(key))geometries.set(key,create());return geometries.get(key);};
  const material=(color,opacity=1)=>{
    const key=`${color}:${opacity}`;
    if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.8,metalness:.03,transparent:opacity<1,opacity,depthWrite:opacity===1}));
    return materials.get(key);
  };
  const boxGeo=()=>geometry('box',()=>new THREE.BoxGeometry(1,1,1));
  function box(parent,x,y,z,w,h,d,color) {
    const mesh=new THREE.Mesh(boxGeo(),material(color));mesh.position.set(x,y+h/2,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
  }
  function instanced(parent,geo,mat,parts,name) {
    if(!parts.length)return;
    const mesh=new THREE.InstancedMesh(geo,mat,parts.length);mesh.name=name;
    parts.forEach((p,i)=>{dummy.position.set(...p.position);dummy.scale.set(...p.scale);dummy.rotation.set(0,p.angle??0,p.tilt??0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));});
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=mat.opacity===1;parent.add(mesh);return mesh;
  }
  const piece=(point,y,scale,angle=0)=>({position:[point[0],y,-point[1]],scale,angle});
  function ribbons(parent,selected,width,y,color,offset=0,name='Road treatment') {
    const parts=[];
    for(const track of selected)for(let i=1;i<track.vertices.length;i++) {
      const a=track.vertices[i-1],b=track.vertices[i],len=distance(a,b);if(len<1e-6)continue;
      const dx=(b[0]-a[0])/len,dn=(b[1]-a[1])/len;
      parts.push({position:[(a[0]+b[0])/2-dn*offset,y,-(a[1]+b[1])/2-dx*offset],scale:[width,.015,len+.008],angle:Math.atan2(-dx,dn)});
    }
    return instanced(parent,boxGeo(),material(color),parts,name);
  }
  function leaf(parent,p,height=.8) {
    const sprout=new THREE.Group();sprout.position.set(p[0],groundY+height,-p[1]);
    const geo=geometry('leaf',()=>new THREE.SphereGeometry(1,7,5));
    for(const sign of [-1,1]){const blade=new THREE.Mesh(geo,material(GREEN));blade.position.set(sign*.055,.04,0);blade.scale.set(.08,.15,.026);blade.rotation.z=-sign*.6;sprout.add(blade);}
    box(sprout,0,-.09,0,.015,.17,.015,0x6ca87d);parent.add(sprout);return sprout;
  }
  function marker(parent,p,kind,color=BLUE) {
    if(!p)return;
    const holder=new THREE.Group();holder.position.set(p[0],groundY+.65,-p[1]);
    const plate=new THREE.Mesh(geometry('badge',()=>new THREE.CylinderGeometry(.19,.19,.025,20)),material(0xffffff));plate.rotation.x=Math.PI/2;holder.add(plate);
    if(kind==='cross'){box(holder,0,-.11,.03,.065,.22,.025,color);box(holder,0,-.033,.03,.22,.065,.025,color);}
    else if(kind==='book'){box(holder,-.065,-.095,.03,.11,.18,.025,color).rotation.z=.12;box(holder,.065,-.095,.03,.11,.18,.025,color).rotation.z=-.12;}
    else {box(holder,-.045,-.063,.03,.04,.11,.025,color).rotation.z=.65;box(holder,.042,-.04,.03,.04,.21,.025,color).rotation.z=-.65;}
    holder.rotation.y=-Math.PI/5;parent.add(holder);
  }
  function trees(parent,points) {
    const crowns=[],trunks=[];
    points.forEach((p,i)=>{const s=.7+(i%5)*.08;trunks.push(piece(p,groundY+.13*s,[.021*s,.26*s,.021*s]));crowns.push({...piece(p,groundY+.34*s,[.15*s,.24*s,.15*s]),color:[0x61aa75,0x76b984,0x409564][i%3]});});
    instanced(parent,geometry('trunk',()=>new THREE.CylinderGeometry(1,1,1,5)),material(0xa88868),trunks,'New tree trunks');
    instanced(parent,geometry('crown',()=>new THREE.IcosahedronGeometry(1,0)),material(0xffffff),crowns,'New urban trees');
    parent.userData.treePoints=points;
  }
  function safeTree(p,d,clearance=.2) {
    if(!landAt(p,d)||isReserved(p,clearance))return false;
    for(let i=0;i<8;i++){const angle=i*Math.PI/4;if(!landAt([p[0]+Math.cos(angle)*clearance,p[1]+Math.sin(angle)*clearance],d))return false;}
    return !architecture.some(b=>Math.abs(p[0]-b.point[0])<b.width/2+clearance&&Math.abs(p[1]-b.point[1])<b.depth/2+clearance);
  }
  function scatter(d,id,site) {
    const rand=randomFor(`${id}:${d.id}`),points=[];
    for(let i=0;i<1200&&points.length<(id==='M6'?65:24);i++) {
      const base=id==='M6'?(d.candidates?.[Math.floor(rand()*d.candidates.length)]??d.anchor):site;
      if(!base)break;
      const radius=id==='M6'?1.8:1.2,p=[base[0]+(rand()-.5)*radius*2,base[1]+(rand()-.5)*radius*2];
      if(safeTree(p,d)&&!points.some(q=>distance(p,q)<.4))points.push(p);
    }
    return points;
  }
  function roadPoints(selected,count=9) {
    const points=[];
    for(const track of selected.slice(0,3))for(let i=0;i<count;i++){
      const t=sampleTrack(track,(i+.5)/count*track.length);points.push({p:[t.x,t.z],angle:Math.atan2(-t.dx,t.dz),dx:t.dx,dn:t.dz});
    }
    return points;
  }
  function vehicle(parent,track,kind,phase=0) {
    if(!track)return;
    const v=new THREE.Group(),rail=kind==='rail',bus=kind==='bus';
    const len=rail?.6:bus?.38:.25,width=rail?.17:.14,height=rail?.17:.12;
    box(v,0,0,0,width,height,len,rail?0x398b98:bus?0x38b4ad:0xf4c057);
    box(v,0,height*.35,0,width*1.03,height*.34,len*.78,0x425f69);
    box(v,0,height,0,width*.92,.026,len*.96,0xf8faf5);
    parent.add(v);moving.push({object:v,track,height:rail?groundY+.24:groundY+.025,speed:rail?.5:bus?.32:.25,phase});
  }
  function build(selection,d) {
    const id=selection.measureId,parent=new THREE.Group();parent.name=`${id} ${d.id}`;parent.userData={measureId:id,districtId:d.id};group.add(parent);
    if(!tracks.has(d.id))tracks.set(d.id,roadTracks(roads,d));
    const selected=tracks.get(d.id).slice(0,id==='M3'?1:4),site=getProjectSite(d.id,id)??d.anchor;
    if(id==='M1') {ribbons(parent,selected,.105,groundY+.022,TEAL,0,'Bus priority lanes');selected.slice(0,2).forEach((t,i)=>vehicle(parent,t,'bus',i*2));}
    if(id==='M2') {
      const poles=[],heads=[],bulbs=[];
      for(const {p,dx,dn} of roadPoints(selected,5)){const q=[p[0]-dn*.10,p[1]+dx*.10];poles.push(piece(q,groundY+.17,[.024,.34,.024]));heads.push(piece(q,groundY+.34,[.085,.14,.05]));bulbs.push(piece(q,groundY+.32,[.038,.038,.06]));}
      instanced(parent,boxGeo(),material(0x60737a),poles,'Signal posts');instanced(parent,boxGeo(),material(0x334951),heads,'Signal heads');instanced(parent,boxGeo(),material(0x8de2a0),bulbs,'Coordinated green signals');
      ribbons(parent,selected,.043,groundY+.025,0x8cd6b7);
    }
    if(id==='M3') {
      ribbons(parent,selected,.24,groundY+.19,0xe6ebdf,0,'New light rail deck');
      ribbons(parent,selected,.018,groundY+.22,TEAL,-.067,'New light rail');ribbons(parent,selected,.018,groundY+.22,TEAL,.067,'New light rail');
      const pillars=[],platforms=[];
      for(const {p,angle} of roadPoints(selected,9))pillars.push(piece(p,groundY+.09,[.055,.18,.055],angle));
      for(const {p,angle,dx,dn} of roadPoints(selected,3)){const q=[p[0]-dn*.24,p[1]+dx*.24];platforms.push(piece(q,groundY+.2,[.2,.05,.75],angle));}
      instanced(parent,boxGeo(),material(0xb9c5bf),pillars,'New rail supports');instanced(parent,boxGeo(),material(0x8ac4c6),platforms,'New rail stops');vehicle(parent,selected[0],'rail');
    }
    if(id==='M4'||id==='M6'){trees(parent,scatter(d,id,site));if(site&&id==='M4')leaf(parent,site,.85);}
    if(id==='M5') {
      const houses=architecture.filter(b=>b.district.id===d.id),parts=houses.map(b=>piece(b.point,.16+b.height/2,[b.width*1.012,b.height*1.014,b.depth*1.012]));
      const tint=instanced(parent,boxGeo(),material(GREEN,.38),parts,'Clean fuel house tint');if(tint)tint.renderOrder=1;
      const stride=Math.max(1,Math.ceil(houses.length/12));houses.filter((_,i)=>i%stride===0).forEach(b=>leaf(parent,b.point,b.height+.24));
      parent.userData.tintedHouses=houses.length;
    }
    if(id==='M7')marker(parent,site,'book',0x8b73b5);
    if(id==='M8')marker(parent,site,'cross',0xd77985);
    if(id==='M9'&&site){const court=box(parent,site[0],groundY+.015,-site[1],.78,.02,.5,0x77b8bd);court.userData.projectCourt=true;marker(parent,site,'check',0x3e969e);}
    if(id==='M10') {
      const posts=[],lamps=[],halos=[];
      for(const {p,dx,dn,angle} of roadPoints(selected,8)){const q=[p[0]-dn*.14,p[1]+dx*.14];posts.push(piece(q,groundY+.24,[.023,.48,.023]));lamps.push(piece(q,groundY+.48,[.13,.032,.07],angle));halos.push(piece(q,groundY+.017,[.27,.27,1]));}
      instanced(parent,boxGeo(),material(0x748b8b),posts,'Streetlight posts');instanced(parent,boxGeo(),material(0xffdc80),lamps,'Warm streetlights');
      const haloGeo=geometry('halo',()=>{const g=new THREE.CircleGeometry(1,18);g.rotateX(-Math.PI/2);return g;});
      // Circle geometry lies flat in XZ after rotation.
      halos.forEach(p=>p.scale=[.27,1,.27]);instanced(parent,haloGeo,material(GOLD,.22),halos,'Streetlight pools');
    }
    if(id==='M11') {
      const bars=[];
      for(const {p,angle,dx,dn} of roadPoints(selected,4))for(let i=-2;i<=2;i++)bars.push(piece([p[0]+dx*i*.058,p[1]+dn*i*.058],groundY+.026,[.22,.015,.028],angle));
      instanced(parent,boxGeo(),material(0xffffff),bars,'Safe zebra crossings');
    }
    if(id==='M12')marker(parent,site,'check',0x58ae9a);
    if(id==='M13'){ribbons(parent,selected,.065,groundY+.028,BLUE,.12,'Renewed utility corridor');const valves=roadPoints(selected,4).map(({p})=>piece(p,groundY+.06,[.10,.09,.10]));instanced(parent,boxGeo(),material(0x74b9cf),valves,'New utility access points');}
    if(id==='M14'){selected.slice(0,2).forEach((t,i)=>vehicle(parent,t,'utility',i*3));marker(parent,site,'check',0xd6a344);}
    parent.userData.routeCount=selected.length;
  }
  function renderMotion(time) {
    for(const item of moving){const p=sampleTrack(item.track,time*item.speed+item.phase);item.object.position.set(p.x,item.height,-p.z);item.object.rotation.y=Math.atan2(-p.dx,p.dz);}
  }
  function clear(){group.traverse(child=>{if(child.isInstancedMesh)child.dispose();});group.clear();moving.length=0;}
  function update(props={}) {
    if(disposed)return;
    const selections=props.selections??[],completed=props.mode==='after'&&props.replay?new Set(props.replay.completedMeasureIds??[]):null;
    const enabled=props.mode==='after'||props.mode==='a';
    const active=enabled?selections.filter(s=>!completed||completed.has(s.measureId)):[];
    const next=JSON.stringify(active.map(s=>[s.measureId,s.districtId]).sort());if(signature===next)return;
    signature=next;clear();
    for(const selection of active)for(const d of districts)if(d.modeled&&(selection.districtId===null||selection.districtId===d.id))build(selection,d);
    renderMotion(clock);
  }
  function tick({timeSeconds=0,motionEnabled=true}={}) {if(disposed||!motionEnabled)return;clock=timeSeconds;renderMotion(clock);}
  function dispose(){if(disposed)return;disposed=true;clear();for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();geometries.clear();materials.clear();tracks.clear();group.removeFromParent();}
  return {group,update,tick,dispose};
}
