import { LevelModel } from '../data/models/LevelModel';
import { LevelEffectTheme, LevelThemeOverride, ResolvedLevelTheme } from '../data/models/LevelThemeModel';
import { DEFAULT_LEVEL_THEME, LEVEL_THEME_OVERRIDES } from './level-themes';
import { buildLevelTileIcons, getLevelTileBase, getMeowtileLevelBackground } from './level-themes/levelIconThemes';

export function resolveLevelTheme(level: LevelModel): ResolvedLevelTheme {
    const legacyLevelTheme: LevelThemeOverride = {
        background: level.background,
    };
    const runtimeTileIcons: LevelThemeOverride = {
        tileIcons: buildLevelTileIcons(level.id, level.tiles.map((tile) => tile.type)),
        tileBase: getLevelTileBase(level.id),
    };
    const levelFileTheme = LEVEL_THEME_OVERRIDES[level.id] ?? {};
    const inlineTheme = level.theme ?? {};

    const merged = mergeLevelThemes(
        DEFAULT_LEVEL_THEME,
        legacyLevelTheme,
        runtimeTileIcons,
        levelFileTheme,
        inlineTheme,
    );

    return {
        ...merged,
        levelId: level.id,
        background: getMeowtileLevelBackground(level.id) ?? merged.background ?? DEFAULT_LEVEL_THEME.background ?? 'newtheme/bg/chapter1/1',
        audio: merged.audio ?? {},
        effects: merged.effects ?? {},
    };
}

function mergeLevelThemes(...themes: Array<LevelThemeOverride | undefined>): LevelThemeOverride {
    return themes.reduce<LevelThemeOverride>((acc, theme) => mergeOneLevelTheme(acc, theme), {});
}

function mergeOneLevelTheme(base: LevelThemeOverride, override?: LevelThemeOverride): LevelThemeOverride {
    if (!override) return base;
    return {
        ...base,
        ...definedTopLevel(override),
        tileIcons: {
            ...(base.tileIcons ?? {}),
            ...(override.tileIcons ?? {}),
        },
        audio: {
            ...(base.audio ?? {}),
            ...(override.audio ?? {}),
            bgm: {
                ...(base.audio?.bgm ?? {}),
                ...(override.audio?.bgm ?? {}),
            },
            sfx: {
                ...(base.audio?.sfx ?? {}),
                ...(override.audio?.sfx ?? {}),
            },
        },
        effects: mergeEffects(base.effects, override.effects),
    };
}

function definedTopLevel(theme: LevelThemeOverride): LevelThemeOverride {
    const out: LevelThemeOverride = {};
    if (theme.label !== undefined) out.label = theme.label;
    if (theme.background !== undefined) out.background = theme.background;
    if (theme.tileBase !== undefined) out.tileBase = theme.tileBase;
    return out;
}

function mergeEffects(base?: LevelEffectTheme, override?: LevelEffectTheme): LevelEffectTheme | undefined {
    if (!base && !override) return undefined;
    return {
        boardEnter: {
            ...(base?.boardEnter ?? {}),
            ...(override?.boardEnter ?? {}),
        },
        shuffle: {
            ...(base?.shuffle ?? {}),
            ...(override?.shuffle ?? {}),
            vortex: {
                ...(base?.shuffle?.vortex ?? {}),
                ...(override?.shuffle?.vortex ?? {}),
            },
            boardShake: {
                ...(base?.shuffle?.boardShake ?? {}),
                ...(override?.shuffle?.boardShake ?? {}),
                steps: override?.shuffle?.boardShake?.steps ?? base?.shuffle?.boardShake?.steps,
            },
        },
        match: {
            ...(base?.match ?? {}),
            ...(override?.match ?? {}),
            emitters: override?.match?.emitters ?? base?.match?.emitters,
        },
        combo: {
            ...(base?.combo ?? {}),
            ...(override?.combo ?? {}),
            labelPaths: {
                ...(base?.combo?.labelPaths ?? {}),
                ...(override?.combo?.labelPaths ?? {}),
            },
            labelStyle: {
                ...(base?.combo?.labelStyle ?? {}),
                ...(override?.combo?.labelStyle ?? {}),
            },
            comboTextCelebration: {
                ...(base?.combo?.comboTextCelebration ?? {}),
                ...(override?.combo?.comboTextCelebration ?? {}),
                texts: override?.combo?.comboTextCelebration?.texts ?? base?.combo?.comboTextCelebration?.texts,
            },
            randomAnimations: override?.combo?.randomAnimations ?? base?.combo?.randomAnimations,
        },
        hubShake: {
            ...(base?.hubShake ?? {}),
            ...(override?.hubShake ?? {}),
            levels: {
                ...(base?.hubShake?.levels ?? {}),
                ...(override?.hubShake?.levels ?? {}),
            },
            rules: {
                ...(base?.hubShake?.rules ?? {}),
                ...(override?.hubShake?.rules ?? {}),
                unmatchedCounts: {
                    ...(base?.hubShake?.rules?.unmatchedCounts ?? {}),
                    ...(override?.hubShake?.rules?.unmatchedCounts ?? {}),
                },
            },
        },
        mechanics: {
            ...(base?.mechanics ?? {}),
            ...(override?.mechanics ?? {}),
            crow: {
                ...(base?.mechanics?.crow ?? {}),
                ...(override?.mechanics?.crow ?? {}),
            },
            piggy: {
                ...(base?.mechanics?.piggy ?? {}),
                ...(override?.mechanics?.piggy ?? {}),
            },
            golden: {
                ...(base?.mechanics?.golden ?? {}),
                ...(override?.mechanics?.golden ?? {}),
            },
            conveyor: {
                ...(base?.mechanics?.conveyor ?? {}),
                ...(override?.mechanics?.conveyor ?? {}),
            },
        },
    };
}
