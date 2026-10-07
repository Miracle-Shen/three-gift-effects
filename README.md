# three-gift-effects

可插拔的 **Three.js 礼物粒子特效**：一组「粒子从起点飞出来、聚成一个能认出来的形态」的演出型特效，
直接挂到任意 three.js 场景里就能用，不需要重建场景、不需要美术资产。

当前包含两个效果：

| 效果 | 编号 | 做法 | 观感 |
| --- | --- | --- | --- |
| **粒子守护兽** | G05 | 驱动模型法（低模 + 骨骼 + 表面采样点云） | 星光从四处飘来聚成一只半透明小鹿，沿台前巡行后散开 |
| **一对一送礼路径** | G02 | 参数化几何法（曲线飞行）+ 目标点集法（徽章） | 暖金飞萤沿 S 形曲线飞过房间，在歌手肩侧绕成光环、凝结徽章 |

> 设计依据：`3D K 歌房 · 礼物粒子特效实现需求说明`（v1.0）。
> 本仓库是从星月林间 V33 项目里抽出来的**独立版本**，与宿主工程解耦。

## 预览

粒子守护兽（`examples/basic` 实拍，金色光点聚成鹿形并沿台前巡行）：

![粒子守护兽](docs/preview-deer.png)

一对一送礼路径（**当前观感尚未达标**，见文末「已知问题」）：

![送礼路径（待改版）](docs/preview-path-current.png)

---

## 快速开始

```sh
git clone https://github.com/Miracle-Shen/three-gift-effects.git
cd three-gift-effects
npm install          # 只装 three（peer dependency）
npm run demo         # 起服务并打开浏览器
```

demo 是一个不依赖任何外部素材的最小场景（地面 + 舞台 + 一个歌手替身 + 两张桌子），
用来证明本库不认识任何具体场景：

- 点 **✦ 粒子守护兽 / ❦ 送礼路径** 播放
- 拖 **定格** 可任意暂停看形态（对应验收要求「任意一帧都能辨认形态」）
- 拖 **移动舞台** 会整体平移舞台并**重新注入锚点** —— 代码里没有任何写死的世界坐标
- 改 **换肤** 三个色块可实时改色（颜色全部走 key，不需要动 shader）
- 切 **档位** 看高/中/低配的粒子预算

---

## 接入到自己的项目

```js
import * as THREE from 'three';
import { createGiftEffects } from 'three-gift-effects';

const gifts = createGiftEffects(scene, { coarse: false, reduced: false });

// 1) 告诉它你的舞台在哪（这是唯一的场景耦合点）
gifts.setAnchors({
  stage: new THREE.Box3().setFromObject(stageMesh),   // 表演区包围盒
  mic: new THREE.Vector3(1.0, 1.8, 0),                // 表演点 / 歌手站位
  seats: [...].map((s) => ({ eye: s.eye.clone() })),  // 观众席锚点（可选）
});

// 2) 播放
gifts.trigger('giftDeer');   // 或 'giftPath'

// 3) 每帧更新（必须传相机与画布像素高，用来换算 px/米 → 决定光点屏幕尺寸）
function frame(dt) {
  gifts.update(dt, camera, renderer.domElement.height);
  renderer.render(scene, camera);
}

// 4) 卸载
gifts.dispose();
```

### 锚点契约

库**不**自己去 `root.getObjectByName(...)`——不同工程的命名千奇百怪，硬找必然静默失配。
所有定位量由宿主算好注入：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `stage` | `THREE.Box3` | 表演区包围盒。只要 `max.y`（台面高度）和水平范围是对的即可 |
| `mic` | `THREE.Vector3` | 表演点。礼物终点、安全区都以它为基准推算 |
| `seats` | `Array<{eye}>` | 观众席视点。库会挑一个最靠镜头的当「送礼人」 |
| `layout` | `object` | 可选，覆盖 `GIFT_LAYOUT` 里的任意偏移量 |

偏移量（守护兽落在哪、终点抬多高、安全区多大）集中在 `src/config.js` 的 `GIFT_LAYOUT`，
换场景只改这一组数，不需要碰 shader。

### API

| 方法 | 说明 |
| --- | --- |
| `setAnchors(input)` / `setStage(box)` | 注入/更新锚点。会保留当前播放进度重建，不跳帧 |
| `trigger(kind)` | 播放。两个礼物互斥，触发新的会先停旧的 |
| `seek(kind, seconds)` | **定格**到任意时刻（自动化验收用） |
| `resume()` / `stop()` | 继续 / 立即停止 |
| `setTier('high'\|'mid'\|'low')` | 切档位 |
| `degrade()` | 自动降一级，返回新档位（已在最低档返回 `false`） |
| `applySkin(patch)` | 换肤，只接受 `GIFT_SKIN` 里已存在的 key |
| `update(dt, camera, pixelHeight)` | 每帧调用 |
| `stats` | `{tier, active, peak, drawCalls, age, duration, phase, progress, downgrades}` |
| `dispose()` | 释放全部几何与材质 |

### 皮肤包约定

颜色**不要**写死在 shader 里，全部用 key 暴露，由皮肤包覆盖：

```js
gifts.applySkin({
  'gift.particle.core.color':      [1.00, 0.47, 0.065],  // 守护兽主光点
  'gift.particle.highlight.color': [1.00, 0.91, 0.570],  // 守护兽高光
  'gift.path.core.color':          [1.00, 0.54, 0.090],  // 飞萤主色
  'gift.path.ring.color':          [1.00, 0.91, 0.550],  // 光环
  'gift.badge.leaf.color':         [1.00, 0.70, 0.210],  // 叶片徽章
  'gift.badge.vein.color':         [1.00, 0.96, 0.700],  // 叶脉
});
```

值一律是**线性空间**的 `[r,g,b]`（0~1），不是 sRGB 十六进制。
从十六进制转换：`const c = new THREE.Color('#ff7811')`，取 `c.r/c.g/c.b`。

---

## 性能

三档预算（`src/config.js` 的 `GIFT_TIERS`）：

| 档位 | 守护兽（点云 + 柔光） | 送礼路径（飞萤 + 迸发） |
| --- | --- | --- |
| high | 14,500 + 2,600 | 4,200 + 1,600 |
| mid | 9,000 + 1,700 | 2,800 + 1,000 |
| low | 4,200 + 850 | 1,500 + 500 |

深度处理是**最高优先级**的红线（需求文档 4.1）：

- 所有材质 `depthTest: true` + `depthWrite: false`，粒子能被人物与家具正确遮挡，不会浮成一张贴片
- 严禁用 `ZTest Always` 解决穿透——那会造成全屏覆盖与光污染，比原问题更严重
- 兜底：shader 里对「面部 + 麦克风」安全区做主动降亮（`uSafeCenter` / `uSafeHalf`）

### 已知问题

- **Draw Call 超出规格上限**（规格：守护兽 ≤2、送礼路径 ≤3）：
  当前实测守护兽 **3**、送礼路径 **6**。原因是每个子部件都单独一个 draw call
  （柔光外壳、底光 ribbon、叶片网格、两处叶片描边各自一份）。
  修法是把同类型部件合并成单个几何 + `role` 属性分流，但会引入顶点着色器分支
  （规格 3.2 建议禁用动态分支），因此和视觉改版一起处理。
- **送礼路径的观感尚未达标**：底光 ribbon 沿曲线扫出一根连续的管子，加性混合后读起来
  像一条浑浊的烟带，而不是参考图里那种一颗颗高对比的飞萤。正在按参考图重做。

---

## 目录

```
src/
  index.js          入口：createGiftEffects + API
  config.js         全部可调项（色板 / 预算 / 布局偏移）
  anchors.js        锚点解析——唯一的场景耦合点
  shaders.js        全部 GLSL
  geometry.js       程序化几何：低模鹿 / 种子点云 / 叶片 / 飞行曲线
  effects/
    deer.js         CASE A 粒子守护兽（含骨骼动画）
    path.js         CASE B 一对一送礼路径
test/smoke.mjs      不需要 WebGL 的冒烟测试
examples/basic/     最小可运行 demo
```

## 许可

MIT
