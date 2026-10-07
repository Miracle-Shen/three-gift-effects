import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 确定性随机：同一个种子每次构建出完全一样的形态，便于回归对比。 */
export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** 低模鹿在「模型空间」里的体高。锚点里的 height / 这个值 = 缩放系数。 */
export const DEER_HEIGHT = 3.52;

/** 6 根骨骼的静置枢轴：[根, 颈, 左前腿, 右前腿, 左后腿, 右后腿]。 */
export const DEER_PIVOTS = [
  [0, 0, 0], [.53, 1.91, 0], [.44, 1.37, .19],
  [.40, 1.37, -.19], [-.60, 1.36, .20], [-.60, 1.36, -.20],
];

// Thin anatomical surfaces receive explicit sampling weights to preserve the
// ears, hooves and antler silhouette at every particle budget.
function deerParts() {
  const parts = [];
  const ellipsoid = (bone, p, s, angle = 0, weight = 1) => parts.push({ bone, p, s, angle, weight, type: 'ellipsoid' });
  const branch = (bone, a, b, r0, r1, weight = 1) => parts.push({ bone, a, b, r0, r1, weight, type: 'branch' });

  ellipsoid(0, [-.16, 1.48, 0], [.74, .34, .27]);
  ellipsoid(0, [-.62, 1.46, 0], [.32, .37, .29]);
  ellipsoid(0, [.40, 1.54, 0], [.32, .40, .29], -.16);
  ellipsoid(0, [.58, 1.87, 0], [.20, .46, .21], -.32);
  ellipsoid(1, [.76, 2.23, 0], [.25, .20, .16], -.24);
  ellipsoid(1, [1.00, 2.19, 0], [.21, .105, .115], -.08);
  ellipsoid(1, [1.16, 2.19, 0], [.06, .08, .10], 0, 1.3);
  ellipsoid(1, [.48, 2.39, .19], [.105, .25, .055], .57, 1.8);
  ellipsoid(1, [.57, 2.40, -.19], [.10, .24, .055], -.50, 1.8);
  ellipsoid(0, [-.99, 1.57, 0], [.22, .068, .072], -.44, 1.5);

  for (const side of [-1, 1]) {
    const z = side * .19, front = side > 0 ? 2 : 3, back = side > 0 ? 4 : 5, raised = side < 0;
    branch(front, [.44, 1.43, z], [.43, .82, z], .092, .045, 1.5);
    branch(front, [.43, .82, z], raised ? [.80, .48, z] : [.36, .14, z], .045, .026, 2);
    branch(front, raised ? [.80, .48, z] : [.36, .14, z], raised ? [.98, .43, z] : [.43, .045, z], .03, .048, 2);
    ellipsoid(front, raised ? [.98, .43, z] : [.44, .055, z], [.085, .053, .052], 0, 2);
    branch(back, [-.62, 1.42, z], [-.83, .88, z], .14, .066, 1.3);
    branch(back, [-.83, .88, z], [-.63, .52, z], .065, .032, 1.7);
    branch(back, [-.63, .52, z], [-.88, .08, z], .033, .025, 2);
    ellipsoid(back, [-.85, .055, z], [.085, .055, .052], 0, 2);

    const shift = side < 0 ? .08 : 0;
    const nodes = [
      [.65, 2.37, side * .12], [.61, 2.62, side * .23], [.36, 2.91, side * .32],
      [.12, 3.20, side * .40], [-.06, 3.49 - shift, side * .46],
    ];
    for (let i = 0; i < nodes.length - 1; i++) {
      branch(1, nodes[i], nodes[i + 1], .04 - i * .007, .03 - i * .007, 3.5);
    }
    for (const [a, b, c] of [
      [nodes[1], [.90, 2.80, side * .26], [1.01, 3.05 - shift, side * .29]],
      [nodes[2], [.68, 3.10, side * .37], [.79, 3.38 - shift, side * .40]],
      [nodes[3], [.39, 3.35, side * .49], [.43, 3.52 - shift, side * .52]],
      [nodes[2], [.14, 3.02, side * .56], [-.06, 3.19, side * .61]],
    ]) {
      branch(1, a, b, .024, .014, 3.7); branch(1, b, c, .014, .002, 4);
    }
    ellipsoid(1, [.875, 2.285, side * .151], [.024, .025, .012], 0, 6);
  }
  return parts;
}

function partGeometry(part) {
  let g;
  if (part.type === 'ellipsoid') {
    g = new THREE.SphereGeometry(1, 20, 12);
    g.scale(...part.s); g.rotateZ(part.angle); g.translate(...part.p);
  } else {
    const a = new THREE.Vector3(...part.a), b = new THREE.Vector3(...part.b), d = b.clone().sub(a);
    g = new THREE.CylinderGeometry(part.r1, part.r0, d.length(), 8, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(...a.add(b).multiplyScalar(.5).toArray());
  }
  g.setAttribute('aBone', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part.bone), 1));
  return g;
}

/**
 * 驱动模型法（需求文档 2.2）：程序化拼一只低模鹿，按面积加权采样成点云。
 * 返回 surface（供柔光外壳渲染的网格）与 particles（带 aBone 的粒子目标点）。
 *
 * 注意：这里不产美术资产，几何由代码生成——换形体只需改 deerParts()。
 */
export function createDeerGeometry(count) {
  const random = seededRandom(731209);
  const parts = deerParts();
  const geometries = parts.map(partGeometry);
  const surface = mergeGeometries(geometries);

  const triangles = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  geometries.forEach((g, partIndex) => {
    const p = g.attributes.position, index = g.index;
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
      a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
      total += b.sub(a).cross(c.sub(a)).length() * .5 * parts[partIndex].weight;
      triangles.push({ g, ia, ib, ic, end: total, bone: parts[partIndex].bone });
    }
  });

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const bones = new Float32Array(count);
  const data = new Float32Array(count * 4);
  const n = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const pick = random() * total;
    let lo = 0, hi = triangles.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (triangles[mid].end < pick) lo = mid + 1; else hi = mid; }
    const { g, ia, ib, ic, bone } = triangles[lo];
    const s = Math.sqrt(random()), t = random(), weights = [1 - s, s * (1 - t), s * t];
    v.set(0, 0, 0); n.set(0, 0, 0);
    [ia, ib, ic].forEach((j, k) => {
      v.addScaledVector(a.fromBufferAttribute(g.attributes.position, j), weights[k]);
      n.addScaledVector(a.fromBufferAttribute(g.attributes.normal, j), weights[k]);
    });
    n.normalize();
    v.addScaledVector(n, (random() - .5) * .009);
    v.toArray(positions, i * 3); n.toArray(normals, i * 3);
    bones[i] = bone;
    data.set([random(), random(), random(), random()], i * 4);
  }
  for (const g of geometries) g.dispose();

  const particles = new THREE.BufferGeometry();
  particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particles.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  particles.setAttribute('aBone', new THREE.BufferAttribute(bones, 1));
  particles.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  return { surface, particles };
}

/**
 * 通用「种子」点云：不带 position 数据，全部形态由顶点着色器按 aData 推导。
 * aData = [进度 t, 随机 a, 随机 b, 随机 c]
 */
export function createSeeds(count, seed = 8342) {
  const random = seededRandom(seed);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) data.set([(i + .5) / count, random(), random(), random()], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  return g;
}

/** 折面 + 描边线，构成两片可独立扇动的 3D 叶片。 */
export function createLeafGeometry() {
  const p = [], n = [], uv = [], index = [], linePoints = [];
  const point = (side, t, w) => new THREE.Vector3(
    side * (.12 + t * .64 + w * Math.sin(Math.PI * t) * .40),
    t * 1.20 - .46,
    Math.sin(Math.PI * t) * .15 + w * w * .11,
  );
  for (const side of [-1, 1]) {
    const base = p.length / 3;
    for (let i = 0; i <= 24; i++) {
      for (let j = 0; j <= 8; j++) {
        const t = i / 24, w = j / 4 - 1, v = point(side, t, w);
        p.push(...v.toArray()); n.push(0, 0, 1); uv.push(t, w);
        if (i < 24 && j < 8) { const k = base + i * 9 + j; index.push(k, k + 1, k + 9, k + 1, k + 10, k + 9); }
      }
    }
    for (const w of [-1, 0, 1]) for (let i = 0; i < 100; i++) linePoints.push(point(side, i / 99, w));
    for (let j = 1; j <= 5; j++) {
      for (const sign of [-1, 1]) {
        for (let i = 0; i < 14; i++) { const f = i / 13; linePoints.push(point(side, j / 7 + f * .11, sign * f)); }
      }
    }
  }
  for (let i = 0; i < 45; i++) linePoints.push(new THREE.Vector3(0, -.63 + i / 44 * .67, 0));

  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  surface.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  surface.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  surface.setIndex(index);
  surface.computeVertexNormals();

  const filigree = new THREE.BufferGeometry().setFromPoints(linePoints);
  const data = new Float32Array(linePoints.length * 4), random = seededRandom(673);
  for (let i = 0; i < linePoints.length; i++) data.set([random(), random(), random(), random()], i * 4);
  filigree.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  return { surface, filigree };
}

/**
 * 飞行曲线。CPU 侧（叶子的位置）与 GPU 侧（PATH_VERTEX 里的 path()）必须完全一致，
 * 否则徽章会脱离光带。改动时两处一起改。
 */
export function giftPathPoint(start, end, t, out = new THREE.Vector3()) {
  out.lerpVectors(start, end, t);
  out.x -= Math.sin(t * Math.PI * 2) * 3.35;
  out.y += Math.sin(t * Math.PI) * 1.3;
  return out;
}
