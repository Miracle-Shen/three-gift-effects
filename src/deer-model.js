import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEER_HEIGHT = 3.58;
export const DEER_PIVOTS = [
  [0, 0, 0], [.62, 1.88, 0], [.43, 1.35, .18],
  [.35, 1.31, -.15], [-.48, 1.35, .16], [-.25, 1.3, -.15],
];

const randomGenerator = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
let cachedSurface = null;

// Sculpt one outside skin. Internal ellipsoid/capsule faces are never emitted.
// The upright neck, small rump and folded foreleg follow the supplied reference.
function sculptBody() {
  const resolution = 144;
  const bounds = new THREE.Box3(new THREE.Vector3(-1.27, -.10, -.55), new THREE.Vector3(1.29, 2.87, .55));
  const span = bounds.getSize(new THREE.Vector3()), primitives = [];
  const ellipsoid = (p, r, angle = 0, blend = .065) => {
    primitives.push({ p, r, cos: Math.cos(angle), sin: Math.sin(angle), blend });
  };
  const sweep = (points, radii, depth = 1, blend = .038) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const length = curve.getLength(), count = Math.ceil(length / .035);
    for (let i = 0; i <= count; i++) {
      const t = i / count, f = t * (radii.length - 1), j = Math.min(Math.floor(f), radii.length - 2);
      const r = THREE.MathUtils.lerp(radii[j], radii[j + 1], f - j);
      ellipsoid(curve.getPoint(t).toArray(), [r, r, r * depth], 0, blend);
    }
  };

  ellipsoid([-.20, 1.43, 0], [.53, .285, .235], -.03, .12);
  ellipsoid([-.48, 1.44, 0], [.255, .29, .245], -.24, .10);
  ellipsoid([.29, 1.48, 0], [.285, .33, .23], -.13, .13);
  sweep([[.41, 1.52, 0], [.50, 1.76, 0], [.54, 2.02, 0], [.62, 2.28, 0]], [.22, .16, .117, .11], 1, .072);
  ellipsoid([.69, 2.35, 0], [.225, .19, .137], -.40, .055);
  ellipsoid([.865, 2.255, 0], [.18, .112, .105], .42, .07);
  ellipsoid([1.004, 2.212, 0], [.093, .074, .089], .15, .045);
  ellipsoid([.367, 2.465, .115], [.245, .061, .065], .19, .04);
  ellipsoid([.403, 2.565, -.11], [.225, .052, .058], .40, .035);
  sweep([[-.65, 1.50, 0], [-.85, 1.61, .015], [-.96, 1.80, .02]], [.058, .035, .006], .7, .025);

  sweep([[.43, 1.37, .17], [.52, 1.16, .20], [.89, .98, .21], [.85, .80, .22], [.69, .67, .22]], [.125, .092, .062, .047, .049], .85, .047);
  ellipsoid([.65, .665, .22], [.08, .045, .043], .15, .024);
  sweep([[.35, 1.30, -.14], [.37, .95, -.15], [.40, .65, -.16], [.58, .16, -.18], [.72, .044, -.18]], [.092, .060, .045, .035, .06], .9, .033);
  sweep([[-.50, 1.35, .17], [-.49, 1.09, .18], [-.69, .82, .18], [-.55, .44, .17], [-.34, .15, .16], [-.23, .085, .16]], [.142, .096, .062, .045, .034, .06], .90, .046);
  sweep([[-.27, 1.27, -.16], [-.11, 1.02, -.17], [-.32, .77, -.18], [-.12, .40, -.19], [.07, .21, -.19]], [.107, .079, .055, .036, .055], .9, .032);

  const material = new THREE.MeshBasicMaterial();
  const iso = new MarchingCubes(resolution, material, false, false, 90000);
  iso.isolation = 0;
  iso.field.fill(-10);
  const steps = [span.x / resolution, span.y / resolution, span.z / resolution];
  const mins = bounds.min.toArray(), size2 = resolution * resolution;
  for (const primitive of primitives) {
    const { p, r, cos, sin, blend } = primitive;
    const reach = [Math.abs(cos * r[0]) + Math.abs(sin * r[1]), Math.abs(sin * r[0]) + Math.abs(cos * r[1]), r[2]];
    const low = reach.map((v, j) => Math.max(1, Math.floor((p[j] - v - blend * 2 - mins[j]) / steps[j])));
    const high = reach.map((v, j) => Math.min(resolution - 2, Math.ceil((p[j] + v + blend * 2 - mins[j]) / steps[j])));
    for (let z = low[2]; z <= high[2]; z++) for (let y = low[1]; y <= high[1]; y++) for (let x = low[0]; x <= high[0]; x++) {
      const dx = mins[0] + x * steps[0] - p[0], dy = mins[1] + y * steps[1] - p[1], dz = mins[2] + z * steps[2] - p[2];
      const qx = (dx * cos + dy * sin) / r[0], qy = (-dx * sin + dy * cos) / r[1], qz = dz / r[2];
      const k0 = Math.hypot(qx, qy, qz), k1 = Math.hypot(qx / r[0], qy / r[1], qz / r[2]);
      const value = k1 > 1e-8 ? -(k0 * (k0 - 1) / k1) : Math.min(...r);
      const index = x + y * resolution + z * size2, old = iso.field[index];
      const h = Math.max(blend - Math.abs(value - old), 0) / blend;
      iso.field[index] = Math.max(value, old) + h * h * blend * .25;
    }
  }
  iso.update();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(iso.positionArray.slice(0, iso.count * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(iso.normalArray.slice(0, iso.count * 3), 3));
  geometry.scale(span.x / 2, span.y / 2, span.z / 2);
  geometry.translate(bounds.min.x + span.x / 2, bounds.min.y + span.y / 2, bounds.min.z + span.z / 2);
  const bone = new Float32Array(iso.count), blend = new Float32Array(iso.count);
  for (let i = 0; i < iso.count; i++) {
    const x = geometry.attributes.position.getX(i), y = geometry.attributes.position.getY(i), z = geometry.attributes.position.getZ(i);
    if (y > 1.85) { bone[i] = 1; blend[i] = smooth(y, 1.85, 2.27); }
    else if (y < 1.3) {
      bone[i] = x > .2 ? (z > .04 ? 2 : 3) : (z > .02 ? 4 : 5);
      blend[i] = 1 - smooth(y, 1.0, 1.32);
    }
  }
  geometry.setAttribute('aBone', new THREE.BufferAttribute(bone, 1));
  geometry.setAttribute('aBoneMix', new THREE.BufferAttribute(blend, 1));
  iso.geometry.dispose(); material.dispose();
  return geometry;
}

function antlers() {
  const pieces = [];
  const branch = (nodes, baseRadius = .024) => {
    const curve = new THREE.CatmullRomCurve3(nodes.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const steps = Math.max(12, Math.ceil(curve.getLength() * 50)), rings = 7;
    const frames = curve.computeFrenetFrames(steps, false), p = [], indices = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = curve.getPointAt(t), radius = baseRadius * Math.pow(1 - t, .65) + .0018;
      for (let j = 0; j < rings; j++) {
        const angle = j / rings * Math.PI * 2;
        const v = center.clone().addScaledVector(frames.normals[i], Math.cos(angle) * radius).addScaledVector(frames.binormals[i], Math.sin(angle) * radius);
        p.push(v.x, v.y, v.z);
        if (i < steps) { const a = i * rings + j, b = i * rings + (j + 1) % rings; indices.push(a, b, a + rings, b, b + rings, a + rings); }
      }
    }
    let g = new THREE.BufferGeometry();g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));g.setIndex(indices);g.computeVertexNormals();
    const indexed = g;g = indexed.toNonIndexed();indexed.dispose();
    g.setAttribute('aBone', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    g.setAttribute('aBoneMix', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    pieces.push(g);
  };
  // Two asymmetric swept antlers, not repeated straight ladder rungs.
  branch([[.63, 2.48, -.08], [.76, 2.75, -.16], [.91, 3.08, -.18], [1.04, 3.30, -.20], [1.00, 3.54, -.20]], .030);
  branch([[.81, 2.85, -.16], [1.10, 3.06, -.18], [1.21, 3.24, -.20], [1.16, 3.37, -.21]], .019);
  branch([[.89, 3.05, -.17], [.75, 3.21, -.16], [.80, 3.40, -.17]], .014);
  branch([[1.04, 3.31, -.2], [1.16, 3.46, -.22], [1.13, 3.58, -.23]], .012);
  branch([[.72, 2.68, -.13], [.97, 2.82, -.12], [1.05, 2.97, -.12]], .017);
  branch([[.53, 2.48, .09], [.27, 2.74, .15], [-.03, 2.96, .17], [-.31, 3.15, .16], [-.40, 3.35, .18], [-.38, 3.57, .19]], .032);
  branch([[.29, 2.73, .15], [.25, 2.97, .17], [.31, 3.16, .17]], .021);
  branch([[-.02, 2.95, .17], [-.04, 3.20, .15], [.04, 3.39, .14], [.03, 3.53, .14]], .021);
  branch([[-.27, 3.13, .17], [-.49, 3.22, .16], [-.61, 3.38, .16]], .017);
  branch([[-.37, 3.36, .18], [-.56, 3.45, .18], [-.58, 3.57, .18]], .013);
  return pieces;
}

function restSurface() {
  if (cachedSurface) return cachedSurface;
  const parts = [sculptBody(), ...antlers()];
  const geometry = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  geometry.normalizeNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  cachedSurface = geometry;
  return geometry;
}

export function createDeerGeometry(count) {
  const surface = restSurface().clone(), pos = surface.attributes.position, normal = surface.attributes.normal;
  const bone = surface.attributes.aBone, boneMix = surface.attributes.aBoneMix, random = randomGenerator(731209);
  const weights = new Float64Array(pos.count / 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < weights.length; i++) {
    a.fromBufferAttribute(pos, i * 3);b.fromBufferAttribute(pos, i * 3 + 1);c.fromBufferAttribute(pos, i * 3 + 2);
    const antler = (a.y + b.y + c.y) / 3 > 2.7;
    area += b.sub(a).cross(c.sub(a)).length() * .5 * (antler ? 1.30 : 1);
    weights[i] = area;
  }
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), bones = new Float32Array(count), blends = new Float32Array(count), data = new Float32Array(count * 4);
  const cell = Math.sqrt(area / count) * .70, cells = new Map(), sample = new THREE.Vector3(), n = new THREE.Vector3();
  const key = (x, y, z) => `${x},${y},${z}`;
  let accepted = 0, attempts = 0;
  while (accepted < count) {
    attempts++;
    const pick = random() * area;let lo = 0, hi = weights.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1;if (weights[mid] < pick) lo = mid + 1;else hi = mid; }
    const base = lo * 3, s = Math.sqrt(random()), t = random(), bary = [1 - s, s * (1 - t), s * t];
    sample.set(0, 0, 0);n.set(0, 0, 0);
    for (let j = 0; j < 3; j++) { sample.addScaledVector(a.fromBufferAttribute(pos, base + j), bary[j]);n.addScaledVector(a.fromBufferAttribute(normal, base + j), bary[j]); }
    const gx = Math.floor(sample.x / cell), gy = Math.floor(sample.y / cell), gz = Math.floor(sample.z / cell);
    const minDistance = cell * (attempts > count * 40 ? .35 : .85);let crowded = false;
    for (let z = -1; z <= 1 && !crowded; z++) for (let y = -1; y <= 1 && !crowded; y++) for (let x = -1; x <= 1 && !crowded; x++) {
      for (const point of cells.get(key(gx + x, gy + y, gz + z)) || []) if (point.distanceToSquared(sample) < minDistance * minDistance) { crowded = true;break; }
    }
    if (crowded) continue;
    const cellKey = key(gx, gy, gz);if (!cells.has(cellKey)) cells.set(cellKey, []);cells.get(cellKey).push(sample.clone());
    sample.toArray(positions, accepted * 3);n.normalize().toArray(normals, accepted * 3);
    bones[accepted] = bone.getX(base);blends[accepted] = bary.reduce((v, w, j) => v + w * boneMix.getX(base + j), 0);
    data.set([random(), random(), random(), random()], accepted * 4);accepted++;
  }
  const particles = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position', positions, 3], ['normal', normals, 3], ['aBone', bones, 1], ['aBoneMix', blends, 1], ['aData', data, 4]]) particles.setAttribute(name, new THREE.BufferAttribute(array, size));
  particles.computeBoundingBox();particles.computeBoundingSphere();
  return { surface, particles };
}
