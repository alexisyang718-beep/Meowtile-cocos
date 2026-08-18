import { GridPosition, TileId, TileTypeId } from '../../core/Types';

export interface TileTypeConfig {
    id: TileTypeId;
    name: string;
    icon: string;
    iconAsset?: string;
    color: string;
}

export interface TileConfig extends GridPosition {
    id: TileId;
    type: TileTypeId;
    /** v1.5.3：本 tile 初始即被遮挡（难度2-tile 遮挡）。点一次先揭开，再点一次进槽 */
    covered?: boolean;
    /** v1.5.3：本 tile 是金色（容易1）。点击直接送入槽并触发同 type 全消 */
    golden?: boolean;
    /** v1.5.3：金色 tile 覆盖的原 tile 类型；当金色作为首点、槽内没有邻居时作为兜底目标 */
    goldenTargetType?: TileTypeId;
    /** v1.5.3：金色 tile 覆盖的原 tile id，便于追溯 */
    goldenTargetId?: TileId;
}

export interface TileRuntimeModel extends TileConfig {
    icon: string;
    iconAsset?: string;
    color: string;
    /** 本关内稳定匹配键；不依赖 kiwi/flower 等语义 type 名 */
    matchKey: string;
    /** 金色 tile 的兜底目标匹配键 */
    goldenTargetMatchKey?: string;
    layoutX: number;
    layoutY: number;
    clickable: boolean;
    selected: boolean;
    removed: boolean;
}
