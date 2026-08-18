# 入门测试关调整记录

更新时间：2026-07-06

## 用户反馈

用户试玩后反馈：

1. 前 4 关砖块有点多。
2. `Level 5` 和 `Level 11` 更像新手入门结构。
3. `Level 9` 形状不好，后续尽量使用更有对称美的形状。

## 调整策略

本次只调整前置测试关，不影响正式顺延关卡 `Level 21-340`。

调整目标：

- 前 4 关降低牌量。
- 前 4 关全部使用大砖 `6×7` 档。
- 结构更接近 `Level 5 / Level 11` 的入门友好形态。
- 替换 `Level 9` 为对称结构。

## 调整结果

| 关卡 | 新结构名 | 尺寸档 | 层数 | 牌数 | bbox |
|---:|---|---|---:|---:|---|
| 1 | central_stack_intro | large | 3 | 42 | 5.70×6.64 |
| 2 | soft_mountain_intro | large | 3 | 48 | 5.70×5.70 |
| 3 | small_peak_intro | large | 4 | 54 | 5.70×6.64 |
| 4 | mini_double_hill_intro | large | 3 | 54 | 5.70×5.70 |
| 9 | symmetric_hourglass | small | 5 | 90 | 6.64×7.58 |

## 当前 1-20 关概览

| 关卡 | 结构 | 牌数 | 尺寸档 |
|---:|---|---:|---|
| 1 | central_stack_intro | 42 | large |
| 2 | soft_mountain_intro | 48 | large |
| 3 | small_peak_intro | 54 | large |
| 4 | mini_double_hill_intro | 54 | large |
| 5 | three_peak_islands | 78 | large |
| 6 | left_right_columns | 75 | small |
| 7 | wide_base_pyramid | 78 | large |
| 8 | broken_u_shape | 90 | small |
| 9 | symmetric_hourglass | 90 | small |
| 10 | butterfly_bridge | 81 | small |
| 11 | central_tall_stack | 63 | large |
| 12 | two_side_hills | 90 | small |
| 13 | spiral_hole | 81 | small |
| 14 | staggered_steps | 72 | small |
| 15 | cave_mouth | 81 | large |
| 16 | triple_columns | 108 | small |
| 17 | low_wide_islands | 72 | small |
| 18 | reef_double_arch | 96 | small |
| 19 | star_compact | 78 | large |
| 20 | final_mixed_screenshot | 108 | small |

## 验证结果

已验证：

- 1-20 关全部未超过 `7×8` 真实视觉 bbox。
- 前 4 关全部为大砖档。
- 前 4 关牌量已降到 `42 / 48 / 54 / 54`。
- 第 9 关已替换为对称 hourglass 结构。
- 每关 tile 总数为 3 的倍数。
- 每个图案数量为 3 的倍数。
- 相关 TS 文件无 linter 错误。

## 实验记录

实验目录：

`level_workbench/experiments/exp_intro_light_symmetric_v3/`

其中：

- `before/`：调整前的目标关卡备份。
- `levels/`：调整后的目标关卡。
- `manifest.json`：调整说明。
