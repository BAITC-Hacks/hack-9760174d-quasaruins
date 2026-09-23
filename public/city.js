/** Geographic presentation only. All policy effects and scores come from the shared evaluator. */
import { createCityDetails } from './city-details.js?v=20260923-polish1249';
import { makeTrack, sampleTrack } from './city-motion.js';
import { createProjectEffects } from './city-project-effects.js?v=20260923-final1220';
import { BASELINE } from '../shared/simulation.js';
// One shared horizontal scale keeps every geographic layer aligned. Model sizes
// and parcel clearances remain world-space dimensions, rather than doubling.
const MAP_SCALE = 2;
const COLORS = { land: 0xffffff, side: 0xffffff, outside: 0xffffff, water: 0x379ebd, road: 0x7e8c91, building: 0xf3f1e9, roof: 0x526976, glass: 0x295570, green: 0x24784f, mint: 0xedf7ee, transport: 0x187e94, social: 0x8a73b8, safety: 0xb37a25, services: 0x436c8d };
const FACADES = [0xf4f3ed,0xe9e5d9,0xd9d0c2,0xf8f9f5,0xbc785c,0x657a86];
const SERVICE_TYPES = [
  {id:'school',name:'School',indicator:'S1',color:0x8a73b8},
  {id:'clinic',name:'Clinic',indicator:'S2',color:0x8a73b8},
  {id:'safety',name:'Safety post',indicator:'B1',color:0xb37a25},
  {id:'utilities',name:'Utilities',indicator:'C1',color:0x587ea0},
  {id:'civic',name:'Service centre',indicator:'C2',color:0x587ea0},
  {id:'transit',name:'Transit stop',indicator:'T2',color:0x238a9a},
];
const PROJECT_SERVICE = {M1:'transit',M2:'transit',M3:'transit',M5:'utilities',M7:'school',M8:'clinic',M10:'safety',M11:'safety',M12:'civic',M13:'utilities',M14:'utilities'};
const SERVICE_SCALE = .6;
const SMALL_SERVICE_SCALE = .38;
// Completion bursts: one pale icon per project, no metric text.
const PROJECT_ICONS = {M1:'🚌',M2:'🚦',M3:'🚊',M4:'🌳',M5:'🍃',M6:'🌱',M7:'🏫',M8:'🏥',M9:'⚽',M10:'💡',M11:'🚸',M12:'📱',M13:'💧',M14:'🛠️'};
const PROJECT_TINTS = {transport:'#dff1f4',ecology:'#e3f3e4',social:'#eee8f6',safety:'#f8efdd',services:'#e6edf4'};
const COMPACT_PROJECTS = new Set(['M4','M6','M9']);
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
function segmentDistanceSquared(point,a,b) { const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0;return (point[0]-a[0]-t*dx)**2+(point[1]-a[1]-t*dy)**2; }
function nearRing(point,ring,radiusSquared) { return ring.some((a,i)=>segmentDistanceSquared(point,a,ring[(i+1)%ring.length])<radiusSquared); }
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
  let focusedProject = null, projectFocusLabel, hoveredDistrictId = null, hoverLabel, cityDetails = null, landmarkLabels = [], projectEffects = null, fitZoom = null, lastViewport = '';
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const materials = new Map(), geometries = new Map(), projectSites = new Map(), serviceSites = new Map(), baselineServices = [], neighborhoodServices = [], architecture = [];
  let serviceSignature = '';
  let interactionLocked = false;
  const roadCells=new Map();
  const clearOfRoad=(point,radius)=>(roadCells.get(`${Math.floor(point[0])}:${Math.floor(point[1])}`)??[]).every(([a,b])=>segmentDistanceSquared(point,a,b)>radius*radius);
  let projectHighlight = null, highlightRings = [];
  const geometry = (id, factory) => { if (!geometries.has(id)) geometries.set(id, factory()); return geometries.get(id); };
  const material = (color, opacity = 1) => {
    const id = `${color}:${opacity}`;
    if (!materials.has(id)) materials.set(id, new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: .03, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
    return materials.get(id);
  };
  const landAt = (point, district) => insidePolygons(point, district.polygons) && !waterAreas.some((area) => point[0] >= area.minX && point[0] <= area.maxX && point[1] >= area.minY && point[1] <= area.maxY && insidePolygons(point, [area.rings]));
  const buildableAt = (point, district, clearance = .24) => {
    // Checking only square corners misses narrow waterways through a parcel.
    // Keep its entire circumscribed footprint clear of every mapped boundary.
    const radius=clearance*Math.SQRT2,radiusSquared=radius*radius;
    if(!landAt(point,district)||cityDetails?.isReserved(point,radius))return false;
    const polygon=district.polygons.find(rings=>insideRing(point,rings[0])&&!rings.slice(1).some(ring=>insideRing(point,ring)));
    if(!polygon||polygon.some(ring=>nearRing(point,ring,radiusSquared)))return false;
    return !waterAreas.some(area=>point[0]>=area.minX-radius&&point[0]<=area.maxX+radius&&point[1]>=area.minY-radius&&point[1]<=area.maxY+radius&&area.rings.some(ring=>nearRing(point,ring,radiusSquared)));
  };

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
    project = ([x, y]) => [(x - lon) * 111.32 * Math.cos(lat * Math.PI / 180) * MAP_SCALE, (y - lat) * 111.32 * MAP_SCALE];
    districtRecords = geography.districts.features.map((feature) => {
      const polygons = polygonCoordinates(feature.geometry).map((rings) => usablePolygon(rings.map((ring) => ring.map(project)))).filter(Boolean);
      const points = polygons.flatMap((rings) => rings[0]);
      const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
      return { ...feature.properties, polygons, meshes: [], outlines: [], buildings: [], candidates: [], bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } };
    });
    waterPolygons = geography.water.features.flatMap((feature) => polygonCoordinates(feature.geometry).map((rings) => usablePolygon(rings.map((ring) => ring.map(project)))).filter(Boolean));
    waterAreas = waterPolygons.map((rings) => ({ rings, minX: Math.min(...rings[0].map(p=>p[0])), maxX: Math.max(...rings[0].map(p=>p[0])), minY: Math.min(...rings[0].map(p=>p[1])), maxY: Math.max(...rings[0].map(p=>p[1])) }));
    roads = geography.roads.features.flatMap((feature) => lineCoordinates(feature.geometry).map((line) => line.map(project))).filter((line) => line.length > 1);
    // Spatial road index keeps dense building footprints off the source corridors.
    roadCells.clear();
    for(const line of roads)for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i];
      for(let x=Math.floor(Math.min(a[0],b[0])-.4);x<=Math.floor(Math.max(a[0],b[0])+.4);x++)for(let y=Math.floor(Math.min(a[1],b[1])-.4);y<=Math.floor(Math.max(a[1],b[1])+.4);y++){
        const key=`${x}:${y}`;if(!roadCells.has(key))roadCells.set(key,[]);roadCells.get(key).push([a,b]);
      }
    }
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
        const top = new THREE.MeshBasicMaterial({ color: district.modeled ? COLORS.land : COLORS.outside, toneMapped:false });
        const mesh = new THREE.Mesh(geometry, [top, new THREE.MeshBasicMaterial({color:COLORS.side,toneMapped:false})]); mesh.receiveShadow = true; mesh.userData.districtId = district.id; scene.add(mesh); district.meshes.push(mesh);
        const shadow=new THREE.Mesh(geometry,new THREE.ShadowMaterial({color:0x536068,opacity:.14,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));shadow.position.y=.001;shadow.receiveShadow=true;scene.add(shadow);
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
    // A large unlit white ground matches the canvas all the way to the horizon.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000,2000), new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false})); ground.rotation.x=-Math.PI/2;ground.position.set(center.x,-.05,center.z);scene.add(ground);
    const ambient = new THREE.HemisphereLight(0xffffff,0x9daeb8,1.6);scene.add(ambient);
    const lightSpan=Math.max(size.x,size.z),sun=new THREE.DirectionalLight(0xffffff,2.15);
    sun.position.set(center.x-lightSpan*.4,Math.max(45,lightSpan*.7),center.z+lightSpan*.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-size.x;sun.shadow.camera.right=size.x;sun.shadow.camera.top=size.z;sun.shadow.camera.bottom=-size.z;sun.shadow.camera.far=lightSpan*3+100;sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(sun);sun.target.position.copy(center);scene.add(sun.target);
    home = { center, span: Math.max(size.x, size.z) * .96, planWidth: (size.x + size.z) * Math.SQRT1_2, planHeight: (size.x + size.z) * .5 + 2 };
    buildBaselineServices();
    buildNeighborhoodServices();
    buildArchitecture();
    // Visible per-project scenery (roads, trees, greening, trains) from codex-A's module. It keeps off mapped
    // landmarks, parks, LRT, every service/project parcel and (inside the module) every building footprint.
    const parcelReserved=(point,clearance=0)=>Boolean(cityDetails?.isReserved(point,clearance))||[...projectSites.values()].some(site=>Math.hypot(site[0]-point[0],site[1]-point[1])<.75+clearance)||neighborhoodServices.some(item=>Math.hypot(item.site[0]-point[0],item.site[1]-point[1])<.45+clearance);
    projectEffects=createProjectEffects({THREE,roads,districts:districtRecords,architecture,landAt,isReserved:parcelReserved,getProjectSite:(districtId,measureId)=>{const record=districtRecords.find(item=>item.id===districtId);return record?projectSite(record,measureId):null;},groundY:.18});
    scene.add(projectEffects.group);
    buildPopulation();
    resetView(true);
  }
  function instanceParts(name, parts) {
    const buckets=new Map();
    for(const part of parts){const key=part.geometry.uuid;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(part);}
    for(const batch of buckets.values()){
      const mesh=new THREE.InstancedMesh(batch[0].geometry,material(0xffffff),batch.length);mesh.name=name;
      batch.forEach((part,i)=>{mesh.setMatrixAt(i,part.matrix);mesh.setColorAt(i,part.color);});
      mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
    }
  }
  function buildNeighborhoodServices() {
    const parts=[];
    // Small illustrative existing services around the labelled ones: three schools and three clinics per
    // district plus one of each other type. Sarayshyk gets them too as a visual backdrop; none are scored
    // or upgraded, and their parcels stay small so the city remains dense.
    for(const district of districtRecords){
      const random=rng(hash(`${district.id}-small-services`));
      const pool=district.candidates.filter(p=>Math.hypot(p[0]-district.anchor[0],p[1]-district.anchor[1])<9*MAP_SCALE);
      const candidates=pool.length?pool:district.candidates;
      if(!candidates.length)continue;
      for(const type of SERVICE_TYPES){
        const count=type.id==='school'||type.id==='clinic'?3:1;
        for(let placed=0,tries=0;placed<count&&tries<180;tries++){
          const base=candidates[Math.floor(random()*candidates.length)],site=[base[0]+(random()-.5)*.7,base[1]+(random()-.5)*.7];
          if(!buildableAt(site,district,.34)||[...projectSites.values()].some(p=>Math.hypot(p[0]-site[0],p[1]-site[1])<1.15)||neighborhoodServices.some(item=>Math.hypot(item.site[0]-site[0],item.site[1]-site[1])<.95))continue;
          placed++;
          const group=new THREE.Group(),scale=SMALL_SERVICE_SCALE;
          group.position.set(site[0],.16*(1-scale),-site[1]);group.scale.setScalar(scale);baselineShape(group,type.id);group.updateMatrixWorld(true);
          neighborhoodServices.push({district,type,site,bounds:new THREE.Box3().setFromObject(group)});
          group.traverse(part=>{if(part.isMesh)parts.push({geometry:part.geometry,matrix:part.matrixWorld.clone(),color:part.material.color.clone()});});
        }
      }
    }
    instanceParts('Existing neighborhood services',parts);
  }
  function buildArchitecture() {
    const bodies=[],details=[],trees=[];
    const dummy=new THREE.Object3D(),boxGeometry=geometry('box',()=>new THREE.BoxGeometry(1,1,1));
    const part=(target,x,y,z,w,h,d,color)=>{
      dummy.position.set(x,y+h/2,z);dummy.scale.set(w,h,d);dummy.updateMatrix();
      target.push({geometry:boxGeometry,matrix:dummy.matrix.clone(),color:new THREE.Color(color)});
    };
    const reserved=point=>[...projectSites.values()].some(site=>Math.abs(site[0]-point[0])<1.2&&Math.abs(site[1]-point[1])<1.05)||neighborhoodServices.some(item=>Math.hypot(item.site[0]-point[0],item.site[1]-point[1])<.45);
    const landmarks=cityDetails?.landmarkAnchors??[];
    // Downtown around Bayterek: denser and taller there, lower towards the edges of the city.
    const core=landmarks.find(anchor=>anchor.id==='bayterek');
    const downtown=core?[core.position[0],-core.position[2]]:[home.center.x,-home.center.z];
    const centrality=point=>Math.max(0,1-Math.hypot(point[0]-downtown[0],point[1]-downtown[1])/(9*MAP_SCALE));
    for(const district of districtRecords){
      const random=rng(hash(`${district.id}-neighborhoods`));
      const urban=district.candidates.filter(p=>Math.hypot(p[0]-district.anchor[0],p[1]-district.anchor[1])<10*MAP_SCALE);
      const candidates=urban.length?urban:district.candidates;
      if(!candidates.length)continue;
      // Plain, small blocks packed densely around road samples: simple massing with a thin roof cap, no windows.
      const clusters=Array.from({length:60},(_,k)=>{const picks=Array.from({length:k%4===3?1:6},()=>candidates[Math.floor(random()*candidates.length)]);return picks.reduce((best,p)=>centrality(p)>centrality(best)?p:best);});
      for(let i=0;i<5200&&district.buildings.length<(district.modeled?680:220);i++){
        const cluster=i%clusters.length,base=clusters[cluster],slot=Math.floor(i/clusters.length);
        const step=.4-.12*centrality(base),point=[base[0]+(slot%6-2.5)*step+(random()-.5)*.06,base[1]+(Math.floor(slot/6)-2.5)*step+(random()-.5)*.06];
        const width=.15+random()*.13,depth=.14+random()*.14;
        if(!clearOfRoad(point,Math.hypot(width,depth)/2+.055)||!buildableAt(point,district,Math.max(width,depth)/2+.02)||reserved(point)||district.buildings.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<.33-.09*centrality(point)))continue;
        const landmarkDistance=landmarks.length?Math.min(...landmarks.map(anchor=>Math.hypot(point[0]-anchor.position[0],point[1]+anchor.position[2]))):99;
        const c=centrality(point),boost=.55+1.05*c**1.3;
        const tower=(cluster%7===0||(c>.55&&cluster%3===0))&&slot<4&&landmarkDistance>1.8;
        const height=landmarkDistance<1.4?.14+random()*.14:tower?(.65+random()*.45)*(.8+.4*c):(.2+random()*.34)*boost;
        const facade=FACADES[Math.floor(random()*FACADES.length)],x=point[0],z=-point[1];
        district.buildings.push(point);architecture.push({point,district,width,depth,height,tower});
        part(bodies,x,.16,z,width,height,depth,facade);
        part(details,x,.16+height,z,width*1.04,.03,depth*1.04,tower?0x3f5967:0x8a948f);
        if(i%4===0)trees.push({point:[x+.26,point[1]+.2],district});
      }
    }
    instanceParts('District architecture',bodies);instanceParts('Roof caps',details);
    const safeTrees=trees.filter(({point,district})=>buildableAt(point,district,.15)&&!reserved(point)&&!architecture.some(item=>Math.hypot(item.point[0]-point[0],item.point[1]-point[1])<.24)).slice(0,420);
    const trunks=new THREE.InstancedMesh(geometry('cylinder',()=>new THREE.CylinderGeometry(1,1,1,8)),material(0x7c6553),safeTrees.length),crowns=new THREE.InstancedMesh(geometry('tree',()=>new THREE.IcosahedronGeometry(1,0)),material(COLORS.green),safeTrees.length);
    safeTrees.forEach(({point:[x,north]},i)=>{dummy.position.set(x,.24,-north);dummy.scale.set(.022,.16,.022);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=.44;dummy.scale.set(.13,.21,.13);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);});crowns.castShadow=true;scene.add(trunks,crowns);
  }
  function buildPopulation() {
    const tracks = roads.map((road) => makeTrack(road.map(([x, y]) => [x, -y]))).filter((track) => track && track.length >= .35 && track.length <= 8*MAP_SCALE && track.vertices.some(([x,z]) => Math.hypot(x,z) < 9*MAP_SCALE));
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
    const serviceId=PROJECT_SERVICE[measureId];
    if(serviceId)return serviceSites.get(`${district.id}:${serviceId}`)??null;
    const key=`${district.id}:${measureId}`;
    if(projectSites.has(key))return projectSites.get(key);
    const compact=COMPACT_PROJECTS.has(measureId),clearance=compact?.45:.68;
    const available=point=>buildableAt(point,district,clearance)&&![...projectSites].some(([id,other])=>id.startsWith(district.id+':')&&Math.abs(other[0]-point[0])<(compact?1.25:1.6)&&Math.abs(other[1]-point[1])<(compact?1.1:1.4));
    const reserve=point=>{if(point)projectSites.set(key,point);return point;};
    const random = rng(hash(`${district.id}:${measureId}`));
    const options = district.candidates.filter((p) => Math.hypot(p[0] - district.anchor[0], p[1] - district.anchor[1]) < 4*MAP_SCALE);
    for (let i = 0; i < 120; i += 1) {
      const base = options.length ? options[Math.floor(random() * options.length)] : district.anchor;
      const candidate = [base[0] + (random() - .5) * .6, base[1] + (random() - .5) * .6];
      if (available(candidate)) return reserve(candidate);
    }
    // Never fall back to a site known to overlap a park, landmark or water.
    const nearRoad=district.candidates.find(available);
    if(nearRoad)return reserve(nearRoad);
    // Sparse road samples must not erase a district's existing services. Search
    // deterministic land candidates, still respecting every exclusion layer.
    for(let i=0;i<1200;i++){const point=[district.bounds.minX+random()*(district.bounds.maxX-district.bounds.minX),district.bounds.minY+random()*(district.bounds.maxY-district.bounds.minY)];if(available(point))return reserve(point);}
    return null;
  }
  function baselineShape(group, type) {
    const box=(x,z,w,h,d,color=COLORS.building,y=.17)=>meshBox(group,x,y,z,w,h,d,color);
    const pole=(x,z,h,color=COLORS.roof)=>cylinder(group,x,.17,z,.025,h,color);
    // These small parcels represent services, not surveyed individual buildings.
    box(0,0,1.85,.025,1.35,0xe9e6d8,.16);
    box(0,.59,1.85,.025,.16,0xd3d9cc,.19);
    const building=(color,height=.55)=>{
      box(-.4,-.1,.68,height,.55);box(-.4,-.1,.73,.065,.59,color,.17+height);
      box(-.4,.18,.46,.16,.022,COLORS.glass,.39);box(-.4,.21,.13,.25,.035,0xa6b9ac);
    };
    switch(type){
      case 'school':
        building(0xc0b2cd,.57);box(-.8,-.15,.15,.3,.45,0xe4d8c3);box(.25,.12,.43,.02,.4,0xc7d2b7,.20);
        pole(-.8,.3,.78);box(-.69,.3,.22,.13,.02,COLORS.social,.78);
        for(const x of [-.63,-.38,-.13])box(x,-.385,.12,.15,.02,COLORS.glass,.39);break;
      case 'clinic':
        building(0xbbcbd0,.64);box(-.4,.2,.25,.07,.03,0x7c9e9b,.61);box(-.4,.2,.07,.25,.033,0x7c9e9b,.52);
        box(-.4,.32,.54,.04,.25,COLORS.roof,.42);box(.27,-.18,.34,.22,.43,0xdadfd4);break;
      case 'safety':
        building(0xcbbf9c,.37);pole(.3,.05,.75);box(.38,.05,.23,.045,.11,0xc6cba9,.9);
        box(-.35,.52,.38,.02,.22,0xe4d9b8,.22);break;
      case 'utilities':
        building(0xb4c2bd,.47);cylinder(group,.19,.18,-.24,.18,.4,0xc4cec6);cylinder(group,.63,.18,-.24,.18,.4,0xc4cec6);
        box(.4,-.24,.62,.06,.1,0x829b9c,.61);box(-.64,-.22,.12,.64,.12,0xb2ada0);break;
      case 'civic':
        building(0xb8c7c9,.57);box(-.4,.3,.8,.06,.34,0xc9cfba,.64);
        for(const x of [-.73,-.08])pole(x,.4,.47,0xc2c6b5);
        box(.28,.13,.42,.045,.16,0xb7b3a1,.31);break;
      case 'transit':
        box(-.42,-.12,.86,.045,.44,0xa9c5c1,.76);pole(-.75,-.1,.58);pole(-.09,-.1,.58);
        box(-.4,-.29,.69,.43,.03,COLORS.glass,.29);box(-.42,-.06,.52,.065,.14,0xb4b5a5,.34);
        pole(-.82,.3,.78);box(-.82,.3,.17,.15,.04,0x709c96,.81);break;
    }
  }
  function buildBaselineServices() {
    for(const district of districtRecords.filter(item=>item.modeled)){
      for(const type of SERVICE_TYPES){
        const site=projectSite(district,`existing-${type.id}`);if(!site){console.warn(`No safe service parcel: ${district.id}/${type.id}`);continue;}
        serviceSites.set(`${district.id}:${type.id}`,site);
        const group=new THREE.Group();group.name=`Existing ${type.name} · ${district.name}`;group.position.set(site[0],.16*(1-SERVICE_SCALE),-site[1]);group.scale.setScalar(SERVICE_SCALE);
        group.userData={districtId:district.id,serviceId:type.id,illustrative:true,baseline:true};baselineShape(group,type.id);scene.add(group);
        const label=document.createElement('button');label.type='button';label.className='district-map-label service-map-label';label.dataset.service=type.id;label.dataset.district=district.id;label.style.background='#f8f8eff2';label.style.borderColor='#bfccc0';label.style.fontSize='10px';
        label.addEventListener('click',()=>{onDistrictSelect(district.id);moveCamera(group.position,5.5*MAP_SCALE);});labelsHost.append(label);
        baselineServices.push({group,site,district,type,label});
      }
      // Allocate standalone parks/greening deterministically before filler blocks.
      // Every plan then reuses the same parcels rather than moving existing sites.
      for(const id of ['M4','M6','M9'])projectSite(district,id);
    }
    updateServiceLabels();
  }
  function updateServiceLabels() {
    const completed=new Set(props.replay?.completedMeasureIds??[]);
    const signature=JSON.stringify([props.mode,props.replay?.quarter,props.selections,props.result?.districts?.map(d=>d.indicators)]);
    if(signature===serviceSignature)return;serviceSignature=signature;
    for(const service of baselineServices){
      const {type,district,label}=service;
      const projects=props.mode==='before'?[]:props.selections.filter(item=>PROJECT_SERVICE[item.measureId]===type.id&&(item.districtId===null||item.districtId===district.id));
      const applied=props.mode!=='draft'&&projects.some(item=>!props.replay||completed.has(item.measureId));
      const current=(props.result?.districts??BASELINE.districts).find(item=>item.id===district.id)?.indicators[type.indicator];
      const base=BASELINE.districts.find(item=>item.id===district.id)?.indicators[type.indicator];
      label.textContent=`${type.name}${applied?' +':''}`;
      label.title=`${district.name} · representative existing ${type.name.toLowerCase()}, illustrative location. ${props.indicatorNames?.[type.indicator]??type.indicator}: ${Number(current?.toFixed(2))}${current!==base?` (baseline ${base})`:''}. ${applied?'Project addition completed.':projects.length?'Project planned or under construction; existing service remains.':'Existing service at baseline.'}`;
      label.setAttribute('aria-label',`${type.name} in ${district.name}${applied?', project upgraded':', existing service'}`);
      label.style.borderColor=applied?'#78a981':'#bfccc0';label.style.background=applied?'#edf7e8f5':'#f8f8eff2';
    }
  }
  function serviceUpgradeShape(group, measureId, opacity) {
    if(!PROJECT_SERVICE[measureId]){projectShape(group,measureId,opacity);return;}
    const box=(x,z,w,h,d,color=COLORS.mint,y=.19)=>meshBox(group,x,y,z,w,h,d,color,opacity);
    const pole=(x,z,h,color=COLORS.roof)=>cylinder(group,x,.18,z,.025,h,color,opacity);
    const line=(points,color)=>lines(group,points.map(p=>new THREE.Vector3(...p)),color,opacity);
    const wing=(accent=COLORS.glass,height=.65)=>{box(.42,.02,.65,height,.66);box(.42,.02,.7,.075,.7,accent,.19+height);box(.42,.357,.44,.2,.025,COLORS.glass,.44);};
    switch(measureId){
      case 'M7': wing(COLORS.social,.78);box(.44,-.15,.42,.03,.29,COLORS.green,1.045);box(.39,.48,.52,.035,.15,0xb9d8a8);break;
      case 'M8': wing(COLORS.social,.7);box(.42,.37,.26,.07,.035,COLORS.social,.69);box(.42,.37,.07,.26,.035,COLORS.social,.6);break;
      case 'M5':box(-.41,-.1,.58,.055,.4,COLORS.green,.77);box(.49,.23,.45,.46,.45);box(.49,.23,.47,.065,.47,COLORS.green,.65);break;
      case 'M13':wing(COLORS.services,.46);line([[-.8,.24,.46],[.72,.24,.46],[.72,.24,-.5]],COLORS.services);box(.42,.05,.37,.21,.34,COLORS.glass,.72);break;
      case 'M12':wing(COLORS.services,.7);pole(.7,-.22,1.1,COLORS.services);line([[.58,1.19,-.22],[.69,1.09,-.22],[.88,1.36,-.22]],COLORS.green);break;
      case 'M14':{const van=new THREE.Group();van.position.set(.42,0,.58);van.scale.setScalar(.74);projectShape(van,'M14',opacity);group.add(van);break;}
      case 'M9':{const court=new THREE.Group();court.position.set(.46,.05,.1);court.scale.setScalar(.66);projectShape(court,'M9',opacity);group.add(court);break;}
      case 'M10':for(const x of [.22,.75]){pole(x,-.38,.96,COLORS.safety);box(x+.04,-.38,.2,.045,.08,0xe7c66a,1.12);box(x,-.33,.12,.075,.11,COLORS.safety,.91);}break;
      case 'M11':box(.3,.48,1.22,.025,.26,COLORS.road);for(let x=-.15;x<.9;x+=.2)box(x,.48,.08,.018,.23,0xfffff5,.23);box(.7,.22,.26,.08,.14,COLORS.safety);break;
      case 'M1':box(0,.62,1.8,.025,.22,COLORS.transport);wing(COLORS.transport,.28);box(.32,.62,.42,.18,.16,COLORS.mint,.24);break;
      case 'M2':for(const x of [.35,.8]){pole(x,.48,.86);box(x,.48,.1,.23,.09,COLORS.transport,.88);box(x,.533,.05,.05,.018,COLORS.green,.97);}break;
      case 'M3':box(0,.65,1.85,.075,.32,COLORS.glass,.5);for(const x of [-.72,.72])pole(x,.65,.35,COLORS.services);line([[-.92,.6,.57],[.92,.6,.57]],COLORS.transport);line([[-.92,.6,.74],[.92,.6,.74]],COLORS.transport);box(.24,.65,.64,.2,.2,COLORS.mint,.6);box(.24,.65,.58,.05,.22,COLORS.transport,.8);break;
    }
  }
  function constructionShape(group, measureId = '') {
    const cone=(x,z)=>{const mesh=new THREE.Mesh(geometry('cone',()=>new THREE.ConeGeometry(1,1,10)),material(0xe8793a));mesh.position.set(x,.23,z);mesh.scale.set(.05,.12,.05);mesh.castShadow=true;group.add(mesh);};
    if(['M1','M2','M3','M11'].includes(measureId)){
      // Road works: dug-up strip, striped barriers, cones and a small excavator.
      meshBox(group,0,.17,0,1.6,.03,.42,0xcbb89a);
      for(const x of [-.6,-.2,.2,.6])meshBox(group,x,.2,.26,.3,.07,.035,x%.4===0?0xf2f0e8:0xe8793a);
      for(const x of [-.75,-.35,.05,.45,.8])cone(x,-.28);
      meshBox(group,.45,.2,-.02,.34,.16,.22,0xe0a93b);meshBox(group,.36,.36,-.02,.16,.14,.18,0xe0a93b);
      lines(group,[new THREE.Vector3(.55,.4,-.02),new THREE.Vector3(.85,.62,-.02),new THREE.Vector3(1.02,.34,-.02)],0x6b5a3a);
      return;
    }
    if(['M4','M6','M9'].includes(measureId)){
      // Landscaping: soil beds, young saplings and a wheelbarrow.
      meshBox(group,0,.17,0,1.35,.035,1.05,0xb99b72);
      for(const [x,z] of [[-.45,-.3],[0,-.3],[.45,-.3],[-.45,.3],[0,.3],[.45,.3]]){cylinder(group,x,.2,z,.015,.22,0x7c6553);const leaf=new THREE.Mesh(geometry('sapling',()=>new THREE.IcosahedronGeometry(1,0)),material(0x7fbf6a));leaf.position.set(x,.46,z);leaf.scale.setScalar(.09);group.add(leaf);}
      meshBox(group,.65,.2,.02,.16,.08,.1,0x4f7c9a);cone(-.7,.05);
      return;
    }
    // Buildings: scaffold frame, crane and site fence.
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
    cone(-.7,.5);cone(.7,.5);
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
    if (props.mode === 'before') { updateServiceLabels(); return; }
    const opacity = props.mode === 'draft' ? .43 : 1;
    for (const selection of [...props.selections].sort((a,b)=>Number(a.measureId.slice(1))-Number(b.measureId.slice(1)))) {
      const targets = districtRecords.filter((district) => district.modeled && (selection.districtId === null || selection.districtId === district.id));
      for (const district of targets) {
        const group = new THREE.Group(), site = projectSite(district, selection.measureId);
        if(!site)continue;
        const constructing=Boolean(replay&&!completed.has(selection.measureId));
        const justCompleted=prior.get(`${selection.measureId}:${district.id}`)===true&&!constructing;
        const projectScale=COMPACT_PROJECTS.has(selection.measureId)?.42:SERVICE_SCALE;
        group.position.set(site[0], .16*(1-projectScale), -site[1]);
        group.scale.setScalar(projectScale);
        group.userData = { districtId: district.id, measureId: selection.measureId, constructing, scale:projectScale, animate:justCompleted||(!replay&&props.mode==='after'), reveal:props.paused||reducedMotion?1:0 };
        if(constructing){const extension=new THREE.Group();if(PROJECT_SERVICE[selection.measureId]){extension.position.set(.43,.055,.07);extension.scale.setScalar(.58);}constructionShape(extension,selection.measureId);group.add(extension);}else serviceUpgradeShape(group, selection.measureId, opacity);
        if(justCompleted&&!reducedMotion&&!props.paused) {
          const dust=new THREE.Group(),dustMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7,depthWrite:false});
          for(let i=0;i<5;i++){const puff=new THREE.Mesh(geometry('dust',()=>new THREE.IcosahedronGeometry(1,0)),dustMaterial);const angle=i*Math.PI*2/5;puff.position.set(Math.cos(angle)*.45,.35,Math.sin(angle)*.35);puff.scale.set(.25,.18,.25);dust.add(puff);}
          group.add(dust);group.userData.dust=dust;
          burstAt(group,selection.measureId);
        }
        if((props.highlightKeys??[]).includes(`${selection.measureId}:${selection.districtId??'*'}`)){
          const ring=new THREE.Mesh(geometry('change-ring',()=>new THREE.RingGeometry(.76,.86,36)),new THREE.MeshBasicMaterial({color:props.mode==='a'?COLORS.safety:COLORS.green,transparent:true,opacity:.75*opacity,depthWrite:false,depthTest:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.19;ring.renderOrder=3;group.add(ring);
        }
        scene.add(group); upgrades.push(group);
      }
    }
    animationStart = performance.now();
    updateServiceLabels();queueReactions();
  }
  function clearReactions(){ reactions.forEach(reaction=>reaction.element.remove());reactions=[]; }
  // Kept for the api.update path: completion bursts are created in updateUpgrades as each project completes.
  function queueReactions(){}
  function burstAt(group, measureId){
    if(!reactionsHost||props.paused||reducedMotion||reactions.length>24)return;
    const category=props.measureCategories?.[measureId]??({M1:'transport',M2:'transport',M3:'transport',M4:'ecology',M5:'ecology',M6:'ecology',M7:'social',M8:'social',M9:'social',M10:'safety',M11:'safety',M12:'services',M13:'services',M14:'services'})[measureId];
    const tint=PROJECT_TINTS[category]??'#eef4ee',anchor=group.position.clone();anchor.y=.9;
    const icons=[PROJECT_ICONS[measureId]??'✨',measureId==='M11'?'🚶':'🙂','✨'];
    icons.forEach((icon,i)=>{
      const element=document.createElement('div');element.className='city-burst';element.setAttribute('aria-hidden','true');element.textContent=icon;
      element.style.cssText=`position:absolute;transform:translate(-50%,-100%);pointer-events:none;line-height:1;border-radius:999px;${i===0?`font-size:22px;padding:5px 7px;background:${tint}e6;border:1px solid #ffffff;box-shadow:0 3px 12px #2b583118`:'font-size:12px;opacity:.9'}`;
      reactionsHost.append(element);
      reactions.push({element,anchor,start:performance.now()+i*90,offset:0,dx:i===0?0:(i===1?-26:26),burst:true});
    });
  }
  function updateReactions(now){
    if(props.mode!=='after'||props.paused){clearReactions();return;}
    reactions=reactions.filter(reaction=>{const age=Math.max(0,now-reaction.start);if(age>1800){reaction.element.remove();return false;}const point=reaction.anchor.clone().project(camera),x=(point.x+1)/2*canvasHost.clientWidth+(reaction.dx??0)*Math.min(1,age/500),y=(1-point.y)/2*canvasHost.clientHeight-12-Math.min(1,age/1800)*(reaction.burst?42:20)-reaction.offset;reaction.element.style.left=`${x}px`;reaction.element.style.top=`${y}px`;reaction.element.style.opacity=age>1300?String((1800-age)/500):'1';reaction.element.hidden=x<60||x>canvasHost.clientWidth-60||y<62||y>canvasHost.clientHeight-45;return true;});
  }
  function updateSelection() {
    for (const district of districtRecords) {
      const active = district.id === props.districtId;
      const hovered = district.id === hoveredDistrictId || Boolean(projectHighlight && (projectHighlight.districtId===null || projectHighlight.districtId===district.id) && district.modeled);
      district.label?.classList.toggle('active', active);
      for (const outline of district.outlines) { outline.material.color.set(hovered ? 0x24734e : active ? 0x78a38a : 0xc7d4cd); outline.material.opacity = hovered ? .72 : 0; }
      for (const mesh of district.meshes) mesh.material[0].color.set(hovered ? 0xeaf4ed : COLORS.land);
    }
    if (!ready3d && geography) drawFallback();
  }
  function highlightProject(measureId, districtId = null) {
    for(const ring of highlightRings){scene?.remove(ring);ring.material.dispose();}highlightRings=[];
    projectHighlight=measureId?{measureId,districtId}:null;updateSelection();
    if(!measureId||!ready3d)return;
    const type=PROJECT_SERVICE[measureId];
    for(const district of districtRecords.filter(item=>item.modeled&&(districtId===null||item.id===districtId))){
      const site=type?serviceSites.get(`${district.id}:${type}`):projectSite(district,measureId);if(!site)continue;
      const ring=new THREE.Mesh(geometry('project-hover-ring',()=>new THREE.RingGeometry(.91,1,40)),new THREE.MeshBasicMaterial({color:COLORS.green,transparent:true,opacity:.7,depthWrite:false,depthTest:false}));
      ring.rotation.x=-Math.PI/2;ring.position.set(site[0],.195,-site[1]);ring.renderOrder=4;scene.add(ring);highlightRings.push(ring);
    }
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
      const hidden=rect.left<8||rect.right>width-8||rect.top<(width<761?112:92)||rect.bottom>height-(width<761?(height<690?350:382):342)||occupied.some(other=>rect.left<other.right+5&&rect.right>other.left-5&&rect.top<other.bottom+5&&rect.bottom>other.top-5);
      district.label.hidden=hidden;
      if(!hidden){district.label.style.left=`${x}px`;district.label.style.top=`${y}px`;occupied.push(rect);}
    }
    for(const landmark of landmarkLabels){
      const point=new THREE.Vector3(...landmark.position).project(camera),x=(point.x+1)/2*width,y=(1-point.y)/2*height-20;
      const labelWidth=Math.min(180,landmark.element.textContent.length*6+20),rect={left:x-labelWidth/2,right:x+labelWidth/2,top:y-13,bottom:y+13};
      const hidden=true; // Mapped landmarks stay visible without persistent nameplates.
      landmark.element.hidden=hidden;if(!hidden){landmark.element.style.left=`${x}px`;landmark.element.style.top=`${y}px`;occupied.push(rect);}
    }
    for(const service of baselineServices){
      const point=service.group.position.clone().add(new THREE.Vector3(0,.85,0)).project(camera),x=(point.x+1)/2*width,y=(1-point.y)/2*height;
      const labelWidth=service.type.name.length*5.5+24,rect={left:x-labelWidth/2,right:x+labelWidth/2,top:y-11,bottom:y+11};
      const hidden=service.district.id!==props.districtId||camera.zoom<2.5||rect.left<10||rect.right>width-10||rect.top<96||rect.bottom>height-(width<761?(height<690?350:382):342)||occupied.some(other=>rect.left<other.right+4&&rect.right>other.left-4&&rect.top<other.bottom+4&&rect.bottom>other.top-4);
      service.label.hidden=hidden;if(!hidden){service.label.style.left=`${x}px`;service.label.style.top=`${y}px`;occupied.push(rect);}
    }
    if(projectFocusLabel){const group=focusedProject&&upgrades.find(item=>item.userData.measureId===focusedProject.measureId&&item.userData.districtId===focusedProject.districtId);projectFocusLabel.hidden=!group;if(group){const point=group.position.clone().add(new THREE.Vector3(0,1.25,0)).project(camera),x=(point.x+1)/2*width,y=(1-point.y)/2*height;projectFocusLabel.textContent=`${props.measureNames?.[focusedProject.measureId]??focusedProject.measureId} · ${districtRecords.find(item=>item.id===focusedProject.districtId)?.name??''}`;projectFocusLabel.style.left=`${x}px`;projectFocusLabel.style.top=`${y}px`;projectFocusLabel.hidden=x<110||x>width-110||y<70||y>height-40;}}
  }
  function resize() {
    if (!renderer || !home) return;
    const width = Math.max(1,canvasHost.clientWidth), height = Math.max(1,canvasHost.clientHeight), aspect = width/height;
    const viewportKey=`${width}:${height}`;if(lastViewport===viewportKey)return;lastViewport=viewportKey;
    const half = Math.max(home.planHeight * .60, home.planWidth / aspect * .57);
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
    const top=width<761?112:92,bottom=width<761?(height<690?350:382):342;
    // Frame the subject in the clear city area, above the physical card deck.
    camera.setViewOffset(width,height,0,(bottom-top)/2,width,height);
    const wasFitted=fitZoom!==null&&Math.abs(camera.zoom-fitZoom)<fitZoom*.04;
    const fit=fittedView();fitZoom=fit.zoom;controls.minZoom=fitZoom*.98;
    if(wasFitted&&!focusTween)moveCamera(fit.target,fit.zoom,true);else{camera.zoom=Math.max(camera.zoom,controls.minZoom);camera.updateProjectionMatrix();}
    renderer.setSize(width,height,false); placeLabels();
  }
  function moveCamera(target, zoom, immediate = false) {
    if (!ready3d && !immediate) return;
    const offset = new THREE.Vector3(home.span*.85,home.span*1.02,home.span*.85);
    if (immediate || props.paused || reducedMotion) { controls.target.copy(target); camera.position.copy(target.clone().add(offset)); camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();focusTween=null;return; }
    focusTween={start:performance.now(),fromTarget:controls.target.clone(),toTarget:target.clone(),fromPosition:camera.position.clone(),toPosition:target.clone().add(offset),fromZoom:camera.zoom,toZoom:zoom};
  }
  function fittedView() {
    const width=Math.max(1,canvasHost.clientWidth),height=Math.max(1,canvasHost.clientHeight),aspect=width/height;
    const top=width<761?112:92,bottom=width<761?(height<690?350:382):342;
    const half=Math.max(home.planHeight*.60,home.planWidth/aspect*.57);
    const preview=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.01,1000);
    preview.position.copy(home.center).add(new THREE.Vector3(home.span*.85,home.span*1.02,home.span*.85));preview.lookAt(home.center);preview.updateMatrixWorld();
    const bounds=new THREE.Box3().setFromPoints(districtRecords.flatMap(d=>d.polygons.flatMap(r=>r[0])).map(([x,north])=>new THREE.Vector3(x,0,-north).project(preview)));
    const size=bounds.getSize(new THREE.Vector3()),middle=bounds.getCenter(new THREE.Vector3());
    const right=new THREE.Vector3(1,0,0).applyQuaternion(preview.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(preview.quaternion);up.y=0;
    const target=home.center.clone().addScaledVector(right,middle.x*half*aspect).addScaledVector(up,middle.y*half/up.lengthSq());
    const zoom=Math.max(.2,Math.min((height-top-bottom)/height*2/size.y,(width-56)/width*2/size.x)*.94);
    return {target,zoom};
  }
  function resetView(immediate = false) {
    focusedProject=null;if(!home||!controls)return;
    const {target,zoom}=fittedView();fitZoom=zoom;controls.minZoom=zoom*.98;
    moveCamera(target,zoom,immediate);
  }
  function focusDistrict(id) {
    focusedProject=null;
    const district=districtRecords.find((item)=>item.id===id);
    if(district&&ready3d)moveCamera(new THREE.Vector3(district.anchor[0],0,-district.anchor[1]),Math.min(3.3,Math.max(1.6,home.span/(13*MAP_SCALE)))*1.5);
  }
  function focusLandmark(id){
    const anchor=cityDetails?.landmarkAnchors.find(item=>item.id===id);
    if(anchor&&ready3d){focusedProject=null;moveCamera(new THREE.Vector3(anchor.position[0],0,anchor.position[2]),5.6*MAP_SCALE);}
  }
  function focusProject(measureId,districtId){
    if(!ready3d){onDistrictSelect(districtId??props.districtId);return;}
    const group=upgrades.find(item=>item.userData.measureId===measureId&&item.userData.districtId===(districtId??props.districtId))??upgrades.find(item=>item.userData.measureId===measureId);
    if(group&&ready3d){focusedProject={measureId,districtId:group.userData.districtId};moveCamera(group.position,Math.min(5.5,Math.max(3.5,home.span/(8*MAP_SCALE)))*MAP_SCALE);}
  }
  // Card drag-and-drop support for the UI layer. Coordinates are CSS pixels relative to the canvas host.
  function districtAtClientPoint(clientX, clientY) {
    if (!ready3d || !raycaster || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom || !rect.width || !rect.height) return null;
    raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = raycaster.intersectObjects(districtRecords.flatMap((d) => d.meshes), false)[0];
    return hit?.object.userData.districtId ?? null; // includes unmodeled districts such as Sarayshyk
  }
  function getPlacementAnchors() {
    const result = { districts: {}, city: { x: 0, y: 0, visible: false } };
    if (!ready3d || !camera || !home) return result;
    const width = canvasHost.clientWidth, height = canvasHost.clientHeight;
    const top = width < 761 ? 112 : 92, bottom = width < 761 ? (height < 690 ? 350 : 382) : 342;
    const toScreen = (vector) => { const p = vector.clone().project(camera), x = (p.x + 1) / 2 * width, y = (1 - p.y) / 2 * height; return { x, y, visible: p.z > -1 && p.z < 1 && x >= 8 && x <= width - 8 && y >= top && y <= height - bottom }; };
    for (const district of districtRecords) result.districts[district.id] = toScreen(new THREE.Vector3(district.anchor[0], .2, -district.anchor[1]));
    result.city = toScreen(home.center.clone().setY(.2));
    return result;
  }
  function setInteractionLocked(locked) {
    interactionLocked = Boolean(locked);
    if (controls) controls.enabled = !interactionLocked;
    if (interactionLocked) setHoveredDistrict(null);
  }
  function tick(now) {
    if(disposed)return;
    const elapsed=previousFrame?Math.min(.05,(now-previousFrame)/1000):0;previousFrame=now;
    const moving=!props.paused&&!reducedMotion&&(!props.replay||props.replay.running);
    const speed=props.replay?.speed??1;
    if(moving){motionTime+=elapsed*speed;updatePopulation();}
    cityDetails?.update?.({timeSeconds:motionTime,motionEnabled:moving});
    projectEffects?.tick({timeSeconds:motionTime,motionEnabled:moving});
    if(focusTween){const t=Math.min(1,(now-focusTween.start)/450),e=1-(1-t)**3;controls.target.lerpVectors(focusTween.fromTarget,focusTween.toTarget,e);camera.position.lerpVectors(focusTween.fromPosition,focusTween.toPosition,e);camera.zoom=focusTween.fromZoom+(focusTween.toZoom-focusTween.fromZoom)*e;camera.updateProjectionMatrix();if(t===1)focusTween=null;}
    for(const group of upgrades){
      if(reducedMotion)group.userData.reveal=1;
      else if(moving)group.userData.reveal=Math.min(1,group.userData.reveal+elapsed*speed/.7);
      const progress=group.userData.animate?group.userData.reveal:1;
      group.scale.y=group.userData.scale*(.65+.35*(1-(1-progress)**3));
      if(group.userData.dust){group.userData.dust.visible=progress<1;group.userData.dust.scale.setScalar(1+progress);group.userData.dust.children[0].material.opacity=.7*(1-progress);}
    }
    if(home&&!focusTween){const limit=home.span*.62,t=controls.target,dx=Math.max(-limit,Math.min(limit,t.x-home.center.x))+home.center.x-t.x,dz=Math.max(-limit,Math.min(limit,t.z-home.center.z))+home.center.z-t.z;if(dx||dz){t.x+=dx;t.z+=dz;camera.position.x+=dx;camera.position.z+=dz;}}
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
        // Earlier builds cached this URL for an hour. Always request the current
        // artifact so a live demo reload receives newly integrated map layers.
        fetch('/api/geography',{signal:controller.signal,cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Geographic backdrop is unavailable');return response.json();}),
        import('three'),import('/vendor/OrbitControls.js')
      ]);
      if(resources[0].status==='fulfilled'){geography=resources[0].value;preprocess();onCredit(geography.credit,geography.attributionUrl);}
      if(new URLSearchParams(location.search).get('view')==='2d'){drawFallback();return;}
      if(resources[0].status==='rejected'||resources[1].status==='rejected'||resources[2].status==='rejected')throw new Error('Map assets or 3D library unavailable');
      THREE=resources[1].value;({OrbitControls}=resources[2].value);
      scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);camera=new THREE.OrthographicCamera(-20,20,20,-20,.01,1000);renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0xffffff,1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;canvasHost.append(renderer.domElement);
      controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.1;controls.minPolarAngle=Math.PI*.20;controls.maxPolarAngle=Math.PI*.37;controls.minZoom=.2;controls.maxZoom=6.5*MAP_SCALE;controls.enablePan=true;controls.screenSpacePanning=false;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE};controls.rotateSpeed=.5;controls.zoomSpeed=.8;controls.addEventListener('start',()=>{focusTween=null;});
      cityDetails=createCityDetails({THREE,geography,project,groundY:.146,modelScale:1});scene.add(cityDetails.group);
      buildGeography();ready3d=true;raycaster=new THREE.Raycaster();
      let pointerStart,lastHoverTime=0;
      const districtAtPointer=event=>districtRecords.find(d=>d.id===districtAtClientPoint(event.clientX,event.clientY));
      renderer.domElement.addEventListener('pointerdown',event=>{pointerStart=interactionLocked?null:[event.clientX,event.clientY];});
      renderer.domElement.addEventListener('pointerup',event=>{const start=pointerStart;pointerStart=null;if(interactionLocked||!start||Math.hypot(event.clientX-start[0],event.clientY-start[1])>5)return;const district=districtAtPointer(event);if(district?.modeled)onDistrictSelect(district.id);});
      renderer.domElement.addEventListener('pointermove',event=>{
        if(interactionLocked)return;
        if(event.buttons){setHoveredDistrict(null);return;}
        if(performance.now()-lastHoverTime<50)return;lastHoverTime=performance.now();
        setHoveredDistrict(districtAtPointer(event)?.id??null,true);
        if(hoverLabel&&!hoverLabel.hidden){const rect=canvasHost.getBoundingClientRect();hoverLabel.style.left=`${Math.max(95,Math.min(rect.width-95,event.clientX-rect.left))}px`;hoverLabel.style.top=`${Math.max(65,event.clientY-rect.top-28)}px`;}
      });
      renderer.domElement.addEventListener('pointerleave',()=>{pointerStart=null;setHoveredDistrict(null);});
      renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();ready3d=false;cancelAnimationFrame(frame);drawFallback();});
      resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvasHost);resize();updateSelection();updateUpgrades();projectEffects?.update(props);
      if(cityDetails.landmarkAnchors.length)focusLandmark('bayterek');else focusDistrict(props.districtId);
      frame=requestAnimationFrame(tick);
    } catch(error) { ready3d=false;console.warn('Using district fallback:',error.stack ?? error.message);drawFallback(); }
    finally {clearTimeout(timeout);loadingHost.hidden=true;}
  }
  const api={ready:null,update(next){props={...props,...next};if(typeof next.reducedMotion==='boolean')reducedMotion=next.reducedMotion;if(!MODES.has(props.mode))props.mode='draft';if(props.mode!=='after'||props.paused)clearReactions();if(reducedMotion&&focusTween){controls.target.copy(focusTween.toTarget);camera.position.copy(focusTween.toPosition);camera.zoom=focusTween.toZoom;camera.updateProjectionMatrix();focusTween=null;}updateSelection();updateUpgrades();projectEffects?.update(props);updateServiceLabels();},focusDistrict,focusProject,focusLandmark,highlightProject,districtAtClientPoint,getPlacementAnchors,setInteractionLocked,resetView:()=>resetView(),dispose(){disposed=true;highlightProject(null);clearReactions();clearUpgrades();baselineServices.forEach(service=>{service.label.remove();scene?.remove(service.group);});projectEffects?.dispose();cityDetails?.dispose();cancelAnimationFrame(frame);resizeObserver?.disconnect();controls?.dispose();renderer?.dispose();materials.forEach(item=>item.dispose());geometries.forEach(item=>item.dispose());}};
  api.ready=init();return api;
}
