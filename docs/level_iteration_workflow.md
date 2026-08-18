# 关卡调整可追溯 / 可回退工作流 v0.1

> 目标：外部 HTML 只用于预览棋盘结构；真实体验只在 Cocos 里完成。同时保证当前可运行版本不被随意破坏，所有关卡调整都有记录、可对比、可回退。

## 1. 基本原则

### 1.1 HTML 只做结构预览

外部 HTML 不再承担“试玩”职责，只看结构：

- 棋盘轮廓
- 每层分布
- 高度图 / 层级热力
- 每层是否过于方正
- 图案数量统计
- 图案在层级上的分布
- 是否有整层满铺风险

HTML 不判断：

- Cocos 真实遮挡
- Cocos 真实点击
- tile 美术比例
- 飞入槽位手感
- 真实槽位压力

这些只在 Cocos 里体验。

### 1.2 Cocos 是唯一体验标准

所有“好不好玩”的判断，以 Cocos 实机 / 预览运行效果为准。

HTML 结构预览只回答：

> 这关结构有没有问题？

Cocos 体验回答：

> 这关玩起来好不好？

### 1.3 关卡调整必须可追溯

任何关卡修改都必须知道：

- 改了哪几关
- 为什么改
- 改前是什么
- 改后是什么
- 谁确认过
- 能不能回退

---

## 2. 建议目录结构

后续建议在 `meowtile_cocos` 下新增一个关卡工作区：

```text
meowtile_cocos/
  assets/resources/config/levels/        # Cocos 当前实际读取的正式关卡
  level_workbench/
    snapshots/                           # 自动快照，保存可回退版本
      20260706_2000_before_exp001/
        levels/
        manifest.json
    experiments/                         # 每次实验方案
      exp001_level_1_10_shape_v1/
        levels/
          level-001.json
          level-002.json
        manifest.json
        notes.md
    feedback/
      level_feedback.json                # 用户评分与备注
```

说明：

- `assets/resources/config/levels/` 是 Cocos 真正使用的关卡目录。
- `level_workbench/experiments/` 是实验草稿，不会自动影响游戏。
- 每次把实验应用到 Cocos 前，必须先生成快照。
- 回退时从 `snapshots/` 恢复。

---

## 3. 单次关卡实验流程

### Step 1：创建实验

每次调整关卡，不直接改正式目录，而是创建一个实验：

```text
exp001_level_1_10_shape_v1
```

实验里包含：

- 修改后的关卡 JSON
- `manifest.json`
- `notes.md`

### Step 2：HTML 结构预览

HTML 读取实验目录，展示结构预览：

- 每关轮廓
- 每层热力
- 图案分布
- 是否有红线问题

这一步只判断结构，不打玩法分。

### Step 3：应用到 Cocos 前自动快照

当实验要进入 Cocos 体验时，执行“应用实验”。

应用前自动复制当前正式关卡到：

```text
level_workbench/snapshots/时间戳_before_exp001/
```

这样不管实验结果如何，都能回退。

### Step 4：应用实验到正式关卡目录

将实验中的关卡复制到：

```text
assets/resources/config/levels/
```

只覆盖实验声明的关卡，例如只覆盖 `level-001` 到 `level-010`。

### Step 5：Cocos 中真实体验

在 Cocos 中体验对应关卡。

评分项仍然使用质量模型：

- `visualScore`
- `shapeScore`
- `depthScore`
- `pressureScore`
- `flowScore`

但评分来源必须是真实 Cocos 体验，不是 HTML 模拟。

### Step 6：记录反馈

反馈写入：

```text
level_workbench/feedback/level_feedback.json
```

每条反馈包含：

```json
{
  "experimentId": "exp001_level_1_10_shape_v1",
  "levelId": 1,
  "scores": {
    "visualScore": 4,
    "shapeScore": 3,
    "depthScore": 2,
    "pressureScore": 2,
    "flowScore": 4
  },
  "note": "第一眼舒服，但还是有点像整层剥。",
  "createdAt": "2026-07-06T20:00:00+08:00"
}
```

### Step 7：决定保留或回退

如果实验通过：

- 将实验标记为 `accepted`
- 记录通过原因
- 保留当前正式关卡

如果实验失败：

- 从最近快照恢复
- 将实验标记为 `rejected`
- 记录失败原因

---

## 4. manifest.json 字段建议

每个实验都要有 `manifest.json`。

示例：

```json
{
  "id": "exp001_level_1_10_shape_v1",
  "title": "Level 1-10 普通棋盘结构样板 v1",
  "status": "draft",
  "createdAt": "2026-07-06T20:00:00+08:00",
  "baseSnapshot": "20260706_2000_before_exp001",
  "levelsChanged": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  "goals": [
    "Level 2 开始出现明显轮廓变化",
    "Level 4 出现局部 5-6 层高点",
    "避免任意一层完整满铺",
    "形成轻微交错暴露"
  ],
  "qualityTargets": {
    "visualScore": 4,
    "shapeScore": 4,
    "depthScore": 3,
    "pressureScore": 2,
    "flowScore": 4
  },
  "notes": "不加入特殊机制，只验证普通棋盘结构。"
}
```

状态可选：

- `draft`：草稿
- `applied`：已应用到 Cocos 正式目录，正在体验
- `accepted`：通过，保留
- `rejected`：失败，已回退
- `archived`：归档

---

## 5. 回退策略

### 5.1 快速回退

任何实验应用前都创建快照，所以回退只需要：

```text
snapshot/levels/* → assets/resources/config/levels/
```

### 5.2 只回退部分关卡

如果只想回退某几关，例如 Level 1-4：

```text
snapshot/levels/level-001.json → assets/resources/config/levels/level-001.json
snapshot/levels/level-002.json → assets/resources/config/levels/level-002.json
...
```

### 5.3 Git 仍作为最终保险

如果仓库启用了 Git：

- 实验前建分支或提交 checkpoint。
- 每个 accepted 实验再提交。
- 快照是面向策划和工具的回退机制，Git 是工程最终保险。

---

## 6. HTML 结构预览应如何改造

现有 `level_review.html` 的“试玩”逻辑不应继续作为主要判断依据。

建议拆成两个页面：

### 6.1 `level_structure_preview.html`

只做结构预览：

- 轮廓图
- 每层平面图
- 高度热力图
- 图案分布表
- 可见图案统计
- 结构红线检查

不做槽位、不做点击、不模拟通关。

### 6.2 `level_feedback.html`

只做评分记录：

- 选择实验 ID
- 选择关卡
- 五维打分
- 备注
- 保存反馈

体验必须来自 Cocos。

---

## 7. 为什么这套流程更安全

### 7.1 当前版本不受影响

实验默认在 `level_workbench/experiments/`，不会被 Cocos 读取。

只有明确执行“应用实验”时，才覆盖正式关卡。

### 7.2 每次应用都能回退

应用前自动快照，不怕试错。

### 7.3 反馈能绑定实验

每条反馈都带 `experimentId`，以后可以知道：

> 这个评分是针对哪一版关卡。

### 7.4 HTML 不再误导体验

HTML 只看结构，真实体验回到 Cocos。

### 7.5 适合逐步打磨样板

先做：

```text
exp001：Level 1-10 结构样板 v1
exp002：Level 1-10 结构样板 v2
exp003：Level 1-10 压力调优 v1
```

每版都能比较，不会混乱。

---

## 8. 推荐下一步

建议下一步不是直接重做大量关卡，而是先把工具工作流搭起来：

1. 新增 `level_workbench/` 目录。
2. 做“创建快照”脚本。
3. 做“应用实验”脚本。
4. 做“回退快照”脚本。
5. 把 HTML 从“试玩页”改为“结构预览页”。
6. 把评分从“试玩页”独立成“反馈页”。
7. 然后创建第一个实验：`exp001_level_1_10_shape_v1`。

第一批实验只动 Level 1-10，不动 1-320 全量。
