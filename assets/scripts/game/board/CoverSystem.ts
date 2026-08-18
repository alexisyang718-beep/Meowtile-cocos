import { GAME_CONFIG } from '../../core/Constants';
import { TileId } from '../../core/Types';
import { TileRuntimeModel } from '../../data/models/TileModel';

/**
 * 遮挡判定（v7.18）：
 *  - 用视觉坐标（layoutX/layoutY）+ AABB 重叠率判定，配合方向性硬约束。
 *    旧版（v4）用逻辑坐标 row/col 判定，stagger 偏移大的高层 tile（layer 差 ≥ 2）
 *    视觉上完全错开但仍被判"遮挡"，玩家看到"露出来"的 tile 却点不到。
 *  - 规则：
 *    1) 必须 upper.layer > lower.layer（同层不互相遮挡）
 *    2) 视觉 AABB 重叠面积 / tile 面积 ≥ 10% 才算遮挡
 *  - 每次 tile 状态变化（入槽/撤销/消除）后由 BoardManager 调用 refreshClickable。
 */
export class CoverSystem {
    private tileSize = GAME_CONFIG.tileWidth;
    /** 重叠率阈值（v7.26）：覆盖 ≤ 10% 可点击下层；> 10% 则下层被判遮挡不可点。 */
    private static readonly OVERLAP_THRESHOLD = 0.10;

    /** v4：设置 tile 实际像素尺寸（按 BoardManager 自适应计算） */
    setTileSize(size: number): void {
        this.tileSize = size;
    }

    refreshClickable(tiles: TileRuntimeModel[]): void {
        const alive = tiles.filter((tile) => !tile.removed && !tile.selected);
        const sorted = [...alive].sort((a, b) => a.layer - b.layer);
        sorted.forEach((tile) => {
            tile.clickable = !sorted.some((other) => this.isCovering(other, tile));
        });
    }

    /** 给指定 tileId 查询当前可点状态（必须先 refreshClickable） */
    isClickable(tiles: TileRuntimeModel[], tileId: TileId): boolean {
        const t = tiles.find((x) => x.id === tileId);
        return Boolean(t && !t.removed && !t.selected && t.clickable);
    }

    /**
     * 判断 upper 是否遮挡 lower。
     * - 必须 upper.layer > lower.layer（同层不参与遮挡判定）
     * - 视觉 AABB 重叠面积 > tile 面积的 10% 才算遮挡
     */
    private isCovering(upper: TileRuntimeModel, lower: TileRuntimeModel): boolean {
        if (upper.id === lower.id) return false;
        if (upper.layer <= lower.layer) return false;

        const dx = Math.abs(upper.layoutX - lower.layoutX);
        const dy = Math.abs(upper.layoutY - lower.layoutY);
        const overlapW = Math.max(0, this.tileSize - dx);
        const overlapH = Math.max(0, this.tileSize - dy);
        if (overlapW <= 0 || overlapH <= 0) return false;

        const tileArea = this.tileSize * this.tileSize;
        const overlapArea = overlapW * overlapH;
        return overlapArea / tileArea >= CoverSystem.OVERLAP_THRESHOLD;
    }
}
