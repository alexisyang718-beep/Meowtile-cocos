import { LevelId, TileTypeId } from '../../core/Types';

export type FeedbackSound = 'click' | 'match' | 'hint' | 'shuffle' | 'undo' | 'win' | 'fail';
export type ShakeLevel = 'small' | 'medium' | 'large';

export interface TileSkinConfig {
    /** 文字兜底：iconAsset 加载失败时显示 */
    icon?: string;
    /** resources 相对路径，不带扩展名，例如 art/tile/apple */
    iconAsset?: string;
    /** 本关内稳定的匹配编号，图标和三消逻辑共用 */
    matchKey?: string;
    /** 颜色兜底：部分特效或无图标时使用 */
    color?: string;
}

export type TileSkinMap = Partial<Record<TileTypeId, TileSkinConfig>>;

export interface SoundAssetConfig {
    enabled?: boolean;
    /** resources 相对路径，不带扩展名 */
    path?: string;
    /** 与代码调用音量相乘；1 = 不调整 */
    volume?: number;
}

export interface LevelAudioTheme {
    bgm?: SoundAssetConfig;
    sfx?: Partial<Record<FeedbackSound, SoundAssetConfig>>;
}

export interface BoardEnterEffectConfig {
    enabled?: boolean;
    layerStaggerMax?: number;
    jitterMax?: number;
    screenTopY?: number;
    offscreenBaseTileHeights?: number;
    offscreenJitterTileHeights?: number;
    fallDurationMin?: number;
    fallDurationMax?: number;
    bounce1UpMin?: number;
    bounce1UpMax?: number;
    bounce1DownMin?: number;
    bounce1DownMax?: number;
    bounce2UpMin?: number;
    bounce2UpMax?: number;
    bounce2DownMin?: number;
    bounce2DownMax?: number;
    bounce1HeightRatio?: number;
    bounce2HeightRatio?: number;
    bounceHeightRandomness?: number;
}

export interface BoardShakeStepConfig {
    duration: number;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
}

export interface ShuffleEffectConfig {
    enabled?: boolean;
    gatherDuration?: number;
    holdDuration?: number;
    scatterDuration?: number;
    staggerMax?: number;
    arcMagnitude?: number;
    spinTurnsMin?: number;
    spinTurnsMax?: number;
    vortex?: {
        enabled?: boolean;
        radius?: number;
        layers?: number;
        maxAlpha?: number;
        expandDuration?: number;
        holdDuration?: number;
        shrinkDuration?: number;
    };
    boardShake?: {
        enabled?: boolean;
        steps?: BoardShakeStepConfig[];
    };
}

export type MatchParticlePool = 'shards' | 'sand' | 'line' | 'crystal' | 'drip';

export interface MatchEmitterConfig {
    totalCount: number;
    pool: MatchParticlePool;
    sizeMin: number;
    sizeMax: number;
    lifeMin: number;
    lifeMax: number;
    vxMin: number;
    vxMax: number;
    vyMin: number;
    vyMax: number;
    spreadX: number;
    spreadY: number;
    rotSpeedAmp: number;
    colorTint?: { r: number; g: number; b: number };
}

export interface MatchEffectConfig {
    enabled?: boolean;
    gravity?: number;
    emitDuration?: number;
    emitters?: MatchEmitterConfig[];
}

export interface SequenceAnimEntryConfig {
    resource: string;
    animation: string;
}

export interface ComboAnimSpawnConfig {
    entry: SequenceAnimEntryConfig;
    x: number;
    y: number;
    size: number;
    flipX?: boolean;
    scale?: number;
}

export interface ComboRandomAnimConfig {
    name: string;
    spawns: ComboAnimSpawnConfig[];
}

export interface ComboLabelStyleConfig {
    maxWidth?: number;
    startX?: number;
    startY?: number;
    enterY?: number;
    endY?: number;
    enterDuration?: number;
    settleDuration?: number;
    holdDuration?: number;
    exitDuration?: number;
    enterScale?: number;
    settleScale?: number;
    exitScale?: number;
}

export interface ComboTextCelebrationConfig {
    enabled?: boolean;
    minComboCount?: number;
    texts?: string[];
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fontSize?: number;
    textColor?: string;
    outlineColor?: string;
    outlineWidth?: number;
    shadowColor?: string;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    enterDuration?: number;
    holdDuration?: number;
    exitDuration?: number;
    enterScale?: number;
    settleScale?: number;
    exitScale?: number;
    starCount?: number;
    starSize?: number;
}

export interface ComboEffectConfig {
    enabled?: boolean;
    comboWindowSec?: number;
    randomAnimationEnabled?: boolean;
    labelEnabled?: boolean;
    /** combo 数 -> 飞字 spriteFrame 路径 */
    labelPaths?: Record<number, string>;
    labelStyle?: ComboLabelStyleConfig;
    comboTextCelebration?: ComboTextCelebrationConfig;
    randomAnimations?: ComboRandomAnimConfig[];
    /** 每连续多少次 match 触发一次随机动画（默认 1 = 每次） */
    randomAnimationInterval?: number;
    /** 随机动画不与上次重复（默认 false） */
    randomAnimationNoRepeat?: boolean;
    /** 随机动画播放速度倍率（默认 1，>1 加速，<1 减速） */
    randomAnimationSpeedScale?: number;
}

export interface HubShakeLevelConfig {
    up: number;
    down: number;
    upDuration?: number;
    holdDuration?: number;
    recoverDuration?: number;
}

export interface HubShakeEffectConfig {
    enabled?: boolean;
    levels?: Partial<Record<ShakeLevel, HubShakeLevelConfig>>;
    rules?: {
        matchedFirst?: ShakeLevel;
        matchedCombo?: ShakeLevel;
        unmatchedCounts?: Record<number, ShakeLevel>;
    };
}

export interface MechanicEffectConfig {
    crow?: {
        enabled?: boolean;
        size?: number;
        emoji?: string;
        fontSize?: number;
        bodyColor?: string;
        strokeColor?: string;
        strokeAlpha?: number;
        strokeWidth?: number;
        flyDurationBase?: number;
        flyDurationStep?: number;
        delayBaseMs?: number;
        delayStepMs?: number;
    };
    piggy?: {
        bodyColor?: string;
        strokeColor?: string;
        strokeWidth?: number;
        radiusRatio?: number;
        emoji?: string;
        fontScale?: number;
    };
    cover?: {
        iconAsset?: string;
        fallbackFill?: string;
        fallbackStroke?: string;
    };
    golden?: {
        iconAsset?: string;
        fallbackFill?: string;
        fallbackStroke?: string;
        star?: string;
        starScale?: number;
    };
    /** v2.4 传送带外观（竖直胶囊轨道） */
    conveyor?: {
        cellSize?: number;
        gap?: number;
        leftInset?: number;
        beltColor?: string;
        beltAlpha?: number;
        beltStroke?: string;
        beltStrokeWidth?: number;
        beltRadius?: number;
        countColor?: string;
        countFontSize?: number;
    };
}

export interface LevelEffectTheme {
    boardEnter?: BoardEnterEffectConfig;
    shuffle?: ShuffleEffectConfig;
    match?: MatchEffectConfig;
    combo?: ComboEffectConfig;
    hubShake?: HubShakeEffectConfig;
    mechanics?: MechanicEffectConfig;
}

export interface LevelThemeOverride {
    /** 仅用于人读，不参与逻辑 */
    label?: string;
    background?: string;
    tileBase?: string;
    tileIcons?: TileSkinMap;
    audio?: LevelAudioTheme;
    effects?: LevelEffectTheme;
}

export interface ResolvedLevelTheme extends LevelThemeOverride {
    levelId: LevelId;
    background: string;
    tileBase?: string;
    audio: LevelAudioTheme;
    effects: LevelEffectTheme;
}
