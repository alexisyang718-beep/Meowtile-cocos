# 特殊机制检查与当前投放策略

## 用户反馈问题

本轮检查基于以下实际体验问题：

1. `第24关`：金色牌上方的瓷砖点击没有反应。
2. `第27关`：落地料仓内瓷砖图案变形；同类图标在棋盘内和料仓内尺寸不一致。
3. `第44关`：小猪上方瓷砖清除后，小猪仍留在原地遮挡。
4. `第55关`：传送带内瓷砖图案变形、图案被放大。
5. `第72关`：出现瓷砖点击无反应。

## 当前结论

这些问题说明特殊机制目前不适合进入正式关卡投放。当前阶段应回到稳定主玩法：普通棋盘 + 拼豆局外 meta。

## 当前策略

### 保留代码但暂不投放

以下 3 个机制保留为未来候选，但当前不出现在任何关卡：

- `goldenTileCount`：金色奖励牌
- `crowSnatchCount`：乌鸦叼牌
- `slotLockRight`：右侧锁槽

### 暂停使用，后续重做

以下机制从当前关卡投放中移除，后续需要单独重做视觉/交互/点击判定：

- `coverTileCount`：问号遮挡牌
- `piggies`：小猪障碍
- `conveyors`：传送带
- `dropChutes`：落地料仓
- `skyscrapers`：摩天大楼堆叠

## 已完成处理

1. 已从 `level-001.json` 到 `level-320.json` 中移除所有 `mechanics` 投放。
2. 已清理所有关卡 tile 上可能残留的特殊标记：
   - `covered`
   - `golden`
   - `goldenTargetType`
   - `goldenTargetId`
   - `goldenTargetMatchKey`
   - `conveyorId`
   - `layerStepCoef`
   - `stackTowardCenter`
3. 已更新 `assets/resources/config/game/mechanic_curve.json`，标记当前特殊机制策略为 `disabled_in_levels`。
4. 已更新 `level_configurator.html`：
   - 机制区提示“所有特殊机制暂不投放”。
   - 特殊机制输入暂时禁用。
   - 保存关卡时不会写入特殊机制。

## 验证结果

- `320` 个关卡均不含 `mechanics` 字段。
- 所有关卡 tile 均不含特殊机制残留标记。
- 所有关卡 tile 总数满足 3 的倍数。
- 所有关卡各花色数量满足 3 的倍数。
- 关卡 tile id 无重复。
- TypeScript linter 无新增错误。

## 后续建议

下一步不要继续混排特殊机制。建议先做两件事：

1. 体验普通关卡节奏是否顺滑，确认 `1-320` 的基础牌量/层数/难度是否合适。
2. 等基础节奏稳定后，单独挑一个候选机制做 MVP：优先建议 `右侧锁槽`，因为它不涉及棋盘 tile 变形和复杂动态容器。
