# Cluster Recipe 样板尝试记录：Level 1-5

更新时间：2026-07-07

## 为什么做这次尝试

用户指出：

> 最底层可以根据长宽设计样式，但上层棋盘和下层不是同一套规则，因为上层可以错位堆叠。到底怎么设计才能让结构清晰且符合预期？

因此本次不再只用“高度图”生成，而是尝试：

```text
底层轮廓 + 上层 cluster 覆盖块 + 注意力点 / 关键 tile
```

## 核心思路

### 旧方式

```text
每个格子一个高度数字
所有层由高度图自然切出来
每张高层 tile 再分配方向
```

问题：

- 上层像另一张棋盘。
- 视觉偏移后和预览不一致。
- 不容易说明玩家应该先消哪里、打开哪里。

### 新方式

```text
baseShape：底层决定大轮廓
clusters：上层决定覆盖片、入口、关键 tile
```

每个 cluster 有：

- 覆盖区域
- 所在层
- 统一偏移方向
- 覆盖比例
- 设计角色 role

## 本次生成范围

只重做：

`Level 1-5`

原 `Level 6-20` 暂时不动。

## 生成结果

| 关卡 | 结构名 | 层数 | 牌数 | bbox | cluster 组成 |
|---:|---|---:|---:|---|---|
| 1 | cluster_soft_arch_intro | 2 | 24 | 5.70×4.76 | base 18 + center_cover 6 |
| 2 | cluster_gentle_gate_intro | 2 | 30 | 5.70×3.82 | base 20 + left_cap 4 + right_cap 4 + center_key 2 |
| 3 | cluster_small_arch_intro | 3 | 36 | 5.70×5.70 | base 24 + top_bridge 4 + left_mid 3 + right_mid 3 + center_key 2 |
| 4 | cluster_double_column_intro | 3 | 42 | 5.70×5.70 | base 28 + left_column 5 + right_column 5 + bottom_bridge 2 + center_key 2 |
| 5 | cluster_three_peak_entry | 4 | 54 | 5.70×6.64 | base 30 + left_peak 6 + right_peak 6 + top_peak 2 + center_key 6 + bottom_release 2 + final_cap 2 |

## 设计意图

### Level 1

目标：最轻入门。

- 底层是柔和拱形。
- 上层只有一个中心覆盖块。
- 不强调复杂策略，只测试 cluster 模型是否更清楚。

### Level 2

目标：左右两个入口 + 中央小门槛。

- 左右各一个 cap。
- 中央有 `center_key`。
- 结构仍然轻。

### Level 3

目标：小拱形 + 顶部桥 + 左右中段。

- `top_bridge` 作为开局注意力点。
- 左右 `left_mid/right_mid` 提供区域切换。
- `center_key` 是轻关键点。

### Level 4

目标：双柱结构。

- 左右两列 cluster。
- 底部 bridge 释放。
- 中央 key 作为小门槛。

### Level 5

目标：三峰结构的轻量版本。

- 左右峰 + 顶峰 + 中央 key。
- 比之前 Level 5 轻，牌数从 78 降到 54。

## 验证结果

已验证：

- Level 1-5 tile 总数均为 3 的倍数。
- 每个图案数量均为 3 的倍数。
- Level 1-5 均未超过 7×8 真实视觉 bbox。
- Level 1-5 JSON 中已写入 `clusterId / clusterRole`，方便后续追溯。
- 1-20 整体仍合法。
- TS linter 无错误。

## 实验目录

`level_workbench/experiments/exp_cluster_recipe_l1_l5_v1/`

包含：

- `before/`：生成前的 Level 1-5 备份。
- `levels/`：生成后的 Level 1-5。
- `manifest.json`：生成说明。

## 后续观察重点

请重点体验：

- Level 1-5 是否比纯高度图更清楚。
- 上层是否更像“覆盖块 / 注意力点”，而不是另一张棋盘。
- 是否能看出先消哪里、打开哪里。
- cluster 的方向是否自然。
- Level 5 从 78 降到 54 后是否更适合前期。
