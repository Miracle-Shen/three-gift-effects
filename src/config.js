/**
 * 全部可调项集中在这里。
 *
 * 设计原则：库本身不认识任何具体场景。所有「这个场景里舞台在哪、歌手多高、
 * 礼物从哪来」的量都由宿主注入（见 anchors.js 的 resolveGiftAnchors），
 * 而「偏移多少、多大、多亮」这类观感参数才放在这里，并允许运行时覆盖。
 *
 * 单位统一为米（与 three.js 世界单位一致）。
 */

/** 播放时长（秒）。新增效果时在这里登记，索引会被 rebuild 复用。 */
export const GIFT_DURATIONS = {
  giftDeer: 11.6,
  giftPath: 9.4,
};

/**
 * 皮肤包色板（对应需求文档附录的 GIFT_SKIN key 约定）。
 * 必须用 key 暴露、不要在 shader 里写死颜色——换肤时由宿主调 applySkin() 覆盖。
 * 每个值都是线性空间的 [r,g,b]，范围 0~1。
 */
export const GIFT_SKIN = {
  'gift.particle.core.color': [1, 0.47, 0.065],
  'gift.particle.highlight.color': [1, 0.91, 0.57],
  'gift.particle.shell.color': [1, 0.67, 0.19],
  'gift.path.core.color': [1, 0.54, 0.09],
  'gift.path.ring.color': [1, 0.91, 0.55],
  'gift.badge.leaf.color': [1, 0.70, 0.21],
  'gift.badge.vein.color': [1, 0.96, 0.70],
};

/** 全局观感开关。 */
export const GIFT_TUNING = {
  active: true,      // 特效总开关（false 时 trigger/seek 直接返回 false）
  converge: 2.15,    // 汇聚成形时长（秒）
  glow: 1,           // 发光强度倍数
  sceneGain: 1,      // 远景统一放大系数（近景 1.0；大远景可给 2 左右）
  deerHeight: 6.4,   // 守护兽体高（米）。注意这是世界单位，不是「歌手身高的倍数」
  pointGain: 1,      // 光点直径额外倍数
  noise: 0.018,      // 位置噪声幅度（飞萤游动感）
};

/**
 * 三档机型的粒子预算。
 * 数值来自需求文档 3.1 的性能红线；调整只改这里，不要改结构。
 */
export const GIFT_TIERS = {
  high: { deer: 14500, aura: 2600, path: 4200, burst: 1600 },
  mid: { deer: 9000, aura: 1700, path: 2800, burst: 1000 },
  low: { deer: 4200, aura: 850, path: 1500, burst: 500 },
};

/** 降级顺序：high → mid → low。 */
export const GIFT_TIER_ORDER = ['high', 'mid', 'low'];

/**
 * 场景布局偏移。
 *
 * 这里的每个量都是「相对于宿主注入的锚点」的偏移，不是绝对坐标——
 * 换一个场景只需要改这一组数（或干脆传入自己的 layout），不必动 shader。
 */
export const GIFT_LAYOUT = {
  /** 宿主没提供 stage 时的兜底盒（仅用于 demo/降级，正式接入请务必传入真实舞台盒）。 */
  fallbackStage: { min: [-3.31, 0.57, 1.88], max: [7.40, 0.72, 9.27] },

  /** 宿主没提供 mic 时的兜底表演点。 */
  fallbackMic: [1.7, 1.83, 8.1],

  /** 守护兽相对表演点的落位（x 向右偏移，z 略向观众侧）。 */
  deerOffset: [2.15, 0.035, 0.25],

  /** 宿主没提供任何观众席时的兜底送礼人位置。 */
  fallbackSender: [4.1, 1.8, 18.4],

  /** 送礼人锚点抬高量（避免粒子贴地）。 */
  senderRise: 0.5,

  /** 终点：相对表演点的偏移（肩侧偏上，避开面部与麦克风）。 */
  recipientOffset: [1.5, 4.5, -0.35],

  /** 安全区（面部+麦克风）相对表演点的抬高量。 */
  safeCenterLift: 1.45,

  /** 安全区半尺寸。粒子进入该盒即主动降亮（需求文档 4.1「主动降亮」）。 */
  safeHalf: [0.56, 0.74, 0.65],
};

/** 内部常量。 */
export const TAU = Math.PI * 2;
