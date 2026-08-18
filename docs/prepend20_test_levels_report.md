# 前置 20 个测试关执行记录

## 目的

为了快速在 Cocos 中体验和迭代样板关，在当前版本前面增加 `20` 个测试关。

这样可以做到：

- 测试关放在 `Level 1-20`，体验入口更快。
- 原来的 `Level 1-320` 不丢失，整体顺延为 `Level 21-340`。
- 如果测试关不好，可以从快照回退到前置前状态。
- HTML 只用于结构预览；真实体验仍然在 Cocos 中完成。

## 当前关卡范围

| 范围 | 用途 |
|---|---|
| `Level 1-20` | 前置测试关 |
| `Level 21-340` | 原 `Level 1-320` 顺延保留 |

## 已创建快照

快照目录：

`level_workbench/snapshots/20260706_201430_before_prepend20/`

其中包含：

- 前置前的 `level-001.json` 到 `level-320.json`
- 前置前的关键配置：
  - `chapters.json`
  - `meta_chapters.json`
  - `ch1_01_cat_plays_yarn.json`
  - `levelIconThemes.ts`
  - `AppFlowController.ts`
  - `LevelSelectView.ts`
- `manifest.json`

## 已完成调整

### 1. 关卡文件

- 当前正式关卡数：`340`
- 测试关：`level-001.json` 到 `level-020.json`
- 原关卡顺延：原 `level-001.json` 到 `level-320.json` → 当前 `level-021.json` 到 `level-340.json`

### 2. 章节配置

`chapters.json` 增加：

- `review_test`
- 范围：`1-20`

原章节顺延：

- `chapter1`：`21-32`
- `chapter2`：`33-100`
- `chapter3`：`101-180`
- `chapter4`：`181-260`
- `chapter5`：`261-340`

### 3. 局外 meta 配置

`meta_chapters.json` 增加测试章节：

- `review_test_01`：`1-10`
- `review_test_02`：`11-20`

原局外 meta 顺延到 `21-340`。

测试章节不绑定拼豆数据；Cocos 不会在测试关前弹拼豆 Start 弹窗。

### 4. 拼豆数据

`ch1_01_cat_plays_yarn.json` 的解锁关卡顺延：

- 原 `1-4`
- 当前 `21-24`

### 5. 最大关卡数

`AppFlowController` 最大关卡数更新为：

`340`

### 6. 背景映射

`levelIconThemes.ts` 更新为：

- `1-20` 测试关背景映射
- `21-340` 原关卡背景顺延映射

### 7. HTML 调整

`level_review.html` 已改为：

- 结构预览页
- 不再模拟玩法
- 显示轮廓 / 单层 / 顶层 / 高度热力
- 仍可记录 Cocos 真实体验后的五维评分

评分保存到：

`docs/level_feedback.json`

## 验证结果

已验证：

- 关卡 JSON 数量：`340`
- `1-340` 无缺失
- 每个关卡内部 `id` 与文件名一致
- 每关 `.meta` 存在
- tile id 无重复
- tile 总数为 3 的倍数
- 每个图案数量为 3 的倍数
- `chapters.json` / `meta_chapters.json` / 拼豆 JSON 合法
- TypeScript linter 无错误
- 新结构预览页面可访问

## 当前可访问地址

结构预览 / 评分页：

`http://127.0.0.1:8902/level_review.html`

配置器：

`http://127.0.0.1:8902/level_configurator.html`

## 回退方式

如果决定不要前置测试关，可以从快照恢复：

`level_workbench/snapshots/20260706_201430_before_prepend20/`

恢复内容包括：

- 原 `1-320` 关卡
- 原章节配置
- 原局外 meta 配置
- 原背景映射
- 原最大关卡数配置

建议回退前再生成一个当前状态快照，避免误丢测试过程。
