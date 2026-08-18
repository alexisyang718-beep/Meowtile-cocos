# 实际棋盘与结构预览不一致修正记录

更新时间：2026-07-07

## 用户反馈

用户发现：

- 配置器效果和结构预览效果一致。
- 但 Cocos 实际体验里，上层砖块看起来不对称。
- 底层基本对称，但上层视觉不对称。

## 原因定位

原因不是高度图本身错了，而是：

```text
配置器 / 结构预览只显示 row / col / layer 的格点结构。
Cocos 实际渲染还会应用 layerStepDirX / layerStepDirY / layerStepCoef。
```

也就是说：

- 高度图是左右对称的。
- 但上层砖块的偏移方向之前是独立随机的。
- 左右镜像位置上的两张砖，可能不是镜像方向偏移。
- 所以最终 Cocos 视觉看起来不对称。

## 修正 1：堆叠方向镜像化

已修正 `Level 1-20` 的高层砖块方向：

对于左右镜像的格子：

```text
左侧 tile:  layerStepDirX = x,  layerStepDirY = y
右侧 tile:  layerStepDirX = -x, layerStepDirY = y
```

也就是：

- X 方向镜像。
- Y 方向保持一致。
- `layerStepCoef` 保持一致。

这样 Cocos 实际渲染时，上层砖块也会保持左右视觉对称。

实验目录：

`level_workbench/experiments/exp_symmetrized_stack_dirs_v6/`

## 修正 2：结构预览增加“真实偏移预览”

文件：

`level_review.html`

现在结构预览页除了原来的：

- 总高度图
- 按层拆解

还新增：

```text
真实偏移预览
```

这个预览会近似应用：

- `layerStepDirX`
- `layerStepDirY`
- `layerStepCoef`

用来接近 Cocos 实际视觉位置。

以后看结构时需要区分：

| 视图 | 含义 |
|---|---|
| 按层拆解 | 格点结构，检查每层是否对称、是否满铺 |
| 真实偏移预览 | 近似 Cocos 视觉，检查偏移后是否仍然好看 |

## 验证结果

已验证：

- `Level 1-20` tile 总数均为 3 的倍数。
- 每个图案数量均为 3 的倍数。
- 高层砖块均存在镜像对应。
- 镜像对应砖块的偏移方向已严格镜像。
- 真实视觉 bbox 仍未超过 `7×8`。
- `level_review.html` 已包含真实偏移预览。
- TS linter 无错误。

## 后续注意

配置器当前仍主要用于格点编辑，显示的是 row / col / layer 结构。

真正判断最终视觉时，应该看：

```text
level_review.html 的“真实偏移预览”
+ Cocos 实际运行效果
```

如果后续要继续提升一致性，可以再把配置器里的棋盘预览也升级为同样的真实偏移预览。