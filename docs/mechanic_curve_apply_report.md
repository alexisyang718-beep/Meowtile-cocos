# 机制曲线第一轮应用报告

## 已应用内容

新增正式机制曲线配置：

```text
assets/resources/config/game/mechanic_curve.json
```

并按该曲线批量修正了 `level-001.json` 到 `level-320.json` 的 `mechanics` 字段。

本轮重点：

1. 简化 Chapter 1 新手段。
2. 重排 Chapter 2 的机制首次出现顺序。
3. 让 Chapter 5 与 Chapter 4 形成主题差异，而不是完全复制高压混排。

## 调整结果摘要

### Chapter 1

- 移除新手期过早出现的 `conveyors`、`dropChutes`、`skyscrapers`、`piggies`。
- `ch1_01` 只保留基础 + 少量 cover/golden。
- `ch1_02` 只做 cover/golden。
- `ch1_03` 只做轻量 crow / slotLockRight / cover。

### Chapter 2

按子章节重排：

| 子章节 | 目标 |
|---|---|
| `ch2_01` | crow / slot / cover 复习 |
| `ch2_02` | dropChutes 聚焦 |
| `ch2_03` | skyscrapers 聚焦 |
| `ch2_04` | conveyors 聚焦 |
| `ch2_05` | 小考组合 |

注意：已有 `piggies` 会影响底层 2×2 支撑结构，不能直接删除，否则会造成悬空牌。因此本轮保留了已有 piggy 几何。

### Chapter 5

按主题重排：

| 子章节 | 目标机制 |
|---|---|
| `ch5_01` | conveyors + dropChutes，表现雨巷流动感 |
| `ch5_02` | piggies + cover，表现纸箱/遮挡 |
| `ch5_03` | crow + slotLockRight，表现雨伞空间受限 |
| `ch5_04` | skyscrapers + dropChutes，表现屋檐/阻挡 |
| `ch5_05` | 最终综合小考 |

## 当前机制分布重点结果

- `ch1_01`：cover 2 关，golden 1 关。
- `ch1_02`：cover 4 关，golden 2 关。
- `ch1_03`：cover 2 关，crow 2 关，slotLockRight 2 关，golden 2 关。
- `ch5_01`：dropChutes 7 关，conveyors 10 关。
- `ch5_02`：piggies 10 关，其他高级流动机制已移除。
- `ch5_03`：crow 7 关，slotLockRight 4 关。
- `ch5_04`：dropChutes 10 关，skyscrapers 7 关。
- `ch5_05`：保留最终综合混排。

## 验证结果

- `mechanic_curve.json` JSON 合法。
- `21-320` 关通过基础可运行校验：
  - tile 总数可被 3 整除。
  - 每个花色数量可被 3 整除。
  - tile id 无重复。
  - 21+ 花色均在库内。
  - 21-320 无悬空牌。

备注：`1-20` 是历史手摆关，存在若干“按严格生成器规则看似悬空”的结构；这不是本轮新增问题，现有运行时仍可按手摆数据渲染。后续如果要完全统一校验标准，需要单独重制 `1-20` 的几何结构。

## 下一步

下一步应做“正式关卡配置器”：

- 可选择关卡。
- 可编辑基础参数、tile、mechanics、boosters。
- 可用 `mechanic_curve.json` 批量应用机制曲线。
- 可预览棋盘堆叠、遮挡、金色、传送带、落地道具、摩天大楼、小猪。
- 可保存回 `assets/resources/config/levels/level-XXX.json`。
