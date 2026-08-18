import { BoosterType, ChapterId, GameGoal, LevelId } from '../../core/Types';
import { LevelThemeOverride } from './LevelThemeModel';
import { TileConfig } from './TileModel';

/**
 * 关卡堆叠形状预设（仅用于设计参考 / D 侧批量生成提示，不影响运行时）。
 * - flat: 单层平铺
 * - pyramid: 金字塔（视频中关3）
 * - tower: 多层塔（视频中关4）
 * - irregular: 不规则手摆
 */
export type StackShape = 'flat' | 'pyramid' | 'tower' | 'irregular';

export interface StackProfile {
    /** 设计层数（仅描述用，运行时按 tile.layer 实际计算） */
    maxLayers: number;
    shape: StackShape;
    /** 总牌数提示（实际以 tiles.length 为准） */
    tileCountHint?: number;
}

/**
 * 道具配置：本关解锁哪些道具 + 进入本关时初始/补充的次数。
 * 跨关继承时，由 ProgressRepository 与本配置叠加。
 */
export interface LevelBoosterConfig {
    /** 本关解锁的道具（含历史已解锁项），未列出的视为锁定 */
    unlocked: BoosterType[];
    /**
     * 本关进入时为各道具补充到至少 N 次（不会扣减玩家已有的多余次数）。
     * 用法：进入关卡时 inventory[type] = max(inventory[type], grantTo[type] ?? 0)
     */
    grantTo?: Partial<Record<BoosterType, number>>;
}

/** v1.5.3: 障碍物（小猪）—— 2×2 大小，placed 在 layer 之间 */
export interface PiggyObstacle {
    /** 唯一 id（关卡内） */
    id: string;
    /** 锚点行（小猪占 [row, row+1] × [col, col+1]） */
    row: number;
    /** 锚点列 */
    col: number;
    /**
     * 被 cover 的目标 layer（消除该 layer 上 4 个对应格的 tile 后小猪移除）。
     * 默认 0（最表层）
     */
    coverLayer?: number;
}

/** v1.5.3: 关卡级机制配置（part1 玩法扩展） */
export interface LevelMechanics {
    /** 难度1：开局黑乌鸦叼走 N 个 tile 到槽位 */
    crowSnatchCount?: number;
    /** 难度2：随机遮挡 N 个 tile（玩家必须先点一次揭开，再点一次才送入槽） */
    coverTileCount?: number;
    /** 难度3：小猪范围遮挡列表 */
    piggies?: PiggyObstacle[];
    /** 难度4：收集槽锁死最右 N 个槽位 */
    slotLockRight?: number;
    /** 容易1：金色 tile 数量（随机抽 N 个 tile 标为金色） */
    goldenTileCount?: number;
    /** v2.4 玩法扩展：传送带（棋盘侧 UI 轨道，持续转动、空位不补，见 ConveyorConfig） */
    conveyors?: ConveyorConfig[];
    /** v2.6 玩法扩展：落地道具（极快掉落、框外计数、空了补位、不足长度则压缩，见 DropChuteConfig） */
    dropChutes?: DropChuteConfig[];
    /** v2.4 玩法扩展：摩天大楼（单格 0 层高堆叠，见 SkyscraperConfig） */
    skyscrapers?: SkyscraperConfig[];
}

/**
 * v2.6 传送带：棋盘侧一条轨道，载着一队 tile 持续转动（竖版或横版）。
 * - 「长度」windowSize 可配置：一次显示 windowSize 个格（可点）；
 * - 持续转动：tile 顺着 direction 按 cellSpeedSec 秒/格 匀速滑动（默认 2s/格）；
 * - 循环轨道：tile 占固定槽位循环流动；
 * - ★关键：点走一个后该槽位**留空**（不补位），空槽随轨道循环，直到全清。
 * tile 花色用 types 数组顺序装填（长度须为 3 的倍数，保证可消）。
 */
export interface ConveyorConfig {
    /** 关卡内唯一 id */
    id: string;
    /** 朝向：'vertical' 竖版（默认）| 'horizontal' 横版 */
    orientation?: 'vertical' | 'horizontal';
    /** 摆放边：竖版用 'left'/'right'（默认 left）；横版用 'top'/'bottom'（默认 top） */
    edge?: 'left' | 'right' | 'top' | 'bottom';
    /** 长度：窗口一次显示的格数（可配置，如 5/7/9） */
    windowSize: number;
    /** 移动方向：竖版 'down'(默认)/'up'；横版 'left'(默认)/'right' */
    direction?: 'down' | 'up' | 'left' | 'right';
    /** 转动速度：每格滑动耗时（秒），默认 2（即 2s/格） */
    cellSpeedSec?: number;
    /** 队列花色，按装填顺序（长度须为 3 的倍数）。省略则由生成器/编辑器填充 */
    types: string[];
}

/**
 * v2.6 落地道具（独立机制，非传送带）：竖直料仓，tile 极快掉落堆叠。
 * - 顶部大号数字 = 框外（尚未落入可见窗口）的 tile 数量；
 * - 窗口内 tile 紧密堆叠、无空位；点走一个后上方 tile 掉落补位、框外的掉入；
 * - ★关键：剩余数量少于「长度」时，整体压缩长度（shrink-to-fit）；
 * - 掉落速度非常快（dropSpeedSec 默认 0.12 秒/格）。
 * tile 花色用 types 数组顺序装填（长度须为 3 的倍数）。
 */
export interface DropChuteConfig {
    /** 关卡内唯一 id */
    id: string;
    /** 摆放边：'left'（默认）/'right' 贴棋盘侧 */
    edge?: 'left' | 'right';
    /** 长度：料仓可见格数上限（不足时压缩） */
    length: number;
    /** 掉落速度：每格耗时（秒），默认 0.12（极快） */
    dropSpeedSec?: number;
    /** 是否外显框外数量（默认 true） */
    showCount?: boolean;
    /** 队列花色，按装填顺序（长度须为 3 的倍数） */
    types: string[];
}

/**
 * v2.4 摩天大楼：单格内 0 层高堆叠 N 张 tile。
 * - 不按普通层数错开，全部落在 (row,col) 同一格；
 * - 覆盖偏移量 90% 朝画面中心（layerStepCoef=0.1 + 朝心方向）；
 * - 只指定数量 count（须为 3 的倍数），花色用 types（省略则同上）。
 */
export interface SkyscraperConfig {
    id: string;
    row: number;
    col: number;
    /** 堆叠张数（须为 3 的倍数） */
    count: number;
    /** 花色列表（长度 = count，省略由生成器/编辑器填充） */
    types?: string[];
}

export interface LevelModel {
    id: LevelId;
    name: string;
    difficulty: number;
    rows: number;
    cols: number;
    layers: number;
    /** v2: 归属章节 id（使用 chapter1/chapter2 等稳定结构名；缺省时由 ChapterRepository 反查） */
    chapterId?: ChapterId;
    /** v5: 归属子章节 id（如 ch1_01），用于局外 meta / 拼豆进度 / 背景映射 */
    subchapterId?: string;
    /** v2: 通关目标，缺省 { type:'clearAll' } */
    goal?: GameGoal;
    /** v2: 堆叠形状描述（设计参考） */
    stackProfile?: StackProfile;
    /** v2: 道具解锁/补充配置；缺省时回退到 allowedBoosters + ConfigRepository 的全局默认 */
    boosters?: LevelBoosterConfig;
    /** v3: 关卡级背景图 resources 相对路径（不带扩展名）。优先级高于章节默认背景 */
    background?: string;
    /** v4: 关卡主题覆盖。UI 配置（图标/底盘/背景等）统一由 level-themes 管理 */
    theme?: LevelThemeOverride;
    /** v1.5.3: 本关收集槽容量（不填则用 GAME_CONFIG.slotCapacity） */
    slotCapacity?: number;
    /** v6: 进入/重开关卡时随机打散同层图案分布，保持棋盘形状不变。 */
    randomizeTypes?: boolean;
    /** v1.5.3: 玩法机制配置（part1） */
    mechanics?: LevelMechanics;
    /** v1 兼容：本关允许出现哪些道具按钮 */
    allowedBoosters: BoosterType[];
    tiles: TileConfig[];
}
