import { STORAGE_KEYS } from '../../core/Constants';
import { BoosterType, ChapterId, LevelId } from '../../core/Types';
import { BoosterInventory } from '../models/BoosterModel';

/**
 * 玩家进度存档。MVP 实现：localStorage 单 key JSON。
 * 不依赖 Cocos API（除环境探测），便于将来切到 SDK 存档。
 */
export interface ProgressData {
    /** 已通关的最大关卡 id（0 表示尚未通关任何关卡） */
    maxClearedLevelId: LevelId;
    /** 已解锁的章节 id 列表 */
    unlockedChapters: ChapterId[];
    /** 道具次数（跨关继承） */
    boosters: BoosterInventory;
    /** 关卡通关记录（含星级、最佳步数等，预留） */
    levelRecords: Record<string, LevelRecord>;
    /** 局外 meta：拼豆收集进度 */
    beads: BeadProgressData;
    /** 数据版本，便于将来迁移 */
    version: number;
}

export interface LevelRecord {
    cleared: boolean;
    bestMoves?: number;
    stars?: number;
}

export interface BeadPuzzleProgressRecord {
    unlockedGroups: number[];
    completedCellCount?: number;
    seenStart?: boolean;
    completed?: boolean;
}

export interface BeadProgressData {
    puzzles: Record<string, BeadPuzzleProgressRecord>;
}

const DEFAULT_PROGRESS: ProgressData = {
    maxClearedLevelId: 0,
    unlockedChapters: [],
    boosters: { hint: 0, shuffle: 0, undo: 0 },
    levelRecords: {},
    beads: { puzzles: {} },
    version: 3,
};

export class ProgressRepository {
    private static cache: ProgressData | null = null;

    static load(): ProgressData {
        if (this.cache) return this.cache;
        const raw = this.readStorage(STORAGE_KEYS.progress);
        if (!raw) {
            this.cache = this.makeDefault();
            return this.cache;
        }
        try {
            const parsed = JSON.parse(raw) as Partial<ProgressData>;
            this.cache = {
                ...DEFAULT_PROGRESS,
                ...parsed,
                boosters: { ...DEFAULT_PROGRESS.boosters, ...(parsed.boosters ?? {}) },
                unlockedChapters: parsed.unlockedChapters ?? [],
                levelRecords: parsed.levelRecords ?? {},
                beads: {
                    puzzles: { ...(parsed.beads?.puzzles ?? {}) },
                },
            };
        } catch (_error) {
            this.cache = this.makeDefault();
        }
        return this.cache;
    }

    private static makeDefault(): ProgressData {
        return {
            ...DEFAULT_PROGRESS,
            boosters: { ...DEFAULT_PROGRESS.boosters },
            unlockedChapters: [],
            levelRecords: {},
            beads: { puzzles: {} },
        };
    }

    static save(): void {
        if (!this.cache) return;
        this.writeStorage(STORAGE_KEYS.progress, JSON.stringify(this.cache));
    }

    /** 标记关卡通关，自动维护 maxClearedLevelId 与 levelRecords */
    static markLevelCleared(levelId: LevelId, stats?: { moves?: number; stars?: number }): void {
        const data = this.load();
        data.maxClearedLevelId = Math.max(data.maxClearedLevelId, levelId);
        const key = String(levelId);
        const old = data.levelRecords[key] ?? { cleared: false };
        data.levelRecords[key] = {
            cleared: true,
            bestMoves: stats?.moves !== undefined
                ? Math.min(old.bestMoves ?? Number.POSITIVE_INFINITY, stats.moves)
                : old.bestMoves,
            stars: stats?.stars !== undefined ? Math.max(old.stars ?? 0, stats.stars) : old.stars,
        };
        this.save();
    }

    static unlockChapter(chapterId: ChapterId): void {
        const data = this.load();
        if (!data.unlockedChapters.includes(chapterId)) {
            data.unlockedChapters.push(chapterId);
            this.save();
        }
    }

    static getBoosters(): BoosterInventory {
        return { ...this.load().boosters };
    }

    static setBoosters(inv: BoosterInventory): void {
        const data = this.load();
        data.boosters = { ...inv };
        this.save();
    }

    /** 增加某道具次数（如完成成就奖励） */
    static addBooster(type: BoosterType, delta: number): void {
        const data = this.load();
        data.boosters[type] = Math.max(0, (data.boosters[type] ?? 0) + delta);
        this.save();
    }

    static getBeadPuzzleProgress(puzzleId: string): BeadPuzzleProgressRecord {
        const record = this.load().beads.puzzles[puzzleId];
        return {
            unlockedGroups: [...(record?.unlockedGroups ?? [])],
            completedCellCount: Math.max(0, record?.completedCellCount ?? 0),
            seenStart: record?.seenStart ?? false,
            completed: record?.completed ?? false,
        };
    }

    static hasBeadStartSeen(puzzleId: string): boolean {
        return this.getBeadPuzzleProgress(puzzleId).seenStart === true;
    }

    static setBeadStartSeen(puzzleId: string): BeadPuzzleProgressRecord {
        const record = this.ensureBeadRecord(puzzleId);
        record.seenStart = true;
        this.save();
        return this.getBeadPuzzleProgress(puzzleId);
    }

    static unlockBeadGroups(puzzleId: string, groupIds: number[], completed = false): BeadPuzzleProgressRecord {
        const record = this.ensureBeadRecord(puzzleId);
        const merged = new Set(record.unlockedGroups);
        groupIds.forEach((id) => merged.add(id));
        record.unlockedGroups = [...merged].sort((a, b) => a - b);
        record.completed = record.completed || completed;
        this.save();
        return this.getBeadPuzzleProgress(puzzleId);
    }

    static setBeadCellProgress(puzzleId: string, completedCellCount: number, completed = false): BeadPuzzleProgressRecord {
        const record = this.ensureBeadRecord(puzzleId);
        record.completedCellCount = Math.max(record.completedCellCount ?? 0, completedCellCount);
        record.completed = record.completed || completed;
        this.save();
        return this.getBeadPuzzleProgress(puzzleId);
    }

    private static ensureBeadRecord(puzzleId: string): BeadPuzzleProgressRecord {
        const data = this.load();
        const record = data.beads.puzzles[puzzleId] ?? { unlockedGroups: [] };
        data.beads.puzzles[puzzleId] = record;
        return record;
    }

    /** 重置（仅用于调试 / QA） */
    static reset(): void {
        this.cache = null;
        this.writeStorage(STORAGE_KEYS.progress, '');
    }

    // --- 存储抽象，方便将来切换 SDK ---
    private static readStorage(key: string): string | null {
        try {
            const ls = this.getLocalStorage();
            return ls ? ls.getItem(key) : null;
        } catch (_error) {
            return null;
        }
    }

    private static writeStorage(key: string, value: string): void {
        try {
            const ls = this.getLocalStorage();
            if (!ls) return;
            if (value === '') ls.removeItem(key);
            else ls.setItem(key, value);
        } catch (_error) {
            // 静默失败：原生环境可能没有 localStorage
        }
    }

    private static getLocalStorage(): Storage | null {
        const g = globalThis as unknown as { localStorage?: Storage };
        return g.localStorage ?? null;
    }
}
