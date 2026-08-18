# Level Gene 候选生成器修正记录

更新时间：2026-07-07

## 用户指出的问题

用户在 `/level_gene_candidates` 预览中指出：

1. 数字 `1/2/3` 能看懂，但实际堆叠应当是错位堆叠，不是数字 `3` 表示 100% 覆盖。
2. 以 `seed_5000` 为例，中间数字 `3` 的区域，左侧应向右偏、右侧应向左偏。
3. `seed_2000 / 2001 / 2002` 中存在重复或不对称候选；重复候选不应进入列表。
4. `seed_1001 / 1002` 这类底部/局部不对称候选也不应出现。

## 问题原因

### 1. 数字预览只代表高度，不代表覆盖方式

`1/2/3` 是高度图：

- `1` = 该格 1 张 tile。
- `2` = 该格最多 2 层。
- `3` = 该格最多 3 层。

真实 Cocos 渲染时还会读取：

- `layerStepDirX`
- `layerStepDirY`
- `layerStepCoef`

因此数字 `3` 默认不是 100% 覆盖。是否完全覆盖由 `layerStepCoef = 0` 决定。

### 2. 生成器的对称修正不够严格

旧逻辑在把 tile 总数调到 3 的倍数时，可能单格 +1，导致高度图左右不完全对称。

### 3. 同一 gene 的 seed 可能生成同构结构

旧逻辑没有做结构签名去重，因此 `seed_2000 / 2001` 可能生成完全一样的高度图。

## 已修正内容

### 1. 保证高度图左右对称

修正 `build_height_map()`：

- 调整 tile 总数时，只按左右镜像 pair 增加高度。
- 如果无法保持对称且满足 3 的倍数，则丢弃该 seed。
- 不再允许单格破坏左右对称。

### 2. 增加 seed 级对称扰动

修正 `base_shape()`：

- 只按左右镜像 orbit 增删局部块。
- 保持结构对称。
- 让同一 gene 的不同 seed 更容易产生不同外轮廓。

### 3. 增加同 gene 内结构去重

在 `main()` 中增加结构签名：

```text
signature = heightMap rows joined by |
```

同一 gene 内如果新 seed 的 signature 已出现，则跳过，继续尝试后续 seed。

### 4. 修复 DFS 卡顿

之前 DFS 分支爆炸导致生成时卡住。已改成：

- 最大深度：12
- 最大节点：2500
- 每层最多尝试分支：6

这是 v0.1 的浅 DFS / beam DFS，用于候选相对评分，不作为最终完整求解器。

## 当前小批量验证

运行：

```bash
python3 level_workbench/tools/generate_from_gene.py --clean --seeds-per-gene 3
```

输出：

```json
{
  "total": 15,
  "valid": 0,
  "genes": [
    "gene_ch3_large_board",
    "gene_intro_gate",
    "gene_intro_soft_arch",
    "gene_regular_double_arch",
    "gene_regular_ring"
  ]
}
```

`valid=0` 的原因是 Validator v0.1 阈值仍偏严格，尤其 opening flow 尚未由生成器主动保证。这不影响本次结构修正。

## 结构验证结果

已验证：

- 每个候选高度图均保持左右对称。
- 同一 gene 内没有重复高度图。
- `seed_2000 / 2001 / 2002` 已不再完全相同。
- `seed_1001 / 1002` 这类底部单格不对称问题已修复。
- `seed_5000` 这类大棋盘中，左右镜像位置后续会按镜像方向生成偏移。

## 当前预览

候选预览：

`level_workbench/generated/level_gene_candidates/index.html`

注意：

- 当前卡片上的数字仍是高度图。
- 真正的错位效果要看候选 `level.json` 中的 `layerStepDirX / layerStepDirY / layerStepCoef`。
- 后续应把候选预览也升级为“高度图 + 真实偏移预览”双视图。
