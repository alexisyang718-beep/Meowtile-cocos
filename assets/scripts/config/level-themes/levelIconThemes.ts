import { LevelId, TileTypeId } from '../../core/Types';
import { TileSkinMap } from '../../data/models/LevelThemeModel';

/**
 * 关卡视觉主题统一配置：MeowTile 背景、图标主题、底盘。
 *
 * - 背景：正式 320 关；每个大章节再按子章节切换背景。
 * - 图标：优先使用 meowtile/tiles 的 10 个新图标；单关图案数超过 10 时，再从旧图标池补足。
 * - 底盘：统一使用 MeowTile 新底盘图。
 */

// ── 旧图标 fallback ─────────────────────────────────────────

const LEVEL_ICON_THEME_ORDER = [
    1, 2, 3, 4, 5, 6, 7, 8, 9,
] as const;

const LEVEL_ICON_THEME_COUNTS: Record<number, number> = {
    1: 11,
    2: 33,
    3: 14,
    4: 16,
    5: 18,
    6: 18,
    7: 21,
    8: 22,
    9: 23,
};

const MEOWTILE_ICON_COUNT = 10;

// ── 章节背景配置 ────────────────────────────────────────────

interface BackgroundSubchapterConfig {
    start: number;
    end: number;
    chapter: number;
    subchapter: number;
}

const BACKGROUND_SUBCHAPTERS: BackgroundSubchapterConfig[] = [
    { start: 1, end: 4, chapter: 1, subchapter: 1 },
    { start: 5, end: 8, chapter: 1, subchapter: 2 },
    { start: 9, end: 12, chapter: 1, subchapter: 3 },
    { start: 13, end: 26, chapter: 2, subchapter: 1 },
    { start: 27, end: 40, chapter: 2, subchapter: 2 },
    { start: 41, end: 54, chapter: 2, subchapter: 3 },
    { start: 55, end: 67, chapter: 2, subchapter: 4 },
    { start: 68, end: 80, chapter: 2, subchapter: 5 },
    { start: 81, end: 96, chapter: 3, subchapter: 1 },
    { start: 97, end: 112, chapter: 3, subchapter: 2 },
    { start: 113, end: 128, chapter: 3, subchapter: 3 },
    { start: 129, end: 144, chapter: 3, subchapter: 4 },
    { start: 145, end: 160, chapter: 3, subchapter: 5 },
    { start: 161, end: 176, chapter: 4, subchapter: 1 },
    { start: 177, end: 192, chapter: 4, subchapter: 2 },
    { start: 193, end: 208, chapter: 4, subchapter: 3 },
    { start: 209, end: 224, chapter: 4, subchapter: 4 },
    { start: 225, end: 240, chapter: 4, subchapter: 5 },
    { start: 241, end: 256, chapter: 5, subchapter: 1 },
    { start: 257, end: 272, chapter: 5, subchapter: 2 },
    { start: 273, end: 288, chapter: 5, subchapter: 3 },
    { start: 289, end: 304, chapter: 5, subchapter: 4 },
    { start: 305, end: 320, chapter: 5, subchapter: 5 },
];

export function getMeowtileLevelBackground(levelId: LevelId): string | undefined {
    const cfg = BACKGROUND_SUBCHAPTERS.find((range) => levelId >= range.start && levelId <= range.end);
    if (!cfg) return undefined;
    return `newtheme/bg/chapter${cfg.chapter}/${cfg.subchapter}`;
}

// ── 章节主色 / 底盘配置 ────────────────────────────────────

export type NewThemeColorKey = 'pink' | 'blue' | 'green';

export function getLevelThemeColorKey(levelId: LevelId): NewThemeColorKey {
    if (levelId >= 1 && levelId <= 12) return 'pink';
    if (levelId >= 13 && levelId <= 160) return 'blue';
    return 'green';
}

// ── 公开 API ──────────────────────────────────────────────

export function getLevelIconThemeId(levelId: LevelId): number {
    const index = ((levelId - 1) % LEVEL_ICON_THEME_ORDER.length + LEVEL_ICON_THEME_ORDER.length) % LEVEL_ICON_THEME_ORDER.length;
    return LEVEL_ICON_THEME_ORDER[index];
}

function pickIconThemeForLevel(levelId: LevelId, requiredIcons: number): number {
    const total = LEVEL_ICON_THEME_ORDER.length;
    const startIdx = ((levelId - 1) % total + total) % total;
    for (let step = 0; step < total; step += 1) {
        const themeId = LEVEL_ICON_THEME_ORDER[(startIdx + step) % total];
        const cap = LEVEL_ICON_THEME_COUNTS[themeId] ?? 0;
        if (cap >= requiredIcons) return themeId;
    }
    return LEVEL_ICON_THEME_ORDER[startIdx];
}

export function getLevelTileBase(_levelId: LevelId): string {
    return 'newtheme/tile_base';
}

export function buildLevelTileIcons(levelId: LevelId, tileTypes: TileTypeId[]): TileSkinMap {
    const orderedTypes = [...new Set(tileTypes)].filter((type) => type !== 'golden').sort();
    if (orderedTypes.length === 0) return {};

    const overflowCount = Math.max(0, orderedTypes.length - MEOWTILE_ICON_COUNT);
    const fallbackThemeId = overflowCount > 0 ? pickIconThemeForLevel(levelId, overflowCount) : getLevelIconThemeId(levelId);

    return orderedTypes.reduce<TileSkinMap>((acc, type, index) => {
        if (index < MEOWTILE_ICON_COUNT) {
            const slotNo = String(index + 1).padStart(3, '0');
            acc[type] = {
                iconAsset: `newtheme/tile/meowtile/${slotNo}`,
                matchKey: `meowtile-${slotNo}`,
            };
            return acc;
        }

        const fallbackSlotNo = String(index - MEOWTILE_ICON_COUNT + 1).padStart(3, '0');
        acc[type] = {
            iconAsset: `art/level-theme-icons/theme-${String(fallbackThemeId).padStart(2, '0')}/${fallbackSlotNo}`,
            matchKey: `fallback-theme-${fallbackThemeId}-${fallbackSlotNo}`,
        };
        return acc;
    }, {});
}
