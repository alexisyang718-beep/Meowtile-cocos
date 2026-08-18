import { LevelId } from '../../core/Types';
import { LevelThemeOverride } from '../../data/models/LevelThemeModel';
import { DEFAULT_LEVEL_THEME } from './defaultTheme';
import { LEVEL_001_THEME } from './level-001';
import { LEVEL_002_THEME } from './level-002';
import { LEVEL_003_THEME } from './level-003';
import { LEVEL_004_THEME } from './level-004';
import { LEVEL_005_THEME } from './level-005';
import { LEVEL_006_THEME } from './level-006';
import { LEVEL_007_THEME } from './level-007';
import { LEVEL_008_THEME } from './level-008';
import { LEVEL_009_THEME } from './level-009';
import { LEVEL_010_THEME } from './level-010';
import { LEVEL_011_THEME } from './level-011';
import { LEVEL_012_THEME } from './level-012';
import { LEVEL_013_THEME } from './level-013';
import { LEVEL_014_THEME } from './level-014';
import { LEVEL_015_THEME } from './level-015';
import { LEVEL_016_THEME } from './level-016';
import { LEVEL_017_THEME } from './level-017';
import { LEVEL_018_THEME } from './level-018';
import { LEVEL_019_THEME } from './level-019';
import { LEVEL_020_THEME } from './level-020';

export { DEFAULT_LEVEL_THEME };

/**
 * 20 关主题入口。
 * 后续多人协作时，优先改对应的 level-XXX.ts，尽量不要频繁改这个索引文件。
 */
export const LEVEL_THEME_OVERRIDES: Partial<Record<LevelId, LevelThemeOverride>> = {
    1: LEVEL_001_THEME,
    2: LEVEL_002_THEME,
    3: LEVEL_003_THEME,
    4: LEVEL_004_THEME,
    5: LEVEL_005_THEME,
    6: LEVEL_006_THEME,
    7: LEVEL_007_THEME,
    8: LEVEL_008_THEME,
    9: LEVEL_009_THEME,
    10: LEVEL_010_THEME,
    11: LEVEL_011_THEME,
    12: LEVEL_012_THEME,
    13: LEVEL_013_THEME,
    14: LEVEL_014_THEME,
    15: LEVEL_015_THEME,
    16: LEVEL_016_THEME,
    17: LEVEL_017_THEME,
    18: LEVEL_018_THEME,
    19: LEVEL_019_THEME,
    20: LEVEL_020_THEME,
};
