# MeowTile 局外 Meta 规范确认版

依据：`docs/meowtile_chapter_subchapter_bead_plan.md`。  
目标：把章节、子章节、关卡段、背景图、主题、拼豆图案统一到一套可实现的数据模型中。

## 1. 总体结构

```text
Chapter 大章节
└── Subchapter 子章节
    ├── levelRange：该子章节包含的主线关卡
    ├── theme：子章节主题/文案/色彩
    ├── background：对应局内与局外背景图
    └── beadPuzzle：该子章节的 1 张拼豆图
        └── groups：每关解锁的拼豆区域
```

确认规则：

- 总规划：`320` 关、`5` 大章节、`23` 个子章节。
- `1 个子章节 = 1 张拼豆图 = Collection 里 1 张卡片`。
- `1 个子章节有 N 个 level = 该拼豆有 N 个 group`。
- 每通 1 个主线关卡，解锁 1 个 group。
- Challenge 不给拼豆进度。
- 每个子章节开始前有 Start 弹窗，只弹一次。
- 每关通关后弹拼豆填色弹窗。
- 子章节最后一关完成弹窗按钮为 `Next`。
- `Next` 先进入下一个子章节 Start 弹窗，不直接跳下一关。
- 不做单独子章节 End 弹窗。
- Chapter 起始页暂不做。
- Chapter 结束页后续单独做温柔鼓励页，不展示拼豆合集。

## 2. 资源状态

已补回 Chapter 5 背景资源：

```text
assets/resources/newtheme/bg/chapter5/1.png
assets/resources/newtheme/bg/chapter5/2.png
assets/resources/newtheme/bg/chapter5/3.png
assets/resources/newtheme/bg/chapter5/4.png
assets/resources/newtheme/bg/chapter5/5.png
assets/resources/newtheme/bg/chapter5.meta
```

现在 `newtheme/bg/chapter1-5/*` 能覆盖 23 个子章节的背景规划。

当前项目已生成 `level-001.json` 到 `level-320.json`；Chapter 5 的 `241-320` 关卡文件已补齐。局外 meta 规范与当前关卡总量一致。

## 3. Chapter / Subchapter / Background / Puzzle 对应表

| Chapter | 章节主题 | Subchapter | Level | 背景图 | 拼豆 ID | 拼豆主题 | 辅助元素 |
|---|---|---|---:|---|---|---|---|
| 1 | Cozy Cat Room | `ch1_01` | 1-4 | `newtheme/bg/chapter1/1` | `ch1_01_cat_plays_yarn` | Cat Plays Yarn | 毛线球 |
| 1 | Cozy Cat Room | `ch1_02` | 5-8 | `newtheme/bg/chapter1/2` | `ch1_02_cat_stretching` | Cat Stretching | 坐垫 |
| 1 | Cozy Cat Room | `ch1_03` | 9-12 | `newtheme/bg/chapter1/3` | `ch1_03_cat_in_travel_bag` | Cat in Travel Bag | 旅行包 |
| 2 | Cat Café Window | `ch2_01` | 13-26 | `newtheme/bg/chapter2/1` | `ch2_01_cat_at_cafe_door` | Cat at Café Door | 门铃 / 小招牌 |
| 2 | Cat Café Window | `ch2_02` | 27-40 | `newtheme/bg/chapter2/2` | `ch2_02_cat_sniffs_latte` | Cat Sniffs Latte | 咖啡杯 |
| 2 | Cat Café Window | `ch2_03` | 41-54 | `newtheme/bg/chapter2/3` | `ch2_03_cat_eats_dried_fish` | Cat Eats Dried Fish | 小鱼干 |
| 2 | Cat Café Window | `ch2_04` | 55-67 | `newtheme/bg/chapter2/4` | `ch2_04_cat_kneads_cushion` | Cat Kneads Cushion | 坐垫 |
| 2 | Cat Café Window | `ch2_05` | 68-80 | `newtheme/bg/chapter2/5` | `ch2_05_cat_by_cafe_window` | Cat by Café Window | 窗框 / 灯串 |
| 3 | Night Market Snack | `ch3_01` | 81-96 | `newtheme/bg/chapter3/1` | `ch3_01_cat_under_lanterns` | Cat Under Lanterns | 灯笼 |
| 3 | Night Market Snack | `ch3_02` | 97-112 | `newtheme/bg/chapter3/2` | `ch3_02_cat_at_fish_stall` | Cat at Fish Stall | 摊台 / 鱼干盘 |
| 3 | Night Market Snack | `ch3_03` | 113-128 | `newtheme/bg/chapter3/3` | `ch3_03_cat_grabs_fish` | Cat Grabs Fish | 小鱼干 / 纸袋 |
| 3 | Night Market Snack | `ch3_04` | 129-144 | `newtheme/bg/chapter3/4` | `ch3_04_cat_with_snack_bag` | Cat with Snack Bag | 小吃袋 |
| 3 | Night Market Snack | `ch3_05` | 145-160 | `newtheme/bg/chapter3/5` | `ch3_05_cat_behind_stall` | Cat Behind Stall | 摊车 / 鱼骨 |
| 4 | Sunny Beach Pawprints | `ch4_01` | 161-176 | `newtheme/bg/chapter4/1` | `ch4_01_cat_runs_on_sand` | Cat Runs on Sand | 爪印 |
| 4 | Sunny Beach Pawprints | `ch4_02` | 177-192 | `newtheme/bg/chapter4/2` | `ch4_02_cat_digs_sand` | Cat Digs Sand | 沙堆 / 贝壳 |
| 4 | Sunny Beach Pawprints | `ch4_03` | 193-208 | `newtheme/bg/chapter4/3` | `ch4_03_cat_and_beach_ball` | Cat and Beach Ball | 沙滩球 |
| 4 | Sunny Beach Pawprints | `ch4_04` | 209-224 | `newtheme/bg/chapter4/4` | `ch4_04_cat_under_umbrella` | Cat Under Umbrella | 遮阳伞 / 饮料 |
| 4 | Sunny Beach Pawprints | `ch4_05` | 225-240 | `newtheme/bg/chapter4/5` | `ch4_05_cat_jumps_wave` | Cat Jumps Wave | 浪花 |
| 5 | Rainy Alley Cat | `ch5_01` | 241-256 | `newtheme/bg/chapter5/1` | `ch5_01_cat_steps_in_puddle` | Cat Steps in Puddle | 水坑 |
| 5 | Rainy Alley Cat | `ch5_02` | 257-272 | `newtheme/bg/chapter5/2` | `ch5_02_cat_in_cardboard_box` | Cat in Cardboard Box | 纸箱 |
| 5 | Rainy Alley Cat | `ch5_03` | 273-288 | `newtheme/bg/chapter5/3` | `ch5_03_cat_holds_umbrella` | Cat Holds Umbrella | 雨伞 |
| 5 | Rainy Alley Cat | `ch5_04` | 289-304 | `newtheme/bg/chapter5/4` | `ch5_04_cat_eats_fish_in_rain` | Cat Eats Fish in Rain | 屋檐 / 鱼干 |
| 5 | Rainy Alley Cat | `ch5_05` | 305-320 | `newtheme/bg/chapter5/5` | `ch5_05_cat_finds_warm_light` | Cat Finds Warm Light | 窗光 / 脚印 |

## 4. 推荐数据配置

### 4.1 `meta_chapters.json`

新增：

```text
assets/resources/config/meta/meta_chapters.json
```

它是局外 meta 的唯一真相源，负责：

- Chapter 定义。
- Subchapter 定义。
- 每个 subchapter 的 `levelRange`。
- 每个 subchapter 的 `background`。
- 每个 subchapter 对应的 `puzzleId` 和 `puzzleResource`。

结构示例：

```json
[
  {
    "id": "chapter1",
    "legacyChapterId": "france",
    "title": "Chapter 1",
    "name": "Cozy Cat Room",
    "displayName": "窗边出发",
    "levelRange": [1, 12],
    "theme": {
      "accentColor": "#A96E45",
      "background": "newtheme/bg/chapter1/1"
    },
    "subchapters": [
      {
        "id": "ch1_01",
        "title": "Cat Plays Yarn",
        "displayName": "Kitty Face",
        "levelRange": [1, 4],
        "background": "newtheme/bg/chapter1/1",
        "puzzleId": "ch1_01_cat_plays_yarn",
        "puzzleResource": "config/beads/ch1_01_cat_plays_yarn"
      }
    ]
  }
]
```

### 4.2 拼豆 JSON

每个子章节一份：

```text
assets/resources/config/beads/{puzzleId}.json
```

结构：

```json
{
  "id": "ch1_01_cat_plays_yarn",
  "chapterId": "chapter1",
  "subchapterId": "ch1_01",
  "title": "Cat Plays Yarn",
  "displayName": "Kitty Face",
  "levelRange": [1, 4],
  "cols": 37,
  "rows": 31,
  "palette": ["#14263A"],
  "groups": [
    { "id": 1, "unlockLevelId": 1, "name": "Outline + eyes" }
  ],
  "cells": [[0, 0, 0, 1]]
}
```

兼容当前验证包：如果老字段为 `groups[].levelId`，读取时映射为 `unlockLevelId`。

## 5. 背景映射要求

必须保证四处一致：

```text
Subchapter.background
= 局内关卡背景
= 子章节 Start 弹窗背景/氛围
= Collection 卡片主题缩略背景
= 通关拼豆弹窗氛围背景
```

后续应把当前 `levelIconThemes.ts` 的 `BACKGROUND_SUBCHAPTERS` 收敛为从 `meta_chapters.json` 派生，避免背景映射散落在代码里。

## 6. Collection 页规范

页面结构：

```text
CollectionsRoot
├── TopBar
│   ├── Back：回首页
│   ├── Title：Collection
│   └── Close：关闭 Collection 页面
├── ChapterTabs：Chapter 1-5
├── Grid：3 列 CollectionCard，数量按当前 Chapter 的 subchapters 决定
└── BottomProgress：当前章完成数 / 当前章总拼豆数
```

卡片状态：

| 状态 | 条件 | 展示 |
|---|---|---|
| 未解锁 | 玩家未到该子章节首关 | 灰豆完整占位 + 锁 |
| 已解锁未完成 | 已进入该子章节但未完成 | 灰豆 + 已解锁 group 彩色 |
| 已完成 | 通关该子章节最后一关 | 完整彩色拼豆 + 标题 |

## 7. 子章节流程规范

### Start

```text
进入目标 level
→ 找 subchapter
→ 如果 seenStart=false
   → 展示 Start 弹窗：灰豆空白图 + title + Start 按钮
   → 点击 Start 后 seenStart=true
   → 进入该子章节首关
→ 如果 seenStart=true
   → 直接进入目标 level
```

### Level Complete

```text
通关 level N
→ 找到 puzzle.groups 中 unlockLevelId=N 的 group
→ 写入 unlockedGroups
→ 展示拼豆填色弹窗
→ 非子章节最后一关：Continue → level N+1
→ 子章节最后一关：Next → 下一个子章节 Start 弹窗
```

### Chapter End

```text
通关某章最后一个子章节最后一关
→ 后续可进入 Chapter 结束鼓励页
→ 不展示拼豆合集
```

第一版可先不做 Chapter End 页。

## 8. 第一阶段实施范围

建议先跑通 `ch1_01`：

- Level：1-4。
- 背景：`newtheme/bg/chapter1/1`。
- 拼豆：`ch1_01_cat_plays_yarn`。
- 数据来源：`tile_memory/final/meowtile_originalB_ch1_01_package/01_data/ch1_01_cat_plays_yarn_cells.json`。
- Collection：Chapter 1 下至少显示 `ch1_01` 可进度，`ch1_02`、`ch1_03` 可先锁态占位。

确认跑通后，再扩展完整 23 个子章节。
