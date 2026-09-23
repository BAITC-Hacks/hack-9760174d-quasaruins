/** Geographic presentation only. All policy effects and scores come from the shared evaluator. */
import { createCityDetails } from './city-details.js';
import { makeTrack, sampleTrack } from './city-motion.js';
const COLORS = { land: 0xe7ebdd, side: 0xd5deca, outside: 0xe3e5dc, water: 0x82cddd, road: 0xc3cabb, building: 0xf3e9d9, roof: 0xe1d8c9, glass: 0xb8d6d7, green: 0x4b9562, mint: 0xe8f3ed, transport: 0x238a9a, social: 0x8a73b8, safety: 0xb37a25, services: 0x587ea0 };
const MODES = new Set(['draft', 'before', 'after', 'a']);
const hash = (text) => [...String(text)].reduce((value, char) => ((value * 31 + char.charCodeAt(0)) >>> 0), 7);
function rng(seed) { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }; }
function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function insidePolygons(point, polygons) { return polygons.some((rings) => insideRing(point, rings[0]) && !rings.slice(1).some((hole) => insideRing(point, hole))); }
function polygonCoordinates(geometry) { return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []; }
function lineCoordinates(geometry) { return geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : []; }
// Coordinate simplification can collapse tiny water holes; do not pass them to triangulation.
function usableRing(ring) {
  const distinct = ring.filter((point, i) => i === 0 || point[0] !== ring[i - 1][0] || point[1] !== ring[i - 1][1]);
  if (distinct.length > 1 && distinct[0][0] === distinct.at(-1)[0] && distinct[0][1] === distinct.at(-1)[1]) distinct.pop();
  if (distinct.length < 3) return null;
  const area = distinct.reduce((sum, point, i) => { const next = distinct[(i + 1) % distinct.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0);
  return Math.abs(area) > 1e-10 ? distinct : null;
}
function usablePolygon(rings) {
  const outer = usableRing(rings[0] ?? []);
  return outer ? [outer, ...rings.slice(1).map(usableRing).filter(Boolean)] : null;
}

export function createCity({ canvasHost, labelsHost, reactionsHost, fallbackHost, loadingHost, onDistrictSelect, onCredit, onDistrictHover = () => {} }) {
  let THREE, OrbitControls, scene, camera, renderer, controls, geography, project, districtRecords = [], waterPolygons = [], waterAreas = [], roads = [], raycaster;
  let props = { selections: [], result: null, districtId: 'nura', mode: 'draft', paused: false };
  let signature = '', ready3d = false, disposed = false, frame, resizeObserver, focusTween, home, animationStart = 0, upgrades = [];
  let ambient = [], motionTime = 0, previousFrame = 0, ambientMeshes, reactions = [], lastReactedPlan = '', previousAppliedKeys = new Set();
  let focusedProject = null, projectFocusLabel, hoveredDistrictId = null, hoverLabel, cityDetails = null, landmarkLabels = [];
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const materials = new Map(), geometries = new Map(), projectSites = new Map();
  const geometry = (id, factory) => { if (!geometries.has(id)) geometries.set(id, factory()); return geometries.get(id); };
  const material = (color, opacity = 1) => {
    const id = `${color}:${opacity}`;
    if (!materials.has(id)) materials.set(id, new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: .03, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
    return materials.get(id);
  };
  const landAt = (point, district) => insidePolygons(point, district.polygons) && !waterAreas.some((area) => point[0] >= area.minX && point[0] <= area.maxX && point[1] >= area.minY && point[1] <= area.maxY && insidePolygons(point, [area.rings]));
  const buildableAt = (point, district, clearance = .34) => landAt(point, district) && !cityDetails?.isReserved(point, clearance)
    && [[-1,-1],[1,-1],[1,1],[-1,1]].every(([x,y])=>landAt([point[0]+x*clearance,point[1]+y*clearance],district));

  function meshBox(parent, x, y, z, width, height, depth, color, opacity = 1) {
    const mesh = new THREE.Mesh(geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material(color, opacity));
    mesh.position.set(x, y + height / 2, z); mesh.scale.set(width, height, depth); mesh.castShadow = opacity === 1; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(parent, x, y, z, radius, height, color, opacity = 1) {
    const mesh = new THREE.Mesh(geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 8)), material(color, opacity));
    mesh.position.set(x, y + height / 2, z); mesh.scale.set(radius, height, radius); mesh.castShadow = opacity === 1; parent.add(mesh); return mesh;
  }
  function tree(parent, x, z, scale = 1, opacity = 1) {
    cylinder(parent, x, .16, z, .035 * scale, .26 * scale, 0xb29c7e, opacity);
    const crown = new THREE.Mesh(geometry('tree', () => new THREE.IcosahedronGeometry(1, 0)), material(COLORS.green, opacity));
    crown.position.set(x, .2 + .43 * scale, z); crown.scale.set(.23 * scale, .37 * scale, .23 * scale); crown.castShadow = opacity === 1; parent.add(crown);
  }
  function lines(parent, points, color, opacity = 1, closed = false) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new (closed ? THREE.LineLoop : THREE.Line)(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    parent.add(line); return line;
  }
  function shapeFor(rings) {
    const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)));
    for (const ring of rings.slice(1)) shape.holes.push(new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x, y))));
    return shape;
  }
  function preprocess() {
    const [lon, lat] = geography.origin;
    project = ([x, y]) => [(x - lon) * 111.32 * Math.cos(lat * Math.PI / 180), (y - lat) * 111.32];
    districtRecords = geography.districts.features.map((feature) => {
      const polygons = polygonCoordinates(feature.geometry).map((rings) => usablePolygon(rings.map((ring) => ring.map(project)))).filter(Boolean);
      const points = polygons.flatMap((rings) => rings[0]);
      const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
      return { ...feature.properties, polygons, meshes: [], outlines: [], buildings: [], candidates: [], bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } };
    });
    waterPolygons = geography.water.features.flatMap((feature) => polygonCoordinates(feature.geometry).map((rings) => usablePolygon(rings.map((ring) => ring.map(project)))).filter(Boolean));
    waterAreas = waterPolygons.map((rings) => ({ rings, minX: Math.min(...rings[0].map(p=>p[0])), maxX: Math.max(...rings[0].map(p=>p[0])), minY: Math.min(...rings[0].map(p=>p[1])), maxY: Math.max(...rings[0].map(p=>p[1])) }));
    roads = geography.roads.features.flatMap((feature) => lineCoordinates(feature.geometry).map((line) => line.map(project))).filter((line) => line.length > 1);
    const roadSamples = roads.flatMap((line) => line.filter((_, i) => i % Math.max(1, Math.floor(line.length / 8)) === 0));
    const sampleStride = Math.max(1, Math.ceil(roadSamples.length / 4000));
    for (const district of districtRecords) {
      district.candidates = roadSamples.filter((point, i) => i % sampleStride === 0 && landAt(point, district));
      if (district.candidates.length) {
        const sortedX = district.candidates.map((p) => p[0]).sort((a, b) => a - b), sortedY = district.candidates.map((p) => p[1]).sort((a, b) => a - b);
        const middle = [sortedX[Math.floor(sortedX.length / 2)], sortedY[Math.floor(sortedY.length / 2)]];
        district.anchor = district.candidates.reduce((nearest, p) => Math.hypot(p[0] - middle[0], p[1] - middle[1]) < Math.hypot(nearest[0] - middle[0], nearest[1] - middle[1]) ? p : nearest);
      } else {
        const random = rng(hash(district.id));
        district.anchor = district.polygons[0][0][0];
        for (let i = 0; i < 300; i += 1) { const p = [district.bounds.minX + random() * (district.bounds.maxX - district.bounds.minX), district.bounds.minY + random() * (district.bounds.maxY - district.bounds.minY)]; if (landAt(p, district)) { district.anchor = p; district.candidates.push(p); break; } }
      }
    }
  }
  function buildGeography() {
    const allPoints = districtRecords.flatMap((district) => district.polygons.flatMap((rings) => rings[0]));
    const bounds = new THREE.Box3().setFromPoints(allPoints.map(([x, y]) => new THREE.Vector3(x, 0, -y)));
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    for (const district of districtRecords) {
      for (const rings of district.polygons) {
        const geometry = new THREE.ExtrudeGeometry(shapeFor(rings), { depth: .13, bevelEnabled: false }); geometry.rotateX(-Math.PI / 2);
        const top = new THREE.MeshStandardMaterial({ color: district.modeled ? COLORS.land : COLORS.outside, roughness: 1 });
        const mesh = new THREE.Mesh(geometry, [top, material(COLORS.side)]); mesh.receiveShadow = true; mesh.userData.districtId = district.id; scene.add(mesh); district.meshes.push(mesh);
        for (const ring of rings) district.outlines.push(lines(scene, ring.map(([x, y]) => new THREE.Vector3(x, .145, -y)), 0xc3cdbb, .8, true));
      }
      const label = document.createElement('button'); label.type = 'button'; label.className = `district-map-label${district.modeled ? '' : ' unmodeled'}`; label.textContent = district.name;
      if (!district.modeled) { const small = document.createElement('small'); small.textContent = 'Outside this scenario'; label.append(small); label.title = 'No synthetic scenario data for this district'; }
      else label.addEventListener('click', () => onDistrictSelect(district.id));
      label.addEventListener('pointerenter',()=>setHoveredDistrict(district.id));
      label.addEventListener('pointerleave',()=>setHoveredDistrict(null));
      label.addEventListener('focus',()=>setHoveredDistrict(district.id));
      label.addEventListener('blur',()=>setHoveredDistrict(null));
      labelsHost.append(label); district.label = label;
    }
    projectFocusLabel=document.createElement('div');projectFocusLabel.className='project-map-focus';projectFocusLabel.hidden=true;labelsHost.append(projectFocusLabel);
    hoverLabel=document.createElement('div');hoverLabel.className='project-map-focus';hoverLabel.hidden=true;
    hoverLabel.style.pointerEvents='none';hoverLabel.style.zIndex='6';labelsHost.append(hoverLabel);
    landmarkLabels=(cityDetails?.landmarkAnchors??[]).map(anchor=>{
      const element=document.createElement('button');element.type='button';element.className='district-map-label landmark-map-label';
      element.textContent=anchor.id==='peace-palace'?'Peace Palace':anchor.name;
      element.title=`${anchor.name} · mapped location, stylized model`;
      element.style.background='#fff9e9';element.style.borderColor='#d7c391';element.style.color='#65592f';
      element.addEventListener('click',()=>focusLandmark(anchor.id));labelsHost.append(element);
      return {...anchor,element};
    });
    // Thousands of static source features share two draw objects rather than one per feature.
    const waterVertices=[];
    for(const rings of waterPolygons){const indexed=new THREE.ShapeGeometry(shapeFor(rings));indexed.rotateX(-Math.PI/2);const flat=indexed.toNonIndexed();for(const value of flat.attributes.position.array)waterVertices.push(value);flat.dispose();indexed.dispose();}
    if(waterVertices.length){const geo=new THREE.BufferGeometry(),normals=new Float32Array(waterVertices.length);for(let i=1;i<normals.length;i+=3)normals[i]=1;geo.setAttribute('position',new THREE.Float32BufferAttribute(waterVertices,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));const mesh=new THREE.Mesh(geo,material(COLORS.water));mesh.position.y=.151;mesh.receiveShadow=true;scene.add(mesh);}
    const roadVertices=[];
    for(const road of roads)for(let i=1;i<road.length;i+=1){const a=road[i-1],b=road[i];roadVertices.push(a[0],.17,-a[1],b[0],.17,-b[1]);}
    const roadGeometry=new THREE.BufferGeometry();roadGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roadVertices,3));scene.add(new THREE.LineSegments(roadGeometry,new THREE.LineBasicMaterial({color:COLORS.road,transparent:true,opacity:.86})));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 12, size.z + 12), material(0xeef1e5)); ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, -.05, center.z); ground.receiveShadow = true; scene.add(ground);
    const ambient = new THREE.HemisphereLight(0xffffff, 0xa6b696, 2.3); scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff7e7, 2.8); sun.position.set(center.x - 20, 45, center.z + 16); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -size.x; sun.shadow.camera.right = size.x; sun.shadow.camera.top = size.z; sun.shadow.camera.bottom = -size.z; sun.shadow.camera.far = 100; sun.shadow.bias = -.0003; sun.shadow.normalBias = .04; scene.add(sun); sun.target.position.copy(center); scene.add(sun.target);
    home = { center, span: Math.max(size.x, size.z) * .96, planWidth: (size.x + size.z) * Math.SQRT1_2, planHeight: (size.x + size.z) * .5 + 2 };
    const buildingData = [], treeData = [];
    for (const district of districtRecords.filter((district) => district.modeled)) {
      const random = rng(hash(`${district.id}-architecture`));
      const candidates = district.candidates.length ? district.candidates : [district.anchor];
      for (let i = 0; i < 95; i += 1) {
        const base = candidates[Math.floor(random() * candidates.length)];
        const point = [base[0] + (random() - .5) * .55, base[1] + (random() - .5) * .55];
        if (!buildableAt(point, district) || district.buildings.some((other) => Math.hypot(other[0] - point[0], other[1] - point[1]) < .35)) continue;
        district.buildings.push(point);
        // Procedural filler must not hide the real landmarks behind tall blocks.
        const nearLandmark=cityDetails?.landmarkAnchors.some(anchor=>Math.hypot(point[0]-anchor.position[0],point[1]+anchor.position[2])<1.25);
        buildingData.push({ x: point[0], z: -point[1], width: .18 + random() * .22, depth: .18 + random() * .3, height: nearLandmark?.18+random()*.2:.3+random()**2*1.25 });
        if (i % 2 === 0) { const green = [point[0] + .3, point[1] + .2]; if (buildableAt(green, district,.2)) treeData.push([green[0], -green[1]]); }
      }
    }
    const boxes = new THREE.InstancedMesh(geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material(COLORS.building), buildingData.length);
    const roofs = new THREE.InstancedMesh(geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material(COLORS.roof), buildingData.length);
    const dummy = new THREE.Object3D();
    buildingData.forEach((item, i) => { dummy.position.set(item.x, .16 + item.height / 2, item.z); dummy.scale.set(item.width, item.height, item.depth); dummy.updateMatrix(); boxes.setMatrixAt(i, dummy.matrix); dummy.position.y = .17 + item.height; dummy.scale.set(item.width * .85, .06, item.depth * .85); dummy.updateMatrix(); roofs.setMatrixAt(i, dummy.matrix); });
    boxes.castShadow = true; boxes.receiveShadow = true; roofs.castShadow = true; scene.add(boxes, roofs);
    const trunks=new THREE.InstancedMesh(geometry('cylinder',()=>new THREE.CylinderGeometry(1,1,1,8)),material(0xb29c7e),treeData.length),crowns=new THREE.InstancedMesh(geometry('tree',()=>new THREE.IcosahedronGeometry(1,0)),material(COLORS.green),treeData.length);
    treeData.forEach(([x,z],i)=>{dummy.position.set(x,.264,z);dummy.scale.set(.028,.208,.028);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=.544;dummy.scale.set(.184,.296,.184);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);});crowns.castShadow=true;scene.add(trunks,crowns);
    buildPopulation();
    resetView(true);
  }
  function buildPopulation() {
    const tracks = roads.map((road) => makeTrack(road.map(([x, y]) => [x, -y]))).filter((track) => track && track.length >= .35 && track.length <= 8 && track.vertices.some(([x,z]) => Math.hypot(x,z) < 9));
    if (!tracks.length) return;
    const random = rng(12987), carCount = Math.min(22, tracks.length), personCount = Math.min(28, tracks.length);
    const instanced = (name, geo, color, count) => { const mesh = new THREE.InstancedMesh(geo, material(color), count); mesh.name = name; mesh.castShadow = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh); return mesh; };
    ambientMeshes = {
      cars: instanced('Illustrative cars', geometry('box',()=>new THREE.BoxGeometry(1,1,1)), COLORS.transport, carCount),
      cabins: instanced('Car cabins', geometry('box',()=>new THREE.BoxGeometry(1,1,1)), COLORS.mint, carCount),
      people: instanced('Illustrative pedestrians', geometry('person',()=>new THREE.CylinderGeometry(.6,1,1,5)), 0x829b78, personCount),
      heads: instanced('Pedestrian heads', geometry('head',()=>new THREE.IcosahedronGeometry(1,0)), 0xddbb97, personCount),
    };
    for (let i=0;i<carCount+personCount;i+=1) {
      const track = tracks[Math.floor(random()*tracks.length)], kind = i<carCount?'car':'person';
      ambient.push({kind,index:kind==='car'?i:i-carCount,track,offset:random()*track.length*2,speed:kind==='car'?.12+random()*.06:.025+random()*.018,side:kind==='car'?.035:.095,position:null});
    }
    updatePopulation();
  }
  function updatePopulation() {
    if (!ambientMeshes) return;
    const dummy = new THREE.Object3D();
    for (const actor of ambient) {
      const p = sampleTrack(actor.track, actor.offset + motionTime * actor.speed), x=p.x-p.dz*actor.side,z=p.z+p.dx*actor.side;
      actor.position = new THREE.Vector3(x,.2,z); dummy.rotation.set(0,Math.atan2(-p.dz,p.dx),0);
      if(actor.kind==='car'){
        dummy.position.set(x,.23,z);dummy.scale.set(.19,.09,.095);dummy.updateMatrix();ambientMeshes.cars.setMatrixAt(actor.index,dummy.matrix);
        dummy.position.y=.30;dummy.scale.set(.10,.065,.085);dummy.updateMatrix();ambientMeshes.cabins.setMatrixAt(actor.index,dummy.matrix);
      }else{
        dummy.position.set(x,.27,z);dummy.scale.set(.034,.17,.034);dummy.updateMatrix();ambientMeshes.people.setMatrixAt(actor.index,dummy.matrix);
        dummy.position.y=.39;dummy.scale.set(.043,.043,.043);dummy.updateMatrix();ambientMeshes.heads.setMatrixAt(actor.index,dummy.matrix);
      }
    }
    Object.values(ambientMeshes).forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;});
  }
  function projectSite(district, measureId) {
    const key=`${district.id}:${measureId}`;
    if(projectSites.has(key))return projectSites.get(key);
    const available=point=>buildableAt(point,district,.95)&&![...projectSites].some(([id,other])=>id.startsWith(district.id+':')&&Math.hypot(other[0]-point[0],other[1]-point[1])<2);
    const reserve=point=>{if(point)projectSites.set(key,point);return point;};
    const random = rng(hash(`${district.id}:${measureId}`));
    const options = district.candidates.filter((p) => Math.hypot(p[0] - district.anchor[0], p[1] - district.anchor[1]) < 4);
    for (let i = 0; i < 120; i += 1) {
      const base = options.length ? options[Math.floor(random() * options.length)] : district.anchor;
      const candidate = [base[0] + (random() - .5) * .6, base[1] + (random() - .5) * .6];
      if (available(candidate)) return reserve(candidate);
    }
    // Never fall back to a site known to overlap a park, landmark or water.
    return reserve(district.candidates.find(available) ?? null);
  }
  function constructionShape(group) {
    meshBox(group,0,.17,0,1.25,.045,.9,0xded8c4);
    for(const x of [-.58,.58])for(const z of [-.4,.4])cylinder(group,x,.2,z,.026,1.1,0xbe9c54);
    for(const y of [.56,.98]) {
      lines(group,[[-.58,y,-.4],[.58,y,-.4],[.58,y,.4],[-.58,y,.4],[-.58,y,-.4]].map(p=>new THREE.Vector3(...p)),0xb48c3e,.9);
      meshBox(group,0,y,0,1.2,.035,.08,0xd6c29c);
    }
    cylinder(group,.72,.17,-.42,.045,1.6,COLORS.safety);
    meshBox(group,.25,1.73,-.42,1.4,.065,.08,COLORS.safety);
    lines(group,[new THREE.Vector3(-.35,1.76,-.42),new THREE.Vector3(-.35,.75,-.42)],0x8b886d);
    meshBox(group,-.35,.67,-.42,.16,.1,.14,0xa9b5a3);
  }
  function projectShape(group, measureId, opacity) {
    const box = (x, z, w, h, d, color = COLORS.mint, y = .17) => meshBox(group, x, y, z, w, h, d, color, opacity);
    const pole = (x, z, h, color = COLORS.roof) => cylinder(group, x, .17, z, .03, h, color, opacity);
    const line = (points, color) => lines(group, points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), color, opacity);
    const trees = (count, radius = .65) => { const random = rng(hash(measureId)); for (let i = 0; i < count; i += 1) tree(group, (random() - .5) * radius * 2, (random() - .5) * radius * 2, .75 + random() * .55, opacity); };
    const building = (accent = COLORS.glass) => { box(0, 0, .8, .65, .55); box(0, 0, .82, .1, .57, accent, .82); box(0, .287, .5, .18, .025, COLORS.glass, .43); };
    switch (measureId) {
      case 'M1':
        box(0, 0, 2, .025, .22, COLORS.transport); box(.3, .35, .9, .07, .42, COLORS.transport, .77); pole(-.08, .35, .6); pole(.68, .35, .6); line([[-1,.2,0],[1,.2,0]],0xb6e4db); break;
      case 'M2':
        box(0, 0, 1.5, .02, .5, COLORS.road); for (const x of [-.6,.6]) { pole(x,.35,.8); box(x,.35,.11,.25,.1,COLORS.transport,.72); box(x,.412,.06,.06,.025,COLORS.green,.83); } break;
      case 'M3':
        box(0, 0, 2.3, .025, .4, COLORS.road); line([[-1.15,.21,-.1],[1.15,.21,-.1]],COLORS.transport); line([[-1.15,.21,.1],[1.15,.21,.1]],COLORS.transport); box(.1,0,.95,.23,.23,COLORS.glass,.22); box(.1,0,.75,.05,.25,COLORS.transport,.45); break;
      case 'M4': box(0,0,1.6,.045,1.45,0xbad3ae); trees(9); break;
      case 'M5': building(COLORS.green); cylinder(group,.26,.86,-.1,.09,.42,COLORS.roof,opacity); box(.26,-.1,.24,.08,.22,COLORS.green,1.2); tree(group,-.6,.25,.95,opacity); break;
      case 'M6': trees(12,1); break;
      case 'M7': building(COLORS.social); box(.55,.1,.42,.45,.7); box(.55,.1,.44,.06,.72,COLORS.glass,.62); box(0,.55,.8,.035,.36,0xc9dfbd); tree(group,-.55,.4,.7,opacity); break;
      case 'M8': building(COLORS.social); box(-.4,.2,.5,.48,.6); box(0,.286,.25,.07,.025,COLORS.social,.61); box(0,.287,.07,.25,.026,COLORS.social,.52); break;
      case 'M9':
        box(0,0,1.3,.04,.85,0x97bfa1); line([[-.55,.22,-.33],[.55,.22,-.33],[.55,.22,.33],[-.55,.22,.33],[-.55,.22,-.33]],0xf8faf0); line([[0,.22,-.33],[0,.22,.33]],0xf8faf0); pole(.6,0,.4); break;
      case 'M10':
        for (const x of [-.5,.5]) { pole(x,0,.9); box(x+.1,0,.3,.035,.08,COLORS.safety,1.05); const halo = new THREE.Mesh(geometry('halo',()=>new THREE.CircleGeometry(.28,16)),new THREE.MeshBasicMaterial({color:0xe9c96f,transparent:true,opacity:.3*opacity,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.set(x+.13,.19,0);group.add(halo); } break;
      case 'M11':
        box(0,0,1.35,.02,.7,COLORS.road); for(let x=-.5;x<=.5;x+=.2) box(x,0,.09,.035,.65,0xfffdf0,.19); box(0,.4,.33,.09,.15,COLORS.safety); break;
      case 'M12': building(COLORS.services); pole(.35,-.15,.95,COLORS.services); line([[.25,1.06,-.14],[.35,.96,-.14],[.56,1.2,-.14]],COLORS.green); break;
      case 'M13': building(COLORS.glass); line([[-.7,.25,.6],[.6,.25,.6],[.6,.25,-.5]],COLORS.services); box(-.4,.1,.27,.22,.3,COLORS.services,.83); break;
      case 'M14':
        box(0,0,.78,.25,.34,COLORS.services,.24); box(.23,0,.25,.22,.31,COLORS.glass,.45); box(-.05,0,.1,.045,.17,COLORS.safety,.52); for(const x of [-.25,.25]) for(const z of [-.18,.18]){const wheel=new THREE.Mesh(geometry('wheel',()=>new THREE.CylinderGeometry(.085,.085,.045,10)),material(0x59665c,opacity));wheel.rotation.x=Math.PI/2;wheel.position.set(x,.23,z);group.add(wheel);} break;
    }
  }
  function clearUpgrades() {
    for (const group of upgrades) { scene.remove(group); group.traverse((child) => { if (child.isLine) { child.geometry.dispose(); child.material.dispose(); } else if (child.material?.isMeshBasicMaterial) child.material.dispose(); }); }
    upgrades = [];
  }
  function updateUpgrades() {
    if (!ready3d) return;
    const replay = props.mode==='after' ? props.replay : null;
    const completed = new Set(replay?.completedMeasureIds ?? []);
    const next = `${props.mode}:${props.selections.map((item) => `${item.measureId}:${item.districtId}`).sort().join('|')}:${(props.highlightKeys??[]).slice().sort().join('|')}:${replay?replay.quarter:'final'}:${[...completed].sort().join(',')}`;
    if (next === signature) return;
    const prior = new Map(upgrades.map(group=>[`${group.userData.measureId}:${group.userData.districtId}`,group.userData.constructing]));
    signature = next; clearUpgrades();
    if (props.mode === 'before') return;
    const opacity = props.mode === 'draft' ? .43 : 1;
    for (const selection of [...props.selections].sort((a,b)=>Number(a.measureId.slice(1))-Number(b.measureId.slice(1)))) {
      const targets = districtRecords.filter((district) => district.modeled && (selection.districtId === null || selection.districtId === district.id));
      for (const district of targets) {
        const group = new THREE.Group(), site = projectSite(district, selection.measureId);
        if(!site)continue;
        const constructing=Boolean(replay&&!completed.has(selection.measureId));
        const justCompleted=prior.get(`${selection.measureId}:${district.id}`)===true&&!constructing;
        group.position.set(site[0], 0, -site[1]);
        group.scale.setScalar(.75);
        group.userData = { districtId: district.id, measureId: selection.measureId, constructing, animate:justCompleted||(!replay&&props.mode==='after'), reveal:props.paused||reducedMotion?1:0 };
        if(constructing)constructionShape(group);else projectShape(group, selection.measureId, opacity);
        if(justCompleted&&!reducedMotion&&!props.paused) {
          const dust=new THREE.Group(),dustMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7,depthWrite:false});
          for(let i=0;i<5;i++){const puff=new THREE.Mesh(geometry('dust',()=>new THREE.IcosahedronGeometry(1,0)),dustMaterial);const angle=i*Math.PI*2/5;puff.position.set(Math.cos(angle)*.45,.35,Math.sin(angle)*.35);puff.scale.set(.25,.18,.25);dust.add(puff);}
          group.add(dust);group.userData.dust=dust;
        }
        if((props.highlightKeys??[]).includes(`${selection.measureId}:${selection.districtId??'*'}`)){
          const ring=new THREE.Mesh(geometry('change-ring',()=>new THREE.RingGeometry(.76,.86,36)),new THREE.MeshBasicMaterial({color:props.mode==='a'?COLORS.safety:COLORS.green,transparent:true,opacity:.75*opacity,depthWrite:false,depthTest:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.19;ring.renderOrder=3;group.add(ring);
        }
        scene.add(group); upgrades.push(group);
      }
    }
    animationStart = performance.now();
    queueReactions();
  }
  function clearReactions(){ reactions.forEach(reaction=>reaction.element.remove());reactions=[]; }
  function queueReactions(){
    clearReactions();
    if(props.mode!=='after'||!props.result?.valid||(props.replay&&props.replay.quarter<8))return;
    const plan=props.selections.map(item=>`${item.measureId}:${item.districtId??'*'}`).sort().join('|');
    if(plan===lastReactedPlan)return;
    const newKeys=new Set(props.selections.map(item=>`${item.measureId}:${item.districtId??'*'}`).filter(item=>!previousAppliedKeys.has(item)));
    lastReactedPlan=plan;previousAppliedKeys=new Set(props.selections.map(item=>`${item.measureId}:${item.districtId??'*'}`));
    if(props.paused||reducedMotion||!reactionsHost)return;
    for(const selection of props.selections){
      if(reactions.length>=4||!newKeys.has(`${selection.measureId}:${selection.districtId??'*'}`))continue;
      const contribution=props.result.contributions?.find(item=>item.measureId===selection.measureId);
      if(!contribution)continue;
      const effects=Object.entries(contribution.effects??{}).filter(([,value])=>value!==0).sort((a,b)=>a[1]<0?-1:b[1]<0?1:Math.abs(b[1])-Math.abs(a[1]));
      const effect=effects[0];if(!effect)continue;
      const group=upgrades.find(item=>item.userData.measureId===selection.measureId&&item.userData.districtId===(selection.districtId??props.districtId))??upgrades.find(item=>item.userData.measureId===selection.measureId);
      if(!group)continue;
      const people=ambient.filter(actor=>actor.kind==='person'&&actor.position);
      const person=people.reduce((nearest,actor)=>!nearest||actor.position.distanceToSquared(group.position)<nearest.position.distanceToSquared(group.position)?actor:nearest,null);
      const anchor=person&&person.position.distanceTo(group.position)<1.5?person.position.clone():group.position.clone();anchor.y=.9;
      const element=document.createElement('div');element.className=`city-reaction${effect[1]<0?' caution':''}`;element.setAttribute('aria-hidden','true');
      const icon=effect[1]<0?'⚠':effect[0].startsWith('E')?'🌿':effect[0].startsWith('S')?'♥':'🙂';
      element.textContent=`${icon} ${effect[1]>0?'+':''}${Number(effect[1].toFixed(2))} ${props.indicatorNames?.[effect[0]]??effect[0]}`;
      element.title='Illustrative reaction to this project’s computed effect before synergy; not measured resident sentiment.';reactionsHost.append(element);
      reactions.push({element,anchor,start:performance.now(),offset:reactions.length*9});
    }
  }
  function updateReactions(now){
    if(props.mode!=='after'||props.paused){clearReactions();return;}
    reactions=reactions.filter(reaction=>{const age=now-reaction.start;if(age>1800){reaction.element.remove();return false;}const point=reaction.anchor.clone().project(camera),x=(point.x+1)/2*canvasHost.clientWidth,y=(1-point.y)/2*canvasHost.clientHeight-12-Math.min(1,age/1800)*20-reaction.offset;reaction.element.style.left=`${x}px`;reaction.element.style.top=`${y}px`;reaction.element.style.opacity=age>1300?String((1800-age)/500):'1';reaction.element.hidden=x<60||x>canvasHost.clientWidth-60||y<62||y>canvasHost.clientHeight-45;return true;});
  }
  function updateSelection() {
    for (const district of districtRecords) {
      const active = district.id === props.districtId;
      const hovered = district.id === hoveredDistrictId;
      district.label?.classList.toggle('active', active);
      for (const outline of district.outlines) { outline.material.color.set(hovered ? 0x327857 : active ? 0x6b9975 : 0xc3cdbb); outline.material.opacity = active||hovered ? 1 : .8; }
      for (const mesh of district.meshes) mesh.material[0].color.set(hovered ? 0xd3e5c8 : active ? 0xdde8d1 : district.modeled ? COLORS.land : COLORS.outside);
    }
    if (!ready3d && geography) drawFallback();
  }
  function setHoveredDistrict(id,showLabel=false) {
    if(id!==hoveredDistrictId){hoveredDistrictId=id;updateSelection();onDistrictHover(id);}
    if(hoverLabel){const district=districtRecords.find(d=>d.id===id);hoverLabel.hidden=!district||!showLabel;if(district)hoverLabel.textContent=district.name+(district.modeled?'':' · Outside this scenario');}
  }
  function placeLabels() {
    if (!camera) return;
    const width = canvasHost.clientWidth, height = canvasHost.clientHeight;
    const occupied = [];
    const ordered = [...districtRecords].sort((a,b) => Number(b.id===props.districtId)-Number(a.id===props.districtId) || Number(b.modeled)-Number(a.modeled));
    for (const district of ordered) {
      const position = new THREE.Vector3(district.anchor[0], 1.65, -district.anchor[1]).project(camera);
      const x=(position.x+1)/2*width,y=(1-position.y)/2*height,labelWidth=district.modeled?Math.max(45,district.name.length*6+16):122,labelHeight=district.modeled?24:38;
      const rect={left:x-labelWidth/2,right:x+labelWidth/2,top:y-labelHeight/2,bottom:y+labelHeight/2};
      const hidden=rect.left<8||rect.right>width-8||rect.top<57||rect.bottom>height-36||occupied.some(other=>rect.left<other.right+5&&rect.right>other.left-5&&rect.top<other.bottom+5&&rect.bottom>other.top-5);
      district.label.hidden=hidden;
      if(!hidden){district.label.style.left=`${x}px`;district.label.style.top=`${y}px`;occupied.push(rect);}
    }
    for(const landmark of landmarkLabels){
      const point=new THREE.Vector3(...landmark.position).project(camera),x=(point.x+1)/2*width,y=(1-point.y)/2*height-20;
      const labelWidth=Math.min(180,landmark.element.textContent.length*6+20),rect={left:x-labelWidth/2,right:x+labelWidth/2,top:y-13,bottom:y+13};
      const hidden=camera.zoom<2||rect.left<8||rect.right>width-8||rect.top<65||rect.bottom>height-40||occupied.some(other=>rect.left<other.right+4&&rect.right>other.left-4&&rect.top<other.bottom+4&&rect.bottom>other.top-4);
      landmark.element.hidden=hidden;if(!hidden){landmark.element.style.left=`${x}px`;landmark.element.style.top=`${y}px`;occupied.push(rect);}
    }
    if(projectFocusLabel){const group=focusedProject&&upgrades.find(item=>item.userData.measureId===focusedProject.measureId&&item.userData.districtId===focusedProject.districtId);projectFocusLabel.hidden=!group;if(group){const point=group.position.clone().add(new THREE.Vector3(0,1.25,0)).project(camera),x=(point.x+1)/2*width,y=(1-point.y)/2*height;projectFocusLabel.textContent=`${props.measureNames?.[focusedProject.measureId]??focusedProject.measureId} · ${districtRecords.find(item=>item.id===focusedProject.districtId)?.name??''}`;projectFocusLabel.style.left=`${x}px`;projectFocusLabel.style.top=`${y}px`;projectFocusLabel.hidden=x<110||x>width-110||y<70||y>height-40;}}
  }
  function resize() {
    if (!renderer || !home) return;
    const width = Math.max(1,canvasHost.clientWidth), height = Math.max(1,canvasHost.clientHeight), aspect = width/height;
    const half = Math.max(home.planHeight * .60, home.planWidth / aspect * .57);
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix(); renderer.setSize(width,height,false); placeLabels();
  }
  function moveCamera(target, zoom, immediate = false) {
    if (!ready3d && !immediate) return;
    const offset = new THREE.Vector3(home.span*.85,home.span*1.02,home.span*.85);
    if (immediate || props.paused || reducedMotion) { controls.target.copy(target); camera.position.copy(target.clone().add(offset)); camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();focusTween=null;return; }
    focusTween={start:performance.now(),fromTarget:controls.target.clone(),toTarget:target.clone(),fromPosition:camera.position.clone(),toPosition:target.clone().add(offset),fromZoom:camera.zoom,toZoom:zoom};
  }
  function resetView(immediate = false) { focusedProject=null;if(home&&controls)moveCamera(home.center,1,immediate); }
  function focusDistrict(id) {
    focusedProject=null;
    const district=districtRecords.find((item)=>item.id===id);
    if(district&&ready3d)moveCamera(new THREE.Vector3(district.anchor[0],0,-district.anchor[1]),Math.min(3.3,Math.max(1.6,home.span/13)));
  }
  function focusLandmark(id){
    const anchor=cityDetails?.landmarkAnchors.find(item=>item.id===id);
    if(anchor&&ready3d){focusedProject=null;moveCamera(new THREE.Vector3(anchor.position[0],0,anchor.position[2]),5.6);}
  }
  function focusProject(measureId,districtId){
    if(!ready3d){onDistrictSelect(districtId??props.districtId);return;}
    const group=upgrades.find(item=>item.userData.measureId===measureId&&item.userData.districtId===(districtId??props.districtId))??upgrades.find(item=>item.userData.measureId===measureId);
    if(group&&ready3d){focusedProject={measureId,districtId:group.userData.districtId};moveCamera(group.position,Math.min(5.5,Math.max(3.5,home.span/8)));}
  }
  function tick(now) {
    if(disposed)return;
    const elapsed=previousFrame?Math.min(.05,(now-previousFrame)/1000):0;previousFrame=now;
    const moving=!props.paused&&!reducedMotion&&(!props.replay||props.replay.running);
    const speed=props.replay?.speed??1;
    if(moving){motionTime+=elapsed*speed;updatePopulation();}
    if(focusTween){const t=Math.min(1,(now-focusTween.start)/450),e=1-(1-t)**3;controls.target.lerpVectors(focusTween.fromTarget,focusTween.toTarget,e);camera.position.lerpVectors(focusTween.fromPosition,focusTween.toPosition,e);camera.zoom=focusTween.fromZoom+(focusTween.toZoom-focusTween.fromZoom)*e;camera.updateProjectionMatrix();if(t===1)focusTween=null;}
    for(const group of upgrades){
      if(reducedMotion)group.userData.reveal=1;
      else if(moving)group.userData.reveal=Math.min(1,group.userData.reveal+elapsed*speed/.7);
      const progress=group.userData.animate?group.userData.reveal:1;
      group.scale.y=.75*(.65+.35*(1-(1-progress)**3));
      if(group.userData.dust){group.userData.dust.visible=progress<1;group.userData.dust.scale.setScalar(1+progress);group.userData.dust.children[0].material.opacity=.7*(1-progress);}
    }
    controls.update();placeLabels();updateReactions(now);renderer.render(scene,camera);frame=requestAnimationFrame(tick);
  }
  function drawFallback() {
    clearReactions();canvasHost.hidden=true;labelsHost.hidden=true;fallbackHost.hidden=false;labelsHost.replaceChildren();fallbackHost.replaceChildren();
    const title=document.createElement('p');title.textContent='2D district view · all planning and calculations remain available';fallbackHost.append(title);
    if(!geography){const detail=document.createElement('p');detail.textContent='The geographic view is unavailable. Select a district using the controls below.';fallbackHost.append(detail);return;}
    const all=districtRecords.flatMap((district)=>district.polygons.flatMap((rings)=>rings[0])), xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
    const minX=Math.min(...xs),maxY=Math.max(...ys),span=Math.max(Math.max(...xs)-minX,maxY-Math.min(...ys));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 420 420');svg.setAttribute('role','img');svg.setAttribute('aria-label','Official Astana district outlines; use district buttons for keyboard selection.');
    for(const district of districtRecords){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',district.polygons.map(rings=>rings.map(ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${15+(x-minX)/span*390},${15+(maxY-y)/span*390}`).join(' ')+'Z').join(' ')).join(' '));path.setAttribute('fill-rule','evenodd');path.setAttribute('class',`fallback-district${district.id===props.districtId?' active':''}${district.modeled?'':' unmodeled'}`);const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=district.name+(district.modeled?'':' · Outside this scenario');path.append(title);if(district.modeled)path.addEventListener('click',()=>onDistrictSelect(district.id));svg.append(path);}
    fallbackHost.append(svg);
  }
  async function init() {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const resources=await Promise.allSettled([
        fetch('/api/geography',{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('Geographic backdrop is unavailable');return response.json();}),
        import('three'),import('/vendor/OrbitControls.js')
      ]);
      if(resources[0].status==='fulfilled'){geography=resources[0].value;preprocess();onCredit(geography.credit,geography.attributionUrl);}
      if(new URLSearchParams(location.search).get('view')==='2d'){drawFallback();return;}
      if(resources[0].status==='rejected'||resources[1].status==='rejected'||resources[2].status==='rejected')throw new Error('Map assets or 3D library unavailable');
      THREE=resources[1].value;({OrbitControls}=resources[2].value);
      scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-20,20,20,-20,.01,500);renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0xf2f5e9,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;canvasHost.append(renderer.domElement);
      controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.1;controls.minPolarAngle=Math.PI*.20;controls.maxPolarAngle=Math.PI*.37;controls.minZoom=.65;controls.maxZoom=6;controls.enablePan=true;controls.rotateSpeed=.5;controls.zoomSpeed=.8;controls.addEventListener('start',()=>{focusTween=null;});
      cityDetails=createCityDetails({THREE,geography,project,groundY:.146});scene.add(cityDetails.group);
      buildGeography();ready3d=true;raycaster=new THREE.Raycaster();
      let pointerStart,lastHoverTime=0;
      const districtAtPointer=event=>{
        const rect=renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
        const hit=raycaster.intersectObjects(districtRecords.flatMap(d=>d.meshes),false)[0];
        return districtRecords.find(d=>d.id===hit?.object.userData.districtId);
      };
      renderer.domElement.addEventListener('pointerdown',event=>{pointerStart=[event.clientX,event.clientY];});
      renderer.domElement.addEventListener('pointerup',event=>{const start=pointerStart;pointerStart=null;if(!start||Math.hypot(event.clientX-start[0],event.clientY-start[1])>5)return;const district=districtAtPointer(event);if(district?.modeled)onDistrictSelect(district.id);});
      renderer.domElement.addEventListener('pointermove',event=>{
        if(event.buttons){setHoveredDistrict(null);return;}
        if(performance.now()-lastHoverTime<50)return;lastHoverTime=performance.now();
        setHoveredDistrict(districtAtPointer(event)?.id??null,true);
        if(hoverLabel&&!hoverLabel.hidden){const rect=canvasHost.getBoundingClientRect();hoverLabel.style.left=`${Math.max(95,Math.min(rect.width-95,event.clientX-rect.left))}px`;hoverLabel.style.top=`${Math.max(65,event.clientY-rect.top-28)}px`;}
      });
      renderer.domElement.addEventListener('pointerleave',()=>{pointerStart=null;setHoveredDistrict(null);});
      renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();ready3d=false;cancelAnimationFrame(frame);drawFallback();});
      resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvasHost);resize();updateSelection();updateUpgrades();
      if(cityDetails.landmarkAnchors.length)focusLandmark('bayterek');else focusDistrict(props.districtId);
      frame=requestAnimationFrame(tick);
    } catch(error) { ready3d=false;console.warn('Using district fallback:',error.stack ?? error.message);drawFallback(); }
    finally {clearTimeout(timeout);loadingHost.hidden=true;}
  }
  const api={ready:null,update(next){props={...props,...next};if(typeof next.reducedMotion==='boolean')reducedMotion=next.reducedMotion;if(!MODES.has(props.mode))props.mode='draft';if(props.mode!=='after'||props.paused)clearReactions();if(reducedMotion&&focusTween){controls.target.copy(focusTween.toTarget);camera.position.copy(focusTween.toPosition);camera.zoom=focusTween.toZoom;camera.updateProjectionMatrix();focusTween=null;}updateSelection();updateUpgrades();},focusDistrict,focusProject,focusLandmark,resetView:()=>resetView(),dispose(){disposed=true;clearReactions();clearUpgrades();cityDetails?.dispose();cancelAnimationFrame(frame);resizeObserver?.disconnect();controls?.dispose();renderer?.dispose();materials.forEach(item=>item.dispose());geometries.forEach(item=>item.dispose());}};
  api.ready=init();return api;
}
