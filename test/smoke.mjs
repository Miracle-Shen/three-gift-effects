/**
 * 冒烟测试：不需要 WebGL，只验证模块能被构建出来、数字对得上。
 *   node test/smoke.mjs
 *
 * 覆盖：锚点解析 → 两个效果构建 → 播放/定格 → 档位切换 → 换肤 → 释放。
 * 需要本地能解析到 three（npm i 或 symlink 均可）。
 */
import * as THREE from 'three';
import {
  createGiftEffects, resolveGiftAnchors, GIFT_DURATIONS, GIFT_SKIN,
} from '../src/index.js';

let failures = 0;
function check(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${label}${detail ? '  ' + detail : ''}`);
}

const STAGE = new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 0.7, 3));
const SEATS = [{ eye: new THREE.Vector3(-3.2, 1.25, 13) }, { eye: new THREE.Vector3(0, 1.25, 9.5) }];
const anchorsIn = { stage: STAGE, mic: new THREE.Vector3(1, 1.8, 0), seats: SEATS };

console.log('\n── resolveGiftAnchors ──');
{
  const a = resolveGiftAnchors(anchorsIn);
  check('floor 取自舞台顶面', Math.abs(a.floor - 0.7) < 1e-9, `floor=${a.floor}`);
  check('deer 落位在台面上', Math.abs(a.deer.y - 0.735) < 1e-9, `deer.y=${a.deer.y}`);
  check('recipient 在表演点上方', a.recipient.y > a.mic.y, `recipient.y=${a.recipient.y}`);
  check('sender 取到最靠镜头的座位', Math.abs(a.sender.z - 13) < 1e-9, `sender.z=${a.sender.z}`);
  check('安全区以表演点为中心', Math.abs(a.safeCenter.x - a.mic.x) < 1e-9);

  const noSeats = resolveGiftAnchors({ stage: STAGE, mic: new THREE.Vector3(1, 1.8, 0) });
  check('无观众席时回落到默认 sender', Number.isFinite(noSeats.sender.z));
}

console.log('\n── 构建与播放 ──');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.1, 300);
const effects = createGiftEffects(scene);
effects.setAnchors(anchorsIn);

let group = null;
const findGroup = (kind) => scene.children.find((c) => c.name === 'Gift_' + kind) || null;

for (const kind of ['giftDeer', 'giftPath']) {
  const started = effects.trigger(kind);
  check(`${kind} trigger 返回 true`, started === true);
  check(`${kind} isActive`, effects.isActive(kind));

  group = findGroup(kind);
  check(`${kind} 挂进场景的组存在`, !!group && group.visible);

  // 跑到最密的一帧
  const busiest = kind === 'giftDeer' ? 2.6 : 3.5;
  effects.seek(kind, busiest);
  const s = effects.stats;

  let points = 0, meshes = 0, pointVerts = 0;
  group.traverse((o) => {
    if (o.isPoints) { points++; pointVerts += o.geometry.attributes.position.count; }
    if (o.isMesh) meshes++;
  });

  const budget = kind === 'giftDeer' ? 2 : 3;
  console.log(`     ${kind}: 峰值 ${s.peak} 粒子 · Points×${points}(${pointVerts} 顶点) · Mesh×${meshes} · drawCalls=${s.drawCalls} (规格上限 ${budget})`);
  check(`${kind} 峰值粒子 > 0`, s.peak > 0);
  check(`${kind} phase 合理`, typeof s.phase === 'string' && s.phase !== 'idle', s.phase);
  check(`${kind} 定格不推进时间`, (() => {
    const before = effects.stats.age;
    effects.update(1, camera, 764);
    return Math.abs(effects.stats.age - before) < 1e-9;
  })());
}

console.log('\n── 定格 / 恢复 ──');
{
  effects.seek('giftDeer', 1.0);
  check('seek 返回实际时间', Math.abs(effects.stats.age - 1.0) < 1e-9);
  effects.resume();
  effects.update(0.5, camera, 764);
  check('resume 后继续推进', effects.stats.age > 1.0, `age=${effects.stats.age.toFixed(2)}`);
  effects.stop();
  check('stop 后无激活效果', effects.stats.active === null && !effects.isActive('giftDeer'));
  check('stop 后隐藏所有组', [...scene.children].filter((c) => c.name.startsWith('Gift_')).every((c) => !c.visible));
}

console.log('\n── 档位 ──');
{
  const peaks = {};
  for (const tier of ['high', 'mid', 'low']) {
    effects.setTier(tier);
    effects.seek('giftDeer', 2.6);
    peaks[tier] = effects.stats.peak;
    check(`setTier(${tier}) 生效`, effects.stats.tier === tier);
  }
  check('粒子预算随档位递减', peaks.high > peaks.mid && peaks.mid > peaks.low, JSON.stringify(peaks));
  const degraded = effects.degrade();
  check('degrade 从 low 返回 false', degraded === false);
  effects.setTier('high');
  check('degrade 从 high 降一级', effects.degrade() === 'mid');
  effects.setTier('high');
}

console.log('\n── 换肤 ──');
{
  const before = [...GIFT_SKIN['gift.badge.leaf.color']];
  effects.applySkin({ 'gift.badge.leaf.color': [0.2, 1, 0.3] });
  check('合法 key 被写入', Math.abs(GIFT_SKIN['gift.badge.leaf.color'][1] - 1) < 1e-9);
  effects.applySkin({ 'not.a.real.key': [1, 0, 0] });
  check('非法 key 被忽略', !('not.a.real.key' in GIFT_SKIN));
  effects.applySkin({ 'gift.badge.leaf.color': before });
}
console.log('\n── 释放 ──');
{
  effects.dispose();
  const leftovers = scene.children.filter((c) => c.name.startsWith('Gift_'));
  check('dispose 后场景无残留', leftovers.length === 0, `剩下 ${leftovers.length}`);
}

console.log(`\n时长登记：${JSON.stringify(GIFT_DURATIONS)}`);
console.log(failures === 0 ? '\n全部通过 ✅\n' : `\n${failures} 项失败 ❌\n`);
process.exit(failures === 0 ? 0 : 1);
