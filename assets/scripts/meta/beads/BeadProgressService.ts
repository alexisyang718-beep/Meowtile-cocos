import { LevelId } from '../../core/Types';
import { ProgressRepository } from '../../data/repositories/ProgressRepository';
import { LevelRepository } from '../../data/repositories/LevelRepository';
import { MetaChapterRepository } from '../MetaChapterRepository';
import { BeadPuzzleRepository } from './BeadPuzzleRepository';
import { BeadFillStyle, BeadRewardContext, BeadStartContext } from './BeadPuzzleTypes';

export class BeadProgressService {
    static async getStartContext(levelId: LevelId): Promise<BeadStartContext | null> {
        const subchapter = await MetaChapterRepository.findSubchapterByStartLevel(levelId);
        if (!subchapter) return null;
        if (ProgressRepository.hasBeadStartSeen(subchapter.puzzleId)) return null;
        const puzzle = await BeadPuzzleRepository.tryLoad(subchapter.puzzleResource);
        if (!puzzle) return null;
        return { subchapter, puzzle };
    }

    static markStartSeen(puzzleId: string): void {
        ProgressRepository.setBeadStartSeen(puzzleId);
    }

    static async claimLevelReward(levelId: LevelId): Promise<BeadRewardContext | null> {
        const subchapter = await MetaChapterRepository.findSubchapterByLevel(levelId);
        if (!subchapter) return null;
        const puzzle = await BeadPuzzleRepository.tryLoad(subchapter.puzzleResource);
        if (!puzzle) return null;

        const before = ProgressRepository.getBeadPuzzleProgress(puzzle.id);
        const savedCellCount = Math.max(0, Math.min(puzzle.cells.length, before.completedCellCount ?? 0));
        const targetCellCount = this.resolveTargetCellCount(levelId, subchapter.levelRange, puzzle.cells.length);
        const hasFreshProgress = targetCellCount > savedCellCount;
        const previousCellCount = hasFreshProgress
            ? savedCellCount
            : this.resolvePreviousStepCellCount(levelId, subchapter.levelRange, puzzle.cells.length);

        const isSubchapterComplete = targetCellCount >= puzzle.cells.length || subchapter.levelRange[1] === levelId;
        const progress = hasFreshProgress
            ? ProgressRepository.setBeadCellProgress(puzzle.id, targetCellCount, isSubchapterComplete)
            : before;
        if (hasFreshProgress) ProgressRepository.setBeadStartSeen(puzzle.id);
        const fillStyle = this.resolveFillStyle(puzzle.id, puzzle.fillStyle);
        const difficulty = await this.resolveLevelDifficulty(levelId);
        return {
            puzzle: { ...puzzle, fillStyle },
            subchapter,
            levelId,
            visibleGroupIds: puzzle.groups.map((group) => group.id),
            newGroupIds: [],
            previousCellCount,
            completedCellCount: hasFreshProgress ? (progress.completedCellCount ?? targetCellCount) : targetCellCount,
            rewardBeanCount: this.randomBeanCount(difficulty),
            fillStyle,
            isSubchapterComplete,
            buttonText: isSubchapterComplete ? 'Next' : 'Continue',
        };
    }

    private static resolveTargetCellCount(levelId: LevelId, range: [LevelId, LevelId], totalCells: number): number {
        const [start, end] = range;
        const totalLevels = Math.max(1, end - start + 1);
        const step = Math.max(1, Math.min(totalLevels, levelId - start + 1));
        return Math.min(totalCells, Math.ceil(totalCells * step / totalLevels));
    }

    private static resolvePreviousStepCellCount(levelId: LevelId, range: [LevelId, LevelId], totalCells: number): number {
        const [start, end] = range;
        const totalLevels = Math.max(1, end - start + 1);
        const step = Math.max(0, Math.min(totalLevels - 1, levelId - start));
        return Math.min(totalCells, Math.ceil(totalCells * step / totalLevels));
    }

    private static resolveFillStyle(puzzleId: string, configured?: BeadFillStyle): BeadFillStyle {
        if (configured) return configured;
        const styles: BeadFillStyle[] = ['left-to-right', 'right-to-left', 'bottom-up', 'top-down'];
        const known: Record<string, BeadFillStyle> = {
            ch1_01_cat_plays_yarn: 'left-to-right',
            ch1_02_cat_stretching: 'bottom-up',
            ch1_03_cat_in_travel_bag: 'right-to-left',
            ch2_01_cat_at_cafe_door: 'top-down',
        };
        if (known[puzzleId]) return known[puzzleId];
        const hash = [...puzzleId].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return styles[hash % styles.length];
    }

    private static async resolveLevelDifficulty(levelId: LevelId): Promise<number> {
        try {
            const level = await LevelRepository.loadLevel(levelId);
            return Math.max(1, level.difficulty ?? 1);
        } catch (_error) {
            return 1;
        }
    }

    private static randomBeanCount(difficulty: number): number {
        const min = 18 + difficulty * 5;
        const max = 32 + difficulty * 11;
        return min + Math.floor(Math.random() * (max - min + 1));
    }
}
