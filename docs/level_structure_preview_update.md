# 关卡结构预览与前置 20 关结构更新记录

更新时间：2026-07-06

## 本次调整

### 1. HTML 预览改为按层拆解

文件：`level_review.html`

现在预览页只看结构，不模拟玩法，展示方式改为：

- `总高度图`：每个格子显示该位置堆叠高度。
- `按层拆解`：有几层就拆成几张独立平面图。
- `结构红线`：辅助检查是否存在整层满铺、外轮廓占用过高、层轮廓重复等问题。

这样不再把多层混在一张图里，便于直接判断每一层的形状。

### 2. 前置 20 个测试关改为不同结构

范围：`assets/resources/config/levels/level-001.json` 到 `level-020.json`

原 21-340 关未改动，仍然是之前顺延保留的正式关卡。

20 个测试结构分别为：

| 关卡 | 结构名 | 网格 | 层数 | 牌数 |
|---:|---|---:|---:|---:|
| 1 | soft_diamond | 5x5 | 3 | 24 |
| 2 | corner_cut_cluster | 5x6 | 2 | 30 |
| 3 | double_island_bridge | 6x7 | 4 | 51 |
| 4 | local_tower_6 | 5x5 | 6 | 42 |
| 5 | x_shape | 7x7 | 4 | 48 |
| 6 | ring_hole | 7x7 | 4 | 57 |
| 7 | diagonal_stair | 6x7 | 6 | 60 |
| 8 | butterfly | 6x8 | 4 | 78 |
| 9 | twin_towers | 7x7 | 5 | 75 |
| 10 | s_curve | 7x7 | 5 | 66 |
| 11 | hourglass | 7x7 | 5 | 87 |
| 12 | cross_plus | 7x7 | 6 | 72 |
| 13 | crescent | 7x7 | 4 | 66 |
| 14 | zigzag | 7x8 | 5 | 78 |
| 15 | checker_holes | 7x7 | 4 | 66 |
| 16 | wide_base | 7x7 | 5 | 117 |
| 17 | twin_diamonds | 6x9 | 4 | 78 |
| 18 | spiral | 7x7 | 3 | 72 |
| 19 | star | 7x7 | 6 | 72 |
| 20 | mixed_large | 8x8 | 6 | 120 |

## 验证结果

已验证：

- 1-20 测试关结构签名全部唯一。
- 1-20 测试关没有整层满铺。
- 1-20 测试关每关内部没有完全重复的层轮廓。
- 1-20 测试关总牌数均为 3 的倍数。
- 每个图案数量均为 3 的倍数。
- 每关顶层至少有一组三消入口。
- 原 21-340 关 JSON 仍可读取。

## 实验记录位置

本次生成的测试关同步保存到：

`level_workbench/experiments/exp_prepend20_structures_v1/`

如果后续测试效果不好，可以继续覆盖 1-20 测试关；原正式关卡仍保留在 21-340，且最早快照仍在：

`level_workbench/snapshots/20260706_201430_before_prepend20/`
