# 按层对称棋盘调整记录

更新时间：2026-07-07

## 用户新增原则

用户提出：

> 不是每一层都要铺满。但是每一层的图案尽量是轴对称或者中心对称的，比如左右，或者上下，或者四个角，这些都可以。

本次将该原则加入测试关生成规则。

## 原则理解

### 1. “不铺满”

每层都不应该是完整矩形，否则会产生：

- 棋盘太板。
- 视觉压力变大。
- 消除过程像一层层剥。

### 2. “每层有对称美”

每一层的形状尽量满足至少一种：

- 左右轴对称。
- 上下轴对称。
- 中心旋转对称。
- 四角均衡。

这样即使不是满铺，也会有设计感，不像随机洞。

### 3. 对称不是死板

对称是形状原则，不要求每张图案完全镜像。真实玩法仍然可以通过：

- 图案分布。
- 多方向堆叠。
- 局部高度变化。
- 关键 tile。

来制造策略和变化。

## 本次调整范围

重新生成前置测试关：

`assets/resources/config/levels/level-001.json` 到 `level-020.json`

原正式关卡仍保留在：

`level-021.json` 到 `level-340.json`

## 当前结构清单

| 关卡 | 结构名 | 网格 | 层数 | 牌数 | bbox | 尺寸档 |
|---:|---|---|---:|---:|---|---|
| 1 | soft_lr_seed | 7×6 | 2 | 24 | 5.70×4.76 | large |
| 2 | gentle_lr_bar | 7×6 | 3 | 30 | 5.70×3.82 | large |
| 3 | small_lr_arch | 7×6 | 3 | 36 | 5.70×3.82 | large |
| 4 | mini_lr_gate | 7×6 | 3 | 42 | 5.70×4.76 | large |
| 5 | three_peak_symmetric | 7×6 | 5 | 78 | 5.70×6.64 | large |
| 6 | open_ring_symmetric | 8×7 | 3 | 84 | 6.64×7.58 | small |
| 7 | wide_base_symmetric | 7×6 | 5 | 78 | 5.70×6.64 | large |
| 8 | broken_u_symmetric | 8×7 | 4 | 81 | 6.64×6.64 | small |
| 9 | hourglass_symmetric | 8×7 | 5 | 90 | 6.64×7.58 | small |
| 10 | butterfly_symmetric | 8×7 | 4 | 81 | 6.64×6.64 | small |
| 11 | central_stack_symmetric | 7×6 | 5 | 66 | 5.70×6.64 | large |
| 12 | two_hills_symmetric | 8×7 | 4 | 90 | 6.64×6.64 | small |
| 13 | spiral_box_symmetric | 8×7 | 4 | 102 | 6.64×7.58 | small |
| 14 | stepped_diamond_symmetric | 8×7 | 4 | 45 | 6.64×6.64 | small |
| 15 | cave_mouth_symmetric | 7×6 | 4 | 84 | 5.70×6.64 | large |
| 16 | four_corner_towers | 8×7 | 4 | 93 | 6.64×7.58 | small |
| 17 | low_wide_symmetric | 8×7 | 3 | 69 | 6.64×6.64 | small |
| 18 | double_arch_symmetric | 8×7 | 4 | 96 | 6.64×7.58 | small |
| 19 | star_symmetric | 7×6 | 5 | 78 | 5.70×6.64 | large |
| 20 | final_balanced_symmetric | 8×7 | 5 | 108 | 6.64×7.58 | small |

## 前 4 关递进

前 4 关继续保持低视觉压力：

```text
24 → 30 → 36 → 42
```

并且全部为大砖档。

## 验证结果

已验证：

- 每关 tile 总数都是 3 的倍数。
- 每个图案数量都是 3 的倍数。
- 1-20 关均未超过 `7×8` 真实视觉 bbox。
- 每一层都不是完整满铺。
- 每一层至少满足左右轴对称、上下轴对称或中心旋转对称之一。
- 相关 TS 文件无 linter 错误。

## 实验记录

实验目录：

`level_workbench/experiments/exp_symmetric_layer_shapes_v5/`

其中：

- `before/`：调整前 1-20 关备份。
- `levels/`：按层对称原则生成后的 1-20 关。
- `manifest.json`：调整说明。

## 后续建议

现在可以先在结构预览页查看每层拆解：

`http://127.0.0.1:8902/level_review.html`

重点看：

1. 每层是不是明显更规整、有设计感。
2. 是否仍然不够自然，过于机械对称。
3. 哪些结构适合保留为模板。
4. 前 4 关是否足够轻、足够适合入门。
