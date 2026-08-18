export type LevelId = number;
export type ChapterId = string;
export type TileId = string;
export type TileTypeId = string;
export type BoosterType = 'hint' | 'shuffle' | 'undo';

export interface Vec2Data {
    x: number;
    y: number;
}

/**
 * 网格坐标。
 * - row/col 为整数网格索引（向下兼容 v1 关卡）。
 * - layer 为堆叠层级，0 为底层。
 * - 新增可选 x/y（半格 float）用于不规则手摆，未提供时按 row/col 排布。
 */
export interface GridPosition {
    row: number;
    col: number;
    layer: number;
    x?: number;
    y?: number;
    /** 可选：每层 stagger 系数（默认 0.5 = 50% 错开）。
     *  为本 tile 单独覆盖时用于"紧密堆叠"效果，例如 0 表示 100% 覆盖，0.1 表示只错开 10%。 */
    layerStepCoef?: number;
    /** 可选：层级偏移方向，支持 360° 任意方向；如 (-1,-1)=往左下，(1,0)=往右，未配置时默认右上。 */
    layerStepDirX?: number;
    layerStepDirY?: number;
    /** v2.4 摩天大楼：为 true 时，未显式配置方向的 tile 会朝画面中心偏移。 */
    stackTowardCenter?: boolean;
    /** v2.4 传送带：本 tile 属于哪条传送带（有值时由 ConveyorManager 定位/渲染，Board 跳过）。 */
    conveyorId?: string;
}

export interface TileSelectionResult {
    tileId: TileId;
    tileType: TileTypeId;
    accepted: boolean;
    matched: boolean;
    matchedTileIds: TileId[];
    slotFull: boolean;
    reason?: string;
}

export interface BoosterUseResult {
    success: boolean;
    type: BoosterType;
    message: string;
}

/** 关卡通关目标类型。MVP 默认 clearAll。stepLimit / timeLimit 预留接口。 */
export type GoalType = 'clearAll' | 'stepLimit' | 'timeLimit';

export interface GameGoal {
    type: GoalType;
    /** stepLimit 时表示总步数；timeLimit 时表示总秒数；clearAll 时忽略 */
    value?: number;
}
