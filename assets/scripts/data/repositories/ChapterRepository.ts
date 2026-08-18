import { JsonAsset, resources } from 'cc';
import { RESOURCE_PATHS } from '../../core/Constants';
import { ChapterId, LevelId } from '../../core/Types';
import { ChapterModel } from '../models/ChapterModel';

/**
 * 章节配置仓储。
 * - 一次性加载 chapters.json（数组）并缓存。
 * - 支持根据 levelId 反查归属章节，便于关卡升级到 v2 时不必逐个填 chapterId。
 * - 加载失败时回退到内置默认章节（单章节"未分类"），保证 v1 关卡仍可跑。
 */
export class ChapterRepository {
    private static chapters: ChapterModel[] | null = null;

    static async loadAll(): Promise<ChapterModel[]> {
        if (this.chapters) return this.chapters;
        try {
            const raw = await this.loadJson<ChapterModel[]>(RESOURCE_PATHS.chapters);
            this.chapters = [...raw].sort((a, b) => a.order - b.order);
        } catch (_error) {
            // 没有 chapters.json 时回退，保持 v1 兼容
            this.chapters = this.fallbackChapters();
        }
        return this.chapters;
    }

    static async findByLevel(levelId: LevelId): Promise<ChapterModel | null> {
        const list = await this.loadAll();
        return list.find((c) => levelId >= c.levelRange[0] && levelId <= c.levelRange[1]) ?? null;
    }

    static async findById(id: ChapterId): Promise<ChapterModel | null> {
        const list = await this.loadAll();
        return list.find((c) => c.id === id) ?? null;
    }

    static async findNextChapter(currentChapterId: ChapterId): Promise<ChapterModel | null> {
        const list = await this.loadAll();
        const idx = list.findIndex((c) => c.id === currentChapterId);
        if (idx < 0 || idx >= list.length - 1) return null;
        return list[idx + 1];
    }

    /**
     * 给定刚通关的 levelId，判断是否触发章节切换（即该关是本章最后一关，且存在下一章）。
     * 返回 toChapter；不触发返回 null。
     */
    static async detectChapterTransition(justClearedLevelId: LevelId): Promise<{ from: ChapterModel; to: ChapterModel } | null> {
        const from = await this.findByLevel(justClearedLevelId);
        if (!from) return null;
        if (justClearedLevelId !== from.levelRange[1]) return null;
        const to = await this.findNextChapter(from.id);
        if (!to) return null;
        return { from, to };
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

    private static fallbackChapters(): ChapterModel[] {
        return [{
            id: 'default',
            name: '未分类',
            landmarkName: '默认章节',
            description: '尚未配置章节信息。',
            backgroundImage: 'newtheme/bg/chapter1/1',
            levelRange: [1, 9999],
            unlockAfterLevel: null,
            order: 0,
        }];
    }

    /** 测试 / 热重载用 */
    static clearCache(): void {
        this.chapters = null;
    }
}
