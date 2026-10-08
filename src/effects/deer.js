import * as shaders from '../shaders.js';
import { NormalBlending } from 'three';
import { createDeerGeometry, createSeeds, DEER_HEIGHT, DEER_PIVOTS } from '../geometry.js';
import { GIFT_DURATIONS, GIFT_TUNING, TAU } from '../config.js';
import { clamp, smooth } from '../util.js';

/**
 * CASE A · 粒子守护兽（G05）
 *
 * 做法（需求文档 5.2「驱动模型法」）：粒子绑定到低模鹿的表面目标点 + 骨骼索引，
 * 每帧用骨骼矩阵把目标点变换到世界坐标，粒子就跟着鹿一起走动。
 * 职责分离：形态归 geometry.js、走路归这里的 animateBones()、发光归 shaders.js。
 */

/** 骨骼阶梯动画：巡行时四肢交错摆动，头部随行进方向微转。 */
function animateBones(ctx, t) {
  const { anchors, bones, root, temp, rotation, scale, axis, position } = ctx;
  const walk = smooth(t, 3.7, 7.8);
  const stride = Math.sin(walk * TAU) * Math.sin(walk * Math.PI);

  position.copy(anchors.deer);
  position.x -= walk * .15;
  position.z += Math.sin(walk * Math.PI) * .06;
  position.y += Math.sin(t * 1.7) * .012;

  const size = anchors.height / DEER_HEIGHT;
  rotation.setFromAxisAngle(axis, Math.PI + Math.sin(walk * Math.PI) * .045);
  root.compose(position, rotation, scale.setScalar(size));
  bones[0].copy(root);

  for (let i = 1; i < 6; i++) {
    const pivot = DEER_PIVOTS[i];
    const angle = i === 1
      ? Math.sin(t * 1.35) * .025
      : stride * (i === 2 || i === 5 ? .045 : -.045);
    bones[i].copy(root).multiply(temp.makeTranslation(...pivot));
    bones[i].multiply(temp.makeRotationZ(angle));
    bones[i].multiply(temp.makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
  }
}

const DISSOLVE_AT = 9.6;

export const DEER_EFFECT = {
  kind: 'giftDeer',
  duration: GIFT_DURATIONS.giftDeer,

  build({ group, u, conf, add }) {
    const deer = createDeerGeometry(conf.deer);

    // A low-energy splat halo replaces the visible mesh shell. Only particles
    // contribute to the silhouette; there are no opaque or Fresnel body faces.
    deer.surface.dispose();
    const haloU = { ...u, uOpacity: { value: 0 }, uPointGain: { value: 2.3 } };
    const halo = add(deer.particles, shaders.DEER_VERTEX, shaders.DEER_HALO_FRAGMENT, 'points', group, haloU);
    halo.name = 'Gift_DeerSoftLight';
    const points = add(deer.particles, shaders.DEER_VERTEX, shaders.DEER_FRAGMENT, 'points', group, u);
    points.name = 'Gift_DeerSurfaceParticles';
    points.material.blending = NormalBlending;

    const auraU = { ...u, uOpacity: { value: 0 } };
    const aura = add(createSeeds(conf.aura), shaders.AURA_VERTEX, shaders.DEER_FRAGMENT, 'points', group, auraU);
    aura.name = 'Gift_DeerCrescent';
    aura.material.blending = NormalBlending;

    return { haloU, auraU, peak: conf.deer + conf.aura };
  },

  apply({ ctx, system, t }) {
    animateBones(ctx, t);
    const u = system.u;
    const form = clamp((t - .25) / GIFT_TUNING.converge);
    const fade = 1 - smooth(t, DISSOLVE_AT, system.total);

    u.uForm.value = form;
    u.uOpacity.value = smooth(t, 0, .5) * fade;
    u.uDissolve.value = smooth(t, DISSOLVE_AT, system.total);
    system.haloU.uOpacity.value = smooth(form, .72, 1) * fade * .055;
    system.haloU.uPointGain.value = GIFT_TUNING.pointGain * 2.3;
    system.auraU.uOpacity.value = smooth(t, .35, 2.4) * fade;

    return t < .5 ? 'summon' : form < 1 ? 'form' : t < 3.7 ? 'reveal' : t < DISSOLVE_AT ? 'guard' : 'dissolve';
  },
};
