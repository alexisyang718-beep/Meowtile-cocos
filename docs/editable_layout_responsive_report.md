# 编辑器手摆布局响应式适配记录

更新时间：2026-07-06

## 问题

用户在 Cocos 编辑器中看到：

- `Slot` 节点宽度是 `1054`。
- 棋盘左右和 Slot 左右在编辑器里是对齐的。
- 但运行到某些机型时，Slot 两边会超出屏幕。

同时，之前按程序化布局估算出的 `846` 并不适用于当前编辑器手摆版本。

## 原因

当前游戏会走两套布局分支：

### 1. 程序化布局

没有手摆节点时，由代码创建：

```text
contentWidth × slot.widthRatio
```

之前的 `846` 就来自这条分支。

### 2. 编辑器手摆布局

当前场景中已经存在：

```text
GameRoot
  Slot
  Board
  HUD
```

因此代码走 `bindEditableRuntimeView()`，读取编辑器中 `Slot` 的真实 UITransform 宽度，也就是 `1054`。

问题是：之前只是读取了 `1054`，没有针对不同机型做缩放，所以窄屏会超出。

## 已修改内容

### 1. `LevelFlowController.ts`

新增：

- `getEditableLayoutScale()`
- `applyEditableLayoutScale()`

逻辑：

```text
slot authored width = 1054
safeWidth = 当前机型安全宽度
targetWidth = safeWidth - editableSidePadding × 2
scale = min(1, targetWidth / 1054)
```

然后把同一个 scale 应用到：

- `Slot`
- `Board`
- `Conveyor`
- `DropChute`

并同步更新：

- Board 可用宽度
- Board 安全区
- Board 宽度比例覆写

### 2. `BoardManager.ts`

新增：

```ts
setWidthRatioOverride(value: number | null)
```

编辑器手摆布局下调用：

```ts
board.setAvailableWidth(slotSize.width);
board.setWidthRatioOverride(1);
```

含义：

- 棋盘直接以 `Slot` 的作者宽度 `1054` 为宽度基准。
- 不再额外乘 `board.widthRatio = 0.90`。

### 3. `UILayoutConfig.ts`

新增：

```ts
editableSidePadding: 12
```

同时把：

```ts
tileSizeMax: 190
```

用于支持 `1054` 宽 Slot 下的 6×7 大砖尺寸。

## 适配结果估算

以 `Slot` 作者宽度 `1054` 计算：

| safeWidth | scale | runtime Slot 宽 | 单侧剩余 |
|---:|---:|---:|---:|
| 1080 | 1.000 | 1054 | 13 |
| 1054 | 0.977 | 1030 | 12 |
| 1000 | 0.926 | 976 | 12 |
| 960 | 0.888 | 936 | 12 |
| 900 | 0.831 | 876 | 12 |
| 828 | 0.763 | 804 | 12 |

也就是说：

- 标准 1080 宽下，保留编辑器里的 1054 原尺寸。
- 窄屏下，Slot/Board 同比例缩小，不再左右超出。

## 两档砖块尺寸

在 `1054` 宽 Slot 下：

- 大砖 `6×7`：约 `184.9`
- 小砖 `7×8`：约 `158.7`

因为 `tileSizeMax` 已提高到 `190`，大砖不会再被 `165` 截断。

## 已验证

- `LevelFlowController.ts` 无 linter 错误。
- `BoardManager.ts` 无 linter 错误。
- `UILayoutConfig.ts` 无 linter 错误。
- 关键逻辑已落地：
  - `getEditableLayoutScale`
  - `applyEditableLayoutScale`
  - `setWidthRatioOverride(1)`
  - `editableSidePadding`
  - `tileSizeMax: 190`

## 注意

这次主要解决横向适配和 Slot/Board 对齐。

如果后续发现某些机型的纵向空间也紧张，需要继续把 HUD / Booster / Board 的纵向关系纳入同一套响应式布局。