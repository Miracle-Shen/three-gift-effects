import * as THREE from 'three';
export { createDeerGeometry, DEER_HEIGHT, DEER_PIVOTS } from './deer-model.js';

/** 确定性随机：同一个种子每次构建出完全一样的形态，便于回归对比。 */
export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
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
