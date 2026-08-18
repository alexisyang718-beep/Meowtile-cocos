import { LevelId } from '../../core/Types';
import { MetaSubchapterConfig } from '../MetaChapterRepository';

export type BeadCell = [x: number, y: number, colorId: number, groupId: number];
export type BeadFillStyle = 'left-to-right' | 'right-to-left' | 'bottom-up' | 'top-down';

export interface BeadGroupConfig {
    id: number;
    levelId?: LevelId;
    unlockLevelId: LevelId;
    name: string;
    description?: string;
}

export interface BeadPuzzleData {
    id: string;
    source?: string;
    chapterId?: string;
    subchapterId?: string;
    title?: string;
    displayName?: string;
    levelRange?: [LevelId, LevelId];
    cols: number;
    rows: number;
    detectedPitch?: number;
    palette: string[];
    colorNames?: string[];
    fillStyle?: BeadFillStyle;
    fillSeed?: number;
    groups: BeadGroupConfig[];
    cells: BeadCell[];
}

export interface BeadPuzzleProgress {
    unlockedGroups: number[];
    completedCellCount?: number;
    seenStart?: boolean;
    completed?: boolean;
}

export interface BeadRewardContext {
    puzzle: BeadPuzzleData;
    subchapter: MetaSubchapterConfig;
    levelId: LevelId;
    visibleGroupIds: number[];
    newGroupIds: number[];
    previousCellCount?: number;
    completedCellCount?: number;
    rewardBeanCount?: number;
    fillStyle?: BeadFillStyle;
    isSubchapterComplete: boolean;
    buttonText: 'Continue' | 'Next';
}

export interface BeadStartContext {
    puzzle: BeadPuzzleData | null;
    subchapter: MetaSubchapterConfig;
}
