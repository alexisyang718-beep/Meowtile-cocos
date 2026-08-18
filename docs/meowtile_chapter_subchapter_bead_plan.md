# MeowTile 章节 / 子章节 / Level / 拼豆主题规划

## 1. 总体结构

| 项目 | 设定 |
|---|---|
| 总关卡 | 320 关 |
| 大章节 | 5 章 |
| 子章节 | 23 个 |
| 拼豆单位 | 每个子章节 1 张拼豆图 |
| 过关反馈 | 每关完成后弹出拼豆填色弹窗 |
| 子章节开始 | 有子章节起始弹窗，展示空白拼豆图 |
| 子章节结束 | 不做单独 End 弹窗；最后一关完成弹窗按钮为 `Next` |
| 章节起始页 | 暂不做 |
| 章节结束页 | 独立温柔鼓励页，后续另做，不展示拼豆合集 |
| 拼豆技术 | Original B 风格，代码渲染，`cells JSON` 驱动 |

---

## 2. Chapter 1：Cozy Cat Room

主题：小猫在温暖房间里的日常，玩耍、伸懒腰、准备出发。  
关卡范围：`Level 1-12`  
子章节数量：3 个，每个 4 关。

| 子章节 | Level | 拼豆 ID | 拼豆主题 | 动作内容 | 拼豆图辅助元素 |
|---|---:|---|---|---|---|
| 1-1 | 1-4 | `ch1_01_cat_plays_yarn` | Cat Plays Yarn | 小猫趴着/坐着抱毛线球 | 毛线球 |
| 1-2 | 5-8 | `ch1_02_cat_stretching` | Cat Stretching | 小猫拱背伸懒腰，前爪压低，尾巴翘起 | 坐垫 |
| 1-3 | 9-12 | `ch1_03_cat_in_travel_bag` | Cat in Travel Bag | 小猫从旅行包里探头，两只爪搭在包沿 | 旅行包 |

当前已验证并打包的是：

```text
ch1_01_cat_plays_yarn
```

验证包路径：

```text
tile_memory/final/meowtile_originalB_ch1_01_package/
```

---

## 3. Chapter 2：Cat Café Window

主题：小猫来到猫咖，在窗边度过舒服的一天。  
关卡范围：`Level 13-80`  
子章节数量：5 个。

| 子章节 | Level | 拼豆 ID | 拼豆主题 | 动作内容 | 拼豆图辅助元素 |
|---|---:|---|---|---|---|
| 2-1 | 13-26 | `ch2_01_cat_at_cafe_door` | Cat at Café Door | 小猫踮脚按猫咖门铃，身体微微前倾 | 门铃 / 小招牌 |
| 2-2 | 27-40 | `ch2_02_cat_sniffs_latte` | Cat Sniffs Latte | 小猫低头闻拿铁奶泡，表情满足 | 咖啡杯 |
| 2-3 | 41-54 | `ch2_03_cat_eats_dried_fish` | Cat Eats Dried Fish | 小猫抱着小鱼干啃，两只爪抱住鱼干 | 小鱼干 |
| 2-4 | 55-67 | `ch2_04_cat_kneads_cushion` | Cat Kneads Cushion | 小猫在软垫上踩奶，两只前爪下压 | 坐垫 |
| 2-5 | 68-80 | `ch2_05_cat_by_cafe_window` | Cat by Café Window | 小猫坐窗边晃尾巴，侧头看窗外 | 窗框 / 灯串 |

---

## 4. Chapter 3：Night Market Snack

主题：小猫闻着香味来到夜市小鱼干摊。  
关卡范围：`Level 81-160`  
子章节数量：5 个，每个 16 关。

| 子章节 | Level | 拼豆 ID | 拼豆主题 | 动作内容 | 拼豆图辅助元素 |
|---|---:|---|---|---|---|
| 3-1 | 81-96 | `ch3_01_cat_under_lanterns` | Cat Under Lanterns | 小猫仰头看灯笼，眼睛亮亮 | 灯笼 |
| 3-2 | 97-112 | `ch3_02_cat_at_fish_stall` | Cat at Fish Stall | 小猫扒着鱼干摊台探头，两只爪露出 | 摊台 / 鱼干盘 |
| 3-3 | 113-128 | `ch3_03_cat_grabs_fish` | Cat Grabs Fish | 小猫伸爪偷拿小鱼干，动作斜向前 | 小鱼干 / 纸袋 |
| 3-4 | 129-144 | `ch3_04_cat_with_snack_bag` | Cat with Snack Bag | 小猫叼着小吃袋小跑，尾巴翘起 | 小吃袋 |
| 3-5 | 145-160 | `ch3_05_cat_behind_stall` | Cat Behind Stall | 小猫躲在摊车后偷吃，只露出头和爪 | 摊车 / 鱼骨 |

---

## 5. Chapter 4：Sunny Beach Pawprints

主题：小猫在海边玩耍，追逐浪花，留下爪印。  
关卡范围：`Level 161-240`  
子章节数量：5 个，每个 16 关。

| 子章节 | Level | 拼豆 ID | 拼豆主题 | 动作内容 | 拼豆图辅助元素 |
|---|---:|---|---|---|---|
| 4-1 | 161-176 | `ch4_01_cat_runs_on_sand` | Cat Runs on Sand | 小猫开心奔跑，身后留一串爪印 | 爪印 |
| 4-2 | 177-192 | `ch4_02_cat_digs_sand` | Cat Digs Sand | 小猫低头刨沙，旁边有小沙堆 | 沙堆 / 贝壳 |
| 4-3 | 193-208 | `ch4_03_cat_and_beach_ball` | Cat and Beach Ball | 小猫扑向沙滩球，身体斜向跳起 | 沙滩球 |
| 4-4 | 209-224 | `ch4_04_cat_under_umbrella` | Cat Under Umbrella | 小猫坐在遮阳伞下休息，尾巴圈起来 | 遮阳伞 / 饮料 |
| 4-5 | 225-240 | `ch4_05_cat_jumps_wave` | Cat Jumps Wave | 小猫跳过小浪花，爪子离地 | 浪花 |

---

## 6. Chapter 5：Rainy Alley Cat

主题：雨巷里的小猫，从躲雨到找到温暖。  
关卡范围：`Level 241-320`  
子章节数量：5 个，每个 16 关。

| 子章节 | Level | 拼豆 ID | 拼豆主题 | 动作内容 | 拼豆图辅助元素 |
|---|---:|---|---|---|---|
| 5-1 | 241-256 | `ch5_01_cat_steps_in_puddle` | Cat Steps in Puddle | 小猫踩水坑溅起水花，一只脚抬起 | 水坑 |
| 5-2 | 257-272 | `ch5_02_cat_in_cardboard_box` | Cat in Cardboard Box | 小猫从纸箱里探头，两只爪搭在箱沿 | 纸箱 |
| 5-3 | 273-288 | `ch5_03_cat_holds_umbrella` | Cat Holds Umbrella | 小猫抱着小伞躲雨，伞盖包住主体 | 雨伞 |
| 5-4 | 289-304 | `ch5_04_cat_eats_fish_in_rain` | Cat Eats Fish in Rain | 小猫在屋檐下吃鱼干，外面有少量雨线 | 屋檐 / 鱼干 |
| 5-5 | 305-320 | `ch5_05_cat_finds_warm_light` | Cat Finds Warm Light | 小猫走向暖窗光并回头，留下小脚印 | 窗光 / 脚印 |

---

## 7. “拼豆图辅助元素”说明

表格里的“拼豆图辅助元素”不是游戏里的 booster、道具栏或额外奖励物品。

它指的是：

> 每张子章节拼豆图里，为了表达猫咪动作和场景主题而出现的 1-2 个辅助物件。

例如：

- `Cat Plays Yarn` 里的毛线球。
- `Cat Sniffs Latte` 里的咖啡杯。
- `Cat Holds Umbrella` 里的雨伞。
- `Cat Jumps Wave` 里的浪花。

这些元素只出现在拼豆图本身，不单独出现在棋盘、商店、道具栏或奖励栏。

---

## 8. 每个子章节的弹窗流程

每个子章节统一使用：

```text
Start 弹窗
↓
Level N 完成弹窗
↓
Level N+1 完成弹窗
↓
...
↓
子章节最后一关完成弹窗，按钮为 Next
```

以 Chapter 1-1 为例：

| 环节 | 说明 | Button |
|---|---|---|
| 子章节开始 | 展示空白拼豆图 | `Start` |
| Level 1 完成 | 填第 1 组区域 | `Continue` |
| Level 2 完成 | 填第 2 组区域 | `Continue` |
| Level 3 完成 | 填第 3 组区域 | `Continue` |
| Level 4 完成 | 拼豆图完成 | `Next` |

---

## 9. 拼豆图实现方式

最终不是每一关做一张图，而是：

```text
每个子章节 1 份 cells JSON
+ 通用拼豆渲染组件
+ 通用奖励弹窗组件
```

每个 cell 数据：

```json
[x, y, colorId, groupId]
```

含义：

| 字段 | 说明 |
|---|---|
| `x` | 格子横坐标 |
| `y` | 格子纵坐标 |
| `colorId` | 最终颜色 |
| `groupId` | 第几关 / 第几阶段填充 |

外部空白区域不存储、不渲染。

---

## 10. 当前最终风格基准

采用：

> Original B 风格

关键特征：

- 异形轮廓。
- 低色数。
- 固定格子。
- 每格单色。
- 外部透明。
- 空白状态只显示图案内部浅灰格子。
- 过关后按区域填色。

当前验证包：

```text
tile_memory/final/meowtile_originalB_ch1_01_package/
```

其中第一个子章节 `ch1_01_cat_plays_yarn` 已完成完整样板。
