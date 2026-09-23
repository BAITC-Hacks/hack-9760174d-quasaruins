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
  // Minimum rendered footprint (km) and stylized height (scene units). Generic city buildings are 0.3-1.55 tall,
  // so landmarks are deliberately larger and taller to read clearly from the default camera.
  'bayterek': { minSize: 0.30, height: 2.3 },
  'khan-shatyr': { minSize: 0.64, height: 1.5 },
  'ak-orda': { minSize: 0.58, height: 1.2 },
  'peace-palace': { minSize: 0.62, height: 0.74 },
  'hazret-sultan': { minSize: 0.58, height: 1.25 },
  'grand-mosque': { minSize: 0.66, height: 1.4 },
  'nur-alem': { minSize: 0.52, height: 1.05 },
  'kazakh-eli': { minSize: 0.32, height: 1.95 },
  'astana-opera': { minSize: 0.58, height: 0.8 },
  'concert-hall': { minSize: 0.62, height: 0.85 },
  'astana-arena': { minSize: 0.82, height: 0.46 },
  'abu-dhabi-plaza': { minSize: 0.46, height: 2.6 },
  'national-museum': { minSize: 0.58, height: 1.15 },
  'mangilik-el-arch': { minSize: 0.42, height: 1.0 },
  'generic': { minSize: 0.3, height: 1.2 },
};

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
function linesOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
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
    torus: own(new THREE.TorusGeometry(1, 0.06, 8, 40), ownedGeometries),
    arch: own(new THREE.TorusGeometry(1, 0.16, 8, 24, Math.PI), ownedGeometries),
    octa: own(new THREE.CylinderGeometry(1, 1, 1, 8), ownedGeometries),
  };
  const colors = {
    white: material(0xf7f4ec), stone: material(0xe6dccb), gold: material(0xd8a73c, { metalness: 0.45, roughness: 0.35 }),
    blue: material(0x3f7fb5, { metalness: 0.2, roughness: 0.4 }), glass: material(0xb8d6d7, { metalness: 0.25, roughness: 0.25 }),
    tent: material(0xefe9dc, { transparent: true, opacity: 0.93 }), mast: material(0xd6d0c4),
    park: material(0xcfe2c1, { roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    trunk: material(0xb29c7e), crown: material(0x4b9562),
    turquoise: material(0x2f9fb3, { metalness: 0.25, roughness: 0.35 }), darkGlass: material(0x5d7f8f, { metalness: 0.35, roughness: 0.25 }),
    field: material(0x8fc27a, { roughness: 1 }), deck: material(0xd9dfe0), stripe: material(0x1f6fb2), train: material(0xfbfbf7),
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

  // Landmark models, built around the local origin and placed at the mapped point. size = footprint (km), H = height.
  const ringAt = (parent, radius, y, mat, tube = 1, sx = 1, sz = 1) => {
    const ring = place(shared.torus, mat, [0, y, 0], [radius * sx, radius * sz, radius * tube], parent);
    ring.rotation.x = Math.PI / 2; return ring;
  };
  const minaret = (parent, x, z, H, cap = colors.gold) => {
    place(shared.octa, colors.white, [x, H * 0.42, z], [0.024, H * 0.84, 0.024], parent);
    ringAt(parent, 0.034, H * 0.62, colors.white, 1.2);
    place(shared.cone, cap, [x, H * 0.92, z], [0.028, H * 0.16, 0.028], parent);
  };
  const builders = {
    'bayterek'(parent, size, H) {
      place(shared.cylinder, colors.stone, [0, 0.025, 0], [size * 0.5, 0.05, size * 0.5], parent);
      ringAt(parent, size * 0.42, 0.055, colors.white, 1.5);
      const trunkTop = H * 0.62;
      place(shared.taper, colors.white, [0, 0.05 + trunkTop / 2, 0], [0.05, trunkTop, 0.05], parent);
      const orbY = H * 0.84, spread = 0.15;
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2, c = Math.cos(a), n = Math.sin(a);
        rod(parent, [c * 0.035, trunkTop, n * 0.035], [c * spread, orbY, n * spread], 0.007, colors.white);
        rod(parent, [c * spread, orbY, n * spread], [c * 0.02, H, n * 0.02], 0.006, colors.white);
      }
      ringAt(parent, spread * 0.8, H * 0.76, colors.white, 1.2);
      ringAt(parent, spread, orbY, colors.white, 1.2);
      place(shared.sphere, colors.gold, [0, orbY, 0], [0.12, 0.12, 0.12], parent);
      return { top: H + 0.03 };
    },
    'khan-shatyr'(parent, size, H, extent) {
      const sx = Math.max(extent.width, size) / 2, sz = Math.max(extent.depth, size * 0.92) / 2, tent = H * 0.86;
      place(shared.cylinder, colors.stone, [0, 0.015, 0], [sx * 1.06, 0.03, sz * 1.06], parent);
      const body = place(shared.cone, colors.tent, [0, tent / 2, 0], [sx, tent, sz], parent); body.rotation.z = 0.06;
      for (const f of [0.18, 0.38, 0.58, 0.76]) ringAt(parent, 1, tent * f, colors.mast, 0.3, sx * (1 - f) * 1.01, sz * (1 - f) * 1.01);
      rod(parent, [-tent * Math.sin(0.06) * 0.5, tent - 0.02, 0], [-0.06, H, 0], 0.012, colors.mast);
      place(shared.sphere, colors.gold, [-0.06, H, 0], [0.02, 0.02, 0.02], parent);
      return { top: H + 0.03 };
    },
    'ak-orda'(parent, size, H) {
      const w = size, d = size * 0.72, block = H * 0.4;
      place(shared.box, colors.stone, [0, 0.02, 0], [w, 0.04, d], parent);
      place(shared.box, colors.white, [0, 0.04 + block / 2, 0], [w * 0.62, block, d * 0.6], parent);
      for (const side of [-1, 1]) place(shared.box, colors.white, [side * w * 0.33, 0.04 + block * 0.36, 0], [w * 0.3, block * 0.72, d * 0.48], parent);
      for (let i = 0; i < 8; i += 1) place(shared.octa, colors.white, [(-0.35 + i * 0.1) * w * 0.62, 0.04 + block * 0.4, d * 0.33], [0.012, block * 0.8, 0.012], parent);
      place(shared.box, colors.white, [0, 0.04 + block * 0.83, d * 0.33], [w * 0.5, block * 0.07, 0.03], parent);
      const drumY = 0.04 + block;
      place(shared.cylinder, colors.white, [0, drumY + 0.05, 0], [0.11, 0.1, 0.11], parent);
      ringAt(parent, 0.115, drumY + 0.1, colors.gold, 1);
      place(shared.dome, colors.blue, [0, drumY + 0.1, 0], [0.13, 0.15, 0.13], parent);
      const spireBase = drumY + 0.25;
      place(shared.cone, colors.gold, [0, spireBase + (H - spireBase) / 2, 0], [0.018, H - spireBase, 0.018], parent);
      place(shared.sphere, colors.gold, [0, spireBase + 0.02, 0], [0.03, 0.03, 0.03], parent);
      return { top: H + 0.03 };
    },
    'peace-palace'(parent, size, H) {
      place(shared.box, colors.stone, [0, 0.015, 0], [size, 0.03, size], parent);
      const body = place(shared.pyramid, colors.stone, [0, 0.03 + H * 0.4, 0], [size * 0.7, H * 0.8, size * 0.7], parent); body.rotation.y = Math.PI / 4;
      const apex = place(shared.pyramid, colors.glass, [0, 0.03 + H * 0.82, 0], [size * 0.2, H * 0.24, size * 0.2], parent); apex.rotation.y = Math.PI / 4;
      for (const f of [0.25, 0.5]) { const band = place(shared.pyramid, colors.glass, [0, 0.03 + H * f, 0], [size * 0.7 * (1 - f) + 0.004, 0.012, size * 0.7 * (1 - f) + 0.004], parent); band.rotation.y = Math.PI / 4; }
      return { top: H + 0.03 };
    },
    'hazret-sultan'(parent, size, H) {
      const w = size * 0.62, block = H * 0.3;
      place(shared.box, colors.stone, [0, 0.015, 0], [size, 0.03, size], parent);
      place(shared.box, colors.white, [0, 0.03 + block / 2, 0], [w, block, w], parent);
      place(shared.octa, colors.white, [0, 0.03 + block + 0.05, 0], [w * 0.36, 0.1, w * 0.36], parent);
      place(shared.dome, colors.turquoise, [0, 0.03 + block + 0.1, 0], [w * 0.36, w * 0.42, w * 0.36], parent);
      place(shared.cone, colors.gold, [0, 0.03 + block + 0.1 + w * 0.42 + 0.05, 0], [0.015, 0.1, 0.015], parent);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        minaret(parent, x * size * 0.42, z * size * 0.42, H);
        place(shared.dome, colors.turquoise, [x * w * 0.32, 0.03 + block, z * w * 0.32], [0.05, 0.06, 0.05], parent);
      }
      return { top: H + 0.03 };
    },
    'grand-mosque'(parent, size, H) {
      const w = size * 0.6, block = H * 0.24;
      place(shared.box, colors.stone, [0, 0.015, 0], [size, 0.03, size * 0.9], parent);
      place(shared.box, colors.white, [0, 0.03 + block / 2, 0], [w, block, w], parent);
      place(shared.dome, colors.blue, [0, 0.03 + block, 0], [w * 0.42, w * 0.5, w * 0.42], parent);
      ringAt(parent, w * 0.42, 0.03 + block + 0.01, colors.gold, 1);
      place(shared.cone, colors.gold, [0, 0.03 + block + w * 0.5 + 0.06, 0], [0.018, 0.12, 0.018], parent);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) minaret(parent, x * size * 0.44, z * size * 0.4, H);
      return { top: H + 0.03 };
    },
    'nur-alem'(parent, size, H) {
      const r = Math.min(size * 0.45, H * 0.4);
      place(shared.cylinder, colors.stone, [0, 0.03, 0], [size * 0.55, 0.06, size * 0.55], parent);
      place(shared.cylinder, colors.darkGlass, [0, 0.06 + 0.06, 0], [r * 0.45, 0.12, r * 0.45], parent);
      place(shared.sphere, colors.glass, [0, H - r, 0], [r, r, r], parent);
      for (const f of [-0.5, 0, 0.5]) ringAt(parent, r * Math.sqrt(1 - f * f) * 1.01, H - r + f * r, colors.white, 0.6);
      const meridian = place(shared.torus, colors.white, [0, H - r, 0], [r * 1.01, r * 1.01, r * 0.6], parent); meridian.rotation.y = Math.PI / 4;
      return { top: H + 0.03 };
    },
    'kazakh-eli'(parent, size, H) {
      place(shared.box, colors.stone, [0, 0.02, 0], [size, 0.04, size], parent);
      place(shared.box, colors.white, [0, 0.07, 0], [size * 0.6, 0.06, size * 0.6], parent);
      place(shared.octa, colors.white, [0, 0.1 + H * 0.38, 0], [0.04, H * 0.76, 0.04], parent);
      const birdY = 0.1 + H * 0.78;
      place(shared.sphere, colors.gold, [0, birdY, 0], [0.05, 0.035, 0.035], parent);
      for (const side of [-1, 1]) { const wing = place(shared.box, colors.gold, [side * 0.08, birdY + 0.04, 0], [0.13, 0.012, 0.05], parent); wing.rotation.z = side * 0.5; }
      return { top: H + 0.03 };
    },
    'astana-opera'(parent, size, H) {
      const w = size * 0.8, d = size * 0.6, block = H * 0.55;
      place(shared.box, colors.stone, [0, 0.02, 0], [size, 0.04, size * 0.8], parent);
      place(shared.box, colors.white, [0, 0.04 + block / 2, -d * 0.08], [w, block, d * 0.8], parent);
      for (let i = 0; i < 8; i += 1) place(shared.octa, colors.white, [(-0.42 + i * 0.12) * w, 0.04 + block * 0.4, d * 0.36], [0.014, block * 0.8, 0.014], parent);
      const roof = place(shared.pyramid, colors.stone, [0, 0.04 + block * 0.9, d * 0.36], [w * 0.52, block * 0.25, 0.05], parent); roof.rotation.y = Math.PI / 4;
      place(shared.dome, colors.darkGlass, [0, 0.04 + block, -d * 0.08], [w * 0.2, H - block - 0.1, w * 0.2], parent);
      place(shared.sphere, colors.gold, [0, H - 0.04, -d * 0.08], [0.025, 0.025, 0.025], parent);
      return { top: H + 0.03 };
    },
    'concert-hall'(parent, size, H) {
      place(shared.cylinder, colors.white, [0, 0.03, 0], [size * 0.5, 0.06, size * 0.5], parent);
      for (let i = 0; i < 7; i += 1) {
        const a = -0.9 + i * 0.3, h = H * (0.55 + 0.45 * Math.sin((i / 6) * Math.PI));
        const petal = place(shared.box, colors.turquoise, [Math.sin(a) * size * 0.18, 0.06 + h / 2, Math.cos(a) * size * 0.18], [0.07, h, size * 0.34], parent);
        petal.rotation.y = a; petal.rotation.x = -0.12;
      }
      return { top: H + 0.03 };
    },
    'astana-arena'(parent, size, H) {
      const sx = size * 0.5, sz = size * 0.4;
      place(shared.cylinder, colors.field, [0, 0.02, 0], [sx * 0.7, 0.04, sz * 0.62], parent);
      for (let i = 0; i < 4; i += 1) ringAt(parent, 1, 0.06 + i * H * 0.2, colors.white, 2.2, sx * (0.9 + i * 0.03), sz * (0.9 + i * 0.03));
      ringAt(parent, 1, H, colors.darkGlass, 3.4, sx, sz);
      return { top: H + 0.05 };
    },
    'abu-dhabi-plaza'(parent, size, H) {
      place(shared.box, colors.stone, [0, 0.05, 0], [size, 0.1, size * 0.8], parent);
      const towers = [[0, 0, H], [-size * 0.28, size * 0.18, H * 0.62], [size * 0.28, -size * 0.14, H * 0.5], [size * 0.25, size * 0.22, H * 0.38]];
      for (const [x, z, h] of towers) {
        place(shared.box, colors.darkGlass, [x, 0.1 + (h - 0.1) / 2, z], [0.12, h - 0.1, 0.12], parent);
        place(shared.box, colors.white, [x, h - 0.02, z], [0.13, 0.04, 0.13], parent);
      }
      place(shared.cone, colors.white, [0, H + 0.08, 0], [0.03, 0.16, 0.03], parent);
      return { top: H + 0.2 };
    },
    'national-museum'(parent, size, H) {
      place(shared.box, colors.stone, [0, 0.02, 0], [size, 0.04, size * 0.7], parent);
      for (let i = 0; i < 4; i += 1) place(shared.box, colors.turquoise, [(-0.3 + i * 0.2) * size, 0.04 + H * 0.12, 0], [size * 0.18, H * 0.24, size * 0.5], parent);
      place(shared.box, colors.white, [size * 0.36, 0.04 + H * 0.36, 0], [0.12, H * 0.72, 0.12], parent);
      place(shared.dome, colors.turquoise, [size * 0.36, 0.04 + H * 0.72, 0], [0.08, 0.1, 0.08], parent);
      place(shared.cone, colors.gold, [size * 0.36, H - 0.04, 0], [0.012, 0.1, 0.012], parent);
      return { top: H + 0.03 };
    },
    'mangilik-el-arch'(parent, size, H) {
      place(shared.box, colors.stone, [0, 0.015, 0], [size, 0.03, size * 0.4], parent);
      for (const side of [-1, 1]) place(shared.box, colors.white, [side * size * 0.32, 0.03 + H * 0.38, 0], [size * 0.18, H * 0.76, size * 0.22], parent);
      place(shared.box, colors.white, [0, 0.03 + H * 0.84, 0], [size * 0.86, H * 0.18, size * 0.24], parent);
      place(shared.arch, colors.white, [0, 0.03 + H * 0.5, 0], [size * 0.23, size * 0.3, size * 0.5], parent);
      place(shared.box, colors.gold, [0, H - 0.01, 0], [size * 0.3, 0.03, size * 0.1], parent);
      return { top: H + 0.03 };
    },
    'generic'(parent, size, H) {
      place(shared.box, colors.stone, [0, 0.02, 0], [size, 0.04, size], parent);
      place(shared.octa, colors.white, [0, 0.04 + H * 0.45, 0], [size * 0.18, H * 0.9, size * 0.18], parent);
      place(shared.sphere, colors.gold, [0, H - 0.04, 0], [0.05, 0.05, 0.05], parent);
      return { top: H + 0.03 };
    },
  };

  const zones = [], landmarkAnchors = [];
  for (const feature of geography?.landmarks?.features ?? []) {
    const props = feature.properties ?? {}, model = builders[props.model] ? props.model : 'generic', builder = builders[model];
    if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue;
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

  // Astana LRT Line 1 (opened May 2026): real backdrop only, never scored. Elevated deck on piers, stations, one train.
  const stationAnchors = [], trainCars = [];
  const lrtLines = (geography?.lrt?.line?.features ?? []).flatMap((feature) => linesOf(feature.geometry))
    .map((line) => line.filter((c) => Array.isArray(c)).map(project)).filter((line) => line.length >= 2);
  const deckY = groundY + 0.26;
  const lineLength = (line) => line.reduce((sum, point, k) => (k ? sum + Math.hypot(point[0] - line[k - 1][0], point[1] - line[k - 1][1]) : 0), 0);
  let trainPath = null;
  if (lrtLines.length) {
    const segments = [], piers = [];
    for (const line of lrtLines) {
      let next = 0, travelled = 0;
      for (let k = 1; k < line.length; k += 1) {
        const a = line[k - 1], b = line[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-6) continue;
        segments.push({ a, b, len });
        while (next <= travelled + len) { const t = (next - travelled) / len; piers.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); next += 0.35; }
        travelled += len;
      }
    }
    const dummy = new THREE.Object3D();
    const deck = new THREE.InstancedMesh(shared.box, colors.deck, segments.length);
    const stripe = new THREE.InstancedMesh(shared.box, colors.stripe, segments.length);
    segments.forEach(({ a, b, len }, k) => {
      dummy.position.set((a[0] + b[0]) / 2, deckY, -(a[1] + b[1]) / 2); dummy.rotation.set(0, Math.atan2(b[1] - a[1], b[0] - a[0]), 0);
      dummy.scale.set(len + 0.006, 0.03, 0.075); dummy.updateMatrix(); deck.setMatrixAt(k, dummy.matrix);
      dummy.position.y = deckY + 0.018; dummy.scale.set(len + 0.006, 0.006, 0.02); dummy.updateMatrix(); stripe.setMatrixAt(k, dummy.matrix);
    });
    const pierMesh = new THREE.InstancedMesh(shared.octa, colors.deck, piers.length);
    piers.forEach(([x, y], k) => { dummy.rotation.set(0, 0, 0); dummy.position.set(x, groundY + (deckY - groundY) / 2, -y); dummy.scale.set(0.017, deckY - groundY, 0.017); dummy.updateMatrix(); pierMesh.setMatrixAt(k, dummy.matrix); });
    deck.name = 'lrt-deck'; stripe.name = 'lrt-stripe'; pierMesh.name = 'lrt-piers';
    deck.castShadow = pierMesh.castShadow = true; deck.receiveShadow = true;
    group.add(deck, stripe, pierMesh);
    zones.push({ kind: 'lrt', lines: lrtLines, halfWidth: 0.06, polygons: [], ...bounds([lrtLines], 0.06) });
    for (const feature of geography?.lrt?.stations?.features ?? []) {
      if (feature.geometry?.type !== 'Point') continue;
      const [x, y] = project(feature.geometry.coordinates);
      let nearest = segments[0], best = Infinity;
      for (const seg of segments) { const dist = segmentDistance([x, y], seg.a, seg.b); if (dist < best) { best = dist; nearest = seg; } }
      const station = new THREE.Group(); station.name = `lrt-station-${feature.properties?.id ?? stationAnchors.length}`;
      place(shared.box, colors.white, [0, deckY + 0.02, 0], [0.22, 0.025, 0.13], station);
      place(shared.box, colors.stripe, [0, deckY + 0.11, 0], [0.22, 0.012, 0.14], station);
      for (const [px, pz] of [[-0.1, -0.055], [0.1, -0.055], [-0.1, 0.055], [0.1, 0.055]]) place(shared.octa, colors.white, [px, deckY + 0.065, pz], [0.006, 0.09, 0.006], station);
      station.position.set(x, 0, -y); station.rotation.y = Math.atan2(nearest.b[1] - nearest.a[1], nearest.b[0] - nearest.a[0]);
      group.add(station);
      zones.push({ kind: 'station', polygons: [], center: [x, y], radius: 0.12, minX: x - 0.12, maxX: x + 0.12, minY: y - 0.12, maxY: y + 0.12 });
      stationAnchors.push({ id: feature.properties?.id ?? `station-${stationAnchors.length}`, name: feature.properties?.name ?? 'LRT station', position: [x, deckY + 0.18, -y] });
    }
    const line = lrtLines.reduce((best, item) => (lineLength(item) > lineLength(best) ? item : best));
    const cumulative = [0];
    for (let k = 1; k < line.length; k += 1) cumulative.push(cumulative[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
    trainPath = { line, cumulative, total: cumulative.at(-1) };
    for (let c = 0; c < 4; c += 1) {
      const car = new THREE.Group(); car.name = `lrt-car-${c}`;
      place(shared.box, colors.train, [0, deckY + 0.048, 0], [0.12, 0.05, 0.05], car);
      place(shared.box, colors.stripe, [0, deckY + 0.04, 0], [0.121, 0.012, 0.052], car);
      group.add(car); trainCars.push(car);
    }
  }
  function animate(seconds = 0) {
    if (!trainPath || !trainPath.total) return;
    const { line, cumulative, total } = trainPath, head = trainPath.total * 0.35 + seconds * 0.45;
    trainCars.forEach((car, c) => {
      const distance = (((head - c * 0.13) % total) + total) % total;
      let k = 1; while (k < cumulative.length - 1 && cumulative[k] < distance) k += 1;
      const a = line[k - 1], b = line[k], span = cumulative[k] - cumulative[k - 1] || 1, t = (distance - cumulative[k - 1]) / span;
      car.position.set(a[0] + (b[0] - a[0]) * t, 0, -(a[1] + (b[1] - a[1]) * t));
      car.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
    });
  }
  animate(0);

  function isReserved(point, clearance = 0) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
    const margin = Math.max(0, Number(clearance) || 0);
    for (const zone of zones) {
      if (point[0] < zone.minX - margin || point[0] > zone.maxX + margin || point[1] < zone.minY - margin || point[1] > zone.maxY + margin) continue;
      if (zone.kind === 'lrt') {
        if (zone.lines.some((line) => line.some((q, k) => k > 0 && segmentDistance(point, line[k - 1], q) <= zone.halfWidth + margin))) return true;
        continue;
      }
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

  return { group, landmarkAnchors, stationAnchors, isReserved, animate, dispose, treeCount: trees.length };
}
