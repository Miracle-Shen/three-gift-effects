import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGiftEffects } from '../../src/index.js';

/* ─────────────────────────────────────────────────────────────
   1. 一个最小的「房间」——目的是证明库不依赖任何具体场景资产。
      舞台/歌手/麦克风的坐标全部由下面的 makeAnchors() 在运行时算出来，
      库内部没有任何写死的世界坐标。
   ───────────────────────────────────────────────────────────── */

const app = document.getElementById('app');
const viewport = () => ({ width: app.clientWidth, height: app.clientHeight });

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(viewport().width, viewport().height);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
scene.fog = new THREE.Fog(0x0a0e14, 34, 78);

const camera = new THREE.PerspectiveCamera(38, viewport().width / viewport().height, 0.1, 300);
camera.position.set(0, 5.1, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3.8, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 8;
controls.maxDistance = 60;

// 地面
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 140),
  new THREE.MeshStandardMaterial({ color: 0x161b23, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// 舞台 + 歌手 + 桌子：整体放在一个组里，方便「移动舞台」时一起平移
const stageGroup = new THREE.Group();
scene.add(stageGroup);

const deck = new THREE.Mesh(
  new THREE.BoxGeometry(8, 0.7, 6),
  new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.8 }),
);
deck.position.set(0, 0.35, 0);
stageGroup.add(deck);

const singer = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.3, 0.95, 6, 14),
  new THREE.MeshStandardMaterial({ color: 0x46586e, roughness: 0.7 }),
);
singer.position.set(1.0, 1.75, 0);
stageGroup.add(singer);

const micStand = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.05, 1.7, 8),
  new THREE.MeshStandardMaterial({ color: 0x9aa6b6, roughness: 0.4, metalness: 0.6 }),
);
micStand.position.set(1.0, 1.55, 0.35);
stageGroup.add(micStand);

// 桌子：挡在飞行路径前方，用来肉眼验证「深度测试生效」（粒子被家具正确遮挡）
for (const [x, z] of [[-1.6, 6.4], [3.4, 7.6]]) {
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.75, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x3a2c1f, roughness: 0.85 }),
  );
  table.position.set(x, 0.375, z);
  stageGroup.add(table);
}

// 观众席（只用于算锚点，可视化一下座位）
const SEATS = [];
for (const z of [9.5, 13]) {
  for (const x of [-3.2, 0, 3.2]) SEATS.push({ eye: new THREE.Vector3(x, 1.25, z) });
}
for (const s of SEATS) {
  const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x27313d, roughness: 0.9 }),
  );
  seat.position.set(s.eye.x, 0.45, s.eye.z);
  seat.userData.seat = true;
  scene.add(seat);
}

scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x1a1409, 1.1));
const key = new THREE.DirectionalLight(0xffd9a8, 1.5);
key.position.set(6, 12, 8);
scene.add(key);

/* ─────────────────────────────────────────────────────────────
   2. 锚点：库唯一的输入。移动舞台时重新算一遍再注入。
   ───────────────────────────────────────────────────────────── */
function makeAnchors(shift = 0) {
  return {
    stage: new THREE.Box3(
      new THREE.Vector3(-4 + shift, 0, -3),
      new THREE.Vector3(4 + shift, 0.7, 3),
    ),
    mic: new THREE.Vector3(1.0 + shift, 1.8, 0),
    seats: SEATS.map((s) => ({ eye: s.eye.clone() })),
  };
}

/* ─────────────────────────────────────────────────────────────
   3. 接入特效
   ───────────────────────────────────────────────────────────── */
const effects = createGiftEffects(scene, { coarse: false, reduced: false });
effects.setAnchors(makeAnchors(0));

/* ─────────────────────────────────────────────────────────────
   4. HUD
   ───────────────────────────────────────────────────────────── */
const btnDeer = document.getElementById('btn-deer');
const btnPath = document.getElementById('btn-path');
const seek = document.getElementById('seek');
const seekVal = document.getElementById('seek-val');
const tierSel = document.getElementById('tier');
const statsEl = document.getElementById('stats');
const moveEl = document.getElementById('move');
const moveVal = document.getElementById('move-val');
const pause = document.getElementById('pause');
const view = document.getElementById('view');
const backdrop = document.getElementById('backdrop');

let current = 'giftDeer';
let paused = false;

function frameEffect() {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  const aspect = viewport().width / viewport().height;
  const center = current === 'giftDeer' ? new THREE.Vector3(.1, 3.75, 0) : new THREE.Vector3(.5, 2.6, 6);
  const height = current === 'giftDeer' ? 8.0 : 14;
  const width = 12;
  const distance = Math.max(height, width / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  controls.target.copy(center);
  const angle = view.value === 'side' ? .80 : 0;
  const elevation = view.value === 'above' ? .55 : .055;
  camera.position.copy(center).add(new THREE.Vector3(Math.sin(angle) * distance, elevation * distance, Math.cos(angle) * distance));
  camera.lookAt(center);controls.update();
  controls.enableDamping = damping;
}

function markButtons() {
  btnDeer.classList.toggle('on', effects.isActive('giftDeer'));
  btnPath.classList.toggle('on', effects.isActive('giftPath'));
}

function play(kind) {
  current = kind;
  effects.trigger(kind);
  paused = false; pause.checked = false;
  frameEffect();
  const duration = effects.stats.duration || 10;
  seek.max = String(Math.round(duration * 100));
  seek.value = '0';
  seekVal.textContent = '0.0s';
  markButtons();
}

btnDeer.addEventListener('click', () => play('giftDeer'));
btnPath.addEventListener('click', () => play('giftPath'));

// Scrubbing holds the selected frame; the pause checkbox resumes playback.
seek.addEventListener('input', () => {
  const t = Number(seek.value) / 100;
  effects.seek(current, t);
  paused = true; pause.checked = true;
  seekVal.textContent = t.toFixed(1) + 's';
  markButtons();
});
pause.addEventListener('change', () => {
  paused = pause.checked;
  if (paused) effects.seek(current, effects.stats.age);
  else effects.resume();
});
view.addEventListener('change', frameEffect);
backdrop.addEventListener('change', () => {
  const studio = backdrop.value === 'studio';
  stageGroup.visible = !studio;ground.visible = !studio;
  for (const object of scene.children) if (object.userData.seat) object.visible = !studio;
  scene.background.set(studio ? 0x17110c : 0x0a0e14);
});

tierSel.addEventListener('change', () => {
  effects.setTier(tierSel.value);
});

// 换肤：证明颜色是 key 暴露的，不需要改 shader
const skinInputs = [
  ['c-gold', 'gift.path.core.color', 'gift.particle.core.color'],
  ['c-ivory', 'gift.path.ring.color', 'gift.particle.highlight.color'],
  ['c-leaf', 'gift.badge.leaf.color', null],
];
const linearToHex = (rgb) => '#' + new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]).getHexString();
for (const [id, pathKey] of skinInputs) {
  document.getElementById(id).value = linearToHex(effects.skin[pathKey]);
}
for (const [id, pathKey, deerKey] of skinInputs) {
  document.getElementById(id).addEventListener('input', (e) => {
    const c = new THREE.Color(e.target.value);   // 十六进制按 sRGB 解释，自动转到线性工作空间
    const patch = { [pathKey]: [c.r, c.g, c.b] };
    if (deerKey) patch[deerKey] = [c.r, c.g, c.b];
    effects.applySkin(patch);
  });
}

// 移动舞台：整体平移 + 重新注入锚点，验证「代码里没有写死坐标」
moveEl.addEventListener('input', () => {
  const shift = Number(moveEl.value);
  moveVal.textContent = shift + 'm';
  stageGroup.position.x = shift;
  effects.setAnchors(makeAnchors(shift));
});

function resizeViewport() {
  camera.aspect = viewport().width / viewport().height;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport().width, viewport().height);
  frameEffect();
}
new ResizeObserver(resizeViewport).observe(app);

/* ─────────────────────────────────────────────────────────────
   5. 主循环
   ───────────────────────────────────────────────────────────── */
const clock = new THREE.Clock();
let hudAt = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update();
  effects.update(dt, camera, renderer.domElement.height);
  renderer.render(scene, camera);

  const now = clock.elapsedTime;
  if (now - hudAt > 0.12) {
    hudAt = now;
    const s = effects.stats;
    if (!paused) { seek.value = String(Math.round(s.age * 100)); seekVal.textContent = s.age.toFixed(1) + 's'; }
    statsEl.innerHTML =
      `tier <b>${s.tier}</b> · phase <b>${s.phase}</b> · t <b>${s.age.toFixed(1)}s</b><br>` +
      `drawCalls <b>${s.drawCalls}</b> · peak <b>${s.peak}</b> · 降级 <b>${s.downgrades}</b>`;
    if (!effects.isActive(current)) markButtons();
  }
  requestAnimationFrame(frame);
}
frame();

// 便于在控制台/自动化里检查
window.__gifts = effects;
window.__giftDemo = { scene, camera, controls, renderer };

// 深链：?effect=deer|path（也认 #deer / #path）。README 与落地页的「Live Demo」用它直接开播。
const wanted = new URLSearchParams(location.search).get('effect')
  || location.hash.replace(/^#/, '');
if (wanted === 'deer' || wanted === 'giftDeer') play('giftDeer');
else if (wanted === 'path' || wanted === 'giftPath') play('giftPath');
else play('giftDeer');
const params = new URLSearchParams(location.search);
if (params.has('time')) {
  const time = Number(params.get('time'));
  if (Number.isFinite(time)) { effects.seek(current, time);paused = true;pause.checked = true;seek.value = String(time * 100);seekVal.textContent = time.toFixed(1) + 's'; }
}
