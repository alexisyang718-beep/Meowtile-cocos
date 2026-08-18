import { JsonAsset, resources } from 'cc';
import { GAME_CONFIG, RESOURCE_PATHS } from '../../core/Constants';
import { LevelId } from '../../core/Types';
import { LevelModel } from '../models/LevelModel';
import { ChapterRepository } from './ChapterRepository';

export class LevelRepository {
    static loadLevel(levelId: LevelId): Promise<LevelModel> {
        const path = `${RESOURCE_PATHS.levels}/level-${this.padLevelId(levelId)}`;
        return this.loadJson<LevelModel>(path)
            .then((level) => this.normalize(level))
            .then((level) => this.validateLevel(level));
    }

    static async loadLevelList(from = 1, to = 10): Promise<LevelModel[]> {
        const levels: LevelModel[] = [];
        for (let id = from; id <= to; id += 1) {
            try {
                levels.push(await this.loadLevel(id));
            } catch (_error) {
                // 关卡缺失视为不存在，跳过
            }
        }
        return levels;
    }

    /**
     * 对 v1 关卡 JSON 补全 v2 字段，向下兼容。
     * - 缺失 goal → clearAll
     * - 缺失 boosters → 用 allowedBoosters 推导 unlocked
     * - 缺失 chapterId → 通过 ChapterRepository.findByLevel 反查
     * - 缺失 stackProfile → 用 tiles 实际数据推断
     * - 缺失 allowedBoosters → 默认 3 个常用道具
     * - 缺失 rows/cols → 用 tiles 实际 row/col 推断
     */
    private static async normalize(raw: LevelModel): Promise<LevelModel> {
        const level: LevelModel = { ...raw };

        // 默认开放 hint/shuffle/undo 3 个道具
        if (!level.allowedBoosters || level.allowedBoosters.length === 0) {
            level.allowedBoosters = ['hint', 'shuffle', 'undo'];
        }

        // 当前收纳槽 UI 使用 7 槽素材，统一运行时容量，避免 8 槽数据造成槽位与素材不对齐。
        level.slotCapacity = GAME_CONFIG.slotCapacity;

        // rows / cols 从 tiles 推断
        if (!level.rows || !level.cols) {
            let maxRow = 0, maxCol = 0;
            level.tiles.forEach((t) => {
                if (typeof t.row === 'number') maxRow = Math.max(maxRow, t.row);
                if (typeof t.col === 'number') maxCol = Math.max(maxCol, t.col);
            });
            level.rows = level.rows || (maxRow + 1);
            level.cols = level.cols || (maxCol + 1);
        }

        if (!level.layers) {
            level.layers = level.tiles.reduce((m, t) => Math.max(m, t.layer ?? 0), 0) + 1;
        }

        if (!level.goal) {
            level.goal = { type: 'clearAll' };
        }

        if (!level.boosters) {
            level.boosters = {
                unlocked: [...level.allowedBoosters],
                grantTo: { hint: 2, shuffle: 2, undo: 2 },
            };
        } else if (!level.boosters.unlocked) {
            level.boosters.unlocked = [...level.allowedBoosters];
        }

        if (!level.chapterId) {
            const chapter = await ChapterRepository.findByLevel(level.id);
            if (chapter) level.chapterId = chapter.id;
        }

        if (!level.stackProfile) {
            const maxLayer = level.tiles.reduce((m, t) => Math.max(m, t.layer ?? 0), 0);
            const shape = maxLayer === 0 ? 'flat' : maxLayer >= 3 ? 'tower' : 'pyramid';
            level.stackProfile = {
                maxLayers: maxLayer + 1,
                shape,
                tileCountHint: level.tiles.length,
            };
        }

        if (level.id >= 2 || level.randomizeTypes) {
            level.tiles = this.randomizeTypesWithinLayers(level);
        }

        return level;
    }

    private static randomizeTypesWithinLayers(level: LevelModel): LevelModel['tiles'] {
        const tiles = level.tiles.map((tile) => ({ ...tile }));
        const byLayer = new Map<number, number[]>();
        tiles.forEach((tile, index) => {
            if (tile.golden || tile.covered || tile.conveyorId) return;
            const layer = tile.layer ?? 0;
            const indexes = byLayer.get(layer) ?? [];
            indexes.push(index);
            byLayer.set(layer, indexes);
        });

        byLayer.forEach((indexes) => {
            if (indexes.length <= 1) return;
            const types = indexes.map((index) => tiles[index].type);
            this.shuffle(types);
            indexes.forEach((tileIndex, typeIndex) => {
                tiles[tileIndex].type = types[typeIndex];
            });
        });
        return tiles;
    }

    private static shuffle<T>(items: T[]): void {
        for (let index = items.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            const item = items[index];
            items[index] = items[swapIndex];
            items[swapIndex] = item;
        }
    }

    private static loadJson<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            resources.load(path, JsonAsset, (error, asset) => {
                if (error || !asset) {
                    reject(new Error(`Config not found: ${path}`));
                    return;
                }
                resolve(asset.json as T);
            });
        });
    }

    private static padLevelId(levelId: LevelId): string {
        return String(levelId).padStart(3, '0');
    }

    private static validateLevel(level: LevelModel): LevelModel {
        if (!level || !Array.isArray(level.tiles)) {
            throw new Error('Invalid level config: missing tiles');
        }
        if (level.tiles.length % GAME_CONFIG.matchCount !== 0) {
            throw new Error(`Invalid level ${level.id}: tile count must be divisible by ${GAME_CONFIG.matchCount}`);
        }
        const ids = new Set<string>();
        level.tiles.forEach((tile) => {
            if (ids.has(tile.id)) throw new Error(`Invalid level ${level.id}: duplicated tile id ${tile.id}`);
            ids.add(tile.id);
        });
        return level;
    }
}
