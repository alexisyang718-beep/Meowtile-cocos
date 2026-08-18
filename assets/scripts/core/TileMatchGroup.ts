import { TileTypeId } from './Types';

/**
 * 视觉相似 tile 分组
 * - 同一组里的 type 字符串在三消判定中视作"同 type"
 * - 用途：当美术上几乎一样、但 JSON 里 type 写法不同的 tile，要让玩家能正常三消
 *
 * 添加新冲突组：在数组末尾加一组即可（每组 ≥ 2 个 type）
 * 删除：移除该组数组
 */
const VISUAL_GROUPS: TileTypeId[][] = [
    // 猕猴桃整果 vs 切片：肉眼几乎相同
    ['kiwi', 'kiwi_half'],
    // 黄花 vs 橙花：颜色微差，肉眼难辨
    ['flower_yellow', 'flower_orange'],
    // 叶子 vs 银杏叶：当前 leaf.png 和 ginkgo.png 实际是同一张美术，玩家完全分不出来
    ['leaf', 'ginkgo'],
];

/** type -> group key 映射（O(1) 查找） */
const TYPE_TO_GROUP: Record<string, string> = {};
VISUAL_GROUPS.forEach((group, idx) => {
    const groupKey = `__group_${idx}__${group[0]}`;
    group.forEach((t) => {
        TYPE_TO_GROUP[t] = groupKey;
    });
});

/**
 * 取一个 type 的"匹配 key"
 * - 在 VISUAL_GROUPS 中 → 返回该组的 key
 * - 不在任何组 → 返回 type 自身
 *
 * 三消比较时统一用 matchKey 而不是 type 字符串，确保视觉一致即可消除。
 */
export function getMatchKey(type: TileTypeId): string {
    return TYPE_TO_GROUP[type] ?? type;
}

/**
 * 两个 type 是否可三消（视觉等价）
 */
export function areTypesMatchable(a: TileTypeId, b: TileTypeId): boolean {
    return getMatchKey(a) === getMatchKey(b);
}
