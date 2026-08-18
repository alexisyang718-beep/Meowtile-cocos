import { GameState } from '../../core/GameState';
import { BoosterType, ChapterId, LevelId, TileId } from '../../core/Types';
import { BoosterConfig, BoosterInventory } from '../../data/models/BoosterModel';
import { LevelModel } from '../../data/models/LevelModel';
import { ProgressRepository } from '../../data/repositories/ProgressRepository';

export interface GameSnapshot {
    state: GameState;
    levelId: LevelId | null;
    chapterId: ChapterId | null;
    moves: number;
    remainingTiles: number;
    slotTileIds: TileId[];
    boosters: BoosterInventory;
    message: string;
    /** 已通关的最大关卡 id（来自 ProgressRepository） */
    maxClearedLevelId: LevelId;
}

export class GameSession {
    state: GameState = GameState.Home;
    level: LevelModel | null = null;
    moves = 0;
    remainingTiles = 0;
    slotTileIds: TileId[] = [];
    boosters: BoosterInventory = { hint: 0, shuffle: 0, undo: 0 };
    message = '';

    /**
     * 开始关卡：
     * 1. 从存档读取 boosters。
     * 2. 用全局 boosterConfigs.initialCount 给"从未拥有过"的道具兜底初始化（首次玩家）。
     * 3. 用 level.boosters.grantTo 给本关补充次数（取 max）。
     * 4. 用 level.boosters.unlocked 过滤未解锁道具显示（不清零，仅 HUD/按钮按解锁状态显示）。
     */
    start(level: LevelModel, boosterConfigs: BoosterConfig[]): void {
        this.state = GameState.Playing;
        this.level = level;
        this.moves = 0;
        this.remainingTiles = level.tiles.length;
        this.slotTileIds = [];

        // 1) 从存档读取
        const saved = ProgressRepository.getBoosters();
        const inv: BoosterInventory = { hint: 0, shuffle: 0, undo: 0 };
        (Object.keys(inv) as BoosterType[]).forEach((t) => { inv[t] = saved[t] ?? 0; });

        // 2) 新玩家初始化：若存档全 0 且关卡 id <= 1，按 boosterConfigs.initialCount 给一次性初始
        const isFreshPlayer = inv.hint === 0 && inv.shuffle === 0 && inv.undo === 0 && level.id <= 1;
        if (isFreshPlayer) {
            boosterConfigs.forEach((b) => { inv[b.id] = b.initialCount; });
        }

        // 3) 本关补充
        const grantTo = level.boosters?.grantTo;
        if (grantTo) {
            (Object.keys(grantTo) as BoosterType[]).forEach((t) => {
                const target = grantTo[t] ?? 0;
                inv[t] = Math.max(inv[t] ?? 0, target);
            });
        }

        this.boosters = inv;
        ProgressRepository.setBoosters(inv);
        this.message = `Level ${level.id} started`;
    }

    consumeBooster(type: BoosterType): boolean {
        if (this.boosters[type] <= 0) return false;
        this.boosters[type] -= 1;
        ProgressRepository.setBoosters(this.boosters);
        return true;
    }

    refundBooster(type: BoosterType): void {
        this.boosters[type] += 1;
        ProgressRepository.setBoosters(this.boosters);
    }

    recordMove(): void {
        this.moves += 1;
    }

    setResult(win: boolean): void {
        this.state = win ? GameState.Win : GameState.Lose;
        if (win && this.level) {
            ProgressRepository.markLevelCleared(this.level.id, { moves: this.moves });
        }
    }

    /** 判断本关是否允许显示某道具按钮（未解锁时按钮置灰） */
    isBoosterUnlocked(type: BoosterType): boolean {
        const unlocked = this.level?.boosters?.unlocked;
        if (!unlocked) return this.level?.allowedBoosters?.includes(type) ?? true;
        return unlocked.includes(type);
    }

    getSnapshot(): GameSnapshot {
        return {
            state: this.state,
            levelId: this.level?.id ?? null,
            chapterId: this.level?.chapterId ?? null,
            moves: this.moves,
            remainingTiles: this.remainingTiles,
            slotTileIds: [...this.slotTileIds],
            boosters: { ...this.boosters },
            message: this.message,
            maxClearedLevelId: ProgressRepository.load().maxClearedLevelId,
        };
    }
}
