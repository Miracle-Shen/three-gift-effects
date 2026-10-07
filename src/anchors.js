import * as THREE from 'three';
import { GIFT_LAYOUT, GIFT_TUNING } from './config.js';

const v3 = (a) => new THREE.Vector3(...a);

/**
 * 把宿主注入的场景信息换算成两个效果需要的全部定位量。
 *
 * 这是本库唯一的「场景耦合点」，也是它可插拔的关键：
 * 库不自己去 root.getObjectByName(...)，而是要求宿主把量算好传进来。
 * 这样无论是 GLB、程序化几何还是编辑器里摆的盒子，都能直接复用。
 *
 * @param {object} input
 * @param {THREE.Box3}     [input.stage]  舞台/表演区包围盒（强烈建议传真实值）
 * @param {THREE.Vector3}  [input.mic]    表演点（歌手站位 / 麦克风），礼物终点以此推算
 * @param {Array<{eye:THREE.Vector3}>} [input.seats] 观众席锚点，用来挑一个「送礼人」
 * @param {object}         [input.layout] 覆盖 GIFT_LAYOUT 的任意字段
 *
 * @returns {{
 *   stage: THREE.Box3, floor: number, mic: THREE.Vector3,
 *   deer: THREE.Vector3, height: number,
 *   sender: THREE.Vector3, recipient: THREE.Vector3,
 *   safeCenter: THREE.Vector3, safeHalf: THREE.Vector3
 * }}
 */
export function resolveGiftAnchors(input = {}) {
  const layout = { ...GIFT_LAYOUT, ...(input.layout || {}) };

  const stage = input.stage && !input.stage.isEmpty()
    ? input.stage.clone()
    : new THREE.Box3(v3(layout.fallbackStage.min), v3(layout.fallbackStage.max));

  const floor = stage.max.y;                                   // 台面高度
  const mic = input.mic ? input.mic.clone() : v3(layout.fallbackMic);
  const height = GIFT_TUNING.deerHeight * GIFT_TUNING.sceneGain;

  const deer = v3([mic.x + layout.deerOffset[0], floor + layout.deerOffset[1], mic.z + layout.deerOffset[2]]);

  // 挑一个观众席当送礼人：取最靠近镜头的一个，飞行路径最长、最容易读懂。
  let sender = v3(layout.fallbackSender);
  const seats = (input.seats || []).filter((s) => s && s.eye);
  if (seats.length) {
    const front = [...seats].sort(
      (a, b) => (b.eye.z + b.eye.x * 0.18) - (a.eye.z + a.eye.x * 0.18),
    )[0];
    sender.copy(front.eye);
  }
  sender.y += layout.senderRise;

  const recipient = v3([
    mic.x + layout.recipientOffset[0],
    floor + layout.recipientOffset[1],
    mic.z + layout.recipientOffset[2],
  ]);

  const safeCenter = v3([mic.x, floor + layout.safeCenterLift, mic.z]);
  const safeHalf = v3(layout.safeHalf);

  return { stage, floor, mic, deer, height, sender, recipient, safeCenter, safeHalf };
}
