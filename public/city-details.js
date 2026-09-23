/**
 * Decorative mapped landmarks and parks for the Akim Lab city scene.
 * Positions and outlines come from the attributed offline geography (data/city-details.json via
 * /api/geography). Nothing here is scored or affects the simulation. Vertical forms are stylized to the
 * miniature scene; small real footprints are enlarged so they stay readable, and isReserved() covers the
 * enlarged rendered footprint as well as the mapped one.
 */
const TREE_CAP = 90;
const TREE_LANDMARK_CLEARANCE = 0.18; // km beyond a model's footprint, so crowns never overlap monuments
const TREE_WATER_CLEARANCE = 0.02; // km from mapped water edges, so trunks stay on land
const LANDMARK_SIZE = {
  // Minimum rendered footprint (km) and stylized height (scene units) per model.
  'bayterek': { minSize: 0.16, height: 1.45 },
  'khan-shatyr': { minSize: 0.46, height: 0.8 },
  'ak-orda': { minSize: 0.34, height: 0.72 },
  'peace-palace': { minSize: 0.40, height: 0.46 },
};

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
function insidePolygons(point, polygons) {
  return polygons.some((rings) => insideRing(point, rings[0]) && !rings.slice(1).some((hole) => insideRing(point, hole)));
}
function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function ringDistance(point, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) best = Math.min(best, segmentDistance(point, ring[i], ring[(i + 1) % ring.length]));
  return best;
}
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) { const a = ring[i], b = ring[(i + 1) % ring.length]; sum += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(sum) / 2;
}
function bounds(polygons, pad = 0) {
  const points = polygons.flat(2);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
}
function seededRandom(text) {
  let seed = [...String(text)].reduce((value, char) => ((value * 31 + char.charCodeAt(0)) >>> 0), 11);
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function createCityDetails({ THREE, geography, project, groundY = 0.16 }) {
  if (!THREE || typeof project !== 'function') throw new Error('createCityDetails needs THREE and a project([lon, lat]) function.');
  const group = new THREE.Group();
  group.name = 'city-details';
  const ownedGeometries = new Set(), ownedMaterials = new Set();
  const own = (item, set) => { set.add(item); return item; };
  const material = (color, options = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04, ...options }), ownedMaterials);
  const shared = {
    box: own(new THREE.BoxGeometry(1, 1, 1), ownedGeometries),
    cylinder: own(new THREE.CylinderGeometry(1, 1, 1, 16), ownedGeometries),
    taper: own(new THREE.CylinderGeometry(0.55, 1, 1, 12), ownedGeometries),
    sphere: own(new THREE.SphereGeometry(1, 24, 16), ownedGeometries),
    dome: own(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ownedGeometries),
    cone: own(new THREE.ConeGeometry(1, 1, 32), ownedGeometries),
    pyramid: own(new THREE.ConeGeometry(1, 1, 4), ownedGeometries),
    trunk: own(new THREE.CylinderGeometry(1, 1, 1, 6), ownedGeometries),
    crown: own(new THREE.IcosahedronGeometry(1, 0), ownedGeometries),
  };
  const colors = {
    white: material(0xf7f4ec), stone: material(0xe6dccb), gold: material(0xd8a73c, { metalness: 0.45, roughness: 0.35 }),
    blue: material(0x3f7fb5, { metalness: 0.2, roughness: 0.4 }), glass: material(0xb8d6d7, { metalness: 0.25, roughness: 0.25 }),
    tent: material(0xefe9dc, { transparent: true, opacity: 0.93 }), mast: material(0xd6d0c4),
    park: material(0xcfe2c1, { roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    trunk: material(0xb29c7e), crown: material(0x4b9562),
  };
  const outlineMaterial = own(new THREE.LineBasicMaterial({ color: 0x4b9562, transparent: true, opacity: 0.85 }), ownedMaterials);

  const place = (geometry, mat, [x, y, z], [sx, sy, sz], parent) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const rod = (parent, from, to, radius, mat) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(shared.cylinder, mat);
    mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
    mesh.scale.set(radius, direction.length(), radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = true; parent.add(mesh); return mesh;
  };

  // Landmark models, built around the local origin and placed at the mapped point.
  const builders = {
    'bayterek'(parent, size, height) {
      const y0 = 0;
      place(shared.cylinder, colors.stone, [0, y0 + 0.02, 0], [size * 0.45, 0.04, size * 0.45], parent);
      const trunkTop = height * 0.72;
      place(shared.taper, colors.white, [0, y0 + 0.04 + trunkTop / 2, 0], [0.028, trunkTop, 0.028], parent);
      const orbY = height - 0.075;
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2;
        rod(parent, [Math.cos(angle) * 0.022, trunkTop, Math.sin(angle) * 0.022], [Math.cos(angle) * 0.078, orbY + 0.03, Math.sin(angle) * 0.078], 0.006, colors.white);
      }
      place(shared.sphere, colors.gold, [0, orbY, 0], [0.066, 0.066, 0.066], parent);
      return { top: height + 0.02 };
    },
    'khan-shatyr'(parent, size, height, extent) {
      const sx = Math.max(extent.width, size) / 2, sz = Math.max(extent.depth, size * 0.92) / 2, tentHeight = height * 0.84;
      const tent = place(shared.cone, colors.tent, [0, tentHeight / 2, 0], [sx, tentHeight, sz], parent);
      tent.rotation.z = 0.07;
      rod(parent, [tentHeight * Math.sin(0.07) * -0.5, tentHeight - 0.02, 0], [-0.04, height, 0], 0.008, colors.mast);
      place(shared.cylinder, colors.stone, [0, 0.01, 0], [sx * 1.05, 0.02, sz * 1.05], parent);
      return { top: height + 0.02 };
    },
    'ak-orda'(parent, size, height) {
      const w = size, d = size * 0.8, blockHeight = height * 0.46;
      place(shared.box, colors.stone, [0, 0.015, 0], [w, 0.03, d], parent);
      place(shared.box, colors.white, [0, 0.03 + blockHeight / 2, 0], [w * 0.72, blockHeight, d * 0.62], parent);
      place(shared.box, colors.white, [0, 0.03 + blockHeight * 0.35, 0], [w * 0.95, blockHeight * 0.7, d * 0.4], parent);
      const drumY = 0.03 + blockHeight;
      place(shared.cylinder, colors.white, [0, drumY + 0.03, 0], [0.062, 0.06, 0.062], parent);
      place(shared.dome, colors.blue, [0, drumY + 0.06, 0], [0.075, 0.085, 0.075], parent);
      place(shared.cone, colors.gold, [0, drumY + 0.145 + (height - drumY - 0.145) / 2, 0], [0.012, height - drumY - 0.145, 0.012], parent);
      return { top: height + 0.02 };
    },
    'peace-palace'(parent, size, height) {
      place(shared.box, colors.stone, [0, 0.01, 0], [size, 0.02, size], parent);
      const body = place(shared.pyramid, colors.stone, [0, 0.02 + height * 0.42, 0], [size * 0.7, height * 0.84, size * 0.7], parent);
      body.rotation.y = Math.PI / 4;
      const apex = place(shared.pyramid, colors.glass, [0, 0.02 + height * 0.8, 0], [size * 0.19, height * 0.2, size * 0.19], parent);
      apex.rotation.y = Math.PI / 4;
      return { top: height + 0.02 };
    },
  };

  const zones = [], landmarkAnchors = [];
  for (const feature of geography?.landmarks?.features ?? []) {
    const props = feature.properties ?? {}, model = props.model, builder = builders[model];
    if (!builder || feature.geometry?.type !== 'Point') continue;
    const [east, north] = project(feature.geometry.coordinates);
    const footprint = polygonsOf(props.footprint).map((rings) => rings.map((ring) => ring.map(project)));
    const box = footprint.length ? bounds(footprint) : { minX: east, maxX: east, minY: north, maxY: north };
    const extent = { width: box.maxX - box.minX, depth: box.maxY - box.minY };
    const spec = LANDMARK_SIZE[model];
    const size = Math.max(spec.minSize, extent.width, extent.depth);
    const landmark = new THREE.Group();
    landmark.name = `landmark-${props.id ?? model}`;
    landmark.userData = { id: props.id ?? model, name: props.name ?? model, scored: false };
    const { top } = builder(landmark, size, spec.height, extent);
    landmark.position.set(east, groundY, -north);
    group.add(landmark);
    const renderRadius = model === 'khan-shatyr' ? Math.hypot(Math.max(extent.width, size), Math.max(extent.depth, size * 0.92)) / 2 * 1.05 : Math.hypot(size, size) / 2;
    zones.push({ kind: 'landmark', id: landmark.userData.id, polygons: footprint, center: [east, north], radius: renderRadius, ...bounds(footprint.length ? footprint : [[[[east, north]]]], renderRadius) });
    landmarkAnchors.push({ id: landmark.userData.id, name: landmark.userData.name, position: [east, groundY + top, -north] });
  }

  const parks = [];
  for (const feature of geography?.parks?.features ?? []) {
    const polygons = polygonsOf(feature.geometry).map((rings) => rings.map((ring) => ring.map(project))).filter((rings) => rings[0]?.length >= 3);
    if (!polygons.length) continue;
    const id = feature.properties?.id ?? `park-${parks.length}`;
    const area = polygons.reduce((sum, rings) => sum + ringArea(rings[0]) - rings.slice(1).reduce((holes, hole) => holes + ringArea(hole), 0), 0);
    const park = { id, name: feature.properties?.name ?? id, polygons, area, ...bounds(polygons) };
    parks.push(park);
    zones.push({ kind: 'park', id, polygons, center: null, radius: 0, ...bounds(polygons) });
    for (const rings of polygons) {
      const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)));
      for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
      const ground = new THREE.Mesh(own(new THREE.ShapeGeometry(shape), ownedGeometries), colors.park);
      ground.rotation.x = -Math.PI / 2; ground.position.y = groundY + 0.004; ground.receiveShadow = true;
      ground.name = `park-${id}`; ground.userData = { id, name: park.name, scored: false };
      group.add(ground);
      for (const ring of rings) {
        const points = ring.map(([x, y]) => new THREE.Vector3(x, groundY + 0.008, -y));
        group.add(new THREE.LineLoop(own(new THREE.BufferGeometry().setFromPoints(points), ownedGeometries), outlineMaterial));
      }
    }
  }

  const insideLandmark = (point, margin) => zones.some((zone) => zone.kind === 'landmark' && (insidePolygons(point, zone.polygons) || Math.hypot(point[0] - zone.center[0], point[1] - zone.center[1]) <= zone.radius + margin));
  // Mapped water near the parks (rivers, ponds); trees must not stand in it.
  const water = [];
  for (const feature of geography?.water?.features ?? []) {
    for (const rings of polygonsOf(feature.geometry)) {
      const projected = rings.map((ring) => ring.map(project)).filter((ring) => ring.length >= 3);
      if (!projected.length) continue;
      const box = bounds([projected], TREE_WATER_CLEARANCE);
      if (parks.some((park) => box.maxX >= park.minX && box.minX <= park.maxX && box.maxY >= park.minY && box.minY <= park.maxY)) water.push({ polygons: [projected], ...box });
    }
  }
  const inWater = (point) => water.some((area) => point[0] >= area.minX && point[0] <= area.maxX && point[1] >= area.minY && point[1] <= area.maxY
    && (insidePolygons(point, area.polygons) || area.polygons[0].some((ring) => ringDistance(point, ring) < TREE_WATER_CLEARANCE)));
  const treeSpot = (point, park) => insidePolygons(point, park.polygons) && !insideLandmark(point, TREE_LANDMARK_CLEARANCE) && !inWater(point)
    && !park.polygons.some((rings) => rings.some((ring) => ringDistance(point, ring) < 0.03));
  const trees = [];
  let remaining = TREE_CAP, areaLeft = parks.reduce((sum, park) => sum + park.area, 0);
  const plant = (park, quota, seed) => {
    const random = seededRandom(seed);
    let placed = 0;
    for (let attempt = 0; placed < quota && attempt < quota * 80; attempt += 1) {
      const point = [park.minX + random() * (park.maxX - park.minX), park.minY + random() * (park.maxY - park.minY)];
      if (!treeSpot(point, park)) continue;
      trees.push({ x: point[0], z: -point[1], s: 0.55 + random() * 0.3 }); placed += 1;
    }
    return placed;
  };
  // Share the cap by park area; any quota a park cannot fill (water, monuments) moves to the next park, then a second pass.
  for (const park of parks) {
    const quota = Math.min(remaining, Math.round(remaining * park.area / (areaLeft || 1)));
    areaLeft -= park.area;
    remaining -= plant(park, quota, `${park.id}-trees`);
  }
  for (const park of parks) if (remaining > 0) remaining -= plant(park, remaining, `${park.id}-trees-extra`);
  if (trees.length) {
    const trunks = new THREE.InstancedMesh(shared.trunk, colors.trunk, trees.length);
    const crowns = new THREE.InstancedMesh(shared.crown, colors.crown, trees.length);
    const dummy = new THREE.Object3D();
    trees.forEach(({ x, z, s }, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, groundY + 0.13 * s, z); dummy.scale.set(0.035 * s, 0.26 * s, 0.035 * s); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, groundY + 0.04 + 0.43 * s, z); dummy.scale.set(0.23 * s, 0.37 * s, 0.23 * s); dummy.rotation.y = s * 7; dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = crowns.castShadow = true; trunks.name = 'park-tree-trunks'; crowns.name = 'park-tree-crowns';
    group.add(trunks, crowns);
  }

  function isReserved(point, clearance = 0) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
    const margin = Math.max(0, Number(clearance) || 0);
    for (const zone of zones) {
      if (point[0] < zone.minX - margin || point[0] > zone.maxX + margin || point[1] < zone.minY - margin || point[1] > zone.maxY + margin) continue;
      if (insidePolygons(point, zone.polygons)) return true;
      if (zone.center && Math.hypot(point[0] - zone.center[0], point[1] - zone.center[1]) <= zone.radius + margin) return true;
      if (margin > 0 && zone.polygons.some((rings) => rings.some((ring) => ringDistance(point, ring) <= margin))) return true;
    }
    return false;
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.traverse((item) => { if (item.isInstancedMesh) item.dispose(); });
    for (const item of ownedGeometries) item.dispose();
    for (const item of ownedMaterials) item.dispose();
    ownedGeometries.clear(); ownedMaterials.clear();
    group.removeFromParent();
    group.clear();
  }

  return { group, landmarkAnchors, isReserved, dispose, treeCount: trees.length };
}
