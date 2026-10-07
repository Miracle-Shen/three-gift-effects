import * as THREE from 'three';
import * as shaders from '../shaders.js';
import { createSeeds, createLeafGeometry, giftPathPoint } from '../geometry.js';
import { GIFT_DURATIONS, GIFT_SKIN, TAU } from '../config.js';
import { smooth, v3 } from '../util.js';

/**
 * CASE B · 一对一送礼路径（G02）
 *
 * 做法（需求文档 6.2）：
 *   路径 = 手摆曲线（不寻路，每次播放完全一样）
 *   飞行 = 粒子沿曲线按 t 前进 + 位置噪声，得到「飞萤游动」的不规则感
 *   汇聚 = 进入终点段后收敛成圆环
 *   徽章 = 独立小模型在光环成形后淡入（不用粒子硬堆叶片，边缘会毛糙）
 */

/** 沿曲线扫出的三条并排 ribbon：只做极淡的底光，主体观感交给离散光点。 */
function ribbonGeometry() {
  const p = [], uv = [], idx = [];
  for (let line = 0; line < 3; line++) {
    for (let i = 0; i <= 180; i++) {
      const k = p.length / 3;
      p.push(0, 0, line * 2.094, 0, 0, line * 2.094);
      uv.push(i / 180, 0, i / 180, 1);
      if (i < 180) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const TAKEOFF = .55;      // 起势结束
const LAND = 4.55;        // 飞行结束
const BLOOM = 5.4;        // 汇聚完成
const DISSOLVE_AT = 7.9;  // 开始消散

export const PATH_EFFECT = {
  kind: 'giftPath',
  duration: GIFT_DURATIONS.giftPath,

  build({ group, u, conf, add, ctx }) {
    add(ribbonGeometry(), shaders.RIBBON_VERTEX, shaders.RIBBON_FRAGMENT, 'mesh', group, u);
    add(createSeeds(conf.path), shaders.PATH_VERTEX, shaders.POINT_FRAGMENT, 'points', group, u);
    add(createSeeds(conf.burst, 576), shaders.BURST_VERTEX, shaders.POINT_FRAGMENT, 'points', group, u);

    const leaf = createLeafGeometry();
    const leafU = {
      ...u, uOpacity: { value: 0 },
      uGold: { value: v3(GIFT_SKIN['gift.badge.leaf.color']) },
      uIvory: { value: v3(GIFT_SKIN['gift.badge.vein.color']) },
    };

    const leafGroup = new THREE.Group();
    leafGroup.name = 'Gift_LeafBadge';
    group.add(leafGroup);
    add(leaf.surface, shaders.LEAF_SURFACE_VERTEX, shaders.LEAF_SURFACE_FRAGMENT, 'mesh', leafGroup, leafU);
    add(leaf.filigree, shaders.LEAF_VERTEX, shaders.POINT_FRAGMENT, 'points', leafGroup, leafU);

    // 起点处一个更小的同类叶片，暗示「礼物从这里出发」。
    // 注意 uFlap 被显式覆盖成独立对象，因此不会被 apply() 里的扇动驱动。
    const senderU = { ...leafU, uOpacity: { value: 0 }, uFlap: { value: .18 } };
    const senderGroup = new THREE.Group();
    senderGroup.position.copy(ctx.anchors.sender);
    senderGroup.scale.setScalar(.54);
    senderGroup.rotation.x = -.45;
    group.add(senderGroup);
    add(leaf.filigree, shaders.LEAF_VERTEX, shaders.POINT_FRAGMENT, 'points', senderGroup, senderU);

    return {
      leafU, senderU, leaf: leafGroup, sender: senderGroup,
      peak: conf.path + conf.burst + leaf.filigree.attributes.position.count * 2,
    };
  },

  apply({ ctx, system, t }) {
    const u = system.u;
    const travel = smooth(t, TAKEOFF, LAND);
    const arrival = smooth(t, LAND - .1, BLOOM);
    const fade = 1 - smooth(t, DISSOLVE_AT, system.total);

    u.uTravel.value = travel;
    u.uArrival.value = arrival;
    u.uDissolve.value = smooth(t, DISSOLVE_AT, system.total);
    u.uOpacity.value = smooth(t, 0, .5) * fade;

    system.leafU.uOpacity.value = smooth(t, .12, .8) * fade;
    system.senderU.uOpacity.value = smooth(t, 0, .45) * fade * .7;

    // 徽章沿同一条曲线飞行——CPU 侧与 GPU 侧共用 giftPathPoint()，避免脱离光带。
    giftPathPoint(ctx.anchors.sender, ctx.anchors.recipient, travel, system.leaf.position);
    system.leaf.position.y += Math.sin(t * 2.) * .035 * arrival;
    system.leaf.scale.setScalar(.58 + smooth(t, TAKEOFF, 3.) * .37 + arrival * .30);
    system.leaf.rotation.set(-.48, Math.sin(t * 1.4) * .16, Math.sin(travel * TAU) * -.32);
    u.uFlap.value = .42 - arrival * .23;

    return t < TAKEOFF ? 'summon' : t < LAND ? 'flight' : t < BLOOM ? 'bloom' : t < DISSOLVE_AT ? 'hold' : 'dissolve';
  },
};
