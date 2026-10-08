import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDeerGeometry, DEER_HEIGHT } from '../src/deer-model.js';
import { createGiftEffects, GIFT_TIERS } from '../src/index.js';

const first = createDeerGeometry(1200), second = createDeerGeometry(1200);
assert.equal(first.particles.attributes.position.count, 1200);
assert.deepEqual(first.particles.attributes.position.array, second.particles.attributes.position.array, 'Sampling must remain deterministic');
for (const geometry of [first.surface, first.particles]) {
  for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite), 'No invalid positions, normals or weights');
  assert.ok(geometry.attributes.aBone.array.every(b => b >= 0 && b < 6));
  assert.ok(geometry.attributes.aBoneMix.array.every(w => w >= 0 && w <= 1));
}
assert.ok(first.surface.boundingBox.max.y > DEER_HEIGHT - .05);
assert.ok(first.surface.boundingBox.min.z < -.20 && first.surface.boundingBox.max.z > .20, 'The sculpture must occupy real depth');
assert.ok(first.surface.attributes.aBoneMix.array.some(w => w > .05 && w < .95), 'Joints must blend into the torso');
for (const asset of [first, second]) { asset.surface.dispose();asset.particles.dispose(); }

const scene = new THREE.Scene(), effects = createGiftEffects(scene);
const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, .1, 100);
camera.position.set(0, 5, 18);camera.lookAt(0, 3, 0);
const group = () => scene.getObjectByName('Gift_giftDeer');
for (const tier of ['high', 'mid', 'low']) {
  effects.setTier(tier);effects.seek('giftDeer', 3.1);effects.update(0, camera, 900);
  const core = group().getObjectByName('Gift_DeerSurfaceParticles');
  const halo = group().getObjectByName('Gift_DeerSoftLight');
  assert.equal(core.material.blending, THREE.NormalBlending, 'Cores must not add into white blobs');
  assert.equal(core.geometry, halo.geometry, 'Halo must reuse the core GPU buffers');
  assert.equal(core.geometry.attributes.position.count, GIFT_TIERS[tier].deer);
  assert.equal(effects.stats.peak, GIFT_TIERS[tier].deer + GIFT_TIERS[tier].aura);
  assert.equal(effects.stats.drawCalls, 3);
  group().traverse(o => {
    assert.ok(!o.isMesh, 'No visible sphere/mesh shell may contribute to the deer');
    if (o.material) { assert.equal(o.material.depthTest, true);assert.equal(o.material.depthWrite, false); }
  });
  effects.setTier(tier === 'high' ? 'mid' : 'high');
  assert.equal(effects.stats.age, 3.1, 'Changing tier must preserve the frozen frame');
  effects.update(.1, camera, 900);assert.equal(effects.stats.age, 3.1);
}
effects.seek('giftDeer', 3.1);
const saved = group().getObjectByName('Gift_DeerSurfaceParticles').material.uniforms.uBones.value[0].clone();
effects.seek('giftDeer', 6.1);
assert.ok(!saved.equals(group().getObjectByName('Gift_DeerSurfaceParticles').material.uniforms.uBones.value[0]), 'The 3D rig must animate');
effects.trigger('giftDeer');effects.update(.1, camera, 900);assert.equal(effects.stats.age, .1, 'Replay must clear frozen state');
effects.seek('giftDeer', 11.6);
for (const object of group().children) assert.equal(object.material.uniforms.uOpacity.value, 0, 'No residual glow at the end');
effects.dispose();assert.equal(scene.children.length, 0);
console.log('PASS: sculpt, deterministic spacing, 3D depth, skinning, budgets, bounded cores, replay, fade and disposal');
