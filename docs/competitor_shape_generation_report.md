# 竞品截图风格测试棋盘生成记录

更新时间：2026-07-06

## 回答用户问题

用户问：“那你自己为什么不能生成呢？”

结论：可以生成。之前要求用户描述，是为了建立一套可复用的描述语言；但在已有截图和规则足够明确后，AI 可以直接基于截图抽象生成测试关。

## 本次生成目标

基于用户给的竞品截图，抽象出以下结构语言：

- 山形 / 金字塔结构
- 回字洞 / 中央空洞
- 左右塔
- 多岛连接
- 中央桥
- 宽底收束
- 三峰结构
- 螺旋洞
- 分段阶梯
- 双拱结构

同时遵守：

- 只有大 / 小两档砖块尺寸。
- 大砖：`6×7`。
- 小砖：`7×8`。
- 不超过 `7×8` 真实视觉 bbox。
- 边缘高层砖朝内偏。
- 中部砖允许多方向偏移。
- 允许少量 100% 或 90% 覆盖。

## 生成范围

已替换前置测试关：

`assets/resources/config/levels/level-001.json` 到 `level-020.json`

原正式关卡仍在：

`level-021.json` 到 `level-340.json`

## 生成结果

| 关卡 | 结构名 | 尺寸档 | bbox | 牌数 |
|---:|---|---|---|---:|
| 1 | jungle_mountain_compact | large | 5.70×6.64 | 90 |
| 2 | open_ring_dense | small | 6.64×7.58 | 93 |
| 3 | reef_arch_with_towers | small | 6.64×7.58 | 120 |
| 4 | center_bottle_bridge | small | 6.64×7.58 | 99 |
| 5 | three_peak_islands | large | 5.70×6.64 | 78 |
| 6 | left_right_columns | small | 6.64×6.64 | 75 |
| 7 | wide_base_pyramid | large | 5.70×6.64 | 78 |
| 8 | broken_u_shape | small | 6.64×6.64 | 90 |
| 9 | diagonal_flow | small | 6.64×7.58 | 60 |
| 10 | butterfly_bridge | small | 6.64×6.64 | 81 |
| 11 | central_tall_stack | large | 5.70×6.64 | 63 |
| 12 | two_side_hills | small | 6.64×6.64 | 90 |
| 13 | spiral_hole | small | 6.64×7.58 | 81 |
| 14 | staggered_steps | small | 6.64×7.58 | 72 |
| 15 | cave_mouth | large | 5.70×6.64 | 81 |
| 16 | triple_columns | small | 6.64×7.58 | 108 |
| 17 | low_wide_islands | small | 6.64×6.64 | 72 |
| 18 | reef_double_arch | small | 6.64×7.58 | 96 |
| 19 | star_compact | large | 5.70×6.64 | 78 |
| 20 | final_mixed_screenshot | small | 6.64×7.58 | 108 |

## 尺寸验证

只出现两档：

- `large`：约 `148.4`
- `small`：约 `127.4`

统计：

- 大砖关：6 个
- 小砖关：14 个

没有出现安全兜底缩小。

## 验证结果

已验证：

- 1-20 关结构均可读取。
- 真实视觉 bbox 均不超过 `7×8`。
- 只使用大 / 小两档砖块尺寸。
- 边缘高层砖方向均朝内。
- tile 总数均为 3 的倍数。
- 每个图案数量均为 3 的倍数。
- `BoardManager.ts` 无 linter 错误。
- `Types.ts` 无 linter 错误。

## 实验记录

实验目录：

`level_workbench/experiments/exp_prepend20_competitor_shapes_v2/`

其中包含：

- `before/`：生成前的 1-20 测试关备份。
- `levels/`：本次生成后的 1-20 测试关。
- `manifest.json`：生成说明和结构清单。

## 后续建议

现在可以直接在 HTML 结构预览页查看 1-20 拆层结构，再到 Cocos 真实体验。

重点观察：

1. 是否比之前更像竞品截图里的山形、拱形、洞形结构。
2. 大 / 小两档尺寸是否稳定。
3. 多方向堆叠是否更自然。
4. 是否有过多砖导致前期太重。
5. 哪些结构值得保留为模板。
