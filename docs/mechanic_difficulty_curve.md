# MeowTile 机制与难度曲线 v1

## 1. 目标

机制和难度调整不是“越往后越堆机制”，而是服务一条可理解的学习曲线：

```text
低压认识 → 单机制练习 → 双机制组合 → 多机制压力 → 子章节小考
```

难度控制单位应从“单关”上升到“子章节”：

```text
每个子章节前段：引入/复习
每个子章节中段：变化/组合
每个子章节末段：小考/收束
```

局外 meta 的拼豆进度按子章节推进，因此难度也要按子章节组织。

---

## 2. 当前 1-320 关机制分布盘点

当前关卡已扩到 `320`，并可按子章节完整覆盖。现有生成逻辑已经具备可运行基础，但机制节奏还偏“自动轮转”，下一步要做精调。

### 2.1 大章节机制密度

| Chapter | Level | Tile 范围 | 机制出现概况 |
|---|---:|---:|---|
| Chapter 1 | 1-12 | 42-66 | 已有 cover/crow/lock/drop/conveyor/golden，作为新手段偏复杂，需要回收简化 |
| Chapter 2 | 13-80 | 36-75 | 逐步覆盖 7 类障碍，适合机制教学与单机制练习 |
| Chapter 3 | 81-160 | 36-90 | 多机制组合密度明显增加 |
| Chapter 4 | 161-240 | 36-102 | 高压组合，适合作为后期挑战 |
| Chapter 5 | 241-320 | 36-102 | 当前与 Chapter 4 密度接近，应重构为“最终综合 + 主题收束” |

### 2.2 机制首次出现现状

当前数据统计：

| 机制 | 当前首次出现 | 判断 |
|---|---:|---|
| golden | 4 | 可接受，正向奖励机制 |
| cover | 2 | 可接受，但前几关要轻量 |
| crow | 3 | 偏早，应谨慎教学 |
| slotLockRight | 4 | 偏早，应避免和 crow 同时压新手 |
| dropChutes | 6 | 过早，建议推迟到 Chapter 2 |
| conveyors | 1 | 明显过早，建议从 Chapter 2 或更后引入 |
| piggies | 24 | 可接受 |
| skyscrapers | 25 | 可接受 |

结论：当前 `1-12` 的机制投放过早。Chapter 1 应更像“基础 + 轻机制”，不应让传送带/落地道具在新手最早阶段出现。

---

## 3. 推荐机制解锁顺序

### Chapter 1：Cozy Cat Room，Level 1-12

定位：新手学习，目标是“懂规则、通关有反馈、拼豆带来正循环”。

| 子章节 | Level | 建议机制 | 目标 |
|---|---:|---|---|
| ch1_01 | 1-4 | 无障碍 / 少量 cover / golden | 只教基础三消槽位和拼豆奖励 |
| ch1_02 | 5-8 | cover + golden | 认识盖牌和正向奖励 |
| ch1_03 | 9-12 | crow 或 slotLockRight 二选一，不能叠太重 | 轻压力收束 |

要求：

- 不出现 conveyors。
- 不出现 dropChutes。
- 不出现 skyscrapers。
- 不出现 piggies。
- `crow + slotLockRight` 不应同关出现，除非是第 12 关小考。

### Chapter 2：Cat Café Window，Level 13-80

定位：机制引入章。

| 子章节 | Level | 建议机制 | 目标 |
|---|---:|---|---|
| ch2_01 | 13-26 | crow / slotLockRight 复习 | 建立轻压力 |
| ch2_02 | 27-40 | dropChutes 首现 | 学会处理落地队列 |
| ch2_03 | 41-54 | skyscrapers 首现 | 学会优先级和障碍目标 |
| ch2_04 | 55-67 | conveyors 首现 | 学会移动队列 |
| ch2_05 | 68-80 | 2 机制组合 | Chapter 2 小考 |

### Chapter 3：Night Market Snack，Level 81-160

定位：中期组合。

- 每关 1-3 个障碍。
- 每个子章节主打一个组合主题。
- 不追求每关都复杂，要保留呼吸关。

建议：

| 子章节 | 主组合 |
|---|---|
| ch3_01 | cover + crow |
| ch3_02 | dropChutes + slotLockRight |
| ch3_03 | skyscrapers + cover |
| ch3_04 | conveyors + crow |
| ch3_05 | 3 机制小考 |

### Chapter 4：Sunny Beach Pawprints，Level 161-240

定位：后期挑战。

- 每关 2-4 个障碍。
- 子章节末段允许全家桶，但不能连续过多。
- 保留 golden 缓冲，避免纯压迫。

### Chapter 5：Rainy Alley Cat，Level 241-320

定位：最终综合，但需要有“雨巷主题收束”，不是机械复制 Chapter 4。

建议：

| 子章节 | Level | 主题机制节奏 |
|---|---:|---|
| ch5_01 | 241-256 | conveyors / dropChutes 复习，模拟雨巷流动感 |
| ch5_02 | 257-272 | piggies + cover，模拟纸箱遮挡与保护 |
| ch5_03 | 273-288 | crow + slotLockRight，模拟雨伞下空间受限 |
| ch5_04 | 289-304 | skyscrapers + dropChutes，模拟屋檐/摊位阻挡 |
| ch5_05 | 305-320 | 综合小考，最终几关允许 4-5 机制组合 |

---

## 4. 子章节内部难度节奏

### 4 关子章节，比如 ch1_01

```text
第 1 关：规则认识，低 tile 数，无障碍
第 2 关：轻变化，少量 cover
第 3 关：加入一个轻机制或更复杂布局
第 4 关：小考，完成拼豆图
```

### 13-16 关子章节

```text
前 25%：复习/引入
中 50%：变体/组合
后 25%：小考/收束
```

以 16 关为例：

```text
1-4：低压引入
5-8：机制变体
9-12：双机制组合
13-16：小考，最后一关高峰
```

---

## 5. 当前需要调整的重点

### 高优先级

1. **回收 Chapter 1 的 conveyors/dropChutes/skyscrapers/piggies**  
   Chapter 1 要为拼豆 meta 建立正反馈，不适合过早压机制。

2. **重新定义机制首次出现关卡**  
   当前 conveyors 出现在 Level 1，必须调整。

3. **Chapter 5 与 Chapter 4 做差异化**  
   当前 Chapter 5 由生成器延续 Stage 3 逻辑，密度和 Chapter 4 接近，需要按“雨巷”主题重排。

### 中优先级

1. 每个子章节最后一关做“小考”。
2. 子章节中间避免连续高压。
3. golden 作为正向缓冲，在高压段出现。

---

## 6. 建议的调关执行方式

不要直接手改 320 个 JSON。建议做一个专门的调关脚本或配置表：

```text
mechanic_curve.json / mechanic_curve.ts
```

核心字段：

```json
{
  "levelId": 241,
  "targetPressure": 3,
  "tileCountRange": [72, 84],
  "typeKindsRange": [12, 14],
  "mechanics": ["conveyors", "dropChutes"],
  "mustNotHave": ["piggies"]
}
```

或者按子章节配置：

```json
{
  "subchapterId": "ch5_01",
  "themeMechanics": ["conveyors", "dropChutes"],
  "introLevels": [241, 244],
  "comboLevels": [245, 252],
  "examLevels": [253, 256]
}
```

第一版可先做“规则化重写”：

1. 固定 Chapter 1 的机制投放。
2. 固定每个机制首次出现关卡。
3. Chapter 2-5 保留当前生成器结构，但按子章节覆盖主机制。
4. 跑全量校验。

---

## 7. 下一步建议

下一步应该做：

```text
建立 mechanic_curve 配置，并用它重生成/修正 1-320 的 mechanics 字段。
```

第一批只处理：

- Chapter 1 新手曲线
- Chapter 2 机制首次出现顺序
- Chapter 5 主题差异化

先不要细调每一关 tile 坐标，先把机制投放和压力曲线拉正。
