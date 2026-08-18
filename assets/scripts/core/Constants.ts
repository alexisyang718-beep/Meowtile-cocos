/** 应用版本号，首页左下角展示 */
export const APP_VERSION = 'v2.3.4';

export const GAME_CONFIG = {
    designWidth: 1080,
    designHeight: 2340,
    defaultLevelId: 1,
    slotCapacity: 7,
    matchCount: 3,
    boardRows: 8,
    boardCols: 7,
    boardLayers: 3,
    tileWidth: 112,
    tileHeight: 112,
    /** 同层 tile 中心间距：等于 tileWidth/Height，即相邻 tile 紧贴不重叠 */
    tileGapX: 112,
    tileGapY: 112,
    /**
     * v3 堆叠模型：layer 不再用全局偏移叠加位置，
     * 而是由 BoardManager 在自动布局时按 layer 错半格（让上层压住下层 1/4 角）。
     * 这两个字段保留为 0，避免破坏外部引用；不要再用它们做位置叠加。
     */
    layerOffsetX: 0,
    layerOffsetY: 0,
    /**
     * v3：上层 tile 相对下层网格的错位量（半格 = tileWidth/2 = 56px）
     * 含义：上层 tile 摆在下层的某个角，重叠 56×56 = 1/4 面积
     * 三层叠加时，最底层 tile 可能被上面两层共同压住 → 4 个角全被压 → 100% 遮挡
     */
    layerStaggerX: 56,
    layerStaggerY: 56,
    /**
     * v4 自适应布局：棋盘目标宽度（占屏宽 90%）
     * BoardManager 按 cols 数自动算 tile 实际尺寸，cols 越多 tile 越小
     */
    boardTargetWidth: 980,
    /** tile 实际尺寸上限（cols 少时不让 tile 过大；视频里约 180px） */
    tileSizeMax: 200,
    /** tile 实际尺寸下限 */
    tileSizeMin: 80,
    animationFast: 0.12,
    animationNormal: 0.22,
    animationSlow: 0.36,
} as const;

export const RESOURCE_PATHS = {
    levels: 'config/levels',
    boosters: 'config/game/boosters',
    tileTypes: 'config/game/tile-types',
    /** v2: 章节配置（数组形式的 chapters.json） */
    chapters: 'config/game/chapters',
} as const;

/** v2: 关卡进度存档使用的 localStorage key */
export const STORAGE_KEYS = {
    progress: 'tile-explorer:progress:v1',
} as const;

export const SCENE_NAMES = {
    home: 'Home',
    levelSelect: 'LevelSelect',
    game: 'Game',
} as const;
