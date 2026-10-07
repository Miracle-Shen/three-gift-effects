import * as THREE from 'three';
import { GIFT_DURATIONS, GIFT_SKIN, GIFT_TIERS, GIFT_TIER_ORDER, GIFT_TUNING } from './config.js';
import { resolveGiftAnchors } from './anchors.js';
import { clamp, v3 } from './util.js';
import { DEER_EFFECT } from './effects/deer.js';
import { PATH_EFFECT } from './effects/path.js';

export { GIFT_DURATIONS, GIFT_SKIN, GIFT_TIERS, GIFT_TIER_ORDER, GIFT_TUNING, GIFT_LAYOUT } from './config.js';
export { resolveGiftAnchors } from './anchors.js';
export { DEER_EFFECT } from './effects/deer.js';
export { PATH_EFFECT } from './effects/path.js';

/** 效果注册表。新增效果（G04/G07/G09/G12/G15）只需实现同样的 build/apply 并登记在这里。 */
const EFFECTS = {
  [DEER_EFFECT.kind]: DEER_EFFECT,
  [PATH_EFFECT.kind]: PATH_EFFECT,
};

/**
 * 所有粒子/网格的统一材质。
 *
 * depthTest:true + depthWrite:false 是需求文档 4.1 的正解——
 * 粒子能被人物和家具正确遮挡（不会浮成一张贴片），但互相之间不写深度（不会自遮挡出黑边）。
 * 配合 onBeforeCompile 类的软粒子淡出可进一步优化，这里用 shader 内的安全区降亮兜底。
 */
function shader(vertexShader, fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/**
 * 创建一个礼物特效播放器。
 *
 * @param {THREE.Scene} scene 宿主场景。库只往里挂一个 Group，不碰其它任何对象。
 * @param {object} [options]
 * @param {boolean} [options.coarse=false]  低端设备提示（决定初始档位）
 * @param {boolean} [options.reduced=false] 减弱动态偏好（决定初始档位）
 * @returns {object} API，见下方 api 定义
 */
export function createGiftEffects(scene, { coarse = false, reduced = false } = {}) {
  let sourceAnchors = {};
  let anchors = resolveGiftAnchors();
  let tier = reduced ? 'low' : coarse ? 'mid' : 'high';

  const systems = new Map();
  let active = null;
  let lastView = { scale: 30, perspective: 0 };

  const stats = {
    tier, active: null, peak: 0, drawCalls: 0, age: 0, duration: 0,
    phase: 'idle', progress: 0, downgrades: 0, deviceTier: tier,
  };

  // 骨骼驱动用的复用对象（避免每帧分配）。
  const bones = Array.from({ length: 6 }, () => new THREE.Matrix4());
  const root = new THREE.Matrix4();
  const temp = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();

  /** 传给效果模块的上下文。anchors 是 getter，重建后自动拿到最新值。 */
  const ctx = {
    get anchors() { return anchors; },
    bones, root, temp, rotation, scale, axis, position,
  };

  function uniforms(kind) {
    const goldKey = kind === 'giftDeer' ? 'gift.particle.core.color' : 'gift.path.core.color';
    const ivoryKey = kind === 'giftDeer' ? 'gift.particle.highlight.color' : 'gift.path.ring.color';
    return {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uGlow: { value: GIFT_TUNING.glow },
      uPointGain: { value: GIFT_TUNING.pointGain },
      uGold: { value: v3(GIFT_SKIN[goldKey]) },
      uIvory: { value: v3(GIFT_SKIN[ivoryKey]) },
      uPixelScale: { value: lastView.scale },
      uPerspective: { value: lastView.perspective },
      uSafeCenter: { value: anchors.safeCenter },
      uSafeHalf: { value: anchors.safeHalf },
      uBones: { value: bones },
      uRoot: { value: root },
      uOrigin: { value: anchors.deer },
      uForm: { value: 0 },
      uDissolve: { value: 0 },
      uDensity: { value: Math.sqrt(GIFT_TIERS.high.deer / GIFT_TIERS[tier].deer) },
      uNoise: { value: GIFT_TUNING.noise },
      uStart: { value: anchors.sender },
      uEnd: { value: anchors.recipient },
      uTravel: { value: 0 },
      uArrival: { value: 0 },
      uFlap: { value: .3 },
    };
  }

  function build(kind) {
    const effect = EFFECTS[kind];
    const conf = GIFT_TIERS[tier];
    const u = uniforms(kind);

    const group = new THREE.Group();
    group.name = 'Gift_' + kind;
    group.visible = false;
    scene.add(group);

    const geometries = new Set();
    const materials = new Set();

    // 统一的挂载点：登记几何与材质，便于 dispose 时一次收干净。
    function add(g, vertex, fragment, type = 'points', parent = group, uniform = u) {
      const m = shader(vertex, fragment, uniform);
      const object = type === 'points' ? new THREE.Points(g, m) : new THREE.Mesh(g, m);
      object.frustumCulled = false;   // 形态由顶点着色器推导，包围盒不可靠，交给引擎自己剔除会误裁
      object.renderOrder = 5;
      parent.add(object);
      geometries.add(g);
      materials.add(m);
      return object;
    }

    const s = {
      kind, group, u, age: 0, frozen: false,
      total: GIFT_DURATIONS[kind], geometries, materials, peak: 0,
    };
    Object.assign(s, effect.build({ group, u, conf, add, ctx }));
    systems.set(kind, s);
    return s;
  }

  function apply(s) {
    const t = s.age;
    const u = s.u;

    u.uTime.value = t;
    u.uPixelScale.value = lastView.scale;
    u.uPerspective.value = lastView.perspective;
    u.uGlow.value = GIFT_TUNING.glow;
    u.uPointGain.value = GIFT_TUNING.pointGain;

    stats.phase = EFFECTS[s.kind].apply({ ctx, system: s, t });

    let calls = 0;
    s.group.traverse((o) => { if (o.isMesh || o.isPoints) calls++; });
    Object.assign(stats, {
      active: s.kind, age: t, duration: s.total,
      progress: clamp(t / s.total), peak: s.peak, drawCalls: calls,
    });
  }

  function stop() {
    for (const s of systems.values()) { s.group.visible = false; s.frozen = false; }
    active = null;
    Object.assign(stats, { active: null, age: 0, progress: 0, phase: 'idle', drawCalls: 0, peak: 0 });
  }

  function disposeSystems() {
    for (const s of systems.values()) {
      s.group.removeFromParent();
      for (const g of s.geometries) g.dispose();
      for (const m of s.materials) m.dispose();
    }
    systems.clear();
  }

  /** 锚点/档位/换肤变化后重建：保留当前播放进度，避免画面跳变。 */
  function rebuild() {
    const previous = active ? { kind: active.kind, age: active.age, frozen: active.frozen } : null;
    disposeSystems();
    active = null;
    if (previous) {
      active = build(previous.kind);
      Object.assign(active, { age: previous.age, frozen: previous.frozen });
      active.group.visible = true;
      apply(active);
    }
  }

  const api = {
    stats,
    skin: GIFT_SKIN,
    tuning: GIFT_TUNING,
    get anchors() { return anchors; },

    /** 只注入舞台包围盒（其余锚点沿用上次）。 */
    setStage(box) {
      if (!box || box.isEmpty()) return;
      sourceAnchors = { ...sourceAnchors, stage: box.clone() };
      anchors = resolveGiftAnchors(sourceAnchors);
      rebuild();
    },

    /** 注入完整锚点，见 resolveGiftAnchors 的入参说明。 */
    setAnchors(input) {
      sourceAnchors = input || {};
      anchors = resolveGiftAnchors(sourceAnchors);
      rebuild();
    },

    setTier(level) {
      if (!GIFT_TIER_ORDER.includes(level) || tier === level) return tier;
      tier = level;
      stats.tier = tier;
      rebuild();
      return tier;
    },

    /** 降一级（需求文档 3.3）。返回新档位；已在最低档返回 false。 */
    degrade() {
      const next = GIFT_TIER_ORDER[Math.min(GIFT_TIER_ORDER.length - 1, GIFT_TIER_ORDER.indexOf(tier) + 1)];
      if (next === tier) return false;
      stats.downgrades++;
      api.setTier(next);
      return next;
    },

    /** 换肤：只接受 GIFT_SKIN 里已存在的 key，防止写错 key 静默失效。 */
    applySkin(patch) {
      for (const [key, value] of Object.entries(patch || {})) {
        if (key in GIFT_SKIN && Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) {
          GIFT_SKIN[key] = [...value];
        }
      }
      rebuild();
      return GIFT_SKIN;
    },

    /** 触发一次播放。两个礼物互斥，触发新的会先停掉旧的。 */
    trigger(kind) {
      if (!GIFT_TUNING.active || !Object.hasOwn(GIFT_DURATIONS, kind)) return false;
      stop();
      active = systems.get(kind) || build(kind);
      active.age = 0;
      active.frozen = false;
      active.group.visible = true;
      apply(active);
      return true;
    },

    isActive(kind) { return active?.kind === kind; },

    /** 定格到任意时刻——给自动化验收用（需求文档 5.5「任意一帧暂停」）。 */
    seek(kind, seconds) {
      if (!Object.hasOwn(GIFT_DURATIONS, kind) || !Number.isFinite(seconds)) return false;
      stop();
      active = systems.get(kind) || build(kind);
      active.age = clamp(seconds, 0, active.total);
      active.frozen = true;
      active.group.visible = true;
      apply(active);
      return active.age;
    },

    resume() { if (active) active.frozen = false; return true; },

    stop,

    /**
     * 每帧调用。
     * @param {number} dt 秒
     * @param {THREE.Camera} camera 用来推算 px/米，决定光点屏幕尺寸
     * @param {number} pixelHeight 画布像素高
     */
    update(dt, camera, pixelHeight) {
      if (camera && pixelHeight > 0) {
        lastView = {
          scale: camera.isPerspectiveCamera
            ? pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
            : pixelHeight / ((camera.top - camera.bottom) / (camera.zoom || 1)),
          perspective: camera.isPerspectiveCamera ? 1 : 0,
        };
      }
      if (!active) return false;
      if (!active.frozen) active.age += clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
      apply(active);
      if (active.age >= active.total && !active.frozen) stop();
      return true;
    },

    dispose() { stop(); disposeSystems(); },
  };

  return api;
}
