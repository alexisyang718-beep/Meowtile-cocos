# 砖块堆叠方向规则

更新时间：2026-07-06

## 设计修正

用户确认：

- 堆叠不应固定往右上偏。
- 理论上 360° 任意方向都可以偏移。
- 也可以 100% 覆盖。
- 边缘砖块应优先往棋盘中心偏移。
- 中间砖块可以更自由，允许多方向堆叠。

这意味着堆叠方向是关卡结构设计的一部分，不应该在代码里写死。

## 现在支持的字段

在 tile 数据上新增：

```ts
layerStepCoef?: number;
layerStepDirX?: number;
layerStepDirY?: number;
stackTowardCenter?: boolean;
```

含义：

| 字段 | 含义 |
|---|---|
| `layerStepCoef` | 每层错位幅度。`0` = 100% 覆盖；`0.1` = 90% 覆盖；`0.5` = 半格错位。 |
| `layerStepDirX` | X 方向偏移。`-1` 左，`1` 右，`0` 不横向偏。 |
| `layerStepDirY` | Y 方向偏移。`-1` 下，`1` 上，`0` 不纵向偏。 |
| `stackTowardCenter` | 快捷模式：未显式配置方向时，朝棋盘中心偏移。 |

示例：

```json
{ "layerStepCoef": 0.5, "layerStepDirX": -1, "layerStepDirY": -1 }
```

表示每层往左下错半格。

```json
{ "layerStepCoef": 0 }
```

表示完全覆盖。

## 边缘规则

后续测试关/生成器应遵守：

| 位置 | 推荐方向 |
|---|---|
| 左边缘 | 往右 / 往中心 |
| 右边缘 | 往左 / 往中心 |
| 上边缘 | 往下 / 往中心 |
| 下边缘 | 往上 / 往中心 |
| 东北角 | 往西南方向 |
| 西北角 | 往东南方向 |
| 东南角 | 往西北方向 |
| 西南角 | 往东北方向 |
| 中间区域 | 允许 360° 多方向 |

核心目标：

```text
边缘不外扩，中间可变化。
```

## 已修改代码

### `assets/scripts/core/Types.ts`

新增 `layerStepDirX / layerStepDirY` 类型字段。

### `assets/scripts/game/board/BoardManager.ts`

- `getTilePosition()` 使用统一的 `getLayerStepDirection()`。
- 支持显式方向、朝中心方向和旧默认方向。
- `computeLayoutUnitBounds()` 会把显式方向计入真实 bbox，避免尺寸计算失真。

### `assets/resources/config/levels/level-001.json` 到 `level-020.json`

已给测试关高层砖块写入显式方向：

- 边缘砖朝内。
- 中部砖多方向。

## 验证结果

已验证：

- `BoardManager.ts` 无 linter 错误。
- `Types.ts` 无 linter 错误。
- 测试关 `1-20` 高层砖块均有方向字段。
- 边缘砖方向均朝内。
- 中部出现多种方向：左、右、上、下、四个斜向均存在。
- 每关 tile 总数仍为 3 的倍数。
- 每个图案数量仍为 3 的倍数。
