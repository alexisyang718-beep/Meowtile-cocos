# MeowTile Level Gene / PCG 流水线 v0.1

更新时间：2026-07-07

## 0. 当前共识

我们不再把关卡生产理解为“手摆棋盘”或“AI 画棋盘”，而是采用：

```text
Level Gene 配方
→ Triple Tile 专用贪心回溯生成器
→ DFS 求解器 Validator
→ 低强度视觉扰动
→ 输出 level.json
```

目标是：

- 策划写配方，不逐关画棋盘。
- 同一配方换 seed 可以生成大量不同关。
- 关卡合格与否由求解器和规则校验判断。
- 人只审核少量样板和异常，不肉眼审所有关。

---

## 1. 第一层：Level Gene 关卡配方表

每关只需要一个 Level Gene 配置。它不是最终棋盘，而是生成棋盘的“基因”。

### 1.1 Gene 核心字段

```json
{
  "id": "gene_intro_001",
  "seed": 1001,
  "gridSize": "6x7",
  "heightWeights": {
    "h1": 0.70,
    "h2": 0.25,
    "h3": 0.05
  },
  "mechanicBlacklist": ["piggy", "conveyor", "dropChute", "skyscraper"],
  "iconPoolSize": 6,
  "redundancyK": 1.20,
  "interferencePattern": "soft_center",
  "openingFlow": {
    "immediateMatches": [2, 3],
    "candidatePairs": [3, 5],
    "firstStepsChain": 4,
    "softGatesAfterGroups": [4]
  },
  "validatorThresholds": {
    "minSolutionDepth": 8,
    "maxSolutionDepth": 18,
    "minBranchingFactor": 2.0,
    "maxBottleneckDepth": 3
  }
}
```

### 1.2 网格尺寸规则

用户接受三种尺寸：

| 尺寸 | 用途 | 投放限制 |
|---|---|---|
| `6×7` | 大砖，前期/常规轻量关 | 主要尺寸 |
| `7×8` | 小砖，中期/复杂结构 | 次主要尺寸 |
| `8×9` | 更小砖，后期/少量变化 | 从第 3 章开始才出现；每个子章节最多 2 次 |

> 注：用户原话“从第三张开始”这里按上下文理解为“从第三章开始”。如果后续确认是“第三个子章节”，再调整规则。

### 1.3 8×9 投放约束

需要在配方层强约束：

```json
{
  "gridSize": "8x9",
  "unlockFromChapter": 3,
  "maxPerSubchapter": 2
}
```

生成器应检查：

```text
如果 chapter < 3，则禁止 8×9。
如果当前 subchapter 已经有 2 个 8×9，则禁止继续生成 8×9。
```

### 1.4 层数分布权重

这是难度核心之一。

示例：

| 阶段 | 1 层格 | 2 层格 | 3 层格 | 说明 |
|---|---:|---:|---:|---|
| 新手 | 70% | 25% | 5% | 低压、清晰 |
| 常规 | 55% | 35% | 10% | 有遮挡和轻策略 |
| 中期 | 45% | 40% | 15% | 增强追踪 |
| 硬核 | 40% | 40% | 20% | 记忆压力高 |

### 1.5 道具 / 机制黑名单

当前阶段默认：

```json
"mechanicBlacklist": ["piggy", "conveyor", "dropChute", "skyscraper", "cover"]
```

保留未来候选：

```json
"allowedMechanics": ["golden", "slotLockRight", "crow"]
```

但在普通棋盘样板阶段仍然建议：

```json
"allowedMechanics": []
```

### 1.6 品类池大小 iconPoolSize

用于控制本关使用多少种图标。

| iconPoolSize | 体验 |
|---:|---|
| 4-5 | 更容易形成连续消，但容易重复 |
| 6-8 | 休闲常规 |
| 9-11 | 视觉复杂，策略追踪更强 |

注意：图标种类不是越少越简单，也不是越多越难，需要配合 `K`、开局可消组和可见重复密度一起判断。

### 1.7 三元组冗余系数 K

K 是“爽不爽”的关键指标。

初步定义：

```text
K = 实际可形成三消组数 / 通关所需最小组数
```

或在生成器中近似为：

```text
K = 图案分配冗余度
```

建议范围：

| K | 体验 |
|---:|---|
| 1.05 | 烧脑、容错低 |
| 1.10-1.30 | 休闲黄金区间 |
| 1.25 | 欧美休闲偏好可能更舒适 |
| 1.30+ | 太顺，可能缺少策略 |

当前建议：

```text
前期 K = 1.20-1.30
中期 K = 1.12-1.25
后期 K = 1.05-1.18
```

### 1.8 分层干扰矩阵

分层干扰矩阵决定上层盖哪里，不应完全随机。

它可以用模板名表示：

```json
"interferencePattern": "soft_center"
```

也可以显式表示为二维权重：

```json
"interferenceMatrix": [
  [0.1, 0.2, 0.3, 0.3, 0.2, 0.1],
  [0.2, 0.5, 0.7, 0.7, 0.5, 0.2],
  [0.3, 0.8, 1.0, 1.0, 0.8, 0.3]
]
```

但必须保留：

```text
呼吸走廊 breathing corridor
```

也就是某个连续区域不要被上层盖死，保证通路可达和视觉透气。

---

## 2. 第二层：贪心回溯布局生成器

不要用 WFC。原因：

- WFC 擅长局部拼接，不擅长三消解链。
- 多层遮挡下容易死解。
- 生成慢，且很难控制开局、压力、关键 tile。

采用：

```text
自上而下分层贪心回填 + 回溯剪枝
```

### 2.1 生成流程

```text
1. 根据 gridSize 建立基础网格
2. 根据 heightWeights 生成底层和高度候选
3. 先铺最底层全部有效格子
4. 严格按三元组配额分配图案，保证每类数量为 3 的倍数
5. 从顶层往下按 interferenceMatrix 采样坐标
6. 保留 breathing corridor，不让上层完全盖死通路
7. 放置上层覆盖 tile / cluster
8. 进行局部冲突检测
9. 如果 120 次内找不到有效消除链，丢弃 seed 重跑
```

### 2.2 底层生成

底层负责大轮廓：

- 对称或中心平衡。
- 不满铺。
- 控制在 gridSize 内。
- 形成清晰外形。

### 2.3 上层生成

上层不是另一张棋盘，而是：

```text
覆盖片 + 注意力点 + 关键 tile
```

生成规则：

- 从顶层往下采样。
- 按干扰矩阵权重决定覆盖位置。
- 每个上层 cluster 内方向一致。
- 镜像 cluster 方向镜像。
- 边缘 cluster 朝中心。
- 中部 cluster 可以多方向。
- 少量允许 100% 或 90% 覆盖。

### 2.4 呼吸走廊 breathing corridor

呼吸走廊是一个连续留白区，作用：

- 保证视觉不满。
- 保证通路可达。
- 保证玩家能看出局部结构。

可作为配方字段：

```json
"breathingCorridor": {
  "type": "vertical_center",
  "width": 1,
  "strength": 0.8
}
```

### 2.5 局部冲突检测

原材料提到：

> 相邻 4 格禁止出现现成三连，玩家一眼看到会贬值。

需要结合我们之前规则修正：

- 开局仍需要 2-3 组可消。
- 但这些可消组不应扎堆在局部 2×2 / 4 邻域内。
- 禁止的是“局部相邻现成三连扎堆”，不是禁止全部开局三消。

可执行规则：

```text
开局可消组 2-3 个，但至少覆盖 2-3 个区域。
任意 2×2 / 邻近 4 格内不出现过密三连。
同图案可见重复不能集中在一个局部块。
```

### 2.6 回溯容错

```text
maxLayoutAttempts = 120
```

如果连续 120 次：

- 找不到有效开局链。
- Bot 无法在阈值内求解。
- 局部冲突过多。

则丢弃 seed，换 seed 重跑。

---

## 3. 第三层：Validator DFS 求解器

Validator 是流水线灵魂。

生成完棋盘后必须立刻交给 Bot 求解。

### 3.1 Bot 输入

```text
level.json
slotCapacity
遮挡关系
图案 matchKey
可点击状态
```

### 3.2 DFS 基本逻辑

```text
state = 当前棋盘 + 槽位
找出所有可点击 tile
逐个尝试点击
如果形成三消，释放槽位
递归进入下一状态
如果槽满，回溯
如果清空，记录解
```

### 3.3 深度限制

原材料提到 Tile Club 原版 DFS 深度限制是 18 层。

我们可以先设：

```json
"dfsDepthLimit": 18
```

注意：这里的 18 不是整关总步数，而是搜索窗口深度 / 局部规划深度。

### 3.4 输出三个难度指标

#### 1. 最短解深度 shortestSolutionDepth

代表最少需要多少步 / 局部搜索深度能打开局面。

#### 2. 平均分支度 averageBranchingFactor

代表自由度。

```text
数值越高，玩家可选路径越多，通常越爽。
数值太低，容易卡死或线性。
```

#### 3. 瓶颈层数 bottleneckDepth

代表关卡是否会在中后期突然卡死。

例如：

```text
连续若干状态平均可选分支 < 阈值
```

即可判为瓶颈。

### 3.5 配方阈值

每个 Gene 可以设置：

```json
"validatorThresholds": {
  "minSolutionDepth": 8,
  "maxSolutionDepth": 18,
  "minBranchingFactor": 2.0,
  "maxBottleneckDepth": 3
}
```

不满足则废弃。

---

## 4. 第四层：扰动噪声

扰动噪声用于让同一配方不同 seed 看起来不同，但不破坏解结构。

### 4.1 局部小块置换

在 `3×3` 区域内随机互换同类 tile。

约束：

- 不改变每类图案总数。
- 不破坏三元组数量。
- 不破坏开局链。
- 不破坏关键 tile。

### 4.2 区块偏移噪声

对整片连通区域做整体位移偏移。

可用：

```text
Perlin noise / seed noise
```

但必须满足：

- 不超过 6×7 / 7×8 / 8×9 尺寸边界。
- 不破坏边缘朝内规则。
- 不破坏遮挡依赖。

### 4.3 扰动顺序

建议顺序：

```text
生成基础结构
→ 求解器验证
→ 轻扰动
→ 再验证一次
→ 输出
```

---

## 5. 与我们当前工作的差距

当前已有：

- 测试关实验区。
- 大 / 小 / 后期第三尺寸的讨论。
- 层级方向字段。
- 结构预览。
- 质量模型文档。
- Cluster recipe 试验。

当前缺失：

1. Level Gene 正式 JSON 数据层。
2. 从 Gene 到 level.json 的生成器。
3. 分层干扰矩阵。
4. 呼吸走廊。
5. 三元组冗余 K 的精确定义与实现。
6. DFS Validator。
7. 自动筛选 / 批量吐关。
8. 扰动噪声层。

---

## 6. 推荐落地顺序

### Step 1：Level Gene v0.1

建立：

```text
assets/resources/config/level_genes/
```

先写 5 个 gene。

### Step 2：生成器 v0.1

建立：

```text
level_workbench/tools/generate_from_gene.py
```

先支持：

- gridSize
- heightWeights
- iconPoolSize
- redundancyK
- interferencePattern
- seed

### Step 3：Validator v0.1

先做静态 + 浅 DFS：

- 可点击计算
- 槽位模拟
- DFS depth 18
- shortestSolutionDepth
- branchingFactor
- bottleneckDepth

### Step 4：扰动 v0.1

先做：

- 同类 tile 局部置换
- 小范围 cluster 偏移

### Step 5：批量生成候选

先不生成 10000 关。

建议：

```text
5 个 gene × 每个 20 个 seed = 100 个候选
筛出 10 个
人工体验 5 个
```

---

## 7. 当前决策

用户接受：

- 三种网格尺寸。
- 8×9 从第 3 章开始出现。
- 每个子章节最多 2 次。
- 规则约束式 PCG。
- 贪心回溯生成。
- DFS Validator。
- 扰动噪声。

下一步应正式进入：

```text
Level Gene v0.1 数据层 + generate_from_gene.py 雏形
```
