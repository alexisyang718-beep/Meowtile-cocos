# Level Gene 候选页与 Opening Flow 更新记录

更新时间：2026-07-07

## 本轮继续内容

在上一轮基础上继续完成两件事：

1. 候选预览页增加“高度图 + 真实偏移”双视图。
2. 生成器主动控制开局可消组，避免 opening matches 过高。

## 1. 候选页双视图

文件：

`level_workbench/tools/generate_from_gene.py`

候选 HTML 现在每张卡片显示：

| 视图 | 作用 |
|---|---|
| 高度图 | 看每个格子是 1/2/3 层 |
| 真实偏移 | 近似 Cocos 实际错位堆叠后的视觉 |

这样可以同时判断：

- 结构是否有对称美。
- 上层错位后是否仍然好看。
- 不是只看数字高度图。

## 2. Opening Flow 修正

之前 `valid=0` 的主要原因是：

```text
opening_matches_high
```

也就是顶层可见 tile 太多，而 iconPoolSize 又偏小，导致顶层自然形成太多三消组。

这不是 DFS 卡死，而是图案分配逻辑没有主动约束开局可消组。

本轮修正：

### 2.1 先统计顶层可见数量

在 `assign_types()` 里先计算 top tiles。

### 2.2 自动扩展有效图案池

如果顶层可见 tile 很多，为了保证只有 2-3 组开局三消，会临时扩大有效图案池：

```text
min_types_for_top = target_openings + ceil((topCount - target_openings * 3) / 2)
```

含义：

- 目标开局三消组之外，其他顶层图案最多先形成对子。
- 避免顶层自然出现 6-10 组可消。

### 2.3 显式分配开局三消

生成器会先放：

```text
2-3 组开局三消
```

并尽量分布在左 / 中 / 右区域。

### 2.4 剩余顶层只形成对子

剩余 top tile 优先使用：

```text
top_counts[type] < 2
```

避免额外凑出第三张。

## 3. 小批量验证结果

运行：

```bash
python3 level_workbench/tools/generate_from_gene.py --clean --seeds-per-gene 3
```

输出：

```json
{
  "total": 15,
  "valid": 13,
  "genes": [
    "gene_ch3_large_board",
    "gene_intro_gate",
    "gene_intro_soft_arch",
    "gene_regular_double_arch",
    "gene_regular_ring"
  ]
}
```

相比之前：

```text
valid: 0 → 13
```

说明 opening flow 控制已经初步生效。

## 4. 当前失败原因

剩余 2 个候选失败原因仍是：

```text
opening_matches_high
```

具体：

- `gene_intro_soft_arch seed_1001`：open = 4
- `gene_intro_gate seed_2001`：open = 4

其他 13 个候选都通过 v0.1 Validator。

## 5. 当前指标概览

部分结果：

| gene | seed | opening matches | candidate pairs | valid |
|---|---:|---:|---:|---|
| gene_intro_soft_arch | 1000 | 2 | 10 | yes |
| gene_intro_soft_arch | 1002 | 2 | 10 | yes |
| gene_intro_gate | 2000 | 2 | 11 | yes |
| gene_intro_gate | 2002 | 2 | 12 | yes |
| gene_regular_ring | 3002 | 3 | 14 | yes |
| gene_ch3_large_board | 5000 | 2 | 17 | yes |
| gene_ch3_large_board | 5001 | 2 | 16 | yes |
| gene_ch3_large_board | 5002 | 2 | 21 | yes |

## 6. 当前候选页

路径：

`level_workbench/generated/level_gene_candidates/index.html`

通过本地服务访问：

`http://127.0.0.1:8902/level_workbench/generated/level_gene_candidates/index.html`

## 7. 下一步建议

下一步可以继续做：

1. 把 `opening_matches_high` 从 4 压到 2-3，争取小批量 valid 接近 100%。
2. 增加候选筛选排序：优先展示 valid 候选。
3. 开始实现第 5 步小门槛 / key tile 检查。
4. 从 3 seed 扩展到 20 seed，观察批量稳定性。
